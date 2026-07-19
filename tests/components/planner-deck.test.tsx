import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PlannerDeck } from "@/components/planner/PlannerDeck"
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

function renderDeck(overrides: Partial<Parameters<typeof PlannerDeck>[0]> = {}) {
  const props: Parameters<typeof PlannerDeck>[0] = {
    start: harrisburg,
    finish: null,
    startQuery: harrisburg.label!,
    finishQuery: "",
    armedPoint: null,
    profile: "twisty",
    status: "idle",
    error: null,
    curvatureVisible: true,
    avoidHighways: false,
    savedCount: 419,
    via: [],
    addingVia: false,
    segmentProfiles: ["twisty"],
    avoidAreaCount: 0,
    canUndoRoutePoints: false,
    canRedoRoutePoints: false,
    planMode: "destination",
    targetMinutes: 120,
    intentStatus: "idle",
    intentSummary: null,
    stopIdeas: null,
    researchStatus: "idle",
    researchSources: [],
    onPointChange: vi.fn(),
    onPointQueryChange: vi.fn(),
    onArm: vi.fn(),
    onSwap: vi.fn(),
    onProfileChange: vi.fn(),
    onCurvatureChange: vi.fn(),
    onAvoidHighwaysChange: vi.fn(),
    onPlanModeChange: vi.fn(),
    onTargetMinutesChange: vi.fn(),
    onRidePrompt: vi.fn(),
    onChooseStopIdea: vi.fn(),
    onResearchRideIdea: vi.fn(),
    onToggleAddVia: vi.fn(),
    onRemoveVia: vi.fn(),
    onMoveVia: vi.fn(),
    onReverseRoute: vi.fn(),
    onUndoRoutePoints: vi.fn(),
    onRedoRoutePoints: vi.fn(),
    onSegmentProfileChange: vi.fn(),
    onToggleViaLock: vi.fn(),
    onRemoveAvoidArea: vi.fn(),
    onClearRoute: vi.fn(),
    onPlan: vi.fn(),
    onOpenLibrary: vi.fn(),
    ...overrides
  }
  render(<PlannerDeck {...props} />)
  return props
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
    renderDeck({ start: null, startQuery: "" })

    expect(screen.getByText(/location requested when you plan/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Home" })).not.toBeInTheDocument()
  })

  it("offers explicit local Home actions only when a rider has a start or saved Home", async () => {
    const user = userEvent.setup()
    const onUseHome = vi.fn()
    const onSaveHome = vi.fn()
    const onClearHome = vi.fn()
    renderDeck({
      home: { lat: 40.1, lon: -76.9, label: "Home" },
      onUseHome,
      onSaveHome,
      onClearHome
    } as never)

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
    renderDeck({ onRidePrompt })

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
    renderDeck({ selectedRoute: plannedRoute, onStartRide: vi.fn(), onSaveOffline })

    await user.click(screen.getByRole("button", { name: "Edit route" }))
    await user.click(screen.getByRole("button", { name: "Offline pack" }))
    expect(onSaveOffline).toHaveBeenCalledWith(plannedRoute)
  })

  it("clears the active route so the rider can start a new one", async () => {
    const user = userEvent.setup()
    const onClearRoute = vi.fn()
    renderDeck({ selectedRoute: plannedRoute, onClearRoute } as never)
    const ridePrompt = screen.getByRole("textbox", { name: "Where do you want to ride?" })
    await user.type(ridePrompt, "New Hope loop")

    await user.click(screen.getByRole("button", { name: "Clear route" }))

    expect(onClearRoute).toHaveBeenCalledOnce()
    expect(ridePrompt).toHaveValue("")
  })

  it("keeps clear route beside replan and start route while editing", async () => {
    const user = userEvent.setup()
    renderDeck({ selectedRoute: plannedRoute, onStartRide: vi.fn(), onSaveOffline: vi.fn() })

    await user.click(screen.getByRole("button", { name: "Edit route" }))

    expect(screen.getByRole("button", { name: "Clear route" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Replan" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Start Twisty route" })).toBeVisible()
  })

  it("keeps the primary plan action obvious and lets the rider minimize the deck", async () => {
    const user = userEvent.setup()
    const onPlan = vi.fn()
    renderDeck({
      finish: { lat: 39.8309, lon: -77.2311, label: "Gettysburg, Pennsylvania" },
      onPlan
    })

    await user.click(screen.getByRole("button", { name: "Edit route" }))
    const plan = screen.getByRole("button", { name: "Plan route" })
    expect(plan).toBeEnabled()
    expect(screen.getAllByRole("button", { name: /Minimize planner/i })).toHaveLength(1)
    await user.click(plan)
    expect(onPlan).toHaveBeenCalledOnce()

    await user.click(screen.getByRole("button", { name: "Minimize planner" }))
    expect(screen.queryByRole("heading", { name: /Pick two points/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Expand planner" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Plan route" })).toBeInTheDocument()
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
    renderDeck({ onRidePrompt })

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
      onChooseStopIdea,
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
    })

    expect(screen.getByText(/Quality, route proximity, and a mix of breweries/i)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /local favorite/i }))
    expect(onChooseStopIdea).toHaveBeenCalledWith({
      lat: 40.36,
      lon: -74.94,
      label: "Local Favorite, New Hope, PA"
    })
  })

  it("exposes time-boxed loops that only require a start point", async () => {
    const user = userEvent.setup()
    const onPlanModeChange = vi.fn()
    const onTargetMinutesChange = vi.fn()
    const onPlan = vi.fn()
    renderDeck({
      planMode: "loop",
      onPlanModeChange,
      onTargetMinutesChange,
      onPlan
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
      via: [{ lat: 40.4, lon: -76.7, label: "Brewery stop" }],
      onToggleAddVia,
      onRemoveVia
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
      finish: { lat: 39.8309, lon: -77.2311, label: "Gettysburg, Pennsylvania" },
      via: [
        { lat: 40.4, lon: -76.7, label: "Gravel road" },
        { lat: 40.5, lon: -76.6, label: "Overlook" }
      ],
      canUndoRoutePoints: true,
      canRedoRoutePoints: true,
      onMoveVia,
      onReverseRoute,
      onUndoRoutePoints,
      onRedoRoutePoints
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
      finish: { lat: 39.8309, lon: -77.2311, label: "Gettysburg, Pennsylvania" },
      via: [{ lat: 40.4, lon: -76.7, label: "Gravel connector" }],
      segmentProfiles: ["twisty", "scenic"],
      onSegmentProfileChange,
      onToggleViaLock
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
    renderDeck({ avoidHighways: true, onAvoidHighwaysChange })

    await user.click(screen.getByRole("button", { name: "Edit route" }))
    const preference = screen.getByRole("checkbox", { name: /avoid highways/i })
    expect(preference).toBeChecked()
    await user.click(preference)
    expect(onAvoidHighwaysChange).toHaveBeenCalledWith(false)
  })
})
