import { buildSpotifyAuthorizationUrl, createPkcePair } from "@/lib/spotify/oauth"
import {
  appendSetCookies,
  sealSpotifyCookie,
  spotifyOAuthCookie,
  type SpotifyAuthState,
  type SpotifyServerConfig
} from "@/lib/spotify/server/session"

function safeReturnPath(request: Request): string {
  const candidate = new URL(request.url).searchParams.get("returnTo") ?? "/"
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/"
  try {
    const parsed = new URL(candidate, request.url)
    if (parsed.origin !== new URL(request.url).origin) return "/"
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return "/"
  }
}

export async function handleSpotifyLogin(
  request: Request,
  options: { config: SpotifyServerConfig; now?: () => number }
): Promise<Response> {
  const pkce = await createPkcePair()
  const flow: SpotifyAuthState = {
    codeVerifier: pkce.codeVerifier,
    state: pkce.state,
    returnTo: safeReturnPath(request),
    createdAt: (options.now ?? Date.now)()
  }
  const sealed = await sealSpotifyCookie(flow, options.config.sessionSecret, "oauth")
  const authorizationUrl = buildSpotifyAuthorizationUrl({
    clientId: options.config.clientId,
    redirectUri: options.config.redirectUri,
    state: pkce.state,
    codeChallenge: pkce.codeChallenge
  })
  const response = new Response(null, {
    status: 307,
    headers: {
      location: authorizationUrl.toString(),
      "cache-control": "no-store",
      pragma: "no-cache",
      "referrer-policy": "no-referrer"
    }
  })
  return appendSetCookies(response, [spotifyOAuthCookie(sealed, options.config.secureCookies)])
}
