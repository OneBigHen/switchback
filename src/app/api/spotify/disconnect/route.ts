import {
  appendSetCookies,
  clearSpotifySessionCookie,
  readSpotifyServerConfig,
  SpotifyConfigurationError
} from "@/lib/spotify/server/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({
      error: { code: "SPOTIFY_ORIGIN_REJECTED", message: "Cross-site disconnect is not allowed." }
    }, { status: 403, headers: { "cache-control": "no-store" } })
  }
  let secure = new URL(request.url).protocol === "https:"
  try {
    secure = readSpotifyServerConfig().secureCookies
  } catch (error) {
    if (!(error instanceof SpotifyConfigurationError)) throw error
  }
  return appendSetCookies(
    new Response(null, { status: 204, headers: { "cache-control": "no-store" } }),
    [clearSpotifySessionCookie(secure)]
  )
}
