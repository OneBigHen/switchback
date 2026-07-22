import { describe, expect, it } from "vitest"

import {
  CLASSIFY_LEGACY_COMPATIBLE_SCHEMA_VERSIONS,
  OFFLINE_GRAPH_SCHEMA_V2,
  classifyLegacyOfflineBundle,
  validateOfflineGraphTileV2,
  validateOfflineRegionManifestV2,
  validateInstalledRegionVersion,
  type OfflineBounds,
  OfflineGraphEdgeV2,
  OfflineGraphNodeV2,
  OfflineGraphTileV2,
  OfflineRegionManifestV2,
  OfflineTurnRestriction,
  InstalledRegionVersion
} from "@/lib/offline/v2-contracts"

function validBounds(): OfflineBounds {
  return { minLon: -78, minLat: 39, maxLon: -76, maxLat: 41 }
}

function validNode(id: string, lon: number, lat: number): OfflineGraphNodeV2 {
  return { id, coordinate: [lon, lat] }
}

function validEdge(
  id: string,
  from: string,
  to: string
): OfflineGraphEdgeV2 {
  return {
    id,
    fromNodeId: from,
    toNodeId: to,
    geometry: [
      [0, 0],
      [0.0001, 0]
    ],
    osmWayId: "100",
    motorcycleAccess: "permitted",
    access: "permitted",
    roadClass: "tertiary",
    surface: "asphalt",
    profileWeights: { quick: 1, twisty: 1, scenic: 1, adventure: 1 },
    uncertainty: []
  }
}

function validTile(): OfflineGraphTileV2 {
  return {
    schemaVersion: OFFLINE_GRAPH_SCHEMA_V2,
    tileId: "tile-1",
    bounds: validBounds(),
    nodes: [validNode("n1", 0, 0), validNode("n2", 0.0001, 0)],
    edges: [validEdge("e1", "n1", "n2")],
    turnRestrictions: []
  }
}

function validManifest(tileId: string): OfflineRegionManifestV2 {
  return {
    schemaVersion: OFFLINE_GRAPH_SCHEMA_V2,
    regionId: "pennsylvania",
    regionName: "Pennsylvania",
    version: "2026-01-01-a1b2c3",
    compression: "gzip-json",
    buildDate: "2026-01-01T00:00:00Z",
    sourceDataDate: "2025-12-01T00:00:00Z",
    snapshotUrl: "https://example.com/snapshot.osm.pbf",
    sourceUrl: "https://example.com/source",
    bounds: validBounds(),
    checksums: {
      inventorySha256: "a".repeat(64)
    },
    attribution: "© OpenStreetMap contributors",
    tiles: [
      {
        tileId,
        bounds: validBounds(),
        bytes: 1024,
        sha256: "c".repeat(64),
        nodeCount: 2,
        edgeCount: 1
      }
    ],
    tileByteTotal: 1024
  }
}

describe("offline v2 contracts - constants", () => {
  it("exports schema version 2", () => {
    expect(OFFLINE_GRAPH_SCHEMA_V2).toBe(2)
  })

  it("exposes supported legacy-compatible schema versions", () => {
    expect(Array.isArray(CLASSIFY_LEGACY_COMPATIBLE_SCHEMA_VERSIONS)).toBe(true)
    expect(CLASSIFY_LEGACY_COMPATIBLE_SCHEMA_VERSIONS).not.toContain(2)
  })
})

describe("validateOfflineGraphTileV2 - valid tile", () => {
  it("accepts a well-formed tile", () => {
    expect(validateOfflineGraphTileV2(validTile())).toBe(true)
  })

  it("accepts a tile with optional smoothness/trackType/maxSpeedKph", () => {
    const tile = validTile()
    tile.edges[0].smoothness = "good"
    tile.edges[0].trackType = "grade1"
    tile.edges[0].maxSpeedKph = 80
    expect(validateOfflineGraphTileV2(tile)).toBe(true)
  })
})

