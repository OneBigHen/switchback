import { describe, expect, it } from "vitest"

import { selectRegionalOfflineRegionIds } from "@/lib/client/regional-offline-route"

describe("regional offline reroute selection", () => {
  it("requires every catalog territory touched by the requested waypoints", () => {
    const selection = selectRegionalOfflineRegionIds([
      { lat: 40, lon: -76 },
      { lat: 40.4, lon: -74.8 }
    ], ["pennsylvania"])
    expect(selection.requiredRegionIds).toEqual(["pennsylvania", "new-jersey"])
    expect(selection.missingRegionIds).toEqual(["new-jersey"])
  })
})
