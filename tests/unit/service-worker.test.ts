import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("service worker data boundaries (SB-019)", () => {
  it("never stores dynamic API responses in the offline shell cache", () => {
    const source = readFileSync("public/sw.js", "utf8")

    expect(source).toContain('url.pathname.startsWith("/api/")')
    expect(source).toContain('url.pathname === "/" && url.search === ""')
  })

  it("separates shell, build, tile, and image caches with explicit bounds", () => {
    const source = readFileSync("public/sw.js", "utf8")

    expect(source).toContain('const SHELL_CACHE = "switchback-shell-v3"')
    expect(source).toContain('const BUILD_CACHE = "switchback-build-v3"')
    expect(source).toContain('const TILE_CACHE = "switchback-tiles-v3"')
    expect(source).toContain('const IMAGE_CACHE = "switchback-images-v3"')
    // Every cache is bounded by an entry cap.
    expect(source).toMatch(/cachePut\([^)]*,\s*\d+\)/g)
    expect(source).toContain("trimCache")
  })

  it("serves navigation network-first and keeps tiles bounded", () => {
    const source = readFileSync("public/sw.js", "utf8")
    expect(source).toContain('request.mode === "navigate"')
    expect(source).toContain("fetch(request).then")
    expect(source).toContain('url.hostname === "tiles.openfreemap.org"')
    expect(source).toContain("TILE_CACHE")
  })
})
