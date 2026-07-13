import { describe, expect, it } from "vitest"
import { MAX_GPX_IMPORT_BYTES, parseGpxRoute } from "@/lib/routing/gpx-import"

const validGpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Pine Creek Run</name></metadata>
  <wpt lat="41.747" lon="-77.301"><name>Fuel</name></wpt>
  <trk><name>Sunday Track</name><trkseg>
    <trkpt lat="41.747" lon="-77.301"><ele>410</ele><time>2026-07-12T13:00:00Z</time></trkpt>
    <trkpt lat="41.72" lon="-77.35"><ele>470</ele><time>2026-07-12T13:10:00Z</time></trkpt>
    <trkpt lat="41.69" lon="-77.31"><ele>430</ele><time>2026-07-12T13:20:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`

describe("GPX import", () => {
  it("normalizes a valid GPX track into a local imported route", () => {
    const route = parseGpxRoute(validGpx, { id: "import-1", fileName: "pine-creek.gpx" })

    expect(route).toMatchObject({
      id: "import-1",
      name: "Pine Creek Run",
      profile: "scenic",
      routingSource: "imported",
      previewOnly: false,
      durationMinutes: 20,
      ascentMeters: 60,
      descentMeters: 40
    })
    expect(route.geometry[0]).toEqual([-77.301, 41.747])
    expect(route.waypoints[0].label).toBe("Fuel")
    expect(route.waypoints.at(-1)?.label).toBe("Track finish")
    expect(route.distanceMiles).toBeGreaterThan(4)
  })

  it("rejects coordinates with missing attributes instead of treating them as zero", () => {
    const missingLatitude = `<gpx version="1.1"><trk><trkseg>
      <trkpt lon="-77.3"/><trkpt lat="41.7" lon="-77.2"/>
    </trkseg></trk></gpx>`

    expect(() => parseGpxRoute(missingLatitude, { fileName: "missing-lat.gpx" }))
      .toThrow(/valid coordinates/i)
  })

  it("keeps missing elevations unknown rather than inventing sea-level samples", () => {
    const noElevation = `<gpx version="1.1"><trk><trkseg>
      <trkpt lat="41.7" lon="-77.3"/><trkpt lat="41.71" lon="-77.2"/>
    </trkseg></trk></gpx>`

    const route = parseGpxRoute(noElevation, { fileName: "no-elevation.gpx" })
    expect(route.ascentMeters).toBeNull()
    expect(route.descentMeters).toBeNull()
  })

  it("rejects disconnected track segments instead of drawing a fake connector", () => {
    const disconnected = `<gpx version="1.1"><trk>
      <trkseg><trkpt lat="41.7" lon="-77.3"/><trkpt lat="41.71" lon="-77.2"/></trkseg>
      <trkseg><trkpt lat="40.2" lon="-75.1"/><trkpt lat="40.21" lon="-75.0"/></trkseg>
    </trk></gpx>`

    expect(() => parseGpxRoute(disconnected, { fileName: "disconnected.gpx" }))
      .toThrow(/disconnected/i)
  })

  it("anchors POIs between the actual track start and finish", () => {
    const withPoi = `<gpx version="1.1">
      <wpt lat="41.705" lon="-77.25"><name>Fuel stop</name></wpt>
      <trk><trkseg>
        <trkpt lat="41.7" lon="-77.3"/><trkpt lat="41.705" lon="-77.25"/><trkpt lat="41.71" lon="-77.2"/>
      </trkseg></trk>
    </gpx>`

    const route = parseGpxRoute(withPoi, { fileName: "poi.gpx" })
    expect(route.waypoints.map((point) => point.label)).toEqual([
      "Track start",
      "Fuel stop",
      "Track finish"
    ])
  })

  it("rejects malformed, empty, and oversized files before accepting geometry", () => {
    expect(() => parseGpxRoute("<gpx><trk>", { fileName: "broken.gpx" })).toThrow(/malformed/i)
    expect(() => parseGpxRoute("<gpx version=\"1.1\"></gpx>", { fileName: "empty.gpx" })).toThrow(/track points/i)
    expect(() => parseGpxRoute(validGpx, {
      fileName: "huge.gpx",
      byteLength: MAX_GPX_IMPORT_BYTES + 1
    })).toThrow(/5 MB/i)
  })
})
