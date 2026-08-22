import { describe, expect, it } from "vitest"

import { classifyChange } from "../../scripts/qa/classify-change.mjs"

const change = (path: string, additions = 1, deletions = 0) => ({
  path,
  additions,
  deletions
})

describe("change risk classifier", () => {
  it("keeps documentation-only changes in the docs class", () => {
    expect(classifyChange([change("docs/quality/README.md"), change("README.md")])).toBe("docs")
  })

  it("detects the repository's high-signal domain classes", () => {
    expect(classifyChange([change("src/components/PlannerShell.tsx")])).toBe("ui")
    expect(classifyChange([change("src/lib/routing/graphhopper-client.ts")])).toBe("routing")
    expect(classifyChange([change("src/workers/service-worker.ts")])).toBe("offline")
    expect(classifyChange([change("src/lib/auth/passkey.ts")])).toBe("security")
  })

  it("raises broad or dependency changes to architecture", () => {
    expect(classifyChange([change("package.json")])).toBe("architecture")
    expect(
      classifyChange(Array.from({ length: 21 }, (_, index) => change(`src/lib/module-${index}.ts`)))
    ).toBe("architecture")
  })

  it("uses low for a small ordinary edit and standard otherwise", () => {
    expect(classifyChange([change("src/lib/format-distance.ts", 3, 1)])).toBe("low")
    expect(classifyChange([change("src/lib/format-distance.ts", 20, 4)])).toBe("standard")
  })
})
