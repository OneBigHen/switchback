import { describe, expect, it } from "vitest"
import {
  appNavigationReducer,
  createInitialAppNavigationState
} from "@/lib/client/app-navigation"

describe("typed application navigation", () => {
  it("switches tabs without duplicating routing state", () => {
    const initial = createInitialAppNavigationState("auto")
    const next = appNavigationReducer(initial, { type: "select_tab", tab: "record" })

    expect(next.activeTab).toBe("record")
    expect(next.overlays).toEqual([])
    expect(next.backStack.at(-1)).toEqual({ kind: "tab", tab: "plan" })
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
    const once = appNavigationReducer(initial, { type: "open_overlay", overlay: "spotify" })
    const twice = appNavigationReducer(once, { type: "open_overlay", overlay: "spotify" })

    expect(twice.overlays).toEqual(["spotify"])
  })

  it("returns to the previous tab after overlays close", () => {
    const initial = createInitialAppNavigationState("auto")
    const library = appNavigationReducer(initial, { type: "select_tab", tab: "library" })
    const weather = appNavigationReducer(library, { type: "open_overlay", overlay: "weather" })
    const closed = appNavigationReducer(weather, { type: "back" })
    const backToPlan = appNavigationReducer(closed, { type: "back" })

    expect(backToPlan.activeTab).toBe("plan")
  })

  it("keeps theme preference typed and independent from navigation", () => {
    const initial = createInitialAppNavigationState("auto")
    const next = appNavigationReducer(initial, { type: "set_theme", theme: "dark" })

    expect(next.theme).toBe("dark")
    expect(next.activeTab).toBe("plan")
  })
})
