import { describe, expect, it } from "vitest"
import { PRODUCT_BRAND } from "@/lib/brand/product-brand"

describe("PRODUCT_BRAND", () => {
  it("exposes the approved OpenGravel rider-facing identity", () => {
    expect(PRODUCT_BRAND).toEqual({
      name: "OpenGravel",
      shortName: "OpenGravel",
      tagline: "Open routes. A wilder tomorrow.",
      functionalTagline: "Find routes worth riding.",
      description: "A motorcycle trip decision engine for gravel, backroads, and roads worth riding.",
      applicationDescription: "Plan, compare, prepare, and ride motorcycle routes with gravel and backroad intelligence."
    })
  })
})
