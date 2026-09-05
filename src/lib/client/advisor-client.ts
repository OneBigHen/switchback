import type {
  AdvisorMessage,
  AdvisorReply,
  AdvisorRouteContext
} from "@/lib/advice/contracts"
import { emptyReply } from "@/lib/advice/contracts"
import type { AdvisorCapability } from "@/lib/advice/capability"
import { MAX_ADVISOR_BODY_BYTES } from "@/lib/advice/request-limits"

/**
 * Client side of the advisor turn endpoint.
 *
 * The transcript lives in the browser and is posted back each turn. Transport
 * failures are deliberately flattened into advisor statuses so this optional
 * surface cannot break planning, but useful distinctions such as a 429 are
 * preserved for honest UI and retry behavior.
 */

export interface AdvisorTurnResponse extends AdvisorReply {
  capability: AdvisorCapability
}

const ABSENT_CAPABILITY: AdvisorCapability = {
  enabled: false,
  sources: [],
  attributions: []
}

export async function fetchAdvisorCapability(
  signal?: AbortSignal
): Promise<AdvisorCapability> {
  try {
    const response = await fetch("/api/advisor", { ...(signal ? { signal } : {}) })
    if (!response.ok) return ABSENT_CAPABILITY
    const payload = await response.json() as { capability?: AdvisorCapability }
    return payload.capability ?? ABSENT_CAPABILITY
  } catch {
    return ABSENT_CAPABILITY
  }
}

/**
 * The turn endpoint bounds the transcript it will accept. Trimming here rather
 * than letting the request 400 is what keeps a long conversation working: the
 * advisor is stateless, so the oldest turns are the ones safe to drop.
 */
export const MAX_POSTED_CONVERSATION = 12

export interface AdvisorTurnInput {
  /** Null while the rider is building a ride and the advisor is helping. */
  context: AdvisorRouteContext | null
  conversation: AdvisorMessage[]
  riderMessage?: string
  /** Explicit planner start, so place search works before a route exists. */
  origin?: { lat: number; lon: number; label?: string }
}

function advisorRequestBody(input: AdvisorTurnInput): string | null {
  const conversation = input.conversation.slice(-MAX_POSTED_CONVERSATION)

  for (let firstMessage = 0; firstMessage <= conversation.length; firstMessage += 1) {
    const body = JSON.stringify({
      ...input,
      conversation: conversation.slice(firstMessage)
    })
    if (new TextEncoder().encode(body).byteLength <= MAX_ADVISOR_BODY_BYTES) return body
  }

  return null
}

export async function requestAdvisorTurn(
  input: AdvisorTurnInput,
  signal?: AbortSignal
): Promise<AdvisorTurnResponse> {
  try {
    const body = advisorRequestBody(input)
    if (body === null) {
      return { ...emptyReply("invalid-request"), capability: ABSENT_CAPABILITY }
    }

    const response = await fetch("/api/advisor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      ...(signal ? { signal } : {})
    })
    if (response.status === 429) {
      return { ...emptyReply("rate-limited"), capability: ABSENT_CAPABILITY }
    }
    if (response.status === 400 || response.status === 413) {
      return { ...emptyReply("invalid-request"), capability: ABSENT_CAPABILITY }
    }
    if (!response.ok) {
      return { ...emptyReply("unavailable"), capability: ABSENT_CAPABILITY }
    }
    return await response.json() as AdvisorTurnResponse
  } catch {
    return { ...emptyReply("unavailable"), capability: ABSENT_CAPABILITY }
  }
}
