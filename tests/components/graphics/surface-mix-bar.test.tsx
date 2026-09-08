import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { SurfaceMixBar } from "@/components/graphics/SurfaceMixBar"

afterEach(cleanup)

describe("SurfaceMixBar", () => {
  it("preserves unknown evidence alongside quantified surfaces", () => {
    render(<SurfaceMixBar shares={[{ kind: "paved", percent: 70 }, { kind: "gravel", percent: 20 }, { kind: "unknown", percent: 10 }]} />)
    expect(screen.getByText("70% paved")).toBeTruthy()
    expect(screen.getByText("20% gravel")).toBeTruthy()
    expect(screen.getByText("10% unknown")).toBeTruthy()
  })

  it("normalizes display widths without rewriting supplied percentages", () => {
    const { container } = render(<SurfaceMixBar shares={[{ kind: "paved", percent: 120 }, { kind: "gravel", percent: 30 }]} />)
    expect(screen.getByText("120% paved")).toBeTruthy()
    expect(screen.getByText("30% gravel")).toBeTruthy()
    expect(container.querySelectorAll("[data-surface-segment]")).toHaveLength(2)
  })

  it("ignores malformed shares and reports absent quantified evidence", () => {
    render(<SurfaceMixBar shares={[{ kind: "paved", percent: 0 }, { kind: "gravel", percent: -5 }, { kind: "unknown", percent: Number.NaN }]} />)
    expect(screen.getByText("No quantified surface evidence")).toBeTruthy()
  })
})

describe("SurfaceMixBar unmeasured remainder", () => {
  it("draws the unmeasured remainder instead of scaling partial evidence to a full bar", () => {
    const { container } = render(<SurfaceMixBar shares={[{ kind: "paved", percent: 40 }, { kind: "gravel", percent: 20 }]} />)
    const segments = container.querySelectorAll<HTMLElement>("[data-surface-segment]")
    expect(segments).toHaveLength(3)
    // 40 of 100, not 40 of the 60 that happened to be measured.
    expect(segments[0]!.style.width).toBe("40%")
    expect(segments[1]!.style.width).toBe("20%")
    expect(segments[2]!.getAttribute("data-surface-unmeasured")).toBe("true")
    expect(segments[2]!.style.width).toBe("40%")
    expect(screen.getByText("40% unmeasured")).toBeTruthy()
  })

  it("adds no remainder when the supplied evidence already covers the route", () => {
    const { container } = render(<SurfaceMixBar shares={[{ kind: "paved", percent: 70 }, { kind: "unknown", percent: 30 }]} />)
    expect(container.querySelectorAll("[data-surface-unmeasured]")).toHaveLength(0)
    expect(screen.queryByText(/unmeasured/)).toBeNull()
  })
})
