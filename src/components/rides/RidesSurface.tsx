"use client"

import { Crosshair, FileArrowUp } from "@phosphor-icons/react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { RoadLockMode } from "@/lib/roads/road-locks"
import { haversineMiles } from "@/lib/client/geo"
import { useNearMe } from "@/lib/client/near-me"
import { DestinationHeader } from "@/components/v2/DestinationHeader"
import { RouteGraphic } from "@/components/v2/RouteGraphic"
import { ImportFlow } from "./ImportFlow"
import { RideFilters, type RideFilter, type RideFilterCounts } from "./RideFilters"
import { RideListRow } from "./RideListRow"
import styles from "./RidesSurface.module.css"

export type RideLibraryItemKind = "saved-route" | "recorded-ride" | "trip-plan" | "project-gpx"

export interface RideLibraryManagement {
  canDelete?: boolean
  canMatchRoads?: boolean
  imported?: boolean
  folder?: string
  visible?: boolean
}

export interface RideLibraryItem {
  id: string
  sourceId?: string
  kind: RideLibraryItemKind
  name: string
  sourceLabel: string
  distanceMiles: number
  durationMinutes: number
  updatedAt: string | null
  /** Representative `[lon, lat]` for distance-from-me ordering; null when unplaceable. */
  center?: readonly [number, number] | null
  tags: string[]
  management?: RideLibraryManagement
}

export type RideSort = "recent" | "nearest" | "longest" | "shortest"

const SORT_OPTIONS: ReadonlyArray<{ id: RideSort; label: string; needsLocation?: boolean }> = [
  { id: "recent", label: "Recently updated" },
  { id: "nearest", label: "Nearest to me", needsLocation: true },
  { id: "longest", label: "Longest ride" },
  { id: "shortest", label: "Shortest ride" }
]

const PAGE_SIZE = 40

export interface RidesSurfaceProps {
  items: RideLibraryItem[]
  onOpen(item: RideLibraryItem): void
  onImport(file: File): void
  onImportRoads?(file: File, mode: RoadLockMode): void | Promise<void>
  onMatchRoads?(item: RideLibraryItem): void
  onOrganize?(item: RideLibraryItem, organization: { folder?: string; tags?: string[]; visible?: boolean }): void
  onDelete?(item: RideLibraryItem): void
}

export function isImportedRideLibraryItem(item: RideLibraryItem): boolean {
  return item.kind === "project-gpx" || item.management?.imported === true
}

export function itemMatchesRideFilter(item: RideLibraryItem, filter: RideFilter): boolean {
  switch (filter) {
    case "planned": return item.kind === "saved-route" && !isImportedRideLibraryItem(item)
    case "recorded": return item.kind === "recorded-ride"
    case "trips": return item.kind === "trip-plan"
    case "imported": return isImportedRideLibraryItem(item)
    default: return true
  }
}

export function countsForRideFilters(items: RideLibraryItem[]): RideFilterCounts {
  return items.reduce<RideFilterCounts>((counts, item) => {
    counts.all += 1
    if (isImportedRideLibraryItem(item)) counts.imported += 1
    else if (item.kind === "saved-route") counts.planned += 1
    else if (item.kind === "recorded-ride") counts.recorded += 1
    else if (item.kind === "trip-plan") counts.trips += 1
    return counts
  }, { all: 0, planned: 0, recorded: 0, trips: 0, imported: 0 })
}

interface RankedRide {
  item: RideLibraryItem
  awayMiles: number | null
}

function rankRides(items: RideLibraryItem[], sort: RideSort, anchor: { lat: number; lon: number } | null): RankedRide[] {
  const ranked: RankedRide[] = items.map((item) => ({
    item,
    awayMiles: anchor && item.center ? haversineMiles([anchor.lon, anchor.lat], item.center) : null
  }))
  const byName = (a: RankedRide, b: RankedRide) => a.item.name.localeCompare(b.item.name)
  switch (sort) {
    case "nearest":
      return ranked.sort((a, b) =>
        (a.awayMiles ?? Number.POSITIVE_INFINITY) - (b.awayMiles ?? Number.POSITIVE_INFINITY) || byName(a, b))
    case "longest":
      return ranked.sort((a, b) => b.item.distanceMiles - a.item.distanceMiles || byName(a, b))
    case "shortest":
      return ranked.sort((a, b) => a.item.distanceMiles - b.item.distanceMiles || byName(a, b))
    case "recent":
    default:
      return ranked
  }
}

