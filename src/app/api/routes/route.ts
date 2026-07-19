import { handleRouteRequest } from "./handler"
import { enrichAdventureRoutesWithPaData } from "@/lib/roads/adventure-route-enricher"
import { requestGraphHopperRoutes } from "@/lib/routing/graphhopper"
import { createHybridRouteProvider } from "@/lib/routing/hybrid"
import { requestValhallaRoutes, enrichWithElevations } from "@/lib/routing/valhalla"

export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  const routerBaseUrl = process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8989"
  const valhallaUrl = process.env.VALHALLA_URL
  const elevationUrl = process.env.VALHALLA_ELEVATION_URL

  const provider = createHybridRouteProvider({
    graphHopper: (routeRequest) => requestGraphHopperRoutes(routeRequest, {
      baseUrl: routerBaseUrl
    }),
    ...(valhallaUrl ? {
      valhalla: (routeRequest) => requestValhallaRoutes(routeRequest, {
        baseUrl: valhallaUrl
      })
    } : {}),
    ...(elevationUrl ? {
      enrich: (result) => enrichWithElevations(result, {
        baseUrl: elevationUrl
      })
    } : {})
  })

  return handleRouteRequest(
    request,
    provider,
    enrichAdventureRoutesWithPaData
  )
}
