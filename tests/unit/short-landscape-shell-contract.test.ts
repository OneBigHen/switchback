import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const readStyle = (name: string) => readFileSync(resolve(process.cwd(), `src/app/styles/${name}`), "utf8")

describe("short landscape shell layout", () => {
  it("keeps the normal shell floor and bounds it only in short landscape", () => {
    const plannerShell = readStyle("planner-shell.css")
    const declarations = plannerShell.replace(/\/\*[\s\S]*?\*\//g, "")

    expect(declarations).toContain("min-height: 560px;")
    expect(plannerShell).toContain(`@media (orientation: landscape) and (max-height: 520px) {
  .planner-shell {
    min-height: 0;
    height: 100dvh;
  }
}`)
  })
})
