import { describe, expect, it } from "vitest"
import nextConfig from "../../next.config"

describe("Next development access", () => {
  it("allows the loopback and LAN hosts used to open the live development app", () => {
    expect(nextConfig.allowedDevOrigins).toEqual(expect.arrayContaining([
      "127.0.0.1",
      "switchback.home.arpa"
    ]))
  })
})
