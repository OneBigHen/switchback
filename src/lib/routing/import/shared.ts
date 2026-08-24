import type { Coordinate, Waypoint } from "../types"

export const MAX_GPX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_GPX_TRACK_POINTS = 50_000
const EARTH_RADIUS_METERS = 6_371_000

export type RouteXmlParser = (xml: string) => Document

export interface GpxImportOptions {
  fileName: string
  id?: string
  byteLength?: number
  disconnectedSegments?: "reject" | "longest"
  parseXml?: RouteXmlParser
}

export interface RouteImportFile {
  name: string
  size: number
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
}

export function distanceMeters(first: Coordinate, second: Coordinate): number {
  const radians = (value: number) => value * Math.PI / 180
  const firstLat = radians(first[1])
  const secondLat = radians(second[1])
  const latitudeDelta = secondLat - firstLat
  const longitudeDelta = radians(second[0] - first[0])
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

export function coordinateFromElement(element: Element): Coordinate | null {
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

export function routeId(): string {
  return `imported-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`
}

export function parseXml(xml: string, parser?: RouteXmlParser): Document {
  return (parser ?? ((source) => new DOMParser().parseFromString(source, "application/xml")))(xml)
}

export function waypointNear(waypoint: Waypoint, coordinate: Coordinate): boolean {
  return distanceMeters([waypoint.lon, waypoint.lat], coordinate) < 25
}
