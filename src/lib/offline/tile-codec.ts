import {
  validateOfflineGraphTileV2,
  type OfflineGraphTileV2
} from "./v2-contracts"

const MAGIC = new Uint8Array([0x53, 0x42, 0x47, 0x32]) // SBG2
const HEADER_BYTES = 8
const MAX_TILE_BYTES = 8 * 1024 * 1024

/**
 * Frame a validated tile as an immutable binary payload for storage/worker
 * transfer. The v2 JSON shape stays the compatibility payload inside the
 * frame; no semantic data is invented or lossy-compressed.
 */
export function encodeOfflineGraphTileBinary(tile: OfflineGraphTileV2): Uint8Array {
  if (!validateOfflineGraphTileV2(tile)) throw new Error("Offline graph tile is invalid")
  const payload = new TextEncoder().encode(JSON.stringify(tile))
  if (payload.byteLength > MAX_TILE_BYTES - HEADER_BYTES) {
    throw new Error("Offline graph tile exceeds the 8 MiB binary tile limit")
  }
  const result = new Uint8Array(HEADER_BYTES + payload.byteLength)
  result.set(MAGIC)
  new DataView(result.buffer).setUint32(4, payload.byteLength)
  result.set(payload, HEADER_BYTES)
  return result
}

export function decodeOfflineGraphTileBinary(bytes: Uint8Array): OfflineGraphTileV2 {
  if (bytes.byteLength < HEADER_BYTES || bytes.byteLength > MAX_TILE_BYTES) {
    throw new Error("Offline graph tile binary payload has an invalid size")
  }
  if (!MAGIC.every((value, index) => bytes[index] === value)) {
    throw new Error("Offline graph tile binary magic is invalid")
  }
  const payloadBytes = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4)
  if (payloadBytes !== bytes.byteLength - HEADER_BYTES) {
    throw new Error("Offline graph tile binary length is invalid")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(HEADER_BYTES)))
  } catch {
    throw new Error("Offline graph tile binary payload is not valid JSON")
  }
  if (!validateOfflineGraphTileV2(parsed)) throw new Error("Offline graph tile binary payload is corrupt")
  return parsed
}
