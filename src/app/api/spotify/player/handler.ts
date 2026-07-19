import {
  string, number, boolean, nullable, optional, object_, array,
  url, safeParse, ValidationError, type Infer
} from "@/lib/validate"
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
import type {
  SpotifyRemoteCommand,
  SpotifyRemotePlaybackResponse,
  SpotifyRemoteState,
  SpotifyRemoteTrack
} from "@/lib/spotify/remote-player"

const SPOTIFY_PLAYER_URL = "https://api.spotify.com/v1/me/player"

const imageSchema = object_({
  url: url(),
  width: optional(nullable(number({ int: true }))),
  height: optional(nullable(number({ int: true })))
}, { passthrough: true })

const itemSchema = object_({
  id: optional(nullable(string())),
  uri: string({ min: 1 }),
  type: string({ min: 1 }),
  name: string({ min: 1 }),
  duration_ms: number({ int: true, nonnegative: true }),
  artists: optional(array(object_({ name: string() }, { passthrough: true }))),
  album: optional(object_({
    name: string(),
    images: array(imageSchema)
  }, { passthrough: true })),
  images: optional(array(imageSchema)),
  show: optional(object_({
    name: string(),
    publisher: optional(string())
  }, { passthrough: true }))
}, { passthrough: true })

const playbackSchema = object_({
  device: optional(nullable(object_({
    id: optional(nullable(string())),
    is_restricted: boolean(),
    name: string(),
    type: string(),
    volume_percent: optional(nullable(number({ int: true, min: 0, max: 100 }))),
    supports_volume: boolean()
  }, { passthrough: true }))),
  is_playing: boolean(),
  progress_ms: optional(nullable(number({ int: true, nonnegative: true }))),
  item: optional(nullable(itemSchema))
}, { passthrough: true })

const SIMPLE_COMMANDS = new Set(["play", "pause", "next", "previous"])

function parseCommand(body: unknown): SpotifyRemoteCommand {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Expected object", "", "type")
  }
  const obj = body as Record<string, unknown>
  const command = obj.command
  if (typeof command !== "string") {
    throw new ValidationError("Missing command field", "command", "missing")
  }
  if (SIMPLE_COMMANDS.has(command)) {
    return { command } as SpotifyRemoteCommand
  }
  if (command === "seek") {
    const positionMs = obj.positionMs
    if (typeof positionMs !== "number" || !Number.isInteger(positionMs) || positionMs < 0 || positionMs > 24 * 60 * 60 * 1000) {
      throw new ValidationError("Invalid positionMs", "positionMs", "invalid")
    }
    return { command: "seek", positionMs }
  }
  if (command === "volume") {
    const volumePercent = obj.volumePercent
    if (typeof volumePercent !== "number" || !Number.isInteger(volumePercent) || volumePercent < 0 || volumePercent > 100) {
      throw new ValidationError("Invalid volumePercent", "volumePercent", "invalid")
    }
    return { command: "volume", volumePercent }
  }
  throw new ValidationError(`Unknown command: ${command}`, "command", "enum")
}

type ItemData = Infer<typeof itemSchema>
type PlaybackData = Infer<typeof playbackSchema>

function responseHeaders(): HeadersInit {
  return { "cache-control": "private, no-store, max-age=0", pragma: "no-cache", vary: "Cookie" }
}

function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status, headers: responseHeaders() })
}

function clearSession(response: Response, config: SpotifyServerConfig): Response {
  return appendSetCookies(response, [clearSpotifySessionCookie(config.secureCookies)])
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  return !origin || origin === new URL(request.url).origin
}

async function requestSession(
  request: Request,
  options: { config: SpotifyServerConfig; fetcher?: typeof fetch; now?: () => number }
): Promise<{ session: SpotifySession; refreshed: boolean } | Response> {
  const sealed = readRequestCookie(request, SPOTIFY_SESSION_COOKIE)
  if (!sealed) return jsonError("SPOTIFY_NOT_CONNECTED", "Connect Spotify to use music controls.", 401)

  let stored: unknown
  try {
    stored = await openSpotifyCookie(sealed, options.config.sessionSecret, "session")
  } catch {
    return clearSession(jsonError("SPOTIFY_REAUTH_REQUIRED", "Connect Spotify again.", 401), options.config)
  }
  if (!isSpotifySession(stored)) {
    return clearSession(jsonError("SPOTIFY_REAUTH_REQUIRED", "Connect Spotify again.", 401), options.config)
  }
  if (missingSpotifyScopes(stored).length > 0) {
    return clearSession(jsonError(
      "SPOTIFY_SCOPES_MISSING",
      "Connect Spotify again to approve playback controls.",
      403
    ), options.config)
  }

  try {
    return await ensureFreshSpotifySession({
      session: stored,
      config: options.config,
      fetcher: options.fetcher,
      now: options.now
    })
  } catch (error) {
    if (error instanceof SpotifyTokenError && error.code === "invalid_grant") {
      return clearSession(jsonError("SPOTIFY_REAUTH_REQUIRED", "Connect Spotify again.", 401), options.config)
    }
    return jsonError("SPOTIFY_REFRESH_UNAVAILABLE", "Spotify authorization is temporarily unavailable.", 503)
  }
}

function spotifyRequestFor(command: SpotifyRemoteCommand | null): { url: URL; method: string } {
  const url = new URL(SPOTIFY_PLAYER_URL)
  if (!command) {
    url.searchParams.set("additional_types", "track,episode")
    return { url, method: "GET" }
  }
  switch (command.command) {
    case "play":
    case "pause":
      url.pathname += `/${command.command}`
      return { url, method: "PUT" }
    case "next":
    case "previous":
      url.pathname += `/${command.command}`
      return { url, method: "POST" }
    case "seek":
      url.pathname += "/seek"
      url.searchParams.set("position_ms", String(command.positionMs))
      return { url, method: "PUT" }
    case "volume":
      url.pathname += "/volume"
      url.searchParams.set("volume_percent", String(command.volumePercent))
      return { url, method: "PUT" }
  }
}

