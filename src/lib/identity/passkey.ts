import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export interface PasskeyChallenge {
  id: string
  challenge: string
  kind: "registration" | "authentication"
  identityId: string | null
  expiresAt: number
}

export interface StoredPasskeyCredential {
  credentialId: string
  identityId: string
  publicKey: Uint8Array
  signCount: number
}

const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1_000
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url")
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8")
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url")
}

export class PasskeyChallengeStore {
  private readonly entries = new Map<string, PasskeyChallenge>()

  constructor(
    private readonly ttlMs = DEFAULT_CHALLENGE_TTL_MS,
    private readonly maxEntries = 1_000
  ) {}

  issue(kind: PasskeyChallenge["kind"], identityId: string | null = null, now = Date.now()): PasskeyChallenge {
    this.prune(now)
    if (this.entries.size >= this.maxEntries) throw new Error("Too many passkey challenges")
    const challenge = {
      id: `challenge-${randomBytes(16).toString("hex")}`,
      challenge: randomBytes(32).toString("base64url"),
      kind,
      identityId,
      expiresAt: now + this.ttlMs
    }
    this.entries.set(challenge.id, challenge)
    return challenge
  }

  consume(id: string, kind: PasskeyChallenge["kind"], now = Date.now()): PasskeyChallenge | null {
    const challenge = this.entries.get(id)
    if (!challenge || challenge.kind !== kind) return null
    this.entries.delete(id)
    return challenge.expiresAt > now ? challenge : null
  }

  size(now = Date.now()): number {
    this.prune(now)
    return this.entries.size
  }

  private prune(now: number): void {
    for (const [id, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(id)
  }
}

export function validateStoredPasskeyCredential(input: StoredPasskeyCredential): StoredPasskeyCredential {
  if (!/^[A-Za-z0-9_-]{8,1024}$/.test(input.credentialId)) throw new Error("Credential id is invalid")
  if (!input.identityId || input.publicKey.byteLength < 16 || input.publicKey.byteLength > 4_096) {
    throw new Error("Passkey public key is invalid")
  }
  if (!Number.isSafeInteger(input.signCount) || input.signCount < 0) throw new Error("Passkey counter is invalid")
  return input
}

/**
 * The server stores only this credential material. WebAuthn assertion
 * verification remains an injected platform adapter; this module never
 * accepts a client-supplied "verified" flag as proof.
 */
export function nextPasskeyCounter(previous: number, received: number): number {
  if (!Number.isSafeInteger(previous) || previous < 0 || !Number.isSafeInteger(received) || received < 0) {
    throw new Error("Invalid WebAuthn signature counter")
  }
  if (received !== 0 && received <= previous) throw new Error("WebAuthn signature counter did not advance")
  return Math.max(previous, received)
}

export function createIdentitySession(
  identityId: string,
  secret: string,
  ttlMs = DEFAULT_SESSION_TTL_MS,
  now = Date.now()
): string {
  if (secret.length < 32) throw new Error("SWITCHBACK_SESSION_SECRET must be at least 32 characters")
  if (!/^rider-[A-Za-z0-9-]{20,}$/.test(identityId)) throw new Error("Identity id is invalid")
  const payload = encode(JSON.stringify({ v: 1, sub: identityId, iat: now, exp: now + ttlMs }))
  return `${payload}.${signature(payload, secret)}`
}

export function readIdentitySession(request: Request, secret: string, now = Date.now()): string | null {
  if (secret.length < 32) return null
  const authorization = request.headers.get("authorization")
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)switchback_session=([^;]+)/)?.[1]
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : cookie
  if (!token) return null
  const [payload, provided] = token.split(".")
  if (!payload || !provided || !/^[A-Za-z0-9_-]+$/.test(provided)) return null
  const expected = signature(payload, secret)
  const expectedBytes = Buffer.from(expected)
  const providedBytes = Buffer.from(provided)
  if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) return null
  try {
    const claims = JSON.parse(decode(payload)) as { v?: number; sub?: unknown; exp?: unknown }
    if (claims.v !== 1 || typeof claims.sub !== "string" || !/^rider-[A-Za-z0-9-]{20,}$/.test(claims.sub)) return null
    if (typeof claims.exp !== "number" || claims.exp <= now) return null
    return claims.sub
  } catch {
    return null
  }
}
