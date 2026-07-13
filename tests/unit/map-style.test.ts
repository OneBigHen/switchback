import { describe, expect, it } from "vitest"
import { createFallbackStyleImage } from "@/lib/client/map-style"

describe("base-map sprite fallback", () => {
  it("builds the missing OpenFreeMap circle sprite without hiding town markers", () => {
    const image = createFallbackStyleImage("circle-11")

    expect(image).toMatchObject({ width: 11, height: 11 })
    expect(image?.data[(5 * 11 + 5) * 4 + 3]).toBe(255)
    expect(image?.data[3]).toBe(0)
  })

  it("does not invent unknown style icons", () => {
    expect(createFallbackStyleImage("restaurant-15")).toBeNull()
  })
})
