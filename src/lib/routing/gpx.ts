import type { RecordedRide } from "@/lib/storage/ride-journal"
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
  gpxParentRouteId?: string
  creatorNotes?: string | null
}

export type GpxExportVariant = "track" | "track-waypoints" | "route" | "original" | "recorded" | "cues"

export interface GpxExportOptions {
  variant?: GpxExportVariant
  /** Optional error-bounded simplification for device transfer. */
  simplifyToleranceMeters?: number
}

const EARTH_RADIUS_METERS = 6_371_000

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function distanceMeters(first: Coordinate, second: Coordinate): number {
  const radians = (value: number) => value * Math.PI / 180
  const firstLatitude = radians(first[1])
  const secondLatitude = radians(second[1])
  const latitudeDelta = secondLatitude - firstLatitude
  const longitudeDelta = radians(second[0] - first[0])
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

function pointToSegmentMeters(point: Coordinate, start: Coordinate, finish: Coordinate): number {
  const latitudeScale = EARTH_RADIUS_METERS * Math.PI / 180
  const longitudeScale = latitudeScale * Math.cos(point[1] * Math.PI / 180)
  const startX = (start[0] - point[0]) * longitudeScale
  const startY = (start[1] - point[1]) * latitudeScale
  const finishX = (finish[0] - point[0]) * longitudeScale
  const finishY = (finish[1] - point[1]) * latitudeScale
  const segmentX = finishX - startX
  const segmentY = finishY - startY
  const lengthSquared = segmentX ** 2 + segmentY ** 2
  const fraction = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, -(startX * segmentX + startY * segmentY) / lengthSquared))
  return Math.hypot(startX + segmentX * fraction, startY + segmentY * fraction)
}

function nearestIndex(geometry: Coordinate[], waypoint: Waypoint): number {
  const coordinate: Coordinate = [waypoint.lon, waypoint.lat]
  return geometry.reduce((nearest, candidate, index) =>
    distanceMeters(candidate, coordinate) < distanceMeters(geometry[nearest]!, coordinate) ? index : nearest, 0)
}

function protectedIndexes(route: GpxRoute): Set<number> {
  const indexes = new Set([0, route.geometry.length - 1])
  for (const waypoint of route.waypoints.slice(0, 256)) indexes.add(nearestIndex(route.geometry, waypoint))
  for (const instruction of (route.instructions ?? []).slice(0, 512)) {
    indexes.add(Math.max(0, Math.min(route.geometry.length - 1, instruction.interval[0])))
    indexes.add(Math.max(0, Math.min(route.geometry.length - 1, instruction.interval[1])))
  }
  return indexes
}

/** RDP simplification with start/end, waypoint, and maneuver anchors retained. */
export function simplifyGpxGeometry(route: GpxRoute, toleranceMeters: number): Coordinate[] {
  if (!Number.isFinite(toleranceMeters) || toleranceMeters <= 0 || route.geometry.length < 3) return [...route.geometry]
  const protectedPoints = protectedIndexes(route)
  const keep = new Set<number>(protectedPoints)
  const stack: Array<[number, number]> = [[0, route.geometry.length - 1]]
  while (stack.length > 0) {
    const [start, finish] = stack.pop()!
    let protectedBetween: number | null = null
    for (const index of protectedPoints) {
      if (index > start && index < finish && (protectedBetween == null || index < protectedBetween)) protectedBetween = index
    }
    if (protectedBetween != null) {
      keep.add(protectedBetween)
      stack.push([start, protectedBetween], [protectedBetween, finish])
      continue
    }
    let farthestIndex = -1
    let farthestDistance = toleranceMeters
    for (let index = start + 1; index < finish; index += 1) {
      const error = pointToSegmentMeters(route.geometry[index]!, route.geometry[start]!, route.geometry[finish]!)
      if (error > farthestDistance) {
        farthestDistance = error
        farthestIndex = index
      }
    }
    if (farthestIndex >= 0) {
      keep.add(farthestIndex)
      stack.push([start, farthestIndex], [farthestIndex, finish])
    }
  }
  return [...keep].sort((left, right) => left - right).map((index) => route.geometry[index]!)
}

function waypointXml(waypoints: Waypoint[]): string {
  return waypoints
    .map((waypoint) =>
      `  <wpt lat="${waypoint.lat}" lon="${waypoint.lon}"><name>${escapeXml(waypoint.label ?? "Waypoint")}</name></wpt>`)
    .join("\n")
}

function trackXml(geometry: Coordinate[]): string {
  return geometry
    .map(([longitude, latitude]) => `      <trkpt lat="${latitude}" lon="${longitude}"/>`)
    .join("\n")
}

function routePoints(route: GpxRoute): Waypoint[] {
  return route.waypoints.length >= 2
    ? [route.waypoints[0]!, route.waypoints.at(-1)!]
    : [
        { lat: route.geometry[0]![1], lon: route.geometry[0]![0], label: "Route start" },
        { lat: route.geometry.at(-1)![1], lon: route.geometry.at(-1)![0], label: "Route finish" }
      ]
}

