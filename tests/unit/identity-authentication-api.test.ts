import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { handleIdentityAuthenticationOptions } from "@/app/api/identity/authenticate/options/route"
import { handleIdentityAuthenticationVerify } from "@/app/api/identity/authenticate/verify/route"
import type { IdentityRuntime } from "@/app/api/identity/context"
import { CommunityRepository } from "@/lib/community/repository"
import { PasskeyChallengeStore } from "@/lib/identity/passkey"

const secret = "s".repeat(32)
const resources: Array<{ repository: CommunityRepository; directory: string }> = []

afterEach(() => {
  process.env.SWITCHBACK_SESSION_SECRET = undefined
  for (const resource of resources.splice(0)) {
    resource.repository.close()
    rmSync(resource.directory, { recursive: true, force: true })
  }
})

function runtime(newCounter = 8, verifierError: Error | null = null): { context: IdentityRuntime; identityId: string } {
  const directory = mkdtempSync(path.join(tmpdir(), "switchback-identity-authentication-"))
  const repository = new CommunityRepository(path.join(directory, "community.sqlite"))
  resources.push({ repository, directory })
  const identityId = repository.createIdentity("Rider")
  repository.registerPasskeyCredential({
    credentialId: "credential-auth-1",
    identityId,
    publicKey: new Uint8Array(32).fill(4),
    signCount: 7
  })
  process.env.SWITCHBACK_SESSION_SECRET = secret
  return {
    identityId,
    context: {
      store: repository,
      challenges: new PasskeyChallengeStore(5 * 60_000, 10),
      config: { rpID: "localhost", expectedOrigin: "http://localhost:3000", rpName: "Switchback Test" },
      verifier: {
        generateRegistrationOptions: vi.fn(async (input) => ({ challenge: input.challenge, rp: { id: input.rpID, name: input.rpName }, user: { id: "u", name: input.userName, displayName: "Rider" }, pubKeyCredParams: [{ alg: -7, type: "public-key" as const }], attestation: "none" as const })),
        generateAuthenticationOptions: vi.fn(async (input) => ({ challenge: input.challenge, rpId: input.rpID, userVerification: input.userVerification })),
        verifyRegistrationResponse: vi.fn(),
        verifyAuthenticationResponse: vi.fn(async () => {
          if (verifierError) throw verifierError
          return {
            verified: true as const,
            authenticationInfo: {
              credentialID: "credential-auth-1",
              newCounter,
              userVerified: true,
              credentialDeviceType: "singleDevice" as const,
              credentialBackedUp: false,
              origin: "http://localhost:3000",
              rpID: "localhost"
            }
          }
        })
      } as IdentityRuntime["verifier"]
    }
  }
}

async function options(context: IdentityRuntime): Promise<{ challengeId: string; options: { allowCredentials?: unknown[] } }> {
  const response = await handleIdentityAuthenticationOptions(new Request("http://localhost:3000/api/identity/authenticate/options", {
    method: "POST",
    body: "{}"
  }), context)
  expect(response.status).toBe(200)
  return await response.json() as { challengeId: string; options: { allowCredentials?: unknown[] } }
}

describe("WebAuthn authentication API", () => {
  it("offers discoverable credentials and advances the stored counter after verification", async () => {
    const { context, identityId } = runtime()
    const issued = await options(context)
    expect(issued.options.allowCredentials).toBeUndefined()

    const response = await handleIdentityAuthenticationVerify(new Request("http://localhost:3000/api/identity/authenticate/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId: issued.challengeId, response: { id: "credential-auth-1" } })
    }), context)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ identityId })
    expect(context.store.getPasskeyCredential("credential-auth-1")?.signCount).toBe(8)
    expect(response.headers.get("set-cookie")).toMatch(/switchback_session=.*switchback_csrf=/)
  })

  it("rejects an unknown credential and consumes the challenge", async () => {
    const { context } = runtime()
    const issued = await options(context)
    const body = JSON.stringify({ challengeId: issued.challengeId, response: { id: "credential-unknown" } })
    const response = await handleIdentityAuthenticationVerify(new Request("http://localhost:3000/api/identity/authenticate/verify", { method: "POST", body }), context)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "PASSKEY_CREDENTIAL_UNKNOWN" } })
    const replay = await handleIdentityAuthenticationVerify(new Request("http://localhost:3000/api/identity/authenticate/verify", { method: "POST", body }), context)
    expect(replay.status).toBe(400)
    expect(await replay.json()).toMatchObject({ error: { code: "PASSKEY_CHALLENGE_INVALID" } })
  })

  it("rejects a counter rollback and preserves the stored counter", async () => {
    const { context } = runtime(4)
    const issued = await options(context)
    const response = await handleIdentityAuthenticationVerify(new Request("http://localhost:3000/api/identity/authenticate/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId: issued.challengeId, response: { id: "credential-auth-1" } })
    }), context)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "PASSKEY_COUNTER_INVALID" } })
    expect(context.store.getPasskeyCredential("credential-auth-1")?.signCount).toBe(7)
  })

  it("maps verifier origin/signature failures to a safe error without issuing a session", async () => {
    const { context } = runtime(8, new Error("Unexpected origin"))
    const issued = await options(context)
    const response = await handleIdentityAuthenticationVerify(new Request("http://localhost:3000/api/identity/authenticate/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId: issued.challengeId, response: { id: "credential-auth-1" } })
    }), context)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "PASSKEY_VERIFICATION_FAILED" } })
    expect(response.headers.get("set-cookie")).toBeNull()
  })
})
