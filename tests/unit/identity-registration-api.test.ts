import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { handleIdentityRegistrationOptions } from "@/app/api/identity/register/options/route"
import { handleIdentityRegistrationVerify } from "@/app/api/identity/register/verify/route"
import { CommunityRepository } from "@/lib/community/repository"
import { PasskeyChallengeStore } from "@/lib/identity/passkey"
import type { IdentityRuntime } from "@/app/api/identity/context"

const secret = "s".repeat(32)
const resources: Array<{ repository: CommunityRepository; directory: string }> = []

afterEach(() => {
  process.env.SWITCHBACK_SESSION_SECRET = undefined
  for (const resource of resources.splice(0)) {
    resource.repository.close()
    rmSync(resource.directory, { recursive: true, force: true })
  }
})

function runtime(): IdentityRuntime {
  const directory = mkdtempSync(path.join(tmpdir(), "switchback-identity-registration-"))
  const repository = new CommunityRepository(path.join(directory, "community.sqlite"))
  resources.push({ repository, directory })
  process.env.SWITCHBACK_SESSION_SECRET = secret
  return {
    store: repository,
    challenges: new PasskeyChallengeStore(5 * 60_000, 10),
    config: {
      rpID: "localhost",
      expectedOrigin: "http://localhost:3000",
      rpName: "Switchback Test"
    },
      verifier: {
        generateRegistrationOptions: vi.fn(async (input) => ({
          challenge: input.challenge,
          rp: { id: input.rpID, name: input.rpName },
          user: { id: "user", name: input.userName, displayName: input.userDisplayName ?? "" },
          pubKeyCredParams: [{ alg: -7, type: "public-key" as const }],
          attestation: "none" as const
        })),
        generateAuthenticationOptions: vi.fn(),
        verifyRegistrationResponse: vi.fn(async () => ({
        verified: true as const,
        registrationInfo: {
          credential: {
            id: "credential-test-1",
            publicKey: new Uint8Array(32).fill(1),
            counter: 0
          }
        }
      })),
        verifyAuthenticationResponse: vi.fn()
      }
  }
}

describe("WebAuthn registration API", () => {
  it("issues a bounded registration challenge and persists only verified public credential material", async () => {
    const context = runtime()
    const optionsResponse = await handleIdentityRegistrationOptions(new Request("http://localhost:3000/api/identity/register/options", {
      method: "POST",
      body: JSON.stringify({ displayName: "Rider <one>" })
    }), context)
    const options = await optionsResponse.json() as { challengeId: string; options: { challenge: string } }

    expect(optionsResponse.status).toBe(200)
    expect(options.challengeId).toMatch(/^challenge-/)
    expect(options.options.challenge).toMatch(/^[A-Za-z0-9_-]+$/)

    const verifyResponse = await handleIdentityRegistrationVerify(new Request("http://localhost:3000/api/identity/register/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId: options.challengeId, response: { id: "credential-test-1" } })
    }), context)
    const result = await verifyResponse.json() as { identityId: string }

    expect(verifyResponse.status).toBe(200)
    expect(result.identityId).toMatch(/^rider-/)
    expect(verifyResponse.headers.get("set-cookie")).toMatch(/switchback_session=.*switchback_csrf=/)
    expect(context.store.getPasskeyCredential("credential-test-1")).toMatchObject({
      identityId: result.identityId,
      publicKey: new Uint8Array(32).fill(1),
      signCount: 0
    })
  })

  it("rejects an invalid or replayed challenge without writing a credential", async () => {
    const context = runtime()
    const invalid = await handleIdentityRegistrationVerify(new Request("http://localhost:3000/api/identity/register/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId: "challenge-missing", response: { id: "credential-test-1" } })
    }), context)
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ error: { code: "PASSKEY_CHALLENGE_INVALID" } })
    expect(context.store.getPasskeyCredential("credential-test-1")).toBeNull()

    const optionsResponse = await handleIdentityRegistrationOptions(new Request("http://localhost:3000/api/identity/register/options", {
      method: "POST",
      body: JSON.stringify({})
    }), context)
    const options = await optionsResponse.json() as { challengeId: string }
    const body = JSON.stringify({ challengeId: options.challengeId, response: { id: "credential-test-1" } })
    expect((await handleIdentityRegistrationVerify(new Request("http://localhost:3000/api/identity/register/verify", { method: "POST", body }), context)).status).toBe(200)
    const replay = await handleIdentityRegistrationVerify(new Request("http://localhost:3000/api/identity/register/verify", { method: "POST", body }), context)
    expect(replay.status).toBe(400)
    expect(await replay.json()).toMatchObject({ error: { code: "PASSKEY_CHALLENGE_INVALID" } })
  })

  it("does not overwrite a credential when the verified id already exists", async () => {
    const context = runtime()
    const existingIdentity = context.store.createIdentity("Existing")
    context.store.registerPasskeyCredential({
      credentialId: "credential-test-1",
      identityId: existingIdentity,
      publicKey: new Uint8Array(32).fill(9),
      signCount: 7
    })
    const optionsResponse = await handleIdentityRegistrationOptions(new Request("http://localhost:3000/api/identity/register/options", {
      method: "POST",
      body: JSON.stringify({})
    }), context)
    const options = await optionsResponse.json() as { challengeId: string }
    const response = await handleIdentityRegistrationVerify(new Request("http://localhost:3000/api/identity/register/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId: options.challengeId, response: { id: "credential-test-1" } })
    }), context)

    expect(response.status).toBe(409)
    expect(context.store.getPasskeyCredential("credential-test-1")).toMatchObject({ identityId: existingIdentity, signCount: 7 })
  })
})
