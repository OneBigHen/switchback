import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"

const visualRoot = path.resolve(process.cwd(), "public/visual-system")

async function svgFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) return svgFiles(full)
    return entry.name.endsWith(".svg") ? [full] : []
  }))
  return nested.flat()
}

describe("visual-system SVG safety", () => {
  it("keeps all committed SVG assets self-contained and script free", async () => {
    const files = await svgFiles(visualRoot)
    expect(files.length).toBeGreaterThanOrEqual(5)
    for (const file of files) {
      const svg = await readFile(file, "utf8")
      expect(svg, file).toContain("<svg")
      expect(svg, file).toMatch(/viewBox="[^"]+"/)
      expect(svg, file).not.toMatch(/<script\b/i)
      expect(svg, file).not.toMatch(/<foreignObject\b/i)
      expect(svg, file).not.toMatch(/<image\b/i)
      expect(svg, file).not.toMatch(/(?:href|xlink:href)\s*=\s*["']https?:\/\//i)
      expect(svg, file).not.toMatch(/url\(\s*["']?https?:\/\//i)
      expect(svg, file).not.toMatch(/javascript:/i)
    }
  })

  it("keeps editorial illustrations free of baked UI text", async () => {
    for (const name of ["ride-memory.svg", "new-ride.svg", "ai-routing.svg"]) {
      const svg = await readFile(path.join(visualRoot, "illustrations", name), "utf8")
      expect(svg, name).not.toMatch(/<text\b/i)
    }
  })
})
