import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MapPackLibrary, type MapPackInput } from "@/lib/storage/map-pack-library"

describe("rider map-pack library", () => {
  let library: MapPackLibrary

  beforeEach(() => {
    library = new MapPackLibrary(`switchback-map-packs-${crypto.randomUUID()}`)
  })

  afterEach(async () => {
    await library.destroy()
  })

  it("saves canonical presets and bounded rollback fields, newest first", async () => {
    const first = await library.save({
      name: "Gravel scouting",
      preset: "terrain",
      lightPreference: "auto",
      routeVisibility: "high-contrast",
      layers: [{ id: "unpaved", visible: true, opacity: 0.55, order: 0 }]
    })
    const second = await library.save({
      name: "Storm route",
      preset: "road",
      lightPreference: "night",
      routeVisibility: "standard",
      layers: [{ id: "weather", visible: true, opacity: 0.75, order: 0 }]
    })

    expect((await library.list()).map((pack) => pack.id)).toEqual([second.id, first.id])
    const savedFirst = await library.get(first.id)
    expect(savedFirst).toMatchObject({
      name: "Gravel scouting",
      preset: "terrain",
      experience: "terrain",
      mapStyle: "explorer",
      lightPreference: "auto",
      routeVisibility: "high-contrast",
      layers: [expect.objectContaining({ id: "gravel-atlas", opacity: 0.55 })]
    })
    expect(savedFirst?.layers).toHaveLength(1)
    expect(second).toMatchObject({
      preset: "road",
      experience: "standard",
      mapStyle: "night",
      lightPreference: "night"
    })
  })

  it("keeps Satellite exact in canonical and premium rollback fields", async () => {
    const satellite = await library.save({
      name: "Imagery",
      preset: "satellite",
      lightPreference: "auto",
      routeVisibility: "standard",
      layers: []
    })

    expect(satellite).toMatchObject({
      preset: "satellite",
      experience: "satellite",
      mapStyle: "explorer",
      lightPreference: "auto"
    })
  })

  it("requires exactly one canonical or legacy map choice", () => {
    // @ts-expect-error A save without preset or legacy experience is ambiguous.
    const missingChoice: MapPackInput = {
      name: "Missing map choice",
      lightPreference: "auto",
      routeVisibility: "standard",
      layers: []
    }
    const competingChoices: MapPackInput = {
      name: "Competing map choices",
      preset: "road",
      // @ts-expect-error A save must not carry competing canonical and legacy choices.
      experience: "terrain",
      lightPreference: "auto",
      routeVisibility: "standard",
      layers: []
    }

    expect([missingChoice, competingChoices]).toHaveLength(2)
  })

  it("rejects blank map-pack names before writing local storage", async () => {
    await expect(library.save({
      name: "  ",
      preset: "road",
      lightPreference: "auto",
      routeVisibility: "standard",
      layers: []
    })).rejects.toThrow(/name/i)
    expect(await library.list()).toEqual([])
  })
})
