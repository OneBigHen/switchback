export const SPOTIFY_AUTH_RESULTS = [
  "access_denied",
  "authorization_failed",
  "client_configuration_failed",
  "connection_failed",
  "connected"
] as const

export type SpotifyAuthResult = (typeof SPOTIFY_AUTH_RESULTS)[number]

export const SPOTIFY_AUTH_CHANNEL = "switchback.spotify.authorization"
export const SPOTIFY_AUTH_STORAGE_KEY = "switchback.spotify.authorization-result.v1"

export interface SpotifyAuthNotification {
  type: typeof SPOTIFY_AUTH_CHANNEL
  result: SpotifyAuthResult
}

export function isSpotifyAuthResult(value: unknown): value is SpotifyAuthResult {
  return typeof value === "string" && (SPOTIFY_AUTH_RESULTS as readonly string[]).includes(value)
}

export function isSpotifyAuthNotification(value: unknown): value is SpotifyAuthNotification {
  if (!value || typeof value !== "object") return false
  const notification = value as Partial<SpotifyAuthNotification>
  return notification.type === SPOTIFY_AUTH_CHANNEL && isSpotifyAuthResult(notification.result)
}

export function spotifyAuthOutcomeMessage(outcome: string | null): string | null {
  switch (outcome) {
    case "connected":
      return "Spotify connected. Starting the browser player..."
    case "access_denied":
      return "Spotify permission was declined. Connect again when you are ready."
    case "authorization_failed":
      return "Spotify authorization expired or was rejected. Connect again to retry."
    case "client_configuration_failed":
      return "Spotify rejected this app configuration. Check the registered callback and Development Mode access."
    case "connection_failed":
      return "Spotify could not finish sign-in. Retry once; if it repeats, make sure this account is allowed for the app in Spotify Developer Dashboard."
    default:
      return null
  }
}
