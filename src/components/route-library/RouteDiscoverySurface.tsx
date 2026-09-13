"use client"

import { MagnifyingGlass, SlidersHorizontal } from "@phosphor-icons/react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  CURVATURE_BAND_ORDER,
  DEFAULT_FILTERS,
  formatMiles,
  LENGTH_BUCKETS,
  type AtlasBrowseRoute,
  type AtlasFilterState,
  type AtlasLengthBucket,
  type AtlasRadiusId,
  type AtlasSortId
} from "@/app/gpx-library/atlas-browse"
import { useNearMe } from "@/lib/client/near-me"
import type { CurvatureBand } from "@/lib/gpx/atlas-art"
import { RouteDiscoveryCard } from "./RouteDiscoveryCard"
import { RouteLibraryMap } from "./RouteLibraryMap"
import {
  describeDiscoveryResult,
  INITIAL_CAMERA,
  NO_QUICK_CHIPS,
  quickChipAvailability,
  recenterDiscoveryMap,
  reconcileSelection,
  riderMovedDiscoveryMap,
  runDiscoveryQuery,
  selectDiscoveryRoute,
  toggleQuickChip,
  type DiscoveryQuickState,
  type DiscoveryView,
  type QuickChipId
} from "./route-discovery-state"
import { useSavedCatalogRoutes } from "./use-saved-catalog-routes"
import styles from "./RouteDiscoverySurface.module.css"

const BAND_LABEL: Record<CurvatureBand, string> = {
  calm: "Calm",
  mellow: "Mellow",
  twisty: "Twisty",
  hairpin: "Hairpin"
}

const RADIUS_OPTIONS: ReadonlyArray<{ id: AtlasRadiusId; label: string }> = [
  { id: "25", label: "25 mi" },
  { id: "100", label: "100 mi" },
  { id: "250", label: "250 mi" },
  { id: "any", label: "Any distance" }
]

const SORT_OPTIONS: ReadonlyArray<{ id: AtlasSortId; label: string; needsLocation?: boolean }> = [
  { id: "nearest", label: "Nearest to me", needsLocation: true },
  { id: "longest", label: "Longest ride" },
  { id: "shortest", label: "Shortest ride" },
  { id: "twistiest", label: "Most corners" }
]

const CHIP_LABEL: Record<QuickChipId, string> = {
  nearby: "Nearby",
  gravel: "Gravel",
  twisty: "Twisty",
  "duration-2-4": "2–4 hr",
  filters: "Filters"
}

export interface RouteDiscoverySurfaceProps {
  routes: readonly AtlasBrowseRoute[]
  regions: readonly string[]
  ridingAreas: readonly string[]
  /** Whole-catalog totals for the header summary. */
  routeCount: number
  totalMiles: number
  updatedLabel?: string | null
  title: string
  searchPlaceholder: string
  defaultView: DiscoveryView
  quickChips: readonly QuickChipId[]
  /** Show `157 routes · 13,000+ miles` under the title. */
  showCatalogSummary?: boolean
  /** Extra chrome (breadcrumbs, links) rendered above the title. */
  contextSlot?: React.ReactNode
  className?: string
}

/**
 * Route discovery: one query, two presentations.
 *
 * Map and List share the search text, the quick chips, the detailed filters
 * and the ranked result; only the camera and the highlighted route belong to
 * the map. Switching presentation therefore never re-asks the catalog anything
 * and never shows a different set of routes.
 */
