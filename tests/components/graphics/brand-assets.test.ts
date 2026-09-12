import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"

const markPath = path.resolve(process.cwd(), "public/visual-system/brand/switchback-compact-mark.svg")
const readmePath = path.resolve(process.cwd(), "public/visual-system/README.md")

describe("graphics brand assets", () => {
  it("ships a self-contained compact SVG mark", async () => {
    const svg = await readFile(markPath, "utf8")
    expect(svg).toContain("<svg")
    expect(svg).toMatch(/viewBox="[^"]+"/)
    expect(svg).not.toContain("<image")
    expect(svg).not.toMatch(/(?:href|xlink:href)\s*=\s*["']https?:\/\//i)
    expect(svg).not.toMatch(/url\(\s*["']?https?:\/\//i)
    expect(svg).not.toMatch(/javascript:/i)
  })

  it("documents visual-system asset usage", async () => {
    const readme = await readFile(readmePath, "utf8")
    expect(readme).toContain("OpenGravel visual system")
    expect(readme).toMatch(/compact mark/i)
    expect(readme).toMatch(/generated illustrations/i)
  })
})
