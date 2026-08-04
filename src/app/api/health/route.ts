import { getSystemHealth } from "./service"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"

export const dynamic = "force-dynamic"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 30, label: "health check" })

async function handleHealthGet(): Promise<Response> {
  const health = await getSystemHealth({
    routerBaseUrl: process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8989",
    valhallaBaseUrl: process.env.VALHALLA_URL
  })
  return Response.json(health, { status: health.ok ? 200 : 503 })
}

export const GET = withRateLimit(requestLimiter, handleHealthGet)
