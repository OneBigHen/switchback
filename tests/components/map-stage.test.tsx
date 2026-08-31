import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MapStage } from "@/components/planner/MapStage"
import type { NavigationFrame } from "@/lib/client/navigation-engine"

vi.mock("maplibre-gl", () => ({}))

afterEach(cleanup)

describe("map layer controls", () => {
  it("mounts the bounded V2 quick layer surface and keeps specialized controls behind Advanced", async () => {
    const user = userEvent.setup()
    render(
      <MapStage
        routes={[]}
        selectedRouteId={null}
        start={null}
        finish={null}
        via={[]}
        armedPoint={null}
        addingVia={false}
        curvatureVisible
        unpavedVisible
        mapExperience="standard"
        lightPreference="auto"
        riderLayers={[
          { id: "curvature", visible: true, opacity: 1, order: 0 },
          { id: "unpaved", visible: false, opacity: 1, order: 1 },
          { id: "closures", visible: false, opacity: 1, order: 2 },
          { id: "road-controls", visible: false, opacity: 1, order: 3 },
          { id: "satellite", visible: false, opacity: 1, order: 4 },
          { id: "fuel", visible: false, opacity: 1, order: 5 }
        ]}
        routeVisibility="standard"
        mapPacks={[]}
        referenceMap={null}
        rideMode={false}
        onCurvatureChange={vi.fn()}
        onUnpavedChange={vi.fn()}
        onMapExperienceChange={vi.fn()}
        onLightPreferenceChange={vi.fn()}
        onRiderLayerChange={vi.fn()}
        onMoveRiderLayer={vi.fn()}
        onRouteVisibilityChange={vi.fn()}
        onSaveMapPack={vi.fn()}
        onApplyMapPack={vi.fn()}
        onReferenceMapChange={vi.fn()}
        onWaypointDrag={vi.fn()}
        onMapPick={vi.fn()}
        onRouteSketch={vi.fn()}
        onSketchModeChange={vi.fn()}
        avoidAreas={[]}
        onAvoidArea={vi.fn()}
      />
    )

    await user.click(screen.getByRole("button", { name: "Open map layers" }))
    expect(screen.getByRole("region", { name: "Quick map layers" })).toBeVisible()
    expect(screen.getByRole("radio", { name: "Standard" })).toBeVisible()
    expect(screen.getByRole("radio", { name: "Terrain" })).toBeVisible()
    // MapStage uses the renderer-neutral fallback; Satellite remains correctly
    // capability-gated while the premium LayersSheet contract covers it.
    expect(screen.queryByRole("radio", { name: "Satellite" })).not.toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Great roads" })).toBeVisible()
    expect(screen.queryByText(/Switchback road-shape analysis/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Advanced map settings" }))
    expect(screen.getByText(/Switchback road-shape analysis/i)).toBeVisible()
    expect(screen.getByRole("checkbox", { name: /Satellite imagery/i })).toBeVisible()
  })

  it("exposes a touch-sized recenter control for the shared ride navigation frame", () => {
    const navigationFrame = {
      status: "navigating",
      rawCoordinate: [-76.9, 40],
      matchedCoordinate: [-76.9, 40],
      headingDegrees: 90,
      speedMetersPerSecond: 12,
      accuracyMeters: 8,
      timestamp: 1_000
    } as NavigationFrame
    render(
      <MapStage
        routes={[]}
        selectedRouteId={null}
        start={null}
        finish={null}
        via={[]}
        armedPoint={null}
        addingVia={false}
        curvatureVisible={false}
        unpavedVisible={false}
        mapExperience="standard"
        lightPreference="auto"
        riderLayers={[]}
        routeVisibility="standard"
        mapPacks={[]}
        referenceMap={null}
        rideMode
        navigationFrame={navigationFrame}
        onCurvatureChange={vi.fn()}
        onUnpavedChange={vi.fn()}
        onMapExperienceChange={vi.fn()}
        onLightPreferenceChange={vi.fn()}
        onRiderLayerChange={vi.fn()}
        onMoveRiderLayer={vi.fn()}
        onRouteVisibilityChange={vi.fn()}
        onSaveMapPack={vi.fn()}
        onApplyMapPack={vi.fn()}
        onReferenceMapChange={vi.fn()}
        onWaypointDrag={vi.fn()}
        onMapPick={vi.fn()}
        onRouteSketch={vi.fn()}
        onSketchModeChange={vi.fn()}
        avoidAreas={[]}
        onAvoidArea={vi.fn()}
      />
    )

    expect(screen.getByRole("button", { name: "Recenter map on current location" })).toBeVisible()
  })

  it("closes the layer popover with Escape", async () => {
    const user = userEvent.setup()
    render(
      <MapStage
        routes={[]}
        selectedRouteId={null}
        start={null}
        finish={null}
        via={[]}
        armedPoint={null}
        addingVia={false}
        curvatureVisible
        unpavedVisible
        mapExperience="standard"
        lightPreference="auto"
        riderLayers={[]}
        routeVisibility="standard"
        mapPacks={[]}
        referenceMap={null}
        rideMode={false}
        onCurvatureChange={vi.fn()}
        onUnpavedChange={vi.fn()}
        onMapExperienceChange={vi.fn()}
        onLightPreferenceChange={vi.fn()}
        onRiderLayerChange={vi.fn()}
        onMoveRiderLayer={vi.fn()}
        onRouteVisibilityChange={vi.fn()}
        onSaveMapPack={vi.fn()}
        onApplyMapPack={vi.fn()}
        onReferenceMapChange={vi.fn()}
        onWaypointDrag={vi.fn()}
        onMapPick={vi.fn()}
        onRouteSketch={vi.fn()}
        onSketchModeChange={vi.fn()}
        avoidAreas={[]}
        onAvoidArea={vi.fn()}
      />
    )

    await user.click(screen.getByRole("button", { name: "Open map layers" }))
    expect(screen.getByRole("dialog", { name: "Map layers and style" })).toBeVisible()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog", { name: "Map layers and style" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open map layers" })).toHaveFocus()
  })

  it("makes every advertised layer available from the map studio", async () => {
    const user = userEvent.setup()
    const onSaveMapPack = vi.fn()
    const onRiderLayerChange = vi.fn()
    render(
      <MapStage
        routes={[]}
        selectedRouteId={null}
        start={null}
        finish={null}
        via={[]}
        armedPoint={null}
        addingVia={false}
        curvatureVisible
        unpavedVisible
        mapExperience="standard"
        lightPreference="auto"
        riderLayers={[{ id: "curvature", visible: true, opacity: 0.5, order: 0 }]}
        routeVisibility="standard"
        mapPacks={[]}
        referenceMap={null}
        rideMode={false}
        onCurvatureChange={vi.fn()}
        onUnpavedChange={vi.fn()}
        onMapExperienceChange={vi.fn()}
        onLightPreferenceChange={vi.fn()}
        onRiderLayerChange={onRiderLayerChange}
        onMoveRiderLayer={vi.fn()}
        onRouteVisibilityChange={vi.fn()}
        onSaveMapPack={onSaveMapPack}
        onApplyMapPack={vi.fn()}
        onReferenceMapChange={vi.fn()}
        onWaypointDrag={vi.fn()}
        onMapPick={vi.fn()}
        onRouteSketch={vi.fn()}
        onSketchModeChange={vi.fn()}
        avoidAreas={[]}
        onAvoidArea={vi.fn()}
      />
    )

    await user.click(screen.getByRole("button", { name: "Open map layers" }))
    await user.click(screen.getByRole("button", { name: "Advanced map settings" }))
    expect(screen.getByText(/Switchback road-shape analysis/i)).toBeVisible()
    expect(screen.getByText(/Legend: Satellite image overlay/i)).toBeVisible()
    expect(screen.getAllByText(/Confidence: Provider imagery coverage/i)).not.toHaveLength(0)
    const satellite = screen.getByRole("checkbox", { name: /satellite imagery/i })
    expect(satellite).toBeEnabled()
    await user.click(satellite)
    expect(onRiderLayerChange).toHaveBeenCalledWith("satellite", { visible: true })
    await user.type(screen.getByLabelText("New map pack name"), "Gravel scouting")
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(onSaveMapPack).toHaveBeenCalledWith("Gravel scouting")
  })

  it("opens and cancels the V2 route sketch surface from a typed draw command", async () => {
    const user = userEvent.setup()
    const onSketchModeChange = vi.fn()
    render(
      <MapStage
        routes={[]}
        selectedRouteId={null}
        start={null}
        finish={null}
        via={[]}
        armedPoint={null}
        addingVia={false}
        curvatureVisible
        unpavedVisible
        mapExperience="standard"
        lightPreference="auto"
        riderLayers={[]}
        routeVisibility="standard"
        mapPacks={[]}
        referenceMap={null}
        rideMode={false}
        onCurvatureChange={vi.fn()}
        onUnpavedChange={vi.fn()}
        onMapExperienceChange={vi.fn()}
        onLightPreferenceChange={vi.fn()}
        onRiderLayerChange={vi.fn()}
        onMoveRiderLayer={vi.fn()}
        onRouteVisibilityChange={vi.fn()}
        onSaveMapPack={vi.fn()}
        onApplyMapPack={vi.fn()}
        onReferenceMapChange={vi.fn()}
        onWaypointDrag={vi.fn()}
        onMapPick={vi.fn()}
        onRouteSketch={vi.fn()}
        onSketchModeChange={onSketchModeChange}
        drawCommand={{ type: "start", id: 1 }}
        avoidAreas={[]}
        onAvoidArea={vi.fn()}
      />
    )

    expect(screen.queryByRole("button", { name: "Sketch a rough route" })).not.toBeInTheDocument()
    expect(onSketchModeChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole("region", { name: "Draw a rough route" })).toBeVisible()
    expect(screen.getByText(/drag one line through the roads or areas/i)).toBeVisible()
    expect(screen.getByText(/switchback will snap it to legal roads/i)).toBeVisible()
    expect(screen.getByRole("toolbar", { name: "Draw route controls" })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Cancel drawing" }))

    expect(onSketchModeChange).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole("region", { name: "Draw a rough route" })).not.toBeInTheDocument()
  })

  it("opens and cancels a drawn avoid-area surface", async () => {
    const user = userEvent.setup()
    const onSketchModeChange = vi.fn()
    render(
      <MapStage
        routes={[]}
        selectedRouteId={null}
        start={null}
        finish={null}
        via={[]}
        armedPoint={null}
        addingVia={false}
        curvatureVisible
        unpavedVisible
        mapExperience="standard"
        lightPreference="auto"
        riderLayers={[]}
        routeVisibility="standard"
        mapPacks={[]}
        referenceMap={null}
        rideMode={false}
        onCurvatureChange={vi.fn()}
        onUnpavedChange={vi.fn()}
        onMapExperienceChange={vi.fn()}
        onLightPreferenceChange={vi.fn()}
        onRiderLayerChange={vi.fn()}
        onMoveRiderLayer={vi.fn()}
        onRouteVisibilityChange={vi.fn()}
        onSaveMapPack={vi.fn()}
        onApplyMapPack={vi.fn()}
        onReferenceMapChange={vi.fn()}
        onWaypointDrag={vi.fn()}
        onMapPick={vi.fn()}
        onRouteSketch={vi.fn()}
        onSketchModeChange={onSketchModeChange}
        avoidAreas={[]}
        onAvoidArea={vi.fn()}
      />
    )

    await user.click(screen.getByRole("button", { name: "Draw an avoid area" }))
    expect(onSketchModeChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole("region", { name: "Draw an avoid area" })).toBeVisible()
    expect(screen.getByText(/drag a box around a closure/i)).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Cancel avoid area" }))
    expect(onSketchModeChange).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole("region", { name: "Draw an avoid area" })).not.toBeInTheDocument()
  })
})
