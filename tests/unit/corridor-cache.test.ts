import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { corridorCacheKey, createCorridorCache } from "@/lib/server/corridor-cache"
import type { CorridorHint } from "@/lib/ai/corridor-adviser"

const hint: CorridorHint = {
  id: "hint-1",
  name: "River Road",
  anchorQuery: "River Road, Bucks County PA",
  anchor: { lat: 40.35, lon: -75.1 },
  tollRisk: "possible",
  rationale: "Consistent sweepers along the Delaware.",
  sourceUrls: ["https://example.test/river-road"]
}

function intent(overrides: Partial<Parameters<typeof corridorCacheKey>[0]> = {}) {
  return {
    start: { lat: 40.1745, lon: -75.1059 },
    finish: { lat: 40.4082, lon: -74.9792 },
    targetMinutes: 120,
    character: "fun" as const,
    ...overrides
  }
}

describe("corridor cache", () => {
  it("stores and retrieves hints from SQLite", async () => {
    const dir = await mkdtemp(join(tmpdir(), "corridor-cache-"))
    try {
      const cache = createCorridorCache(join(dir, "cache.sqlite"))
      const key = corridorCacheKey(intent())
      cache.set(key, [hint])
      expect(cache.get(key)).toEqual([hint])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("expires entries after the configured TTL", async () => {
    const dir = await mkdtemp(join(tmpdir(), "corridor-cache-"))
    try {
      const cache = createCorridorCache(join(dir, "cache.sqlite"), { ttlMs: 5 })
      const key = corridorCacheKey(intent())
      cache.set(key, [hint])
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(cache.get(key)).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("separates cache keys by coarse ride intent", () => {
    expect(corridorCacheKey(intent())).not.toBe(corridorCacheKey(intent({ character: "scenic" })))
    expect(corridorCacheKey(intent())).not.toBe(corridorCacheKey(intent({ targetMinutes: 90 })))
    // Target rounding to the nearest 15 minutes keeps nearby requests on one key.
    expect(corridorCacheKey(intent({ targetMinutes: 122 }))).toBe(corridorCacheKey(intent({ targetMinutes: 120 })))
    // Endpoint rounding to two decimals keeps nearby starts on one key.
    expect(corridorCacheKey(intent({
      start: { lat: 40.17451, lon: -75.10589 }
    }))).toBe(corridorCacheKey(intent()))
  })

  it("degrades to in-memory caching when the database path is unusable", async () => {
    const dir = await mkdtemp(join(tmpdir(), "corridor-cache-"))
    try {
      // A directory path cannot be opened as a SQLite database.
      const cache = createCorridorCache(dir)
      const key = corridorCacheKey(intent())
      cache.set(key, [hint])
      expect(cache.get(key)).toEqual([hint])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
