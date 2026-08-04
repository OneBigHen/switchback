import type { Coordinate, PlannedRoute, RouteInstruction, RouteProfileId, Waypoint } from "@/lib/routing/types"

const EARTH_RADIUS_METERS = 6_371_008.8
const MAX_PORTABLE_SHARE_BYTES = 7_500

const SUPPORTED_PROFILES: ReadonlySet<RouteProfileId> = new Set(["quick", "twisty", "scenic", "adventure"])

const ALLOWED_ROUTE_KEYS: ReadonlySet<string> = new Set([
  "name",
  "profile",
  "geometry",
  "waypoints",
  "instructions",
  "distanceMiles",
  "durationMinutes",
  "ascentMeters",
  "descentMeters",
  "twistiness",
  "turnCount",
  "roadMix",
  "surfaceMix",
  "previewOnly"
])

export interface PrivacyZone {
  id: string
  label: string
  center: Coordinate
  radiusMeters: number
}

interface PortableRouteShare {
  version: 1
  route: Omit<PlannedRoute, "id" | "routingSource">
}

export interface PortableShare {
  url: string
  route: PlannedRoute
}

function distanceMeters(a: Coordinate, b: Coordinate): number {
  const toRadians = (value: number) => value * Math.PI / 180
  const latitudeDelta = toRadians(b[1] - a[1])
  const longitudeDelta = toRadians(b[0] - a[0])
  const latitudeA = toRadians(a[1])
  const latitudeB = toRadians(b[1])
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine))
}

function insidePrivacyZone(point: Coordinate, zones: readonly PrivacyZone[]): boolean {
  return zones.some((zone) => (
    Number.isFinite(zone.radiusMeters) && zone.radiusMeters > 0 &&
    distanceMeters(point, zone.center) < zone.radiusMeters
  ))
}

function redactedWaypoints(waypoints: readonly Waypoint[], zones: readonly PrivacyZone[]): Waypoint[] {
  return waypoints
    .filter((waypoint) => !insidePrivacyZone([waypoint.lon, waypoint.lat], zones))
    .map((waypoint) => ({ ...waypoint, locked: Boolean(waypoint.locked) || undefined }))
}

/**
 * Privacy zones are deliberately applied before a route is serialized or sent
 * to a Web Share target. We remove interior geometry instead of snapping it to
 * a home coordinate, so the boundary itself does not leak a precise address.
 */
export function redactRouteForShare(route: PlannedRoute, zones: readonly PrivacyZone[]): PlannedRoute {
  const geometry = route.geometry.filter((coordinate) => !insidePrivacyZone(coordinate, zones))
  if (geometry.length < 2) {
    throw new Error("Privacy zones remove too much of this route to create a useful share.")
  }
  return {
    ...structuredClone(route),
    geometry,
    waypoints: redactedWaypoints(route.waypoints, zones),
    // Share recipients receive a portable copy, never an implication that the
    // original provider's routing state or a private source route is theirs.
    routingSource: "imported"
  }
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function decodeBase64Url(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isValidCoordinate(coord: unknown): coord is Coordinate {
  if (!Array.isArray(coord) || coord.length !== 2) return false
  const [lon, lat] = coord as [unknown, unknown]
  if (typeof lon !== "number" || typeof lat !== "number") return false
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false
  if (lon < -180 || lon > 180) return false
  if (lat < -90 || lat > 90) return false
  return true
}

function isValidWaypoint(wp: unknown): wp is Waypoint {
  if (!isPlainObject(wp)) return false
  const { lat, lon, label, locked } = wp
  if (typeof lat !== "number" || typeof lon !== "number") return false
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  if (lat < -90 || lat > 90) return false
  if (lon < -180 || lon > 180) return false
  if (label !== undefined && typeof label !== "string") return false
  if (locked !== undefined && typeof locked !== "boolean") return false
  return true
}

function isValidInstruction(inst: unknown): inst is RouteInstruction {
  if (!isPlainObject(inst)) return false
  const {
    distanceMeters,
    timeMilliseconds,
    sign,
    text,
    streetName,
    interval,
    speedLimitKmh
  } = inst
  if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters)) return false
  if (typeof timeMilliseconds !== "number" || !Number.isFinite(timeMilliseconds)) return false
  if (typeof sign !== "number" || !Number.isFinite(sign) || !Number.isInteger(sign)) return false
  if (typeof text !== "string" || text.length === 0) return false
  if (typeof streetName !== "string") return false
  if (!Array.isArray(interval) || interval.length !== 2) return false
  if (!interval.every((value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0
  )) return false
  if (speedLimitKmh !== undefined) {
    if (speedLimitKmh !== null && (typeof speedLimitKmh !== "number" || !Number.isFinite(speedLimitKmh))) return false
  }
  return true
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function isFiniteOrNull(value: unknown): value is number | null {
  if (value === null) return true
  return typeof value === "number" && Number.isFinite(value)
}

function isValidMixMap(value: unknown): value is Record<string, number> {
  if (value === undefined) return true
  if (!isPlainObject(value)) return false
  for (const entry of Object.values(value)) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) return false
  }
  return true
}

/**
 * Strictly validates a decoded portable share payload and returns a clean
 * PlannedRoute (with placeholder id/routingSource to be overwritten by the
 * caller) when every field passes type, range, and allowlist checks.
 */
