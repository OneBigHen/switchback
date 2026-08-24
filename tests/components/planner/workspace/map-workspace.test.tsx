import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { MapCanvas, MapWorkspace } from "@/components/planner/workspace/MapWorkspace"

describe("MapWorkspace", () => {
  it("keeps the map canvas and workspace chrome in one labelled map region", () => {
    render(
      <MapWorkspace mode="planning">
        <MapCanvas>
          <div data-testid="map-content">Map</div>
        </MapCanvas>
        <aside>Context</aside>
      </MapWorkspace>
    )

    const workspace = screen.getByRole("region", { name: "Map workspace" })
    expect(workspace).toHaveAttribute("data-workspace-mode", "planning")
    expect(workspace.querySelector("[data-map-canvas]")).toContainElement(screen.getByTestId("map-content"))
    expect(screen.getByText("Context")).toBeInTheDocument()
  })
})
