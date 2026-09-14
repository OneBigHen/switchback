import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import nextConfig from "../../next.config"

const root = resolve(import.meta.dirname, "../..")
const nextConfigSource = readFileSync(resolve(root, "next.config.ts"), "utf8")

describe("Next development access", () => {
  it("allows the loopback and LAN hosts used to open the live development app", () => {
    expect(nextConfig.allowedDevOrigins).toEqual(expect.arrayContaining([
      "127.0.0.1",
      "switchback.home.arpa"
    ]))
  })

  it("allows the Mapbox browser requests and the canonical ArcGIS image host", () => {
    expect(nextConfigSource).toContain("https://api.mapbox.com")
    expect(nextConfigSource).toContain("https://events.mapbox.com")
    expect(nextConfigSource).toContain("https://server.arcgisonline.com")
    expect(nextConfigSource).not.toContain("https://server.arcgisonline https://")
  })
})
