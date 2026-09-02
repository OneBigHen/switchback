import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

type PackageJson = {
  dependencies?: Record<string, string>
}

function parseVersion(value: string): [number, number, number] {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) throw new Error(`Expected an exact or ranged semver, got: ${value}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function isAtLeast(actual: [number, number, number], minimum: [number, number, number]) {
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] > minimum[index]) return true
    if (actual[index] < minimum[index]) return false
  }
  return true
}

describe("production dependency security floor", () => {
  it("keeps Next.js at or above the August 2026 security release", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as PackageJson
    const nextVersion = packageJson.dependencies?.next

    expect(nextVersion).toBeDefined()
    expect(isAtLeast(parseVersion(nextVersion ?? ""), [16, 3, 3])).toBe(true)
  })
})
