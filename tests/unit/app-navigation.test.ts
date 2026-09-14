import { describe, expect, it } from "vitest"
import {
  appModeForState,
  appNavigationReducer,
  createInitialAppNavigationState,
  destinationFromLocation
} from "@/lib/client/app-navigation"

describe("typed application navigation", () => {
  it("starts on the plan destination", () => {
    const initial = createInitialAppNavigationState("auto")

    expect(initial.destination).toBe("plan")
    expect(initial.overlays).toEqual([])
    expect(initial.backStack).toEqual([])
  })

  it("moves plan → saved → explore → settings without duplicating routing state", () => {
    const initial = createInitialAppNavigationState("auto")
    const saved = appNavigationReducer(initial, { type: "select_destination", destination: "saved" })

    expect(saved.destination).toBe("saved")
    expect(saved.overlays).toEqual([])
    expect(saved.backStack.at(-1)).toEqual({ kind: "destination", destination: "plan" })

    const explore = appNavigationReducer(saved, { type: "select_destination", destination: "explore" })
    expect(explore.destination).toBe("explore")
    expect(explore.backStack.at(-1)).toEqual({ kind: "destination", destination: "saved" })

    const settings = appNavigationReducer(explore, { type: "select_destination", destination: "settings" })
    expect(settings.destination).toBe("settings")
    expect(settings.backStack.at(-1)).toEqual({ kind: "destination", destination: "explore" })
  })

  it("clears open advanced overlays when the destination changes", () => {
    const initial = createInitialAppNavigationState("auto")
    const withAdvanced = appNavigationReducer(initial, { type: "open_overlay", overlay: "advanced-settings" })
    const rides = appNavigationReducer(withAdvanced, { type: "select_destination", destination: "saved" })

    expect(rides.destination).toBe("saved")
    expect(rides.overlays).toEqual([])
  })

  it("keeps the active destination and dismisses overlays on re-select", () => {
    const initial = createInitialAppNavigationState("auto")

    expect(appNavigationReducer(initial, { type: "select_destination", destination: "plan" })).toBe(initial)

    const withAdvanced = appNavigationReducer(initial, { type: "open_overlay", overlay: "advanced-settings" })
    const dismissed = appNavigationReducer(withAdvanced, { type: "select_destination", destination: "plan" })

    expect(dismissed.destination).toBe("plan")
    expect(dismissed.overlays).toEqual([])
    expect(dismissed.backStack).toEqual([])
  })

  it("pushes and closes typed overlays in last-opened order", () => {
    const initial = createInitialAppNavigationState("light")
    const withWeather = appNavigationReducer(initial, { type: "open_overlay", overlay: "weather" })
    const withDownloads = appNavigationReducer(withWeather, { type: "open_overlay", overlay: "downloads" })

    expect(withDownloads.overlays).toEqual(["weather", "downloads"])
    expect(appNavigationReducer(withDownloads, { type: "back" }).overlays).toEqual(["weather"])
  })

  it("does not add the same overlay twice", () => {
    const initial = createInitialAppNavigationState("dark")
    const once = appNavigationReducer(initial, { type: "open_overlay", overlay: "advanced-settings" })
    const twice = appNavigationReducer(once, { type: "open_overlay", overlay: "advanced-settings" })

    expect(twice.overlays).toEqual(["advanced-settings"])
  })

  it("replaces advanced settings when region downloads opens", () => {
    const initial = createInitialAppNavigationState("dark")
    const advanced = appNavigationReducer(initial, { type: "open_overlay", overlay: "advanced-settings" })
    const downloads = appNavigationReducer(advanced, { type: "open_overlay", overlay: "downloads" })

    expect(downloads.overlays).toEqual(["downloads"])
  })

  it("closes overlays with back before changing destination", () => {
    const initial = createInitialAppNavigationState("auto")
    const saved = appNavigationReducer(initial, { type: "select_destination", destination: "saved" })
    const withAdvanced = appNavigationReducer(saved, { type: "open_overlay", overlay: "advanced-settings" })

    const afterBack = appNavigationReducer(withAdvanced, { type: "back" })

    expect(afterBack.overlays).toEqual([])
    expect(afterBack.destination).toBe("saved")

    const backToPlan = appNavigationReducer(afterBack, { type: "back" })

    expect(backToPlan.destination).toBe("plan")
    expect(backToPlan.backStack).toEqual([])
  })

  it("migrates superseded tabs onto the approved destinations", () => {
    expect(destinationFromLocation("https://switchback.app/?tab=library")).toEqual({
      destination: "saved",
      overlays: []
    })
    expect(destinationFromLocation("https://switchback.app/?tab=rides")).toEqual({
      destination: "saved",
      overlays: []
    })
    expect(destinationFromLocation("https://switchback.app/?tab=discover")).toEqual({
      destination: "explore",
      overlays: []
    })
  })

  it("maps legacy ?tab=profile to the Settings destination", () => {
    expect(destinationFromLocation("https://switchback.app/?tab=profile")).toEqual({
      destination: "settings",
      overlays: []
    })
  })

  it("maps legacy ?tab=record to plan without starting a recording", () => {
    expect(destinationFromLocation("https://switchback.app/?tab=record")).toEqual({
      destination: "plan",
      overlays: []
    })
  })

  it("reads current destinations and rejects unknown tab values", () => {
    expect(destinationFromLocation("https://switchback.app/?tab=saved")).toEqual({ destination: "saved", overlays: [] })
    expect(destinationFromLocation("https://switchback.app/?tab=explore")).toEqual({ destination: "explore", overlays: [] })
    expect(destinationFromLocation("https://switchback.app/?tab=settings")).toEqual({ destination: "settings", overlays: [] })
    expect(destinationFromLocation("https://switchback.app/?tab=not-a-tab")).toEqual({ destination: "plan", overlays: [] })
    expect(destinationFromLocation("https://switchback.app/plan")).toEqual({ destination: "plan", overlays: [] })
  })

  it("opens the Record surface for an explicit ?open=record hand-off", () => {
    // Pages outside the app shell (the GPX Library) hand the rider back to
    // Record this way. Showing the panel still starts no recording.
    expect(destinationFromLocation("https://switchback.app/?open=record")).toEqual({
      destination: "plan",
      overlays: ["record"]
    })
    expect(destinationFromLocation("https://switchback.app/?tab=explore&open=record")).toEqual({
      destination: "explore",
      overlays: ["record"]
    })
  })

  it("restores a URL-derived destination and replaces overlays without pushing history", () => {
    const initial = createInitialAppNavigationState("auto")
    const withAdvanced = appNavigationReducer(initial, { type: "open_overlay", overlay: "advanced-settings" })

    const restored = appNavigationReducer(withAdvanced, {
      type: "restore_destination",
      destination: "saved",
      overlays: []
    })

    expect(restored.destination).toBe("saved")
    expect(restored.overlays).toEqual([])
    expect(restored.backStack).toEqual([])
  })

  it("restores the Settings destination for a legacy profile deep link", () => {
    const initial = createInitialAppNavigationState("auto")
    const derived = destinationFromLocation("https://switchback.app/?tab=profile")

    const restored = appNavigationReducer(initial, {
      type: "restore_destination",
      destination: derived.destination,
      overlays: derived.overlays
    })

    expect(restored.destination).toBe("settings")
    expect(restored.overlays).toEqual([])
  })

  it("derives shell modes from destination state", () => {
    expect(appModeForState({ surface: "planner", destination: "plan", hasPlan: false })).toBe("explore")
    expect(appModeForState({ surface: "planner", destination: "plan", hasPlan: true })).toBe("plan")
    expect(appModeForState({ surface: "ride", destination: "plan", hasPlan: true })).toBe("ride")
    expect(appModeForState({ surface: "planner", destination: "saved", hasPlan: false })).toBe("library")
    expect(appModeForState({ surface: "planner", destination: "settings", hasPlan: false })).toBe("explore")
  })

  it("keeps theme preference typed and independent from navigation", () => {
    const initial = createInitialAppNavigationState("auto")
    const next = appNavigationReducer(initial, { type: "set_theme", theme: "dark" })

    expect(next.theme).toBe("dark")
    expect(next.destination).toBe("plan")
  })
})
