import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const plannerDeck = readFileSync(resolve(process.cwd(), "src/app/styles/planner-deck.css"), "utf8")

describe("provider health notice touch target", () => {
  it("keeps Retry at the shared 44px minimum in its owning stylesheet", () => {
    const retryRule = plannerDeck.match(/\.provider-health-retry\s*\{[^}]*}/s)?.[0] ?? ""
    expect(retryRule).toContain("min-height: 44px")
  })
})