async function callSpotify(
  session: SpotifySession,
  request: { url: URL; method: string },
  fetcher: typeof fetch
): Promise<Response> {
  return fetcher(request.url, {
    method: request.method,
    headers: { accept: "application/json", authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000)
  })
}

function remoteTrack(item: ItemData): SpotifyRemoteTrack {
  const episodeCreator = item.show?.publisher ?? item.show?.name
  return {
    id: item.id ?? null,
    uri: item.uri,
    type: item.type,
    name: item.name,
    artists: item.artists?.map((artist: { name: string }) => artist.name) ?? (episodeCreator ? [episodeCreator] : []),
    album: {
      name: item.album?.name ?? item.show?.name ?? "Spotify",
      images: item.album?.images ?? item.images ?? []
    }
  }
}

function normalizePlayback(payload: PlaybackData): SpotifyRemotePlaybackResponse {
  if (!payload.device && !payload.item) return { active: false, state: null }
  const state: SpotifyRemoteState = {
    device: payload.device ? {
      id: payload.device.id ?? null,
      name: payload.device.name,
      type: payload.device.type,
      isRestricted: payload.device.is_restricted,
      volumePercent: payload.device.volume_percent ?? null,
      supportsVolume: payload.device.supports_volume
    } : null,
    isPlaying: payload.is_playing,
    position: payload.progress_ms ?? 0,
    duration: payload.item?.duration_ms ?? 0,
    track: payload.item ? remoteTrack(payload.item) : null
  }
  return { active: Boolean(payload.device), state }
}

async function spotifyFailure(response: Response, command: SpotifyRemoteCommand | null): Promise<Response> {
  if (response.status === 401) return jsonError("SPOTIFY_REAUTH_REQUIRED", "Connect Spotify again.", 401)
  if (response.status === 403) {
    return jsonError(
      command ? "SPOTIFY_PREMIUM_REQUIRED" : "SPOTIFY_ACCESS_DENIED",
      command
        ? "Spotify Premium is required for remote playback controls."
        : "Spotify did not allow playback-state access for this account.",
      403
    )
  }
  if (response.status === 404) {
    return jsonError("SPOTIFY_NO_ACTIVE_DEVICE", "Open Spotify and start a song once, then use these controls.", 409)
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after")
    const result = jsonError("SPOTIFY_RATE_LIMITED", "Spotify is rate limiting player updates.", 429)
    if (retryAfter) result.headers.set("retry-after", retryAfter)
    return result
  }
  return jsonError("SPOTIFY_PLAYER_FAILED", "Spotify did not accept the player request.", 502)
}

export async function handleSpotifyRemotePlayer(
  request: Request,
  options: { config: SpotifyServerConfig; fetcher?: typeof fetch; now?: () => number }
): Promise<Response> {
  if (request.method !== "GET" && !sameOrigin(request)) {
    return jsonError("SPOTIFY_ORIGIN_REJECTED", "Cross-site playback control is not allowed.", 403)
  }

  let command: SpotifyRemoteCommand | null = null
  if (request.method !== "GET") {
    const body: unknown = await request.json().catch(() => null)
    try {
      command = parseCommand(body)
    } catch {
      return jsonError("INVALID_SPOTIFY_COMMAND", "A valid Spotify player command is required.", 400)
    }
  }

  const authorized = await requestSession(request, options)
  if (authorized instanceof Response) return authorized
  const fetcher = options.fetcher ?? fetch
  const outbound = spotifyRequestFor(command)
  let activeSession = authorized.session
  let refreshed = authorized.refreshed
  let spotifyResponse: Response
  try {
    spotifyResponse = await callSpotify(activeSession, outbound, fetcher)
    if (spotifyResponse.status === 401 && !refreshed) {
      activeSession = await refreshSpotifySessionCoordinated({
        session: activeSession,
        config: options.config,
        fetcher,
        now: options.now
      })
      refreshed = true
      spotifyResponse = await callSpotify(activeSession, outbound, fetcher)
    }
  } catch (error) {
    if (error instanceof SpotifyTokenError && error.code === "invalid_grant") {
      return clearSession(jsonError("SPOTIFY_REAUTH_REQUIRED", "Connect Spotify again.", 401), options.config)
    }
    return jsonError("SPOTIFY_PLAYER_UNAVAILABLE", "Spotify's player is temporarily unavailable.", 503)
  }

  let response: Response
  if (command && spotifyResponse.ok) {
    response = new Response(null, { status: 204, headers: responseHeaders() })
  } else if (!command && spotifyResponse.status === 204) {
    response = Response.json({ active: false, state: null }, { headers: responseHeaders() })
  } else if (!command && spotifyResponse.ok) {
    const payload: unknown = await spotifyResponse.json().catch(() => null)
    const parsed = safeParse(playbackSchema, payload)
    response = parsed.success
      ? Response.json(normalizePlayback(parsed.data), { headers: responseHeaders() })
      : jsonError("SPOTIFY_STATE_INVALID", "Spotify returned an unreadable player state.", 502)
  } else {
    response = await spotifyFailure(spotifyResponse, command)
  }

  if (spotifyResponse.status === 401) return clearSession(response, options.config)
  if (!refreshed) return response
  const cookie = await sealSpotifyCookie(activeSession, options.config.sessionSecret, "session")
  return appendSetCookies(response, [spotifySessionCookie(cookie, options.config.secureCookies)])
}
