import type { Coordinate, RouteInstruction, RouteProfileId, Waypoint } from "./types"

interface GpxRoute {
  id: string
  name: string
  profile: RouteProfileId
  geometry: Coordinate[]
  waypoints: Waypoint[]
  instructions?: RouteInstruction[]
  distanceMiles: number
  durationMinutes: number
  previewOnly?: boolean
}

export type GpxExportVariant = "track" | "route" | "cues"

export interface GpxExportOptions {
  variant?: GpxExportVariant
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

export function routeToGpx(route: GpxRoute, options: GpxExportOptions = {}): string {
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
  const variant = options.variant ?? "track"
  const routablePoints = route.waypoints.length >= 2
    ? [route.waypoints[0]!, route.waypoints.at(-1)!]
    : [
        { lat: route.geometry[0]![1], lon: route.geometry[0]![0], label: "Route start" },
        { lat: route.geometry.at(-1)![1], lon: route.geometry.at(-1)![0], label: "Route finish" }
      ]
  const routeXml = routablePoints.map((point) => (
    `      <rtept lat="${point.lat}" lon="${point.lon}"><name>${escapeXml(point.label ?? "Route point")}</name></rtept>`
  )).join("\n")
  const cueXml = (route.instructions ?? []).map((instruction, index) => {
    const coordinate = route.geometry[Math.min(route.geometry.length - 1, Math.max(0, instruction.interval[0]))]!
    const name = `${instruction.text}${instruction.streetName ? ` onto ${instruction.streetName}` : ""}`
    const distance = instruction.distanceMeters < 1_000
      ? `${Math.max(1, Math.round(instruction.distanceMeters))} m`
      : `${(instruction.distanceMeters / 1_609.344).toFixed(1)} mi`
    return `      <rtept lat="${coordinate[1]}" lon="${coordinate[0]}"><name>${escapeXml(name)}</name><cmt>${escapeXml(`${distance} · cue ${index + 1}`)}</cmt></rtept>`
  }).join("\n")
  const body = variant === "track"
    ? `  <trk>\n    <name>${escapeXml(route.name)}</name>\n    <type>motorcycle</type>\n    <trkseg>\n${trackXml}\n    </trkseg>\n  </trk>`
    : `  <rte>\n    <name>${escapeXml(route.name)}${variant === "cues" ? " cues" : ""}</name>\n${variant === "cues" ? cueXml : routeXml}\n  </rte>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Switchback" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(route.name)}</name>
    <desc>${escapeXml(description)}</desc>
  </metadata>
${waypointXml}
${body}
</gpx>`
}
