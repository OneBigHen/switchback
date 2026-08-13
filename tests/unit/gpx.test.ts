import { describe, expect, it } from "vitest"
import { recordedRideToGpx, routeToGpx, simplifyGpxGeometry } from "@/lib/routing/gpx"

describe("GPX export", () => {
  it("writes a GPX 1.1 track and preserves named waypoints", () => {
    const xml = routeToGpx({
      id: "route-1",
      name: "River & Ridge <Sunday>",
      profile: "twisty",
      geometry: [
        [-76.8867, 40.2732],
        [-76.5, 40.15],
        [-76.3055, 40.0379]
      ],
      waypoints: [
        { lat: 40.2732, lon: -76.8867, label: "Start & coffee" },
        { lat: 40.0379, lon: -76.3055, label: "Finish <home>" }
      ],
      distanceMiles: 38,
      durationMinutes: 72
    }, { variant: "track-waypoints" })

    const document = new DOMParser().parseFromString(xml, "application/xml")
    expect(document.querySelector("parsererror")).toBeNull()
    expect(document.documentElement.getAttribute("version")).toBe("1.1")
    expect(document.querySelectorAll("wpt")).toHaveLength(2)
    expect(document.querySelectorAll("trkseg trkpt")).toHaveLength(3)
    expect(document.querySelector("metadata name")?.textContent).toBe("River & Ridge <Sunday>")
    expect(document.querySelector("wpt name")?.textContent).toBe("Start & coffee")
  })

  it("refuses to export preview-only geometry as a finished route", () => {
    expect(() =>
      routeToGpx({
        id: "preview",
        name: "Preview",
        profile: "quick",
        geometry: [
          [-76.8, 40.2],
          [-76.7, 40.2]
        ],
        waypoints: [],
        distanceMiles: 5,
        durationMinutes: 10,
        previewOnly: true
      })
    ).toThrow(/preview-only/i)
  })

  it("exports portable route and cue variants without changing the recorded track", () => {
    const route = {
      id: "route-variant",
      name: "Cue route",
      profile: "scenic" as const,
      geometry: [[-77, 40], [-76.9, 40.1], [-76.8, 40.2]] as [number, number][],
      waypoints: [{ lat: 40, lon: -77, label: "Start" }, { lat: 40.2, lon: -76.8, label: "Finish" }],
      instructions: [{ distanceMeters: 500, timeMilliseconds: 60_000, sign: 0, text: "Continue", streetName: "Ridge Road", interval: [1, 2] as [number, number] }],
      distanceMiles: 20,
      durationMinutes: 35
    }

    const routeDocument = new DOMParser().parseFromString(routeToGpx(route, { variant: "route" }), "application/xml")
    const cueDocument = new DOMParser().parseFromString(routeToGpx(route, { variant: "cues" }), "application/xml")

    expect(routeDocument.querySelectorAll("rte rtept")).toHaveLength(2)
    expect(routeDocument.querySelector("trk")).toBeNull()
    expect(cueDocument.querySelector("rtept name")?.textContent).toBe("Continue onto Ridge Road")
    expect(cueDocument.querySelector("rtept cmt")?.textContent).toContain("500 m")
  })

  it("keeps generic track export separate from waypoint and original profiles", () => {
    const route = {
      id: "profiles",
      name: "Profiles",
      profile: "scenic" as const,
      geometry: [[-77, 40], [-76.9, 40.1], [-76.8, 40.2]] as [number, number][],
      waypoints: [{ lat: 40, lon: -77, label: "Start" }, { lat: 40.2, lon: -76.8, label: "Finish" }],
      distanceMiles: 20,
      durationMinutes: 35
    }
    const track = new DOMParser().parseFromString(routeToGpx(route), "application/xml")
    const withWaypoints = new DOMParser().parseFromString(routeToGpx(route, { variant: "track-waypoints" }), "application/xml")
    const original = new DOMParser().parseFromString(routeToGpx(route, { variant: "original" }), "application/xml")

    expect(track.querySelectorAll("wpt")).toHaveLength(0)
    expect(withWaypoints.querySelectorAll("wpt")).toHaveLength(2)
    expect(original.querySelector("trk")).not.toBeNull()
    expect(original.querySelectorAll("wpt")).toHaveLength(2)
    expect(original.querySelector("metadata desc")?.textContent).toContain("Original GPX artifact")
  })

  it("exports recorded GPS samples with time and sensor evidence", () => {
    const xml = recordedRideToGpx({
      id: "ride-1",
      routeId: "route-1",
      routeName: "Recorded Sunday",
      route: {
        id: "route-1",
        name: "Sunday",
        profile: "scenic",
        geometry: [[-77, 40], [-76.9, 40.1]],
        waypoints: [],
        instructions: [],
        distanceMiles: 8,
        durationMinutes: 20,
        ascentMeters: null,
        descentMeters: null,
        twistiness: 0,
        turnCount: 0,
        roadMix: {},
        surfaceMix: {},
        routingSource: "live",
        previewOnly: false
      },
      points: [
        { coordinate: [-77, 40], recordedAt: "2026-08-11T12:00:00Z", speedMph: 20, altitudeMeters: 400 },
        { coordinate: [-76.9, 40.1], recordedAt: "2026-08-11T12:10:00Z", speedMph: 25, headingDegrees: 90 }
      ],
      notes: "Ridge note",
      photos: [],
      startedAt: "2026-08-11T12:00:00Z",
      endedAt: "2026-08-11T12:10:00Z",
      createdAt: "2026-08-11T12:10:00Z",
      updatedAt: "2026-08-11T12:10:00Z"
    })
    const document = new DOMParser().parseFromString(xml, "application/xml")

    expect(document.querySelector("trk")).not.toBeNull()
    expect(document.querySelector("trkpt time")?.textContent).toBe("2026-08-11T12:00:00Z")
    expect(document.querySelector("trkpt ele")?.textContent).toBe("400")
    expect(document.querySelector("trkpt course")?.textContent).toBe("90")
    expect(document.querySelector("metadata desc")?.textContent).toContain("Ridge note")
  })

  it("simplifies only unprotected geometry while retaining route anchors", () => {
    const route = {
      id: "simplify",
      name: "Simplify",
      profile: "scenic" as const,
      geometry: [[-77, 40], [-76.99, 40], [-76.98, 40.01], [-76.97, 40], [-76.96, 40]] as [number, number][],
      waypoints: [{ lat: 40.01, lon: -76.98, label: "Protected ridge" }],
      instructions: [],
      distanceMiles: 10,
      durationMinutes: 20
    }

    expect(simplifyGpxGeometry(route, 10_000)).toEqual([
      route.geometry[0], route.geometry[2], route.geometry.at(-1)
    ])
  })
})
