import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { describe, expect, it } from "vitest"

import {
  validateOfflineGraphTileV2,
  validateOfflineRegionManifestV2
} from "@/lib/offline/v2-contracts"

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="switchback-test">
  <node id="1" lat="40.0000" lon="-76.0000" />
  <node id="2" lat="40.0010" lon="-75.9990" />
  <node id="3" lat="40.0020" lon="-75.9980" />
  <node id="4" lat="40.0010" lon="-75.9970" />
  <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><tag k="highway" v="residential"/><tag k="surface" v="asphalt"/></way>
  <way id="11"><nd ref="2"/><nd ref="4"/><tag k="highway" v="primary"/><tag k="oneway" v="yes"/></way>
  <way id="12"><nd ref="1"/><nd ref="4"/><tag k="highway" v="footway"/></way>
  <way id="13"><nd ref="3"/><nd ref="4"/><tag k="highway" v="service"/><tag k="access" v="private"/></way>
  <way id="14"><nd ref="3"/><nd ref="4"/><tag k="highway" v="secondary"/><tag k="access:conditional" v="no @ (snow)"/></way>
  <relation id="100"><member type="way" ref="10" role="from"/><member type="node" ref="2" role="via"/><member type="way" ref="11" role="to"/><tag k="type" v="restriction"/><tag k="restriction" v="no_right_turn"/></relation>
</osm>`

describe("offline PBF builder v2", () => {
  it("extracts every eligible road segment and restrictions without sampled routes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "switchback-pbf-builder-"))
    const xml = join(workspace, "fixture.osm")
    const pbf = join(workspace, "fixture.osm.pbf")
    const output = join(workspace, "output")
    await writeFile(xml, fixture)
    const convert = spawnSync("osmium", ["cat", xml, "-o", pbf], { encoding: "utf8" })
    expect(convert.status, convert.stderr).toBe(0)

    const build = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts", "build-offline-v2.mjs"), pbf, output, "fixture", "Fixture"],
      { encoding: "utf8", env: { ...process.env, SWITCHBACK_SOURCE_DATA_DATE: "2026-07-20T00:00:00Z" } }
    )
    expect(build.status, build.stderr).toBe(0)

    const { version } = JSON.parse(await readFile(join(output, "fixture", "active.json"), "utf8"))
    const manifest = JSON.parse(await readFile(join(output, "fixture", version, "manifest.json"), "utf8"))
    expect(validateOfflineRegionManifestV2(manifest)).toBe(true)

    const wayIds = new Set<string>()
    let edgeCount = 0
    let restrictionCount = 0
    for (const entry of manifest.tiles) {
      const compressed = join(output, "fixture", version, "tiles", `${entry.tileId}.json.zst`)
      const unzip = spawnSync("zstd", ["-q", "-d", "-c", compressed], { encoding: "utf8" })
      expect(unzip.status, unzip.stderr).toBe(0)
      const tile = JSON.parse(unzip.stdout)
      expect(validateOfflineGraphTileV2(tile)).toBe(true)
      edgeCount += tile.edges.length
      restrictionCount += tile.turnRestrictions.length
      for (const edge of tile.edges) wayIds.add(edge.osmWayId)
    }

    expect(edgeCount).toBe(5)
    expect(wayIds).toEqual(new Set(["10", "11"]))
    expect(restrictionCount).toBeGreaterThan(0)
    const report = JSON.parse(await readFile(join(output, "fixture", version, "build-report.json"), "utf8"))
    expect(report).toMatchObject({ eligibleWays: 2, rejectedConditionalWays: 1, rejectedAccessWays: 1 })
  }, 30_000)
})
