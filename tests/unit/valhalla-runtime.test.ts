import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const compose = readFileSync(
  resolve(process.cwd(), "infra/valhalla/compose.yml"),
  "utf8"
)

describe("Valhalla runtime contract", () => {
  it("pins the verified image and exposes the provider on loopback only", () => {
    expect(compose).toContain(
      "ghcr.io/valhalla/valhalla@sha256:c781b28bf7b2cf8dd713f0d5934848cedb6fadcb7a1a935fa2861e39c862290f"
    )
    expect(compose).toContain('"127.0.0.1:8002:8002"')
    expect(compose).toMatch(/healthcheck:[\s\S]*\/status/)
  })

  it("builds from the same Pennsylvania and New Jersey motorcycle extract as GraphHopper", () => {
    expect(compose).toContain("../../data/pa-nj-motorcycle.osm.pbf")
    expect(compose).toContain("/custom_files/pa-nj-motorcycle.osm.pbf:ro")
    expect(compose).toContain("switchback_valhalla_3_8_2_pa_nj")
  })

  it("builds administrative and timezone data before routing tiles", () => {
    expect(compose).toContain("valhalla_build_admins")
    expect(compose).toContain("valhalla_build_timezones")
    expect(compose.indexOf("valhalla_build_admins")).toBeLessThan(
      compose.indexOf("valhalla_build_tiles")
    )
    expect(compose.indexOf("valhalla_build_timezones")).toBeLessThan(
      compose.indexOf("valhalla_build_tiles")
    )
  })
})
