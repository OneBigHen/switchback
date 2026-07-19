import { string, number, object_, optional, safeParse, type Infer } from "@/lib/validate"
import { SPOTIFY_ACCOUNTS_TOKEN_URL, SPOTIFY_SCOPES } from "../constants"
import type { SpotifyServerConfig, SpotifySession } from "./session"

const REFRESH_TOKEN_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000
const ACCESS_TOKEN_REFRESH_WINDOW_MS = 90_000
const REFRESH_FLIGHT_GRACE_MS = 15_000

interface RefreshFlight {
  promise: Promise<SpotifySession>
  expiresAt: number
}

const refreshFlights = new Map<string, RefreshFlight>()

const tokenResponseSchema = object_({
  access_token: string({ min: 1 }),
  refresh_token: optional(string({ min: 1 })),
  token_type: optional(string()),
  scope: optional(string()),
  expires_in: number({ int: true, positive: true })
})

type TokenResponse = Infer<typeof tokenResponseSchema>

export class SpotifyTokenError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "SpotifyTokenError"
  }
}

async function tokenRequest(
  body: URLSearchParams,
  fetcher: typeof fetch
): Promise<TokenResponse> {
  let response: Response
  try {
    response = await fetcher(SPOTIFY_ACCOUNTS_TOKEN_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    throw new SpotifyTokenError("temporarily_unavailable", 503, "Spotify authorization is temporarily unavailable.")
  }

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = typeof payload === "object" && payload !== null && "error" in payload
      ? String(payload.error)
      : "token_exchange_failed"
    throw new SpotifyTokenError(error, response.status, "Spotify rejected the authorization token request.")
  }
  const parsed = safeParse(tokenResponseSchema, payload)
  if (!parsed.success) {
    throw new SpotifyTokenError("invalid_token_response", 502, "Spotify returned an invalid token response.")
  }
  return parsed.data
}

function scopes(value: string | undefined, fallback: readonly string[] = []): string[] {
  return value?.split(/\s+/).filter(Boolean) ?? [...fallback]
}

export async function exchangeSpotifyAuthorizationCode(input: {
  code: string
  codeVerifier: string
  config: SpotifyServerConfig
  fetcher?: typeof fetch
  now?: () => number
}): Promise<SpotifySession> {
  const payload = await tokenRequest(new URLSearchParams({
    client_id: input.config.clientId,
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.config.redirectUri,
    code_verifier: input.codeVerifier
  }), input.fetcher ?? fetch)
  if (!payload.refresh_token) {
    throw new SpotifyTokenError("missing_refresh_token", 502, "Spotify did not return a refresh token.")
  }
  const now = (input.now ?? Date.now)()
  return {
    sessionId: crypto.randomUUID(),
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: now + payload.expires_in * 1000,
    refreshExpiresAt: now + REFRESH_TOKEN_LIFETIME_MS,
    scopes: scopes(payload.scope)
  }
}

export function isSpotifySession(value: unknown): value is SpotifySession {
  if (!value || typeof value !== "object") return false
  const session = value as Partial<SpotifySession>
  return typeof session.sessionId === "string"
    && session.sessionId.length >= 16
    && typeof session.accessToken === "string"
    && session.accessToken.length > 0
    && typeof session.refreshToken === "string"
    && session.refreshToken.length > 0
    && typeof session.expiresAt === "number"
    && Number.isFinite(session.expiresAt)
    && typeof session.refreshExpiresAt === "number"
    && Number.isFinite(session.refreshExpiresAt)
    && Array.isArray(session.scopes)
    && session.scopes.every((scope) => typeof scope === "string")
}

export async function refreshSpotifySession(input: {
  session: SpotifySession
  config: SpotifyServerConfig
  fetcher?: typeof fetch
  now?: () => number
}): Promise<SpotifySession> {
  const now = (input.now ?? Date.now)()
  if (input.session.refreshExpiresAt <= now) {
    throw new SpotifyTokenError("invalid_grant", 401, "Spotify authorization has expired.")
  }
  const payload = await tokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.session.refreshToken,
    client_id: input.config.clientId
  }), input.fetcher ?? fetch)
  return {
    sessionId: input.session.sessionId,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? input.session.refreshToken,
    expiresAt: now + payload.expires_in * 1000,
    refreshExpiresAt: input.session.refreshExpiresAt,
    scopes: scopes(payload.scope, input.session.scopes)
  }
}

export function missingSpotifyScopes(session: SpotifySession): string[] {
  const granted = new Set(session.scopes)
  return SPOTIFY_SCOPES.filter((scope) => !granted.has(scope))
}

export function refreshSpotifySessionCoordinated(input: {
  session: SpotifySession
  config: SpotifyServerConfig
  fetcher?: typeof fetch
  now?: () => number
}): Promise<SpotifySession> {
  const currentTime = Date.now()
  const existing = refreshFlights.get(input.session.sessionId)
  if (existing && existing.expiresAt > currentTime) return existing.promise
  if (existing) refreshFlights.delete(input.session.sessionId)

  const promise = refreshSpotifySession(input)
  const flight: RefreshFlight = {
    promise,
    expiresAt: currentTime + REFRESH_FLIGHT_GRACE_MS
  }
  refreshFlights.set(input.session.sessionId, flight)

  void promise.then(() => {
    const timer = setTimeout(() => {
      if (refreshFlights.get(input.session.sessionId) === flight) {
        refreshFlights.delete(input.session.sessionId)
      }
    }, REFRESH_FLIGHT_GRACE_MS)
    timer.unref?.()
  }, () => {
    if (refreshFlights.get(input.session.sessionId) === flight) {
      refreshFlights.delete(input.session.sessionId)
    }
  })

  return promise
}

export async function ensureFreshSpotifySession(input: {
  session: SpotifySession
  config: SpotifyServerConfig
  fetcher?: typeof fetch
  now?: () => number
}): Promise<{ session: SpotifySession; refreshed: boolean }> {
  const now = (input.now ?? Date.now)()
  if (input.session.refreshExpiresAt <= now) {
    throw new SpotifyTokenError("invalid_grant", 401, "Spotify authorization has expired.")
  }
  if (input.session.expiresAt - now > ACCESS_TOKEN_REFRESH_WINDOW_MS) {
    return { session: input.session, refreshed: false }
  }
  return {
    session: await refreshSpotifySessionCoordinated(input),
    refreshed: true
  }
}
