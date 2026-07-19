import { string, object_, safeParse } from "@/lib/validate"
import type { RideIntent } from "@/lib/ai/ride-intent"

export type RideIntentInterpreter = (prompt: string) => Promise<RideIntent>

const MAX_INTENT_REQUEST_BYTES = 4 * 1024
const payloadSchema = object_({
  prompt: string({ trim: true, min: 3, max: 1_000 })
})

async function readBoundedJson(request: Request): Promise<unknown | "too-large" | "invalid"> {
  const declaredLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INTENT_REQUEST_BYTES) {
    return "too-large"
  }
  if (!request.body) return "invalid"

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let body = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytesRead += value.byteLength
      if (bytesRead > MAX_INTENT_REQUEST_BYTES) {
        await reader.cancel()
        return "too-large"
      }
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
    return JSON.parse(body) as unknown
  } catch {
    return "invalid"
  }
}

export async function handleRideIntentRequest(
  request: Request,
  interpreter: RideIntentInterpreter
): Promise<Response> {
  const body = await readBoundedJson(request)
  if (body === "too-large") {
    return Response.json({
      error: { code: "RIDE_INTENT_TOO_LARGE", message: "Keep the ride description under 1,000 characters." }
    }, { status: 413 })
  }
  const parsed = safeParse(payloadSchema, body)
  if (!parsed.success) {
    return Response.json({
      error: { code: "INVALID_RIDE_INTENT", message: "Describe the ride you want in a few words." }
    }, { status: 400 })
  }

  try {
    return Response.json(await interpreter(parsed.data.prompt))
  } catch {
    return Response.json({
      error: { code: "RIDE_INTENT_UNAVAILABLE", message: "Ride interpretation is temporarily unavailable." }
    }, { status: 503 })
  }
}
