import { describe, expect, it } from "vitest"
import {
  atlasIntegrityProblems,
  atlasSourceFingerprint,
} from "../../scripts/lib/route-atlas-integrity.mjs"

const manifest = {
  version: 2,
  routes: [
    { id: "alpha", name: "Alpha" },
    { id: "beta", name: "Beta" },
  ],
}

const manifestRaw = JSON.stringify(manifest)
const routeSources = new Map([
  ["alpha", '{"id":"alpha","geometry":[[-75,40],[-74.9,40.1]]}'],
  ["beta", '{"id":"beta","geometry":[[-76,41],[-75.9,41.1]]}'],
])
const fingerprint = atlasSourceFingerprint(manifestRaw, manifest.routes, routeSources)

function atlas(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    count: 2,
    sourceFingerprint: fingerprint,
    routes: {
      alpha: { bbox: [-75, 40, -74.9, 40.1] },
      beta: { bbox: [-76, 41, -75.9, 41.1] },
    },
    ...overrides,
  }
}

describe("route atlas deployment integrity", () => {
  it("accepts an atlas generated from the current route sources", () => {
    expect(atlasIntegrityProblems({ manifest, atlas: atlas(), expectedFingerprint: fingerprint })).toEqual([])
  })

  it("accepts folded duplicate routes while keeping every manifest id addressable", () => {
    const folded = atlas({
      count: 1,
      routes: {
        alpha: { bbox: [-75, 40, -74.9, 40.1] },
        beta: { bbox: [-76, 41, -75.9, 41.1], duplicateOf: "alpha" },
      },
    })
    expect(atlasIntegrityProblems({ manifest, atlas: folded, expectedFingerprint: fingerprint })).toEqual([])
  })

  it("rejects stale source fingerprints", () => {
    expect(atlasIntegrityProblems({
      manifest,
      atlas: atlas({ sourceFingerprint: "stale" }),
      expectedFingerprint: fingerprint,
    })).toContain("atlas source fingerprint does not match current GPX library")
  })

  it("rejects missing or malformed bounding boxes needed by near-me", () => {
    const broken = atlas({
      routes: {
        alpha: { bbox: [-75, 40, -74.9, 40.1] },
        beta: { bbox: [-75.9, 41.1, -76, 41] },
      },
    })
    expect(atlasIntegrityProblems({ manifest, atlas: broken, expectedFingerprint: fingerprint }))
      .toContain("atlas route beta has an invalid bbox")
  })

  it("rejects route sets that drift from the manifest", () => {
    const broken = atlas({ count: 1, routes: { alpha: { bbox: [-75, 40, -74.9, 40.1] } } })
    const problems = atlasIntegrityProblems({ manifest, atlas: broken, expectedFingerprint: fingerprint })
    expect(problems).toContain("atlas route count 1 does not match manifest count 2")
    expect(problems).toContain("atlas is missing route beta")
  })
})
