"use client"

import { FileArrowUp } from "@phosphor-icons/react"
import { useMemo, useState } from "react"
import type { RoadLockMode } from "@/lib/roads/road-locks"
import { ImportFlow } from "./ImportFlow"
import { RideFilters, type RideFilter } from "./RideFilters"
import { RideListRow } from "./RideListRow"
import styles from "./RidesSurface.module.css"

export type RideLibraryItemKind = "saved-route" | "recorded-ride" | "trip-plan" | "project-gpx"

export interface RideLibraryManagement {
  canDelete?: boolean
  canMatchRoads?: boolean
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

function itemMatchesFilter(item: RideLibraryItem, filter: RideFilter): boolean {
  switch (filter) {
    case "planned": return item.kind === "saved-route"
    case "recorded": return item.kind === "recorded-ride"
    case "trips": return item.kind === "trip-plan"
    case "imported": return item.kind === "project-gpx"
    default: return true
  }
}

export function RidesSurface({ items, onOpen, onImport, onImportRoads, onMatchRoads, onOrganize, onDelete }: RidesSurfaceProps) {
  const [filter, setFilter] = useState<RideFilter>("all")
  const [query, setQuery] = useState("")
  const [importOpen, setImportOpen] = useState(false)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleItems = useMemo(() => items.filter((item) => {
    if (!itemMatchesFilter(item, filter)) return false
    if (!normalizedQuery) return true
    return `${item.name} ${item.sourceLabel} ${item.tags.join(" ")}`.toLocaleLowerCase().includes(normalizedQuery)
  }), [filter, items, normalizedQuery])

  return (
    <section className={styles.surface} role="region" aria-label="Rides">
      <header className={styles.header}>
        <div>
          <span>Your roads</span>
          <h1>Rides</h1>
          <p>Plans, recordings, trips, and imported routes in one place.</p>
        </div>
        <button type="button" className={styles.importButton} aria-expanded={importOpen} onClick={() => setImportOpen((open) => !open)}>
          <FileArrowUp weight="bold" aria-hidden="true" />
          <span>Import ride</span>
        </button>
      </header>

      {importOpen ? <ImportFlow onImportRoute={onImport} onImportRoads={onImportRoads} /> : null}

      <RideFilters value={filter} query={query} onChange={setFilter} onQueryChange={setQuery} />

      <div className={styles.summary} role="status">
        <strong>{visibleItems.length}</strong>
        <span>{visibleItems.length === 1 ? "ride" : "rides"}</span>
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
          <strong>No rides match this view.</strong>
          <span>Try another type or clear the search.</span>
        </div>
      )}
    </section>
  )
}
