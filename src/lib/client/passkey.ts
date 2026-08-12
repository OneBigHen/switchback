import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration
} from "@simplewebauthn/browser"

interface CeremonyOptions<T> {
  challengeId: string
  options: T
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {})
  })
  const payload = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) throw new Error(payload.error?.message ?? "Passkey request failed")
  return payload
}

function ensureWebAuthn(): void {
  if (!browserSupportsWebAuthn()) throw new Error("This browser does not support WebAuthn passkeys")
}

export async function registerPasskey(displayName?: string): Promise<{ identityId: string }> {
  ensureWebAuthn()
  const ceremony = await post<CeremonyOptions<Parameters<typeof startRegistration>[0]["optionsJSON"]>>(
    "/api/identity/register/options",
    displayName ? { displayName } : {}
  )
  const response = await startRegistration({ optionsJSON: ceremony.options })
  return post<{ identityId: string }>("/api/identity/register/verify", {
    challengeId: ceremony.challengeId,
    response
  })
}

export async function authenticatePasskey(): Promise<{ identityId: string }> {
  ensureWebAuthn()
  const ceremony = await post<CeremonyOptions<Parameters<typeof startAuthentication>[0]["optionsJSON"]>>(
    "/api/identity/authenticate/options"
  )
  const response = await startAuthentication({ optionsJSON: ceremony.options })
  return post<{ identityId: string }>("/api/identity/authenticate/verify", {
    challengeId: ceremony.challengeId,
    response
  })
}

export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null
  return document.cookie.match(/(?:^|;\s*)switchback_csrf=([^;]+)/)?.[1] ?? null
}

export function csrfHeaders(headers: HeadersInit = {}): Headers {
  const result = new Headers(headers)
  const token = readCsrfToken()
  if (token) result.set("x-switchback-csrf", token)
  return result
}
