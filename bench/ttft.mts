import { advisorSystemPrompt } from "@/lib/advice/route-context"
import { FINAL_ANSWER_SCHEMA } from "@/lib/advice/resolve-answer"
import { TASKS } from "./fixtures.mjs"

/**
 * What would streaming actually buy the rider?
 *
 * The advisor's structured output is not safe to act on until it has passed the
 * resolvers, so streaming can never make a proposed stop tappable sooner. The
 * only thing it can move is the moment the *prose* starts appearing. This
 * measures that gap directly: time to first content byte versus time to the
 * complete answer, on the same task, for both providers.
 *
 * Numbers, not intuition, decide whether a streaming transport is worth the
 * complication of holding actions back until validation.
 */

const REPS = Number(process.env.TTFT_REPS ?? 3)
const task = TASKS.find((candidate) => candidate.id === (process.env.TASK ?? "t01-simple"))!

interface Sample {
  label: string
  status: number
  ttfbMs: number
  /** First token of any kind, including a reasoning token the rider never sees. */
  ttfAnyMs: number | null
  ttfContentMs: number | null
  totalMs: number
  chars: number
}

/** Read an SSE body, timing the first chunk that carries visible content. */
async function drain(
  response: Response,
  started: number,
  pick: (chunk: string) => { content: string | null; any: boolean }
): Promise<{ ttfContentMs: number | null; ttfAnyMs: number | null; chars: number }> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let ttfContentMs: number | null = null
  let ttfAnyMs: number | null = null
  let chars = 0
  let buffer = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data:")) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === "[DONE]") continue
      let picked: { content: string | null; any: boolean } = { content: null, any: false }
      try {
        picked = pick(payload)
      } catch {
        picked = { content: null, any: false }
      }
      if (picked.any) ttfAnyMs ??= Date.now() - started
      if (!picked.content) continue
      chars += picked.content.length
      ttfContentMs ??= Date.now() - started
    }
  }
  return { ttfContentMs, ttfAnyMs, chars }
}

async function openRouterSample(stream: boolean): Promise<Sample> {
  const input = task.build()
  const body = {
    model: process.env.MODEL ?? "~deepseek/deepseek-v4-flash-latest",
    messages: [
      { role: "system", content: advisorSystemPrompt(input) },
      { role: "user", content: input.riderMessage ?? "Give me your read on this route." }
    ],
    temperature: 0.35,
    stream,
    provider: { require_parameters: true },
    response_format: {
      type: "json_schema",
      json_schema: { name: "switchback_advisor_answer", strict: false, schema: FINAL_ANSWER_SCHEMA }
    }
  }
  const started = Date.now()
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000)
  })
  const ttfbMs = Date.now() - started
  if (!stream) {
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const text = payload.choices?.[0]?.message?.content ?? ""
    return { label: "openrouter/blocking", status: response.status, ttfbMs, ttfAnyMs: null, ttfContentMs: null, totalMs: Date.now() - started, chars: text.length }
  }
  const { ttfContentMs, ttfAnyMs, chars } = await drain(response, started, (payload) => {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string; reasoning?: string } }>
    }
    const delta = parsed.choices?.[0]?.delta
    return { content: delta?.content ?? null, any: Boolean(delta?.content || delta?.reasoning) }
  })
  return { label: "openrouter/stream", status: response.status, ttfbMs, ttfAnyMs, ttfContentMs, totalMs: Date.now() - started, chars }
}

async function geminiSample(stream: boolean): Promise<Sample> {
  const input = task.build()
  const model = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite"
  const method = stream ? "streamGenerateContent?alt=sse&" : "generateContent?"
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}key=${process.env.GEMINI_API_KEY!}`
  const body = {
    systemInstruction: { parts: [{ text: advisorSystemPrompt(input) }] },
    contents: [{ role: "user", parts: [{ text: input.riderMessage ?? "Give me your read on this route." }] }],
    generationConfig: {
      temperature: 0.35,
      responseMimeType: "application/json",
      responseJsonSchema: FINAL_ANSWER_SCHEMA
    }
  }
  const started = Date.now()
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000)
  })
  const ttfbMs = Date.now() - started
  if (!stream) {
    const payload = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? ""
    return { label: "gemini/blocking", status: response.status, ttfbMs, ttfAnyMs: null, ttfContentMs: null, totalMs: Date.now() - started, chars: text.length }
  }
  const { ttfContentMs, ttfAnyMs, chars } = await drain(response, started, (payload) => {
    const parsed = JSON.parse(payload) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") || null
    return { content: text, any: Boolean(text) }
  })
  return { label: "gemini/stream", status: response.status, ttfbMs, ttfAnyMs, ttfContentMs, totalMs: Date.now() - started, chars }
}

function median(values: number[]): number {
  if (values.length === 0) return NaN
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!
}

async function main() {
  const samples: Sample[] = []
  const plans: Array<() => Promise<Sample>> = []
  if (process.env.OPENROUTER_API_KEY) {
    for (let i = 0; i < REPS; i += 1) plans.push(() => openRouterSample(false), () => openRouterSample(true))
  }
  if (process.env.GEMINI_API_KEY) {
    for (let i = 0; i < REPS; i += 1) plans.push(() => geminiSample(false), () => geminiSample(true))
  }
  for (const plan of plans) {
    try {
      samples.push(await plan())
    } catch (caught) {
      console.log("sample failed:", String(caught).slice(0, 120))
    }
    await new Promise((resolve) => setTimeout(resolve, 4_500))
  }

  console.log(`task=${task.id} reps=${REPS}`)
  console.log("label".padEnd(22) + "n".padEnd(4) + "http".padEnd(6) + "ttfb".padEnd(10) +
    "first token".padEnd(14) + "first content".padEnd(16) + "total".padEnd(10) + "chars")
  for (const label of [...new Set(samples.map((sample) => sample.label))]) {
    const group = samples.filter((sample) => sample.label === label)
    const firsts = group.map((sample) => sample.ttfContentMs).filter((value): value is number => value !== null)
    const anys = group.map((sample) => sample.ttfAnyMs).filter((value): value is number => value !== null)
    console.log(
      label.padEnd(22) +
      String(group.length).padEnd(4) +
      String(median(group.map((sample) => sample.status))).padEnd(6) +
      `${median(group.map((sample) => sample.ttfbMs))}ms`.padEnd(10) +
      (anys.length ? `${median(anys)}ms` : "n/a").padEnd(14) +
      (firsts.length ? `${median(firsts)}ms` : "n/a").padEnd(16) +
      `${median(group.map((sample) => sample.totalMs))}ms`.padEnd(10) +
      String(Math.round(group.reduce((sum, sample) => sum + sample.chars, 0) / group.length))
    )
  }
}

void main()
