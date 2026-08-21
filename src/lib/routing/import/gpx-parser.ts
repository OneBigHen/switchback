import { analyzeGpxIntelligence } from "../../gpx/intelligence"
import type { GpxMapMatchResult } from "../../gpx/map-matching"
import { analyzeGeometry } from "../scoring"
import type { PlannedRoute, Waypoint } from "../types"
import {
  coordinateFromElement,
  distanceMeters,
  MAX_GPX_IMPORT_BYTES,
  MAX_GPX_TRACK_POINTS,
  parseXml,
  routeId,
  waypointNear,
  type GpxImportOptions
} from "./shared"

export function parseGpxRoute(xml: string, options: GpxImportOptions): PlannedRoute {
  const byteLength = options.byteLength ?? new TextEncoder().encode(xml).byteLength
  if (byteLength > MAX_GPX_IMPORT_BYTES) {
    throw new Error("GPX imports must be 5 MB or smaller")
  }

  const document = parseXml(xml, options.parseXml)
  if (document.querySelector("parsererror") || document.documentElement.localName !== "gpx") {
    throw new Error("The GPX file is malformed")
  }

  const trackPointElements = [...document.querySelectorAll("trkpt")]
  const routePointElements = [...document.querySelectorAll("rtept")]
  const pointElementName = trackPointElements.length >= 2 ? "trkpt" : "rtept"
  const pointElements = pointElementName === "trkpt" ? trackPointElements : routePointElements
  if (pointElements.length < 2) {
    throw new Error("The GPX file must contain at least two route or track points")
  }
  if (pointElements.length > MAX_GPX_TRACK_POINTS) {
    throw new Error(`GPX tracks are limited to ${MAX_GPX_TRACK_POINTS.toLocaleString()} points`)
  }

  const segmentElements = pointElementName === "trkpt"
    ? [...document.querySelectorAll("trkseg")]
    : [...document.querySelectorAll("rte")]
  let parsedSegments = segmentElements
    .map((segment) => [...segment.children]
      .filter((element) => element.localName === pointElementName)
      .flatMap((element) => {
        const coordinate = coordinateFromElement(element)
        return coordinate ? [{ coordinate, element }] : []
      }))
    .filter((segment) => segment.length > 0)
  const hasDisconnectedSegments = parsedSegments.slice(1).some((segment, index) => {
    const previousFinish = parsedSegments[index].at(-1)!.coordinate
    return distanceMeters(previousFinish, segment[0].coordinate) > 250
  })
  if (hasDisconnectedSegments && options.disconnectedSegments === "longest") {
    parsedSegments = [parsedSegments.reduce((longest, segment) => {
      const length = (candidate: typeof segment) => candidate.slice(1).reduce(
        (total, point, index) => total + distanceMeters(candidate[index].coordinate, point.coordinate),
        0
      )
      return length(segment) > length(longest) ? segment : longest
    })]
  }
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
  const startPoi = explicitWaypoints.find((waypoint) => waypointNear(waypoint, startCoordinate))
  const finishPoi = explicitWaypoints.find((waypoint) => waypointNear(waypoint, finishCoordinate))
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
  const routeName = document.querySelector("rte > name")?.textContent?.trim()
  const fallbackName = options.fileName.replace(/\.gpx$/i, "").replaceAll(/[-_]+/g, " ").trim()
  const analysis = analyzeGeometry(geometry)
  const durationMinutes = times.length >= 2
    ? Number(((Math.max(...times) - Math.min(...times)) / 60_000).toFixed(2))
    : 0
  const intelligenceSegments = parsedSegments.map((segment, index) => index === 0
    ? segment
    : distanceMeters(parsedSegments[index - 1]!.at(-1)!.coordinate, segment[0]!.coordinate) < 2
      ? segment.slice(1)
      : segment
  ).filter((segment) => segment.length > 0)
  const intelligenceSegmentStarts: number[] = []
  let intelligenceOffset = 0
  for (const segment of intelligenceSegments) {
    intelligenceSegmentStarts.push(intelligenceOffset)
    intelligenceOffset += segment.length
  }
  const gpxIntelligence = analyzeGpxIntelligence({
    geometry,
    segments: intelligenceSegments.map((segment) => segment.map((point) => point.coordinate)),
    segmentStarts: intelligenceSegmentStarts,
    distanceMeters: distance,
    durationMinutes,
    ascentMeters: elevations.some((value) => value !== null) ? Number(ascentMeters.toFixed(1)) : null,
    descentMeters: elevations.some((value) => value !== null) ? Number(descentMeters.toFixed(1)) : null,
    invalidPointCount: pointElements.length - parsedPoints.length,
    creatorNotes: document.querySelector("metadata > desc")?.textContent
  }, { status: "not-configured", provider: null, profile: null } satisfies GpxMapMatchResult)

  return {
    id: options.id ?? routeId(),
    name: (metadataName || trackName || routeName || fallbackName || "Imported ride").slice(0, 160),
    profile: "scenic",
    geometry,
    waypoints,
    instructions: [],
    distanceMiles: Number((distance / 1609.344).toFixed(2)),
    durationMinutes,
    ascentMeters: elevations.some((value) => value !== null) ? Number(ascentMeters.toFixed(1)) : null,
    descentMeters: elevations.some((value) => value !== null) ? Number(descentMeters.toFixed(1)) : null,
    twistiness: analysis.twistiness,
    turnCount: analysis.turnCount,
    roadMix: {},
    surfaceMix: {},
    gpxIntelligence,
    navigationMode: "track-only",
    routingSource: "imported",
    previewOnly: false
  }
}
