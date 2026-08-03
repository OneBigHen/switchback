import { DatabaseSync } from "node:sqlite"
import type { CorridorHint } from "@/lib/ai/corridor-adviser"
import type { RideCharacter } from "@/lib/ai/ride-intent"
import type { Waypoint } from "@/lib/routing/types"

/**
 * Phase 5: seven-day corridor-hint cache.
 *
 * Successful normalized hints are cached in a small server-only SQLite table
 * keyed by coarse ride intent (rounded endpoints, target rounded to the
 * nearest 15 minutes, ride character) — never API keys or raw user prompt
 * text. SQLite failure degrades to an in-memory cache so research never
 * fails routing.
 */

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface CorridorCache {
  get(key: string): CorridorHint[] | undefined
  set(key: string, hints: CorridorHint[]): void
}

interface CacheRow {
  hints: string
  expires_at: number
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}

export function corridorCacheKey(input: {
  start: Waypoint
  finish: Waypoint
  targetMinutes: number
  character: RideCharacter
}): string {
  const roundedTarget = Math.round(input.targetMinutes / 15) * 15
  return JSON.stringify({
    start: [round(input.start.lat, 2), round(input.start.lon, 2)],
    finish: [round(input.finish.lat, 2), round(input.finish.lon, 2)],
    targetMinutes: roundedTarget,
    character: input.character
  })
}

export function createCorridorCache(
  databasePath: string,
  options: { ttlMs?: number } = {}
): CorridorCache {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const memory = new Map<string, { hints: CorridorHint[]; expiresAt: number }>()
  let database: DatabaseSync | null = null
  try {
    database = new DatabaseSync(databasePath)
    database.exec(`
      create table if not exists corridor_hints (
        key text primary key,
        hints text not null,
        created_at integer not null,
        expires_at integer not null
      )
    `)
  } catch {
    database = null
  }

  const getFromDatabase = (key: string): CorridorHint[] | undefined => {
    if (!database) return undefined
    try {
      const row = database.prepare("select hints, expires_at from corridor_hints where key = ?")
        .get(key) as CacheRow | undefined
      if (!row) return undefined
      if (row.expires_at <= Date.now()) {
        database.prepare("delete from corridor_hints where key = ?").run(key)
        return undefined
      }
      const hints = JSON.parse(row.hints) as CorridorHint[]
      return Array.isArray(hints) ? hints : undefined
    } catch {
      return undefined
    }
  }

  return {
    get(key) {
      const memoryHit = memory.get(key)
      if (memoryHit) {
        if (memoryHit.expiresAt > Date.now()) return memoryHit.hints
        memory.delete(key)
      }
      const hints = getFromDatabase(key)
      if (hints) memory.set(key, { hints, expiresAt: Date.now() + ttlMs })
      return hints
    },
    set(key, hints) {
      memory.set(key, { hints, expiresAt: Date.now() + ttlMs })
      if (!database) return
      try {
        database.prepare(`
          insert into corridor_hints (key, hints, created_at, expires_at)
          values (?, ?, ?, ?)
          on conflict(key) do update set
            hints = excluded.hints,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        `).run(key, JSON.stringify(hints), Date.now(), Date.now() + ttlMs)
      } catch {
        // In-memory cache remains authoritative for this process.
      }
    }
  }
}