export function RouteDiscoverySurface({
  routes,
  regions,
  ridingAreas,
  routeCount,
  totalMiles,
  updatedLabel = null,
  title,
  searchPlaceholder,
  defaultView,
  quickChips,
  showCatalogSummary = false,
  contextSlot,
  className
}: RouteDiscoverySurfaceProps) {
  const [view, setView] = useState<DiscoveryView>(defaultView)
  const [filters, setFilters] = useState<AtlasFilterState>(DEFAULT_FILTERS)
  const [quick, setQuick] = useState<DiscoveryQuickState>(NO_QUICK_CHIPS)
  const [camera, setCamera] = useState(INITIAL_CAMERA)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const { anchor, status: geoStatus, located, requestLocation } = useNearMe()
  const saved = useSavedCatalogRoutes()
  const railRef = useRef<HTMLUListElement>(null)
  const autoSortDone = useRef(false)

  // First fix while the rider has not chosen a sort: prefer what is near them.
  useEffect(() => {
    if (!anchor || autoSortDone.current) return
    autoSortDone.current = true
    queueMicrotask(() =>
      setFilters((current) => (current.sort === DEFAULT_FILTERS.sort ? { ...current, sort: "nearest" } : current))
    )
  }, [anchor])

  const { ranked, outsideRadius, removedByChips } = useMemo(
    () => runDiscoveryQuery(routes, filters, quick, anchor),
    [anchor, filters, quick, routes]
  )

  // A selection that filtered away must not leave the map and the rail
  // disagreeing. Reconciled during render so the stale highlight never paints.
  const reconciled = reconcileSelection(camera, ranked)
  if (reconciled !== camera) setCamera(reconciled)

  const selectedId = reconciled.selectedId
  const selectedIndex = ranked.findIndex((entry) => entry.route.id === selectedId)

  // Selecting on the map scrolls the rail to the matching card, which is the
  // other half of "map and card selection stay synchronised".
  useEffect(() => {
    if (view !== "map" || selectedIndex < 0) return
    const rail = railRef.current
    const card = rail?.children[selectedIndex] as HTMLElement | undefined
    if (typeof card?.scrollIntoView !== "function") return
    card.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
      inline: "center"
    })
  }, [selectedIndex, view])

  const select = (routeId: string) => setCamera((current) => selectDiscoveryRoute(current, routeId))

  const filtersDirty =
    filters.sort !== DEFAULT_FILTERS.sort
    || filters.radius !== DEFAULT_FILTERS.radius
    || filters.lengths.length > 0
    || filters.bands.length > 0
    || filters.region !== null
    || filters.area !== null
    || filters.query.trim() !== ""
    || quick.chips.length > 0

  const resetAll = () => {
    setQuick(NO_QUICK_CHIPS)
    setFilters({ ...DEFAULT_FILTERS, sort: anchor ? "nearest" : DEFAULT_FILTERS.sort })
  }

  const toggleChip = (chip: QuickChipId) => {
    if (chip === "filters") {
      setFiltersOpen((open) => !open)
      return
    }
    if (chip === "nearby" && !located) {
      requestLocation()
      return
    }
    setQuick((current) => toggleQuickChip(current, chip))
  }

  return (
    <div className={[styles.surface, className].filter(Boolean).join(" ")} data-discovery-view={view}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          <div className={styles.viewToggle} role="group" aria-label="Presentation">
            <button
              type="button"
              aria-pressed={view === "map"}
              className={view === "map" ? styles.viewOn : undefined}
              onClick={() => setView("map")}
            >
              Map
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              className={view === "list" ? styles.viewOn : undefined}
              onClick={() => setView("list")}
            >
              List
            </button>
          </div>
        </div>

        {showCatalogSummary ? (
          <p className={styles.summary}>
            {routeCount} {routeCount === 1 ? "route" : "routes"} · {formatMiles(totalMiles)} miles
            {updatedLabel ? ` · ${updatedLabel}` : ""}
          </p>
        ) : null}

        <div className={styles.searchField}>
          <MagnifyingGlass aria-hidden="true" />
          <label className={styles.visuallyHidden} htmlFor="route-discovery-search">{searchPlaceholder}</label>
          <input
            id="route-discovery-search"
            type="search"
            placeholder={searchPlaceholder}
            value={filters.query}
            autoComplete="off"
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
          />
        </div>

        <div className={styles.chipRow} role="group" aria-label="Quick filters">
          {quickChips.map((chip) => {
            if (chip === "filters") {
              return (
                <button
                  key={chip}
                  type="button"
                  className={styles.chip}
                  aria-pressed={filtersOpen}
                  aria-expanded={filtersOpen}
                  aria-controls="route-discovery-filters"
                  onClick={() => toggleChip(chip)}
                >
                  <SlidersHorizontal aria-hidden="true" />
                  {CHIP_LABEL[chip]}
                </button>
              )
            }
            const availability = quickChipAvailability(chip, routes, located)
            const pressed = quick.chips.includes(chip)
            // A chip nothing can satisfy is disabled with its reason rather
            // than silently returning an empty list.
            const blocked = !availability.enabled && !(chip === "nearby" && !located)
            return (
              <button
                key={chip}
                type="button"
                className={styles.chip}
                aria-pressed={pressed}
                disabled={blocked}
                title={availability.reason ?? undefined}
                onClick={() => toggleChip(chip)}
              >
                {CHIP_LABEL[chip]}
              </button>
            )
          })}
          {contextSlot}
        </div>

        {filtersOpen ? (
          <section id="route-discovery-filters" className={styles.filters} aria-label="All filters">
            <FilterGroup label="Sort">
              <select
                aria-label="Sort routes"
                className={styles.select}
                value={filters.sort}
                onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as AtlasSortId }))}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id} disabled={option.needsLocation && !located}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FilterGroup>

            <FilterGroup label="Within">
              <div className={styles.filterChips}>
                {RADIUS_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={styles.filterChip}
                    aria-pressed={filters.radius === option.id}
                    disabled={!located}
                    onClick={() => setFilters((current) => ({ ...current, radius: option.id }))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup label="Duration">
              <div className={styles.filterChips}>
                {LENGTH_BUCKETS.map((bucket) => (
                  <button
                    key={bucket.id}
                    type="button"
                    className={styles.filterChip}
                    aria-pressed={filters.lengths.includes(bucket.id)}
                    onClick={() => setFilters((current) => ({
                      ...current,
                      lengths: toggleValue(current.lengths, bucket.id)
                    }))}
                  >
                    {bucket.label}
                  </button>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup label="Difficulty">
              <div className={styles.filterChips}>
                {CURVATURE_BAND_ORDER.map((band) => (
                  <button
                    key={band}
                    type="button"
                    className={`${styles.filterChip} band-${band}`}
                    aria-pressed={filters.bands.includes(band)}
                    onClick={() => setFilters((current) => ({
                      ...current,
                      bands: toggleValue(current.bands, band)
                    }))}
                  >
                    {BAND_LABEL[band]}
                  </button>
                ))}
              </div>
            </FilterGroup>

            {regions.length > 1 ? (
              <FilterGroup label="Region">
                <select
                  aria-label="Region"
                  className={styles.select}
                  value={filters.region ?? ""}
                  onChange={(event) => setFilters((current) => ({
                    ...current,
                    region: event.target.value === "" ? null : event.target.value
                  }))}
                >
                  <option value="">Every region</option>
                  {regions.map((region) => <option key={region} value={region}>{region}</option>)}
                </select>
              </FilterGroup>
            ) : null}

            {ridingAreas.length > 0 ? (
              <FilterGroup label="Riding area">
                <select
                  aria-label="Riding area"
                  className={styles.select}
                  value={filters.area ?? ""}
                  onChange={(event) => setFilters((current) => ({
                    ...current,
                    area: event.target.value === "" ? null : event.target.value
                  }))}
                >
                  <option value="">Every riding area</option>
                  {ridingAreas.map((area) => <option key={area} value={area}>{area}</option>)}
                </select>
              </FilterGroup>
            ) : null}
          </section>
        ) : null}

        <p className={styles.resultBar} data-compact={view === "map" ? "true" : "false"}>
          <span aria-live="polite">{describeDiscoveryResult(ranked.length, filters, quick, located)}</span>
          {filtersDirty ? (
            <button type="button" className={styles.reset} onClick={resetAll}>Clear</button>
          ) : null}
        </p>
      </header>

      {ranked.length === 0 ? (
        <div className={styles.empty} role="status">
          <strong>No routes match those filters.</strong>
          <p>
            {removedByChips > 0
              ? `${removedByChips} ${removedByChips === 1 ? "route was" : "routes were"} set aside by the quick filters.`
              : filters.radius !== "any" && outsideRadius > 0
                ? `${outsideRadius} ${outsideRadius === 1 ? "route sits" : "routes sit"} just outside ${filters.radius} mi.`
                : "Widen the radius or clear a filter to see more of the collection."}
          </p>
          <button type="button" className={styles.reset} onClick={resetAll}>Clear filters</button>
        </div>
      ) : view === "map" ? (
        <div className={styles.mapMode}>
          <div className={styles.mapPane}>
            <RouteLibraryMap
              routes={ranked.map((entry) => entry.route)}
              selectedId={selectedId}
              fitToken={reconciled.fitToken}
              riderMovedMap={reconciled.riderMovedMap}
              onSelect={select}
              onRiderMovedMap={() => setCamera(riderMovedDiscoveryMap)}
              onRecenter={() => setCamera(recenterDiscoveryMap)}
              onLocate={geoStatus === "granted" ? undefined : requestLocation}
              locating={geoStatus === "locating"}
            />
          </div>
          <ul ref={railRef} className={styles.rail} aria-label="Routes on the map">
            {ranked.map((entry) => (
              <li key={entry.route.id} className={styles.railItem}>
                <RouteDiscoveryCard
                  route={entry.route}
                  awayMiles={entry.awayMiles}
                  variant="rail"
                  selected={entry.route.id === selectedId}
                  saved={saved.ids.has(entry.route.id)}
                  onSelect={select}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className={styles.list} aria-label="Routes">
          {ranked.map((entry) => (
            <li key={entry.route.id}>
              <RouteDiscoveryCard
                route={entry.route}
                awayMiles={entry.awayMiles}
                variant="list"
                saved={saved.ids.has(entry.route.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.filterGroup} role="group" aria-label={label}>
      <span className={styles.filterLabel}>{label}</span>
      {children}
    </div>
  )
}

function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
}

export type { AtlasLengthBucket }
