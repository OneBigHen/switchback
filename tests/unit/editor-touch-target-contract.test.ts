import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const readStyle = (name: string) => readFileSync(resolve(process.cwd(), `src/app/styles/${name}`), "utf8")
const plannerDeck = readStyle("planner-deck.css")
const rideOmnibox = readStyle("ride-omnibox.css")

describe("route editor touch targets", () => {
  it("keeps trip-shape controls at the shared minimum", () => {
    const modeButtons = rideOmnibox.match(/\.plan-mode-switch button\s*\{[^}]*}/s)?.[0] ?? ""

    expect(modeButtons).toContain("min-height: var(--sb-touch-target)")
  })

  it("keeps route-edit controls and their peers at the shared minimum", () => {
    const editButtons = plannerDeck.match(/\.route-edit-toolbar button\s*\{[^}]*}/s)?.[0] ?? ""

    expect(editButtons).toContain("min-height: var(--sb-touch-target)")
  })

  it("keeps the selected-route editor toggle in the mobile scroll flow", () => {
    const toggleRule = plannerDeck.match(
      /\.planner-deck\.has-expanded-route-dock:not\(\.is-minimized\) \.edit-route-button\s*\{[^}]*}/s
    )?.[0] ?? ""

    expect(toggleRule).toContain("position: static")
  })
})
