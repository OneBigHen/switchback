import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

interface PackageManifest {
  scripts?: Record<string, string>
}

describe("Gravel Atlas operator scripts", () => {
  function manifest(): PackageManifest {
    return JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as PackageManifest
  }

  it("feeds the reconciliation output through traversability verification into the NJ runtime build", () => {
    const scripts = manifest().scripts ?? {}
    const chain = scripts["gravel-atlas:refresh:nj"]

    expect(chain).toBeDefined()
    // Order matters: verified corridors must be proven rideable before the
    // runtime database is built, and the runtime build must consume the
    // traversability-filtered payload rather than the raw reconciliation.
    expect(chain).toContain("gravel-atlas:verify-routability")
    expect(chain).toContain(
      "gravel-atlas:runtime -- --input=data/gravel-atlas-verified-traversable.json"
    )
    expect(chain).not.toContain("--input=data/gravel-atlas-verified.json")
    expect(chain?.indexOf("gravel-atlas:reconcile")).toBeLessThan(
      chain?.indexOf("gravel-atlas:verify-routability") ?? -1
    )
    expect(chain?.indexOf("gravel-atlas:verify-routability")).toBeLessThan(
      chain?.indexOf("gravel-atlas:runtime") ?? -1
    )
  })

  it("exposes the traversability verification as its own operator command", () => {
    expect(manifest().scripts?.["gravel-atlas:verify-routability"]).toBe(
      "tsx scripts/verify-gravel-atlas-routability.ts"
    )
  })
})
