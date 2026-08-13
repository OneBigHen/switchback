import { getSystemHealth } from "./service"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import { readRequestId, withRequestId } from "@/lib/server/api-contract"

export const dynamic = "force-dynamic"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 30, label: "health check" })

async function handleHealthGet(request: Request): Promise<Response> {
  const health = await getSystemHealth({
    routerBaseUrl: process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8989",
    valhallaBaseUrl: process.env.VALHALLA_URL
  })
  return withRequestId(
    Response.json(health, { status: health.ok ? 200 : 503 }),
    readRequestId(request)
  )
}

export const GET = withRateLimit(requestLimiter, handleHealthGet)
