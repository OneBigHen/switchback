import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("service worker data boundaries", () => {
  it("never stores dynamic API responses in the offline shell cache", () => {
    const source = readFileSync("public/sw.js", "utf8")

    expect(source).toContain('url.pathname.startsWith("/api/")')
    expect(source).toContain('url.pathname === "/" && url.search === ""')
    expect(source).toMatch(/switchback-route-shell-v[2-9]/)
  })
})
