import { handleRouteWeatherRequest } from "./handler"
import { getRouteWeather } from "@/lib/weather/nws"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DEFAULT_USER_AGENT = "Switchback/0.1 (self-hosted motorcycle route planner)"

// Each request fans out to up to nine NWS calls; the limiter protects the
// server's NWS standing and bandwidth on a public instance.
const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 20, label: "route weather request" })

async function handleRouteWeatherPost(request: Request): Promise<Response> {
  return handleRouteWeatherRequest(request, (points) => getRouteWeather(points, {
    userAgent: process.env.NWS_USER_AGENT ?? DEFAULT_USER_AGENT
  }))
}

export const POST = withRateLimit(requestLimiter, handleRouteWeatherPost)
