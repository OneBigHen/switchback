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

    expect(redacted.geometry[0]).toEqual([-76.96, 40.04])
    expect(redacted.waypoints.map((point) => point.label)).not.toContain("Home")
    expect(redacted.name).toBe(route.name)
  })

  it("round-trips a compact local share without requiring an account", () => {
    const share = createPortableShare(route, [home], "https://switchback.example")
    const restored = restorePortableShare(share.url)

    expect(restored).toMatchObject({
      name: "Home ridge loop",
      routingSource: "imported",
      previewOnly: false,
      geometry: [[-76.96, 40.04], [-76.95, 40.05]]
    })
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
    expect(restored?.geometry[0]).toEqual([-76.96, 40.04])
    expect(restored?.waypoints.map((point) => point.label)).not.toContain("Home")
    expect(restored?.routingSource).toBe("imported")
  })
})
