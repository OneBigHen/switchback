import { apiErrorResponse, jsonWithRequestId, readRequestId } from "@/lib/server/api-contract"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import { getCommunityStore, requireMutationIdentity, requireOperatorIdentity } from "../context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 10, label: "community report request" })

export async function handleCommunityReportsGet(request: Request, store = getCommunityStore()): Promise<Response> {
  const requestId = readRequestId(request)
  try {
    requireOperatorIdentity(request)
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50)
    return jsonWithRequestId({ reports: store.listReports(Number.isFinite(limit) ? limit : 50) }, requestId, {
      headers: { "cache-control": "no-store" }
    })
  } catch (caught) {
    if (caught instanceof Error && caught.message === "OPERATOR_REQUIRED") return apiErrorResponse("OPERATOR_REQUIRED", "Operator access is required for community reports.", 403, requestId)
    return apiErrorResponse("AUTH_REQUIRED", "A verified Switchback ID is required for community reports.", 401, requestId)
  }
}

export async function handleCommunityReportPost(request: Request, store = getCommunityStore()): Promise<Response> {
  const requestId = readRequestId(request)
  let identityId: string
  try {
    identityId = requireMutationIdentity(request)
  } catch (caught) {
    if (caught instanceof Error && caught.message === "CSRF_REQUIRED") return apiErrorResponse("CSRF_REQUIRED", "A CSRF token is required for browser mutations.", 403, requestId)
    return apiErrorResponse("AUTH_REQUIRED", "A verified Switchback ID is required to report content.", 401, requestId)
  }
  try {
    const body = await readBoundedJsonBody(request, 8 * 1024)
    if (typeof body !== "object" || body === null) throw new Error("invalid body")
    const value = body as Record<string, unknown>
    if (typeof value.objectType !== "string" || typeof value.objectId !== "string" || typeof value.reason !== "string") throw new Error("invalid report")
    const id = store.report(identityId, value.objectType, value.objectId, value.reason)
    return jsonWithRequestId({ id }, requestId, { status: 201 })
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return apiErrorResponse("REQUEST_TOO_LARGE", "That report is too large.", 413, requestId)
    return apiErrorResponse("INVALID_COMMUNITY_REPORT", "Provide a report target and reason.", 400, requestId)
  }
}

export const POST = withRateLimit(requestLimiter, handleCommunityReportPost)
export const GET = withRateLimit(requestLimiter, handleCommunityReportsGet)
