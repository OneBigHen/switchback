import { afterEach, describe, expect, it, vi } from "vitest"

const browser = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  startRegistration: vi.fn(async () => ({ id: "registration-response", response: { clientDataJSON: "public" } })),
  startAuthentication: vi.fn(async () => ({ id: "authentication-response", response: { clientDataJSON: "public" } }))
}))

vi.mock("@simplewebauthn/browser", () => browser)

import { authenticatePasskey, csrfHeaders, registerPasskey } from "@/lib/client/passkey"

afterEach(() => {
  vi.restoreAllMocks()
  browser.browserSupportsWebAuthn.mockReturnValue(true)
})

function response(body: unknown): Response {
  return Response.json(body)
}

describe("browser passkey adapter", () => {
  it("runs registration through the options and verify endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith("/register/options")) return response({ challengeId: "challenge-registration", options: { challenge: "server" } })
      expect(url).toMatch(/\/register\/verify$/)
      const body = JSON.parse(String(init?.body)) as { challengeId: string; response: { id: string; privateKey?: unknown } }
      expect(body).toMatchObject({ challengeId: "challenge-registration", response: { id: "registration-response" } })
      expect(body.response.privateKey).toBeUndefined()
      return response({ identityId: "rider-12345678901234567890" })
    })

    await expect(registerPasskey("Rider"))
      .resolves.toEqual({ identityId: "rider-12345678901234567890" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(browser.startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: "server" } })
  })

  it("runs discoverable authentication through the options and verify endpoints", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith("/authenticate/options")) return response({ challengeId: "challenge-authentication", options: { challenge: "server" } })
      expect(url).toMatch(/\/authenticate\/verify$/)
      expect(JSON.parse(String(init?.body))).toMatchObject({ challengeId: "challenge-authentication", response: { id: "authentication-response" } })
      return response({ identityId: "rider-12345678901234567890" })
    })

    await expect(authenticatePasskey()).resolves.toEqual({ identityId: "rider-12345678901234567890" })
    expect(browser.startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: "server" } })
  })

  it("fails before making a request when WebAuthn is unavailable", async () => {
    browser.browserSupportsWebAuthn.mockReturnValue(false)
    const fetchMock = vi.spyOn(globalThis, "fetch")

    await expect(registerPasskey()).rejects.toThrow(/WebAuthn/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("copies the browser CSRF cookie into mutation headers", () => {
    vi.stubGlobal("document", { cookie: "switchback_csrf=csrf-token" })

    expect(csrfHeaders({ "content-type": "application/json" }).get("x-switchback-csrf")).toBe("csrf-token")
  })
})
