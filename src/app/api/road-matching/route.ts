import { handleRoadMatchingRequest } from "./handler"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const matchLimiter = createRateLimiter({ windowMs: 60_000, max: 20, label: "road matching" })

async function handleRoadMatchingPost(request: Request): Promise<Response> {
  const graphHopperBaseUrl = process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8989"
  return handleRoadMatchingRequest(request, graphHopperBaseUrl)
}

export const POST = withRateLimit(matchLimiter, handleRoadMatchingPost)
