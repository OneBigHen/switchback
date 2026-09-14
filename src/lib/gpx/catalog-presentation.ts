/**
 * Client-safe presentation rules for shared catalog routes.
 *
 * These helpers may clean or classify facts already present in catalog data,
 * but they must not invent route characteristics or turn unknown values into
 * confident rider-facing claims.
 */

export type CatalogBbox = readonly [number, number, number, number]

/**
 * Coarse browse filing for a shared catalog route. This is the single
 * geography authority for Route Library listing, detail, and filters.
 */
export interface CatalogArea {
  /** Broad browse bucket; one route has at most one. Null when unplaceable. */
  region: string | null
  /** Recognizable riding areas whose box holds the route centre, in list order. */
  ridingAreas: string[]
}

/**
 * Remove known bulk-import/file-sharing noise while preserving the rider's
 * actual route name. This is deliberately deterministic and non-generative.
 */
export function cleanCatalogRouteName(name: string): string {
  return name
    .trim()
    // Byline first: "Example.gpx - created by Rider" must still lose ".gpx".
    .replace(/\s*[-–—]?\s*created by\b.*$/i, "")
    .replace(/\.(?:gpx|kml|kmz)$/i, "")
    .replace(/^\d{2,}[\s._-]+(?=\D)/, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Normalize imported duration sentinels at the presentation boundary. Zero,
 * negatives, non-numbers, NaN, and infinity mean "unknown", never "0 min".
 */
export function knownDurationMinutes(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null
}

const PA_NORTH_SPLIT = 40.85
const PA_WEST_SPLIT = -78.3
const PA_EAST_SPLIT = -76.7

interface BrowseBox {
  label: string
  bbox: CatalogBbox
}

/**
 * Low-resolution Pennsylvania outline used only for catalog filing. It follows
 * the Delaware River closely enough to avoid filing nearby New Jersey routes as
 * Pennsylvania without pretending to be authoritative boundary GIS.
 */
const PENNSYLVANIA_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [-80.52, 39.72],
  [-75.79, 39.72],
  [-75.58, 39.84],
  [-75.13, 39.95],
  [-74.77, 40.22],
  [-75.14, 40.68],
  [-74.69, 41.36],
  [-75.36, 42.0],
  [-79.76, 42.0],
  [-80.52, 42.27]
]

/**
 * Intentionally coarse riding-area groupings, not county, forest, or legal
 * boundaries. A route is filed under an area only when its centre sits inside
 * the area's box: a long route whose extent merely clips an area is not
 * claimed to ride through it.
 */
const PA_RIDING_AREAS: readonly BrowseBox[] = [
  // The PA Wilds counties begin around 40.9°N; farther south is Pittsburgh-area
  // country (e.g. Armstrong County), not the Wilds.
  { label: "PA Wilds", bbox: [-79.65, 40.9, -76.65, 42.33] },
  { label: "Allegheny National Forest", bbox: [-79.35, 41.2, -78.5, 42.15] },
  { label: "Bald Eagle / Rothrock", bbox: [-78.35, 40.35, -76.65, 41.3] },
  { label: "Pine Creek", bbox: [-78.05, 41.0, -76.55, 42.2] },
  { label: "Endless Mountains", bbox: [-77.15, 41.05, -75.15, 42.25] },
  { label: "Poconos", bbox: [-75.95, 40.6, -74.6, 41.7] },
  { label: "Laurel Highlands", bbox: [-79.95, 39.65, -78.65, 40.6] },
  { label: "Michaux / Caledonia", bbox: [-78.0, 39.65, -76.75, 40.3] },
  { label: "Susquehanna Valley", bbox: [-77.45, 40.0, -75.65, 41.5] },
  { label: "Dutch Country", bbox: [-77.15, 39.65, -75.7, 40.6] },
  { label: "Bucks / Philadelphia", bbox: [-75.7, 39.7, -74.65, 40.7] }
]

/** Checked in order after the PA outline; the first box holding the centre wins. */
const OUTSIDE_PA: readonly BrowseBox[] = [
  { label: "New Jersey", bbox: [-75.6, 38.9, -73.9, 41.4] },
  { label: "New York", bbox: [-79.8, 40.5, -71.8, 45.1] },
  { label: "West Virginia & Maryland", bbox: [-82.7, 37.2, -75.0, 39.75] },
  { label: "Virginia", bbox: [-83.7, 36.5, -75.2, 39.5] },
  { label: "Ohio", bbox: [-84.9, 38.4, -80.45, 42.35] },
  { label: "New England", bbox: [-73.8, 41.0, -66.8, 47.5] },
  { label: "Europe", bbox: [-11.0, 35.0, 32.0, 60.0] }
]

function centerOfBbox(bbox: CatalogBbox): readonly [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
}

function contains(box: CatalogBbox, point: readonly [number, number]): boolean {
  return point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3]
}

