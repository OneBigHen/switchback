import { handleRouteRequest } from "./handler"
import { requestGraphHopperRoutes } from "@/lib/routing/graphhopper"

export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  const routerBaseUrl = process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8989"
  return handleRouteRequest(request, (routeRequest) =>
    requestGraphHopperRoutes(routeRequest, { baseUrl: routerBaseUrl })
  )
}
