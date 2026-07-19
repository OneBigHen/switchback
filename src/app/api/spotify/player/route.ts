import { handleSpotifyRemotePlayer } from "./handler"
import { readSpotifyServerConfig, SpotifyConfigurationError } from "@/lib/spotify/server/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function handle(request: Request): Promise<Response> {
  try {
    return await handleSpotifyRemotePlayer(request, { config: readSpotifyServerConfig() })
  } catch (error) {
    if (error instanceof SpotifyConfigurationError) {
      return Response.json({
        error: { code: "SPOTIFY_NOT_CONFIGURED", message: "Spotify playback is not configured." }
      }, { status: 503, headers: { "cache-control": "no-store" } })
    }
    return Response.json({
      error: { code: "SPOTIFY_PLAYER_FAILED", message: "Spotify playback could not be controlled." }
    }, { status: 500, headers: { "cache-control": "no-store" } })
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request)
}

export async function POST(request: Request): Promise<Response> {
  return handle(request)
}