function pointInPolygon(
  point: readonly [number, number],
  polygon: ReadonlyArray<readonly [number, number]>
): boolean {
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current]!
    const b = polygon[previous]!
    const crosses = (a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    if (crosses) inside = !inside
  }
  return inside
}

function pennsylvaniaRegion(point: readonly [number, number]): string {
  const north = point[1] >= PA_NORTH_SPLIT
  if (point[0] < PA_WEST_SPLIT) return north ? "Northwest PA" : "Southwest PA"
  if (point[0] < PA_EAST_SPLIT) return north ? "North-Central PA" : "South-Central PA"
  return north ? "Northeast PA" : "Southeast PA"
}

/**
 * Coarse, offline filing from real route extent. This is a browse aid, not a
 * geocoder: unknown geometry remains unplaced and no route name is consulted.
 */
export function classifyCatalogArea(bbox: CatalogBbox | null | undefined): CatalogArea {
  if (!bbox) return { region: null, ridingAreas: [] }

  const center = centerOfBbox(bbox)
  if (pointInPolygon(center, PENNSYLVANIA_OUTLINE)) {
    return {
      region: pennsylvaniaRegion(center),
      ridingAreas: PA_RIDING_AREAS.filter((area) => contains(area.bbox, center)).map((area) => area.label)
    }
  }

  const outside = OUTSIDE_PA.find((region) => contains(region.bbox, center))
  return { region: outside?.label ?? "Farther afield", ridingAreas: [] }
}

/**
 * Two-letter US state/territory codes. An import convention this catalog sees
 * constantly puts the state between an origin and a destination
 * ("Green Lane-NJ-Bucks-Creek-Crossing"), so a state token sitting between two
 * named places is read as that separator rather than as part of either name.
 */
const STATE_CODES: ReadonlySet<string> = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT",
  "VT", "VA", "WA", "WV", "WI", "WY"
])

/**
 * Trailing markers bulk imports append to distinguish their own working
 * copies. They describe the *file*, never the ride.
 */
const TECHNICAL_TOKENS: ReadonlySet<string> = new Set([
  "TRACK", "TRACKS", "CORRECTED", "FIXED", "EDIT", "EDITED", "FINAL", "COPY", "DUPLICATE",
  "DUP", "NEW", "OLD", "BACKUP", "EXPORT", "EXPORTED", "IMPORT", "IMPORTED", "CLEAN",
  "CLEANED", "MERGED", "REVISED", "DRAFT", "TEMP", "TMP", "ROUTE", "GPX"
])

function isTechnicalToken(token: string): boolean {
  const bare = token.replace(/[^A-Za-z0-9]/g, "")
  if (bare.length === 0) return false
  if (TECHNICAL_TOKENS.has(bare.toUpperCase())) return true
  // Version markers: v2, V10, 2ND.
  return /^v\d+$/i.test(bare)
}

