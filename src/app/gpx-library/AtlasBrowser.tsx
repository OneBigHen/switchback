"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { CSSProperties } from "react"
import { RouteLibraryActions } from "@/components/route-library/RouteLibraryActions"
import type { CurvatureBand } from "@/lib/gpx/atlas"
import { formatAway, useNearMe, type NearMeAnchor, type NearMeStatus } from "@/lib/client/near-me"
import {
  browseAtlas,
  CURVATURE_BAND_ORDER,
  DEFAULT_FILTERS,
  formatDuration,
  formatMiles,
  LENGTH_BUCKETS,
  type AtlasBrowseRoute,
  type AtlasFilterState,
  type AtlasLengthBucket,
  type AtlasRadiusId,
  type AtlasSortId,
  type RankedAtlasRoute
} from "./atlas-browse"

type GeoStatus = NearMeStatus

const SORT_OPTIONS: ReadonlyArray<{ id: AtlasSortId; label: string; needsLocation?: boolean }> = [
  { id: "nearest", label: "Nearest to me", needsLocation: true },
  { id: "longest", label: "Longest ride" },
  { id: "shortest", label: "Shortest ride" },
  { id: "twistiest", label: "Most corners" }
]

const RADIUS_OPTIONS: ReadonlyArray<{ id: AtlasRadiusId; label: string }> = [
  { id: "25", label: "25 mi" },
  { id: "100", label: "100 mi" },
  { id: "250", label: "250 mi" },
  { id: "any", label: "Any distance" }
]

const BAND_LABEL: Record<CurvatureBand, string> = {
  calm: "Calm",
  mellow: "Mellow",
  twisty: "Twisty",
  hairpin: "Hairpin"
}

/** Tablet-landscape and wider get a preview rail beside the deck. */
const RAIL_QUERY = "(min-width: 900px)"

function subscribeToRailQuery(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined
  const query = window.matchMedia(RAIL_QUERY)
  query.addEventListener?.("change", onChange)
  return () => query.removeEventListener?.("change", onChange)
}

function useRailLayout(): boolean {
  return useSyncExternalStore(
    subscribeToRailQuery,
    () => typeof window.matchMedia === "function" && window.matchMedia(RAIL_QUERY).matches,
    // Server and first hydration render the phone drill-in deck.
    () => false
  )
}

export interface AtlasBrowserProps {
  routes: readonly AtlasBrowseRoute[]
  regions: readonly string[]
  ridingAreas: readonly string[]
  routeCount: number
  totalMiles: number
  updatedLabel: string | null
}