describe("validateOfflineGraphTileV2 - rejections", () => {
  it("rejects wrong schema version", () => {
    const tile = validTile()
    ;(tile as { schemaVersion: number }).schemaVersion = 3
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects corrupt tile id", () => {
    const tile = validTile()
    ;(tile as { tileId: string }).tileId = "  "
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects inverted bounds", () => {
    const tile = validTile()
    tile.bounds = { minLon: -76, minLat: 41, maxLon: -78, maxLat: 39 }
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects non-finite bounds", () => {
    const tile = validTile()
    tile.bounds = {
      minLon: Number.NaN,
      minLat: 39,
      maxLon: -76,
      maxLat: 41
    }
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects empty node id", () => {
    const tile = validTile()
    tile.nodes[0].id = ""
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects non-string node id", () => {
    const tile = validTile()
    ;(tile as { nodes: unknown[] }).nodes[0] = {
      id: 5,
      coordinate: [0, 0]
    }
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects bad node coordinate length", () => {
    const tile = validTile()
    ;(tile.nodes[0] as { coordinate: number[] }).coordinate = [0]
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects non-finite node coordinate", () => {
    const tile = validTile()
    tile.nodes[0].coordinate = [0, Number.POSITIVE_INFINITY]
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects duplicate node ids", () => {
    const tile = validTile()
    tile.nodes[1].id = "n1"
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects edge with empty id", () => {
    const tile = validTile()
    tile.edges[0].id = ""
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects edge referencing a missing fromNode", () => {
    const tile = validTile()
    tile.edges[0].fromNodeId = "missing"
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects edge referencing a missing toNode", () => {
    const tile = validTile()
    tile.edges[0].toNodeId = "missing"
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects geometry with < 2 points", () => {
    const tile = validTile()
    tile.edges[0].geometry = [[0, 0]]
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects geometry with non-finite coordinate", () => {
    const tile = validTile()
    tile.edges[0].geometry = [
      [0, 0],
      [Number.NaN, 0.0001]
    ]
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects duplicate edge ids", () => {
    const tile = validTile()
    tile.edges.push({ ...validEdge("e1", "n1", "n2") })
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects numeric OSM identifiers that are not JSON-safe strings", () => {
    const tile = validTile()
    ;(tile.edges[0] as { osmWayId: unknown }).osmWayId = 100
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects negative quick profileWeight", () => {
    const tile = validTile()
    tile.edges[0].profileWeights.quick = -1
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects non-finite twisty profileWeight", () => {
    const tile = validTile()
    tile.edges[0].profileWeights.twisty = Number.POSITIVE_INFINITY
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects missing profile weight keys", () => {
    const tile = validTile()
    ;(tile.edges[0] as { profileWeights: unknown }).profileWeights = {
      quick: 1,
      twisty: 1,
      scenic: 1
    }
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects negative osmWayId", () => {
    const tile = validTile()
    tile.edges[0].osmWayId = "-5"
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects non-decimal osmWayId shape", () => {
    const tile = validTile()
    ;(tile.edges[0] as { osmWayId: unknown }).osmWayId = "way-100"
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })
})

describe("validateOfflineGraphTileV2 - turn restrictions", () => {
  it("accepts a valid no_turn restriction", () => {
    const tile = validTile()
    // Add a third node and edges so from/via/to all exist
    tile.nodes.push(validNode("n3", 0.0002, 0))
    tile.edges.push(validEdge("e2", "n2", "n3"))
    const r: OfflineTurnRestriction = {
      incomingEdgeId: "e1",
      viaNodeId: "n2",
      outgoingEdgeId: "e2",
      restriction: "no_turn"
    }
    tile.turnRestrictions = [r]
    expect(validateOfflineGraphTileV2(tile)).toBe(true)
  })

  it("accepts an only_turn restriction with sourceRelationId", () => {
    const tile = validTile()
    tile.nodes.push(validNode("n3", 0.0002, 0))
    tile.edges.push(validEdge("e2", "n2", "n3"))
    tile.turnRestrictions = [
      {
        incomingEdgeId: "e1",
        viaNodeId: "n2",
        outgoingEdgeId: "e2",
        restriction: "only_turn",
        sourceRelationId: "999"
      }
    ]
    expect(validateOfflineGraphTileV2(tile)).toBe(true)
  })

  it("rejects restriction with unknown incoming edge", () => {
    const tile = validTile()
    tile.nodes.push(validNode("n3", 0.0002, 0))
    tile.edges.push(validEdge("e2", "n2", "n3"))
    tile.turnRestrictions = [
      {
        incomingEdgeId: "ghost",
        viaNodeId: "n2",
        outgoingEdgeId: "e2",
        restriction: "no_turn"
      }
    ]
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects restriction with unknown via node", () => {
    const tile = validTile()
    tile.nodes.push(validNode("n3", 0.0002, 0))
    tile.edges.push(validEdge("e2", "n2", "n3"))
    tile.turnRestrictions = [
      {
        incomingEdgeId: "e1",
        viaNodeId: "ghost",
        outgoingEdgeId: "e2",
        restriction: "no_turn"
      }
    ]
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects restriction where via node does not touch incoming edge", () => {
    const tile = validTile()
    tile.nodes.push(validNode("n3", 0.0002, 0))
    tile.edges.push(validEdge("e2", "n2", "n3"))
    // viaNode = n1, but e1 is from n1 -> n2, so n1 is the fromNode, not the meeting point
    tile.turnRestrictions = [
      {
        incomingEdgeId: "e1",
        viaNodeId: "n1",
        outgoingEdgeId: "e2",
        restriction: "no_turn"
      }
    ]
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects restriction with invalid kind", () => {
    const tile = validTile()
    tile.nodes.push(validNode("n3", 0.0002, 0))
    tile.edges.push(validEdge("e2", "n2", "n3"))
    tile.turnRestrictions = [
      {
        incomingEdgeId: "e1",
        viaNodeId: "n2",
        outgoingEdgeId: "e2",
        restriction: "u_turn" as unknown as "no_turn"
      }
    ]
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })

  it("rejects duplicate restriction signatures", () => {
    const tile = validTile()
    tile.nodes.push(validNode("n3", 0.0002, 0))
    tile.edges.push(validEdge("e2", "n2", "n3"))
    const r: OfflineTurnRestriction = {
      incomingEdgeId: "e1",
      viaNodeId: "n2",
      outgoingEdgeId: "e2",
      restriction: "no_turn"
    }
    tile.turnRestrictions = [r, { ...r }]
    expect(validateOfflineGraphTileV2(tile)).toBe(false)
  })
})

