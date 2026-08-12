import path from "node:path"

import { requireIdentity, requireMutationIdentity } from "@/app/api/community/context"
import { parseSyncEnvelope } from "@/lib/sync/encrypted-sync"
import { SyncRepository } from "@/lib/sync/repository"
import { apiErrorResponse, jsonWithRequestId, readRequestId } from "@/lib/server/api-contract"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 60, label: "sync request" })
let repository: SyncRepository | null = null

function syncRepository(): SyncRepository {
  if (!repository) repository = new SyncRepository(process.env.SYNC_DB_PATH ?? path.join(process.cwd(), "data/sync.sqlite"))
  return repository
}

function requireStoreIdentity(request: Request): string {
  // The community store import keeps the signed session policy in one place.
  return requireIdentity(request)
}

function requireStoreMutationIdentity(request: Request): string {
  return requireMutationIdentity(request)
}

export async function handleSyncGet(request: Request, store = syncRepository()): Promise<Response> {
  const requestId = readRequestId(request)
  try {
    const identityId = requireStoreIdentity(request)
    const params = new URL(request.url).searchParams
    const namespaceId = params.get("namespaceId") ?? ""
    if (!namespaceId) throw new Error("namespace")
    return jsonWithRequestId({ envelopes: store.list(identityId, namespaceId, params.get("collection") ?? undefined, params.get("objectId") ?? undefined) }, requestId)
  } catch {
    return apiErrorResponse("AUTH_REQUIRED", "A verified Switchback ID is required for sync.", 401, requestId)
  }
}

export async function handleSyncPost(request: Request, store = syncRepository()): Promise<Response> {
  const requestId = readRequestId(request)
  try {
    const identityId = requireStoreMutationIdentity(request)
    const body = await readBoundedJsonBody(request, 9 * 1024 * 1024)
    store.put(identityId, parseSyncEnvelope(body))
    return jsonWithRequestId({ accepted: true }, requestId, { status: 202 })
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return apiErrorResponse("REQUEST_TOO_LARGE", "That sync object is too large.", 413, requestId)
    if (caught instanceof Error && caught.message === "CSRF_REQUIRED") return apiErrorResponse("CSRF_REQUIRED", "A CSRF token is required for browser mutations.", 403, requestId)
    if (caught instanceof Error && caught.message === "AUTH_REQUIRED") return apiErrorResponse("AUTH_REQUIRED", "A verified Switchback ID is required for sync.", 401, requestId)
    return apiErrorResponse("INVALID_SYNC_ENVELOPE", "The encrypted sync envelope is invalid.", 400, requestId)
  }
}

export const GET = withRateLimit(requestLimiter, handleSyncGet)
export const POST = withRateLimit(requestLimiter, handleSyncPost)
