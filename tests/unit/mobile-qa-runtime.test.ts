import { describe, expect, it, vi } from "vitest"
import { isExpectedProviderHealthAbort, isExpectedRouteWeatherAbort } from "../../tests/e2e/mobile-qa/assertions"
import { waitForMobileQaNetworkState } from "../../tests/e2e/mobile-qa/fixtures"

describe("mobile QA network classification", () => {
  it("accepts only the exact route-weather cancellation reasons", () => {
    expect(isExpectedRouteWeatherAbort("GET http://localhost:3112/api/route-weather?points=fixture failed: net::ERR_ABORTED")).toBe(true)
    expect(isExpectedRouteWeatherAbort("GET http://localhost:3112/api/route-weather failed: Load request cancelled")).toBe(true)
    expect(isExpectedRouteWeatherAbort("GET http://localhost:3112/api/route-weather-extra failed: net::ERR_ABORTED")).toBe(false)
    expect(isExpectedRouteWeatherAbort("GET http://localhost:3112/api/route-weather failed: net::ERR_CONNECTION_RESET")).toBe(false)
  })

  it("accepts only exact provider-health cancellation requests", () => {
    expect(isExpectedProviderHealthAbort("GET http://localhost:3112/api/health failed: net::ERR_ABORTED")).toBe(true)
    expect(isExpectedProviderHealthAbort("GET http://localhost:3112/api/health failed: Load request cancelled")).toBe(true)
    expect(isExpectedProviderHealthAbort("POST http://localhost:3112/api/health failed: net::ERR_ABORTED")).toBe(false)
    expect(isExpectedProviderHealthAbort("GET http://localhost:3112/api/health?x=1 failed: net::ERR_ABORTED")).toBe(false)
    expect(isExpectedProviderHealthAbort("503 http://localhost:3112/api/health")).toBe(false)
    expect(isExpectedProviderHealthAbort("GET http://localhost:3112/api/health failed: net::ERR_CONNECTION_RESET")).toBe(false)
  })

  it("waits for browser network readiness instead of sleeping after a transition", async () => {
    const page = {
      evaluate: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
    }
    await waitForMobileQaNetworkState(page as never, true)
    expect(page.evaluate).toHaveBeenCalledOnce()
    expect(page.waitForFunction).toHaveBeenCalledOnce()
    expect(page.waitForFunction.mock.calls[0]?.[1]).toBe(true)
  })
})
