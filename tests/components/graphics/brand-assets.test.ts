import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const markPath = new URL("../../../public/visual-system/brand/switchback-compact-mark.svg", import.meta.url)
const readmePath = new URL("../../../public/visual-system/README.md", import.meta.url)

describe("graphics brand assets", () => {
  it("ships a self-contained compact SVG mark", async () => {
    const svg = await readFile(markPath, "utf8")
    expect(svg).toContain("<svg")
    expect(svg).toMatch(/viewBox="[^"]+"/)
    expect(svg).not.toContain("<image")
    expect(svg).not.toMatch(/https?:\/\//)
  })

  it("documents visual-system asset usage", async () => {
    const readme = await readFile(readmePath, "utf8")
    expect(readme).toContain("Switchback visual system")
    expect(readme).toContain("compact mark")
    expect(readme).toContain("generated illustrations")
  })
})
