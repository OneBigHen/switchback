import type { Coordinate, PlannedRoute, RouteInstruction, RouteProfileId, Waypoint } from "@/lib/routing/types"

const EARTH_RADIUS_METERS = 6_371_008.8
const MAX_PORTABLE_SHARE_BYTES = 7_500

const SUPPORTED_PROFILES: ReadonlySet<RouteProfileId> = new Set([
  "quick", "balanced", "twisty", "scenic", "adventure", "gravel", "avoid-highways", "neural"
])

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
 * Where the segment a→b crosses a privacy-zone circle (a outside → b inside
 * or vice versa), in geographic degrees. Uses an equirectangular meter
 * approximation; returns null when the segment crosses no zone boundary.
 */
function circleBoundaryIntersection(
  a: Coordinate,
  b: Coordinate,
  zones: readonly PrivacyZone[]
): Coordinate | null {
  for (const zone of zones) {
    const crossing = crossingWithZone(a, b, zone)
    if (crossing) return crossing
  }
  return null
}

function crossingWithZone(
  a: Coordinate,
  b: Coordinate,
  zone: PrivacyZone
): Coordinate | null {
  const radiusMeters = zone.radiusMeters
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return null
  const [cx, cy] = zone.center
  const cosLat = Math.cos((cy * Math.PI) / 180) || 1
  const toMetersX = 111_320 * cosLat
  const toMetersY = 111_320
  const ax = (a[0] - cx) * toMetersX
  const ay = (a[1] - cy) * toMetersY
  const bx = (b[0] - cx) * toMetersX
  const by = (b[1] - cy) * toMetersY
  const dx = bx - ax
  const dy = by - ay
  const A = dx * dx + dy * dy
  if (A === 0) return null
  const B = 2 * (ax * dx + ay * dy)
  const C = ax * ax + ay * ay - radiusMeters * radiusMeters
  const discriminant = B * B - 4 * A * C
  if (discriminant < 0) return null
  const sqrt = Math.sqrt(discriminant)
  const t1 = (-B - sqrt) / (2 * A)
  const t2 = (-B + sqrt) / (2 * A)
  const t = t1 >= 0 && t1 <= 1 ? t1 : t2 >= 0 && t2 <= 1 ? t2 : null
  if (t === null) return null
  return [
    a[0] + t * (b[0] - a[0]),
    a[1] + t * (b[1] - a[1])
  ]
}

function geometryLengthMeters(geometry: readonly Coordinate[]): number {
  let total = 0
  for (let index = 1; index < geometry.length; index += 1) {
    total += distanceMeters(geometry[index - 1]!, geometry[index]!)
  }
  return total
}

interface RedactionGeometry {
  visible: Coordinate[]
  /** Original indices of kept (non-boundary) points, in order. */
  keptOriginalIndices: number[]
  /** Contiguous original-index runs that were removed (inside zones). */
  removedRanges: Array<[number, number]>
}

function redactGeometry(geometry: readonly Coordinate[], zones: readonly PrivacyZone[]): RedactionGeometry {
  const visible: Coordinate[] = []
  const keptOriginalIndices: number[] = []
  const removedRanges: Array<[number, number]> = []
  let runStart = -1

  const closeRun = (index: number) => {
    if (runStart >= 0) {
      removedRanges.push([runStart, index - 1])
      runStart = -1
    }
  }

  for (let index = 0; index < geometry.length; index += 1) {
    const point = geometry[index]!
    const inside = insidePrivacyZone(point, zones)
    const previousInside = index > 0 ? insidePrivacyZone(geometry[index - 1]!, zones) : false

    if (inside) {
      if (runStart < 0) runStart = index
      // Leaving the zone: terminate the visible line exactly at the boundary
      // so the shared route never jumps across protected geometry.
      if (index > 0 && !previousInside) {
        const crossing = circleBoundaryIntersection(geometry[index - 1]!, point, zones)
        if (crossing) visible.push(crossing)
      }
      continue
    }

    closeRun(index)
    // Entering from inside: resume the visible line at the boundary.
    if (index > 0 && previousInside) {
      const crossing = circleBoundaryIntersection(geometry[index - 1]!, point, zones)
      if (crossing) visible.push(crossing)
    }
    visible.push(point)
    keptOriginalIndices.push(index)
  }
  closeRun(geometry.length)

  return { visible, keptOriginalIndices, removedRanges }
}

/**
 * Privacy zones are deliberately applied before a route is serialized or sent
 * to a Web Share target:
 * - protected geometry is removed and boundary intersections become visible
 *   endpoints (no straight jump across a zone);
 * - protected waypoints are dropped;
 * - instructions inside or spanning a zone are removed, street names that
 *   would identify a hidden section never survive, and remaining intervals
 *   are rebased onto the visible geometry;
 * - distance/duration are recalculated from the visible geometry; elevation
 *   evidence tied to hidden sections is dropped.
 */