function cueXml(route: GpxRoute): string {
  return (route.instructions ?? []).map((instruction, index) => {
    const coordinate = route.geometry[Math.min(route.geometry.length - 1, Math.max(0, instruction.interval[0]))]!
    const name = `${instruction.text}${instruction.streetName ? ` onto ${instruction.streetName}` : ""}`
    const distance = instruction.distanceMeters < 1_000
      ? `${Math.max(1, Math.round(instruction.distanceMeters))} m`
      : `${(instruction.distanceMeters / 1_609.344).toFixed(1)} mi`
    return `      <rtept lat="${coordinate[1]}" lon="${coordinate[0]}"><name>${escapeXml(name)}</name><cmt>${escapeXml(`${distance} · cue ${index + 1}`)}</cmt></rtept>`
  }).join("\n")
}

function gpxDocument(route: GpxRoute, metadataDescription: string, body: string, waypoints = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Switchback" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(route.name)}</name>
    <desc>${escapeXml(metadataDescription.slice(0, 4_000))}</desc>
  </metadata>
${waypoints}
${body}
</gpx>`
}

export function routeToGpx(route: GpxRoute, options: GpxExportOptions = {}): string {
  if (route.previewOnly) throw new Error("Preview-only geometry cannot be exported")
  if (route.geometry.length < 2) throw new Error("A GPX track requires at least two routed coordinates")
  const variant = options.variant ?? "track"
  if (variant === "recorded") throw new Error("Use recordedRideToGpx for recorded ride export")
  if (variant === "original" && route.gpxParentRouteId) {
    throw new Error("Original GPX export is available from the parent route")
  }

  const geometry = options.simplifyToleranceMeters == null
    ? route.geometry
    : simplifyGpxGeometry(route, options.simplifyToleranceMeters)
  const description = `${variant === "original" ? "Original GPX artifact" : "Switchback route"} · ${route.distanceMiles.toFixed(1)} mi | ${Math.round(route.durationMinutes)} min | ${route.profile}${route.creatorNotes ? ` · ${route.creatorNotes.slice(0, 500)}` : ""}`
  const trackBody = `  <trk>\n    <name>${escapeXml(route.name)}</name>\n    <type>motorcycle</type>\n    <trkseg>\n${trackXml(geometry)}\n    </trkseg>\n  </trk>`
  const routeBody = `  <rte>\n    <name>${escapeXml(route.name)}${variant === "cues" ? " cues" : ""}</name>\n${variant === "cues" ? cueXml(route) : routePoints(route).map((point) =>
    `      <rtept lat="${point.lat}" lon="${point.lon}"><name>${escapeXml(point.label ?? "Route point")}</name></rtept>`).join("\n")}\n  </rte>`
  const body = variant === "route" || variant === "cues" ? routeBody : trackBody
  const includeWaypoints = variant === "track-waypoints" || variant === "route" || variant === "original" || variant === "cues"
  return gpxDocument(route, description, body, includeWaypoints ? waypointXml(route.waypoints) : "")
}

function recordedTrackXml(ride: RecordedRide): string {
  return ride.points.map((point) => {
    const [longitude, latitude] = point.coordinate
    const details = [
      point.altitudeMeters != null && Number.isFinite(point.altitudeMeters) ? `<ele>${point.altitudeMeters}</ele>` : "",
      point.recordedAt ? `<time>${escapeXml(point.recordedAt)}</time>` : "",
      point.speedMph != null && Number.isFinite(point.speedMph) ? `<speed>${(point.speedMph / 2.236936).toFixed(2)}</speed>` : "",
      point.headingDegrees != null && Number.isFinite(point.headingDegrees) ? `<course>${point.headingDegrees}</course>` : ""
    ].join("")
    return `      <trkpt lat="${latitude}" lon="${longitude}">${details}</trkpt>`
  }).join("\n")
}

export function recordedRideToGpx(ride: RecordedRide): string {
  if (ride.points.length < 2) throw new Error("A recorded ride needs at least two GPS points")
  const geometry = ride.points.map((point) => point.coordinate)
  const distanceMiles = geometry.slice(0, -1)
    .reduce((total, point, index) => total + distanceMeters(point, geometry[index + 1]!), 0) / 1609.344
  const started = Date.parse(ride.startedAt)
  const ended = Date.parse(ride.endedAt)
  const durationMinutes = Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, Math.round((ended - started) / 60_000)) : 0
  const route: GpxRoute = {
    ...ride.route,
    name: ride.routeName,
    distanceMiles,
    durationMinutes
  }
  const body = `  <trk>\n    <name>${escapeXml(ride.routeName)}</name>\n    <type>recorded ride</type>\n    <trkseg>\n${recordedTrackXml(ride)}\n    </trkseg>\n  </trk>`
  const description = `Recorded ride · ${distanceMiles.toFixed(1)} mi | ${durationMinutes} min${ride.notes ? ` · ${ride.notes.slice(0, 500)}` : ""}`
  return gpxDocument(route, description, body, waypointXml(ride.route.waypoints))
}
