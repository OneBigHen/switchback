import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PlannerDeck } from "@/components/planner/PlannerDeck"
import type { PlannerDeckViewModel, PlannerDeckCommands } from "@/components/planner/PlannerDeckViewModel"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import { featureFlags } from "@/lib/domain/feature-flags"
import { usePlannerStore } from "@/stores/planner-store"
import type { PlannedRoute, Waypoint } from "@/lib/routing/types"
import type { ReactNode } from "react"

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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  // The sheet detent override now lives in the shared planner store; a test
  // that minimizes the deck must not leak "peek" into later tests.
  usePlannerStore.setState({ sheetDetentOverride: null })
})

function stubPhoneViewport() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 760px)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }))
}

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
      timeShaped: false,
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
      routesCount: 0,
      home: null
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
      onTimeShapedChange: vi.fn(),
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
    onCancelPlanning: vi.fn(),
    onOpenLibrary: vi.fn(),
    onUseCurrentLocation: vi.fn()
  }
}

interface RenderDeckOverrides {
  children?: ReactNode
  vm?: Partial<{
    waypoint: Partial<PlannerDeckViewModel["waypoint"]>
    rideConfig: Partial<PlannerDeckViewModel["rideConfig"]>
    intent: Partial<PlannerDeckViewModel["intent"]>
    ui: Partial<PlannerDeckViewModel["ui"]>
    lifecycle: Partial<PlannerDeckViewModel["lifecycle"]>
    providerHealth: Partial<NonNullable<PlannerDeckViewModel["providerHealth"]>>
  }>
  cmds?: Partial<{
    waypoint: Partial<PlannerDeckCommands["waypoint"]>
    rideConfig: Partial<PlannerDeckCommands["rideConfig"]>
    intent: Partial<PlannerDeckCommands["intent"]>
    onClearRoute: PlannerDeckCommands["onClearRoute"]
    onPlan: PlannerDeckCommands["onPlan"]
    onCancelPlanning: PlannerDeckCommands["onCancelPlanning"]
    onOpenLibrary: PlannerDeckCommands["onOpenLibrary"]
    onUseHome: PlannerDeckCommands["onUseHome"]
    onSaveHome: PlannerDeckCommands["onSaveHome"]
    onClearHome: PlannerDeckCommands["onClearHome"]
    onStartRide: PlannerDeckCommands["onStartRide"]
    onSaveOffline: PlannerDeckCommands["onSaveOffline"]
    onRetryProviderHealth: PlannerDeckCommands["onRetryProviderHealth"]
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
    if (overrides.vm.lifecycle) Object.assign(vm.lifecycle, overrides.vm.lifecycle)
    if (overrides.vm.providerHealth) Object.assign(vm.providerHealth!, overrides.vm.providerHealth)
  }
  if (overrides.cmds) {
    if (overrides.cmds.waypoint) Object.assign(cmds.waypoint, overrides.cmds.waypoint)
    if (overrides.cmds.rideConfig) Object.assign(cmds.rideConfig, overrides.cmds.rideConfig)
    if (overrides.cmds.intent) Object.assign(cmds.intent, overrides.cmds.intent)
    if (overrides.cmds.onClearRoute !== undefined) cmds.onClearRoute = overrides.cmds.onClearRoute
    if (overrides.cmds.onPlan !== undefined) cmds.onPlan = overrides.cmds.onPlan
    if (overrides.cmds.onCancelPlanning !== undefined) cmds.onCancelPlanning = overrides.cmds.onCancelPlanning
    if (overrides.cmds.onOpenLibrary !== undefined) cmds.onOpenLibrary = overrides.cmds.onOpenLibrary
    if (overrides.cmds.onUseHome !== undefined) cmds.onUseHome = overrides.cmds.onUseHome
    if (overrides.cmds.onSaveHome !== undefined) cmds.onSaveHome = overrides.cmds.onSaveHome
    if (overrides.cmds.onClearHome !== undefined) cmds.onClearHome = overrides.cmds.onClearHome
    if (overrides.cmds.onStartRide !== undefined) cmds.onStartRide = overrides.cmds.onStartRide
    if (overrides.cmds.onSaveOffline !== undefined) cmds.onSaveOffline = overrides.cmds.onSaveOffline
    if (overrides.cmds.onRetryProviderHealth !== undefined) cmds.onRetryProviderHealth = overrides.cmds.onRetryProviderHealth
  }

  const renderResult = render(<PlannerDeck viewModel={vm} commands={cmds}>{overrides.children}</PlannerDeck>)
  return { vm, cmds, ...renderResult }
}

