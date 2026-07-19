import { describe, expect, it } from "vitest"
import { MAX_GPX_IMPORT_BYTES, parseGpxRoute, parseKmlRoute, parseRouteFile, parseRouteImport } from "@/lib/routing/gpx-import"

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

  it("imports GPX route points when no recorded track exists", () => {
    const routeOnly = `<gpx version="1.1"><rte><name>Backroad Route</name>
      <rtept lat="40.1" lon="-76.1"/><rtept lat="40.2" lon="-76.2"/>
    </rte></gpx>`

    const route = parseGpxRoute(routeOnly, { fileName: "backroad.gpx" })

    expect(route.name).toBe("Backroad Route")
    expect(route.geometry).toEqual([[-76.1, 40.1], [-76.2, 40.2]])
  })

  it("can preserve a legacy file by selecting its longest disconnected segment", () => {
    const disconnected = `<gpx version="1.1"><trk>
      <trkseg><trkpt lat="40" lon="-76"/><trkpt lat="40.01" lon="-76.01"/></trkseg>
      <trkseg><trkpt lat="41" lon="-77"/><trkpt lat="41.1" lon="-77.1"/><trkpt lat="41.2" lon="-77.2"/></trkseg>
    </trk></gpx>`

    const route = parseGpxRoute(disconnected, {
      fileName: "legacy.gpx",
      disconnectedSegments: "longest"
    })

    expect(route.geometry).toEqual([[-77, 41], [-77.1, 41.1], [-77.2, 41.2]])
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

describe("portable route imports", () => {
  const validKml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <name>Ridge connector</name><Placemark><name>Ridge line</name><LineString>
      <coordinates>-77.3,41.7,400 -77.25,41.705,430 -77.2,41.71,410</coordinates>
    </LineString></Placemark><Placemark><name>Fuel</name><Point><coordinates>-77.25,41.705,0</coordinates></Point></Placemark>
  </Document></kml>`

  it("imports a bounded KML line and preserves named placemark stops", () => {
    const route = parseKmlRoute(validKml, { id: "kml-1", fileName: "ridge.kml" })

    expect(route).toMatchObject({
      id: "kml-1",
      name: "Ridge connector",
      routingSource: "imported",
      previewOnly: false
    })
    expect(route.geometry).toEqual([[-77.3, 41.7], [-77.25, 41.705], [-77.2, 41.71]])
    expect(route.waypoints.map((waypoint) => waypoint.label)).toEqual(["KML start", "Fuel", "KML finish"])
  })

  it("routes supported file formats deliberately and rejects KMZ before unsafe parsing", () => {
    expect(parseRouteImport(validKml, { fileName: "ridge.kml" }).name).toBe("Ridge connector")
    expect(() => parseRouteImport("not a zip", { fileName: "ridge.kmz" }))
      .toThrow(/KMZ.*not available/i)
  })

  it("extracts a bounded KML document from a KMZ archive before parsing it", async () => {
    const contents = new TextEncoder().encode(validKml)
    const name = new TextEncoder().encode("doc.kml")
    const local = new Uint8Array(30 + name.length + contents.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint32(18, contents.length, true)
    localView.setUint32(22, contents.length, true)
    localView.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(contents, 30 + name.length)
    const central = new Uint8Array(46 + name.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint32(20, contents.length, true)
    centralView.setUint32(24, contents.length, true)
    centralView.setUint16(28, name.length, true)
    central.set(name, 46)
    const end = new Uint8Array(22)
    const endView = new DataView(end.buffer)
    endView.setUint32(0, 0x06054b50, true)
    endView.setUint16(8, 1, true)
    endView.setUint16(10, 1, true)
    endView.setUint32(12, central.length, true)
    endView.setUint32(16, local.length, true)
    const archive = new Uint8Array(local.length + central.length + end.length)
    archive.set(local)
    archive.set(central, local.length)
    archive.set(end, local.length + central.length)

    await expect(parseRouteFile({
      name: "ridge.kmz",
      size: archive.byteLength,
      arrayBuffer: async () => archive.buffer,
      text: async () => ""
    })).resolves.toMatchObject({ name: "Ridge connector", geometry: [[-77.3, 41.7], [-77.25, 41.705], [-77.2, 41.71]] })
  })
})
