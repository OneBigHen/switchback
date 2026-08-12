import { apiErrorResponse, jsonWithRequestId, readRequestId, withRequestId } from "@/lib/server/api-contract"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"
import { createRateLimiter } from "@/lib/server/rate-limiter"
import { getCommunityStore, requireMutationIdentity } from "../../../context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 20, label: "community comment request" })

async function routeId(params: Promise<{ routeId: string }>): Promise<string> {
  const value = (await params).routeId
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(value)) throw new Error("INVALID_ROUTE_ID")
  return value
}

export async function handleCommunityCommentsGet(
  request: Request,
  context: { params: Promise<{ routeId: string }> },
  store = getCommunityStore()
): Promise<Response> {
  const requestId = readRequestId(request)
  try {
    return jsonWithRequestId({ comments: store.listComments(await routeId(context.params)) }, requestId)
  } catch {
    return apiErrorResponse("INVALID_COMMUNITY_ROUTE", "That community route is not available.", 404, requestId)
  }
}

export async function handleCommunityCommentsPost(
  request: Request,
  context: { params: Promise<{ routeId: string }> },
  store = getCommunityStore()
): Promise<Response> {
  const requestId = readRequestId(request)
  let identityId: string
  try {
    identityId = requireMutationIdentity(request)
  } catch (caught) {
    if (caught instanceof Error && caught.message === "CSRF_REQUIRED") return apiErrorResponse("CSRF_REQUIRED", "A CSRF token is required for browser mutations.", 403, requestId)
    return apiErrorResponse("AUTH_REQUIRED", "A verified Switchback ID is required to comment.", 401, requestId)
  }
  try {
    const body = await readBoundedJsonBody(request, 8 * 1024)
    if (typeof body !== "object" || body === null || typeof (body as { body?: unknown }).body !== "string") throw new Error("invalid body")
    const id = store.addComment(identityId, await routeId(context.params), (body as { body: string }).body)
    return jsonWithRequestId({ id }, requestId, { status: 201 })
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return apiErrorResponse("REQUEST_TOO_LARGE", "That comment is too large.", 413, requestId)
    return apiErrorResponse("INVALID_COMMUNITY_COMMENT", "Provide a non-empty plain-text comment.", 400, requestId)
  }
}

export async function GET(request: Request, context: { params: Promise<{ routeId: string }> }): Promise<Response> {
  const blocked = requestLimiter.check(request)
  if (blocked) return withRequestId(blocked, readRequestId(request))
  return withRequestId(await handleCommunityCommentsGet(request, context), readRequestId(request))
}

export async function POST(request: Request, context: { params: Promise<{ routeId: string }> }): Promise<Response> {
  const blocked = requestLimiter.check(request)
  if (blocked) return withRequestId(blocked, readRequestId(request))
  return withRequestId(await handleCommunityCommentsPost(request, context), readRequestId(request))
}
