import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LayersSheet } from "@/components/planner/v2/LayersSheet"
import type { RiderLayerSetting } from "@/lib/client/map-layers"

afterEach(cleanup)

const layers: RiderLayerSetting[] = [
  { id: "curvature", visible: true, opacity: 1, order: 0 },
  { id: "unpaved", visible: false, opacity: 1, order: 1 },
  { id: "closures", visible: false, opacity: 1, order: 2 },
  { id: "road-controls", visible: true, opacity: 1, order: 3 },
  { id: "fuel", visible: false, opacity: 1, order: 4 }
]

describe("LayersSheet", () => {
  it("keeps the quick surface rider-facing and bounded", () => {
    render(
      <LayersSheet
        mapExperience="standard"
        premiumExperiences
        riderLayers={layers}
        quickLayerIds={["curvature", "unpaved", "closures", "road-controls"]}
        onMapExperienceChange={vi.fn()}
        onRiderLayerVisibilityChange={vi.fn()}
        onOpenAdvanced={vi.fn()}
      />
    )

    expect(screen.getByRole("radiogroup", { name: "Map style" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Standard" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Terrain" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Satellite" })).toBeInTheDocument()
    expect(screen.getAllByRole("checkbox")).toHaveLength(4)
    expect(screen.getByRole("button", { name: "Advanced map settings" })).toBeInTheDocument()

    expect(screen.queryByText(/provenance/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/freshness/i)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /move .* earlier/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /move .* later/i })).not.toBeInTheDocument()
  })

  it("hides Satellite when the renderer cannot provide it and forwards changes", () => {
    const onMapExperienceChange = vi.fn()
    const onVisibilityChange = vi.fn()
    const onOpenAdvanced = vi.fn()

    render(
      <LayersSheet
        mapExperience="terrain"
        premiumExperiences={false}
        riderLayers={layers}
        quickLayerIds={["curvature", "unpaved"]}
        onMapExperienceChange={onMapExperienceChange}
        onRiderLayerVisibilityChange={onVisibilityChange}
        onOpenAdvanced={onOpenAdvanced}
      />
    )

    expect(screen.queryByRole("radio", { name: "Satellite" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: "Standard" }))
    expect(onMapExperienceChange).toHaveBeenCalledWith("standard")

    fireEvent.click(screen.getByRole("checkbox", { name: "Great roads" }))
    expect(onVisibilityChange).toHaveBeenCalledWith("curvature", false)

    fireEvent.click(screen.getByRole("button", { name: "Advanced map settings" }))
    expect(onOpenAdvanced).toHaveBeenCalledOnce()
  })
})
