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

const routeSources = new Map([
  ["alpha", '{"id":"alpha","geometry":[[-75,40],[-74.9,40.1]]}'],
  ["beta", '{"id":"beta","geometry":[[-76,41],[-75.9,41.1]]}'],
])

function atlas(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    count: 2,
    sourceFingerprint: atlasSourceFingerprint(JSON.stringify(manifest), manifest.routes, routeSources),
    routes: [
      { id: "alpha", bbox: [-75, 40, -74.9, 40.1] },
      { id: "beta", bbox: [-76, 41, -75.9, 41.1] },
    ],
    ...overrides,
  }
}

describe("route atlas deployment integrity", () => {
  it("accepts an atlas generated from the current route sources", () => {
    expect(atlasIntegrityProblems({
      manifest,
      atlas: atlas(),
      expectedFingerprint: atlas().sourceFingerprint as string,
    })).toEqual([])
  })

  it("rejects stale source fingerprints", () => {
    expect(atlasIntegrityProblems({
      manifest,
      atlas: atlas({ sourceFingerprint: "stale" }),
      expectedFingerprint: atlas().sourceFingerprint as string,
    })).toContain("atlas source fingerprint does not match current GPX library")
  })

  it("rejects missing or malformed bounding boxes needed by near-me", () => {
    const broken = atlas({
      routes: [
        { id: "alpha", bbox: [-75, 40, -74.9, 40.1] },
        { id: "beta", bbox: [-75.9, 41.1, -76, 41] },
      ],
    })
    expect(atlasIntegrityProblems({
      manifest,
      atlas: broken,
      expectedFingerprint: broken.sourceFingerprint as string,
    })).toContain("atlas route beta has an invalid bbox")
  })

  it("rejects route sets that drift from the manifest", () => {
    const broken = atlas({ count: 1, routes: [{ id: "alpha", bbox: [-75, 40, -74.9, 40.1] }] })
    const problems = atlasIntegrityProblems({
      manifest,
      atlas: broken,
      expectedFingerprint: broken.sourceFingerprint as string,
    })
    expect(problems).toContain("atlas count 1 does not match manifest count 2")
    expect(problems).toContain("atlas is missing route beta")
  })
})
