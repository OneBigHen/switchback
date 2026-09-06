import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { PlannerDeck } from "@/components/planner/PlannerDeck"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "@/components/planner/PlannerDeckViewModel"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import { usePlannerStore } from "@/stores/planner-store"

type PlannerDeckCommandOverrides = Omit<Partial<PlannerDeckCommands>, "waypoint" | "rideConfig" | "intent"> & {
  waypoint?: Partial<PlannerDeckCommands["waypoint"]>
  rideHistory?: Partial<PlannerDeckCommands["rideHistory"]>
  rideConfig?: Partial<PlannerDeckCommands["rideConfig"]>
  intent?: Partial<PlannerDeckCommands["intent"]>
}

type PlannerDeckViewModelOverrides = Omit<Partial<PlannerDeckViewModel>, "waypoint" | "rideConfig" | "intent" | "ui" | "lifecycle"> & {
  waypoint?: Partial<PlannerDeckViewModel["waypoint"]>
  rideHistory?: Partial<PlannerDeckViewModel["rideHistory"]>
  rideConfig?: Partial<PlannerDeckViewModel["rideConfig"]>
  intent?: Partial<PlannerDeckViewModel["intent"]>
  ui?: Partial<PlannerDeckViewModel["ui"]>
  lifecycle?: Partial<PlannerDeckViewModel["lifecycle"]>
}

afterEach(() => {
  cleanup()
  usePlannerStore.setState({ sheetDetentOverride: null })
})

function viewModel(): PlannerDeckViewModel {
  return {
    waypoint: {
      start: { lat: 40.2732, lon: -76.8867, label: "Harrisburg, Pennsylvania" },
      finish: { lat: 40.3, lon: -76.8, label: "Finish" },
      startQuery: "Harrisburg, Pennsylvania",
      finishQuery: "Finish",
      armedPoint: null,
      via: [{ lat: 40.4, lon: -76.7, label: "Overlook" }],
      addingVia: false,
    },
    rideHistory: {
      canUndoRideChange: true,
      canRedoRideChange: false,
      lastChangeLabel: null,
      hasUnappliedChange: false
    },
    rideConfig: {
      planMode: "destination",
      targetMinutes: 120,
      timeShaped: false,
      profile: "twisty",
      bikeProfile: { ...MOTORCYCLE_PROFILES[0]! },
      roadLocks: [],
      curvatureVisible: true,
      avoidHighways: true,
      tollPolicy: "allow-with-warning",
      segmentProfiles: ["twisty", "scenic"],
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
      savedCount: 1,
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
      onToggleViaLock: vi.fn(),
    },
    rideHistory: {
      onUndoRideChange: vi.fn(),
      onRedoRideChange: vi.fn(),
    },
    rideConfig: {
      onPlanModeChange: vi.fn(),
      onRideTimeChange: vi.fn(),
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
      onClearRoadLocks: vi.fn(),
    },
    intent: {
      onRidePrompt: vi.fn(),
      onChooseStopIdea: vi.fn(),
      onResearchRideIdea: vi.fn(),
    },
    onClearRoute: vi.fn(),
    onPlan: vi.fn(),
    onCancelRideChange: vi.fn(),
    onOpenLibrary: vi.fn()
  }
  return {
    ...defaults,
    ...overrides,
    waypoint: { ...defaults.waypoint, ...overrides.waypoint },
    rideConfig: { ...defaults.rideConfig, ...overrides.rideConfig },
    intent: { ...defaults.intent, ...overrides.intent }
  }
}

function renderOptions(
  vmOverrides: PlannerDeckViewModelOverrides = {},
  commandOverrides: PlannerDeckCommandOverrides = {}
) {
  const base = viewModel()
  const initialCommands = commands(commandOverrides)
  function ControlledPlanner() {
    const [planMode, setPlanMode] = useState((vmOverrides.rideConfig?.planMode ?? base.rideConfig.planMode))
    const [targetMinutes, setTargetMinutes] = useState((vmOverrides.rideConfig?.targetMinutes ?? base.rideConfig.targetMinutes))
    return (
      <PlannerDeck
        viewModel={{
          ...base,
          ...vmOverrides,
          waypoint: { ...base.waypoint, ...vmOverrides.waypoint },
          rideConfig: { ...base.rideConfig, ...vmOverrides.rideConfig, planMode, targetMinutes },
          intent: { ...base.intent, ...vmOverrides.intent },
          ui: { ...base.ui, ...vmOverrides.ui },
          lifecycle: { ...base.lifecycle, ...vmOverrides.lifecycle }
        }}
        commands={{
          ...initialCommands,
          rideConfig: {
            ...initialCommands.rideConfig,
            onPlanModeChange: (nextMode) => {
              initialCommands.rideConfig.onPlanModeChange(nextMode)
              setPlanMode(nextMode)
            },
            onRideTimeChange: (minutes: number, shaped: boolean) => {
              initialCommands.rideConfig.onRideTimeChange(minutes, shaped)
              setTargetMinutes(minutes)
            }
          }
        }}
      />
    )
  }
  return render(
    <ControlledPlanner />
  )
}

