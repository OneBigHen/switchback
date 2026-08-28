import { describe, expect, it } from "vitest"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { atlasPathColor, curvatureRampColor, readAtlasArt } from "@/lib/gpx/atlas"

describe("route atlas curvature ramp", () => {
  it("uses one typed ramp for normalized poster heat and legacy curvature bands", () => {
    const givenHeat = 0.8

    const whenColoringPosterGeometry = curvatureRampColor(givenHeat)

    expect(whenColoringPosterGeometry).toBe("#e07a2e")
    expect(atlasPathColor({ band: "hairpin" })).toBe(curvatureRampColor(0.875))
  })

  it("falls back to the calm anchor for non-finite heat", () => {
    expect(curvatureRampColor(Number.NaN)).toBe("#5c7c99")
    expect(atlasPathColor({ band: "calm", heat: Number.NaN })).toBe(curvatureRampColor(0.125))
  })

  it("ignores malformed persisted art instead of exposing unsafe SVG data", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "switchback-atlas-"))
    try {
      await writeFile(path.join(root, "atlas.json"), JSON.stringify({
        routes: {
          valid: { paths: [{ band: "twisty", heat: 0.7, d: "M 8 8 L 92 117" }] },
          empty: { paths: [] },
          invalid: { paths: [{ band: "twisty", heat: "hot", d: "M 8 8" }] }
        }
      }))

      const art = await readAtlasArt(root)

      expect(Object.keys(art)).toEqual(["valid"])
      expect(art.valid?.paths[0]?.d).toBe("M 8 8 L 92 117")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
