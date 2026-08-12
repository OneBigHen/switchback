import { apiErrorResponse, jsonWithRequestId, readRequestId, withRequestId } from "@/lib/server/api-contract"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"
import { createRateLimiter } from "@/lib/server/rate-limiter"
import { parseCommunityRouteDraft } from "@/lib/community/contracts"
import { getCommunityStore, requireMutationIdentity } from "../../../context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 20, label: "community revision request" })

function validRouteId(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,120}$/.test(value)
}

export async function handleCommunityRevisionPost(
  request: Request,
  context: { params: Promise<{ routeId: string }> },
  store = getCommunityStore()
): Promise<Response> {
  const requestId = readRequestId(request)
  let identityId: string
  try {
    identityId = requireMutationIdentity(request)
    const routeId = (await context.params).routeId
    if (!validRouteId(routeId)) throw new Error("route")
    const draft = parseCommunityRouteDraft(await readBoundedJsonBody(request, 32 * 1024))
    const revisionId = store.addRevision(identityId, routeId, draft)
    return jsonWithRequestId({ revisionId }, requestId, { status: 201 })
  } catch (caught) {
    if (caught instanceof Error && caught.message === "CSRF_REQUIRED") return apiErrorResponse("CSRF_REQUIRED", "A CSRF token is required for browser mutations.", 403, requestId)
    if (caught instanceof Error && caught.message === "AUTH_REQUIRED") return apiErrorResponse("AUTH_REQUIRED", "A verified Switchback ID is required to revise a route.", 401, requestId)
    if (caught instanceof BodyTooLargeError) return apiErrorResponse("REQUEST_TOO_LARGE", "That route revision is too large.", 413, requestId)
    return apiErrorResponse("INVALID_COMMUNITY_REVISION", "Provide a valid route revision owned by this identity.", 400, requestId)
  }
}

export async function POST(request: Request, context: { params: Promise<{ routeId: string }> }): Promise<Response> {
  const blocked = requestLimiter.check(request)
  if (blocked) return withRequestId(blocked, readRequestId(request))
  return withRequestId(await handleCommunityRevisionPost(request, context), readRequestId(request))
}
