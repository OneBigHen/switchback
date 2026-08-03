import { handleRouteRequest } from "./handler"
import { enrichAdventureRoutesWithPaData } from "@/lib/roads/adventure-route-enricher"
import { requestGraphHopperRoutes } from "@/lib/routing/graphhopper"
import { createHybridRouteProvider } from "@/lib/routing/hybrid"
import { requestValhallaRoutes, enrichWithElevations } from "@/lib/routing/valhalla"
import { createRouteJobLimiter } from "@/lib/server/route-job-limiter"
import { createRouteCache } from "@/lib/server/route-cache"

export const dynamic = "force-dynamic"

// Shared across requests: two provider tokens with primary priority, plus a
// bounded 10-minute primary-result cache. Health probes bypass both.
const providerLimiter = createRouteJobLimiter(2)
const routeCache = createRouteCache()

export async function POST(request: Request): Promise<Response> {
  const routerBaseUrl = process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8989"
  const valhallaUrl = process.env.VALHALLA_URL
  const elevationUrl = process.env.VALHALLA_ELEVATION_URL

  const provider = createHybridRouteProvider({
    graphHopper: (routeRequest, providerOptions) => providerLimiter.run(
      () => requestGraphHopperRoutes(routeRequest, {
        baseUrl: routerBaseUrl,
        ...(providerOptions?.signal ? { signal: providerOptions.signal } : {})
      }),
      {
        priority: routeRequest.candidateSet === "alternatives" ? "alternatives" : "primary",
        signal: providerOptions?.signal
      }
    ),
    ...(valhallaUrl ? {
      valhalla: (routeRequest, providerOptions) => providerLimiter.run(
        () => requestValhallaRoutes(routeRequest, {
          baseUrl: valhallaUrl,
          ...(providerOptions?.signal ? { signal: providerOptions.signal } : {})
        }),
        {
          priority: routeRequest.candidateSet === "alternatives" ? "alternatives" : "primary",
          signal: providerOptions?.signal
        }
      )
    } : {}),
    ...(elevationUrl ? {
      enrich: (result) => enrichWithElevations(result, {
        baseUrl: elevationUrl,
        signal: request.signal
      })
    } : {})
  })

  return handleRouteRequest(
    request,
    provider,
    enrichAdventureRoutesWithPaData,
    { cache: routeCache }
  )
}
