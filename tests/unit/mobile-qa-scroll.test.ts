import { describe, expect, it } from "vitest"
import {
  scrollInteractionForEngine,
  selectIntendedScrollRegions,
} from "../../tests/e2e/mobile-qa/assertions"

describe("mobile QA scroll-owner candidate selection", () => {
  it("ignores naturally overflowing headings but retains nested user-reachable scroll regions", () => {
    const regions = selectIntendedScrollRegions([
      { name: "H1", overflowY: "visible", scrollHeight: 44, clientHeight: 20, visible: true },
      { name: "planner-scroll", overflowY: "auto", scrollHeight: 900, clientHeight: 400, visible: true },
      { name: "directions-list", overflowY: "scroll", scrollHeight: 500, clientHeight: 240, visible: true },
      { name: "clipped-copy", overflowY: "hidden", scrollHeight: 90, clientHeight: 20, visible: true },
    ])

    expect(regions.map((region) => region.name)).toEqual(["planner-scroll", "directions-list"])
  })

  it("uses the strongest public interaction available for each mobile engine", () => {
    expect(scrollInteractionForEngine("chromium")).toBe("wheel")
    expect(scrollInteractionForEngine("webkit")).toBe("programmatic-owner")
    expect(() => scrollInteractionForEngine("firefox")).toThrow("Unsupported mobile QA browser engine")
  })
})
