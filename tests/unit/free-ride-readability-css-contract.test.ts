import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const freeRideStyles = readFileSync(resolve(process.cwd(), "src/app/styles/free-ride.css"), "utf8")

describe("Free Ride readability contract", () => {
  it("keeps the dark instrument cluster text readable in the light application theme", () => {
    expect(freeRideStyles).toContain(".free-ride-hud .free-ride-dock .free-ride-main")
    expect(freeRideStyles).toContain("color: var(--sb-paper);")
    expect(freeRideStyles).toContain(".free-ride-hud .free-ride-dock .free-ride-speed")
    expect(freeRideStyles).toContain(".free-ride-hud .free-ride-dock .free-ride-heading")
    expect(freeRideStyles).toContain(".free-ride-hud .free-ride-dock .free-ride-instruction")
  })
})
