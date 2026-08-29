import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MapPackLibrary } from "@/lib/storage/map-pack-library"

describe("rider map-pack library", () => {
  let library: MapPackLibrary

  beforeEach(() => {
    library = new MapPackLibrary(`switchback-map-packs-${crypto.randomUUID()}`)
  })

  afterEach(async () => {
    await library.destroy()
  })

  it("saves a named, locally owned layer configuration and returns newest first", async () => {
    const first = await library.save({
      name: "Gravel scouting",
      experience: "terrain",
      lightPreference: "auto",
      routeVisibility: "high-contrast",
      layers: [{ id: "unpaved", visible: true, opacity: 0.55, order: 0 }]
    })
    const second = await library.save({
      name: "Storm route",
      experience: "standard",
      lightPreference: "night",
      routeVisibility: "standard",
      layers: [{ id: "weather", visible: true, opacity: 0.75, order: 0 }]
    })

    expect((await library.list()).map((pack) => pack.id)).toEqual([second.id, first.id])
    expect(await library.get(first.id)).toMatchObject({
      name: "Gravel scouting",
      experience: "terrain",
      lightPreference: "auto",
      routeVisibility: "high-contrast",
      layers: expect.arrayContaining([expect.objectContaining({ id: "unpaved", opacity: 0.55 })])
    })
  })

  it("rejects blank map-pack names before writing local storage", async () => {
    await expect(library.save({
      name: "  ",
      experience: "standard",
      lightPreference: "auto",
      routeVisibility: "standard",
      layers: []
    })).rejects.toThrow(/name/i)
    expect(await library.list()).toEqual([])
  })
})
