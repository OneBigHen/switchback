import { analyzeGeometry } from "./scoring"
import type { Coordinate, PlannedRoute, Waypoint } from "./types"

export const MAX_GPX_IMPORT_BYTES = 5 * 1024 * 1024
const MAX_GPX_TRACK_POINTS = 50_000
const EARTH_RADIUS_METERS = 6_371_000

interface GpxImportOptions {
  fileName: string
  id?: string
  byteLength?: number
}

function distanceMeters(first: Coordinate, second: Coordinate): number {
  const radians = (value: number) => value * Math.PI / 180
  const firstLat = radians(first[1])
  const secondLat = radians(second[1])
  const latitudeDelta = secondLat - firstLat
  const longitudeDelta = radians(second[0] - first[0])
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

function coordinateFromElement(element: Element): Coordinate | null {
  const latitudeAttribute = element.getAttribute("lat")
  const longitudeAttribute = element.getAttribute("lon")
  if (latitudeAttribute === null || longitudeAttribute === null) return null
  const latitude = Number(latitudeAttribute)
  const longitude = Number(longitudeAttribute)
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null
  }
  return [longitude, latitude]
}

function routeId(): string {
  return `imported-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`
}

export function parseGpxRoute(xml: string, options: GpxImportOptions): PlannedRoute {
  const byteLength = options.byteLength ?? new TextEncoder().encode(xml).byteLength
  if (byteLength > MAX_GPX_IMPORT_BYTES) {
    throw new Error("GPX imports must be 5 MB or smaller")
  }

  const document = new DOMParser().parseFromString(xml, "application/xml")
  if (document.querySelector("parsererror") || document.documentElement.localName !== "gpx") {
    throw new Error("The GPX file is malformed")
  }

  const trackPointElements = [...document.querySelectorAll("trkpt")]
  if (trackPointElements.length < 2) {
    throw new Error("The GPX file must contain at least two track points")
  }
  if (trackPointElements.length > MAX_GPX_TRACK_POINTS) {
    throw new Error(`GPX tracks are limited to ${MAX_GPX_TRACK_POINTS.toLocaleString()} points`)
  }

  const segmentElements = [...document.querySelectorAll("trkseg")]
  const parsedSegments = segmentElements
    .map((segment) => [...segment.children]
      .filter((element) => element.localName === "trkpt")
      .flatMap((element) => {
        const coordinate = coordinateFromElement(element)
        return coordinate ? [{ coordinate, element }] : []
      }))
    .filter((segment) => segment.length > 0)
  for (let index = 1; index < parsedSegments.length; index += 1) {
    const previousFinish = parsedSegments[index - 1].at(-1)!.coordinate
    const nextStart = parsedSegments[index][0].coordinate
    if (distanceMeters(previousFinish, nextStart) > 250) {
      throw new Error("The GPX track contains disconnected segments")
    }
  }
  const parsedPoints = parsedSegments.flatMap((segment, index) => {
    if (index === 0) return segment
    const previous = parsedSegments[index - 1].at(-1)!.coordinate
    return distanceMeters(previous, segment[0].coordinate) < 2 ? segment.slice(1) : segment
  })
  const geometry = parsedPoints.map((point) => point.coordinate)
  if (geometry.length < 2) {
    throw new Error("The GPX track has no valid coordinates")
  }

  const explicitWaypoints: Waypoint[] = [...document.querySelectorAll("wpt")].flatMap((element) => {
    const coordinate = coordinateFromElement(element)
    return coordinate ? [{
      lat: coordinate[1],
      lon: coordinate[0],
      label: element.querySelector("name")?.textContent?.trim() || "Waypoint"
    }] : []
  })
  const startCoordinate = geometry[0]
  const finishCoordinate = geometry.at(-1)!
  const isNear = (waypoint: Waypoint, coordinate: Coordinate) =>
    distanceMeters([waypoint.lon, waypoint.lat], coordinate) < 25
  const startPoi = explicitWaypoints.find((waypoint) => isNear(waypoint, startCoordinate))
  const finishPoi = explicitWaypoints.find((waypoint) => isNear(waypoint, finishCoordinate))
  const middleWaypoints = explicitWaypoints.filter((waypoint) =>
    waypoint !== startPoi && waypoint !== finishPoi
  )
  const waypoints: Waypoint[] = [
    startPoi ?? { lat: startCoordinate[1], lon: startCoordinate[0], label: "Track start" },
    ...middleWaypoints,
    finishPoi ?? { lat: finishCoordinate[1], lon: finishCoordinate[0], label: "Track finish" }
  ]

  const times = parsedPoints.flatMap(({ element }) => {
    const timestamp = Date.parse(element.querySelector("time")?.textContent ?? "")
    return Number.isFinite(timestamp) ? [timestamp] : []
  })
  const elevations = parsedPoints.map(({ element }) => {
    const text = element.querySelector("ele")?.textContent?.trim()
    if (!text) return null
    const elevation = Number(text)
    return Number.isFinite(elevation) ? elevation : null
  })
  let ascentMeters = 0
  let descentMeters = 0
  for (let index = 1; index < elevations.length; index += 1) {
    const previous = elevations[index - 1]
    const current = elevations[index]
    if (previous === null || current === null) continue
    const change = current - previous
    if (change > 0) ascentMeters += change
    else descentMeters += Math.abs(change)
  }

  const distance = geometry.slice(0, -1).reduce(
    (total, coordinate, index) => total + distanceMeters(coordinate, geometry[index + 1]),
    0
  )
  const metadataName = document.querySelector("metadata > name")?.textContent?.trim()
  const trackName = document.querySelector("trk > name")?.textContent?.trim()
  const fallbackName = options.fileName.replace(/\.gpx$/i, "").replaceAll(/[-_]+/g, " ").trim()
  const analysis = analyzeGeometry(geometry)

  return {
    id: options.id ?? routeId(),
    name: (metadataName || trackName || fallbackName || "Imported ride").slice(0, 160),
    profile: "scenic",
    geometry,
    waypoints,
    instructions: [],
    distanceMiles: Number((distance / 1609.344).toFixed(2)),
    durationMinutes: times.length >= 2
      ? Number(((Math.max(...times) - Math.min(...times)) / 60_000).toFixed(2))
      : 0,
    ascentMeters: elevations.some((value) => value !== null) ? Number(ascentMeters.toFixed(1)) : null,
    descentMeters: elevations.some((value) => value !== null) ? Number(descentMeters.toFixed(1)) : null,
    twistiness: analysis.twistiness,
    turnCount: analysis.turnCount,
    roadMix: {},
    surfaceMix: {},
    routingSource: "imported",
    previewOnly: false
  }
}
