import "fake-indexeddb/auto"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RegionSuitePicker } from "@/components/planner/RegionSuitePicker"
import {
  HOME_TERRITORY_SUITE_ID,
  REGION_SUITES,
  getRegionSuite,
  resolveSuiteRegions
} from "@/lib/offline/region-suites"
import { OFFLINE_REGIONS } from "@/lib/offline/region-catalog"

describe("RegionSuitePicker", () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    cleanup()
  })

  it("renders all three suite presets with Home Territory marked as recommended", () => {
    render(<RegionSuitePicker selectedSuiteId={null} onSelectSuite={() => {}} />)

    expect(screen.getByText("Home Territory")).toBeInTheDocument()
    expect(screen.getByText("Appalachia")).toBeInTheDocument()
    expect(screen.getByText("Northeast")).toBeInTheDocument()

    const homeTitle = screen.getByText("Home Territory").closest(".region-suite-option-title")
    expect(homeTitle?.getAttribute("data-recommended")).toBe("true")
  })

  it("selecting a suite emits the suite with each referenced region exactly once", () => {
    const onSelectSuite = vi.fn()
    render(<RegionSuitePicker selectedSuiteId={null} onSelectSuite={onSelectSuite} />)

    fireEvent.click(screen.getByText("Appalachia"))

    expect(onSelectSuite).toHaveBeenCalledTimes(1)
    const emitted = onSelectSuite.mock.calls[0]![0]
    expect(emitted.id).toBe("appalachia")

    const resolved = resolveSuiteRegions(emitted)
    expect(emitted.regionCodes).toEqual(["PA", "WV", "VA", "NC", "OH"])
    const codes = resolved.map((r) => r.code)
    expect(new Set(codes)).toEqual(new Set(["PA", "WV", "VA", "NC", "OH"]))
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("calls onSelectSuite with null when the active suite is clicked again", () => {
    const onSelectSuite = vi.fn()
    render(
      <RegionSuitePicker
        selectedSuiteId={HOME_TERRITORY_SUITE_ID}
        onSelectSuite={onSelectSuite}
      />
    )

    fireEvent.click(screen.getByText("Home Territory"))

    expect(onSelectSuite).toHaveBeenCalledWith(null)
  })

  it("clears the suite via the Clear suite button", () => {
    const onSelectSuite = vi.fn()
    render(
      <RegionSuitePicker
        selectedSuiteId={HOME_TERRITORY_SUITE_ID}
        onSelectSuite={onSelectSuite}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /Clear the active region suite selection/i }))

    expect(onSelectSuite).toHaveBeenCalledWith(null)
  })

  it("marks only the active suite as selected", () => {
    render(
      <RegionSuitePicker
        selectedSuiteId={getRegionSuite("appalachia")!.id}
        onSelectSuite={() => {}}
      />
    )

    const appalachia = screen.getByText("Appalachia").closest(".region-suite-option")
    const home = screen.getByText("Home Territory").closest(".region-suite-option")
    expect(appalachia?.getAttribute("data-selected")).toBe("true")
    expect(home?.getAttribute("data-selected")).toBe("false")
  })

  it("every suite references regions that remain independently downloadable from the catalog", () => {
    for (const suite of REGION_SUITES) {
      const resolved = resolveSuiteRegions(suite)
      for (const region of resolved) {
        const occurrences = OFFLINE_REGIONS.filter((r) => r.id === region.id).length
        expect(occurrences).toBe(1)
      }
    }
  })

  it("no region appears twice in any suite's resolved codes", () => {
    for (const suite of REGION_SUITES) {
      const codes = suite.regionCodes
      expect(new Set(codes).size).toBe(codes.length)
    }
  })

  it("disables the Clear suite button when no suite is selected", () => {
    render(<RegionSuitePicker selectedSuiteId={null} onSelectSuite={() => {}} />)
    expect(screen.getByRole("button", { name: /Clear the active region suite selection/i })).toBeDisabled()
  })

  it("renders a wait-free summary of how many regions are selected", () => {
    render(
      <RegionSuitePicker
        selectedSuiteId={HOME_TERRITORY_SUITE_ID}
        onSelectSuite={() => {}}
      />
    )
    const summary = screen.getByText((content, element) => {
      return element?.classList.contains("region-suite-summary") === true
        && element.textContent?.includes("6")
        && element.textContent?.includes("regions selected")
        && element.textContent?.includes("each remains independently removable")
    })
    expect(summary).toBeInTheDocument()
    expect(summary.querySelector("strong")?.textContent).toBe("6")
  })

  it("does not bundle suite installs in the picker — the suite only toggles region selection state", async () => {
    const onSelectSuite = vi.fn()
    render(
      <RegionSuitePicker
        selectedSuiteId={HOME_TERRITORY_SUITE_ID}
        onSelectSuite={onSelectSuite}
      />
    )

    fireEvent.click(screen.getByText("Northeast"))

    await waitFor(() => expect(onSelectSuite).toHaveBeenCalled())
    const emitted = onSelectSuite.mock.calls[0]![0]
    expect(emitted.id).toBe("northeast")

    const resolved = resolveSuiteRegions(emitted)
    expect(resolved.length).toBe(emitted.regionCodes.length)
    for (const region of resolved) {
      expect(OFFLINE_REGIONS.some((r) => r.id === region.id)).toBe(true)
    }
  })
})