describe("validateOfflineGraphTileV2 - unknown input", () => {
  it("rejects null input", () => {
    expect(validateOfflineGraphTileV2(null)).toBe(false)
  })

  it("rejects array input", () => {
    expect(validateOfflineGraphTileV2([])).toBe(false)
  })

  it("rejects string input", () => {
    expect(validateOfflineGraphTileV2("not a tile")).toBe(false)
  })
})

describe("validateOfflineRegionManifestV2", () => {
  it("accepts a well-formed manifest", () => {
    expect(validateOfflineRegionManifestV2(validManifest("tile-1"))).toBe(true)
  })

  it("rejects wrong schemaVersion", () => {
    const m = validManifest("tile-1")
    ;(m as { schemaVersion: number }).schemaVersion = 1
    expect(validateOfflineRegionManifestV2(m)).toBe(false)
  })

  it("rejects empty regionId", () => {
    const m = validManifest("tile-1")
    m.regionId = " "
    expect(validateOfflineRegionManifestV2(m)).toBe(false)
  })

  it("requires an immutable version and supported compression", () => {
    const missingVersion = validManifest("tile-1")
    missingVersion.version = ""
    expect(validateOfflineRegionManifestV2(missingVersion)).toBe(false)

    const wrongCompression = validManifest("tile-1")
    ;(wrongCompression as { compression: string }).compression = "zstd-json"
    expect(validateOfflineRegionManifestV2(wrongCompression)).toBe(false)
  })

  it("rejects bad manifest sha256", () => {
    const m = validManifest("tile-1")
    m.checksums.inventorySha256 = "nothex"
    expect(validateOfflineRegionManifestV2(m)).toBe(false)
  })

  it("rejects tile with bad sha256", () => {
    const m = validManifest("tile-1")
    m.tiles[0].sha256 = "zz"
    expect(validateOfflineRegionManifestV2(m)).toBe(false)
  })

  it("rejects a tile without valid spatial bounds", () => {
    const m = validManifest("tile-1")
    m.tiles[0].bounds.minLon = 200
    expect(validateOfflineRegionManifestV2(m)).toBe(false)
  })

  it("rejects a tile-byte total that disagrees with inventory", () => {
    const m = validManifest("tile-1")
    m.tileByteTotal = 1025
    expect(validateOfflineRegionManifestV2(m)).toBe(false)
  })

  it("rejects tile with non-finite bytes", () => {
    const m = validManifest("tile-1")
    m.tiles[0].bytes = Number.NaN
    expect(validateOfflineRegionManifestV2(m)).toBe(false)
  })

  it("rejects tile with negative nodeCount", () => {
    const m = validManifest("tile-1")
    m.tiles[0].nodeCount = -1
    expect(validateOfflineRegionManifestV2(m)).toBe(false)
  })

  it("rejects empty attribution", () => {
    const m = validManifest("tile-1")
    m.attribution = ""
    expect(validateOfflineRegionManifestV2(m)).toBe(false)
  })

  it("rejects empty tile inventory", () => {
    const m = validManifest("tile-1")
    m.tiles = []
    expect(validateOfflineRegionManifestV2(m)).toBe(false)
  })

  it("rejects null input", () => {
    expect(validateOfflineRegionManifestV2(null)).toBe(false)
  })
})

