import { analyzeGeometry } from "../scoring"
import type { Coordinate, PlannedRoute, Waypoint } from "../types"
import {
  distanceMeters,
  MAX_GPX_IMPORT_BYTES,
  MAX_GPX_TRACK_POINTS,
  parseXml,
  routeId,
  waypointNear,
  type GpxImportOptions
} from "./shared"

function kmlCoordinates(text: string | null): Coordinate[] {
  return (text ?? "").trim().split(/\s+/).flatMap((entry) => {
    const [longitudeText, latitudeText] = entry.split(",")
    const longitude = Number(longitudeText)
    const latitude = Number(latitudeText)
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) return []
    return [[longitude, latitude] as Coordinate]
  })
}

export function parseKmlRoute(xml: string, options: GpxImportOptions): PlannedRoute {
  const byteLength = options.byteLength ?? new TextEncoder().encode(xml).byteLength
  if (byteLength > MAX_GPX_IMPORT_BYTES) {
    throw new Error("KML imports must be 5 MB or smaller")
  }
  const document = parseXml(xml, options.parseXml)
  if (document.querySelector("parsererror") || document.documentElement.localName !== "kml") {
    throw new Error("The KML file is malformed")
  }

  const lines = [...document.getElementsByTagNameNS("*", "LineString")]
    .map((line) => kmlCoordinates(line.getElementsByTagNameNS("*", "coordinates")[0]?.textContent))
    .filter((line) => line.length >= 2)
  if (lines.length === 0) throw new Error("The KML file must contain a line with at least two valid coordinates")
  if (lines.length > 1) {
    throw new Error("The KML file has multiple lines; import one intended ride at a time to preserve gaps")
  }
  const geometry = lines[0]!
  if (geometry.length > MAX_GPX_TRACK_POINTS) {
    throw new Error(`KML lines are limited to ${MAX_GPX_TRACK_POINTS.toLocaleString()} points`)
  }

  const explicitWaypoints: Waypoint[] = [...document.getElementsByTagNameNS("*", "Placemark")].flatMap((placemark) => {
    const point = placemark.getElementsByTagNameNS("*", "Point")[0]
    const coordinate = point
      ? kmlCoordinates(point.getElementsByTagNameNS("*", "coordinates")[0]?.textContent)[0]
      : undefined
    if (!coordinate) return []
    const label = placemark.getElementsByTagNameNS("*", "name")[0]?.textContent?.trim() || "Waypoint"
    return [{ lat: coordinate[1], lon: coordinate[0], label }]
  })
  const startCoordinate = geometry[0]!
  const finishCoordinate = geometry.at(-1)!
  const startPoi = explicitWaypoints.find((waypoint) => waypointNear(waypoint, startCoordinate))
  const finishPoi = explicitWaypoints.find((waypoint) => waypointNear(waypoint, finishCoordinate))
  const middleWaypoints = explicitWaypoints.filter((waypoint) => waypoint !== startPoi && waypoint !== finishPoi)
  const distance = geometry.slice(0, -1).reduce(
    (total, coordinate, index) => total + distanceMeters(coordinate, geometry[index + 1]!),
    0
  )
  const documentName = document.getElementsByTagNameNS("*", "Document")[0]
    ?.getElementsByTagNameNS("*", "name")[0]?.textContent?.trim()
  const placemarkName = document.getElementsByTagNameNS("*", "Placemark")[0]
    ?.getElementsByTagNameNS("*", "name")[0]?.textContent?.trim()
  const fallbackName = options.fileName.replace(/\.kml$/i, "").replaceAll(/[-_]+/g, " ").trim()
  const analysis = analyzeGeometry(geometry)

  return {
    id: options.id ?? routeId(),
    name: (documentName || placemarkName || fallbackName || "Imported ride").slice(0, 160),
    profile: "scenic",
    geometry,
    waypoints: [
      startPoi ?? { lat: startCoordinate[1], lon: startCoordinate[0], label: "KML start" },
      ...middleWaypoints,
      finishPoi ?? { lat: finishCoordinate[1], lon: finishCoordinate[0], label: "KML finish" }
    ],
    instructions: [],
    distanceMiles: Number((distance / 1609.344).toFixed(2)),
    durationMinutes: 0,
    ascentMeters: null,
    descentMeters: null,
    twistiness: analysis.twistiness,
    turnCount: analysis.turnCount,
    roadMix: {},
    surfaceMix: {},
    navigationMode: "track-only",
    routingSource: "imported",
    previewOnly: false
  }
}
