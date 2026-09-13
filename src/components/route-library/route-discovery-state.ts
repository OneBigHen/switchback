/**
 * Presentation state for route discovery.
 *
 * Map and List are two presentations over **one** query: the filters, the
 * search text and the ranked result set are shared, and only the selection and
 * the camera belong to the map. Nothing here owns route data — `browseAtlas`
 * remains the single filter/sort authority.
 */

import {
  browseAtlas,
  lengthBucket,
  type AtlasAnchor,
  type AtlasBrowseRoute,
  type AtlasFilterState,
  type AtlasLengthBucket,
  type RankedAtlasRoute
} from "@/app/gpx-library/atlas-browse"
import type { CurvatureBand } from "@/lib/gpx/atlas-art"

export type DiscoveryView = "map" | "list"

export type QuickChipId = "nearby" | "gravel" | "twisty" | "duration-2-4" | "filters"

/** Backroad pace used to read an unknown duration off distance. */
const ESTIMATED_MPH = 34

const GRAVEL_PROFILES: ReadonlySet<string> = new Set(["adventure", "gravel"])
const GRAVEL_UNPAVED_FLOOR = 0.25
const TWISTY_BANDS: readonly CurvatureBand[] = ["twisty", "hairpin"]
const NEARBY_RADIUS = "100" as const

/** Minutes for a route, using recorded time when there is one. */
export function routeMinutes(route: AtlasBrowseRoute): { minutes: number | null; estimated: boolean } {
  if (typeof route.durationMinutes === "number" && route.durationMinutes > 0) {
    return { minutes: route.durationMinutes, estimated: false }
  }
  if (!Number.isFinite(route.distanceMiles) || route.distanceMiles <= 0) {
    return { minutes: null, estimated: false }
  }
  return { minutes: Math.round((route.distanceMiles / ESTIMATED_MPH) * 60), estimated: true }
}

/**
 * Whether a route carries any evidence that it is a gravel/adventure ride. A
 * catalog with no such evidence anywhere must not offer the chip as if it
 * filtered something — see `quickChipAvailability`.
 */
export function hasGravelEvidence(route: AtlasBrowseRoute): boolean {
  if (route.unpavedShare !== null && route.unpavedShare >= GRAVEL_UNPAVED_FLOOR) return true
  return route.profile !== null && route.profile !== undefined && GRAVEL_PROFILES.has(route.profile)
}

export function isTwoToFourHours(route: AtlasBrowseRoute): boolean {
  const { minutes } = routeMinutes(route)
  return minutes !== null && minutes >= 120 && minutes <= 240
}

export interface DiscoveryQuickState {
  readonly chips: readonly QuickChipId[]
}

export const NO_QUICK_CHIPS: DiscoveryQuickState = { chips: [] }

export function toggleQuickChip(state: DiscoveryQuickState, chip: QuickChipId): DiscoveryQuickState {
  return {
    chips: state.chips.includes(chip)
      ? state.chips.filter((entry) => entry !== chip)
      : [...state.chips, chip]
  }
}

/**
 * Chips are shortcuts *into* the existing filter model, never a parallel one.
 * `Nearby` and `2-4 hr` are expressed as ordinary filter state so the detailed
 * filter panel shows the rider exactly what a chip did; `Gravel` and the time
 * window need a per-route predicate the filter model does not carry, so they
 * are applied as an extra pass over the same ranked result.
 */
export function applyQuickChips(
  filters: AtlasFilterState,
  quick: DiscoveryQuickState,
  hasLocation: boolean
): AtlasFilterState {
  let next = filters
  if (quick.chips.includes("nearby") && hasLocation) {
    next = { ...next, radius: NEARBY_RADIUS, sort: "nearest" }
  }
  if (quick.chips.includes("twisty")) {
    const merged = new Set<CurvatureBand>([...next.bands, ...TWISTY_BANDS])
    next = { ...next, bands: [...merged] }
  }
  return next
}

export interface DiscoveryResult {
  readonly ranked: readonly RankedAtlasRoute[]
  readonly outsideRadius: number
  /** Rows the quick chips removed after the shared filter model ran. */
  readonly removedByChips: number
}

