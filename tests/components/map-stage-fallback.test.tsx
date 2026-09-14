import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { MapStageProps } from "@/components/planner/map-stage-props"

vi.mock("@/lib/client/mapbox-config", () => ({
  isPremiumMapboxRendererEnabled: () => true
}))

vi.mock("@/components/planner/planner-map-renderer", () => ({
  maplibreRenderer: { id: "maplibre" }
}))

vi.mock("@/components/planner/MapboxMapStage", () => ({
  MapboxMapStage: ({ onRendererFailure }: MapStageProps) => (
    <button type="button" onClick={() => onRendererFailure?.(new Error("style failed"))}>
      Fail Mapbox mount
    </button>
  )
}))

vi.mock("@/components/planner/PlannerMapStage", () => ({
  PlannerMapStage: () => <div data-testid="maplibre-fallback">MapLibre fallback stage</div>
}))

import { MapStage } from "@/components/planner/MapStage"

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe("MapStage renderer fallback", () => {
  it("switches a failed Mapbox mount to MapLibre and remembers it for the session", async () => {
    const user = userEvent.setup()
    const view = render(<MapStage {...({} as MapStageProps)} />)

    await user.click(screen.getByRole("button", { name: "Fail Mapbox mount" }))
    expect(screen.getByTestId("maplibre-fallback")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Fail Mapbox mount" })).not.toBeInTheDocument()

    view.unmount()
    render(<MapStage {...({} as MapStageProps)} />)
    expect(screen.getByTestId("maplibre-fallback")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Fail Mapbox mount" })).not.toBeInTheDocument()
  })
})
