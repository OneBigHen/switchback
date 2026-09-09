import { describe, expect, it, vi } from "vitest"
import {
  mapboxRenderer,
  type PlannerMap
} from "@/components/planner/planner-map-renderer"
import { resolveMapPresentation } from "@/lib/client/map-experience"

interface FakeMapState {
  configCalls: Array<[string, string, unknown]>
  terrainCalls: unknown[]
  fogCalls: unknown[]
  easeTo: ReturnType<typeof vi.fn>
}

function fakeMap({ dem = true, pitch = 0 }: { dem?: boolean; pitch?: number } = {}): {
  map: PlannerMap
  state: FakeMapState
} {
  const state: FakeMapState = {
    configCalls: [],
    terrainCalls: [],
    fogCalls: [],
    easeTo: vi.fn()
  }

  const map = {
    setConfigProperty(importId: string, name: string, value: unknown) {
      state.configCalls.push([importId, name, value])
    },
    setTerrain(value: unknown) {
      state.terrainCalls.push(value)
    },
    setFog(value: unknown) {
      state.fogCalls.push(value)
    },
    getSource(id: string) {
      return dem && id === "mapbox-dem" ? { id } : undefined
    },
    getPitch() {
      return pitch
    },
    easeTo: state.easeTo
  } as unknown as PlannerMap

  return { map, state }
}

function configNames(calls: FakeMapState["configCalls"]): string[] {
  return calls.map(([, name]) => name)
}

describe("Mapbox planner presentation boundary", () => {
  it("reuses one style key for Road, Terrain, and lighting changes", () => {
    const roadDay = resolveMapPresentation({ preset: "road", surface: "plan", lightPreset: "day" })
    const roadNight = resolveMapPresentation({ preset: "road", surface: "plan", lightPreset: "night" })
    const terrain = resolveMapPresentation({ preset: "terrain", surface: "plan", lightPreset: "day" })
    const satellite = resolveMapPresentation({ preset: "satellite", surface: "plan", lightPreset: "day" })

    expect(mapboxRenderer.styleKey(roadDay)).toBe(mapboxRenderer.styleKey(roadNight))
    expect(mapboxRenderer.styleKey(roadDay)).toBe(mapboxRenderer.styleKey(terrain))
    expect(mapboxRenderer.styleKey(satellite)).not.toBe(mapboxRenderer.styleKey(roadDay))
  })

  it("emits the supported Standard basemap config contract", () => {
    const { map, state } = fakeMap()
    const presentation = resolveMapPresentation({ preset: "terrain", surface: "explore", lightPreset: "day" })

    mapboxRenderer.applyExperience(map, presentation)

    expect(configNames(state.configCalls)).toEqual([
      "lightPreset",
      "showTransitLabels",
      "showPlaceLabels",
      "showRoadLabels",
      "showPointOfInterestLabels",
      "theme",
      "show3dObjects"
    ])
    expect(state.configCalls.every(([importId]) => importId === "basemap")).toBe(true)
  })

  it("keeps unsupported theme and 3D config out of Standard Satellite", () => {
    const { map, state } = fakeMap()
    const presentation = resolveMapPresentation({ preset: "satellite", surface: "plan", lightPreset: "dusk" })

    mapboxRenderer.applyExperience(map, presentation)

    expect(configNames(state.configCalls)).toEqual([
      "lightPreset",
      "showTransitLabels",
      "showPlaceLabels",
      "showRoadLabels",
      "showPointOfInterestLabels"
    ])
  })

  it("applies relief and atmosphere only when requested and the DEM exists", () => {
    const relief = fakeMap()
    mapboxRenderer.applyExperience(
      relief.map,
      resolveMapPresentation({ preset: "terrain", surface: "explore", lightPreset: "day" })
    )

    expect(relief.state.terrainCalls.at(-1)).toEqual({ source: "mapbox-dem", exaggeration: 1.3 })
    expect(relief.state.fogCalls.at(-1)).not.toBeNull()

    const flat = fakeMap()
    mapboxRenderer.applyExperience(
      flat.map,
      resolveMapPresentation({ preset: "road", surface: "plan", lightPreset: "day" })
    )

    expect(flat.state.terrainCalls.at(-1)).toBeNull()
    expect(flat.state.fogCalls.at(-1)).toBeNull()

    const missingDem = fakeMap({ dem: false })
    mapboxRenderer.applyExperience(
      missingDem.map,
      resolveMapPresentation({ preset: "terrain", surface: "plan", lightPreset: "day" })
    )
    expect(missingDem.state.terrainCalls).toEqual([])
  })

  it("never changes the camera during Ride presentation", () => {
    const { map, state } = fakeMap({ pitch: 42 })
    mapboxRenderer.applyExperience(
      map,
      resolveMapPresentation({ preset: "terrain", surface: "ride", lightPreset: "night" })
    )

    expect(state.easeTo).not.toHaveBeenCalled()
  })
})
