import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MapStage } from "@/components/planner/MapStage"
import { cancelMapEdit, requestMapEdit } from "@/components/planner/map-edit-command"
import { usePlannerStore } from "@/stores/planner-store"

vi.mock("maplibre-gl", () => ({}))

function renderMapStage() {
  return render(
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
}

afterEach(() => {
  // requestMapEdit schedules focus retries and a MutationObserver that outlive
  // the React tree; drop that in-flight state before the environment tears down.
  cancelMapEdit()
  cleanup()
  usePlannerStore.getState().setSheetDetentOverride(null)
})

describe("map edit coordination", () => {
  it("cancels a road preference draft before entering area exclusion", () => {
    renderMapStage()

    act(() => requestMapEdit("prefer-road"))
    expect(screen.getByRole("region", { name: "Road lock draft" })).toBeVisible()

    act(() => requestMapEdit("exclude-area"))
    expect(screen.getByRole("region", { name: "Draw an avoid area" })).toBeVisible()
    expect(screen.queryByRole("region", { name: "Road lock draft" })).not.toBeInTheDocument()
  })

  it("cancels area exclusion before entering a road preference draft", () => {
    renderMapStage()

    act(() => requestMapEdit("exclude-area"))
    expect(screen.getByRole("region", { name: "Draw an avoid area" })).toBeVisible()

    act(() => requestMapEdit("prefer-road"))
    expect(screen.getByRole("region", { name: "Road lock draft" })).toBeVisible()
    expect(screen.queryByRole("region", { name: "Draw an avoid area" })).not.toBeInTheDocument()
  })

  it("moves keyboard focus into the active edit surface and restores it on cancel", async () => {
    const user = userEvent.setup()
    render(
      <>
        <button
          type="button"
          data-map-edit-command="exclude-area"
          onClick={() => requestMapEdit("exclude-area")}
        >
          Exclude an area on map
        </button>
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
      </>
    )

    const trigger = screen.getByRole("button", { name: "Exclude an area on map" })
    await user.click(trigger)

    const editSurface = screen.getByRole("region", { name: "Draw an avoid area" })
    await waitFor(() => expect(editSurface).toHaveFocus())

    await user.click(screen.getByRole("button", { name: "Cancel avoid area" }))
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
