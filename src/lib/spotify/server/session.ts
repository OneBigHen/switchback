export const SPOTIFY_OAUTH_COOKIE = "switchback_spotify_oauth"
export const SPOTIFY_SESSION_COOKIE = "switchback_spotify_session"

const OAUTH_COOKIE_SECONDS = 10 * 60
const SESSION_COOKIE_SECONDS = 180 * 24 * 60 * 60

export interface SpotifyServerConfig {
  clientId: string
  redirectUri: string
  sessionSecret: string
  secureCookies: boolean
}

export interface SpotifyAuthState {
  codeVerifier: string
  state: string
  returnTo: string
  createdAt: number
}

export interface SpotifySession {
  sessionId: string
  accessToken: string
  refreshToken: string
  expiresAt: number
  refreshExpiresAt: number
  scopes: readonly string[]
}

export class SpotifyConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SpotifyConfigurationError"
  }
}

export interface SpotifyEnvironment {
  SPOTIFY_CLIENT_ID?: string
  SPOTIFY_REDIRECT_URI?: string
  SPOTIFY_SESSION_SECRET?: string
}

export function readSpotifyServerConfig(
  env?: SpotifyEnvironment
): SpotifyServerConfig {
  const source = env ?? {
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI,
    SPOTIFY_SESSION_SECRET: process.env.SPOTIFY_SESSION_SECRET
  }
  const clientId = source.SPOTIFY_CLIENT_ID?.trim()
  const redirectUri = source.SPOTIFY_REDIRECT_URI?.trim()
  const sessionSecret = source.SPOTIFY_SESSION_SECRET?.trim()

  if (!clientId) throw new SpotifyConfigurationError("SPOTIFY_CLIENT_ID is not configured.")
  if (!redirectUri) throw new SpotifyConfigurationError("SPOTIFY_REDIRECT_URI is not configured.")
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new SpotifyConfigurationError("SPOTIFY_SESSION_SECRET must contain at least 32 characters.")
  }

  let parsedRedirect: URL
  try {
    parsedRedirect = new URL(redirectUri)
  } catch {
    throw new SpotifyConfigurationError("SPOTIFY_REDIRECT_URI must be an absolute URL.")
  }
  const localDevelopment = parsedRedirect.hostname === "127.0.0.1"
    || parsedRedirect.hostname === "[::1]"
    || parsedRedirect.hostname === "::1"
  if (parsedRedirect.protocol !== "https:" && !(parsedRedirect.protocol === "http:" && localDevelopment)) {
    throw new SpotifyConfigurationError("SPOTIFY_REDIRECT_URI must use HTTPS outside local development.")
  }

  return {
    clientId,
    redirectUri: parsedRedirect.toString(),
    sessionSecret,
    secureCookies: parsedRedirect.protocol === "https:"
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4)
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  if (bytesToBase64Url(bytes) !== value) throw new Error("Invalid base64url encoding.")
  return bytes
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret))
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

function additionalData(purpose: "oauth" | "session"): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`switchback.spotify.${purpose}.v1`)
}

export async function sealSpotifyCookie(
  value: unknown,
  secret: string,
  purpose: "oauth" | "session"
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(purpose) },
    await encryptionKey(secret),
    plaintext
  )
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`
}

export async function openSpotifyCookie<T = unknown>(
  value: string,
  secret: string,
  purpose: "oauth" | "session"
): Promise<T> {
  const [version, encodedIv, encodedCiphertext, ...extra] = value.split(".")
  if (version !== "v1" || !encodedIv || !encodedCiphertext || extra.length > 0) {
    throw new Error("Invalid Spotify cookie envelope.")
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToBytes(encodedIv),
      additionalData: additionalData(purpose)
    },
    await encryptionKey(secret),
    base64UrlToBytes(encodedCiphertext)
  )
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}

export function readRequestCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie")
  if (!header) return null
  for (const entry of header.split(";")) {
    const separator = entry.indexOf("=")
    if (separator < 0 || entry.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(entry.slice(separator + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

function serializeCookie(
  name: string,
  value: string,
  maxAge: number,
  secure: boolean
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : null
  ].filter(Boolean).join("; ")
}

export function spotifyOAuthCookie(value: string, secure: boolean): string {
  return serializeCookie(SPOTIFY_OAUTH_COOKIE, value, OAUTH_COOKIE_SECONDS, secure)
}

export function spotifySessionCookie(value: string, secure: boolean): string {
  return serializeCookie(SPOTIFY_SESSION_COOKIE, value, SESSION_COOKIE_SECONDS, secure)
}

export function clearSpotifyOAuthCookie(secure: boolean): string {
  return serializeCookie(SPOTIFY_OAUTH_COOKIE, "", 0, secure)
}

export function clearSpotifySessionCookie(secure: boolean): string {
  return serializeCookie(SPOTIFY_SESSION_COOKIE, "", 0, secure)
}

export function appendSetCookies(response: Response, cookies: string[]): Response {
  for (const cookie of cookies) response.headers.append("set-cookie", cookie)
  return response
}
