import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ElevationSparkline } from "@/components/graphics/ElevationSparkline"
import { EvidenceMeter } from "@/components/graphics/EvidenceMeter"
import { ConfidenceBadge } from "@/components/graphics/ConfidenceBadge"

afterEach(cleanup)

describe("evidence graphics", () => {
  it("sorts valid elevation samples and handles flat profiles", () => {
    const { container } = render(<ElevationSparkline samples={[{ distanceMiles: 2, elevationFeet: 1000 }, { distanceMiles: 0, elevationFeet: 1000 }, { distanceMiles: 1, elevationFeet: Number.NaN }]} label="Elevation" />)
    expect(screen.getByRole("img", { name: "Elevation" })).toBeTruthy()
    expect(container.innerHTML).not.toContain("NaN")
    expect(container.innerHTML).not.toContain("Infinity")
  })

  it("distinguishes quantified zero from unknown evidence", () => {
    const { rerender } = render(<EvidenceMeter value={0} label="Provider match" />)
    expect(screen.getByText("0%")).toBeTruthy()
    expect(screen.queryByText("Unknown")).toBeNull()
    rerender(<EvidenceMeter value={null} label="Provider match" />)
    expect(screen.getByText("Unknown")).toBeTruthy()
  })

  it("renders confidence as visible words", () => {
    render(<ConfidenceBadge level="high" />)
    expect(screen.getByText("High confidence")).toBeTruthy()
  })
})

describe("ElevationSparkline unavailable evidence", () => {
  it("draws no baseline, because a flat line would claim a flat route", () => {
    const { container } = render(<ElevationSparkline samples={[]} label="Climb" />)
    expect(container.querySelector("svg")?.getAttribute("data-elevation-state")).toBe("unavailable")
    expect(container.querySelector("path")).toBeNull()
    expect(screen.getByText("Elevation unavailable")).toBeTruthy()
  })
})
