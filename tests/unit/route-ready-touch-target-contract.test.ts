import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const readStyle = (name: string) => readFileSync(resolve(process.cwd(), `src/app/styles/${name}`), "utf8")
const plannerDeck = readStyle("planner-deck.css")
const plannerShell = readStyle("planner-shell.css")

describe("planned-route touch targets", () => {
  it("keeps every visible routing profile button at the shared minimum", () => {
    const profileButtons = plannerDeck.match(/\.profile-switch button\s*\{[^}]*min-height[^}]*}/s)?.[0] ?? ""

    expect(profileButtons).toContain("min-height: var(--sb-touch-target)")
  })

  it("keeps the optional Research action at the shared minimum", () => {
    const researchButton = plannerShell.match(/\.ride-research > button\s*\{[^}]*}/s)?.[0] ?? ""

    expect(researchButton).toContain("min-height: var(--sb-touch-target)")
  })
})
