import { readFile, stat } from "node:fs/promises"

/**
 * Parsed-JSON cache for the on-disk GPX catalog, keyed by each file's size and
 * mtime.
 *
 * The atlas is a few megabytes and the manifest a few hundred kilobytes, and
 * every Atlas page view reads both. Parsing and re-validating them per request
 * is by far the dominant cost of those pages, which are public and
 * deliberately uncacheable (`force-dynamic`). Keying on size+mtime means a
 * regenerated catalog is picked up on the next request without a restart.
 *
 * Cached values are shared, so callers must treat them as read-only.
 */

interface CacheEntry {
  readonly key: string
  readonly value: unknown
}

const entries = new Map<string, CacheEntry>()

async function readWithKey(filePath: string): Promise<CacheEntry> {
  const stats = await stat(filePath)
  const key = `${stats.size}:${stats.mtimeMs}`
  const cached = entries.get(filePath)
  if (cached && cached.key === key) return cached
  const entry: CacheEntry = { key, value: JSON.parse(await readFile(filePath, "utf8")) }
  entries.set(filePath, entry)
  return entry
}

/** Parse a JSON file, reusing the previous parse while the file is unchanged. */
export async function readJsonCached(filePath: string): Promise<unknown> {
  return (await readWithKey(filePath)).value
}

/**
 * Like `readJsonCached`, but also memoises an expensive derivation of the
 * parsed value (validation, filtering) under `derivationId`, so repeated
 * requests skip that work too.
 */
export async function readDerivedCached<T>(
  filePath: string,
  derivationId: string,
  derive: (parsed: unknown) => T
): Promise<T> {
  const source = await readWithKey(filePath)
  const derivedPath = `${filePath}::${derivationId}`
  const cached = entries.get(derivedPath)
  if (cached && cached.key === source.key) return cached.value as T
  const value = derive(source.value)
  entries.set(derivedPath, { key: source.key, value })
  return value
}

/** Test seam: drop every memoised parse and derivation. */
export function clearCatalogCache(): void {
  entries.clear()
}
