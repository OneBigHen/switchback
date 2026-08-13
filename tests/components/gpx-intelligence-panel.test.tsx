import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { GpxIntelligencePanel } from "@/components/planner/GpxIntelligencePanel"
import { analyzeGpxIntelligence } from "@/lib/gpx/intelligence"

afterEach(cleanup)

const source = {
  geometry: [[-76, 40], [-75.999, 40], [-75.9, 40], [-75.899, 40]] as [number, number][],
  segments: [
    [[-76, 40], [-75.999, 40]] as [number, number][],
    [[-75.9, 40], [-75.899, 40]] as [number, number][]
  ],
  segmentStarts: [0, 2],
  distanceMeters: 8_700,
  durationMinutes: 42,
  ascentMeters: 120,
  descentMeters: 80,
  gapCount: 1
}

describe("GpxIntelligencePanel", () => {
  it("labels unknown road and surface evidence instead of implying clean coverage", () => {
    render(<GpxIntelligencePanel report={analyzeGpxIntelligence(source, {
      status: "not-configured",
      provider: null,
      profile: null
    })} />)

    expect(screen.getByRole("region", { name: "GPX intelligence" })).toBeInTheDocument()
    expect(screen.getAllByText("Unavailable from this GPX")).toHaveLength(2)
    expect(screen.getByText("Not evaluated")).toBeInTheDocument()
    expect(screen.getByText("Measured track report")).toBeInTheDocument()
  })

  it("shows track-only handling for an unmatched provider result", () => {
    render(<GpxIntelligencePanel report={analyzeGpxIntelligence(source, {
      status: "unmatched",
      provider: "graphhopper",
      profile: "motorcycle_adventure"
    })} />)

    expect(screen.getByText("No provider path")).toBeInTheDocument()
    expect(screen.getByText(/road data unavailable/)).toBeInTheDocument()
    expect(screen.getByText(/no invented turns or reroute/i)).toBeInTheDocument()
  })
})
