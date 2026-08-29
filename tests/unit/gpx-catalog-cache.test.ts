import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { clearCatalogCache, readDerivedCached, readJsonCached } from "@/lib/gpx/catalog-cache"

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

beforeEach(() => {
  clearCatalogCache()
})

async function fixtureFile(contents: unknown): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "switchback-catalog-cache-"))
  temporaryRoots.push(root)
  const filePath = path.join(root, "atlas.json")
  await writeFile(filePath, JSON.stringify(contents))
  return filePath
}

describe("GPX catalog cache", () => {
  it("reuses the previous parse while the file is unchanged", async () => {
    const filePath = await fixtureFile({ routes: { one: 1 } })
    const first = await readJsonCached(filePath)
    const second = await readJsonCached(filePath)
    expect(second).toBe(first)
  })

  it("re-reads once the file changes on disk", async () => {
    const filePath = await fixtureFile({ routes: { one: 1 } })
    const first = await readJsonCached(filePath)
    await writeFile(filePath, JSON.stringify({ routes: { one: 1, two: 2 } }))
    // Same size would still be caught by mtime; make both differ explicitly.
    await utimes(filePath, new Date(), new Date(Date.now() + 5_000))
    const second = await readJsonCached(filePath)
    expect(second).not.toBe(first)
    expect(second).toEqual({ routes: { one: 1, two: 2 } })
  })

  it("memoises a derivation and recomputes it after the file changes", async () => {
    const filePath = await fixtureFile({ routes: { one: 1 } })
    let derivations = 0
    const derive = (parsed: unknown) => {
      derivations += 1
      return Object.keys((parsed as { routes: Record<string, number> }).routes)
    }

    const first = await readDerivedCached(filePath, "keys", derive)
    const second = await readDerivedCached(filePath, "keys", derive)
    expect(second).toBe(first)
    expect(derivations).toBe(1)

    await writeFile(filePath, JSON.stringify({ routes: { one: 1, two: 2 } }))
    await utimes(filePath, new Date(), new Date(Date.now() + 5_000))
    const third = await readDerivedCached(filePath, "keys", derive)
    expect(derivations).toBe(2)
    expect(third).toEqual(["one", "two"])
  })

  it("keeps separate derivations of the same file apart", async () => {
    const filePath = await fixtureFile({ routes: { one: 1 } })
    const keys = await readDerivedCached(filePath, "keys", (parsed) => Object.keys((parsed as { routes: object }).routes))
    const count = await readDerivedCached(filePath, "count", (parsed) => Object.keys((parsed as { routes: object }).routes).length)
    expect(keys).toEqual(["one"])
    expect(count).toBe(1)
  })

  it("propagates a missing file so callers can fall back to an empty state", async () => {
    await expect(readJsonCached(path.join(os.tmpdir(), "switchback-absent-atlas.json"))).rejects.toThrow()
  })
})
