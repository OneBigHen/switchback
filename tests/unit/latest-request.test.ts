import { describe, expect, it } from "vitest"
import { createLatestRequestGate } from "@/lib/client/latest-request"

describe("latest route request gate", () => {
  it("accepts only the newest request and can invalidate in-flight work", () => {
    const gate = createLatestRequestGate()
    const first = gate.begin()
    const second = gate.begin()

    expect(gate.isCurrent(first)).toBe(false)
    expect(gate.isCurrent(second)).toBe(true)

    gate.invalidate()
    expect(gate.isCurrent(second)).toBe(false)
  })
})