export function redactRouteForShare(route: PlannedRoute, zones: readonly PrivacyZone[]): PlannedRoute {
  const { visible, keptOriginalIndices, removedRanges } = redactGeometry(route.geometry, zones)
  if (visible.length < 2) {
    throw new Error("Privacy zones remove too much of this route to create a useful share.")
  }

  const newIndexForOriginal = new Map<number, number>()
  keptOriginalIndices.forEach((originalIndex, newIndex) => {
    newIndexForOriginal.set(originalIndex, newIndex)
  })

  const instructions = route.instructions
    .filter((instruction) => (
      // Drop any instruction whose segment touches a removed zone range; its
      // text/street name could describe a protected location.
      !removedRanges.some(([start, end]) =>
        instruction.interval[0] <= end && instruction.interval[1] >= start
      )
    ))
    .flatMap((instruction) => {
      const start = newIndexForOriginal.get(instruction.interval[0])
      const end = newIndexForOriginal.get(instruction.interval[1])
      if (start === undefined || end === undefined) return []
      return [{
        ...instruction,
        interval: [start, end] as [number, number]
      }]
    })

  const originalLength = geometryLengthMeters(route.geometry)
  const visibleLength = geometryLengthMeters(visible)
  const ratio = originalLength > 0 ? visibleLength / originalLength : 0

  return {
    ...structuredClone(route),
    geometry: visible,
    waypoints: redactedWaypoints(route.waypoints, zones),
    instructions,
    distanceMiles: Number((route.distanceMiles * ratio).toFixed(2)),
    durationMinutes: Number((route.durationMinutes * ratio).toFixed(2)),
    // Elevation evidence cannot be attributed to only the visible portion.
    ascentMeters: null,
    descentMeters: null,
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

/**
 * Deterministic Douglas-Peucker simplification with a maximum deviation in
 * meters, applied to a route before a portable link is declared too large.
 * The same input always produces the same output.
 */
function simplifyGeometryMeters(
  geometry: readonly Coordinate[],
  maxDeviationMeters: number
): Coordinate[] {
  if (geometry.length <= 2) return [...geometry]
  const metersBetween = (a: Coordinate, b: Coordinate): number => distanceMeters(a, b)
  const perpendicularMeters = (point: Coordinate, a: Coordinate, b: Coordinate): number => {
    const ab = metersBetween(a, b)
    if (ab === 0) return metersBetween(point, a)
    // Equirectangular projection for the perpendicular distance.
    const cosLat = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180) || 1
    const toX = 111_320 * cosLat
    const toY = 111_320
    const ax = a[0] * toX
    const ay = a[1] * toY
    const bx = b[0] * toX
    const by = b[1] * toY
    const px = point[0] * toX
    const py = point[1] * toY
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / (ab * ab)))
    const projX = ax + t * (bx - ax)
    const projY = ay + t * (by - ay)
    return Math.hypot(px - projX, py - projY)
  }

  const keep = new Set<number>([0, geometry.length - 1])
  const stack: Array<[number, number]> = [[0, geometry.length - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop()!
    if (end - start < 2) continue
    let maxDistance = -1
    let maxIndex = -1
    for (let index = start + 1; index < end; index += 1) {
      const d = perpendicularMeters(geometry[index]!, geometry[start]!, geometry[end]!)
      if (d > maxDistance) {
        maxDistance = d
        maxIndex = index
      }
    }
    if (maxIndex >= 0 && maxDistance > maxDeviationMeters) {
      keep.add(maxIndex)
      stack.push([start, maxIndex])
      stack.push([maxIndex, end])
    }
  }
  return geometry.filter((_, index) => keep.has(index))
}

/** One bounded simplification attempt for oversized portable links. */
function simplifiedCopy(route: PlannedRoute): PlannedRoute {
  return {
    ...route,
    geometry: simplifyGeometryMeters(route.geometry, 30),
    // Instruction intervals index the original geometry and cannot survive
    // point removal; dropping them is honest (directions are secondary to
    // the visible line and would be misleading after simplification).
    instructions: []
  }
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
    // Deterministic simplification with bounded deviation before giving up
    // (SB-008): shrink the line, drop instructions, and retry once.
    const simplifiedRoute = simplifiedCopy(redacted)
    const simplified = normalizeRouteForPortableShare(simplifiedRoute)
    const retryPayload: PortableRouteShare = { version: 1, route: simplified }
    const retryEncoded = encodeBase64Url(JSON.stringify(retryPayload))
    if (retryEncoded.length > MAX_PORTABLE_SHARE_BYTES) {
      throw new Error("This route is too detailed for a private portable link even after simplification. Export GPX or share it as a local file.")
    }
    const origin = baseUrl.replace(/\/$/, "")
    return { url: `${origin}/#route=${retryEncoded}`, route: simplifiedRoute }
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
