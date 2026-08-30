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

  it("moves plan → rides → discover without duplicating routing state", () => {
    const initial = createInitialAppNavigationState("auto")
    const rides = appNavigationReducer(initial, { type: "select_destination", destination: "rides" })

    expect(rides.destination).toBe("rides")
    expect(rides.overlays).toEqual([])
    expect(rides.backStack.at(-1)).toEqual({ kind: "destination", destination: "plan" })

    const discover = appNavigationReducer(rides, { type: "select_destination", destination: "discover" })

    expect(discover.destination).toBe("discover")
    expect(discover.backStack.at(-1)).toEqual({ kind: "destination", destination: "rides" })
  })

  it("clears open overlays when the destination changes", () => {
    const initial = createInitialAppNavigationState("auto")
    const withSettings = appNavigationReducer(initial, { type: "open_overlay", overlay: "settings" })
    const rides = appNavigationReducer(withSettings, { type: "select_destination", destination: "rides" })

    expect(rides.destination).toBe("rides")
    expect(rides.overlays).toEqual([])
  })

  it("keeps the active destination and dismisses overlays on re-select", () => {
    const initial = createInitialAppNavigationState("auto")

    expect(appNavigationReducer(initial, { type: "select_destination", destination: "plan" })).toBe(initial)

    const withSettings = appNavigationReducer(initial, { type: "open_overlay", overlay: "settings" })
    const dismissed = appNavigationReducer(withSettings, { type: "select_destination", destination: "plan" })

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
    const once = appNavigationReducer(initial, { type: "open_overlay", overlay: "settings" })
    const twice = appNavigationReducer(once, { type: "open_overlay", overlay: "settings" })

    expect(twice.overlays).toEqual(["settings"])
  })

  it("closes overlays with back before changing destination", () => {
    const initial = createInitialAppNavigationState("auto")
    const rides = appNavigationReducer(initial, { type: "select_destination", destination: "rides" })
    const withSettings = appNavigationReducer(rides, { type: "open_overlay", overlay: "settings" })

    const afterBack = appNavigationReducer(withSettings, { type: "back" })

    // First back closes the overlay; the destination is untouched.
    expect(afterBack.overlays).toEqual([])
    expect(afterBack.destination).toBe("rides")

    const backToPlan = appNavigationReducer(afterBack, { type: "back" })

    expect(backToPlan.destination).toBe("plan")
    expect(backToPlan.backStack).toEqual([])
  })

  it("maps legacy ?tab=library to the rides destination", () => {
    expect(destinationFromLocation("https://switchback.app/?tab=library")).toEqual({
      destination: "rides",
      overlays: []
    })
  })

  it("maps legacy ?tab=profile to plan with the settings overlay open", () => {
    expect(destinationFromLocation("https://switchback.app/?tab=profile")).toEqual({
      destination: "plan",
      overlays: ["settings"]
    })
  })

  it("maps legacy ?tab=record to plan without starting a recording", () => {
    expect(destinationFromLocation("https://switchback.app/?tab=record")).toEqual({
      destination: "plan",
      overlays: []
    })
  })

  it("reads V2 destinations and rejects unknown tab values", () => {
    expect(destinationFromLocation("https://switchback.app/?tab=rides")).toEqual({
      destination: "rides",
      overlays: []
    })
    expect(destinationFromLocation("https://switchback.app/?tab=discover")).toEqual({
      destination: "discover",
      overlays: []
    })
    expect(destinationFromLocation("https://switchback.app/?tab=not-a-tab")).toEqual({
      destination: "plan",
      overlays: []
    })
    expect(destinationFromLocation("https://switchback.app/plan")).toEqual({
      destination: "plan",
      overlays: []
    })
  })

  it("restores a URL-derived destination and replaces overlays without pushing history", () => {
    const initial = createInitialAppNavigationState("auto")
    const withSettings = appNavigationReducer(initial, { type: "open_overlay", overlay: "settings" })

    const restored = appNavigationReducer(withSettings, {
      type: "restore_destination",
      destination: "rides",
      overlays: []
    })

    expect(restored.destination).toBe("rides")
    expect(restored.overlays).toEqual([])
    expect(restored.backStack).toEqual([])
  })

  it("restores the settings overlay for a legacy profile deep link", () => {
    const initial = createInitialAppNavigationState("auto")

    const restored = appNavigationReducer(initial, {
      type: "restore_destination",
      destination: "plan",
      overlays: ["settings"]
    })

    expect(restored.destination).toBe("plan")
    expect(restored.overlays).toEqual(["settings"])
  })

  it("derives shell modes from destination state", () => {
    expect(appModeForState({ surface: "planner", destination: "plan", hasPlan: false })).toBe("explore")
    expect(appModeForState({ surface: "planner", destination: "plan", hasPlan: true })).toBe("plan")
    expect(appModeForState({ surface: "ride", destination: "plan", hasPlan: true })).toBe("ride")
    expect(appModeForState({ surface: "planner", destination: "rides", hasPlan: false })).toBe("library")
  })

  it("keeps theme preference typed and independent from navigation", () => {
    const initial = createInitialAppNavigationState("auto")
    const next = appNavigationReducer(initial, { type: "set_theme", theme: "dark" })

    expect(next.theme).toBe("dark")
    expect(next.destination).toBe("plan")
  })
})
