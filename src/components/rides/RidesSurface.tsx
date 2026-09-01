"use client"

import { FileArrowUp } from "@phosphor-icons/react"
import { useMemo, useState } from "react"
import type { RoadLockMode } from "@/lib/roads/road-locks"
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
  tags: string[]
  management?: RideLibraryManagement
}

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

export function RidesSurface({ items, onOpen, onImport, onImportRoads, onMatchRoads, onOrganize, onDelete }: RidesSurfaceProps) {
  const [filter, setFilter] = useState<RideFilter>("all")
  const [query, setQuery] = useState("")
  const [importOpen, setImportOpen] = useState(false)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const counts = useMemo(() => countsForRideFilters(items), [items])
  const visibleItems = useMemo(() => items.filter((item) => {
    if (!itemMatchesRideFilter(item, filter)) return false
    if (!normalizedQuery) return true
    return `${item.name} ${item.sourceLabel} ${item.tags.join(" ")}`.toLocaleLowerCase().includes(normalizedQuery)
  }), [filter, items, normalizedQuery])

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

      <div className={styles.summary} role="status" aria-live="polite">
        <span><strong>{visibleItems.length}</strong> {visibleItems.length === 1 ? "ride" : "rides"} in view</span>
        {visibleItems.length !== items.length ? <small>{items.length} total in your library</small> : <small>Ready offline on this device when saved locally.</small>}
      </div>

      {visibleItems.length > 0 ? (
        <div className={styles.list} aria-label="Ride list">
          {visibleItems.map((item) => (
            <RideListRow
              key={item.id}
              item={item}
              onOpen={onOpen}
              onMatchRoads={onMatchRoads}
              onOrganize={onOrganize}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <RouteGraphic seed={`empty:${filter}:${normalizedQuery}`} variant="library" />
          <strong>No rides match this view.</strong>
          <span>Try another type or clear the search.</span>
        </div>
      )}
    </section>
  )
}
