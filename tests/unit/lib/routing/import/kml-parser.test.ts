import { describe, expect, it } from "vitest"
import { parseKmlRoute } from "@/lib/routing/import/kml-parser"

const kml = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <name>Parser line</name>
  <Placemark><name>Fuel</name><Point><coordinates>-77.25,41.705,0</coordinates></Point></Placemark>
  <Placemark><LineString><coordinates>-77.3,41.7,400 -77.25,41.705,430 -77.2,41.71,410</coordinates></LineString></Placemark>
</Document></kml>`

describe("KML parser", () => {
  it("parses a LineString and preserves Point placemarks", () => {
    const route = parseKmlRoute(kml, { id: "kml-parser-route", fileName: "parser.kml" })

    expect(route).toMatchObject({
      id: "kml-parser-route",
      name: "Parser line",
      routingSource: "imported"
    })
    expect(route.geometry).toEqual([[-77.3, 41.7], [-77.25, 41.705], [-77.2, 41.71]])
    expect(route.waypoints.map((waypoint) => waypoint.label)).toEqual([
      "KML start",
      "Fuel",
      "KML finish"
    ])
  })

  it("rejects multiple valid lines so gaps are not silently connected", () => {
    const multipleLines = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <LineString><coordinates>-77.3,41.7 -77.2,41.71</coordinates></LineString>
      <LineString><coordinates>-76.3,40.7 -76.2,40.71</coordinates></LineString>
    </Document></kml>`

    expect(() => parseKmlRoute(multipleLines, { fileName: "multiple.kml" }))
      .toThrow(/multiple lines/i)
  })
})