export function AtlasBrowser({ routes, regions, ridingAreas, routeCount, totalMiles, updatedLabel }: AtlasBrowserProps) {
  const [filters, setFilters] = useState<AtlasFilterState>(DEFAULT_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const railLayout = useRailLayout()
  const { anchor, status: geoStatus, located, requestLocation } = useNearMe()
  const autoSortDone = useRef(false)
  const browserRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)

  // The filter bar is sticky and wraps to a different height per width and
  // filter state; publish its height so the preview rail sticks below it
  // instead of sliding underneath.
  useEffect(() => {
    const browser = browserRef.current
    const controls = controlsRef.current
    if (!browser || !controls || typeof ResizeObserver !== "function") return
    const publish = () => browser.style.setProperty("--atlas-sticky-offset", `${controls.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(controls)
    return () => observer.disconnect()
  }, [])

  // First fix while the rider hasn't touched the sort: flip the default
  // "Longest" order to "Nearest to me". Deferred so it is not a synchronous
  // setState inside the effect.
  useEffect(() => {
    if (!anchor || autoSortDone.current) return
    autoSortDone.current = true
    queueMicrotask(() =>
      setFilters((current) => (current.sort === DEFAULT_FILTERS.sort ? { ...current, sort: "nearest" } : current))
    )
  }, [anchor])

  const { ranked, outsideRadius } = useMemo(
    () => browseAtlas(routes, filters, anchor),
    [routes, filters, anchor]
  )

  const filtersDirty =
    filters.sort !== DEFAULT_FILTERS.sort ||
    filters.radius !== DEFAULT_FILTERS.radius ||
    filters.lengths.length > 0 ||
    filters.bands.length > 0 ||
    filters.region !== null ||
    filters.area !== null ||
    filters.query.trim() !== ""

  const toggleLength = (id: AtlasLengthBucket) =>
    setFilters((current) => ({
      ...current,
      lengths: current.lengths.includes(id)
        ? current.lengths.filter((entry) => entry !== id)
        : [...current.lengths, id]
    }))

  const toggleBand = (id: CurvatureBand) =>
    setFilters((current) => ({
      ...current,
      bands: current.bands.includes(id)
        ? current.bands.filter((entry) => entry !== id)
        : [...current.bands, id]
    }))

  const resetFilters = () =>
    setFilters((current) => ({
      ...DEFAULT_FILTERS,
      sort: anchor ? "nearest" : DEFAULT_FILTERS.sort,
      // keep an explicit non-default sort the rider picked on the "reset filters" path
      ...(current.sort !== DEFAULT_FILTERS.sort && current.sort !== "nearest" ? { sort: current.sort } : {})
    }))

  const resultLabel = describeResult(ranked.length, filters, located)
  // The rail always shows a ride that survives the current filters: the
  // rider's pick while it is visible, otherwise the first ranked ride.
  const railEntry = railLayout
    ? ranked.find((entry) => entry.route.id === selectedId) ?? ranked[0] ?? null
    : null

  return (
    <div className="atlas-browser" ref={browserRef}>
      <div className="atlas-locator" data-status={geoStatus}>
        <div className="atlas-locator-line">
          <LocatorGlyph status={geoStatus} />
          <p className="atlas-locator-copy">{describeLocator(geoStatus, anchor)}</p>
          {geoStatus !== "granted" ? (
            <button
              type="button"
              className="atlas-locate"
              onClick={requestLocation}
              disabled={geoStatus === "locating"}
            >
              {geoStatus === "locating" ? "Locating…" : "Use my location"}
            </button>
          ) : (
            <button type="button" className="atlas-locate is-quiet" onClick={requestLocation}>
              Update location
            </button>
          )}
        </div>
        <label className="atlas-search-field">
          <span className="atlas-visually-hidden">Search routes by name or area</span>
          <SearchGlyph />
          <input
            type="search"
            className="atlas-search-input"
            placeholder="Search by name or area"
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
          />
        </label>
      </div>

      <div className="atlas-controls" role="group" aria-label="Sort and filter the Route Library" ref={controlsRef}>
        <label className="atlas-field">
          <span className="atlas-field-label">Sort</span>
          <select
            className="atlas-select"
            value={filters.sort}
            onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as AtlasSortId }))}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id} disabled={option.needsLocation && !located}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="atlas-filter" disabled={!located}>
          <legend className="atlas-field-label">Within</legend>
          <div className="atlas-chip-row">
            {RADIUS_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="atlas-chip"
                aria-pressed={filters.radius === option.id}
                onClick={() => setFilters((current) => ({ ...current, radius: option.id }))}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="atlas-filter">
          <legend className="atlas-field-label">Ride length</legend>
          <div className="atlas-chip-row">
            {LENGTH_BUCKETS.map((bucket) => (
              <button
                key={bucket.id}
                type="button"
                className="atlas-chip"
                aria-pressed={filters.lengths.includes(bucket.id)}
                onClick={() => toggleLength(bucket.id)}
              >
                {bucket.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="atlas-filter">
          <legend className="atlas-field-label">Corners</legend>
          <div className="atlas-chip-row">
            {CURVATURE_BAND_ORDER.map((band) => (
              <button
                key={band}
                type="button"
                className={`atlas-chip atlas-chip--band band-${band}`}
                aria-pressed={filters.bands.includes(band)}
                onClick={() => toggleBand(band)}
              >
                {BAND_LABEL[band]}
              </button>
            ))}
          </div>
        </fieldset>

        {regions.length > 1 ? (
          <label className="atlas-field">
            <span className="atlas-field-label">Region</span>
            <select
              className="atlas-select"
              value={filters.region ?? ""}
              onChange={(event) =>
                setFilters((current) => ({ ...current, region: event.target.value === "" ? null : event.target.value }))
              }
            >
              <option value="">Every region</option>
              {regions.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </label>
        ) : null}

        {ridingAreas.length > 0 ? (
          <label className="atlas-field">
            <span className="atlas-field-label">Riding area</span>
            <select
              className="atlas-select"
              value={filters.area ?? ""}
              onChange={(event) =>
                setFilters((current) => ({ ...current, area: event.target.value === "" ? null : event.target.value }))
              }
            >
              <option value="">Every riding area</option>
              {ridingAreas.map((area) => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="atlas-result-bar">
        <p className="atlas-result-count">{resultLabel}</p>
        {filtersDirty ? (
          <button type="button" className="atlas-reset" onClick={resetFilters}>Clear filters</button>
        ) : null}
      </div>

      {ranked.length === 0 ? (
        <div className="atlas-noresults" role="status">
          <strong>No rides match those filters.</strong>
          <p>
            {filters.radius !== "any" && outsideRadius > 0
              ? `${outsideRadius} ${outsideRadius === 1 ? "ride sits" : "rides sit"} just outside ${filters.radius} mi. Widen the radius or clear a filter.`
              : "Widen the radius or clear a filter to see more of the collection."}
          </p>
          <button type="button" className="atlas-reset" onClick={resetFilters}>Clear filters</button>
        </div>
      ) : (
        <div className={railEntry ? "atlas-results has-rail" : "atlas-results"}>
          <ul className="atlas-deck">
            {ranked.map((entry, index) => (
              <li key={entry.route.id} className="atlas-deck-item" style={{ "--atlas-stagger": Math.min(index, 14) } as CSSProperties}>
                {railLayout ? (
                  <button
                    type="button"
                    className="atlas-ride-card"
                    aria-pressed={railEntry?.route.id === entry.route.id}
                    aria-controls="atlas-rail"
                    onClick={() => setSelectedId(entry.route.id)}
                  >
                    <RideCardContent entry={entry} />
                  </button>
                ) : (
                  <Link
                    href={`/gpx-library/${entry.route.id}`}
                    className="atlas-ride-card"
                    aria-label={`${entry.route.title} — open route`}
                  >
                    <RideCardContent entry={entry} />
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {railEntry ? <RideRail entry={railEntry} /> : null}
        </div>
      )}

      <p className="atlas-catalog-meta">
        {routeCount} {routeCount === 1 ? "ride" : "rides"} · {formatMiles(totalMiles)} mi in the shared collection
        {updatedLabel ? ` · ${updatedLabel}` : ""}
      </p>
    </div>
  )
}

function areaLabel(route: AtlasBrowseRoute): string | null {
  const parts = [route.region, ...route.ridingAreas].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(" · ") : null
}

function RideStats({ route }: { route: AtlasBrowseRoute }) {
  const duration = formatDuration(route.durationMinutes)
  return (
    <span className="atlas-ride-stats">
      <span className="atlas-ride-stat is-lead">{formatMiles(route.distanceMiles)} mi</span>
      {duration ? <span className="atlas-ride-stat">{duration}</span> : null}
      {route.turnCount > 0 ? (
        <span className="atlas-ride-stat">{formatMiles(route.turnCount)} turns</span>
      ) : null}
      {route.unpavedShare !== null && route.unpavedShare >= 0.05 ? (
        <span className="atlas-ride-stat">{Math.round(route.unpavedShare * 100)}% unpaved</span>
      ) : null}
    </span>
  )
}

/** The real poster path pieces precomputed from the route's own GPS line. */
function RoutePreview({ route }: { route: AtlasBrowseRoute }) {
  if (route.paths.length === 0) return <span className="atlas-minimap-empty">Line not retained</span>
  return (
    <svg viewBox="0 0 100 125" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Shape of ${route.name || "the route"}`}>
      {route.paths.map((d, pathIndex) => (
        <path key={pathIndex} d={d} className="atlas-minimap-line" />
      ))}
      {route.start ? <circle cx={route.start[0]} cy={route.start[1]} r="2.4" className="atlas-minimap-start" /> : null}
      {route.end ? <circle cx={route.end[0]} cy={route.end[1]} r="2.4" className="atlas-minimap-end" /> : null}
    </svg>
  )
}

function RideCardContent({ entry }: { entry: RankedAtlasRoute }) {
  const { route, awayMiles } = entry
  const area = areaLabel(route)
  return (
    <>
      <span className="atlas-minimap">
        <RoutePreview route={route} />
        {awayMiles !== null ? <span className="atlas-away">{formatAway(awayMiles)}</span> : null}
      </span>
      <span className="atlas-ride-body">
        <span className={`atlas-ride-band band-${route.band}`}>{BAND_LABEL[route.band]}</span>
        <strong className="atlas-ride-title">{route.title}</strong>
        <RideStats route={route} />
        {area ? <span className="atlas-ride-region">{area}</span> : null}
      </span>
    </>
  )
}

/**
 * Preview rail for tablet-landscape and wider layouts. Everything here comes
 * from the already-loaded browse row (poster paths, summary stats, filing);
 * full geometry is only fetched if the rider explicitly saves.
 */
function RideRail({ entry }: { entry: RankedAtlasRoute }) {
  const { route, awayMiles } = entry
  const area = areaLabel(route)
  return (
    <aside id="atlas-rail" className="atlas-rail" aria-label="Selected ride">
      <div className="atlas-minimap atlas-rail-preview">
        <RoutePreview route={route} />
      </div>
      <div className="atlas-rail-body">
        <span className={`atlas-ride-band band-${route.band}`}>{BAND_LABEL[route.band]}</span>
        <h2 className="atlas-rail-title">{route.title}</h2>
        <RideStats route={route} />
        {area || awayMiles !== null ? (
          <p className="atlas-rail-area">
            {[area, awayMiles !== null ? formatAway(awayMiles) : null].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        <RouteLibraryActions
          key={route.id}
          catalogRouteId={route.id}
          routeName={route.title}
          canUseGeometry={route.canUseGeometry}
          className="atlas-launch atlas-rail-actions"
        />
        <Link href={`/gpx-library/${route.id}`} className="atlas-launch-secondary">Route details</Link>
      </div>
    </aside>
  )
}

function describeLocator(status: GeoStatus, anchor: NearMeAnchor | null): string {
  switch (status) {
    case "locating":
      return "Finding your location to put the closest rides first…"
    case "granted":
      return anchor
        ? "Sorted by distance from where you are now. Update it if you have moved on."
        : "Location found."
    case "denied":
      return "Location is off, so rides are shown longest first. Turn it on to sort by what is near you."
    case "unavailable":
      return "This device would not share a location. Browse the full collection, or search by name."
    default:
      return "Share your location to bring the rides closest to you to the top."
  }
}

function describeResult(count: number, filters: AtlasFilterState, located: boolean): string {
  if (count === 0) return "No rides match"
  const noun = count === 1 ? "ride" : "rides"
  if (located && filters.radius !== "any") return `${count} ${noun} within ${filters.radius} mi`
  if (filters.query.trim() !== "") return `${count} ${noun} matching “${filters.query.trim()}”`
  return `${count} ${noun}`
}

function LocatorGlyph({ status }: { status: GeoStatus }) {
  if (status === "locating") {
    return (
      <svg className="atlas-locator-glyph is-spinning" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 9 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    )
  }
  const off = status === "denied" || status === "unavailable"
  return (
    <svg className="atlas-locator-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s7-6.03 7-11a7 7 0 0 0-14 0c0 4.97 7 11 7 11Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" fill="currentColor" />
      {off ? <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
    </svg>
  )
}

function SearchGlyph() {
  return (
    <svg className="atlas-search-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
