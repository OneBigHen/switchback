import { apiErrorResponse, readRequestId, withRequestId } from "@/lib/server/api-contract"
import { createRateLimiter } from "@/lib/server/rate-limiter"
import { communityPreviewToGpx } from "@/lib/community/preview-gpx"
import { getCommunityStore } from "../../../context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 30, label: "community GPX request" })

export async function handleCommunityRouteGpxGet(
  request: Request,
  context: { params: Promise<{ routeId: string }> },
  store = getCommunityStore()
): Promise<Response> {
  const requestId = readRequestId(request)
  const routeId = (await context.params).routeId
  if (!/^route-[A-Za-z0-9-]{20,120}$/.test(routeId)) return apiErrorResponse("INVALID_COMMUNITY_ROUTE", "That community route is not available.", 404, requestId)
  const route = store.getRoute(routeId)
  if (!route) return apiErrorResponse("INVALID_COMMUNITY_ROUTE", "That community route is not available.", 404, requestId)
  const filename = `${route.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "switchback-route"}.gpx`
  const response = new Response(communityPreviewToGpx(route), {
    headers: {
      "content-type": "application/gpx+xml; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      "x-request-id": requestId
    }
  })
  return response
}

export async function GET(request: Request, context: { params: Promise<{ routeId: string }> }): Promise<Response> {
  const blocked = requestLimiter.check(request)
  if (blocked) return withRequestId(blocked, readRequestId(request))
  return withRequestId(await handleCommunityRouteGpxGet(request, context), readRequestId(request))
}
