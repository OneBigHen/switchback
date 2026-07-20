import { describe, expect, it } from "vitest"
import { A11Y_TOKENS } from "@/app/styles/a11y-tokens"

describe("a11y tokens", () => {
  it("covers the required accessibility dimensions", () => {
    expect(Object.keys(A11Y_TOKENS).sort()).toEqual([
      "contrast",
      "focus",
      "landscape",
      "reducedMotion",
      "touchTarget"
    ])
  })

  it("uses positive finite numbers for every numeric token", () => {
    function assertPositiveFinite(value: unknown) {
      if (typeof value === "number") {
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThan(0)
      }
      if (value && typeof value === "object") {
        Object.values(value).forEach(assertPositiveFinite)
      }
    }

    assertPositiveFinite(A11Y_TOKENS)
  })

  it("documents standard WCAG contrast ratios", () => {
    expect(A11Y_TOKENS.contrast).toEqual({
      normalTextAA: 4.5,
      normalTextAAA: 7,
      largeTextAA: 3,
      largeTextAAA: 4.5,
      uiComponentAA: 3
    })
  })

  it("defines a syntactically valid reduced-motion media query", () => {
    expect(A11Y_TOKENS.reducedMotion.mediaQuery).toMatch(/^\([a-z-]+:\s*[a-z-]+\)$/)
  })
})
