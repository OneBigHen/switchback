import { describe, expect, it } from "vitest"
import { decodeOfflineGraphTileBinary, encodeOfflineGraphTileBinary } from "@/lib/offline/tile-codec"
import type { OfflineGraphTileV2 } from "@/lib/offline/v2-contracts"

const tile: OfflineGraphTileV2 = {
  schemaVersion: 2,
  tileId: "binary-fixture",
  bounds: { minLon: -76.1, minLat: 39.9, maxLon: -75.9, maxLat: 40.1 },
  nodes: [
    { id: "a", coordinate: [-76, 40] },
    { id: "b", coordinate: [-75.99, 40] }
  ],
  edges: [{
    id: "ab",
    fromNodeId: "a",
    toNodeId: "b",
    geometry: [[-76, 40], [-75.99, 40]],
    osmWayId: "10",
    motorcycleAccess: "permitted",
    access: "permitted",
    roadClass: "tertiary",
    surface: "asphalt",
    profileWeights: { quick: 1, twisty: 1, scenic: 1, adventure: 1 },
    uncertainty: []
  }],
  turnRestrictions: []
}

describe("offline graph tile binary envelope", () => {
  it("round-trips a validated partition without changing graph facts", () => {
    const encoded = encodeOfflineGraphTileBinary(tile)
    expect(encoded).toBeInstanceOf(Uint8Array)
    expect([...encoded.slice(0, 4)]).toEqual([0x53, 0x42, 0x47, 0x32])
    expect(decodeOfflineGraphTileBinary(encoded)).toEqual(tile)
  })

  it("rejects a bad magic, length, or graph payload", () => {
    const encoded = encodeOfflineGraphTileBinary(tile)
    encoded[0] = 0
    expect(() => decodeOfflineGraphTileBinary(encoded)).toThrow(/magic/i)
    const corrupt = encodeOfflineGraphTileBinary(tile)
    new DataView(corrupt.buffer).setUint32(4, 1)
    expect(() => decodeOfflineGraphTileBinary(corrupt)).toThrow(/length/i)
  })
})
