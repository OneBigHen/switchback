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
import { consumeSpotifyHandoff, SPOTIFY_HANDOFF_HEADER } from "@/lib/spotify/server/handoff"
import {
  ensureFreshSpotifySession,
  isSpotifySession,
  missingSpotifyScopes,
  SpotifyTokenError
} from "@/lib/spotify/server/token"

function responseHeaders(): HeadersInit {
  return {
    "cache-control": "private, no-store, max-age=0",
    pragma: "no-cache",
    vary: "Cookie"
  }
}

function unauthorized(code: string, config: SpotifyServerConfig): Response {
  const response = Response.json({
    error: { code, message: "Connect Spotify again to use the in-ride player." }
  }, { status: 401, headers: responseHeaders() })
  return appendSetCookies(response, [clearSpotifySessionCookie(config.secureCookies)])
}

export async function handleSpotifyToken(
  request: Request,
  options: {
    config: SpotifyServerConfig
    fetcher?: typeof fetch
    now?: () => number
    handoffResolver?: (handoff: string) => SpotifySession | null | Promise<SpotifySession | null>
  }
): Promise<Response> {
  const sealed = readRequestCookie(request, SPOTIFY_SESSION_COOKIE)
  let stored: unknown
  let establishedFromHandoff = false
  if (sealed) {
    try {
      stored = await openSpotifyCookie(sealed, options.config.sessionSecret, "session")
    } catch {
      return unauthorized("SPOTIFY_SESSION_INVALID", options.config)
    }
  } else {
    const handoff = request.headers.get(SPOTIFY_HANDOFF_HEADER)?.trim()
    if (!handoff) return unauthorized("SPOTIFY_NOT_CONNECTED", options.config)
    stored = await (options.handoffResolver ?? consumeSpotifyHandoff)(handoff)
    if (!stored) return unauthorized("SPOTIFY_NOT_CONNECTED", options.config)
    establishedFromHandoff = true
  }
  if (!isSpotifySession(stored)) return unauthorized("SPOTIFY_SESSION_INVALID", options.config)
  if (missingSpotifyScopes(stored).length > 0) {
    const response = Response.json({
      error: {
        code: "SPOTIFY_SCOPES_MISSING",
        message: "Spotify permissions changed. Connect again to approve playback access."
      }
    }, { status: 403, headers: responseHeaders() })
    return appendSetCookies(response, [clearSpotifySessionCookie(options.config.secureCookies)])
  }

  try {
    const result = await ensureFreshSpotifySession({
      session: stored,
      config: options.config,
      fetcher: options.fetcher,
      now: options.now
    })
    const response = Response.json({
      accessToken: result.session.accessToken,
      expiresAt: result.session.expiresAt
    }, { headers: responseHeaders() })
    console.info("[spotify] browser token delivered", {
      outcome: "issued",
      refreshed: result.refreshed
    })
    if (!result.refreshed && !establishedFromHandoff) return response
    const refreshedCookie = await sealSpotifyCookie(result.session, options.config.sessionSecret, "session")
    return appendSetCookies(response, [spotifySessionCookie(refreshedCookie, options.config.secureCookies)])
  } catch (error) {
    if (error instanceof SpotifyTokenError && error.code === "invalid_grant") {
      return unauthorized("SPOTIFY_REAUTH_REQUIRED", options.config)
    }
    return Response.json({
      error: {
        code: "SPOTIFY_REFRESH_UNAVAILABLE",
        message: "Spotify could not refresh this player right now."
      }
    }, { status: 503, headers: responseHeaders() })
  }
}
