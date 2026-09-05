import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { LineLayerSpecification } from "maplibre-gl"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  RouteDecisionCard,
  buildRouteDecisionPresentation
} from "@/components/planner/v2/RouteDecisionCard"
import {
  getRoutePreviewId,
  setRoutePreviewId,
  subscribeRoutePreview
} from "@/components/planner/route-comparison-preview"
import {
  ROUTE_HIT_LAYER,
  SELECTED_ROUTE_HIT_LAYER,
  routeRibbonLayers
} from "@/components/planner/planner-map-layers"
import type { PlannerMapRenderer } from "@/components/planner/planner-map-renderer"
import { resolveMapExperience } from "@/lib/client/map-experience"
import { buildRouteFeatures } from "@/lib/client/map-data"
import type { PlannedRoute, RouteProfileId } from "@/lib/routing/types"

function route(
  id: string,
  profile: RouteProfileId,
  minutes: number,
  miles: number,
  twistiness: number,
  surfaceMix: Record<string, number> = { asphalt: 100 }
): PlannedRoute {
  return {
    id,
    name: `${profile} route`,
    profile,
    geometry: [[-76.88, 40.27], [-76.8, 40.33]],
    waypoints: [],
    instructions: [],
    distanceMiles: miles,
    durationMinutes: minutes,
    ascentMeters: 120,
    descentMeters: 110,
    twistiness,
    turnCount: 12,
    roadMix: { secondary: 80, primary: 20 },
    surfaceMix,
    routingSource: "live",
    previewOnly: false
  }
}

const routes = [
  route("balanced", "balanced", 62, 41.2, 55),
  route("twisty", "twisty", 71, 44.8, 91),
  route("scenic", "scenic", 76, 46.1, 72, { asphalt: 70, gravel: 30 })
]

afterEach(() => {
  cleanup()
  setRoutePreviewId(null)
})

describe("map-native route comparison", () => {
  it("compares each candidate to the currently selected route", () => {
    const selected = buildRouteDecisionPresentation(routes[1]!, routes, "twisty")
    const faster = buildRouteDecisionPresentation(routes[0]!, routes, "twisty")
    const rougher = buildRouteDecisionPresentation(routes[2]!, routes, "twisty")

    expect(selected.deltaLabel).toBe("Current route")
    expect(faster.deltaLabel).toBe("-9 min · -3.6 mi · -36 curve")
    expect(rougher.deltaLabel).toBe("+5 min · +1.3 mi · +30% unpaved · -19 curve")
  })

  it("previews a card from pointer and keyboard focus without selecting it", () => {
    const onSelect = vi.fn()
    const onPreview = vi.fn()
    render(
      <RouteDecisionCard
        route={routes[0]!}
        routes={routes}
        selected={false}
        selectedRouteId="twisty"
        onSelect={onSelect}
        onPreview={onPreview}
      />
    )

    const card = screen.getByRole("article", { name: /Fastest Now/i })
    const select = screen.getByRole("button", { name: "Select balanced route" })

    fireEvent.mouseEnter(card)
    expect(onPreview).toHaveBeenLastCalledWith("balanced")
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.mouseLeave(card)
    expect(onPreview).toHaveBeenLastCalledWith(null)

    fireEvent.focus(select)
    expect(onPreview).toHaveBeenLastCalledWith("balanced")
    fireEvent.blur(select)
    expect(onPreview).toHaveBeenLastCalledWith(null)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("publishes preview state ephemerally and does not notify for a no-op", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeRoutePreview(listener)

    setRoutePreviewId("scenic")
    expect(getRoutePreviewId()).toBe("scenic")
    expect(listener).toHaveBeenCalledTimes(1)

    setRoutePreviewId("scenic")
    expect(listener).toHaveBeenCalledTimes(1)

    setRoutePreviewId(null)
    expect(getRoutePreviewId()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it("marks only the valid previewed geometry in route GeoJSON", () => {
    const features = buildRouteFeatures(routes, "twisty", undefined, "scenic")
    const properties = Object.fromEntries(features.features.map((feature) => [
      feature.properties?.routeId,
      feature.properties
    ]))

    expect(properties.twisty?.selected).toBe(true)
    expect(properties.twisty?.previewed).toBe(false)
    expect(properties.scenic?.selected).toBe(false)
    expect(properties.scenic?.previewed).toBe(true)
    expect(properties.balanced?.previewed).toBe(false)
  })

  it("does not mark a stale preview route id", () => {
    const features = buildRouteFeatures(routes, "twisty", undefined, "gone")
    expect(features.features.every((feature) => feature.properties?.previewed === false)).toBe(true)
  })

  it("keeps selected-route sculpt hit geometry separate from alternate selection geometry", () => {
    const renderer = {
      supportsEmissiveStrength: false
    } as PlannerMapRenderer
    const experience = resolveMapExperience({
      experience: "standard",
      surface: "plan",
      lightPreset: "day"
    })
    const layers = routeRibbonLayers(renderer, experience)
    const alternateHit = layers.find((layer) => layer.id === ROUTE_HIT_LAYER) as LineLayerSpecification | undefined
    const selectedHit = layers.find((layer) => layer.id === SELECTED_ROUTE_HIT_LAYER) as LineLayerSpecification | undefined

    expect(alternateHit?.filter).toEqual(["!", ["get", "selected"]])
    expect(selectedHit?.filter).toEqual(["get", "selected"])
    expect(selectedHit?.paint?.["line-opacity"]).toBe(0.01)
  })
})
