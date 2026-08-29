import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const readStyle = (name: string) => readFileSync(resolve(process.cwd(), `src/app/styles/${name}`), "utf8")
const omnibox = readStyle("ride-omnibox.css")
const plannerShell = readStyle("planner-shell.css")

describe("planner ride touch targets", () => {
  it("keeps the ride brand link at the shared minimum in both dimensions", () => {
    const brandLockup = plannerShell.match(/\.brand-lockup\s*\{[^}]*}/s)?.[0] ?? ""

    expect(brandLockup).toContain("min-width: var(--sb-touch-target)")
    expect(brandLockup).toContain("min-height: var(--sb-touch-target)")
  })

  it("keeps voice and intent chips at the shared minimum without shrinking mobile tracks", () => {
    const voiceButton = omnibox.match(/\.ride-omnibox \.ride-voice-button\s*\{[^}]*}/s)?.[0] ?? ""
    const quickIntents = omnibox.match(/\.ride-quick-intents button,\s*\.ride-understanding button\s*\{[^}]*}/s)?.[0] ?? ""
    expect(voiceButton).toContain("width: var(--sb-touch-target)")
    expect(voiceButton).toContain("height: var(--sb-touch-target)")
    expect(quickIntents).toContain("min-height: var(--sb-touch-target)")
    expect(omnibox).toContain("grid-template-columns: 18px minmax(0, 1fr) 44px 48px")
  })

  it("does not reduce the understood-intent chip below the shared minimum", () => {
    expect(omnibox).toContain(".ride-quick-intents button,\n.ride-understanding button")
    expect(omnibox).not.toMatch(/\.ride-understanding button\s*\{\s*min-height: (?:34|40)px/s)
  })
})
