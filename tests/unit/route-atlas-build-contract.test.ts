import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("route atlas production build contract", () => {
  it("runs the generated-data prebuild before Next build", async () => {
    const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.prebuild).toBe("node scripts/prepare-route-atlas.mjs")
    expect(pkg.scripts?.["atlas:verify"]).toBe("node scripts/verify-route-atlas.mjs")
  })
})
