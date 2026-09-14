import { describe, expect, it } from "vitest"
import {
  catalogDisplayTitle,
  cleanImportedRouteTitle,
  looksLikeRawImportFilename
} from "@/lib/gpx/catalog-presentation"

describe("cleanImportedRouteTitle", () => {
  it("turns the approved ugly import example into a rider-facing title", () => {
    expect(cleanImportedRouteTitle("Green Lane-NJ-Bucks-Creek-Crossing-TRACK-CORRECTED"))
      .toBe("Green Lane → Bucks Creek Crossing")
  })

  it("drops trailing technical import markers", () => {
    expect(cleanImportedRouteTitle("Pine Creek Gorge-FINAL-v2")).toBe("Pine Creek Gorge")
    expect(cleanImportedRouteTitle("Michaux Loop-TRACK-CORRECTED-COPY")).toBe("Michaux Loop")
    expect(cleanImportedRouteTitle("Laurel Highlands_EDITED.gpx")).toBe("Laurel Highlands")
  })

  it("reads a state code as the separator between two named places", () => {
    expect(cleanImportedRouteTitle("Wellsboro-PA-Blackwell")).toBe("Wellsboro → Blackwell")
    expect(cleanImportedRouteTitle("Blairstown-NJ-High-Point")).toBe("Blairstown → High Point")
  })

  it("keeps a normal name alone rather than inventing an arrow", () => {
    expect(cleanImportedRouteTitle("Bald Eagle Dual Sport")).toBe("Bald Eagle Dual Sport")
    expect(cleanImportedRouteTitle("Armstrong County Loops")).toBe("Armstrong County Loops")
  })

  it("does not produce an empty title from an all-technical filename", () => {
    expect(cleanImportedRouteTitle("TRACK-CORRECTED.gpx")).toBe("TRACK-CORRECTED")
    expect(cleanImportedRouteTitle("   ")).toBe("")
  })

  it("recases shouting tokens without touching ordinary capitalisation", () => {
    expect(cleanImportedRouteTitle("HAWKS NEST RUN")).toBe("Hawks Nest Run")
    expect(cleanImportedRouteTitle("Hawks Nest Run")).toBe("Hawks Nest Run")
  })
})

describe("looksLikeRawImportFilename", () => {
  it("recognises filenames that should not be shown as titles", () => {
    expect(looksLikeRawImportFilename("Green Lane-NJ-Bucks-Creek-Crossing-TRACK-CORRECTED")).toBe(true)
    expect(looksLikeRawImportFilename("Delaware Water Gap Run.gpx")).toBe(true)
    expect(looksLikeRawImportFilename("000 Bald Eagle Dual Sport")).toBe(true)
  })

  it("accepts an ordinary rider-written title", () => {
    expect(looksLikeRawImportFilename("Bald Eagle Dual Sport")).toBe(false)
    expect(looksLikeRawImportFilename("Sunday morning Michaux loop")).toBe(false)
  })
})

describe("catalogDisplayTitle precedence", () => {
  const originalName = "Green Lane-NJ-Bucks-Creek-Crossing-TRACK-CORRECTED"

  it("prefers an explicit rider or public title above everything", () => {
    expect(catalogDisplayTitle({
      userTitle: "Sunday gravel to the creek",
      catalogTitle: "Green Lane Run",
      originalName
    })).toBe("Sunday gravel to the creek")
  })

  it("uses a strong catalog title when there is no explicit title", () => {
    expect(catalogDisplayTitle({ catalogTitle: "Green Lane Creek Crossing", originalName }))
      .toBe("Green Lane Creek Crossing")
  })

  it("ignores a catalog title that is still a raw filename", () => {
    expect(catalogDisplayTitle({ catalogTitle: originalName, originalName }))
      .toBe("Green Lane → Bucks Creek Crossing")
  })

  it("falls back to the cleaned import title", () => {
    expect(catalogDisplayTitle({ originalName })).toBe("Green Lane → Bucks Creek Crossing")
  })

  it("uses the original filename only as the final fallback", () => {
    expect(catalogDisplayTitle({ originalName: "TRACK-CORRECTED.gpx" })).toBe("TRACK-CORRECTED")
    expect(catalogDisplayTitle({ originalName: "   " })).toBe("Untitled route")
  })

  it("never mutates the provenance it was given", () => {
    const input = { originalName }
    catalogDisplayTitle(input)
    expect(input.originalName).toBe(originalName)
  })
})
