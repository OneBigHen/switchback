"use client"

import { MagnifyingGlass } from "@phosphor-icons/react"
import styles from "./RidesSurface.module.css"

export type RideFilter = "all" | "planned" | "recorded" | "trips" | "imported"

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
  onChange(value: RideFilter): void
  onQueryChange(query: string): void
}

export function RideFilters({ value, query, onChange, onQueryChange }: RideFiltersProps) {
  return (
    <div className={styles.filters}>
      <label className={styles.search}>
        <MagnifyingGlass aria-hidden="true" />
        <span className="sr-only">Search rides</span>
        <input
          type="search"
          aria-label="Search rides"
          value={query}
          placeholder="Search rides"
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
            onClick={() => onChange(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  )
}
