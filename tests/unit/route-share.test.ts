import { describe, expect, it } from "vitest"
import {
  createPortableShare,
  redactRouteForShare,
  restorePortableShare,
  type PrivacyZone
} from "@/lib/share/route-share"
import type { PlannedRoute } from "@/lib/routing/types"

const route: PlannedRoute = {
  id: "home-ride",
  name: "Home ridge loop",
  profile: "twisty",
  geometry: [[-77, 40], [-76.99, 40.01], [-76.96, 40.04], [-76.95, 40.05]],
  waypoints: [
    { lat: 40, lon: -77, label: "Home" },
    { lat: 40.05, lon: -76.95, label: "Finish" }
  ],
  instructions: [],
  distanceMiles: 12,
  durationMinutes: 24,
  ascentMeters: 90,
  descentMeters: 80,
  twistiness: 70,
  turnCount: 18,
  roadMix: { secondary: 100 },
  surfaceMix: { asphalt: 100 },
  routingSource: "live",
  previewOnly: false
}

describe("portable privacy-preserving route shares", () => {
  const home: PrivacyZone = { id: "home", label: "Home", center: [-77, 40], radiusMeters: 1_800 }

  it("removes private start/end geometry and labels before a route leaves the device", () => {
    const redacted = redactRouteForShare(route, [home])

    // No point inside the protected zone; the visible line starts exactly at
    // the zone boundary (no straight jump across protected geometry).
    expect(redacted.geometry.length).toBeGreaterThanOrEqual(3)
    for (const [lon, lat] of redacted.geometry) {
      const distanceMeters = Math.hypot((lon - home.center[0]) * 86_700, (lat - home.center[1]) * 111_320)
      expect(distanceMeters).toBeGreaterThanOrEqual(home.radiusMeters - 5)
    }
    expect(redacted.waypoints.map((point) => point.label)).not.toContain("Home")
    expect(redacted.name).toBe(route.name)
  })

  it("round-trips a compact local share without requiring an account", () => {
    const share = createPortableShare(route, [home], "https://switchback.example")
    const restored = restorePortableShare(share.url)

    expect(restored).toMatchObject({
      name: "Home ridge loop",
      routingSource: "imported",
      previewOnly: false
    })
    expect(restored?.geometry.length).toBeGreaterThanOrEqual(3)
    for (const [lon, lat] of restored!.geometry) {
      const distanceMeters = Math.hypot((lon - home.center[0]) * 86_700, (lat - home.center[1]) * 111_320)
      expect(distanceMeters).toBeGreaterThanOrEqual(home.radiusMeters - 5)
    }
    expect(restored?.id).not.toBe(route.id)
  })
})

