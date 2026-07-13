import { getSystemHealth } from "./service"

export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  const health = await getSystemHealth({
    routerBaseUrl: process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8989"
  })
  return Response.json(health, { status: health.ok ? 200 : 503 })
}
