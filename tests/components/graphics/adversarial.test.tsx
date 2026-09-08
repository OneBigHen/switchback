import { cleanup, render, screen } from "@testing-library/react"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { RouteThumbnail } from "@/components/graphics/RouteThumbnail"
import { SurfaceMixBar } from "@/components/graphics/SurfaceMixBar"
import { RideCharacterBars } from "@/components/graphics/RideCharacterBars"
import { EvidenceMeter } from "@/components/graphics/EvidenceMeter"
import { MotorcycleSilhouette } from "@/components/graphics/MotorcycleSilhouette"

const graphicsRoot = path.resolve(process.cwd(), "src/components/graphics")

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  }))
  return nested.flat()
}

afterEach(cleanup)

describe("graphics foundation adversarial boundary", () => {
  it("renders a long real route without non-finite SVG output", () => {
    const points = Array.from({ length: 5000 }, (_, index) => [
      -75 + index * 0.0001,
      40 + Math.sin(index / 30) * 0.03
    ] as const)
    const { container } = render(<RouteThumbnail points={points} label="Long route" />)
    expect(screen.getByRole("img", { name: "Long route" })).toBeTruthy()
    expect(container.innerHTML).not.toContain("NaN")
    expect(container.innerHTML).not.toContain("Infinity")
    expect(container.querySelector("[data-route-line]")?.getAttribute("d")?.split("L").length).toBe(5000)
  })

  it("treats non-finite evidence as unknown rather than zero", () => {
    render(<EvidenceMeter value={Number.POSITIVE_INFINITY} label="Coverage" />)
    expect(screen.getByText("Unknown")).toBeTruthy()
    expect(screen.queryByText("0%")).toBeNull()
  })

  it("keeps explicit unknown surface evidence visible", () => {
    render(<SurfaceMixBar shares={[{ kind: "unknown", percent: 35 }, { kind: "paved", percent: 65 }]} />)
    expect(screen.getByText("35% unknown")).toBeTruthy()
    expect(screen.getByText("65% paved")).toBeTruthy()
  })

  it("treats NaN rider character as Still learning", () => {
    render(<RideCharacterBars values={[{ axis: "twistiness", value: Number.NaN }]} />)
    expect(screen.getByText("Still learning")).toBeTruthy()
  })

  it("treats an empty accessible label as decorative", () => {
    const { container } = render(<MotorcycleSilhouette category="street" label="" />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("aria-hidden")).toBe("true")
    expect(svg?.getAttribute("role")).toBeNull()
  })

  it("keeps graphics source independent from network, AI, and routing-provider modules", async () => {
    const files = await sourceFiles(graphicsRoot)
    expect(files.length).toBeGreaterThan(5)
    for (const file of files) {
      const source = await readFile(file, "utf8")
      expect(source, file).not.toMatch(/\bfetch\s*\(/)
      expect(source, file).not.toMatch(/from\s+["']@\/lib\/ai\//)
      expect(source, file).not.toMatch(/from\s+["']@\/lib\/routing\//)
      expect(source, file).not.toMatch(/mapbox-gl|maplibre-gl|openrouter|gemini/i)
    }
  })
})
