import type { Coordinate, RouteProfileId, Waypoint } from "./types"

interface GpxRoute {
  id: string
  name: string
  profile: RouteProfileId
  geometry: Coordinate[]
  waypoints: Waypoint[]
  distanceMiles: number
  durationMinutes: number
  previewOnly?: boolean
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

export function routeToGpx(route: GpxRoute): string {
  if (route.previewOnly) {
    throw new Error("Preview-only geometry cannot be exported")
  }
  if (route.geometry.length < 2) {
    throw new Error("A GPX track requires at least two routed coordinates")
  }

  const waypointXml = route.waypoints
    .map(
      (waypoint) =>
        `  <wpt lat="${waypoint.lat}" lon="${waypoint.lon}"><name>${escapeXml(waypoint.label ?? "Waypoint")}</name></wpt>`
    )
    .join("\n")
  const trackXml = route.geometry
    .map(([longitude, latitude]) => `      <trkpt lat="${latitude}" lon="${longitude}"/>`)
    .join("\n")
  const description = `${route.distanceMiles.toFixed(1)} mi | ${Math.round(route.durationMinutes)} min | ${route.profile}`

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Switchback" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(route.name)}</name>
    <desc>${escapeXml(description)}</desc>
  </metadata>
${waypointXml}
  <trk>
    <name>${escapeXml(route.name)}</name>
    <type>motorcycle</type>
    <trkseg>
${trackXml}
    </trkseg>
  </trk>
</gpx>`
}
