import { describe, expect, it } from "vitest"
import { rankDiverseCandidates, routeSimilarity, type DiversityRoute } from "@/lib/recommendation/route-diversity"

function uid(value: string): string {
  return value.repeat(64).slice(0, 64)
}

function route(id: string, score: number, refs: Array<[string, number]>): DiversityRoute {
  return {
    id,
    geometry: [[-76.9, 40.2], [-76.7, 40.3]],
    routeScore: { total: score, accepted: true },
    canonicalSegmentRefs: refs.map(([value, lengthMeters]) => ({
      canonicalSegmentUid: uid(value),
      lengthMeters
    }))
  }
}

describe("canonical route diversity", () => {
  it("measures directed canonical overlap and weighted Jaccard", () => {
    const first = route("a", 90, [["a", 1_000], ["b", 1_000]])
    const second = route("b", 80, [["b", 1_000], ["c", 1_000]])
    const reverse = route("reverse", 80, [["d", 2_000], ["e", 1_000]])

    expect(routeSimilarity(first, second)).toMatchObject({
      mode: "canonical-directed",
      overlapShare: 0.5,
      weightedJaccard: 1 / 3
    })
    expect(routeSimilarity(first, reverse).overlapShare).toBe(0)
  })

  it("uses MMR to prefer a materially different route with a still-strong utility", () => {
    const selected = route("selected", 90, [["a", 2_000]])
    const same = route("same", 100, [["a", 2_000]])
    const different = route("different", 80, [["b", 2_000]])

    const ranked = rankDiverseCandidates([same, different], [selected], { diversityLambda: 0.35 })

    expect(ranked[0]?.route.id).toBe("different")
    expect(ranked[0]?.similarityMode).toBe("canonical-directed")
  })

  it("strictly drops candidates above the configured similarity ceiling", () => {
    const selected = route("selected", 90, [["a", 2_000]])
    const duplicate = route("duplicate", 100, [["a", 2_000]])
    const separate = route("separate", 50, [["b", 2_000]])

    expect(rankDiverseCandidates([duplicate, separate], [selected], {
      strict: true,
      maxSimilarity: 0.8
    }).map((candidate) => candidate.route.id)).toEqual(["separate"])
  })

  it("labels geometry fallback instead of claiming canonical evidence", () => {
    const first = { id: "a", geometry: [[-76.9, 40.2], [-76.7, 40.3]] as [number, number][] }
    const second = { id: "b", geometry: [[-76.9, 40.2], [-76.7, 40.3]] as [number, number][] }

    expect(routeSimilarity(first, second).mode).toBe("geometry-proxy")
  })
})
