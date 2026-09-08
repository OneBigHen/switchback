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
