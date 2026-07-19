import type { SpotifySession } from "./session"

export const SPOTIFY_HANDOFF_HEADER = "x-switchback-spotify-handoff"

const HANDOFF_TTL_MS = 2 * 60_000

interface SpotifyHandoff {
  session: SpotifySession
  expiresAt: number
}

type SpotifyHandoffGlobal = typeof globalThis & {
  __switchbackSpotifyHandoffsV1?: Map<string, SpotifyHandoff>
}

function handoffStore(): Map<string, SpotifyHandoff> {
  const scope = globalThis as SpotifyHandoffGlobal
  scope.__switchbackSpotifyHandoffsV1 ??= new Map<string, SpotifyHandoff>()
  return scope.__switchbackSpotifyHandoffsV1
}

function pruneExpiredHandoffs(now: number): void {
  const handoffs = handoffStore()
  for (const [id, handoff] of handoffs) {
    if (handoff.expiresAt <= now) handoffs.delete(id)
  }
}

export function issueSpotifyHandoff(session: SpotifySession, now = Date.now()): string {
  pruneExpiredHandoffs(now)
  const id = crypto.randomUUID()
  handoffStore().set(id, { session, expiresAt: now + HANDOFF_TTL_MS })
  return id
}

export function consumeSpotifyHandoff(id: string, now = Date.now()): SpotifySession | null {
  pruneExpiredHandoffs(now)
  const handoffs = handoffStore()
  const handoff = handoffs.get(id)
  if (!handoff) return null
  handoffs.delete(id)
  return handoff.session
}
