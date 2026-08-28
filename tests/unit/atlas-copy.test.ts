import { describe, expect, it } from "vitest"
import { buildAtlasCollectionCopy } from "@/app/gpx-library/page"

describe("route atlas collection copy", () => {
  it("distinguishes unique poster routes from imported variants and folded repeats", () => {
    expect(buildAtlasCollectionCopy({ importedVariants: 419, uniquePosters: 138, foldedVariants: 281 }))
      .toBe("138 unique route posters from 419 imported route variants. 281 imported variants share a route shape and are folded into these posters.")
  })

  it("does not mention folded variants when none are present", () => {
    expect(buildAtlasCollectionCopy({ importedVariants: 2, uniquePosters: 2, foldedVariants: 0 }))
      .toBe("2 unique route posters from 2 imported route variants.")
  })
})
