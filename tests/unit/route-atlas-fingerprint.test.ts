import { describe, expect, it } from "vitest"
import { atlasSourceFingerprint } from "../../scripts/lib/route-atlas-integrity.mjs"

describe("route atlas source fingerprint", () => {
  it("changes when route geometry changes", () => {
    const manifest = { routes: [{ id: "alpha" }] }
    const manifestRaw = JSON.stringify(manifest)
    const first = atlasSourceFingerprint(manifestRaw, manifest.routes, new Map([["alpha", '{"geometry":[[0,0],[1,1]]}']]))
    const second = atlasSourceFingerprint(manifestRaw, manifest.routes, new Map([["alpha", '{"geometry":[[0,0],[2,2]]}']]))
    expect(second).not.toBe(first)
  })
})
