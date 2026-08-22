import { describe, expect, it } from "vitest"
import { parseGpxRoute } from "@/lib/routing/import/gpx-parser"

const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Parser track</name></metadata>
  <trk><trkseg>
    <trkpt lat="41.7" lon="-77.3"><ele>400</ele></trkpt>
    <trkpt lat="41.71" lon="-77.2"><ele>450</ele></trkpt>
  </trkseg></trk>
</gpx>`

describe("GPX parser", () => {
  it("parses a GPX track without going through the compatibility facade", () => {
    const route = parseGpxRoute(gpx, { id: "parser-route", fileName: "parser.gpx" })

    expect(route).toMatchObject({
      id: "parser-route",
      name: "Parser track",
      routingSource: "imported",
      navigationMode: "track-only"
    })
    expect(route.geometry).toEqual([[-77.3, 41.7], [-77.2, 41.71]])
  })

  it("keeps disconnected-segment policy in the GPX parser", () => {
    const disconnected = `<gpx version="1.1"><trk>
      <trkseg><trkpt lat="40" lon="-76"/><trkpt lat="40.01" lon="-76.01"/></trkseg>
      <trkseg><trkpt lat="41" lon="-77"/><trkpt lat="41.1" lon="-77.1"/><trkpt lat="41.2" lon="-77.2"/></trkseg>
    </trk></gpx>`

    expect(() => parseGpxRoute(disconnected, { fileName: "disconnected.gpx" }))
      .toThrow(/disconnected/i)
    expect(parseGpxRoute(disconnected, {
      fileName: "disconnected.gpx",
      disconnectedSegments: "longest"
    }).geometry).toEqual([[-77, 41], [-77.1, 41.1], [-77.2, 41.2]])
  })
})
