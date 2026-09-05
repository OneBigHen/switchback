import type {
  AdviceRequest,
  AdvisorReply,
  AdvisorToolbox,
  RouteAdviser
} from "./contracts"
import { advisorSystemPrompt } from "./route-context"
import {
  classifyTurn,
  mapsAllowedForMode,
  toolsForMode,
  type AdvisorExecutionMode
} from "./execution-policy"
import { isRetryableFailure, type AdvisorProvider } from "./provider"

/**
 * Which provider runs which kind of turn, and what happens when one is down.
 *
 * The bake-off measured both providers on both shapes of turn, and neither won
 * outright — they won different halves:
 *
 * - **route-only** favours DeepSeek. Its single-request path is genuinely fast,
 *   and its blind prose quality was the best in the bake-off (4.65 vs 4.17).
 *   The behaviour that made it dangerous on tool-needing turns — answering
 *   without looking anything up — is not a failure mode when there is nothing
 *   to look up.
 * - **tool-assisted** favours Gemini, which had the lower measured median once
 *   both ran the same two-phase tool loop (8s vs 17s).
 *
 * So `auto` is a real routing decision rather than an alias for a favourite.
 */

/**
 * The whole turn's wall-clock ceiling, shared by every attempt. Matches the
 * per-provider ceiling so a single-provider deployment behaves exactly as it
 * did before this budgeting existed.
 */
const TURN_BUDGET_MS = 30_000
/** What the first of several attempts may spend before the fallback is starved. */
const FIRST_ATTEMPT_SHARE = 0.6
/** Floor for a non-final attempt: never hand one a slice too short to plausibly finish in. */
const MIN_ATTEMPT_MS = 6_000

export type AdvisorProviderPreference = "auto" | "gemini" | "openrouter"

export interface RoutedAdviserOptions {
  toolbox: AdvisorToolbox
  providers: readonly AdvisorProvider[]
  preference: AdvisorProviderPreference
  mapsGrounding: boolean
  /** Internal debug/telemetry hook. Never rendered to a rider. */
  onTurn?(record: AdvisorTurnRecord): void
}

export interface AdvisorTurnRecord {
  mode: AdvisorExecutionMode
  /** Providers tried, in order, with the status each returned. */
  attempts: Array<{ providerId: string; modelId: string; status: string; ms: number }>
  /** The provider whose answer the rider actually got, if any succeeded. */
  answeredBy: string | null
}

/** Preferred provider order for one execution mode, best first. */
function preferredOrder(mode: AdvisorExecutionMode): readonly string[] {
  // route-only: DeepSeek's one-shot path first, Gemini as the fallback.
  // tool-assisted / maps-specialist: Gemini first — it has the lower measured
  // median through a tool loop, and Maps grounding is Gemini-native.
  return mode === "route-only" ? ["openrouter", "gemini"] : ["gemini", "openrouter"]
}

function orderProviders(
  providers: readonly AdvisorProvider[],
  preference: AdvisorProviderPreference,
  mode: AdvisorExecutionMode
): AdvisorProvider[] {
  if (preference !== "auto") {
    const pinned = providers.find((provider) => provider.id === preference)
    // An explicitly pinned provider means "use this one". Failing over to the
    // other would silently ignore a deployment's deliberate choice, so a pin
    // gets no fallback: if it is configured and down, the turn degrades.
    return pinned ? [pinned] : [...providers]
  }
  const order = preferredOrder(mode)
  return [...providers].sort((left, right) => {
    const leftRank = order.indexOf(left.id)
    const rightRank = order.indexOf(right.id)
    return (leftRank < 0 ? order.length : leftRank) - (rightRank < 0 ? order.length : rightRank)
  })
}

/**
 * The deterministic advisor core: classify the turn, pick the transport, and
 * fail over only when a provider failed *operationally*.
 *
 * The distinction matters. A timeout, a 429, a 5xx or a dropped connection says
 * nothing about the question, so asking someone else is reasonable. A
 * `malformed` status means a model answered and the resolvers rejected it —
 * retrying that elsewhere until something passes would be shopping for a
 * verdict, and it would turn the resolvers from a boundary into an obstacle.
 * Same for a rider whose intent simply cannot be satisfied.
 */
export function createRoutedAdviser(options: RoutedAdviserOptions): RouteAdviser {
  return {
    async advise(input: AdviceRequest, signal?: AbortSignal): Promise<AdvisorReply> {
      const mode = classifyTurn(input)
      const providers = orderProviders(options.providers, options.preference, mode)
      const attempts: AdvisorTurnRecord["attempts"] = []

      const providerInput = {
        request: input,
        mode,
        tools: toolsForMode(mode, options.toolbox, input),
        toolbox: options.toolbox,
        systemPrompt: advisorSystemPrompt(input, mode),
        mapsGrounding: mapsAllowedForMode(mode, options.mapsGrounding)
      }

      // Budget the turn across attempts instead of letting the first provider
      // spend all of it.
      //
      // Measured on route-only: p50 6.1s but p90 22.4s, because upstream stalls
      // happen. Waiting 30s on a stalled first attempt and then having no time
      // left to ask anyone else is the worst outcome for a rider — it is a long
      // wait that ends in nothing. Giving the first attempt a share and keeping
      // the remainder for the fallback turns that into a slower answer instead
      // of no answer. With a single provider there is nobody to save time for,
      // so it keeps the whole budget.
      const deadline = Date.now() + TURN_BUDGET_MS
      let last: AdvisorReply | null = null
      for (const [index, provider] of providers.entries()) {
        const remaining = deadline - Date.now()
        if (remaining <= 0) break
        const isLast = index === providers.length - 1
        const budget = isLast ? remaining : Math.max(MIN_ATTEMPT_MS, Math.round(remaining * FIRST_ATTEMPT_SHARE))
        // The provider merges whatever signal it is given with its own ceiling,
        // and reports an abort as `timeout` — which is retryable, so a starved
        // attempt falls over to the next provider exactly like a real stall.
        const attemptSignal = signal
          ? AbortSignal.any([signal, AbortSignal.timeout(budget)])
          : AbortSignal.timeout(budget)

        const started = Date.now()
        const result = await provider.runTurn(providerInput, attemptSignal)
        attempts.push({
          providerId: provider.id,
          modelId: result.modelId,
          status: result.reply.status,
          ms: Date.now() - started
        })
        last = result.reply
        if (!isRetryableFailure(result.reply.status)) {
          options.onTurn?.({ mode, attempts, answeredBy: provider.id })
          return withRouting(result.reply, mode, attempts, provider.id)
        }
        // The rider's own deadline is not a reason to try someone else; it
        // means there is no time left to try anyone.
        if (signal?.aborted) break
      }

      options.onTurn?.({ mode, attempts, answeredBy: null })
      if (last) return withRouting(last, mode, attempts, null)
      return {
        status: "unavailable",
        message: "",
        secondOpinion: null,
        proposedStops: [],
        proposedRide: null,
        citations: [],
        usage: { toolCalls: 0, groundedQueries: 0 }
      }
    }
  }
}

export { classifyTurn }
export type { AdvisorExecutionMode }

/**
 * Attach the routing record to the reply's usage block.
 *
 * This is internal debug metadata, not rider-facing content: the client never
 * renders `usage`, and knowing which provider answered is what makes a failover
 * diagnosable after the fact rather than invisible.
 */
function withRouting(
  reply: AdvisorReply,
  mode: AdvisorExecutionMode,
  attempts: AdvisorTurnRecord["attempts"],
  answeredBy: string | null
): AdvisorReply {
  return { ...reply, usage: { ...reply.usage, mode, answeredBy, attempts } }
}
