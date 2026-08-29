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

  it("honours a caller-supplied split distance", () => {
    // The continuous file's legs are ~150 m apart; a 50 m threshold separates them.
    const routes = splitGpxDocument(parseGpxXml(continuousGpx), { ...options, splitGapMeters: 50 })

    expect(routes).toHaveLength(2)
    expect(routes.map((route) => route.name)).toEqual(["Leg one", "Leg two"])
  })

  it("attaches file-level waypoints to the first ride only", () => {
    const routes = splitGpxDocument(parseGpxXml(collectionGpx), options)

    expect(routes[0]?.waypoints).toHaveLength(1)
    expect(routes.slice(1).every((route) => route.waypoints.length === 0)).toBe(true)
  })
})
