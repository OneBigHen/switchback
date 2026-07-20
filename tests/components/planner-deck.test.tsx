import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PlannerDeck } from "@/components/planner/PlannerDeck"
import type { PlannerDeckViewModel, PlannerDeckCommands } from "@/components/planner/PlannerDeckViewModel"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import type { PlannedRoute, Waypoint } from "@/lib/routing/types"

const harrisburg: Waypoint = {
  lat: 40.2732,
  lon: -76.8867,
  label: "Harrisburg, Pennsylvania"
}

const plannedRoute: PlannedRoute = {
  id: "deck-route",
  name: "Deck route",
  profile: "twisty",
  geometry: [[-76.9, 40.2], [-76.8, 40.3]],
  waypoints: [harrisburg, { lat: 40.3, lon: -76.8, label: "Finish" }],
  instructions: [],
  distanceMiles: 12,
  durationMinutes: 20,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 60,
  turnCount: 10,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

afterEach(cleanup)

function defaultViewModel(): PlannerDeckViewModel {
  return {
    waypoint: {
      start: harrisburg,
      finish: null,
      startQuery: harrisburg.label!,
      finishQuery: "",
      armedPoint: null,
      via: [],
      addingVia: false,
      canUndoRoutePoints: false,
      canRedoRoutePoints: false
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
      status: "idle",
      error: null,
      savedCount: 419,
      selectedRoute: null,
      home: null
    }
  }
}

function defaultCommands(): PlannerDeckCommands {
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
      onClearRoadLocks: vi.fn()
    },
    intent: {
      onRidePrompt: vi.fn(),
      onChooseStopIdea: vi.fn(),
      onResearchRideIdea: vi.fn()
    },
    onClearRoute: vi.fn(),
    onPlan: vi.fn(),
    onOpenLibrary: vi.fn()
  }
}

interface RenderDeckOverrides {
  vm?: Partial<{
    waypoint: Partial<PlannerDeckViewModel["waypoint"]>
    rideConfig: Partial<PlannerDeckViewModel["rideConfig"]>
    intent: Partial<PlannerDeckViewModel["intent"]>
    ui: Partial<PlannerDeckViewModel["ui"]>
  }>
  cmds?: Partial<{
    waypoint: Partial<PlannerDeckCommands["waypoint"]>
    rideConfig: Partial<PlannerDeckCommands["rideConfig"]>
    intent: Partial<PlannerDeckCommands["intent"]>
    onClearRoute: PlannerDeckCommands["onClearRoute"]
    onPlan: PlannerDeckCommands["onPlan"]
    onOpenLibrary: PlannerDeckCommands["onOpenLibrary"]
    onUseHome: PlannerDeckCommands["onUseHome"]
    onSaveHome: PlannerDeckCommands["onSaveHome"]
    onClearHome: PlannerDeckCommands["onClearHome"]
    onStartRide: PlannerDeckCommands["onStartRide"]
    onSaveOffline: PlannerDeckCommands["onSaveOffline"]
  }>
}

function renderDeck(overrides: RenderDeckOverrides = {}) {
  const vm = defaultViewModel()
  const cmds = defaultCommands()

  if (overrides.vm) {
    if (overrides.vm.waypoint) Object.assign(vm.waypoint, overrides.vm.waypoint)
    if (overrides.vm.rideConfig) Object.assign(vm.rideConfig, overrides.vm.rideConfig)
    if (overrides.vm.intent) Object.assign(vm.intent, overrides.vm.intent)
    if (overrides.vm.ui) Object.assign(vm.ui, overrides.vm.ui)
  }
  if (overrides.cmds) {
    if (overrides.cmds.waypoint) Object.assign(cmds.waypoint, overrides.cmds.waypoint)
    if (overrides.cmds.rideConfig) Object.assign(cmds.rideConfig, overrides.cmds.rideConfig)
    if (overrides.cmds.intent) Object.assign(cmds.intent, overrides.cmds.intent)
    if (overrides.cmds.onClearRoute !== undefined) cmds.onClearRoute = overrides.cmds.onClearRoute
    if (overrides.cmds.onPlan !== undefined) cmds.onPlan = overrides.cmds.onPlan
    if (overrides.cmds.onOpenLibrary !== undefined) cmds.onOpenLibrary = overrides.cmds.onOpenLibrary
    if (overrides.cmds.onUseHome !== undefined) cmds.onUseHome = overrides.cmds.onUseHome
    if (overrides.cmds.onSaveHome !== undefined) cmds.onSaveHome = overrides.cmds.onSaveHome
    if (overrides.cmds.onClearHome !== undefined) cmds.onClearHome = overrides.cmds.onClearHome
    if (overrides.cmds.onStartRide !== undefined) cmds.onStartRide = overrides.cmds.onStartRide
    if (overrides.cmds.onSaveOffline !== undefined) cmds.onSaveOffline = overrides.cmds.onSaveOffline
  }

  render(<PlannerDeck viewModel={vm} commands={cmds} />)
  return { vm, cmds }
}

