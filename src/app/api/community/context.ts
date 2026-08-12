import path from "node:path"

import { hasValidMutationCsrf } from "@/lib/identity/csrf"
import { readIdentitySession } from "@/lib/identity/passkey"
import { CommunityRepository, type CommunityStore } from "@/lib/community/repository"

let store: CommunityStore | null = null

export function getCommunityStore(): CommunityStore {
  if (!store) {
    store = new CommunityRepository(process.env.COMMUNITY_DB_PATH ?? path.join(process.cwd(), "data/community.sqlite"))
  }
  return store
}

export function authenticatedIdentity(request: Request): string | null {
  const secret = process.env.SWITCHBACK_SESSION_SECRET ?? ""
  return readIdentitySession(request, secret)
}

export function requireIdentity(request: Request): string {
  const identityId = authenticatedIdentity(request)
  if (!identityId) throw new Error("AUTH_REQUIRED")
  return identityId
}

export function requireMutationIdentity(request: Request): string {
  const identityId = requireIdentity(request)
  if (!hasValidMutationCsrf(request)) throw new Error("CSRF_REQUIRED")
  return identityId
}
