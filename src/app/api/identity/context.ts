import { getCommunityStore } from "@/app/api/community/context"
import type { CommunityStore } from "@/lib/community/repository"
import { PasskeyChallengeStore } from "@/lib/identity/passkey"
import {
  getWebAuthnConfig,
  getWebAuthnVerifier,
  type WebAuthnConfig,
  type WebAuthnVerifier
} from "@/lib/identity/webauthn"

export interface IdentityRuntime {
  store: CommunityStore
  challenges: PasskeyChallengeStore
  config: WebAuthnConfig
  verifier: WebAuthnVerifier
}

let challenges: PasskeyChallengeStore | null = null

export function getIdentityStore(): CommunityStore {
  return getCommunityStore()
}

export function getPasskeyChallenges(): PasskeyChallengeStore {
  return challenges ??= new PasskeyChallengeStore()
}

export function getIdentityRuntime(): IdentityRuntime {
  return {
    store: getIdentityStore(),
    challenges: getPasskeyChallenges(),
    config: getWebAuthnConfig(),
    verifier: getWebAuthnVerifier()
  }
}
