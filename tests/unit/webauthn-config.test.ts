import { afterEach, describe, expect, it, vi } from "vitest"

import { getWebAuthnConfig, getWebAuthnVerifier, WebAuthnConfigError } from "@/lib/identity/webauthn"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("WebAuthn configuration", () => {
  it("uses explicit relying-party values", () => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("SWITCHBACK_WEBAUTHN_RP_ID", "rides.example.test")
    vi.stubEnv("SWITCHBACK_WEBAUTHN_ORIGIN", "https://rides.example.test")
    vi.stubEnv("SWITCHBACK_WEBAUTHN_RP_NAME", "Switchback Test")

    expect(getWebAuthnConfig()).toEqual({
      rpID: "rides.example.test",
      expectedOrigin: "https://rides.example.test",
      rpName: "Switchback Test"
    })
  })

  it("uses localhost defaults outside production", () => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("SWITCHBACK_WEBAUTHN_RP_ID", undefined)
    vi.stubEnv("SWITCHBACK_WEBAUTHN_ORIGIN", undefined)
    vi.stubEnv("SWITCHBACK_WEBAUTHN_RP_NAME", undefined)

    expect(getWebAuthnConfig()).toEqual({
      rpID: "localhost",
      expectedOrigin: "http://localhost:3000",
      rpName: "Switchback"
    })
  })

  it("fails closed when production trust settings are missing", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("SWITCHBACK_WEBAUTHN_RP_ID", undefined)
    vi.stubEnv("SWITCHBACK_WEBAUTHN_ORIGIN", undefined)

    expect(() => getWebAuthnConfig()).toThrow(WebAuthnConfigError)
  })

  it("rejects an RP id unrelated to the configured origin", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("SWITCHBACK_WEBAUTHN_RP_ID", "other.example.com")
    vi.stubEnv("SWITCHBACK_WEBAUTHN_ORIGIN", "https://rides.example.com")

    expect(() => getWebAuthnConfig()).toThrow(WebAuthnConfigError)
  })

  it("preserves the stored base64url challenge for browser ceremonies", async () => {
    const challenge = Buffer.from("challenge-bytes").toString("base64url")
    const verifier = getWebAuthnVerifier()

    await expect(verifier.generateRegistrationOptions({
      rpName: "Switchback",
      rpID: "localhost",
      userName: "rider-test",
      challenge
    })).resolves.toMatchObject({ challenge })
    await expect(verifier.generateAuthenticationOptions({ rpID: "localhost", challenge })).resolves.toMatchObject({ challenge })
  })
})