/** Title-case a token that is shouting; leave deliberate casing alone. */
function softTitleCase(token: string): string {
  if (token.length === 0) return token
  const letters = token.replace(/[^A-Za-z]/g, "")
  if (letters.length < 2 || letters !== letters.toUpperCase()) return token
  return token.replace(/[A-Za-z][A-Za-z']*/g, (word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase())
}

/**
 * A deterministic rider-facing title derived from an import filename. This
 * cleans and re-reads tokens that are already present; it never generates a
 * name, and it never calls a model.
 */
export function cleanImportedRouteTitle(name: string): string {
  const base = cleanCatalogRouteName(name)
  if (base.length === 0) return ""

  const tokens = base.split(/[-_]+/).map((token) => token.trim()).filter((token) => token.length > 0)
  if (tokens.length <= 1) return softTitleCase(base)

  // A name made only of file bookkeeping carries no ride in it. Stripping the
  // tail would leave a worse half-name ("Track"), so the import's own name is
  // kept verbatim as provenance instead of a derived one.
  if (tokens.every(isTechnicalToken)) return base

  // Strip technical markers from the tail only: a ride legitimately called
  // "Copper Creek Track" keeps its name, a file called "…-TRACK" does not.
  let end = tokens.length
  while (end > 1 && isTechnicalToken(tokens[end - 1]!)) end -= 1
  const kept = tokens.slice(0, end)
  if (kept.length === 0) return softTitleCase(base)

  const separator = kept.findIndex((token, index) =>
    index > 0 && index < kept.length - 1 && STATE_CODES.has(token.toUpperCase()))

  if (separator > 0) {
    const origin = kept.slice(0, separator).map(softTitleCase).join(" ").trim()
    const destination = kept.slice(separator + 1).map(softTitleCase).join(" ").trim()
    if (origin.length > 0 && destination.length > 0) return `${origin} \u2192 ${destination}`
  }

  const joined = kept.map(softTitleCase).join(" ").replace(/\s+/g, " ").trim()
  return joined.length > 0 ? joined : softTitleCase(base)
}

/**
 * Whether a stored name still reads as the file it came from. Used to decide
 * that a "catalog title" is not actually a title worth showing a rider.
 */
export function looksLikeRawImportFilename(name: string): boolean {
  const trimmed = name.trim()
  if (trimmed.length === 0) return false
  if (/\.(?:gpx|kml|kmz)$/i.test(trimmed)) return true
  if (/^\d{2,}[\s._-]/.test(trimmed)) return true
  if (/\bcreated by\b/i.test(trimmed)) return true
  const tokens = trimmed.split(/[-_]+/).filter((token) => token.trim().length > 0)
  if (tokens.length < 2) return false
  return tokens.some(isTechnicalToken) || tokens.some((token) => STATE_CODES.has(token.trim().toUpperCase()))
}

export interface CatalogTitleInput {
  /** A title the rider or publisher set explicitly. Always wins. */
  readonly userTitle?: string | null
  /** An existing catalog display title, used only when it reads as a title. */
  readonly catalogTitle?: string | null
  /** The imported filename. Provenance — the last resort for display. */
  readonly originalName: string
}

/**
 * Display-name precedence for a catalog route:
 *
 * 1. explicit user/public title,
 * 2. a strong existing catalog display title,
 * 3. the deterministic cleaned import title,
 * 4. the original filename.
 *
 * The original name is never altered; provenance stays available beside the
 * display title for anyone who needs to trace the import.
 */
export function catalogDisplayTitle(input: CatalogTitleInput): string {
  const explicit = input.userTitle?.trim()
  if (explicit) return explicit

  const catalog = input.catalogTitle?.trim()
  if (catalog && !looksLikeRawImportFilename(catalog)) return catalog

  const cleaned = cleanImportedRouteTitle(input.originalName)
  if (cleaned) return cleaned

  const original = cleanCatalogRouteName(input.originalName) || input.originalName.trim()
  return original || "Untitled route"
}
