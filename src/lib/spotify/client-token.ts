import { browserRequestSignal } from "@/lib/client/request-timeout"

interface TokenPayload {
  accessToken: string
  expiresAt: number
}

export class SpotifyClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "SpotifyClientError"
  }
}

function isTokenPayload(value: unknown): value is TokenPayload {
  if (!value || typeof value !== "object") return false
  const token = value as Partial<TokenPayload>
  return typeof token.accessToken === "string"
    && token.accessToken.length > 0
    && typeof token.expiresAt === "number"
    && Number.isFinite(token.expiresAt)
}

export class SpotifyBrowserTokenClient {
  private cached: TokenPayload | null = null
  private pending: Promise<string> | null = null

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private handoff: string | null = null
  ) {}

  invalidate(): void {
    this.cached = null
  }

  async accessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - Date.now() > 60_000) {
      return this.cached.accessToken
    }
    if (this.pending) return this.pending

    const headers = new Headers({ accept: "application/json" })
    if (this.handoff) headers.set("x-switchback-spotify-handoff", this.handoff)
    this.pending = this.fetcher("/api/spotify/token", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers,
      signal: browserRequestSignal(10_000)
    }).then(async (response) => {
      const payload: unknown = await response.json().catch(() => null)
      if (response.ok) this.handoff = null
      if (!response.ok) {
        const error = payload && typeof payload === "object" && "error" in payload
          ? payload.error as { code?: unknown; message?: unknown }
          : null
        throw new SpotifyClientError(
          response.status,
          typeof error?.code === "string" ? error.code : "SPOTIFY_TOKEN_FAILED",
          typeof error?.message === "string" ? error.message : "Spotify authorization is unavailable."
        )
      }
      if (!isTokenPayload(payload)) {
        throw new SpotifyClientError(502, "SPOTIFY_TOKEN_INVALID", "Spotify returned an invalid browser token.")
      }
      this.cached = payload
      return payload.accessToken
    }).finally(() => {
      this.pending = null
    })
    return this.pending
  }
}
