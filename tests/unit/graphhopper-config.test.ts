import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const repoRoot = resolve(import.meta.dirname, "../..")

function readConfig(): string {
  return readFileSync(resolve(repoRoot, "infra/graphhopper/config.yml"), "utf8")
}

function readCustomModel(name: string): Record<string, unknown> {
  const raw = readFileSync(resolve(repoRoot, `infra/graphhopper/custom-models/${name}.json`), "utf8")
  return JSON.parse(raw) as Record<string, unknown>
}

interface PriorityRule {
  if?: string
  multiply_by?: string
}

function priorityRules(model: Record<string, unknown>): PriorityRule[] {
  return (model.priority as PriorityRule[] | undefined) ?? []
}

describe("GraphHopper graph configuration (Phase 3)", () => {
  it("registers the toll encoded value alongside the evidence values scoring needs", () => {
    const encoded = readConfig().match(/graph\.encoded_values:\s*(.+)/)?.[1] ?? ""
    expect(encoded.split(",").map((value) => value.trim())).toEqual(
      expect.arrayContaining(["toll", "road_environment", "urban_density", "curvature"])
    )
  })

  it("keeps all four profiles in the landmark (LM) preparation list", () => {
    const config = readConfig()
    expect(config).toContain("profiles_lm:")
    for (const profile of ["motorcycle_fastest", "motorcycle_twisty", "motorcycle_scenic", "motorcycle_adventure"]) {
      expect(config).toContain(`- profile: ${profile}`)
    }
  })

  it("penalizes tolls persistently without excluding them, in every profile model", () => {
    // twisty and scenic inherit the base model's rules.
    const base = priorityRules(readCustomModel("motorcycle-base"))
    expect(base).toContainEqual({ if: "toll == ALL", multiply_by: "0.2" })

    for (const name of ["motorcycle-fastest", "motorcycle-adventure"]) {
      expect(priorityRules(readCustomModel(name))).toContainEqual({ if: "toll == ALL", multiply_by: "0.2" })
    }

    // The persistent penalty keeps tolls eligible (nonzero), matching the
    // locked "allow with warning" default; zeroing is the request-time rule.
    for (const name of ["motorcycle-base", "motorcycle-fastest", "motorcycle-adventure"]) {
      const rule = priorityRules(readCustomModel(name)).find((entry) => entry.if === "toll == ALL")
      expect(Number(rule?.multiply_by)).toBeGreaterThan(0)
    }
  })

  it("loads every custom model referenced by the profiles as valid JSON", () => {
    for (const name of [
      "motorcycle-base",
      "motorcycle-fastest",
      "motorcycle-twisty",
      "motorcycle-scenic",
      "motorcycle-adventure",
      "prefer-curvature"
    ]) {
      const model = readCustomModel(name)
      expect(Array.isArray(model.priority)).toBe(true)
      if (model.speed !== undefined) {
        expect(Array.isArray(model.speed)).toBe(true)
      }
    }
  })
})
