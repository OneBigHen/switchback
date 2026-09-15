import { resolveTelemetryConfig } from "@/lib/telemetry/config"

export const dynamic = "force-dynamic"

export function GET(): Response {
  const response = Response.json(resolveTelemetryConfig())
  response.headers.set("cache-control", "no-store, max-age=0")
  return response
}
