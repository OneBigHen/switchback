import { describe, expect, it } from "vitest"
import { splitGpxDocument } from "@/lib/gpx/corpus-ingest"
import { parseGpxXml } from "@/lib/gpx/streaming-parser"

/** Three rides in three different places, saved into one file — a ride collection. */
const collectionGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Owner Collection</name></metadata>
  <wpt lat="40.01" lon="-76.01"><name>Fuel</name></wpt>
  <trk><name>Harrisburg loop</name><trkseg>
    <trkpt lat="40.00" lon="-76.00"/><trkpt lat="40.02" lon="-76.02"/>
  </trkseg></trk>
  <trk><name>Pocono run</name><trkseg>
    <trkpt lat="41.00" lon="-75.30"/><trkpt lat="41.02" lon="-75.32"/>
  </trkseg></trk>
  <trk><name>Blue Ridge day</name><trkseg>
    <trkpt lat="38.50" lon="-78.40"/><trkpt lat="38.52" lon="-78.42"/>
  </trkseg></trk>
</gpx>`

/** One ride recorded as two tracks that continue from each other. */
const continuousGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>One Long Ride</name></metadata>
  <trk><name>Leg one</name><trkseg>
    <trkpt lat="40.000" lon="-76.000"/><trkpt lat="40.010" lon="-76.010"/>
  </trkseg></trk>
  <trk><name>Leg two</name><trkseg>
    <trkpt lat="40.011" lon="-76.011"/><trkpt lat="40.020" lon="-76.020"/>
  </trkseg></trk>
</gpx>`

const singleGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Just One</name></metadata>
  <trk><name>Only track</name><trkseg>
    <trkpt lat="40.000" lon="-76.000"/><trkpt lat="40.010" lon="-76.010"/>
  </trkseg></trk>
</gpx>`

/** One track, one segment, two roads 90 km apart — the shape that broke the atlas. */
const oneSegmentTwoRoadsGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Two Roads</name></metadata>
  <trk><name>Two Roads</name><trkseg>
    <trkpt lat="40.00" lon="-76.00"/><trkpt lat="40.02" lon="-76.02"/><trkpt lat="40.04" lon="-76.04"/>
    <trkpt lat="41.00" lon="-75.00"/><trkpt lat="41.02" lon="-75.02"/><trkpt lat="41.04" lon="-75.04"/>
  </trkseg></trk>
</gpx>`

/** A real ride plus a stray two-point fragment left over from the export. */
const rideWithDebrisGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Ride Plus Debris</name></metadata>
  <trk><name>Ride Plus Debris</name><trkseg>
    <trkpt lat="40.00" lon="-76.00"/><trkpt lat="40.03" lon="-76.03"/>
  </trkseg><trkseg>
    <trkpt lat="45.00" lon="-70.00"/><trkpt lat="45.0001" lon="-70.0001"/>
  </trkseg></trk>
</gpx>`

/** Twenty unrelated roads in one file: a catalogue, not a ride. */
const roadCatalogueGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Every Unpaved Road</name></metadata>
  <trk><name>Every Unpaved Road</name><trkseg>
${Array.from({ length: 20 }, (_unused, index) =>
  `    <trkpt lat="${40 + index}" lon="-76.00"/><trkpt lat="${40 + index}.03" lon="-76.03"/>`
).join("\n")}
  </trkseg></trk>
</gpx>`

/** A planned route: junctions kilometres apart, which is normal for <rte>. */
const sparsePlannedRouteGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Planned Eighty Four</name></metadata>
  <rte><name>Planned Eighty Four</name>
    <rtept lat="40.00" lon="-76.00"/><rtept lat="40.10" lon="-76.10"/>
    <rtept lat="40.20" lon="-76.22"/><rtept lat="40.32" lon="-76.30"/>
    <rtept lat="40.44" lon="-76.41"/><rtept lat="40.55" lon="-76.55"/>
  </rte>
</gpx>`

const options = { id: "import-1", fileName: "owner.gpx" }

describe("splitGpxDocument", () => {
  it("splits a ride collection into one route per ride", () => {
    const routes = splitGpxDocument(parseGpxXml(collectionGpx), options)

    expect(routes).toHaveLength(3)
    expect(routes.map((route) => route.name)).toEqual(["Harrisburg loop", "Pocono run", "Blue Ridge day"])
    expect(routes.map((route) => route.id)).toEqual(["import-1--t1", "import-1--t2", "import-1--t3"])
  })

  it("does not invent connector geometry between the split rides", () => {
    const [first] = splitGpxDocument(parseGpxXml(collectionGpx), options)

    // Flattened, the three rides span hundreds of miles of straight-line jump.
    // Each split ride keeps only its own geometry.
    expect(first?.geometry).toHaveLength(2)
    expect(first?.distanceMeters).toBeLessThan(5_000)
  })

  it("keeps a ride recorded as continuing tracks in one piece", () => {
    const routes = splitGpxDocument(parseGpxXml(continuousGpx), options)

    expect(routes).toHaveLength(1)
    expect(routes[0]?.id).toBe("import-1")
    expect(routes[0]?.name).toBe("One Long Ride")
    expect(routes[0]?.segments).toHaveLength(2)
  })

  it("leaves a single-track file exactly as normalizeGpxDocument produced it", () => {
    const routes = splitGpxDocument(parseGpxXml(singleGpx), options)

    expect(routes).toHaveLength(1)
    expect(routes[0]?.id).toBe("import-1")
    expect(routes[0]?.name).toBe("Just One")
  })

  it("splits a single segment that jumps between disconnected roads", () => {
    // The worst file in the library is one <trkseg> holding many separate
    // roads, so the cut has to happen inside a segment, not only between tracks.
    const routes = splitGpxDocument(parseGpxXml(oneSegmentTwoRoadsGpx), options)

    expect(routes).toHaveLength(2)
    expect(routes[0]?.geometry).toHaveLength(3)
    expect(routes[1]?.geometry).toHaveLength(3)
    // Neither route carries the 90 km hop that joined them.
    expect(routes.every((route) => route.distanceMeters < 10_000)).toBe(true)
  })

  it("drops fragments too short to be a ride and keeps the real one under the file id", () => {
    const routes = splitGpxDocument(parseGpxXml(rideWithDebrisGpx), options)

    expect(routes).toHaveLength(1)
    expect(routes[0]?.id).toBe("import-1")
    expect(routes[0]?.distanceMeters).toBeGreaterThan(1_609)
  })

  it("rejects a road catalogue rather than turning it into dozens of posters", () => {
    expect(() => splitGpxDocument(parseGpxXml(roadCatalogueGpx), options))
      .toThrow(/road collection, not a ride/)
  })


  it("keeps a sparse planned route whole instead of shredding it", () => {
    // Its junctions are ~13 km apart, far beyond the 5 km floor. Cutting on the
    // absolute distance alone turned real 84-mile routes into rejected debris.
    const routes = splitGpxDocument(parseGpxXml(sparsePlannedRouteGpx), options)

    expect(routes).toHaveLength(1)
    expect(routes[0]?.id).toBe("import-1")
    expect(routes[0]?.geometry).toHaveLength(6)
  })

  it("attaches file-level waypoints to the first ride only", () => {
    const routes = splitGpxDocument(parseGpxXml(collectionGpx), options)

    expect(routes[0]?.waypoints).toHaveLength(1)
    expect(routes.slice(1).every((route) => route.waypoints.length === 0)).toBe(true)
  })
})
