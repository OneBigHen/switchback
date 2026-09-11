import { describe, expect, it } from "vitest"
import {
  selectGravelAtlasCorridors,
  type GravelAtlasCorridor,
  type GravelAtlasSelectionEnvelope
} from "@/lib/routing/gravel-atlas"
import type { Coordinate } from "@/lib/routing/types"

const start: Coordinate = [-75.20, 40.20]
const finish: Coordinate = [-75.00, 40.20]
const envelope: GravelAtlasSelectionEnvelope = {
  maxPathDistanceMiles: 30,
  maxLateralMiles: 10
}

function corridor(
  overrides: Partial<GravelAtlasCorridor> & Pick<GravelAtlasCorridor, "id">
): GravelAtlasCorridor {
  return {
    id: overrides.id,
    label: overrides.label ?? overrides.id,
    geometry: overrides.geometry ?? [
      [-75.16, 40.21],
      [-75.12, 40.22],
      [-75.08, 40.21]
    ],
    verifiedGravelMeters: overrides.verifiedGravelMeters ?? 8_000,
    longestContinuousGravelMeters: overrides.longestContinuousGravelMeters ?? 7_500,
    fragmentCount: overrides.fragmentCount ?? 1,
    confidence: overrides.confidence ?? 0.9,
    verification: overrides.verification ?? "routable",
    sourceIds: overrides.sourceIds ?? [`source-${overrides.id}`]
  }
}

describe("selectGravelAtlasCorridors", () => {
  it("never attracts routing toward an atlas corridor the live graph did not verify as routable", () => {
    const result = selectGravelAtlasCorridors({
      start,
      finish,
      envelope,
      corridors: [
        corridor({
          id: "tempting-but-unroutable",
          verification: "unroutable",
          verifiedGravelMeters: 80_000,
          longestContinuousGravelMeters: 80_000,
          confidence: 1
        }),
        corridor({ id: "verified" })
      ]
    })

    expect(result.map((candidate) => candidate.corridor.id)).toEqual(["verified"])
  })

  it("does not attract routing toward corridors outside the bounded planning envelope", () => {
    const result = selectGravelAtlasCorridors({
      start,
      finish,
      envelope,
      corridors: [
        corridor({
          id: "far-away",
          geometry: [
            [-78.9, 41.8],
            [-78.8, 41.9]
          ]
        }),
        corridor({ id: "nearby" })
      ]
    })

    expect(result.map((candidate) => candidate.corridor.id)).toEqual(["nearby"])
  })

  it("prefers one useful continuous gravel run over fragmented evidence with the same aggregate miles", () => {
    const result = selectGravelAtlasCorridors({
      start,
      finish,
      envelope,
      corridors: [
        corridor({
          id: "fragmented",
          verifiedGravelMeters: 12_000,
          longestContinuousGravelMeters: 2_000,
          fragmentCount: 6
        }),
        corridor({
          id: "continuous",
          verifiedGravelMeters: 12_000,
          longestContinuousGravelMeters: 10_000,
          fragmentCount: 1
        })
      ]
    })

    expect(result[0]?.corridor.id).toBe("continuous")
    expect(result[0]?.score).toBeGreaterThan(result[1]?.score ?? Number.NEGATIVE_INFINITY)
  })

  it("penalizes weak source confidence instead of treating every GPX line as equally trustworthy", () => {
    const result = selectGravelAtlasCorridors({
      start,
      finish,
      envelope,
      corridors: [
        corridor({ id: "weak", confidence: 0.15 }),
        corridor({ id: "strong", confidence: 0.95 })
      ]
    })

    expect(result[0]?.corridor.id).toBe("strong")
  })

  it("hard-caps the number of routing-attraction corridors", () => {
    const result = selectGravelAtlasCorridors({
      start,
      finish,
      envelope,
      maxCorridors: 3,
      corridors: Array.from({ length: 20 }, (_, index) => corridor({
        id: `corridor-${index.toString().padStart(2, "0")}`,
        confidence: 1 - index / 100
      }))
    })

    expect(result).toHaveLength(3)
  })

  it("breaks equal-score ties deterministically by stable atlas id", () => {
    const input = [corridor({ id: "zeta" }), corridor({ id: "alpha" })]

    const first = selectGravelAtlasCorridors({ start, finish, envelope, corridors: input })
    const second = selectGravelAtlasCorridors({ start, finish, envelope, corridors: [...input].reverse() })

    expect(first.map((candidate) => candidate.corridor.id)).toEqual(["alpha", "zeta"])
    expect(second.map((candidate) => candidate.corridor.id)).toEqual(["alpha", "zeta"])
  })

  it("returns shaping anchors copied from verified source geometry and never mutates the atlas corridor", () => {
    const source = corridor({ id: "immutable" })
    const before = structuredClone(source)

    const [selected] = selectGravelAtlasCorridors({
      start,
      finish,
      envelope,
      corridors: [source]
    })

    expect(source).toEqual(before)
    expect(selected?.anchors.length).toBeGreaterThan(0)
    for (const anchor of selected?.anchors ?? []) {
      expect(source.geometry).toContainEqual(anchor)
    }
  })

  it("fails closed for malformed confidence, distance, geometry, or selection bounds", () => {
    const malformed = [
      corridor({ id: "bad-confidence", confidence: Number.NaN }),
      corridor({ id: "bad-distance", verifiedGravelMeters: -1 }),
      corridor({ id: "bad-geometry", geometry: [[-75.1, 95] as Coordinate] })
    ]

    expect(selectGravelAtlasCorridors({ start, finish, envelope, corridors: malformed })).toEqual([])
    expect(selectGravelAtlasCorridors({ start, finish, envelope, corridors: [corridor({ id: "ok" })], maxCorridors: 0 })).toEqual([])
  })
})
