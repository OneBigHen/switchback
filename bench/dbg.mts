import { createGeminiAdviser } from "@/lib/advice/gemini-adviser"
import { createAdvisorToolbox } from "@/lib/advice/toolbox"
import { TASKS, stubQueryRoads, stubSearchPlaces } from "./fixtures.mjs"

const toolbox = createAdvisorToolbox({ searchPlaces: stubSearchPlaces, queryRoads: stubQueryRoads })
let n = 0
const fetcher = (async (url: string, init: RequestInit) => {
  n += 1
  const body = JSON.parse(String(init.body))
  let r = await fetch(url, { ...init, signal: AbortSignal.timeout(180000) })
  for (let i = 0; i < 6 && (r.status === 503 || r.status === 429); i += 1) {
    await new Promise((res) => setTimeout(res, 2000 + i * 1500))
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(180000) })
  }
  const j = await r.clone().json()
  const parts = j.candidates?.[0]?.content?.parts ?? []
  console.log(`\n### call ${n} status ${r.status} finish=${j.candidates?.[0]?.finishReason} hasSchema=${!!body.generationConfig?.responseJsonSchema}`)
  for (const p of parts) {
    if (p.functionCall) console.log("  fnCall:", p.functionCall.name, JSON.stringify(p.functionCall.args))
    if (p.text) console.log("  text:", JSON.stringify(p.text).slice(0, 600))
  }
  if (parts.length === 0) console.log("  RAW:", JSON.stringify(j).slice(0, 600))
  return r
}) as unknown as typeof fetch

const adviser = createGeminiAdviser({
  apiKey: process.env.GEMINI_API_KEY!, model: process.env.MODEL ?? "gemini-3.1-flash-lite", mapsGrounding: false, fetcher, toolbox
})
const task = TASKS.find((t) => t.id === (process.env.TASK ?? "t01-simple"))!
const reply = await adviser.advise(task.build())
console.log("\nFINAL:", reply.status, JSON.stringify(reply.message).slice(0, 300))
