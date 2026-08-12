import { requireMutationIdentity } from "@/app/api/community/context"
import { syncRepository } from "@/app/api/sync/route"
import { validateSyncNamespaceId } from "@/lib/sync/encrypted-sync"
import { apiErrorResponse, jsonWithRequestId, readRequestId } from "@/lib/server/api-contract"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import type { SyncRepository } from "@/lib/sync/repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 20, label: "sync link request" })

export async function handleSyncLink(request: Request, store: SyncRepository = syncRepository()): Promise<Response> {
  const requestId = readRequestId(request)
  try {
    const identityId = requireMutationIdentity(request)
    const body = await readBoundedJsonBody(request, 8 * 1024)
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("body")
    const namespaceId = (body as Record<string, unknown>).namespaceId
    if (typeof namespaceId !== "string") throw new Error("namespace")
    validateSyncNamespaceId(namespaceId)
    store.link(identityId, namespaceId)
    return jsonWithRequestId({ linked: true, namespaceId }, requestId, { status: 200 })
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return apiErrorResponse("REQUEST_TOO_LARGE", "That sync link request is too large.", 413, requestId)
    if (caught instanceof Error && caught.message === "CSRF_REQUIRED") return apiErrorResponse("CSRF_REQUIRED", "A CSRF token is required for browser mutations.", 403, requestId)
    if (caught instanceof Error && caught.message === "AUTH_REQUIRED") return apiErrorResponse("AUTH_REQUIRED", "A verified Switchback ID is required to link sync.", 401, requestId)
    if (caught instanceof Error && /namespace|invalid/i.test(caught.message)) return apiErrorResponse("INVALID_SYNC_REQUEST", "The sync namespace is invalid.", 400, requestId)
    return apiErrorResponse("SYNC_UNAVAILABLE", "Encrypted sync is temporarily unavailable.", 503, requestId)
  }
}

export const POST = withRateLimit(requestLimiter, handleSyncLink)
