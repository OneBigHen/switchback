import { revalidatePath } from "next/cache"

import { apiErrorResponse, jsonWithRequestId, readRequestId, withRequestId } from "@/lib/server/api-contract"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"
import { createRateLimiter } from "@/lib/server/rate-limiter"
import { getCommunityStore, requireOperatorMutationIdentity } from "../../context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 20, label: "community moderation request" })

function invalidateRoute(routeId: string): void {
  try {
    revalidatePath("/routes")
    revalidatePath(`/routes/${routeId}`)
    revalidatePath("/api/community/routes")
    revalidatePath(`/api/community/routes/${routeId}`)
  } catch {
    // The database update remains authoritative when no Next cache context exists.
  }
}

export async function handleCommunityReportPatch(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
  store = getCommunityStore()
): Promise<Response> {
  const requestId = readRequestId(request)
  try {
    requireOperatorMutationIdentity(request)
    const reportId = (await context.params).reportId
    if (!/^report-[A-Za-z0-9-]{20,120}$/.test(reportId)) throw new Error("report")
    const body = await readBoundedJsonBody(request, 8 * 1024)
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("body")
    const value = body as Record<string, unknown>
    if (value.status !== "open" && value.status !== "reviewed" && value.status !== "dismissed") throw new Error("status")
    const routeAction = value.routeAction === undefined ? "none" : value.routeAction
    if (routeAction !== "none" && routeAction !== "hide" && routeAction !== "restore") throw new Error("routeAction")
    const report = store.listReports(100).find((candidate) => candidate.id === reportId)
    if (!report) throw new Error("report")
    store.updateReportStatus(reportId, value.status)
    if (routeAction !== "none" && report.objectType === "route") {
      store.setRouteActive(report.objectId, routeAction === "restore")
      invalidateRoute(report.objectId)
    }
    return jsonWithRequestId({ updated: true }, requestId)
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return apiErrorResponse("REQUEST_TOO_LARGE", "That moderation action is too large.", 413, requestId)
    if (caught instanceof Error && caught.message === "CSRF_REQUIRED") return apiErrorResponse("CSRF_REQUIRED", "A CSRF token is required for browser mutations.", 403, requestId)
    if (caught instanceof Error && caught.message === "AUTH_REQUIRED") return apiErrorResponse("AUTH_REQUIRED", "A verified Switchback ID is required for moderation.", 401, requestId)
    if (caught instanceof Error && caught.message === "OPERATOR_REQUIRED") return apiErrorResponse("OPERATOR_REQUIRED", "Operator access is required for moderation.", 403, requestId)
    return apiErrorResponse("INVALID_COMMUNITY_REPORT", "That moderation action is invalid.", 400, requestId)
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ reportId: string }> }): Promise<Response> {
  const blocked = requestLimiter.check(request)
  if (blocked) return withRequestId(blocked, readRequestId(request))
  return withRequestId(await handleCommunityReportPatch(request, context), readRequestId(request))
}
