import {
  SPOTIFY_OAUTH_COOKIE,
  appendSetCookies,
  clearSpotifyOAuthCookie,
  openSpotifyCookie,
  readRequestCookie,
  type SpotifyAuthState,
  type SpotifyServerConfig,
  type SpotifySession
} from "@/lib/spotify/server/session"
import { type SpotifyAuthResult } from "@/lib/spotify/auth-outcome"
import { exchangeSpotifyAuthorizationCode, SpotifyTokenError } from "@/lib/spotify/server/token"
import { issueSpotifyHandoff } from "@/lib/spotify/server/handoff"

const OAUTH_FLOW_MAX_AGE_MS = 10 * 60 * 1000

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

function jsonError(
  code: string,
  message: string,
  status: number,
  config: SpotifyServerConfig
): Response {
  const response = Response.json({ error: { code, message } }, {
    status,
    headers: { "cache-control": "no-store", pragma: "no-cache" }
  })
  return appendSetCookies(response, [clearSpotifyOAuthCookie(config.secureCookies)])
}

function redirectToApp(
  flow: SpotifyAuthState,
  result: SpotifyAuthResult,
  config: SpotifyServerConfig,
  handoff?: string
): Response {
  const target = new URL(flow.returnTo, new URL(config.redirectUri).origin)
  target.searchParams.set("spotify", result)
  if (handoff) target.hash = new URLSearchParams({ spotify_handoff: handoff }).toString()
  const response = new Response(null, {
    status: 303,
    headers: {
      location: target.toString(),
      "cache-control": "no-store",
      pragma: "no-cache",
      "referrer-policy": "no-referrer"
    }
  })
  return appendSetCookies(response, [clearSpotifyOAuthCookie(config.secureCookies)])
}

function callbackFailureResult(error: unknown): Exclude<SpotifyAuthResult, "access_denied" | "connected"> {
  if (error instanceof SpotifyTokenError) {
    if (error.code === "invalid_client") return "client_configuration_failed"
    if (error.code === "invalid_grant") return "authorization_failed"
  }
  return "connection_failed"
}

function isAuthState(value: unknown): value is SpotifyAuthState {
  if (!value || typeof value !== "object") return false
  const flow = value as Partial<SpotifyAuthState>
  return typeof flow.codeVerifier === "string"
    && flow.codeVerifier.length >= 43
    && typeof flow.state === "string"
    && flow.state.length > 0
    && typeof flow.returnTo === "string"
    && flow.returnTo.startsWith("/")
    && !flow.returnTo.startsWith("//")
    && typeof flow.createdAt === "number"
}

export async function handleSpotifyCallback(
  request: Request,
  options: {
    config: SpotifyServerConfig
    fetcher?: typeof fetch
    now?: () => number
    handoffIssuer?: (session: SpotifySession) => string
  }
): Promise<Response> {
  const requestUrl = new URL(request.url)
  const sealedFlow = readRequestCookie(request, SPOTIFY_OAUTH_COOKIE)
  if (!sealedFlow) {
    return jsonError("SPOTIFY_FLOW_MISSING", "Spotify sign-in expired. Start it again.", 400, options.config)
  }

  let flow: SpotifyAuthState
  try {
    const value = await openSpotifyCookie(sealedFlow, options.config.sessionSecret, "oauth")
    if (!isAuthState(value)) throw new Error("Invalid OAuth state")
    flow = value
  } catch {
    return jsonError("SPOTIFY_FLOW_INVALID", "Spotify sign-in could not be verified.", 400, options.config)
  }

  const now = (options.now ?? Date.now)()
  if (now - flow.createdAt > OAUTH_FLOW_MAX_AGE_MS || flow.createdAt > now + 60_000) {
    return jsonError("SPOTIFY_FLOW_EXPIRED", "Spotify sign-in expired. Start it again.", 400, options.config)
  }

  const state = requestUrl.searchParams.get("state") ?? ""
  if (!constantTimeEqual(state, flow.state)) {
    return jsonError("SPOTIFY_STATE_MISMATCH", "Spotify sign-in state did not match.", 400, options.config)
  }

  const authorizationError = requestUrl.searchParams.get("error")
  if (authorizationError) {
    return redirectToApp(
      flow,
      authorizationError === "access_denied" ? "access_denied" : "authorization_failed",
      options.config
    )
  }

  const code = requestUrl.searchParams.get("code")
  if (!code) {
    return redirectToApp(flow, "authorization_failed", options.config)
  }

  try {
    const session = await exchangeSpotifyAuthorizationCode({
      code,
      codeVerifier: flow.codeVerifier,
      config: options.config,
      fetcher: options.fetcher,
      now: options.now
    })
    const handoff = (options.handoffIssuer ?? issueSpotifyHandoff)(session)
    console.info("[spotify] OAuth callback completed", { result: "connected" })
    return redirectToApp(flow, "connected", options.config, handoff)
  } catch (error) {
    const result = callbackFailureResult(error)
    console.error("[spotify] OAuth code exchange failed", {
      code: error instanceof SpotifyTokenError ? error.code : "unknown",
      status: error instanceof SpotifyTokenError ? error.status : undefined
    })
    return redirectToApp(flow, result, options.config)
  }
}
