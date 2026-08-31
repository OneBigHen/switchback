import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { PlannerDeck } from "@/components/planner/PlannerDeck"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "@/components/planner/PlannerDeckViewModel"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import { usePlannerStore } from "@/stores/planner-store"

type PlannerDeckCommandOverrides = Omit<Partial<PlannerDeckCommands>, "waypoint" | "rideConfig" | "intent"> & {
  waypoint?: Partial<PlannerDeckCommands["waypoint"]>
  rideConfig?: Partial<PlannerDeckCommands["rideConfig"]>
  intent?: Partial<PlannerDeckCommands["intent"]>
}

afterEach(() => {
  cleanup()
  usePlannerStore.setState({ sheetDetentOverride: null })
})

function viewModel(overrides: Partial<PlannerDeckViewModel> = {}): PlannerDeckViewModel {
  return {
    waypoint: {
      start: { lat: 40.2732, lon: -76.8867, label: "Harrisburg, Pennsylvania" },
      finish: null,
      startQuery: "Harrisburg, Pennsylvania",
      finishQuery: "",
      armedPoint: null,
      via: [],
      addingVia: false,
      canUndoRoutePoints: false,
      canRedoRoutePoints: false,
      ...overrides.waypoint
    },
    rideConfig: {
      planMode: "destination",
      targetMinutes: 120,
      profile: "twisty",
      bikeProfile: { ...MOTORCYCLE_PROFILES[0]! },
      roadLocks: [],
      curvatureVisible: true,
      avoidHighways: false,
      segmentProfiles: ["twisty"],
      avoidAreaCount: 0,
      ...overrides.rideConfig
    },
    intent: {
      intentStatus: "idle",
      intentSummary: null,
      stopIdeas: null,
      researchStatus: "idle",
      researchSources: [],
      ...overrides.intent
    },
    ui: {
      status: "idle",
      error: null,
      savedCount: 0,
      selectedRoute: null,
      home: null,
      routesCount: 0,
      ...overrides.ui
    },
    lifecycle: {
      phase: "idle",
      startedAt: null,
      isRecalculating: false,
      label: "",
      ...overrides.lifecycle
    },
    providerHealth: { status: "unknown" },
    ...overrides
  }
}

function commands(overrides: PlannerDeckCommandOverrides = {}): PlannerDeckCommands {
  const defaults: PlannerDeckCommands = {
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
      onToggleViaLock: vi.fn(),
      ...overrides.waypoint
    },
    rideConfig: {
      onPlanModeChange: vi.fn(),
      onTargetMinutesChange: vi.fn(),
      onProfileChange: vi.fn(),
      onBikeProfileChange: vi.fn(),
      onCurvatureChange: vi.fn(),
      onAvoidHighwaysChange: vi.fn(),
      onSegmentProfileChange: vi.fn(),
      onRemoveAvoidArea: vi.fn(),
      onAddRoadLock: vi.fn(),
      onUpdateRoadLock: vi.fn(),
      onRemoveRoadLock: vi.fn(),
      onConvertRoadLock: vi.fn(),
      onClearRoadLocks: vi.fn(),
      ...overrides.rideConfig
    },
    intent: {
      onRidePrompt: vi.fn(),
      onChooseStopIdea: vi.fn(),
      onResearchRideIdea: vi.fn(),
      ...overrides.intent
    },
    onClearRoute: vi.fn(),
    onPlan: vi.fn(),
    onCancelPlanning: vi.fn(),
    onOpenLibrary: vi.fn(),
    onStartFreeRide: vi.fn(),
    onUseCurrentLocation: vi.fn(),
  }
  return {
    ...defaults,
    ...overrides,
    waypoint: { ...defaults.waypoint, ...overrides.waypoint },
    rideConfig: { ...defaults.rideConfig, ...overrides.rideConfig },
    intent: { ...defaults.intent, ...overrides.intent }
  }
}

function renderComposer(
  vmOverrides: Partial<PlannerDeckViewModel> = {},
  commandOverrides: PlannerDeckCommandOverrides = {}
) {
  const initialViewModel = viewModel(vmOverrides)
  const initialCommands = commands(commandOverrides)
  function ControlledPlanner() {
    const [planMode, setPlanMode] = useState(initialViewModel.rideConfig.planMode)
    return (
      <PlannerDeck
        viewModel={{ ...initialViewModel, rideConfig: { ...initialViewModel.rideConfig, planMode } }}
        commands={{
          ...initialCommands,
          rideConfig: {
            ...initialCommands.rideConfig,
            onPlanModeChange: (nextMode) => {
              initialCommands.rideConfig.onPlanModeChange(nextMode)
              setPlanMode(nextMode)
            }
          }
        }}
      />
    )
  }
  return render(<ControlledPlanner />)
}

describe("V2 compact Plan composer", () => {
  it("keeps the map-first idle surface to the exact compact planning contract", () => {
    renderComposer()

    expect(screen.getByPlaceholderText("Search a place or describe a ride")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Destination" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Loop" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Draw" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Free Ride" })).toBeInTheDocument()
  })

  it("uses one progressive disclosure instead of duplicating the route editor", () => {
    renderComposer()

    expect(screen.getAllByRole("button", { name: "Options" })).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "Edit route" })).not.toBeInTheDocument()
  })

  it("keeps ride-request submission locked while intent interpretation is active", async () => {
    const user = userEvent.setup()
    renderComposer({ intent: { intentStatus: "interpreting" } })

    const input = screen.getByPlaceholderText("Search a place or describe a ride")
    await user.type(input, "A scenic ride to a river overlook")

    expect(screen.getByRole("button", { name: /find ride options/i })).toBeDisabled()
  })

  it("does not mix route personality or retired marketing content into idle Plan", () => {
    renderComposer()

    expect(screen.queryByRole("heading", { name: "Where do you want to ride?" })).not.toBeInTheDocument()
    expect(screen.queryByText("Ride the better road")).not.toBeInTheDocument()
    expect(screen.queryByText("Try")).not.toBeInTheDocument()
    expect(screen.queryByText("Pine Creek Gorge")).not.toBeInTheDocument()
    expect(screen.queryByText("New Hope scenic route")).not.toBeInTheDocument()
    expect(screen.queryByRole("radiogroup", { name: /motorcycle routing profile/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/active bike/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/best ride/i)).not.toBeInTheDocument()
  })

  it("keeps trip shape separate from route personality and uses the Loop prompt", async () => {
    const user = userEvent.setup()
    const onPlanModeChange = vi.fn()
    renderComposer({}, { rideConfig: { onPlanModeChange } })

    await user.click(screen.getByRole("button", { name: "Loop" }))

    expect(onPlanModeChange).toHaveBeenCalledWith("loop")
    expect(screen.getByPlaceholderText("Where should the loop start?")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Best Ride" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Fastest" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Balanced" })).not.toBeInTheDocument()
  })

  it("keeps a live start compact and changeable", () => {
    renderComposer()

    expect(screen.getByRole("button", { name: "Change start" })).toBeInTheDocument()
    expect(screen.queryByText("Starting from Harrisburg, Pennsylvania")).not.toBeInTheDocument()
  })

  it("submits free-form intent through the existing ride prompt callback", async () => {
    const user = userEvent.setup()
    const onRidePrompt = vi.fn()
    renderComposer({}, { intent: { onRidePrompt } })

    const input = screen.getByPlaceholderText("Search a place or describe a ride")
    await user.type(input, "A scenic ride to a river overlook")
    await user.click(screen.getByRole("button", { name: /find ride options/i }))

    expect(onRidePrompt).toHaveBeenCalledWith("A scenic ride to a river overlook")
  })
})
