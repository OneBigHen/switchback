import { describe, expect, it } from "vitest"
import { routeToGpx } from "@/lib/routing/gpx"

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
    })

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
})
