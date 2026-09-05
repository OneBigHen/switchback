import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PlannerDeck } from "@/components/planner/PlannerDeck"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "@/components/planner/PlannerDeckViewModel"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import type { PlannedRoute } from "@/lib/routing/types"
import { usePlannerStore } from "@/stores/planner-store"

const selectedRoute: PlannedRoute = {
  id: "hierarchy-route",
  name: "Ridge & gravel run",
  profile: "adventure",
  geometry: [[-76.88, 40.27], [-77.23, 39.83]],
  waypoints: [],
  instructions: [],
  distanceMiles: 58.4,
  durationMinutes: 180,
  ascentMeters: 420,
  descentMeters: 390,
  twistiness: 79,
  turnCount: 47,
  roadMix: { secondary: 65, unclassified: 35 },
  surfaceMix: { asphalt: 62, gravel: 38 },
  routingSource: "live",
  previewOnly: false
}

function viewModel(): PlannerDeckViewModel {
  return {
    waypoint: {
      start: { lat: 40.2732, lon: -76.8867, label: "Harrisburg" },
      finish: { lat: 39.8309, lon: -77.2311, label: "Gettysburg" },
      startQuery: "Harrisburg",
      finishQuery: "Gettysburg",
      armedPoint: null,
      via: [],
      addingVia: false,
      canUndoRoutePoints: false,
      canRedoRoutePoints: false
    },
    rideConfig: {
      planMode: "destination",
      targetMinutes: 180,
      timeShaped: true,
      profile: "adventure",
      bikeProfile: { ...MOTORCYCLE_PROFILES[0]! },
      roadLocks: [],
      curvatureVisible: true,
      avoidHighways: true,
      tollPolicy: "avoid",
      segmentProfiles: ["adventure"],
      avoidAreaCount: 0
    },
    intent: {
      intentStatus: "idle",
      intentSummary: null,
      stopIdeas: null,
      researchStatus: "idle",
      researchSources: []
    },
    ui: {
      status: "ready",
      error: null,
      savedCount: 0,
      selectedRoute,
      home: null,
      routesCount: 3
    },
    lifecycle: {
      phase: "ready",
      startedAt: null,
      isRecalculating: false,
      label: "Ride ready"
    },
    providerHealth: { status: "healthy" }
  }
}

function commands(): PlannerDeckCommands {
  return {
    waypoint: {
      onPointChange: vi.fn(), onPointQueryChange: vi.fn(), onArm: vi.fn(), onSwap: vi.fn(),
      onToggleAddVia: vi.fn(), onRemoveVia: vi.fn(), onMoveVia: vi.fn(), onReverseRoute: vi.fn(),
      onUndoRoutePoints: vi.fn(), onRedoRoutePoints: vi.fn(), onToggleViaLock: vi.fn()
    },
    rideConfig: {
      onPlanModeChange: vi.fn(), onTargetMinutesChange: vi.fn(), onTimeShapedChange: vi.fn(),
      onProfileChange: vi.fn(), onBikeProfileChange: vi.fn(), onCurvatureChange: vi.fn(),
      onAvoidHighwaysChange: vi.fn(), onTollPolicyChange: vi.fn(), onSegmentProfileChange: vi.fn(),
      onRemoveAvoidArea: vi.fn(), onAddRoadLock: vi.fn(), onUpdateRoadLock: vi.fn(),
      onRemoveRoadLock: vi.fn(), onConvertRoadLock: vi.fn(), onClearRoadLocks: vi.fn()
    },
    intent: { onRidePrompt: vi.fn(), onChooseStopIdea: vi.fn(), onResearchRideIdea: vi.fn() },
    onClearRoute: vi.fn(),
    onPlan: vi.fn(),
    onCancelPlanning: vi.fn(),
    onOpenLibrary: vi.fn(),
    onStartFreeRide: vi.fn(),
    onUseCurrentLocation: vi.fn()
  }
}

afterEach(() => {
  cleanup()
  usePlannerStore.setState({ sheetDetentOverride: null })
})

describe("planner stage hierarchy", () => {
  it("collapses setup after results and opens a dedicated route-edit workspace on demand", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <PlannerDeck viewModel={viewModel()} commands={commands()}>
        <section data-testid="route-results">Route choices</section>
      </PlannerDeck>
    )

    expect(container.querySelector(".planner-composer-shell")).toHaveClass("is-collapsed")
    expect(container.querySelector(".planner-stage-content")).not.toHaveClass("is-suppressed")
    expect(screen.getByText("Ridge & gravel run")).toBeInTheDocument()
    expect(screen.getByText(/180 min · 58.4 mi/i)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Edit route" }))

    expect(container.querySelector(".planner-composer-shell")).not.toHaveClass("is-collapsed")
    expect(screen.getByRole("button", { name: "Ride options" })).toHaveAttribute("aria-expanded", "true")
    expect(container.querySelector(".planner-stage-content")).toHaveClass("is-suppressed")
    expect(screen.getByTestId("route-results")).toBeInTheDocument()
  })
})
