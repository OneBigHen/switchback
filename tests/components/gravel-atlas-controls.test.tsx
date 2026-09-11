import type { ComponentProps } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LayersSheet } from "@/components/planner/v2/LayersSheet"
import { PlanOptions } from "@/components/planner/v2/PlanOptions"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import type { RiderLayerId, RiderLayerSetting } from "@/lib/client/map-layers"

afterEach(cleanup)

function renderPlanOptions(options: {
  profile?: "quick" | "adventure" | "gravel"
  enabled?: boolean
  intensity?: "balanced" | "more" | "maximum"
} = {}) {
  const onGravelAtlasChange = vi.fn()
  const props = {
    open: true,
    onToggle: vi.fn(),
    planMode: "destination",
    profile: options.profile ?? "adventure",
    bikeProfile: MOTORCYCLE_PROFILES[0]!,
    curvatureVisible: true,
    avoidHighways: false,
    tollPolicy: "allow-with-warning",
    targetMinutes: 120,
    timeShaped: true,
    segmentProfiles: [],
    start: null,
    finish: null,
    startQuery: "",
    finishQuery: "",
    armedPoint: null,
    via: [],
    addingVia: false,
    canUndoRideChange: false,
    canRedoRideChange: false,
    avoidAreaCount: 0,
    roadLockCount: 0,
    savedCount: 0,
    home: null,
    gravelAtlas: {
      enabled: options.enabled ?? false,
      intensity: options.intensity ?? "balanced"
    },
    onProfileChange: vi.fn(),
    onBikeProfileChange: vi.fn(),
    onCurvatureChange: vi.fn(),
    onGravelAtlasChange,
    onAvoidHighwaysChange: vi.fn(),
    onTollPolicyChange: vi.fn(),
    onRideTimeChange: vi.fn(),
    onSegmentProfileChange: vi.fn(),
    onPointChange: vi.fn(),
    onPointQueryChange: vi.fn(),
    onArm: vi.fn(),
    onSwap: vi.fn(),
    onToggleAddVia: vi.fn(),
    onRemoveVia: vi.fn(),
    onMoveVia: vi.fn(),
    onReverseRoute: vi.fn(),
    onUndoRideChange: vi.fn(),
    onRedoRideChange: vi.fn(),
    onToggleViaLock: vi.fn(),
    onOpenRoadLocks: vi.fn(),
    onRemoveAvoidArea: vi.fn()
  } as unknown as ComponentProps<typeof PlanOptions>

  render(<PlanOptions {...props} />)
  return { onGravelAtlasChange }
}

describe("Gravel Atlas planner controls", () => {
  it("lets Adventure and Gravel riders opt in without coupling the map layer", () => {
    const { onGravelAtlasChange } = renderPlanOptions()

    const toggle = screen.getByRole("checkbox", { name: "Favor known gravel" })
    expect(toggle).not.toBeChecked()
    fireEvent.click(toggle)
    expect(onGravelAtlasChange).toHaveBeenCalledWith({ enabled: true, intensity: "balanced" })
    expect(screen.queryByRole("checkbox", { name: "Known gravel roads" })).not.toBeInTheDocument()
  })

  it("shows bounded gravel intensity only after the routing preference is enabled", () => {
    const { onGravelAtlasChange } = renderPlanOptions({ enabled: true, intensity: "more" })

    expect(screen.getByRole("button", { name: "Balanced gravel" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "More gravel" })).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(screen.getByRole("button", { name: "Maximum gravel" }))
    expect(onGravelAtlasChange).toHaveBeenCalledWith({ enabled: true, intensity: "maximum" })
  })

  it("does not offer Gravel Atlas routing on an ineligible Quick profile", () => {
    renderPlanOptions({ profile: "quick", enabled: true, intensity: "maximum" })
    expect(screen.queryByRole("checkbox", { name: "Favor known gravel" })).not.toBeInTheDocument()
  })
})

describe("Known gravel roads map layer", () => {
  it("toggles visibility independently through the normal quick-layer surface", () => {
    const onVisibilityChange = vi.fn()
    const gravelId = "gravel-atlas" as RiderLayerId
    const layers = [{ id: gravelId, visible: false, opacity: 1, order: 0 }] as RiderLayerSetting[]

    render(
      <LayersSheet
        mapPreset="road"
        premiumExperiences
        riderLayers={layers}
        quickLayerIds={[gravelId]}
        onMapPresetChange={vi.fn()}
        onRiderLayerVisibilityChange={onVisibilityChange}
        onOpenAdvanced={vi.fn()}
      />
    )

    const toggle = screen.getByRole("checkbox", { name: "Known gravel roads" })
    fireEvent.click(toggle)
    expect(onVisibilityChange).toHaveBeenCalledWith(gravelId, true)
  })
})
