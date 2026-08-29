import { describe, expect, it } from "vitest"
import {
  MOBILE_QA_DEVICES,
  MOBILE_QA_PROJECTS,
  coreMobileQaProjectNames,
  layoutMobileQaProjectNames,
} from "../../tests/e2e/mobile-qa/devices"

describe("mobile QA device matrix", () => {
  it("defines the required WebKit portrait and landscape geometry", () => {
    const webkit = MOBILE_QA_DEVICES.filter((device) => device.engine === "webkit")
    expect(webkit.map((device) => `${device.viewport.width}x${device.viewport.height}`)).toEqual([
      "320x568",
      "390x844",
      "430x932",
      "844x390",
    ])
    expect(webkit.every((device) => device.hasTouch && device.isMobile)).toBe(true)
  })

  it("keeps core tests on the two standard engines", () => {
    expect(coreMobileQaProjectNames()).toEqual(["webkit-standard", "chromium-standard"])
    expect(layoutMobileQaProjectNames()).toContain("webkit-standard-landscape")
    expect(layoutMobileQaProjectNames()).not.toContain("chromium-standard")
    expect(MOBILE_QA_PROJECTS).toHaveLength(5)
  })
})
