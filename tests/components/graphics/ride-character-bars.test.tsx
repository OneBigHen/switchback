import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RideCharacterBars } from "@/components/graphics/RideCharacterBars"

afterEach(cleanup)

describe("RideCharacterBars", () => {
  it("clamps finite values and renders unknown as Still learning", () => {
    render(<RideCharacterBars values={[
      { axis: "twistiness", value: 1.8 },
      { axis: "gravel", value: -2 },
      { axis: "scenery", value: null }
    ]} />)
    expect(screen.getByText("100")).toBeTruthy()
    expect(screen.getByText("0")).toBeTruthy()
    expect(screen.getByText("Still learning")).toBeTruthy()
  })

  it("shows before and after only when previousValue is supplied", () => {
    const { rerender } = render(<RideCharacterBars values={[{ axis: "twistiness", value: 0.8, previousValue: 0.65 }]} />)
    expect(screen.getByText("65 → 80")).toBeTruthy()
    rerender(<RideCharacterBars values={[{ axis: "twistiness", value: 0.8 }]} />)
    expect(screen.queryByText("65 → 80")).toBeNull()
  })

  it("maps all six axes to distinct labelled rows", () => {
    render(<RideCharacterBars values={[
      { axis: "twistiness", value: 0.5 },
      { axis: "scenery", value: 0.5 },
      { axis: "gravel", value: 0.5 },
      { axis: "technicality", value: 0.5 },
      { axis: "elevation", value: 0.5 },
      { axis: "highwayAversion", value: 0.5 }
    ]} />)
    for (const label of ["Curves", "Scenery", "Gravel", "Technical", "Elevation", "Avoid highways"]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })
})