export function runDiscoveryQuery(
  routes: readonly AtlasBrowseRoute[],
  filters: AtlasFilterState,
  quick: DiscoveryQuickState,
  anchor: AtlasAnchor | null
): DiscoveryResult {
  const base = browseAtlas(routes, applyQuickChips(filters, quick, anchor !== null), anchor)
  const predicates: Array<(route: AtlasBrowseRoute) => boolean> = []
  if (quick.chips.includes("gravel")) predicates.push(hasGravelEvidence)
  if (quick.chips.includes("duration-2-4")) predicates.push(isTwoToFourHours)
  if (predicates.length === 0) {
    return { ranked: base.ranked, outsideRadius: base.outsideRadius, removedByChips: 0 }
  }
  const ranked = base.ranked.filter((entry) => predicates.every((test) => test(entry.route)))
  return {
    ranked,
    outsideRadius: base.outsideRadius,
    removedByChips: base.ranked.length - ranked.length
  }
}

export interface QuickChipAvailability {
  readonly enabled: boolean
  /** Why the chip cannot be used, for a title/`aria-description`. */
  readonly reason: string | null
}

/**
 * A chip that can never match anything is a lie about the catalog. Offer it
 * disabled with the reason instead of silently returning an empty list.
 */
export function quickChipAvailability(
  chip: QuickChipId,
  routes: readonly AtlasBrowseRoute[],
  hasLocation: boolean
): QuickChipAvailability {
  switch (chip) {
    case "nearby":
      return hasLocation
        ? { enabled: true, reason: null }
        : { enabled: false, reason: "Share your location to sort by what is near you." }
    case "gravel":
      return routes.some(hasGravelEvidence)
        ? { enabled: true, reason: null }
        : { enabled: false, reason: "No route in this collection carries surface evidence yet." }
    case "duration-2-4":
      return routes.some(isTwoToFourHours)
        ? { enabled: true, reason: null }
        : { enabled: false, reason: "No route in this collection lands in that time window." }
    case "twisty":
      return routes.some((route) => TWISTY_BANDS.includes(route.band))
        ? { enabled: true, reason: null }
        : { enabled: false, reason: "No route in this collection is filed as twisty." }
    case "filters":
      return { enabled: true, reason: null }
  }
}

/**
 * Which route the map should frame, and whether it may take the camera.
 *
 * The rule the spec cares about: after the rider has panned or zoomed, only an
 * explicit selection (or an explicit recenter) may move the camera again.
 * Incidental state churn — a filter recount, a geolocation update, a re-render
 * — must not yank the map back.
 */
export interface DiscoveryCameraState {
  /** Route the rider explicitly chose, if any. */
  readonly selectedId: string | null
  /** Set once the rider moves the map themselves. */
  readonly riderMovedMap: boolean
  /** Selection generation; only a change here earns the camera. */
  readonly fitToken: number
}

export const INITIAL_CAMERA: DiscoveryCameraState = {
  selectedId: null,
  riderMovedMap: false,
  fitToken: 0
}

export function selectDiscoveryRoute(
  state: DiscoveryCameraState,
  routeId: string | null
): DiscoveryCameraState {
  if (routeId === state.selectedId) return state
  return { selectedId: routeId, riderMovedMap: false, fitToken: state.fitToken + 1 }
}

export function riderMovedDiscoveryMap(state: DiscoveryCameraState): DiscoveryCameraState {
  return state.riderMovedMap ? state : { ...state, riderMovedMap: true }
}

/** Explicit "show me this again" control; always earns the camera. */
export function recenterDiscoveryMap(state: DiscoveryCameraState): DiscoveryCameraState {
  return { ...state, riderMovedMap: false, fitToken: state.fitToken + 1 }
}

/**
 * Keep the selection pointing at a route that still survives the filters. A
 * selection that filtered away is dropped rather than leaving the card rail
 * and the map disagreeing about what is highlighted.
 */
export function reconcileSelection(
  state: DiscoveryCameraState,
  ranked: readonly RankedAtlasRoute[]
): DiscoveryCameraState {
  if (state.selectedId === null) return state
  return ranked.some((entry) => entry.route.id === state.selectedId)
    ? state
    : { ...state, selectedId: null }
}

export function describeDiscoveryResult(
  count: number,
  filters: AtlasFilterState,
  quick: DiscoveryQuickState,
  located: boolean
): string {
  if (count === 0) return "No routes match"
  const noun = count === 1 ? "route" : "routes"
  if (located && filters.radius !== "any") return `${count} ${noun} within ${filters.radius} mi`
  const query = filters.query.trim()
  if (query !== "") return `${count} ${noun} matching “${query}”`
  if (quick.chips.length > 0) return `${count} ${noun} match`
  return `${count} ${noun}`
}

/** Length bucket label shown on a card; re-exported so cards agree with filters. */
export function routeLengthBucket(route: AtlasBrowseRoute): AtlasLengthBucket {
  return lengthBucket(route.distanceMiles)
}
