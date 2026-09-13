import { handleRouteTrafficRequest } from "./handler"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import { getTomTomRouteTraffic } from "@/lib/traffic/tomtom"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Each request may fan out to several bounded TomTom corridor calls. Keep this
// deliberately lower than ordinary local-router endpoints to protect provider
// quota on small hosted deployments.
const requestLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 12,
  label: "route traffic request"
})

async function handleRouteTrafficPost(request: Request): Promise<Response> {
  return handleRouteTrafficRequest(request, (points) => getTomTomRouteTraffic(points, {
    apiKey: process.env.TOMTOM_API_KEY
  }))
}

export const POST = withRateLimit(requestLimiter, handleRouteTrafficPost)
