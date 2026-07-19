import { handleRouteWeatherRequest } from "./handler"
import { getRouteWeather } from "@/lib/weather/nws"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DEFAULT_USER_AGENT = "Switchback/0.1 (self-hosted motorcycle route planner)"

export async function POST(request: Request): Promise<Response> {
  return handleRouteWeatherRequest(request, (points) => getRouteWeather(points, {
    userAgent: process.env.NWS_USER_AGENT ?? DEFAULT_USER_AGENT
  }))
}
