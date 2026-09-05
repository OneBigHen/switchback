import { createAdvisorToolbox } from "@/lib/advice/toolbox"
import { createOpenRouterAdviser } from "./openrouter-adviser.mjs"
import { TASKS, stubQueryRoads, stubSearchPlaces } from "./fixtures.mjs"

/** Single-turn trace of the OpenRouter arm: every round trip, verbatim. */
const toolbox = createAdvisorToolbox({ searchPlaces: stubSearchPlaces, queryRoads: stubQueryRoads })
let n = 0
const fetcher = (async (url: string, init: RequestInit) => {
  n += 1
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000) })
  const payload = await response.clone().json() as {
    choices?: Array<{
      finish_reason?: string
      message?: {
        content?: string | null
        reasoning?: string
        tool_calls?: Array<{ function: { name: string; arguments: string } }>
      }
    }>
    provider?: string
    model?: string
    error?: unknown
  }
  const message = payload.choices?.[0]?.message
  console.log(`\n### call ${n} status ${response.status} finish=${payload.choices?.[0]?.finish_reason} provider=${payload.provider} model=${payload.model}`)
  if (payload.error) console.log("  ERROR:", JSON.stringify(payload.error))
  for (const call of message?.tool_calls ?? []) console.log("  fnCall:", call.function.name, call.function.arguments)
  if (message?.reasoning) console.log("  reasoning:", JSON.stringify(message.reasoning).slice(0, 300))
  console.log("  content:", JSON.stringify(message?.content).slice(0, 1_200))
  return response
}) as unknown as typeof fetch

async function main() {
  const adviser = createOpenRouterAdviser({
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: process.env.MODEL ?? "~deepseek/deepseek-v4-flash-latest",
    toolbox,
    fetcher,
    provider: { require_parameters: true }
  })
  const task = TASKS.find((candidate) => candidate.id === (process.env.TASK ?? "t01-simple"))!
  const reply = await adviser.advise(task.build())
  console.log("\nFINAL:", reply.status, JSON.stringify(reply.message).slice(0, 400))
}
void main()