describe("V2 progressive Ride options", () => {
  it("keeps route customization closed until Ride options is requested", () => {
    renderOptions()

    const disclosure = screen.getByRole("button", { name: "Ride options" })
    expect(disclosure).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("group", { name: "Ride character" })).not.toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Shape route" })).not.toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Avoid" })).not.toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Bike & map" })).not.toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Advanced" })).not.toBeInTheDocument()
  })

  it("groups customization by rider goal while preserving every shaping control", async () => {
    const user = userEvent.setup()
    const onAvoidHighwaysChange = vi.fn()
    renderOptions({ rideConfig: { planMode: "loop" } }, { rideConfig: { onAvoidHighwaysChange } })

    await user.click(screen.getByRole("button", { name: "Ride options" }))

    expect(screen.getByRole("group", { name: "Ride character" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Shape route" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Avoid" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Bike & map" })).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Advanced" })).not.toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: /avoid highways/i })).toBeChecked()
    expect(screen.getByRole("radiogroup", { name: /motorcycle bike profile preset/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /add stop on map/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /prefer a road/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /exclude an area on map/i })).toBeInTheDocument()

    const groups = screen.getAllByRole("group").filter((element) => element.classList.contains("plan-v2__option-group"))
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "Ride character",
      "Shape route",
      "Avoid",
      "Bike & map"
    ])

    await user.click(screen.getByRole("checkbox", { name: /avoid highways/i }))
    expect(onAvoidHighwaysChange).toHaveBeenCalledWith(false)

    // Segment-level shaping controls only become available for a destination
    // with a finish and remain progressive rather than duplicating the idle
    // composer.
    await user.click(screen.getByRole("button", { name: "Destination" }))
    expect(screen.getByRole("group", { name: "Advanced" })).toBeInTheDocument()
  })

  it("does not duplicate preference or bike controls in the compact composer", async () => {
    const user = userEvent.setup()
    renderOptions()

    expect(screen.queryByRole("radiogroup", { name: /motorcycle bike profile preset/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Ride options" }))
    expect(screen.getAllByRole("radiogroup", { name: /motorcycle bike profile preset/i })).toHaveLength(1)
    expect(screen.getAllByRole("checkbox", { name: /avoid highways/i })).toHaveLength(1)
  })

  it("keeps Ride options values mounted and editable without submitting a route", async () => {
    const user = userEvent.setup()
    const onPlan = vi.fn()
    const onRideTimeChange = vi.fn()
    renderOptions({ rideConfig: { planMode: "loop" } }, { onPlan, rideConfig: { onRideTimeChange } })

    await user.click(screen.getByRole("button", { name: "Ride options" }))
    await user.click(screen.getByRole("button", { name: "90 min" }))
    // One preset tap is one ride change, not a duration edit plus a shaping edit.
    expect(onRideTimeChange).toHaveBeenCalledExactlyOnceWith(90, true)
    expect(onPlan).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Ride options" }))
    expect(screen.getByRole("button", { name: "Ride options" })).toHaveAttribute("aria-expanded", "false")
    await user.click(screen.getByRole("button", { name: "Ride options" }))
    expect(screen.getByRole("button", { name: "90 min" })).toHaveAttribute("aria-pressed", "true")
  })

  it("commits a custom loop duration once the rider is done typing it", async () => {
    const user = userEvent.setup()
    const onRideTimeChange = vi.fn()
    renderOptions({ rideConfig: { planMode: "loop" } }, { rideConfig: { onRideTimeChange } })

    expect(screen.queryByRole("button", { name: "Custom" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Ride options" }))
    const rideCharacter = screen.getByRole("group", { name: "Ride character" })
    await user.click(within(rideCharacter).getByRole("button", { name: "Custom" }))

    const input = screen.getByRole("spinbutton", { name: "Custom loop duration in minutes" })
    await user.clear(input)
    await user.type(input, "150")

    // "1" and "15" are not durations the rider asked for, so they never become
    // ride changes or route requests.
    expect(onRideTimeChange).not.toHaveBeenCalled()
    await user.tab()
    expect(onRideTimeChange).toHaveBeenCalledExactlyOnceWith(150, true)
  })

  it("restores the committed duration when a custom entry is left out of range", async () => {
    const user = userEvent.setup()
    const onRideTimeChange = vi.fn()
    renderOptions(
      { rideConfig: { planMode: "loop", targetMinutes: 120 } },
      { rideConfig: { onRideTimeChange } }
    )

    await user.click(screen.getByRole("button", { name: "Ride options" }))
    const rideCharacter = screen.getByRole("group", { name: "Ride character" })
    await user.click(within(rideCharacter).getByRole("button", { name: "Custom" }))
    const input = screen.getByRole("spinbutton", { name: "Custom loop duration in minutes" })
    await user.clear(input)
    await user.type(input, "5")
    await user.tab()

    expect(onRideTimeChange).not.toHaveBeenCalled()
    expect(input).toHaveValue(120)
  })

  it("keeps a destination ride on Fastest by default and opts into a time target on demand", async () => {
    const user = userEvent.setup()
    const onRideTimeChange = vi.fn()
    renderOptions(
      { rideConfig: { planMode: "destination", timeShaped: false } },
      { rideConfig: { onRideTimeChange } }
    )

    await user.click(screen.getByRole("button", { name: "Ride options" }))
    const rideCharacter = screen.getByRole("group", { name: "Ride character" })
    expect(within(rideCharacter).getByRole("button", { name: "Fastest" })).toHaveAttribute("aria-pressed", "true")

    await user.click(within(rideCharacter).getByRole("button", { name: "1 hr" }))
    expect(onRideTimeChange).toHaveBeenLastCalledWith(60, true)

    // Switching back to Fastest turns off time shaping but keeps the duration
    // the rider last chose, so re-enabling a target does not lose it.
    await user.click(within(rideCharacter).getByRole("button", { name: "Fastest" }))
    expect(onRideTimeChange).toHaveBeenLastCalledWith(60, false)
  })
})