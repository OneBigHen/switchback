import { revalidatePath } from "next/cache"

import { apiErrorResponse, jsonWithRequestId, readRequestId, withRequestId } from "@/lib/server/api-contract"
import { createRateLimiter } from "@/lib/server/rate-limiter"
import { getCommunityStore, requireMutationIdentity } from "../../context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 60, label: "community route detail request" })

function invalidateCommunityRoute(routeId: string): void {
  // Route handlers have a cache context in production; direct unit calls do not.
  try {
    revalidatePath("/routes")
    revalidatePath(`/routes/${routeId}`)
    revalidatePath("/api/community/routes")
  } catch {
    // A stale public response is safe; the database state is authoritative.
  }
}

function validRouteId(value: string): boolean {
  return /^route-[A-Za-z0-9-]{20,120}$/.test(value)
}

export async function handleCommunityRouteGet(
  request: Request,
  context: { params: Promise<{ routeId: string }> },
  store = getCommunityStore()
): Promise<Response> {
  const requestId = readRequestId(request)
  const routeId = (await context.params).routeId
  if (!validRouteId(routeId)) return apiErrorResponse("INVALID_COMMUNITY_ROUTE", "That community route is not available.", 404, requestId)
  const route = store.getRoute(routeId)
  if (!route) return apiErrorResponse("INVALID_COMMUNITY_ROUTE", "That community route is not available.", 404, requestId)
  return jsonWithRequestId({ route }, requestId, {
    headers: { "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" }
  })
}

export async function handleCommunityRouteDelete(
  request: Request,
  context: { params: Promise<{ routeId: string }> },
  store = getCommunityStore()
): Promise<Response> {
  const requestId = readRequestId(request)
  try {
    const identityId = requireMutationIdentity(request)
    const routeId = (await context.params).routeId
    if (!validRouteId(routeId)) throw new Error("route")
    store.unpublish(identityId, routeId)
    invalidateCommunityRoute(routeId)
    return jsonWithRequestId({ unpublished: true }, requestId, { status: 200 })
  } catch (caught) {
    if (caught instanceof Error && caught.message === "CSRF_REQUIRED") return apiErrorResponse("CSRF_REQUIRED", "A CSRF token is required for browser mutations.", 403, requestId)
    if (caught instanceof Error && caught.message === "AUTH_REQUIRED") return apiErrorResponse("AUTH_REQUIRED", "A verified Switchback ID is required to unpublish a route.", 401, requestId)
    return apiErrorResponse("INVALID_COMMUNITY_ROUTE", "That community route could not be unpublished.", 404, requestId)
  }
}

export async function GET(request: Request, context: { params: Promise<{ routeId: string }> }): Promise<Response> {
  const blocked = requestLimiter.check(request)
  if (blocked) return withRequestId(blocked, readRequestId(request))
  return withRequestId(await handleCommunityRouteGet(request, context), readRequestId(request))
}

export async function DELETE(request: Request, context: { params: Promise<{ routeId: string }> }): Promise<Response> {
  const blocked = requestLimiter.check(request)
  if (blocked) return withRequestId(blocked, readRequestId(request))
  return withRequestId(await handleCommunityRouteDelete(request, context), readRequestId(request))
}
