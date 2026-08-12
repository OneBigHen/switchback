import { randomBytes, timingSafeEqual } from "node:crypto"

import { createIdentitySession, readIdentitySession } from "./passkey"

const SESSION_COOKIE = "switchback_session"
const CSRF_COOKIE = "switchback_csrf"

function cookieValue(request: Request, name: string): string | null {
  return request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null
}

function cookie(name: string, value: string, httpOnly = false): string {
  return `${name}=${value};${httpOnly ? " HttpOnly;" : ""} Secure; SameSite=Lax; Path=/`
}

export function createIdentitySessionResponse(identityId: string): Response {
  const secret = process.env.SWITCHBACK_SESSION_SECRET ?? ""
  const session = createIdentitySession(identityId, secret)
  const csrf = randomBytes(32).toString("base64url")
  const response = Response.json({ identityId })
  response.headers.append("set-cookie", cookie(SESSION_COOKIE, session, true))
  response.headers.append("set-cookie", cookie(CSRF_COOKIE, csrf))
  return response
}

export function hasValidMutationCsrf(request: Request): boolean {
  if (request.headers.get("authorization")?.startsWith("Bearer ")) return true
  const expected = cookieValue(request, CSRF_COOKIE)
  const received = request.headers.get("x-switchback-csrf")
  if (!expected || !received) return false
  const expectedBytes = Buffer.from(expected)
  const receivedBytes = Buffer.from(received)
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
}

export function readCookieIdentity(request: Request): string | null {
  return readIdentitySession(request, process.env.SWITCHBACK_SESSION_SECRET ?? "")
}
