import type { Coordinate, PlannedRoute } from "@/lib/routing/types"
import type { SavedRoute, SavedRouteLibraryProvenance } from "@/lib/storage/route-library"

/**
 * Browser-side access to the shared Route Library catalog.
 *
 * Catalog routes are read-only shared data. The only way one becomes rider
 * owned is `saveCatalogRouteToMyRides`, which fetches the full detail record,
 * validates real geometry, and writes a separate copy with explicit
 * `catalog-copy` provenance. Opening a catalog route in the planner uses
 * `fetchCatalogRoute` alone and never writes to My Rides.
 */

export class CatalogRouteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CatalogRouteError"
  }
}

const CATALOG_ROUTE_ID = /^[A-Za-z0-9._-]{1,200}$/

/** Catalog detail fields that describe the shared entry, not the route itself. */
const PRESENTATION_FIELDS = [
  "story",
  "catalog",
  "poster",
  "duplicateFamilyId",
  "duplicateFamilySize",
  "duplicateFamilyRole"
] as const

export function isCatalogRouteId(id: string): boolean {
  return CATALOG_ROUTE_ID.test(id)
}

/**
 * Stable id for the rider-owned copy of a catalog route. Deterministic so two
 * racing saves converge on one row, and distinct from the catalog id so the
 * owned copy and the shared entry can never be mistaken for each other.
 */
export function catalogCopyId(sourceCatalogRouteId: string): string {
  return `catalog-copy--${sourceCatalogRouteId}`
}

function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2
    && typeof value[0] === "number" && Number.isFinite(value[0]) && value[0] >= -180 && value[0] <= 180
    && typeof value[1] === "number" && Number.isFinite(value[1]) && value[1] >= -90 && value[1] <= 90
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * Validate a `/api/gpx-library?id=` detail payload as a real, planner-ready
 * route. Preview-only or missing geometry is rejected: it cannot be opened as
 * the real line, and it must never be persisted as an owned route.
 */
export function parseCatalogRouteDetail(value: unknown, id: string): PlannedRoute {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CatalogRouteError("The Route Library returned an unreadable route.")
  }
  const record = value as Record<string, unknown>
  if (record.id !== id) throw new CatalogRouteError("The Route Library returned a different route.")
  if (typeof record.name !== "string") throw new CatalogRouteError("This Route Library entry has no name.")
  if (record.previewOnly === true) {
    throw new CatalogRouteError("Only a preview of this route was stored, so it cannot be opened or saved as the real line.")
  }
  if (!Array.isArray(record.geometry) || record.geometry.length < 2 || !record.geometry.every(isCoordinate)) {
    throw new CatalogRouteError("This Route Library entry has no usable route geometry.")
  }
  if (!Array.isArray(record.waypoints) || !Array.isArray(record.instructions)) {
    throw new CatalogRouteError("This Route Library entry is incomplete.")
  }
  if (!isFiniteNumber(record.distanceMiles) || !isFiniteNumber(record.durationMinutes)) {
    throw new CatalogRouteError("This Route Library entry is missing its distance.")
  }

  const route: Record<string, unknown> = { ...record, previewOnly: false }
  for (const field of PRESENTATION_FIELDS) delete route[field]
  return route as unknown as PlannedRoute
}

export async function fetchCatalogRoute(id: string, fetcher: typeof fetch = fetch): Promise<PlannedRoute> {
  if (!isCatalogRouteId(id)) throw new CatalogRouteError("That Route Library entry was not found.")
  let response: Response
  try {
    response = await fetcher(`/api/gpx-library?id=${encodeURIComponent(id)}`, { cache: "no-store" })
  } catch {
    throw new CatalogRouteError("The Route Library could not be reached. Check your connection and try again.")
  }
  if (!response.ok) {
    throw new CatalogRouteError(response.status === 404
      ? "That Route Library entry was not found."
      : "The Route Library is not available right now.")
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new CatalogRouteError("The Route Library returned an unreadable route.")
  }
  return parseCatalogRouteDetail(body, id)
}

export interface CatalogCopyLibrary {
  findCatalogCopy(sourceCatalogRouteId: string): Promise<SavedRoute | undefined>
  save(route: PlannedRoute, notes?: string, libraryProvenance?: SavedRouteLibraryProvenance): Promise<SavedRoute>
}

export interface CatalogSaveResult {
  route: SavedRoute
  /** False when the rider already owned a copy and it was reused. */
  created: boolean
}

const savesInFlight = new WeakMap<CatalogCopyLibrary, Map<string, Promise<CatalogSaveResult>>>()

/**
 * Explicit, duplicate-safe Save to My Rides for one shared catalog route.
 *
 * Concurrent saves in this page share one fetch and one write; a joiner sees
 * the copy as already saved. Across tabs the deterministic copy id still
 * converges on a single row.
 */
export async function saveCatalogRouteToMyRides(
  library: CatalogCopyLibrary,
  sourceCatalogRouteId: string,
  fetcher: typeof fetch = fetch
): Promise<CatalogSaveResult> {
  const saves = savesInFlight.get(library) ?? new Map<string, Promise<CatalogSaveResult>>()
  savesInFlight.set(library, saves)
  const pending = saves.get(sourceCatalogRouteId)
  if (pending) return pending.then(({ route }) => ({ route, created: false }))

  const saving = saveOnce(library, sourceCatalogRouteId, fetcher)
  saves.set(sourceCatalogRouteId, saving)
  try {
    return await saving
  } finally {
    saves.delete(sourceCatalogRouteId)
  }
}

async function saveOnce(
  library: CatalogCopyLibrary,
  sourceCatalogRouteId: string,
  fetcher: typeof fetch
): Promise<CatalogSaveResult> {
  const existing = await library.findCatalogCopy(sourceCatalogRouteId)
  if (existing) return { route: existing, created: false }

  const catalogRoute = await fetchCatalogRoute(sourceCatalogRouteId, fetcher)
  const route = await library.save(
    { ...catalogRoute, id: catalogCopyId(sourceCatalogRouteId) },
    "",
    { kind: "catalog-copy", sourceCatalogRouteId }
  )
  return { route, created: true }
}
