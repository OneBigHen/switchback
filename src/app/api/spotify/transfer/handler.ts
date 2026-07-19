import { string, object_, safeParse } from "@/lib/validate"
import { SPOTIFY_TRANSFER_URL } from "@/lib/spotify/constants"
import {
  SPOTIFY_SESSION_COOKIE,
  appendSetCookies,
  clearSpotifySessionCookie,
  openSpotifyCookie,
  readRequestCookie,
  sealSpotifyCookie,
  spotifySessionCookie,
  type SpotifyServerConfig,
  type SpotifySession
} from "@/lib/spotify/server/session"
import {
  ensureFreshSpotifySession,
  isSpotifySession,
  missingSpotifyScopes,
  refreshSpotifySessionCoordinated,
  SpotifyTokenError
} from "@/lib/spotify/server/token"

const transferSchema = object_({
  deviceId: string({ trim: true, min: 1, max: 256 })
}, { strict: true })

function json(body: unknown, status: number, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      pragma: "no-cache",
      ...headers
    }
  })
}

async function transfer(
  session: SpotifySession,
  deviceId: string,
  fetcher: typeof fetch
): Promise<Response> {
  return fetcher(SPOTIFY_TRANSFER_URL, {
    method: "PUT",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000)
  })
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  return !origin || origin === new URL(request.url).origin
}

export async function handleSpotifyTransfer(
  request: Request,
  options: {
    config: SpotifyServerConfig
    fetcher?: typeof fetch
    now?: () => number
  }
): Promise<Response> {
  if (!sameOrigin(request)) {
    return json({ error: { code: "SPOTIFY_ORIGIN_REJECTED", message: "Cross-site playback control is not allowed." } }, 403)
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const parsed = safeParse(transferSchema, body)
  if (!parsed.success) {
    return json({ error: { code: "INVALID_SPOTIFY_DEVICE", message: "A valid Spotify device ID is required." } }, 400)
  }

  const sealed = readRequestCookie(request, SPOTIFY_SESSION_COOKIE)
  if (!sealed) {
    return json({ error: { code: "SPOTIFY_NOT_CONNECTED", message: "Connect Spotify before starting its player." } }, 401)
  }
  let stored: unknown
  try {
    stored = await openSpotifyCookie(sealed, options.config.sessionSecret, "session")
  } catch {
    const response = json({ error: { code: "SPOTIFY_REAUTH_REQUIRED", message: "Connect Spotify again." } }, 401)
    return appendSetCookies(response, [clearSpotifySessionCookie(options.config.secureCookies)])
  }
  if (!isSpotifySession(stored)) {
    const response = json({ error: { code: "SPOTIFY_REAUTH_REQUIRED", message: "Connect Spotify again." } }, 401)
    return appendSetCookies(response, [clearSpotifySessionCookie(options.config.secureCookies)])
  }
  if (missingSpotifyScopes(stored).length > 0) {
    const response = json({
      error: {
        code: "SPOTIFY_SCOPES_MISSING",
        message: "Spotify permissions changed. Connect again to approve playback access."
      }
    }, 403)
    return appendSetCookies(response, [clearSpotifySessionCookie(options.config.secureCookies)])
  }

  const fetcher = options.fetcher ?? fetch
  let activeSession = stored
  let refreshed = false
  try {
    const fresh = await ensureFreshSpotifySession({
      session: stored,
      config: options.config,
      fetcher,
      now: options.now
    })
    activeSession = fresh.session
    refreshed = fresh.refreshed
  } catch (error) {
    if (error instanceof SpotifyTokenError && error.code === "invalid_grant") {
      const response = json({ error: { code: "SPOTIFY_REAUTH_REQUIRED", message: "Connect Spotify again." } }, 401)
      return appendSetCookies(response, [clearSpotifySessionCookie(options.config.secureCookies)])
    }
    return json({ error: { code: "SPOTIFY_REFRESH_UNAVAILABLE", message: "Spotify authorization is temporarily unavailable." } }, 503)
  }

  let spotifyResponse: Response
  try {
    spotifyResponse = await transfer(activeSession, parsed.data.deviceId, fetcher)
    if (spotifyResponse.status === 401 && !refreshed) {
      activeSession = await refreshSpotifySessionCoordinated({
        session: activeSession,
        config: options.config,
        fetcher,
        now: options.now
      })
      refreshed = true
      spotifyResponse = await transfer(activeSession, parsed.data.deviceId, fetcher)
    }
  } catch (error) {
    if (error instanceof SpotifyTokenError && error.code === "invalid_grant") {
      const response = json({ error: { code: "SPOTIFY_REAUTH_REQUIRED", message: "Connect Spotify again." } }, 401)
      return appendSetCookies(response, [clearSpotifySessionCookie(options.config.secureCookies)])
    }
    return json({ error: { code: "SPOTIFY_TRANSFER_UNAVAILABLE", message: "The Spotify player could not be activated." } }, 503)
  }

  let response: Response
  if (spotifyResponse.ok) {
    response = new Response(null, { status: 204, headers: { "cache-control": "no-store" } })
  } else if (spotifyResponse.status === 401) {
    response = json({ error: { code: "SPOTIFY_REAUTH_REQUIRED", message: "Connect Spotify again." } }, 401)
    return appendSetCookies(response, [clearSpotifySessionCookie(options.config.secureCookies)])
  } else if (spotifyResponse.status === 403) {
    const payload: unknown = await spotifyResponse.json().catch(() => null)
    const spotifyMessage = payload && typeof payload === "object" && "error" in payload
      && payload.error && typeof payload.error === "object" && "message" in payload.error
      ? String(payload.error.message)
      : ""
    const premiumRequired = /premium/i.test(spotifyMessage)
    response = json({
      error: premiumRequired
        ? { code: "SPOTIFY_PREMIUM_REQUIRED", message: "Spotify Premium is required for browser playback." }
        : {
          code: "SPOTIFY_ACCESS_DENIED",
          message: "This Spotify account is not authorized for this Development Mode app or playback permission."
        }
    }, 403)
  } else if (spotifyResponse.status === 429) {
    response = json({
      error: { code: "SPOTIFY_RATE_LIMITED", message: "Spotify is rate limiting playback changes. Try again shortly." }
    }, 429, spotifyResponse.headers.get("retry-after")
      ? { "retry-after": spotifyResponse.headers.get("retry-after")! }
      : {})
  } else {
    response = json({
      error: { code: "SPOTIFY_TRANSFER_FAILED", message: "Spotify did not accept this browser player." }
    }, 502)
  }

  if (!refreshed) return response
  const refreshedCookie = await sealSpotifyCookie(activeSession, options.config.sessionSecret, "session")
  return appendSetCookies(response, [spotifySessionCookie(refreshedCookie, options.config.secureCookies)])
}
