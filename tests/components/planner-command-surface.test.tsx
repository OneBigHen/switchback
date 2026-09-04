import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PlannerDeck } from "@/components/planner/PlannerDeck"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "@/components/planner/PlannerDeckViewModel"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import { featureFlags } from "@/lib/domain/feature-flags"
import { usePlannerStore } from "@/stores/planner-store"

function viewModel(): PlannerDeckViewModel {
  return {
    waypoint: {
      start: { lat: 40.2732, lon: -76.8867, label: "Harrisburg, Pennsylvania" },
      finish: { lat: 40.3, lon: -76.8, label: "Finish" },
      startQuery: "Harrisburg, Pennsylvania",
      finishQuery: "Finish",
      armedPoint: null,
      via: [],
      addingVia: false,
      canUndoRoutePoints: false,
      canRedoRoutePoints: false
    },
    rideConfig: {
      planMode: "destination",
      targetMinutes: 120,
      timeShaped: false,
      profile: "twisty",
      bikeProfile: { ...MOTORCYCLE_PROFILES[0]! },
      roadLocks: [],
      curvatureVisible: true,
      avoidHighways: false,
      tollPolicy: "allow-with-warning",
      segmentProfiles: ["twisty"],
      avoidAreaCount: 1
    },
    intent: {
      intentStatus: "idle",
      intentSummary: null,
      stopIdeas: null,
      researchStatus: "idle",
      researchSources: []
    },
    ui: {
      status: "idle",
      error: null,
      savedCount: 0,
      selectedRoute: null,
      home: null,
      routesCount: 0
    },
    lifecycle: {
      phase: "idle",
      startedAt: null,
      isRecalculating: false,
      label: ""
    },
    providerHealth: { status: "unknown" }
  }
}

function commands(): PlannerDeckCommands {
  return {
    waypoint: {
      onPointChange: vi.fn(),
      onPointQueryChange: vi.fn(),
      onArm: vi.fn(),
      onSwap: vi.fn(),
      onToggleAddVia: vi.fn(),
      onRemoveVia: vi.fn(),
      onMoveVia: vi.fn(),
      onReverseRoute: vi.fn(),
      onUndoRoutePoints: vi.fn(),
      onRedoRoutePoints: vi.fn(),
      onToggleViaLock: vi.fn()
    },
    rideConfig: {
      onPlanModeChange: vi.fn(),
      onTargetMinutesChange: vi.fn(),
      onTimeShapedChange: vi.fn(),
      onProfileChange: vi.fn(),
      onBikeProfileChange: vi.fn(),
      onCurvatureChange: vi.fn(),
      onAvoidHighwaysChange: vi.fn(),
      onTollPolicyChange: vi.fn(),
      onSegmentProfileChange: vi.fn(),
      onRemoveAvoidArea: vi.fn(),
      onAddRoadLock: vi.fn(),
      onUpdateRoadLock: vi.fn(),
      onRemoveRoadLock: vi.fn(),
      onConvertRoadLock: vi.fn(),
      onClearRoadLocks: vi.fn()
    },
    intent: {
      onRidePrompt: vi.fn(),
      onChooseStopIdea: vi.fn(),
      onResearchRideIdea: vi.fn()
    },
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
  featureFlags.roadRequirements = false
  usePlannerStore.setState({ sheetDetentOverride: null })
})

describe("planner command surface", () => {
  it("reclaims the idle header instead of rendering Search as a dedicated stage row", () => {
    render(<PlannerDeck viewModel={viewModel()} commands={commands()} />)

    expect(screen.queryByLabelText("Planning stage: Search")).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText("Search a place or describe a ride")).toBeVisible()
  })

  it("names the progressive disclosure Ride options", () => {
    render(<PlannerDeck viewModel={viewModel()} commands={commands()} />)

    expect(screen.getByRole("button", { name: "Ride options" })).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("button", { name: /^Options$/ })).not.toBeInTheDocument()
  })

  it("uses rider-goal groups instead of implementation-facing option buckets", async () => {
    const user = userEvent.setup()
    render(<PlannerDeck viewModel={viewModel()} commands={commands()} />)

    await user.click(screen.getByRole("button", { name: "Ride options" }))

    expect(screen.getByRole("group", { name: "Ride character" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Shape route" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Avoid" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Bike & map" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /prefer a road/i })).toBeInTheDocument()
    expect(screen.queryByText(/preferred \/ required roads/i)).not.toBeInTheDocument()
    expect(screen.getByText("1 excluded area active")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Remove latest excluded area" })).toBeInTheDocument()
  })

  it("starts map-specific editing from Ride options instead of hiding it in map-global chrome", async () => {
    const user = userEvent.setup()
    render(<PlannerDeck viewModel={viewModel()} commands={commands()} />)

    await user.click(screen.getByRole("button", { name: "Ride options" }))

    expect(screen.getByRole("button", { name: "Exclude an area on map" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Prefer a road on map" })).toBeInTheDocument()
  })
})
