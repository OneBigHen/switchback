import { describe, expect, it } from "vitest"
import { apiErrorResponse, readRequestId } from "@/lib/server/api-contract"

describe("API error contract", () => {
  it("preserves a bounded caller request id", () => {
    const request = new Request("http://switchback.test/api/routes", {
      headers: { "x-request-id": "ride-2026-08-11" }
    })

    expect(readRequestId(request)).toBe("ride-2026-08-11")
  })

  it("returns an actionable typed error with the correlation id", async () => {
    const response = apiErrorResponse(
      "ROUTER_UNAVAILABLE",
      "The route service is temporarily unavailable.",
      503,
      "req-test-1"
    )

    expect(response.headers.get("x-request-id")).toBe("req-test-1")
    expect(await response.json()).toMatchObject({
      error: {
        code: "ROUTER_UNAVAILABLE",
        action: "Try again in a moment.",
        requestId: "req-test-1"
      }
    })
  })
})
