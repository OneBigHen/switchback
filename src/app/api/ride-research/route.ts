import { researchRideIdea } from "@/lib/ai/ride-research"
import { string, object_, safeParse } from "@/lib/validate"

export const dynamic = "force-dynamic"

const payloadSchema = object_({ prompt: string({ trim: true, min: 3, max: 1_000 }) })

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
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
