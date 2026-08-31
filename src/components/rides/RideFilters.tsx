"use client"

import { MagnifyingGlass } from "@phosphor-icons/react"
import styles from "./RidesSurface.module.css"

export type RideFilter = "all" | "planned" | "recorded" | "trips" | "imported"

export type RideFilterCounts = Record<RideFilter, number>

const FILTERS: ReadonlyArray<{ id: RideFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "planned", label: "Planned" },
  { id: "recorded", label: "Recorded" },
  { id: "trips", label: "Trips" },
  { id: "imported", label: "Imported" }
]

export interface RideFiltersProps {
  value: RideFilter
  query: string
  counts: RideFilterCounts
  onChange(value: RideFilter): void
  onQueryChange(query: string): void
}

export function RideFilters({ value, query, counts, onChange, onQueryChange }: RideFiltersProps) {
  return (
    <div className={styles.filters}>
      <label className={styles.search}>
        <MagnifyingGlass aria-hidden="true" />
        <span className="sr-only">Search rides</span>
        <input
          type="search"
          aria-label="Search rides"
          value={query}
          placeholder="Search rides, folders, tags, or sources"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
      </label>
      <div className={styles.tabs} role="tablist" aria-label="Ride types">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            role="tab"
            aria-selected={filter.id === value}
            aria-label={`${filter.label} ${counts[filter.id]}`}
            onClick={() => onChange(filter.id)}
          >
            <span>{filter.label}</span>
            <b aria-hidden="true">{counts[filter.id]}</b>
          </button>
        ))}
      </div>
    </div>
  )
}
