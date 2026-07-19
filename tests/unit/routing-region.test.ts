import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "../..")

describe("default routing region", () => {
  it("builds a PA plus New Jersey graph so cross-river stops stay routable", () => {
    const config = readFileSync(resolve(root, "infra/graphhopper/config.yml"), "utf8")
    const bootstrap = readFileSync(resolve(root, "scripts/bootstrap-data.sh"), "utf8")
    const launcher = readFileSync(resolve(root, "scripts/graphhopper.sh"), "utf8")

    expect(config).toContain("data/pa-nj-motorcycle.osm.pbf")
    expect(bootstrap).toContain("new-jersey-latest.osm.pbf")
    expect(bootstrap).toContain("osmium merge")
    expect(launcher).toContain("-Xmx4g")
  })
})
