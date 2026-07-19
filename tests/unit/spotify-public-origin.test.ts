import { describe, expect, it } from "vitest"
import { publicSwitchbackHttpsUrl } from "@/lib/spotify/public-origin"

describe("Switchback public Spotify origin", () => {
  it("moves a stale public HTTP tab to the equivalent HTTPS URL", () => {
    expect(publicSwitchbackHttpsUrl({
      protocol: "http:",
      hostname: "ride.henning.rodeo",
      pathname: "/",
      search: "?player=open",
      hash: "#music"
    })).toBe("https://ride.henning.rodeo/?player=open#music")
  })

  it("leaves HTTPS and LAN entrypoints alone", () => {
    expect(publicSwitchbackHttpsUrl({
      protocol: "https:",
      hostname: "ride.henning.rodeo",
      pathname: "/",
      search: "",
      hash: ""
    })).toBeNull()
    expect(publicSwitchbackHttpsUrl({
      protocol: "http:",
      hostname: "switchback.home.arpa",
      pathname: "/",
      search: "",
      hash: ""
    })).toBeNull()
  })
})
