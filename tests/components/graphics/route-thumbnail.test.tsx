import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RouteThumbnail } from "@/components/graphics/RouteThumbnail"

afterEach(cleanup)

describe("RouteThumbnail", () => {
  it("renders actual geometry with distinct start and finish markers", () => {
    const { container } = render(<RouteThumbnail points={[[-75.2, 40.1], [-75.1, 40.2], [-75.05, 40.12]]} label="Ride shape" />)
    const svg = screen.getByRole("img", { name: "Ride shape" })
    expect(svg.getAttribute("viewBox")).toBe("0 0 100 72")
    expect(container.querySelector("[data-route-line]" )?.getAttribute("d")).toMatch(/^M/)
    expect(container.querySelector("[data-route-start]")).not.toBeNull()
    expect(container.querySelector("[data-route-finish]")).not.toBeNull()
  })

  it("does not emit NaN or Infinity for malformed or degenerate input", () => {
    const { container } = render(<RouteThumbnail points={[[0, 0], [0, 0], [Number.NaN, 2]]} />)
    expect(container.innerHTML).not.toContain("NaN")
    expect(container.innerHTML).not.toContain("Infinity")
  })

  it("renders an explicit unavailable glyph when fewer than two valid points exist", () => {
    render(<RouteThumbnail points={[[Number.NaN, 1]]} label="Route preview" />)
    expect(screen.getByText("Route shape unavailable")).toBeTruthy()
  })
})

describe("RouteThumbnail unavailable geometry", () => {
  it("shows a generic glyph rather than an invented route line", () => {
    const { container } = render(<RouteThumbnail points={[]} label="Imported ride" />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("data-route-thumbnail")).toBe("unavailable")
    // A real ride with no stored geometry must not be given a shape.
    expect(container.querySelector("[data-route-line]")).toBeNull()
    expect(container.querySelector("[data-route-start]")).toBeNull()
    expect(container.querySelector("[data-route-finish]")).toBeNull()
    expect(screen.getByText("Route shape unavailable")).toBeTruthy()
  })

  it("refuses to draw a route from a single stored point", () => {
    const { container } = render(<RouteThumbnail points={[[-76.88, 40.27]]} label="One fix" />)
    expect(container.querySelector("svg")?.getAttribute("data-route-thumbnail")).toBe("unavailable")
    expect(container.querySelector("[data-route-line]")).toBeNull()
  })
})
