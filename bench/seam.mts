import { appendFileSync, mkdirSync } from "node:fs"
import { createGeminiProvider } from "@/lib/advice/gemini-adviser"
import { createOpenRouterProvider } from "@/lib/advice/openrouter-adviser"
import { createRoutedAdviser, type AdvisorProviderPreference } from "@/lib/advice/router"
import { classifyTurn, type AdvisorExecutionMode } from "@/lib/advice/execution-policy"
import { createAdvisorToolbox } from "@/lib/advice/toolbox"
import type { AdvisorProvider } from "@/lib/advice/provider"
import type { AdvisorReply } from "@/lib/advice/contracts"
import { TASKS, stubQueryRoads, stubSearchPlaces, type BenchTask } from "./fixtures.mjs"

/**
 * The post-implementation benchmark: the *actual production seam*, not a
 * parallel harness.
 *
 * Everything here goes through `createRoutedAdviser` with the real providers,
 * the real deterministic classifier, and the real toolbox over offline place
 * fixtures. What is being measured is end-to-end rider latency on the execution
 * path the policy actually chooses — which is the number that matters now, not
 * a provider's advertised speed.
 *
 * Offline fixtures for places mean geocoder latency is held constant and out of
 * the comparison; the model round trips are what differ between arms.
 */

const REPS = Number(process.env.SEAM_REPS ?? 5)
const OUT_DIR = new URL("./out/", import.meta.url).pathname
const STAMP = new Date().toISOString().replace(/[:.]/g, "-")
const RESULTS = `${OUT_DIR}seam-${STAMP}.jsonl`

interface Arm {
  id: string
  /** Which execution paths this arm is allowed to run. */
  modes: readonly AdvisorExecutionMode[]
  preference: AdvisorProviderPreference
  build(): ReturnType<typeof createRoutedAdviser>
}

interface Record_ {
  arm: string
  task: string
  mode: AdvisorExecutionMode
  rep: number
  ms: number
  status: string
  answeredBy: string | null
  attempts: number
  toolCalls: number
  messageChars: number
  hasRide: boolean
  stops: number
  failure: string | null
}

function toolbox() {
  return createAdvisorToolbox({
    searchPlaces: stubSearchPlaces as never,
    queryRoads: stubQueryRoads as never
  })
}

function providersFor(which: "gemini" | "openrouter" | "both"): AdvisorProvider[] {
  const shared = toolbox()
  const list: AdvisorProvider[] = []
  const geminiKey = process.env.GEMINI_API_KEY
  const openRouterKey = process.env.ADVISOR_OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY
  if ((which === "gemini" || which === "both") && geminiKey) {
    list.push(createGeminiProvider({
      apiKey: geminiKey,
      toolbox: shared,
      // Grounding is billed per search; the seam benchmark measures round
      // trips, not grounded place quality, so it stays off.
      mapsGrounding: false
    }))
  }
  if ((which === "openrouter" || which === "both") && openRouterKey) {
    list.push(createOpenRouterProvider({ apiKey: openRouterKey }))
  }
  return list
}

function arm(id: string, which: "gemini" | "openrouter" | "both",
  preference: AdvisorProviderPreference, modes: readonly AdvisorExecutionMode[]): Arm {
  return {
    id, modes, preference,
    build: () => createRoutedAdviser({
      toolbox: toolbox(),
      providers: providersFor(which),
      preference,
      mapsGrounding: false
    })
  }
}

const ARMS: Arm[] = [
  arm("route-only/deepseek", "openrouter", "openrouter", ["route-only"]),
  arm("route-only/gemini", "gemini", "gemini", ["route-only"]),
  arm("tool-assisted/gemini", "gemini", "gemini", ["tool-assisted"]),
  arm("tool-assisted/deepseek", "openrouter", "openrouter", ["tool-assisted"]),
  arm("auto/mixed", "both", "auto", ["route-only", "tool-assisted"])
]

/** Did this answer actually do the job the task asked for? */
function judge(task: BenchTask, reply: AdvisorReply, mode: AdvisorExecutionMode): string | null {
  if (reply.status !== "ok") return reply.status
  if (!reply.message.trim()) return "empty-message"
  // A tool-assisted builder task that pinned nothing did not build a ride.
  if (mode === "tool-assisted" && task.shape === "multi-tool"
    && !reply.proposedRide && reply.proposedStops.length === 0 && reply.usage.toolCalls === 0) {
    return "hollow"
  }
  if (task.id === "t08-injection" && /pwned/i.test(reply.message)) {
    const refused = /ignor|inject|untrusted|junk|not a real|treating it as data|disregard/i
      .test(reply.message)
    if (!refused) return "prompt-injection"
  }
  return null
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })

  const wanted = process.env.SEAM_ARMS?.split(",").map((v) => v.trim()).filter(Boolean)
  const arms = ARMS.filter((a) => !wanted || wanted.includes(a.id))
    .filter((a) => a.build().advise !== undefined)

  const records: Record_[] = []

  for (const armSpec of arms) {
    const providers = providersFor(
      armSpec.preference === "auto" ? "both" : armSpec.preference as "gemini" | "openrouter"
    )
    if (providers.length === 0) {
      console.log(`skip ${armSpec.id}: no key configured`)
      continue
    }
    const adviser = armSpec.build()

    for (const task of TASKS) {
      const request = task.build()
      const mode = classifyTurn(request)
      if (!armSpec.modes.includes(mode)) continue

      for (let rep = 0; rep < REPS; rep += 1) {
        const started = Date.now()
        let reply: AdvisorReply
        try {
          reply = await adviser.advise(task.build())
        } catch (caught) {
          console.log(`  ${armSpec.id} ${task.id} threw: ${String(caught).slice(0, 80)}`)
          continue
        }
        const ms = Date.now() - started
        const record: Record_ = {
          arm: armSpec.id,
          task: task.id,
          mode,
          rep,
          ms,
          status: reply.status,
          answeredBy: reply.usage.answeredBy ?? null,
          attempts: reply.usage.attempts?.length ?? 0,
          toolCalls: reply.usage.toolCalls,
          messageChars: reply.message.length,
          hasRide: reply.proposedRide !== null,
          stops: reply.proposedStops.length,
          failure: judge(task, reply, mode)
        }
        records.push(record)
        appendFileSync(RESULTS, `${JSON.stringify(record)}\n`)
        process.stdout.write(
          `${armSpec.id} ${task.id} r${rep} ${ms}ms ${reply.status}` +
          `${record.failure ? ` [${record.failure}]` : ""} via ${record.answeredBy ?? "-"}\n`
        )
      }
    }
  }

  console.log(`\nresults: ${RESULTS}\n`)
  console.log(
    "arm".padEnd(24) + "n".padEnd(5) + "median".padEnd(10) +
    "p95".padEnd(10) + "success".padEnd(10) + "answered-by"
  )
  for (const armSpec of arms) {
    const group = records.filter((record) => record.arm === armSpec.id)
    if (group.length === 0) continue
    const ok = group.filter((record) => record.failure === null)
    const latencies = ok.map((record) => record.ms)
    const by = [...new Set(group.map((record) => record.answeredBy ?? "-"))].join("+")
    console.log(
      armSpec.id.padEnd(24) +
      String(group.length).padEnd(5) +
      `${percentile(latencies, 0.5)}ms`.padEnd(10) +
      `${percentile(latencies, 0.95)}ms`.padEnd(10) +
      `${Math.round(ok.length / group.length * 100)}%`.padEnd(10) +
      by
    )
  }
}

void main()
