import { describe, expect, it } from "vitest"
import { normalizeGpxDocument, areGpxFingerprintsNear, createGpxGeometryFingerprint } from "@/lib/gpx/corpus-ingest"
import { parseGpxChunks, parseGpxXml } from "@/lib/gpx/streaming-parser"

const multiSegmentGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Owner Multi Track</name><desc>Keep the original note.</desc></metadata>
  <wpt lat="40.001" lon="-76.001"><name>Fuel &amp; Food</name></wpt>
  <trk><name>Recorded A</name><trkseg>
    <trkpt lat="40" lon="-76"><ele>100</ele><time>2026-08-11T12:00:00Z</time></trkpt>
    <trkpt lat="40" lon="-76"><ele>100</ele><time>2026-08-11T12:00:00Z</time></trkpt>
    <trkpt lat="40.001" lon="-76.001"><ele>110</ele><time>2026-08-11T12:05:00Z</time></trkpt>
  </trkseg><trkseg>
    <trkpt lat="41" lon="-77"/><trkpt lat="41.001" lon="-77.001"/>
  </trkseg></trk>
  <rte><name>Planned Fallback</name><rtept lat="42" lon="-78"/><rtept lat="42.001" lon="-78.001"/></rte>
</gpx>`

describe("streaming GPX ingest", () => {
  it("parses chunk boundaries without losing tracks, segments, timestamps, elevation, or waypoints", async () => {
    const bytes = new TextEncoder().encode(multiSegmentGpx)
    const chunks = Array.from({ length: Math.ceil(bytes.length / 23) }, (_, index) =>
      bytes.slice(index * 23, (index + 1) * 23)
    )
    const document = await parseGpxChunks(chunks)

    expect(document.metadataName).toBe("Owner Multi Track")
    expect(document.metadataDescription).toBe("Keep the original note.")
    expect(document.tracks).toHaveLength(1)
    expect(document.tracks[0]?.segments).toHaveLength(2)
    expect(document.tracks[0]?.segments[0]?.points[0]).toMatchObject({
      coordinate: [-76, 40],
      elevationMeters: 100,
      timestampMs: Date.parse("2026-08-11T12:00:00Z")
    })
    expect(document.routes[0]?.segments[0]?.points).toHaveLength(2)
    expect(document.waypoints[0]).toMatchObject({ coordinate: [-76.001, 40.001], label: "Fuel & Food" })
  })

  it("normalizes consecutive duplicate points without inventing connectors across segment gaps", () => {
    const normalized = normalizeGpxDocument(parseGpxXml(multiSegmentGpx), { id: "route-1", fileName: "owner.gpx" })

    expect(normalized.id).toBe("route-1")
    expect(normalized.name).toBe("Owner Multi Track")
    expect(normalized.segments).toHaveLength(3)
    expect(normalized.geometry).toHaveLength(6)
    expect(normalized.segmentStarts).toEqual([0, 2, 4])
    expect(normalized.dedupedPointCount).toBe(1)
    expect(normalized.gapCount).toBe(1)
    expect(normalized.ascentMeters).toBe(10)
    expect(normalized.durationMinutes).toBe(5)
    expect(normalized.waypoints[0]?.label).toBe("Fuel & Food")
  })

  it("recognizes near duplicates from measured geometry, not names alone", () => {
    const first = createGpxGeometryFingerprint({
      geometry: [[-76, 40], [-75.99, 40], [-75.98, 40]],
      segmentStarts: [0],
      distanceMeters: 1_700
    })
    const resampled = createGpxGeometryFingerprint({
      geometry: [[-76, 40], [-75.995, 40], [-75.99, 40], [-75.985, 40], [-75.98, 40]],
      segmentStarts: [0],
      distanceMeters: 1_700
    })
    const different = createGpxGeometryFingerprint({
      geometry: [[-77, 41], [-76.99, 41], [-76.98, 41]],
      segmentStarts: [0],
      distanceMeters: 1_700
    })

    expect(areGpxFingerprintsNear(first, resampled)).toBe(true)
    expect(areGpxFingerprintsNear(first, different)).toBe(false)
  })
})
