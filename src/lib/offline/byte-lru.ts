export interface ByteLruStats {
  entries: number
  bytes: number
  maxBytes: number
}

interface ByteLruEntry<T> {
  value: T
  bytes: number
}

/** Small, deterministic LRU for decoded graph/RIG tiles. */
export class ByteLru<T> {
  private readonly entries = new Map<string, ByteLruEntry<T>>()
  private totalBytes = 0

  constructor(readonly maxBytes: number) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new Error("ByteLru maxBytes must be a positive safe integer")
    }
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: T, bytes: number): boolean {
    if (!Number.isSafeInteger(bytes) || bytes <= 0) {
      throw new Error("ByteLru entry bytes must be a positive safe integer")
    }
    this.delete(key)
    if (bytes > this.maxBytes) return false
    while (this.totalBytes + bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.delete(oldest)
    }
    this.entries.set(key, { value, bytes })
    this.totalBytes += bytes
    return true
  }

  delete(key: string): boolean {
    const entry = this.entries.get(key)
    if (!entry) return false
    this.entries.delete(key)
    this.totalBytes -= entry.bytes
    return true
  }

  clear(): void {
    this.entries.clear()
    this.totalBytes = 0
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  stats(): ByteLruStats {
    return {
      entries: this.entries.size,
      bytes: this.totalBytes,
      maxBytes: this.maxBytes
    }
  }
}
