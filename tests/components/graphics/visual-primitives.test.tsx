import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MotorcycleSilhouette } from "@/components/graphics/MotorcycleSilhouette"
import { MapStylePreview } from "@/components/graphics/MapStylePreview"
import {
  ElevationIcon,
  GravelIcon,
  HighwayAvoidanceIcon,
  SceneryIcon,
  TechnicalityIcon,
  TwistinessIcon
} from "@/components/graphics/icons"

afterEach(cleanup)

describe("visual primitives", () => {
  it("renders all motorcycle categories as deterministic accessible SVG variants", () => {
    const { container } = render(<>
      <MotorcycleSilhouette category="street" label="Street bike" />
      <MotorcycleSilhouette category="touring" label="Touring bike" />
      <MotorcycleSilhouette category="adventure" label="Adventure bike" />
      <MotorcycleSilhouette category="dual-sport" label="Dual sport bike" />
    </>)
    expect(screen.getAllByRole("img")).toHaveLength(4)
    expect(container.querySelectorAll("[data-motorcycle-category]")).toHaveLength(4)
  })

  it("renders decorative motorcycle graphics aria-hidden", () => {
    const { container } = render(<MotorcycleSilhouette category="adventure" />)
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("renders all map preview concepts without provider imagery", () => {
    const { container } = render(<>
      <MapStylePreview variant="standard" label="Standard preview" />
      <MapStylePreview variant="terrain" label="Terrain preview" />
      <MapStylePreview variant="satellite" label="Satellite preview" />
    </>)
    expect(screen.getAllByRole("img")).toHaveLength(3)
    expect(container.querySelectorAll("image")).toHaveLength(0)
  })

  it("keeps rider-character icons text-free and currentColor driven", () => {
    const { container } = render(<>
      <TwistinessIcon /><SceneryIcon /><GravelIcon /><TechnicalityIcon /><ElevationIcon /><HighwayAvoidanceIcon />
    </>)
    expect(container.querySelectorAll("svg")).toHaveLength(6)
    expect(container.querySelectorAll("text")).toHaveLength(0)
    for (const svg of Array.from(container.querySelectorAll("svg"))) {
      expect(svg.innerHTML).toContain("currentColor")
    }
  })
})