describe("planner ride composer", () => {
  it("keeps the primary search and edit path reachable on a fresh phone planner", () => {
    stubPhoneViewport()
    renderDeck()

    expect(screen.getByPlaceholderText("Search a place or describe a ride")).toBeVisible()
    expect(screen.getByRole("button", { name: "Ride options" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Minimize planner" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "Expand planner" })).not.toBeInTheDocument()
  })

  it("offers a reachable map-tools path while the full sheet owns the phone viewport", async () => {
    const user = userEvent.setup()
    usePlannerStore.setState({ sheetDetentOverride: "full" })
    renderDeck()

    const mapTools = screen.getByRole("button", { name: "Show map tools" })
    expect(mapTools).toHaveAttribute("title", "Collapse planner to use map tools")
    await user.click(mapTools)

    expect(usePlannerStore.getState().sheetDetentOverride).toBe("half")
  })

  it("starts with one intent-first ride field and keeps routing machinery out of the first view", () => {
    renderDeck()

    expect(screen.getByPlaceholderText("Search a place or describe a ride")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Destination" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Loop" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Draw" })).toBeInTheDocument()
    expect(screen.queryByText("Router live")).not.toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Start" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Plan route" })).not.toBeInTheDocument()
  })

  it("keeps provider degradation out of the minimized peek surface", () => {
    usePlannerStore.setState({ sheetDetentOverride: "peek" })
    renderDeck({
      vm: { providerHealth: { status: "graphhopper-unavailable" } },
      cmds: { onRetryProviderHealth: vi.fn() }
    })

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument()
  })

  it("passes a GraphHopper degradation and Retry command through the deck boundary", async () => {
    const onRetryProviderHealth = vi.fn()
    renderDeck({
      vm: { providerHealth: { status: "graphhopper-unavailable" } },
      cmds: { onRetryProviderHealth }
    })

    expect(screen.getByRole("alert")).toHaveTextContent("The route service is temporarily unavailable")
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(onRetryProviderHealth).toHaveBeenCalledOnce()
  })

  it("keeps the provider-health deck boundary deterministic through hydration", async () => {
    usePlannerStore.setState({ sheetDetentOverride: null })
    const viewModel = defaultViewModel()
    const commands = defaultCommands()
    const markup = renderToString(<PlannerDeck viewModel={viewModel} commands={commands} />)
    document.body.innerHTML = markup
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const root = hydrateRoot(document.body, <PlannerDeck viewModel={viewModel} commands={commands} />)

    await act(async () => undefined)
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/hydration/i)
    root.unmount()
    consoleError.mockRestore()
  })

  it("does not pretend a missing start or unsaved Home destination is already configured", () => {
    renderDeck({ vm: { waypoint: { start: null, startQuery: "" } } })

    // The location affordance is an explicit action, not a claim that the
    // start is already set: it requests the browser location on click.
    expect(screen.getByRole("button", { name: /use current location/i })).toBeInTheDocument()
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

    await user.click(screen.getByRole("button", { name: "Ride options" }))
    await user.click(screen.getByRole("button", { name: "Use Home" }))
    await user.click(screen.getByRole("button", { name: "Save start as Home" }))
    await user.click(screen.getByRole("button", { name: "Remove Home" }))

    expect(onUseHome).toHaveBeenCalledOnce()
    expect(onSaveHome).toHaveBeenCalledOnce()
    expect(onClearHome).toHaveBeenCalledOnce()
  })

  it("uses trip-shape controls without mixing route personality into the composer", async () => {
    const user = userEvent.setup()
    const onPlanModeChange = vi.fn()
    renderDeck({ cmds: { rideConfig: { onPlanModeChange } } })

    await user.click(screen.getByRole("button", { name: "Loop" }))
    expect(onPlanModeChange).toHaveBeenCalledWith("loop")
    expect(screen.queryByRole("button", { name: "Best Ride" })).not.toBeInTheDocument()
  })

  it("reveals the detailed route builder only when the rider asks to edit the route", async () => {
    const user = userEvent.setup()
    renderDeck()

    await user.click(screen.getByRole("button", { name: "Ride options" }))
    expect(screen.getByRole("combobox", { name: "Start" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Plan route" })).toBeInTheDocument()
  })

  it("does not scroll the selected-route identity away when opening the editor", async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    const originalRequestAnimationFrame = window.requestAnimationFrame
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }) as typeof window.requestAnimationFrame

    try {
      stubPhoneViewport()
      renderDeck({
        vm: { ui: { selectedRoute: plannedRoute } },
        cmds: { onStartRide: vi.fn(), onSaveOffline: vi.fn() },
      })

      await user.click(screen.getByRole("button", { name: "Ride options" }))
      expect(screen.getByRole("button", { name: "Ride options" })).toHaveAttribute("aria-expanded", "true")
      expect(scrollIntoView).not.toHaveBeenCalled()
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
      window.requestAnimationFrame = originalRequestAnimationFrame
    }
  })

  it("keeps the edit action before the selected route rack in document flow", () => {
    const routeRack = <section className="route-rack" aria-label="Choose a route"><h2>Choose a route</h2></section>
    renderDeck({ vm: { ui: { selectedRoute: plannedRoute } }, children: routeRack })

    const edit = screen.getByRole("button", { name: "Ride options" })
    const rack = screen.getByRole("region", { name: "Choose a route" })
    expect(edit.compareDocumentPosition(rack) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("lets a rider package the selected route for local offline recovery before starting", async () => {
    const user = userEvent.setup()
    const onSaveOffline = vi.fn()
    renderDeck({
      vm: { ui: { selectedRoute: plannedRoute } },
      cmds: { onStartRide: vi.fn(), onSaveOffline }
    })

    await user.click(screen.getByRole("button", { name: "Ride options" }))
    await user.click(screen.getByRole("button", { name: "Offline pack" }))

    const dialog = await screen.findByRole("dialog", { name: `Offline pack for ${plannedRoute.name}` })
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
    const ridePrompt = screen.getByPlaceholderText("Search a place or describe a ride")
    await user.type(ridePrompt, "New Hope loop")

    await user.click(screen.getByRole("button", { name: "Clear route" }))

    expect(onClearRoute).toHaveBeenCalledOnce()
    expect(ridePrompt).toHaveValue("")
  })

  it("keeps starting a new route available when a selected route is minimized", async () => {
    const user = userEvent.setup()
    const onClearRoute = vi.fn()
    stubPhoneViewport()
    renderDeck({
      vm: { ui: { selectedRoute: plannedRoute } },
      cmds: { onClearRoute, onStartRide: vi.fn() }
    })

    await user.click(screen.getByRole("button", { name: "Minimize planner" }))
    expect(screen.getByRole("button", { name: "Start Twisty route" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Expand planner" })).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Expand planner" }))
    expect(screen.getByPlaceholderText("Search a place or describe a ride")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Minimize planner" }))
    await user.click(screen.getByRole("button", { name: "Start new route" }))

    expect(onClearRoute).toHaveBeenCalledOnce()
    expect(screen.queryByRole("button", { name: "1-hour loop" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Twisties" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Scenic" })).not.toBeInTheDocument()
  })

  it("keeps clear route beside replan and start route while editing", async () => {
    const user = userEvent.setup()
    renderDeck({
      vm: { ui: { selectedRoute: plannedRoute } },
      cmds: { onStartRide: vi.fn(), onSaveOffline: vi.fn() }
    })

    await user.click(screen.getByRole("button", { name: "Ride options" }))

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

    await user.click(screen.getByRole("button", { name: "Ride options" }))
    const planBtn = screen.getByRole("button", { name: "Plan route" })
    expect(planBtn).toBeEnabled()
    expect(screen.getAllByRole("button", { name: /Minimize planner/i })).toHaveLength(1)
    await user.click(planBtn)
    expect(onPlan).toHaveBeenCalledOnce()

    await user.click(screen.getByRole("button", { name: "Minimize planner" }))
    expect(screen.queryByRole("heading", { name: /Pick two points/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Expand planner" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Plan route" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Open road locks/i })).not.toBeInTheDocument()
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

    await user.click(screen.getByRole("button", { name: "Ride options" }))
    expect(screen.queryByRole("combobox", { name: "Finish" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /plan.*2.*hour.*loop/i })).toBeEnabled()

    await user.click(screen.getByRole("button", { name: "90 min" }))
    await user.click(screen.getByRole("button", { name: /plan.*2.*hour.*loop/i }))

    expect(onTargetMinutesChange).toHaveBeenCalledWith(90)
    expect(onPlan).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: "Loop" })).toHaveAttribute("aria-pressed", "true")
  })

  it("lets a rider add and remove shaping stops from the map", async () => {
    const user = userEvent.setup()
    const onToggleAddVia = vi.fn()
    const onRemoveVia = vi.fn()
    renderDeck({
      vm: { waypoint: { via: [{ lat: 40.4, lon: -76.7, label: "Brewery stop" }] } },
      cmds: { waypoint: { onToggleAddVia, onRemoveVia } }
    })

    await user.click(screen.getByRole("button", { name: "Ride options" }))
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

    await user.click(screen.getByRole("button", { name: "Ride options" }))
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
    // The per-stop must-use toggle is a graph-matched road-requirement
    // surface (SB-006): it is disabled by default and only exercised here
    // with the flag enabled.
    featureFlags.roadRequirements = true
    try {
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

      await user.click(screen.getByRole("button", { name: "Ride options" }))
      await user.selectOptions(screen.getByLabelText("Ride style to Gravel connector"), "adventure")
      await user.click(screen.getByRole("button", { name: "Lock Gravel connector as must-use" }))

      expect(onSegmentProfileChange).toHaveBeenCalledWith(0, "adventure")
      expect(onToggleViaLock).toHaveBeenCalledWith(0)
      expect(screen.getByLabelText("Ride style to finish")).toHaveValue("scenic")
    } finally {
      featureFlags.roadRequirements = false
    }
  })

  it("keeps explicit highway avoidance visible and editable", async () => {
    const user = userEvent.setup()
    const onAvoidHighwaysChange = vi.fn()
    renderDeck({
      vm: { rideConfig: { avoidHighways: true } },
      cmds: { rideConfig: { onAvoidHighwaysChange } }
    })

    await user.click(screen.getByRole("button", { name: "Ride options" }))
    const preference = screen.getByRole("checkbox", { name: /avoid highways/i })
    expect(preference).toBeChecked()
    await user.click(preference)
    expect(onAvoidHighwaysChange).toHaveBeenCalledWith(false)
  })

  it("minimizes the mobile sheet when the rider swipes its handle down", () => {
    renderDeck()

    const handle = screen.getByRole("button", { name: /expand planner sheet/i })
    // A real swipe resolves as pointerdown → pointerup → click on the handle.
    fireEvent.pointerDown(handle, { pointerId: 7, clientY: 24, pointerType: "touch" })
    fireEvent.pointerUp(handle, { pointerId: 7, clientY: 112, pointerType: "touch" })
    fireEvent.click(handle)

    expect(screen.getByRole("button", { name: "Expand planner" })).toBeInTheDocument()
  })

  it("keeps ride style and the library inside the explicit route editor", async () => {
    const user = userEvent.setup()
    renderDeck()
    await user.click(screen.getByRole("button", { name: "Ride options" }))

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
      screen.getByPlaceholderText("Search a place or describe a ride"),
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

    expect(screen.getByText("Rider-fit stop ideas")).toBeInTheDocument()
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

    await user.click(screen.getByRole("button", { name: "Ride options" }))

    expect(screen.getByRole("radiogroup", { name: /motorcycle bike profile preset/i })).toBeInTheDocument()
  })

  it("does not show the road locks action dock entry point before a route is selected", () => {
    renderDeck()
    expect(screen.queryByRole("button", { name: /^Open road locks$/i })).not.toBeInTheDocument()
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
    renderDeck({ vm: { ui: { selectedRoute: plannedRoute }, rideConfig: { roadLocks: [mustLock] } } })

    const button = screen.getByRole("button", { name: /Open road locks, 1 must-use lock active/i })
    expect(button.querySelector(".road-locks-dock-count")?.getAttribute("data-tier")).toBe("must")
    expect(button.querySelector(".road-locks-dock-count")).toHaveTextContent("1")
  })

  it("opens the road locks drawer when the dock entry is tapped", async () => {
    const user = userEvent.setup()
    renderDeck({ vm: { ui: { selectedRoute: plannedRoute } } })

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

describe("planner lifecycle progress (Phase 6)", () => {
  it("shows continuous phase status in the omnibox with an accessible live region while planning", () => {
    renderDeck({ vm: { lifecycle: { phase: "routing-primary", startedAt: Date.now() - 4_000, label: "Routing your ride…" } } })
    const status = screen.getByRole("status", { name: "Ride planning progress" })
    expect(status).toHaveTextContent("Routing your ride…")
    expect(status).toHaveTextContent("4s")
  })

  it("exposes Cancel during an active lifecycle and fires the cancel command", async () => {
    const user = userEvent.setup()
    const onCancelPlanning = vi.fn()
    renderDeck({
      vm: { lifecycle: { phase: "alternatives", startedAt: Date.now(), label: "Adding alternatives…" } },
      cmds: { onCancelPlanning }
    })
    const cancel = screen.getByRole("button", { name: "Cancel planning" })
    expect(cancel).toBeInTheDocument()
    await user.click(cancel)
    expect(onCancelPlanning).toHaveBeenCalledOnce()
  })

  it("hides the progress status once the lifecycle is ready", () => {
    renderDeck({ vm: { lifecycle: { phase: "ready", startedAt: null, label: "Ride ready" } } })
    expect(screen.queryByRole("status", { name: "Ride planning progress" })).not.toBeInTheDocument()
  })
})

describe("planner mobile flow stages (SB-025)", () => {
  it("labels an explicitly selected alternative as Prepare instead of Choose", () => {
    renderDeck({
      vm: {
        lifecycle: { phase: "ready", startedAt: null, label: "Ride ready" },
        ui: { selectedRoute: plannedRoute, routesCount: 3 }
      }
    })

    expect(screen.getByLabelText("Planning stage: Prepare")).toBeInTheDocument()
  })

  it("preserves the selected route identity when returning from edit to the minimized peek", async () => {
    const user = userEvent.setup()
    renderDeck({
      vm: {
        lifecycle: { phase: "ready", startedAt: null, label: "Ride ready" },
        ui: { selectedRoute: plannedRoute, routesCount: 3 }
      }
    })

    await user.click(screen.getByRole("button", { name: "Ride options" }))
    expect(screen.getByRole("combobox", { name: "Start" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Ride options" }))
    await user.click(screen.getByRole("button", { name: "Minimize planner" }))

    expect(screen.getByText("Deck route")).toBeInTheDocument()
    expect(screen.getByLabelText("Planning stage: Prepare")).toBeInTheDocument()
  })

  it("returns the viewport to route choices when planning finishes after editing", async () => {
    const user = userEvent.setup()
    stubPhoneViewport()
    const routeRack = <section className="route-rack"><h2>Choose a route</h2></section>
    const { vm, rerender } = renderDeck({ children: routeRack })

    await user.click(screen.getByRole("button", { name: "Ride options" }))
    expect(screen.getByRole("combobox", { name: "Start" })).toBeInTheDocument()

    expect(screen.getByRole("heading", { name: "Choose a route" })).toBeInTheDocument()

    vm.lifecycle.phase = "ready"
    vm.lifecycle.label = "Ride ready"
    vm.ui.routesCount = 2
    vm.ui.selectedRoute = null
    rerender(<PlannerDeck viewModel={vm} commands={{ ...defaultCommands() }}>{routeRack}</PlannerDeck>)

    await waitFor(() => {
      expect(screen.queryByRole("combobox", { name: "Start" })).not.toBeInTheDocument()
      expect(screen.getByLabelText("Planning stage: Choose")).toBeInTheDocument()
      expect(screen.getByRole("heading", { name: "Choose a route" })).toBeInTheDocument()
      expect(usePlannerStore.getState().sheetDetentOverride).toBe("half")
    })
  })

  it("shows Choose and returns to the route rack while alternatives are still loading", async () => {
    const user = userEvent.setup()
    const routeRack = <section className="route-rack"><h2>Choose a route</h2></section>
    const { vm, rerender } = renderDeck({ children: routeRack })

    await user.click(screen.getByRole("button", { name: "Ride options" }))

    expect(screen.getByRole("heading", { name: "Choose a route" })).toBeInTheDocument()

    vm.lifecycle.phase = "alternatives"
    vm.lifecycle.label = "Adding alternatives…"
    vm.ui.routesCount = 2
    vm.ui.selectedRoute = null
    rerender(<PlannerDeck viewModel={vm} commands={{ ...defaultCommands() }}>{routeRack}</PlannerDeck>)

    await waitFor(() => {
      expect(screen.getByLabelText("Planning stage: Choose")).toBeInTheDocument()
      expect(screen.getByRole("heading", { name: "Choose a route" })).toBeInTheDocument()
    })
  })

  it("reclaims the intent-home stage row because the omnibox already communicates Search", () => {
    renderDeck()
    expect(screen.queryByLabelText("Planning stage: Search")).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText("Search a place or describe a ride")).toBeVisible()
  })

  it("labels a ready single route as Prepare", () => {
    const route: PlannedRoute = {
      id: "r1", name: "Ride", profile: "twisty",
      geometry: [[-76.9, 40.2], [-76.8, 40.3]], waypoints: [], instructions: [],
      distanceMiles: 12, durationMinutes: 25, ascentMeters: null, descentMeters: null,
      twistiness: 70, turnCount: 12, roadMix: {}, surfaceMix: {},
      routingSource: "live", previewOnly: false
    }
    renderDeck({
      vm: { ui: { status: "ready", error: null, savedCount: 1, selectedRoute: route, home: null, routesCount: 1 } }
    })
    expect(screen.getByLabelText("Planning stage: Prepare")).toBeInTheDocument()
  })
})
