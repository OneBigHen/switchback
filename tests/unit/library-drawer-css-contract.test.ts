import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const ridesStyles = readFileSync(resolve(process.cwd(), "src/components/rides/RidesSurface.module.css"), "utf8")

describe("Rides V2 CSS contract", () => {
  it("keeps primary ride actions and filter controls at the shared mobile touch target", () => {
    const importRule = ridesStyles.match(/\.importButton\s*\{[^}]*}/s)?.[0] ?? ""
    const tabRule = ridesStyles.match(/\.tabs button\s*\{[^}]*}/s)?.[0] ?? ""
    const manageRule = ridesStyles.match(/\.manageButton\s*\{[^}]*}/s)?.[0] ?? ""

    expect(importRule).toContain("min-height: 44px")
    expect(tabRule).toContain("min-height: 44px")
    expect(manageRule).toContain("width: 44px")
    expect(manageRule).toContain("min-height: 44px")
  })

  it("keeps selected ride filters visually keyed to aria-pressed semantics", () => {
    expect(ridesStyles).toContain('.tabs button[aria-pressed="true"]')
    expect(ridesStyles).not.toContain('.tabs button[aria-selected="true"]')
  })

  it("collapses ride objects without hiding their route identity on narrow phones", () => {
    const mobileRules = ridesStyles.match(/@media \(max-width: 560px\) \{[\s\S]*?\n}/)?.[0] ?? ""

    expect(mobileRules).toContain(".openButton")
    expect(mobileRules).toContain("grid-template-columns: 82px minmax(0, 1fr) 18px")
    expect(mobileRules).toContain(".routeGraphic")
  })
})
