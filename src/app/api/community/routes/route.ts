import { apiErrorResponse, jsonWithRequestId, readRequestId } from "@/lib/server/api-contract"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import { parseCommunityRouteDraft } from "@/lib/community/contracts"
import { getCommunityStore, requireMutationIdentity } from "../context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 30, label: "community route request" })

export async function handleCommunityRoutesGet(request: Request, store = getCommunityStore()): Promise<Response> {
  const requestId = readRequestId(request)
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20)
  return jsonWithRequestId({ routes: store.listPublicRoutes(Number.isFinite(limit) ? limit : 20) }, requestId)
}

export async function handleCommunityRoutesPost(request: Request, store = getCommunityStore()): Promise<Response> {
  const requestId = readRequestId(request)
  let identityId: string
  try {
    identityId = requireMutationIdentity(request)
  } catch (caught) {
    if (caught instanceof Error && caught.message === "CSRF_REQUIRED") return apiErrorResponse("CSRF_REQUIRED", "A CSRF token is required for browser mutations.", 403, requestId)
    return apiErrorResponse("AUTH_REQUIRED", "A verified Switchback ID is required to publish a route.", 401, requestId)
  }
  try {
    const body = await readBoundedJsonBody(request, 32 * 1024)
    const draft = parseCommunityRouteDraft(body)
    const created = store.createRoute(identityId, draft)
    return jsonWithRequestId(created, requestId, { status: 201 })
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return apiErrorResponse("REQUEST_TOO_LARGE", "That route publication is too large.", 413, requestId)
    return apiErrorResponse("INVALID_COMMUNITY_ROUTE", "Provide a valid route title, fingerprint, stats, and provenance.", 400, requestId)
  }
}

export const GET = withRateLimit(requestLimiter, handleCommunityRoutesGet)
export const POST = withRateLimit(requestLimiter, handleCommunityRoutesPost)
