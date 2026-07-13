import { describe, expect, it } from "vitest"
import { normalizeMotorcycleObject } from "../../scripts/lib/motorcycle-osm.mjs"

describe("motorcycle OSM normalization", () => {
  it("makes an explicit motorcycle restriction authoritative for the car parser", () => {
    const source = `  <way id="969576184" version="2" timestamp="2021-05-01T00:00:00Z">
    <nd ref="1"/>
    <nd ref="2"/>
    <tag k="highway" v="service"/>
    <tag k="motorcar" v="yes"/>
    <tag k="motorcycle" v="no"/>
  </way>`

    const normalized = normalizeMotorcycleObject(source)

    expect(normalized).toContain('<way id="969576184" version="3"')
    expect(normalized).toContain('<tag k="motorcycle" v="no"/>')
    expect(normalized).toContain('<tag k="motorcar" v="no"/>')
    expect(normalized).not.toContain('<tag k="motorcar" v="yes"/>')
  })

  it("lets an explicit motorcycle permission override a broader motor vehicle restriction", () => {
    const source = `  <way id="42" version="7">
    <nd ref="1"/>
    <nd ref="2"/>
    <tag k="highway" v="service"/>
    <tag k="motor_vehicle" v="no"/>
    <tag k="motorcycle" v="designated"/>
  </way>`

    const normalized = normalizeMotorcycleObject(source)

    expect(normalized).toContain('<tag k="motorcar" v="designated"/>')
    expect(normalized).toContain('<tag k="motor_vehicle" v="no"/>')
  })

  it("blocks conditional-only motorcycle access instead of treating it as always legal", () => {
    const source = `  <way id="43" version="1">
    <nd ref="1"/>
    <nd ref="2"/>
    <tag k="highway" v="motorway_link"/>
    <tag k="motor_vehicle" v="no"/>
    <tag k="motorcycle:conditional" v="yes @ (Mo-Fr 06:00-10:00)"/>
  </way>`

    const normalized = normalizeMotorcycleObject(source)

    expect(normalized).toContain('<tag k="motorcar" v="no"/>')
    expect(normalized).not.toContain('motorcar:conditional')
  })

  it("applies motorcycle access to barrier nodes", () => {
    const source = `  <node id="44" version="4" lat="40" lon="-76">
    <tag k="barrier" v="gate"/>
    <tag k="motorcar" v="yes"/>
    <tag k="motorcycle" v="private"/>
  </node>`

    const normalized = normalizeMotorcycleObject(source)

    expect(normalized).toContain('<node id="44" version="5"')
    expect(normalized).toContain('<tag k="motorcar" v="private"/>')
  })

  it("uses a motorcycle-specific oneway override when one is present", () => {
    const source = `  <way id="45" version="3">
    <nd ref="1"/>
    <nd ref="2"/>
    <tag k="highway" v="service"/>
    <tag k="oneway" v="yes"/>
    <tag k="oneway:motorcycle" v="no"/>
    <tag k="motorcycle" v="yes"/>
  </way>`

    const normalized = normalizeMotorcycleObject(source)

    expect(normalized).toContain('<tag k="oneway" v="no"/>')
    expect(normalized).not.toContain('<tag k="oneway" v="yes"/>')
  })
})
