import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const planStyles = readFileSync(resolve(process.cwd(), "src/app/styles/plan-v2.css"), "utf8")

describe("V2 planner theme controls", () => {
  it("keeps unselected controls readable in the dark planning theme", () => {
    const darkThemeRule = /:root\[data-theme="dark"\][\s\S]*?\.plan-v2__profile-list button[\s\S]*?\{([\s\S]*?)\}/.exec(planStyles)?.[1] ?? ""

    expect(darkThemeRule).toContain("background: var(--sb-surface-raised);")
    expect(darkThemeRule).toContain("color: var(--sb-text);")
  })
})
