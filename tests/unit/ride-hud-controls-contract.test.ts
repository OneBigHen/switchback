import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const readSource = (name: string) => readFileSync(resolve(process.cwd(), name), "utf8")
const rideHud = readSource("src/components/planner/RideHud.tsx")
const rideHudStyles = readSource("src/app/styles/ride-hud.css")

describe("ride HUD mobile control geometry", () => {
  it("gives each active-navigation control a distinct semantic grid placement", () => {
    expect(rideHud).toContain('className="ride-voice-toggle"')
    expect(rideHud).toContain('className="ride-guidance-toggle"')
    expect(rideHud).toContain('className="ride-overnight-stop"')
    expect(rideHud.match(/className="ride-voice-toggle"/g)).toHaveLength(1)

    const placements: Record<string, [string, string]> = {
      "ride-voice-toggle": ["grid-row: 1", "grid-column: 2"],
      "ride-guidance-toggle": ["grid-row: 1", "grid-column: 3"],
      "ride-overnight-stop": ["grid-row: 1", "grid-column: 4"]
    }

    for (const [className, declarations] of Object.entries(placements)) {
      const rule = rideHudStyles.match(
        new RegExp(`\\.ride-topbar \\.${className}\\s*\\{([^}]*)\\}`, "s")
      )?.[1] ?? ""

      for (const declaration of declarations) {
        expect(rule, `${className} should have ${declaration}`).toContain(declaration)
      }
    }
  })

  it("keeps the active-navigation controls at the shared touch target", () => {
    const controlRule = rideHudStyles.match(
      /\.ride-voice-toggle,\s*\.ride-guidance-toggle,\s*\.ride-overnight-stop\s*\{([^}]*)\}/s
    )?.[1] ?? ""

    expect(controlRule).toContain("min-width: var(--sb-touch-target)")
    expect(controlRule).toContain("min-height: var(--sb-touch-target)")
  })

  it("keeps the ride status and route name on separate readable lines", () => {
    expect(rideHud).toContain('className="ride-route-copy"')

    const copyRule = rideHudStyles.match(
      /\.ride-route-copy\s*\{([^}]*)\}/s
    )?.[1] ?? ""

    expect(copyRule).toContain("display: flex")
    expect(copyRule).toContain("flex-direction: column")
  })
})
