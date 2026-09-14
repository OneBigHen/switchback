import { describe, expect, it } from "vitest"
// @ts-expect-error — plain ESM build script without type declarations
import { rdp } from "../../scripts/build-route-atlas.mjs"

describe("route atlas simplification", () => {
  it("keeps the shape of a closed loop whose ends meet", () => {
    const loop = [[10, 10], [30, 12], [40, 30], [25, 45], [8, 30], [10, 10]]
    const simplified = rdp(loop, 0.22) as number[][]
    expect(simplified.length).toBeGreaterThan(2)
    expect(simplified).toContainEqual([40, 30])
  })

  it("still drops points that sit on a straight open line", () => {
    expect(rdp([[0, 0], [5, 0.01], [10, 0]], 0.22)).toEqual([[0, 0], [10, 0]])
  })
})