describe("planner ride composer", () => {
  it("starts with one intent-first ride field and keeps routing machinery out of the first view", () => {
    renderDeck()

    expect(screen.getByRole("heading", { name: "Where do you want to ride?" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Where do you want to ride?" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "1-hour loop" })).toBeInTheDocument()
    expect(screen.queryByText("Router live")).not.toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Start" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Plan route" })).not.toBeInTheDocument()
  })

  it("does not pretend a missing start or unsaved Home destination is already configured", () => {
    renderDeck({ vm: { waypoint: { start: null, startQuery: "" } } })

    expect(screen.getByText(/location requested when you plan/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Home" })).not.toBeInTheDocument()
  })

  it("offers explicit local Home actions only when a rider has a start or saved Home", async () => {
    const user = userEvent.setup()
    const onUseHome = vi.fn()
    const onSaveHome = vi.fn()
    const onClearHome = vi.fn()
    renderDeck({
      vm: { ui: { home: { lat: 40.1, lon: -76.9, label: "Home" } } },
      cmds: { onUseHome, onSaveHome, onClearHome }
    })

    await user.click(screen.getByRole("button", { name: "Edit route" }))
    await user.click(screen.getByRole("button", { name: "Use Home" }))
    await user.click(screen.getByRole("button", { name: "Save start as Home" }))
    await user.click(screen.getByRole("button", { name: "Remove Home" }))

    expect(onUseHome).toHaveBeenCalledOnce()
    expect(onSaveHome).toHaveBeenCalledOnce()
    expect(onClearHome).toHaveBeenCalledOnce()
  })

  it("uses quick intents to fill the same ride request instead of opening a separate planner mode", async () => {
    const user = userEvent.setup()
    const onRidePrompt = vi.fn()
    renderDeck({ cmds: { intent: { onRidePrompt } } })

    await user.click(screen.getByRole("button", { name: "1-hour loop" }))
    expect(onRidePrompt).toHaveBeenCalledWith("1-hour loop")
  })

  it("reveals the detailed route builder only when the rider asks to edit the route", async () => {
    const user = userEvent.setup()
    renderDeck()

    await user.click(screen.getByRole("button", { name: "Edit route" }))
    expect(screen.getByRole("combobox", { name: "Start" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Plan route" })).toBeInTheDocument()
  })

  it("lets a rider package the selected route for local offline recovery before starting", async () => {
    const user = userEvent.setup()
    const onSaveOffline = vi.fn()
    renderDeck({
      vm: { ui: { selectedRoute: plannedRoute } },
      cmds: { onStartRide: vi.fn(), onSaveOffline }
    })

    await user.click(screen.getByRole("button", { name: "Edit route" }))
    await user.click(screen.getByRole("button", { name: "Offline pack" }))

    const dialog = await screen.findByRole("dialog", { name: plannedRoute.name })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText("Saved ride corridor")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Save offline pack" }))
    expect(onSaveOffline).toHaveBeenCalledWith(plannedRoute, {
      level: "saved-ride-corridor",
      corridorMiles: 10
    })
  })

  it("clears the active route so the rider can start a new one", async () => {
    const user = userEvent.setup()
    const onClearRoute = vi.fn()
    renderDeck({
      vm: { ui: { selectedRoute: plannedRoute } },
      cmds: { onClearRoute }
    })
    const ridePrompt = screen.getByRole("textbox", { name: "Where do you want to ride?" })
    await user.type(ridePrompt, "New Hope loop")

    await user.click(screen.getByRole("button", { name: "Clear route" }))

    expect(onClearRoute).toHaveBeenCalledOnce()
    expect(ridePrompt).toHaveValue("")
  })

  it("keeps clear route beside replan and start route while editing", async () => {
    const user = userEvent.setup()
    renderDeck({
      vm: { ui: { selectedRoute: plannedRoute } },
      cmds: { onStartRide: vi.fn(), onSaveOffline: vi.fn() }
    })

    await user.click(screen.getByRole("button", { name: "Edit route" }))

    expect(screen.getByRole("button", { name: "Clear route" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Replan" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Start Twisty route" })).toBeVisible()
  })

  it("keeps the primary plan action obvious and lets the rider minimize the deck", async () => {
    const user = userEvent.setup()
    const onPlan = vi.fn()
    renderDeck({
      vm: { waypoint: { finish: { lat: 39.8309, lon: -77.2311, label: "Gettysburg, Pennsylvania" } } },
      cmds: { onPlan }
    })

    await user.click(screen.getByRole("button", { name: "Edit route" }))
    const planBtn = screen.getByRole("button", { name: "Plan route" })
    expect(planBtn).toBeEnabled()
    expect(screen.getAllByRole("button", { name: /Minimize planner/i })).toHaveLength(1)
    await user.click(planBtn)
    expect(onPlan).toHaveBeenCalledOnce()

    await user.click(screen.getByRole("button", { name: "Minimize planner" }))
    expect(screen.queryByRole("heading", { name: /Pick two points/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Expand planner" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Plan route" })).toBeInTheDocument()
  })

  it("exposes time-boxed loops that only require a start point", async () => {
    const user = userEvent.setup()
    const onPlanModeChange = vi.fn()
    const onTargetMinutesChange = vi.fn()
    const onPlan = vi.fn()
    renderDeck({
      vm: { rideConfig: { planMode: "loop" } },
      cmds: {
        rideConfig: { onPlanModeChange, onTargetMinutesChange },
        onPlan
      }
    })

    await user.click(screen.getByRole("button", { name: "Edit route" }))
    expect(screen.queryByRole("combobox", { name: "Finish" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /plan.*2.*hour.*loop/i })).toBeEnabled()

    await user.click(screen.getByRole("button", { name: "90 min" }))
    await user.click(screen.getByRole("button", { name: /plan.*2.*hour.*loop/i }))

    expect(onTargetMinutesChange).toHaveBeenCalledWith(90)
    expect(onPlan).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: "Loop ride" })).toHaveAttribute("aria-pressed", "true")
  })

  it("lets a rider add and remove shaping stops from the map", async () => {
    const user = userEvent.setup()
    const onToggleAddVia = vi.fn()
    const onRemoveVia = vi.fn()
    renderDeck({
      vm: { waypoint: { via: [{ lat: 40.4, lon: -76.7, label: "Brewery stop" }] } },
      cmds: { waypoint: { onToggleAddVia, onRemoveVia } }
    })

    await user.click(screen.getByRole("button", { name: "Edit route" }))
    expect(screen.getByText("Brewery stop")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /add stop on map/i }))
    await user.click(screen.getByRole("button", { name: /remove brewery stop/i }))

    expect(onToggleAddVia).toHaveBeenCalledOnce()
    expect(onRemoveVia).toHaveBeenCalledWith(0)
  })

  it("offers reversible, ordered shaping controls without deleting stops", async () => {
    const user = userEvent.setup()
    const onMoveVia = vi.fn()
    const onReverseRoute = vi.fn()
    const onUndoRoutePoints = vi.fn()
    const onRedoRoutePoints = vi.fn()
    renderDeck({
      vm: {
        waypoint: {
          finish: { lat: 39.8309, lon: -77.2311, label: "Gettysburg, Pennsylvania" },
          via: [
            { lat: 40.4, lon: -76.7, label: "Gravel road" },
            { lat: 40.5, lon: -76.6, label: "Overlook" }
          ],
          canUndoRoutePoints: true,
          canRedoRoutePoints: true
        }
      },
      cmds: { waypoint: { onMoveVia, onReverseRoute, onUndoRoutePoints, onRedoRoutePoints } }
    })

    await user.click(screen.getByRole("button", { name: "Edit route" }))
    await user.click(screen.getByRole("button", { name: "Move Overlook earlier" }))
    await user.click(screen.getByRole("button", { name: "Reverse route" }))
    await user.click(screen.getByRole("button", { name: "Undo route edit" }))
    await user.click(screen.getByRole("button", { name: "Redo route edit" }))

    expect(screen.getByRole("button", { name: "Move Gravel road earlier" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Move Overlook later" })).toBeDisabled()
    expect(onMoveVia).toHaveBeenCalledWith(1, 0)
    expect(onReverseRoute).toHaveBeenCalledOnce()
    expect(onUndoRoutePoints).toHaveBeenCalledOnce()
    expect(onRedoRoutePoints).toHaveBeenCalledOnce()
  })

  it("makes road character and must-use locks explicit for each shaping stop", async () => {
    const user = userEvent.setup()
    const onSegmentProfileChange = vi.fn()
    const onToggleViaLock = vi.fn()
    renderDeck({
      vm: {
        waypoint: {
          finish: { lat: 39.8309, lon: -77.2311, label: "Gettysburg, Pennsylvania" },
          via: [{ lat: 40.4, lon: -76.7, label: "Gravel connector" }]
        },
        rideConfig: { segmentProfiles: ["twisty", "scenic"] }
      },
      cmds: {
        rideConfig: { onSegmentProfileChange },
        waypoint: { onToggleViaLock }
      }
    })

    await user.click(screen.getByRole("button", { name: "Edit route" }))
    await user.selectOptions(screen.getByLabelText("Ride style to Gravel connector"), "adventure")
    await user.click(screen.getByRole("button", { name: "Lock Gravel connector as must-use" }))

    expect(onSegmentProfileChange).toHaveBeenCalledWith(0, "adventure")
    expect(onToggleViaLock).toHaveBeenCalledWith(0)
    expect(screen.getByLabelText("Ride style to finish")).toHaveValue("scenic")
  })

  it("keeps explicit highway avoidance visible and editable", async () => {
    const user = userEvent.setup()
    const onAvoidHighwaysChange = vi.fn()
    renderDeck({
      vm: { rideConfig: { avoidHighways: true } },
      cmds: { rideConfig: { onAvoidHighwaysChange } }
    })

    await user.click(screen.getByRole("button", { name: "Edit route" }))
    const preference = screen.getByRole("checkbox", { name: /avoid highways/i })
    expect(preference).toBeChecked()
    await user.click(preference)
    expect(onAvoidHighwaysChange).toHaveBeenCalledWith(false)
  })

  it("minimizes the mobile sheet when the rider swipes its handle down", () => {
    renderDeck()

    const handle = screen.getByRole("button", { name: "Collapse planner sheet by dragging down or tapping" })
    fireEvent.pointerDown(handle, { pointerId: 7, clientY: 24, pointerType: "touch" })
    fireEvent.pointerUp(handle, { pointerId: 7, clientY: 112, pointerType: "touch" })

    expect(screen.getByRole("button", { name: "Expand planner" })).toBeInTheDocument()
  })

  it("keeps ride style and the library inside the explicit route editor", async () => {
    const user = userEvent.setup()
    renderDeck()
    await user.click(screen.getByRole("button", { name: "Edit route" }))

    const profileSwitch = screen.getByLabelText("Motorcycle routing profile")
    const library = screen.getByRole("button", { name: /Library/i })
    const start = screen.getByRole("combobox", { name: "Start" })

    expect(profileSwitch.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(library.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("accepts a free-form ride request and submits it from the omnibox", async () => {
    const user = userEvent.setup()
    const onRidePrompt = vi.fn()
    renderDeck({ cmds: { intent: { onRidePrompt } } })

    await user.type(
      screen.getByRole("textbox", { name: "Where do you want to ride?" }),
      "Give me two hours of gravel and a good brewery"
    )
    await user.click(screen.getByRole("button", { name: /find ride options/i }))

    expect(onRidePrompt).toHaveBeenCalledWith("Give me two hours of gravel and a good brewery")
  })

  it("lets a rider choose a rider-fit stop instead of silently adding one", async () => {
    const user = userEvent.setup()
    const onChooseStopIdea = vi.fn()
    renderDeck({
      vm: {
        intent: {
          stopIdeas: {
            provider: "google",
            rankedBy: "rider-fit",
            places: [{
              id: "google-favorite",
              name: "Local Favorite",
              label: "Local Favorite, New Hope, PA",
              region: "New Hope, PA",
              country: "",
              lat: 40.36,
              lon: -74.94,
              rating: 4.6,
              reviewCount: 1840,
              riderReason: "Destination brewery"
            }]
          }
        }
      },
      cmds: { intent: { onChooseStopIdea } }
    })

    expect(screen.getByText(/Quality, route proximity, and a mix of breweries/i)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /local favorite/i }))
    expect(onChooseStopIdea).toHaveBeenCalledWith({
      lat: 40.36,
      lon: -74.94,
      label: "Local Favorite, New Hope, PA"
    })
  })

  it("renders BikeProfilePicker inside the route editor pane", async () => {
    const user = userEvent.setup()
    renderDeck()

    await user.click(screen.getByRole("button", { name: "Edit route" }))

    expect(screen.getByRole("radiogroup", { name: /motorcycle bike profile preset/i })).toBeInTheDocument()
  })

  it("shows the road locks action dock entry point always when the deck is rendered", () => {
    renderDeck()
    expect(screen.getByRole("button", { name: /^Open road locks$/i })).toBeInTheDocument()
  })

  it("badges the road locks dock button when a must-use lock is active", () => {
    const mustLock = {
      id: "lock-must-1",
      mode: "must" as const,
      edgeIds: ["e1"],
      geometry: { type: "LineString" as const, coordinates: [[-77, 40] as [number, number], [-76.8, 40.1] as [number, number]] },
      orderedAnchors: [[-77, 40] as [number, number], [-76.8, 40.1] as [number, number]],
      fallbackToleranceMeters: 50,
      source: "manual" as const,
      confidence: "exact" as const,
      sourceRegionId: "us-pa",
      sourceGraphVersion: "v1",
      accessSnapshot: { highwayClass: "secondary" as const, motorcycleAccess: "yes" as const, generalAccess: "yes" as const, surface: "asphalt" as const, smoothness: "good" as const, tracktype: "unknown" as const, maxweightTonnes: null, seasonalUndated: false, activeConditions: [], routable: true },
      createdAt: "2026-07-20T00:00:00.000Z"
    }
    renderDeck({ vm: { rideConfig: { roadLocks: [mustLock] } } })

    const button = screen.getByRole("button", { name: /Open road locks, 1 must-use lock active/i })
    expect(button.querySelector(".road-locks-dock-count")?.getAttribute("data-tier")).toBe("must")
    expect(button.querySelector(".road-locks-dock-count")).toHaveTextContent("1")
  })

  it("opens the road locks drawer when the dock entry is tapped", async () => {
    const user = userEvent.setup()
    renderDeck()

    await user.click(screen.getByRole("button", { name: /^Open road locks$/i }))

    expect(await screen.findByRole("dialog", { name: "Road locks" })).toBeInTheDocument()
  })

  it("surfaces a profile mismatch hint on the dock when bikeProfile disagrees with the route profile", async () => {
    renderDeck({
      vm: {
        ui: { selectedRoute: { ...plannedRoute, profile: "adventure" } },
        rideConfig: { bikeProfile: { ...MOTORCYCLE_PROFILES[0]! } }
      }
    })

    expect(screen.getByText(/Profile mismatch/i)).toBeInTheDocument()
  })
})
