import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { FreeRideSuggestion } from "@/lib/domain/contracts"
import { FreeRideHud } from "@/components/shell/FreeRideHud"
import type { RecordingSessionController } from "@/components/shell/useRecordingSession"

const suggestion: FreeRideSuggestion = {
  id: "ridge-1",
  kind: "fun-road",
  title: "Fun road ahead — Follow this road in 0.8 mi — +4 min",
  actionLabel: "Accept suggestion",
  origin: [-77.1, 40.1],
  destination: [-77.02, 40.16],
  routeFragment: [[-77.1, 40.1], [-77.02, 40.16]],
  triggerDistanceMeters: 1_200,
  addedDurationSeconds: 240,
  score: {
    total: 82,
    fun: 91,
    twistiness: 94,
    scenic: 75,
    elevation: 50,
    gravel: 0,
    traffic: 88,
    simplicity: 81,
    safety: 96,
    novelty: 73,
    confidence: 87,
    preferenceFit: 80,
    etaPenalty: 0,
    explanations: ["Strong curvature and sustained bends (94/100)."],
    explanation: ["Strong curvature and sustained bends (94/100)."]
  },
  reasons: ["Strong curvature and sustained bends (94/100)."],
  confidence: 0.87,
  expiresAt: "2026-08-04T14:00:45.000Z"
}

const controller = {
  state: {
    status: "recording",
    points: [{ coordinate: [-77.1, 40.1], recordedAt: "2026-08-04T14:00:00.000Z", speedMph: 35, altitudeMeters: 120, headingDegrees: 90, accuracyMeters: 8 }],
    startedAt: Date.parse("2026-08-04T14:00:00.000Z"),
    pausedAt: null,
    pausedMillis: 0,
    endedAt: null,
    error: null
  },
  clock: Date.parse("2026-08-04T14:00:12.000Z"),
  elapsedMillis: 12_000,
  pause: vi.fn(),
  resume: vi.fn(),
  finish: vi.fn()
} as unknown as RecordingSessionController

afterEach(cleanup)

describe("Free Ride HUD", () => {
  it("presents one safe suggestion and exposes accept, ignore, and preference controls", async () => {
    const user = userEvent.setup()
    const onAccept = vi.fn()
    const onIgnore = vi.fn()
    const onLessLikeThis = vi.fn()
    const onHeadHome = vi.fn()

    render(
      <FreeRideHud
        controller={controller}
        suggestion={suggestion}
        loading={false}
        error={null}
        onAccept={onAccept}
        onIgnore={onIgnore}
        onLessLikeThis={onLessLikeThis}
        homeAvailable
        onHeadHome={onHeadHome}
        onExit={vi.fn()}
      />
    )

    expect(screen.getByRole("heading", { name: "Free Ride" })).toBeInTheDocument()
    expect(screen.getByText("Experimental")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Suggested fun road" })).toHaveTextContent("Fun road ahead")

    await user.click(screen.getByRole("button", { name: "Accept suggestion" }))
    await user.click(screen.getByRole("button", { name: "Ignore suggestion" }))
    await user.click(screen.getByRole("button", { name: "Less like this" }))
    await user.click(screen.getByRole("button", { name: "Head Home" }))

    expect(onAccept).toHaveBeenCalledWith(suggestion)
    expect(onIgnore).toHaveBeenCalledTimes(1)
    expect(onLessLikeThis).toHaveBeenCalledTimes(1)
    expect(onHeadHome).toHaveBeenCalledTimes(1)
  })

  it("keeps the rider informed when GPS or curvature data cannot support a suggestion", () => {
    render(
      <FreeRideHud
        controller={controller}
        suggestion={null}
        loading={false}
        error="Curvy-road data is unavailable here."
        suppressionReason="gps-uncertain"
        onAccept={vi.fn()}
        onIgnore={vi.fn()}
        onLessLikeThis={vi.fn()}
        onExit={vi.fn()}
      />
    )

    expect(screen.getByRole("alert")).toHaveTextContent("Curvy-road data is unavailable here.")
    expect(screen.getByText("GPS 8 m")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Accept suggestion" })).not.toBeInTheDocument()
  })
})
