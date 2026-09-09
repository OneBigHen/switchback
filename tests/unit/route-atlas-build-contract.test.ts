import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("route atlas production build contract", () => {
  it("runs the generated-data prebuild before Next build", async () => {
    const pkg = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    // Every generated artifact Next needs must be produced by `prebuild`, which
    // npm runs before `build`. Asserted by content rather than as one exact
    // string so adding a generator cannot silently drop an existing one.
    expect(pkg.scripts?.prebuild).toContain("node scripts/prepare-route-atlas.mjs")
    // MapLibre's worker is served from public/ and is not in the repo, so the
    // build has to regenerate it or the fallback renderer ships without a
    // worker and draws no route.
    expect(pkg.scripts?.prebuild).toContain("node scripts/copy-maplibre-worker.mjs")
    expect(pkg.scripts?.postinstall).toContain("node scripts/copy-maplibre-worker.mjs")
    expect(pkg.scripts?.["atlas:verify"]).toBe("node scripts/verify-route-atlas.mjs")
  })
})