function validatePortableRouteShare(parsed: unknown): PlannedRoute | null {
  if (!isPlainObject(parsed)) return null
  if (parsed.version !== 1) return null
  const route = parsed.route
  if (!isPlainObject(route)) return null

  for (const key of Object.keys(route)) {
    if (!ALLOWED_ROUTE_KEYS.has(key)) return null
  }

  const { name, profile, geometry, waypoints, instructions } = route
  const { distanceMiles, durationMinutes, ascentMeters, descentMeters } = route
  const { twistiness, turnCount, roadMix, surfaceMix, previewOnly } = route

  if (typeof name !== "string" || name.length < 1 || name.length > 200) return null
  if (typeof profile !== "string" || !SUPPORTED_PROFILES.has(profile as RouteProfileId)) return null
  if (!Array.isArray(geometry) || geometry.length < 2) return null
  if (!geometry.every(isValidCoordinate)) return null
  if (waypoints !== undefined) {
    if (!Array.isArray(waypoints) || !waypoints.every(isValidWaypoint)) return null
  }
  if (instructions !== undefined) {
    if (!Array.isArray(instructions) || !instructions.every(isValidInstruction)) return null
  }
  if (!isFiniteNonNegative(distanceMiles)) return null
  if (!isFiniteNonNegative(durationMinutes)) return null
  if (!isFiniteNonNegative(twistiness)) return null
  if (!isFiniteNonNegative(turnCount)) return null
  if (!isFiniteOrNull(ascentMeters)) return null
  if (!isFiniteOrNull(descentMeters)) return null
  if (!isValidMixMap(roadMix)) return null
  if (!isValidMixMap(surfaceMix)) return null
  if (previewOnly !== undefined && typeof previewOnly !== "boolean") return null

  return {
    id: "",
    routingSource: "imported",
    name,
    profile: profile as RouteProfileId,
    geometry: geometry as Coordinate[],
    waypoints: (waypoints as Waypoint[] | undefined) ?? [],
    instructions: (instructions as RouteInstruction[] | undefined) ?? [],
    distanceMiles,
    durationMinutes,
    ascentMeters: ascentMeters as number | null,
    descentMeters: descentMeters as number | null,
    twistiness,
    turnCount,
    roadMix: (roadMix as Record<string, number> | undefined) ?? {},
    surfaceMix: (surfaceMix as Record<string, number> | undefined) ?? {},
    previewOnly: typeof previewOnly === "boolean" ? previewOnly : false
  }
}

/**
 * Returns a clean copy of the route carrying only the documented
 * PortableRouteShare fields, so caller-supplied extras never leak through the
 * generated share URL.
 */
function normalizeRouteForPortableShare(route: PlannedRoute): Omit<PlannedRoute, "id" | "routingSource"> {
  return {
    name: route.name,
    profile: route.profile,
    geometry: route.geometry.map((coordinate) => [Number(coordinate[0]), Number(coordinate[1])] as Coordinate),
    waypoints: route.waypoints,
    instructions: route.instructions,
    distanceMiles: route.distanceMiles,
    durationMinutes: route.durationMinutes,
    ascentMeters: route.ascentMeters,
    descentMeters: route.descentMeters,
    twistiness: route.twistiness,
    turnCount: route.turnCount,
    roadMix: route.roadMix,
    surfaceMix: route.surfaceMix,
    previewOnly: route.previewOnly
  }
}

export function createPortableShare(
  route: PlannedRoute,
  zones: readonly PrivacyZone[],
  baseUrl: string
): PortableShare {
  const redacted = redactRouteForShare(route, zones)
  const portableRoute = normalizeRouteForPortableShare(redacted)
  const payload: PortableRouteShare = {
    version: 1,
    // The generated id and the provider source are intentionally local to the
    // sender's storage; recipients receive a separate imported copy.
    route: portableRoute
  }
  const encoded = encodeBase64Url(JSON.stringify(payload))
  if (encoded.length > MAX_PORTABLE_SHARE_BYTES) {
    throw new Error("This route is too detailed for a private portable link. Export GPX or simplify it first.")
  }
  const origin = baseUrl.replace(/\/$/, "")
  return { url: `${origin}/#route=${encoded}`, route: redacted }
}

export function restorePortableShare(url: string): PlannedRoute | null {
  try {
    const token = new URL(url).hash.match(/^#route=([^&]+)$/)?.[1]
    // Symmetric with the encode-side cap: reject oversized tokens before
    // decoding instead of trusting the browser's URL-length limit.
    if (!token || token.length > MAX_PORTABLE_SHARE_BYTES) return null
    const parsed = JSON.parse(decodeBase64Url(token)) as unknown
    const validated = validatePortableRouteShare(parsed)
    if (!validated) return null
    return {
      id: `shared-${crypto.randomUUID()}`,
      routingSource: "imported",
      name: validated.name,
      profile: validated.profile,
      geometry: validated.geometry,
      waypoints: validated.waypoints,
      instructions: validated.instructions,
      distanceMiles: validated.distanceMiles,
      durationMinutes: validated.durationMinutes,
      ascentMeters: validated.ascentMeters,
      descentMeters: validated.descentMeters,
      twistiness: validated.twistiness,
      turnCount: validated.turnCount,
      roadMix: validated.roadMix,
      surfaceMix: validated.surfaceMix,
      previewOnly: Boolean(validated.previewOnly)
    }
  } catch {
    return null
  }
}
