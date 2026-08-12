import { apiErrorResponse, jsonWithRequestId, readRequestId, withRequestId } from "@/lib/server/api-contract"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"
import { createRateLimiter } from "@/lib/server/rate-limiter"
import { parseCommunityArtifactDraft } from "@/lib/community/contracts"
import { getCommunityStore, requireMutationIdentity } from "../../../context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 20, label: "community artifact request" })

export async function handleCommunityArtifactPost(
  request: Request,
  context: { params: Promise<{ routeId: string }> },
  store = getCommunityStore()
): Promise<Response> {
  const requestId = readRequestId(request)
  try {
    const identityId = requireMutationIdentity(request)
    const routeId = (await context.params).routeId
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(routeId)) throw new Error("route")
    const body = await readBoundedJsonBody(request, 8 * 1024)
    if (typeof body !== "object" || body === null || typeof (body as { revisionId?: unknown }).revisionId !== "string") throw new Error("revision")
    const artifact = parseCommunityArtifactDraft((body as { artifact?: unknown }).artifact)
    const id = store.addArtifact(identityId, routeId, (body as { revisionId: string }).revisionId, artifact)
    return jsonWithRequestId({ id }, requestId, { status: 201 })
  } catch (caught) {
    if (caught instanceof Error && caught.message === "CSRF_REQUIRED") return apiErrorResponse("CSRF_REQUIRED", "A CSRF token is required for browser mutations.", 403, requestId)
    if (caught instanceof Error && caught.message === "AUTH_REQUIRED") return apiErrorResponse("AUTH_REQUIRED", "A verified Switchback ID is required to attach an artifact.", 401, requestId)
    if (caught instanceof BodyTooLargeError) return apiErrorResponse("REQUEST_TOO_LARGE", "That artifact metadata is too large.", 413, requestId)
    return apiErrorResponse("INVALID_COMMUNITY_ARTIFACT", "Provide a valid artifact for a route revision.", 400, requestId)
  }
}

export async function POST(request: Request, context: { params: Promise<{ routeId: string }> }): Promise<Response> {
  const blocked = requestLimiter.check(request)
  if (blocked) return withRequestId(blocked, readRequestId(request))
  return withRequestId(await handleCommunityArtifactPost(request, context), readRequestId(request))
}
