import { analyzeGeometry } from "./scoring"
import type { Coordinate, PlannedRoute, Waypoint } from "./types"

export const MAX_GPX_IMPORT_BYTES = 5 * 1024 * 1024
const MAX_GPX_TRACK_POINTS = 50_000
const EARTH_RADIUS_METERS = 6_371_000

export type RouteXmlParser = (xml: string) => Document

interface GpxImportOptions {
  fileName: string
  id?: string
  byteLength?: number
  disconnectedSegments?: "reject" | "longest"
  parseXml?: RouteXmlParser
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

function parseXml(xml: string, parser?: RouteXmlParser): Document {
  return (parser ?? ((source) => new DOMParser().parseFromString(source, "application/xml")))(xml)
}

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
  const routeName = document.querySelector("rte > name")?.textContent?.trim()
  const fallbackName = options.fileName.replace(/\.gpx$/i, "").replaceAll(/[-_]+/g, " ").trim()
  const analysis = analyzeGeometry(geometry)

  return {
    id: options.id ?? routeId(),
    name: (metadataName || trackName || routeName || fallbackName || "Imported ride").slice(0, 160),
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
  const isNear = (waypoint: Waypoint, coordinate: Coordinate) =>
    distanceMeters([waypoint.lon, waypoint.lat], coordinate) < 25
  const startPoi = explicitWaypoints.find((waypoint) => isNear(waypoint, startCoordinate))
  const finishPoi = explicitWaypoints.find((waypoint) => isNear(waypoint, finishCoordinate))
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
    routingSource: "imported",
    previewOnly: false
  }
}

export function parseRouteImport(contents: string, options: GpxImportOptions): PlannedRoute {
  const name = options.fileName.toLowerCase()
  if (name.endsWith(".kmz")) {
    throw new Error("KMZ import is not available in this browser build. Extract the KML file and import it directly.")
  }
  if (name.endsWith(".kml")) return parseKmlRoute(contents, options)
  if (name.endsWith(".gpx")) return parseGpxRoute(contents, options)
  const root = parseXml(contents, options.parseXml).documentElement.localName
  if (root === "kml") return parseKmlRoute(contents, options)
  if (root === "gpx") return parseGpxRoute(contents, options)
  throw new Error("Choose a GPX or KML route file")
}

interface RouteImportFile {
  name: string
  size: number
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
}

function zipUint16(view: DataView, offset: number): number {
  if (offset + 2 > view.byteLength) throw new Error("KMZ archive is truncated.")
  return view.getUint16(offset, true)
}

function zipUint32(view: DataView, offset: number): number {
  if (offset + 4 > view.byteLength) throw new Error("KMZ archive is truncated.")
  return view.getUint32(offset, true)
}

function kmzKmlEntry(bytes: Uint8Array): {
  compression: number
  compressed: Uint8Array
  uncompressedSize: number
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const minimumOffset = Math.max(0, bytes.byteLength - 65_557)
  let endOffset = -1
  for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (zipUint32(view, offset) === 0x06054b50) {
      endOffset = offset
      break
    }
  }
  if (endOffset < 0) throw new Error("KMZ archive has no valid central directory.")
  const entryCount = zipUint16(view, endOffset + 10)
  const directorySize = zipUint32(view, endOffset + 12)
  let offset = zipUint32(view, endOffset + 16)
  if (offset + directorySize > bytes.byteLength) throw new Error("KMZ central directory is outside the archive.")
  const decoder = new TextDecoder()
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (zipUint32(view, offset) !== 0x02014b50) throw new Error("KMZ central directory entry is invalid.")
    const flags = zipUint16(view, offset + 8)
    const compression = zipUint16(view, offset + 10)
    const compressedSize = zipUint32(view, offset + 20)
    const uncompressedSize = zipUint32(view, offset + 24)
    const nameLength = zipUint16(view, offset + 28)
    const extraLength = zipUint16(view, offset + 30)
    const commentLength = zipUint16(view, offset + 32)
    const localOffset = zipUint32(view, offset + 42)
    const nameStart = offset + 46
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength))
    offset = nameStart + nameLength + extraLength + commentLength
    if (!name.toLowerCase().endsWith(".kml")) continue
    if (flags & 0x1) throw new Error("Encrypted KMZ files cannot be imported.")
    if (uncompressedSize > MAX_GPX_IMPORT_BYTES) throw new Error("KMZ KML contents must be 5 MB or smaller.")
    if (zipUint32(view, localOffset) !== 0x04034b50) throw new Error("KMZ local entry is invalid.")
    const localNameLength = zipUint16(view, localOffset + 26)
    const localExtraLength = zipUint16(view, localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > bytes.byteLength) throw new Error("KMZ KML contents are truncated.")
    return { compression, compressed: bytes.slice(dataStart, dataEnd), uncompressedSize }
  }
  throw new Error("KMZ archive does not contain a KML route file.")
}

async function kmzToKml(bytes: Uint8Array): Promise<string> {
  const entry = kmzKmlEntry(bytes)
  if (entry.compression === 0) return new TextDecoder().decode(entry.compressed)
  if (entry.compression !== 8 || typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress this KMZ file. Extract its KML file and import that instead.")
  }
  const stream = new Blob([new Uint8Array(entry.compressed)]).stream()
    .pipeThrough(new DecompressionStream("deflate-raw"))
  const decoded = await new Response(stream).text()
  if (new TextEncoder().encode(decoded).byteLength > MAX_GPX_IMPORT_BYTES) {
    throw new Error("KMZ KML contents must be 5 MB or smaller.")
  }
  return decoded
}

export async function parseRouteFile(
  file: RouteImportFile,
  options: Pick<GpxImportOptions, "parseXml"> = {}
): Promise<PlannedRoute> {
  if (file.size > MAX_GPX_IMPORT_BYTES) {
    throw new Error("Route imports must be 5 MB or smaller.")
  }
  if (file.name.toLowerCase().endsWith(".kmz")) {
    const kml = await kmzToKml(new Uint8Array(await file.arrayBuffer()))
    return parseKmlRoute(kml, {
      fileName: file.name.replace(/\.kmz$/i, ".kml"),
      byteLength: new TextEncoder().encode(kml).byteLength,
      ...options
    })
  }
  return parseRouteImport(await file.text(), { fileName: file.name, byteLength: file.size, ...options })
}