describe("portable share strict validation", () => {
  const home: PrivacyZone = { id: "home", label: "Home", center: [-77, 40], radiusMeters: 1_800 }

  it("restores a well-formed portable share round-trip", () => {
    const share = createPortableShare(route, [], "https://switchback.example")
    const restored = restorePortableShare(share.url)

    expect(restored).not.toBeNull()
    expect(restored).toMatchObject({
      name: "Home ridge loop",
      profile: "twisty",
      routingSource: "imported",
      distanceMiles: 12,
      turnCount: 18
    })
    expect(restored?.id).not.toBe(route.id)
  })

  it("returns null when version is missing or wrong", () => {
    const share = createPortableShare(route, [], "https://switchback.example")
    const tampered = share.url.replace(/#route=/, "#route=") + "x"
    expect(restorePortableShare(tampered)).toBeNull()

    const good = new URL(share.url)
    const token = good.hash.replace(/^#route=/, "")
    const payload = JSON.parse(atob(token.replaceAll("-", "+").replaceAll("_", "/")))
    delete payload.version
    const reencoded = btoa(JSON.stringify(payload)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    expect(restorePortableShare(`https://switchback.example/#route=${reencoded}`)).toBeNull()

    payload.version = 2
    const reencoded2 = btoa(JSON.stringify(payload)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    expect(restorePortableShare(`https://switchback.example/#route=${reencoded2}`)).toBeNull()
  })

  it("returns null when route is not a plain object", () => {
    const payload = JSON.stringify({ version: 1, route: "nope" })
    const encoded = btoa(payload).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    expect(restorePortableShare(`https://switchback.example/#route=${encoded}`)).toBeNull()
  })

  it("returns null when geometry is missing or fewer than 2 coordinates", () => {
    const payload = JSON.stringify({
      version: 1,
      route: { ...route, geometry: [[-77, 40]] }
    })
    const encoded = btoa(payload).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    expect(restorePortableShare(`https://switchback.example/#route=${encoded}`)).toBeNull()
  })

  it("returns null when a geometry coordinate has wrong length", () => {
    const payload = JSON.stringify({
      version: 1,
      route: { ...route, geometry: [[-77], [-76.95, 40.05]] }
    })
    const encoded = btoa(payload).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    expect(restorePortableShare(`https://switchback.example/#route=${encoded}`)).toBeNull()
  })

  it("returns null when a geometry coordinate has NaN lon or out-of-range lat", () => {
    const payloadWithNaN = JSON.stringify({
      version: 1,
      route: { ...route, geometry: [[NaN, 40], [-76.95, 40.05]] }
    })
    const encodedNaN = btoa(payloadWithNaN).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    expect(restorePortableShare(`https://switchback.example/#route=${encodedNaN}`)).toBeNull()

    const payloadWithHighLat = JSON.stringify({
      version: 1,
      route: { ...route, geometry: [[-77, 91], [-76.95, 40.05]] }
    })
    const encodedHigh = btoa(payloadWithHighLat).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    expect(restorePortableShare(`https://switchback.example/#route=${encodedHigh}`)).toBeNull()
  })

  it("returns null when a waypoint has non-numeric lat", () => {
    const payload = JSON.stringify({
      version: 1,
      route: { ...route, waypoints: [{ lat: "forty", lon: -77 }] }
    })
    const encoded = btoa(payload).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    expect(restorePortableShare(`https://switchback.example/#route=${encoded}`)).toBeNull()
  })

  it("returns null when an instruction has non-finite distanceMeters", () => {
    const badInstruction = {
      distanceMeters: Infinity,
      timeMilliseconds: 1000,
      sign: 0,
      text: "go",
      streetName: "",
      interval: [0, 1]
    }
    const payload = JSON.stringify({
      version: 1,
      route: { ...route, instructions: [badInstruction] }
    })
    const encoded = btoa(payload).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    expect(restorePortableShare(`https://switchback.example/#route=${encoded}`)).toBeNull()
  })

  it("returns null when an instruction's interval is not a [number, number] tuple", () => {
    const badInstruction = {
      distanceMeters: 10,
      timeMilliseconds: 1000,
      sign: 0,
      text: "go",
      streetName: "",
      interval: [0]
    }
    const payload = JSON.stringify({
      version: 1,
      route: { ...route, instructions: [badInstruction] }
    })
    const encoded = btoa(payload).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    expect(restorePortableShare(`https://switchback.example/#route=${encoded}`)).toBeNull()
  })

  it("returns null when route.profile is not a supported RouteProfileId", () => {
    const payload = JSON.stringify({
      version: 1,
      route: { ...route, profile: "fastest" }
    })
    const encoded = btoa(payload).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    expect(restorePortableShare(`https://switchback.example/#route=${encoded}`)).toBeNull()
  })

  it("returns null when distanceMiles is missing or negative", () => {
    const { distanceMiles: _drop, ...rest } = route
    void _drop
    const missingPayload = JSON.stringify({ version: 1, route: rest })
    const missingEncoded = btoa(missingPayload).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    expect(restorePortableShare(`https://switchback.example/#route=${missingEncoded}`)).toBeNull()

    const negativePayload = JSON.stringify({
      version: 1,
      route: { ...route, distanceMiles: -1 }
    })
    const negativeEncoded = btoa(negativePayload).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    expect(restorePortableShare(`https://switchback.example/#route=${negativeEncoded}`)).toBeNull()
  })

  it("returns null when the URL hash token has been tampered with", () => {
    const share = createPortableShare(route, [], "https://switchback.example")
    const slightlyOff = share.url.slice(0, -2) + "ZZ"
    expect(restorePortableShare(slightlyOff)).toBeNull()
  })

  it("returns null when the URL is malformed entirely", () => {
    expect(restorePortableShare("not-a-url")).toBeNull()
    expect(restorePortableShare("https://switchback.example/")).toBeNull()
  })

  it("strips unknown extras from a route before emitting a portable share", () => {
    const routeWithExtras = { ...route, customField: "leak", overlapPercent: 42 } as PlannedRoute
    const share = createPortableShare(routeWithExtras, [], "https://switchback.example")
    const restored = restorePortableShare(share.url)

    expect(restored).not.toBeNull()
    expect(restored).not.toHaveProperty("customField")
    expect(restored).not.toHaveProperty("overlapPercent")
    expect(restored).not.toHaveProperty("provider")
  })

  it("preserves privacy-zone redaction behavior end-to-end", () => {
    const redacted = redactRouteForShare(route, [home])
    const share = createPortableShare(redacted, [], "https://switchback.example")
    const restored = restorePortableShare(share.url)

    expect(restored?.geometry).toEqual(redacted.geometry)
    expect(restored?.geometry.length).toBeGreaterThanOrEqual(3)
    expect(restored?.waypoints.map((point) => point.label)).not.toContain("Home")
    expect(restored?.routingSource).toBe("imported")
  })
})

describe("privacy redaction completeness (SB-008)", () => {
  const home: PrivacyZone = { id: "home", label: "Home", center: [-77, 40], radiusMeters: 1_800 }

  const routed = (): PlannedRoute => ({
    id: "routed",
    name: "Ride",
    profile: "twisty",
    geometry: [
      [-77, 40],
      [-76.99, 40.01],
      [-76.98, 40.02],
      [-76.97, 40.03],
      [-76.96, 40.04],
      [-76.95, 40.05]
    ],
    waypoints: [
      { lat: 40, lon: -77, label: "Home" },
      { lat: 40.05, lon: -76.95, label: "Finish" }
    ],
    instructions: [
      { distanceMeters: 500, timeMilliseconds: 60_000, sign: 0, text: "Head north on Main St", streetName: "Main St", interval: [0, 1] },
      { distanceMeters: 900, timeMilliseconds: 90_000, sign: 0, text: "Continue on Ridge Rd", streetName: "Ridge Rd", interval: [2, 3] },
      { distanceMeters: 400, timeMilliseconds: 40_000, sign: 0, text: "Continue on River Rd", streetName: "River Rd", interval: [4, 5] }
    ],
    distanceMiles: 12,
    durationMinutes: 24,
    ascentMeters: 90,
    descentMeters: 80,
    twistiness: 70,
    turnCount: 18,
    roadMix: { secondary: 100 },
    surfaceMix: { asphalt: 100 },
    routingSource: "live",
    previewOnly: false
  })

  it("drops instructions whose segments lie inside or span a privacy zone", () => {
    const redacted = redactRouteForShare(routed(), [home])
    const texts = redacted.instructions.map((instruction) => instruction.text)
    // Main St (interval [0,1]) sits fully inside the protected zone: dropped.
    expect(texts).not.toContain("Head north on Main St")
    // Ridge Rd [2,3] and River Rd [4,5] are outside the zone: survive.
    expect(texts).toContain("Continue on Ridge Rd")
    expect(texts).toContain("Continue on River Rd")
  })

  it("recalculates distance and duration from the visible geometry only", () => {
    const redacted = redactRouteForShare(routed(), [home])
    expect(redacted.distanceMiles).toBeLessThan(12)
    expect(redacted.durationMinutes).toBeLessThan(24)
    expect(redacted.distanceMiles).toBeGreaterThan(0)
    expect(redacted.ascentMeters).toBeNull()
    expect(redacted.descentMeters).toBeNull()
  })

  it("rebases surviving instruction intervals onto the visible geometry", () => {
    const redacted = redactRouteForShare(routed(), [home])
    const river = redacted.instructions.find((instruction) => instruction.text === "Continue on River Rd")
    expect(river).toBeDefined()
    const [start, end] = river!.interval
    // River Rd originally spanned original indices [4,5]; after removing the
    // protected [0,1] run and inserting one boundary point, it lands at [2,3]
    // — inside the visible geometry and past the removed section.
    expect([start, end]).toEqual([2, 3])
    expect(start).toBeLessThanOrEqual(end)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeLessThan(redacted.geometry.length)
  })

  it("never emits a protected street name or a straight jump across the zone", () => {
    const redacted = redactRouteForShare(routed(), [home])
    for (const instruction of redacted.instructions) {
      expect(instruction.streetName.toLowerCase()).not.toMatch(/main/)
    }
    // The visible line terminates at the zone boundary on both sides: the
    // first visible point sits on the radius ring.
    const first = redacted.geometry[0]!
    const distanceMeters = Math.hypot((first[0] - home.center[0]) * 86_700, (first[1] - home.center[1]) * 111_320)
    expect(Math.abs(distanceMeters - home.radiusMeters)).toBeLessThan(50)
  })

  it("simplifies deterministically before failing an oversized link", () => {
    const dense: PlannedRoute = {
      ...routed(),
      geometry: Array.from({ length: 400 }, (_, index) => [
        -76.8 + index * 0.0001,
        40.0 + Math.sin(index / 10) * 0.0001
      ] as [number, number]),
      instructions: []
    }
    const share = createPortableShare(dense, [], "https://switchback.example")
    const restored = restorePortableShare(share.url)
    expect(restored).not.toBeNull()
    // Simplified geometry is smaller than the original.
    expect(restored!.geometry.length).toBeLessThan(dense.geometry.length)
  })
})