describe("validateInstalledRegionVersion", () => {
  function validInstalled(): InstalledRegionVersion {
    return {
      regionId: "pa",
      pending: undefined,
      active: {
        schemaVersion: OFFLINE_GRAPH_SCHEMA_V2,
        version: "2026.1.1",
        installedAt: "2026-01-02T00:00:00Z",
        manifestSha256: "a".repeat(64)
      },
      previous: undefined,
      lifecycle: "active"
    }
  }

  it("accepts active-only install", () => {
    expect(validateInstalledRegionVersion(validInstalled())).toBe(true)
  })

  it("accepts pending + active", () => {
    const v = validInstalled()
    v.pending = {
      schemaVersion: OFFLINE_GRAPH_SCHEMA_V2,
      version: "2026.1.2",
      installedAt: "2026-01-03T00:00:00Z",
      manifestSha256: "b".repeat(64)
    }
    v.lifecycle = "pending"
    expect(validateInstalledRegionVersion(v)).toBe(true)
  })

  it("accepts active + previous", () => {
    const v = validInstalled()
    v.previous = {
      schemaVersion: OFFLINE_GRAPH_SCHEMA_V2,
      version: "2025.12.1",
      installedAt: "2025-12-15T00:00:00Z",
      manifestSha256: "c".repeat(64)
    }
    expect(validateInstalledRegionVersion(v)).toBe(true)
  })

  it("rejects empty regionId", () => {
    const v = validInstalled()
    v.regionId = ""
    expect(validateInstalledRegionVersion(v)).toBe(false)
  })

  it("rejects lifecycle with no active slot", () => {
    const v = validInstalled()
    v.active = undefined
    v.lifecycle = "pending"
    expect(validateInstalledRegionVersion(v)).toBe(false)
  })

  it("rejects unknown lifecycle", () => {
    const v = validInstalled()
    ;(v as { lifecycle: string }).lifecycle = "broken"
    expect(validateInstalledRegionVersion(v)).toBe(false)
  })

  it("rejects bad manifest sha256 on active install slot", () => {
    const v = validInstalled()
    v.active!.manifestSha256 = "short"
    expect(validateInstalledRegionVersion(v)).toBe(false)
  })

  it("rejects null input", () => {
    expect(validateInstalledRegionVersion(null)).toBe(false)
  })
})

describe("classifyLegacyOfflineBundle", () => {
  it("preserves v1 corridor packs as legacy_corridor", () => {
    const result = classifyLegacyOfflineBundle({
      kind: "corridor",
      schemaVersion: 1,
      routeId: "r1"
    })
    expect(result.kind).toBe("legacy_corridor")
    expect(result.consumable).toBe(true)
  })

  it("labels v1 regional bundles as update_required", () => {
    const result = classifyLegacyOfflineBundle({
      kind: "region",
      schemaVersion: 1,
      regionId: "pa"
    })
    expect(result.kind).toBe("update_required")
    expect(result.consumable).toBe(false)
  })

  it("labels unknown v1 bundle shapes as update_required", () => {
    const result = classifyLegacyOfflineBundle({
      kind: "mystery",
      schemaVersion: 1
    })
    expect(result.kind).toBe("update_required")
    expect(result.consumable).toBe(false)
  })

  it("labels v2 bundles as update_required (not silently v2)", () => {
    const result = classifyLegacyOfflineBundle({
      kind: "region",
      schemaVersion: 2
    })
    expect(result.kind).toBe("update_required")
    expect(result.consumable).toBe(false)
  })

  it("labels future schema versions as update_required", () => {
    const result = classifyLegacyOfflineBundle({
      kind: "region",
      schemaVersion: 99
    })
    expect(result.kind).toBe("update_required")
    expect(result.consumable).toBe(false)
  })

  it("rejects null input as update_required", () => {
    const result = classifyLegacyOfflineBundle(null)
    expect(result.kind).toBe("update_required")
    expect(result.consumable).toBe(false)
  })

  it("rejects non-object input as update_required", () => {
    const result = classifyLegacyOfflineBundle("nope")
    expect(result.kind).toBe("update_required")
    expect(result.consumable).toBe(false)
  })
})
