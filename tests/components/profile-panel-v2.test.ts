import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = readFileSync("src/components/shell/ProfilePanel.tsx", "utf8")

describe("ProfilePanel V2 authority", () => {
  it("is an advanced account and data surface rather than a second rider-settings editor", () => {
    expect(source).toContain("Account, sync & rider data")
    expect(source).toContain("Switchback ID")
    expect(source).toContain("Encrypted sync")
    expect(source).toContain("Offline regions")
    expect(source).toContain("Diagnostics")

    expect(source).not.toContain("Rider name")
    expect(source).not.toContain("Motorcycle name")
    expect(source).not.toContain("Fuel range (miles)")
    expect(source).not.toContain("Gravel tolerance")
    expect(source).not.toContain('aria-label="Units"')
    expect(source).not.toContain('aria-label="Theme"')
  })
})
