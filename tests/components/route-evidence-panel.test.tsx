import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RouteEvidencePanel } from "@/components/planner/RouteEvidencePanel"
import type { PlannedRoute } from "@/lib/routing/types"

afterEach(cleanup)

// Mirrors the canonical "twisty-1" PlannedRoute fixture used across the
// planner test suite (see route-comparison.test.tsx), carrying a populated
// officialUnpavedEvidence block so the official-evidence branch is exercised.
const routeWithOfficialEvidence: PlannedRoute = {
  id: "twisty-1",
  name: "Twisty route",
  profile: "twisty",
  geometry: [[-76.8, 40.2], [-76.7, 40.3]],
  waypoints: [],
  instructions: [],
  distanceMiles: 28.4,
  durationMinutes: 51,
  ascentMeters: 410,
  descentMeters: 390,
  twistiness: 82.4,
  turnCount: 33,
  roadMix: { secondary: 72, primary: 28 },
  surfaceMix: { asphalt: 56, gravel: 32, dirt: 12 },
  routingSource: "live",
  previewOnly: false,
  overlapPercent: 100,
  officialUnpavedEvidence: {
    source: "Pennsylvania Department of Environmental Protection",
    dataset: "Unpaved Roads 2009_07",
    matchedMeters: 640,
    sharePercent: 1.4,
    matchedFeatureCount: 2,
    matchRadiusMeters: 40,
    minimumContiguousMeters: 80
  }
}

// Second realistic fixture with a different surface mix and no official
// overlay, so the missing-evidence branch and a distinct non-paved share can
// both be observed.
const routeWithoutOfficialEvidence: PlannedRoute = {
  id: "scenic-1",
  name: "Scenic ridge route",
  profile: "scenic",
  geometry: [[-77.1, 40.1], [-77.0, 40.2]],
  waypoints: [],
  instructions: [],
  distanceMiles: 22,
  durationMinutes: 41,
  ascentMeters: 180,
  descentMeters: 200,
  twistiness: 64.6,
  turnCount: 18,
  roadMix: { secondary: 60, primary: 40 },
  surfaceMix: { asphalt: 50, gravel: 30, dirt: 20 },
  routingSource: "live",
  previewOnly: false,
  overlapPercent: 100
}

describe("route evidence panel", () => {
  describe("route metrics and surface calculation", () => {
    it("rounds the curve signal and lists the mapped turns on the road character row", () => {
      render(<RouteEvidencePanel route={routeWithOfficialEvidence} />)

      const panel = screen.getByRole("region", { name: "Why this route was chosen" })
      expect(panel).toHaveTextContent("Why this line")
      expect(panel).toHaveTextContent("Road character")
      // twistiness 82.4 must be rounded to 82; turnCount stays the integer 33
      expect(panel).toHaveTextContent("82/100 curve signal")
      expect(panel).toHaveTextContent("33 mapped turns")
    })

    it("sums the unpaved surface tags into the non-paved percentage shown to the rider", () => {
      // surfaceMix: asphalt 56 + gravel 32 + dirt 12 -> gravel + dirt = 44% non-paved
      render(<RouteEvidencePanel route={routeWithOfficialEvidence} />)

      const panel = screen.getByRole("region", { name: "Why this route was chosen" })
      expect(panel).toHaveTextContent("Surface mix")
      expect(panel).toHaveTextContent("44% non-paved mix from routing tags")
    })

    it("recalculates the non-paved percentage when the surface mix changes", () => {
      // surfaceMix: asphalt 50 + gravel 30 + dirt 20 -> gravel + dirt = 50% non-paved
      render(<RouteEvidencePanel route={routeWithoutOfficialEvidence} />)

      const panel = screen.getByRole("region", { name: "Why this route was chosen" })
      expect(panel).toHaveTextContent("50% non-paved mix from routing tags")
      expect(panel).not.toHaveTextContent("44% non-paved mix")
    })

    it("shows an unavailable state when no surface data was returned", () => {
      render(<RouteEvidencePanel route={{ ...routeWithoutOfficialEvidence, surfaceMix: {} }} />)

      const panel = screen.getByRole("region", { name: "Why this route was chosen" })
      expect(panel).toHaveTextContent("Surface data unavailable.")
      expect(panel).not.toHaveTextContent("0% non-paved mix")
    })
  })

  describe("official unpaved-road evidence", () => {
    it("shows the aligned official share when evidence is present", () => {
      render(<RouteEvidencePanel route={routeWithOfficialEvidence} />)

      const panel = screen.getByRole("region", { name: "Why this route was chosen" })
      expect(panel).toHaveTextContent("Access evidence")
      // sharePercent 1.4 rendered via toFixed(1)
      expect(panel).toHaveTextContent("1.4% aligns with official PA unpaved-road data.")
      expect(panel).not.toHaveTextContent(
        "No official access overlay matched this route in the current region."
      )
    })

    it("shows the missing-overlay message when evidence is absent", () => {
      render(<RouteEvidencePanel route={routeWithoutOfficialEvidence} />)

      const panel = screen.getByRole("region", { name: "Why this route was chosen" })
      expect(panel).toHaveTextContent("Access evidence")
      expect(panel).toHaveTextContent(
        "No official access overlay matched this route in the current region."
      )
      expect(panel).not.toHaveTextContent("aligns with official PA unpaved-road data.")
    })
  })
})
