import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

interface PackageManifest {
  scripts?: Record<string, string>
}

describe("Gravel Atlas operator scripts", () => {
  it("feeds the reconciliation output into the NJ runtime build", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as PackageManifest

    expect(manifest.scripts?.["gravel-atlas:refresh:nj"]).toContain(
      "gravel-atlas:runtime -- --input=data/gravel-atlas-verified.json"
    )
  })
})