export function RidesSurface({ items, onOpen, onImport, onImportRoads, onMatchRoads, onOrganize, onDelete }: RidesSurfaceProps) {
  const [filter, setFilter] = useState<RideFilter>("all")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<RideSort>("recent")
  const [importOpen, setImportOpen] = useState(false)
  const [shown, setShown] = useState(PAGE_SIZE)
  const { anchor, status: geoStatus, located, requestLocation } = useNearMe()

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const counts = useMemo(() => countsForRideFilters(items), [items])

  const filtered = useMemo(() => items.filter((item) => {
    if (!itemMatchesRideFilter(item, filter)) return false
    if (!normalizedQuery) return true
    return `${item.name} ${item.sourceLabel} ${item.tags.join(" ")}`.toLocaleLowerCase().includes(normalizedQuery)
  }), [filter, items, normalizedQuery])

  const effectiveSort: RideSort = sort === "nearest" && !located ? "recent" : sort
  const ranked = useMemo(() => rankRides(filtered, effectiveSort, anchor), [filtered, effectiveSort, anchor])

  // Reset the page window whenever the result set changes (React's "adjust
  // state during render" pattern — no effect, no cascading renders).
  const windowKey = `${filter}|${normalizedQuery}|${effectiveSort}|${ranked.length}`
  const [prevWindowKey, setPrevWindowKey] = useState(windowKey)
  if (windowKey !== prevWindowKey) {
    setPrevWindowKey(windowKey)
    setShown(PAGE_SIZE)
  }

  const visible = ranked.slice(0, shown)
  const hasMore = shown < ranked.length
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShown((current) => Math.min(current + PAGE_SIZE, ranked.length))
      }
    }, { rootMargin: "600px 0px" })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, ranked.length])

  const nearMeOffered = !located && geoStatus !== "unavailable"

  return (
    <section className={styles.surface} role="region" aria-label="Rides">
      <DestinationHeader
        eyebrow="Your roads"
        title="Rides"
        description="Plans, recordings, trips, and imported tracks — organized around the roads you actually want to ride."
        graphic={<RouteGraphic seed={`rides:${items.map((item) => item.id).join("|") || "empty"}`} variant="library" />}
        actions={(
          <button
            type="button"
            className={styles.importButton}
            aria-expanded={importOpen}
            onClick={() => setImportOpen((open) => !open)}
          >
            <FileArrowUp weight="bold" aria-hidden="true" />
            <span>Import ride</span>
          </button>
        )}
      />

      {importOpen ? <ImportFlow onImportRoute={onImport} onImportRoads={onImportRoads} /> : null}

      <RideFilters
        value={filter}
        query={query}
        counts={counts}
        onChange={setFilter}
        onQueryChange={setQuery}
      />

      <div className={styles.sortBar}>
        <label className={styles.sortField}>
          <span>Sort</span>
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(event) => setSort(event.currentTarget.value as RideSort)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id} disabled={option.needsLocation && !located}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {nearMeOffered ? (
          <button
            type="button"
            className={styles.nearMeButton}
            onClick={requestLocation}
            disabled={geoStatus === "locating"}
          >
            <Crosshair weight="bold" aria-hidden="true" />
            <span>{geoStatus === "locating" ? "Locating…" : "Sort by what's near me"}</span>
          </button>
        ) : located && sort === "nearest" ? (
          <button type="button" className={`${styles.nearMeButton} ${styles.nearMeQuiet}`} onClick={requestLocation}>
            <Crosshair weight="bold" aria-hidden="true" />
            <span>Update my location</span>
          </button>
        ) : null}
      </div>

      <div className={styles.summary} role="status" aria-live="polite">
        <span>
          <strong>{ranked.length}</strong> {ranked.length === 1 ? "ride" : "rides"} in view
          {located && effectiveSort === "nearest" ? " · nearest first" : ""}
        </span>
        {ranked.length !== items.length ? <small>{items.length} total in your library</small> : <small>Ready offline on this device when saved locally.</small>}
      </div>

      {visible.length > 0 ? (
        <>
          <div className={styles.list} aria-label="Ride list">
            {visible.map(({ item, awayMiles }) => (
              <RideListRow
                key={item.id}
                item={item}
                distanceAwayMiles={awayMiles ?? undefined}
                onOpen={onOpen}
                onMatchRoads={onMatchRoads}
                onOrganize={onOrganize}
                onDelete={onDelete}
              />
            ))}
          </div>
          {hasMore ? (
            <div ref={sentinelRef} className={styles.showMore}>
              <button type="button" onClick={() => setShown((current) => Math.min(current + PAGE_SIZE, ranked.length))}>
                Show {Math.min(PAGE_SIZE, ranked.length - shown)} more
              </button>
              <small>{shown} of {ranked.length} shown</small>
            </div>
          ) : null}
        </>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <RouteGraphic seed={`empty:${filter}:${normalizedQuery}`} variant="library" />
          <strong>No rides yet.</strong>
          <span>Import a GPX or save a planned route to start your library.</span>
          <button type="button" className={styles.importButton} onClick={() => setImportOpen(true)}>
            <FileArrowUp weight="bold" aria-hidden="true" />
            <span>Import your first ride</span>
          </button>
        </div>
      ) : (
        <div className={styles.empty}>
          <RouteGraphic seed={`empty:${filter}:${normalizedQuery}`} variant="library" />
          <strong>No rides match this view.</strong>
          <span>Try another type or clear the search.</span>
          <button
            type="button"
            onClick={() => {
              setQuery("")
              setFilter("all")
            }}
          >
            Clear search & filters
          </button>
        </div>
      )}
    </section>
  )
}
