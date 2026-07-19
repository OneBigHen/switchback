import { handleSpotifyCallback } from "./handler"
import { readSpotifyServerConfig, SpotifyConfigurationError } from "@/lib/spotify/server/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  try {
    return await handleSpotifyCallback(request, { config: readSpotifyServerConfig() })
  } catch (error) {
    if (error instanceof SpotifyConfigurationError) {
      return Response.json({
        error: { code: "SPOTIFY_NOT_CONFIGURED", message: "Spotify playback is not configured." }
      }, { status: 503, headers: { "cache-control": "no-store" } })
    }
    return Response.json({
      error: { code: "SPOTIFY_CALLBACK_FAILED", message: "Spotify sign-in could not be completed." }
    }, { status: 500, headers: { "cache-control": "no-store" } })
  }
}
