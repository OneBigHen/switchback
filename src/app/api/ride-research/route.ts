import { researchRideIdea } from "@/lib/ai/ride-research"
import { string, object_, safeParse } from "@/lib/validate"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"

export const dynamic = "force-dynamic"

const payloadSchema = object_({ prompt: string({ trim: true, min: 3, max: 1_000 }) })

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 6, label: "research request" })

export async function handleRideResearchPost(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await readBoundedJsonBody(request, 8 * 1024)
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) {
      return Response.json({ error: { code: "RESEARCH_REQUEST_TOO_LARGE", message: "That research request is too large." } }, { status: 413 })
    }
    return Response.json({ error: { code: "INVALID_RESEARCH_REQUEST", message: "Describe the ride idea you want to research." } }, { status: 400 })
  }
  const parsed = safeParse(payloadSchema, body)
  if (!parsed.success) {
    return Response.json({ error: { code: "INVALID_RESEARCH_REQUEST", message: "Describe the ride idea you want to research." } }, { status: 400 })
  }
  try {
    const sources = await researchRideIdea(parsed.data.prompt, { apiKey: process.env.YOU_API_KEY })
    if (sources.length === 0) {
      return Response.json({ error: { code: "RESEARCH_UNAVAILABLE", message: "Web ride research is not configured or returned no usable sources." } }, { status: 503 })
    }
    return Response.json({ sources })
  } catch {
    return Response.json({ error: { code: "RESEARCH_UNAVAILABLE", message: "Web ride research is temporarily unavailable." } }, { status: 503 })
  }
}

export const POST = withRateLimit(requestLimiter, handleRideResearchPost)
