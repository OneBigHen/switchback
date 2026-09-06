"use client"

import { MagnifyingGlass, Sparkle } from "@phosphor-icons/react"
import { useState } from "react"
import styles from "./RidesSurface.module.css"

export interface RideLibraryGoblinProps {
  query: string
  resultCount: number
  onQueryChange(query: string): void
  onGenerateNew(): void
}

export function RideLibraryGoblin({ query, resultCount, onQueryChange, onGenerateNew }: RideLibraryGoblinProps) {
  const [mode, setMode] = useState<"search" | "generate">("search")

  return (
    <section aria-label="Gravel Goblin route tools">
      <div className={styles.filters}>
        <div className={styles.tabs} role="group" aria-label="Gravel Goblin route mode">
          <button
            type="button"
            aria-pressed={mode === "search"}
            onClick={() => setMode("search")}
          >
            <span>Search saved</span>
          </button>
          <button
            type="button"
            aria-pressed={mode === "generate"}
            aria-label="Generate new"
            onClick={() => setMode("generate")}
          >
            <span>Generate new</span>
          </button>
        </div>

        {mode === "search" ? (
          <label className={styles.search}>
            <MagnifyingGlass aria-hidden="true" />
            <span className="sr-only">Ask Gravel Goblin to search saved rides</span>
            <input
              type="search"
              aria-label="Ask Gravel Goblin to search saved rides"
              value={query}
              placeholder="Try: NE gravel under 60 miles on River Road"
              onChange={(event) => onQueryChange(event.currentTarget.value)}
            />
          </label>
        ) : (
          <button type="button" className={styles.importButton} onClick={onGenerateNew}>
            <Sparkle weight="fill" aria-hidden="true" />
            <span>Open Gravel Goblin planner</span>
          </button>
        )}
      </div>

      <div className={styles.summary} role="status" aria-live="polite">
        {mode === "search" ? (
          <span>
            <strong>{resultCount}</strong> {resultCount === 1 ? "route" : "routes"} match the local Goblin read
          </span>
        ) : (
          <small>Generation uses the existing Switchback planner and routing providers; this library never invents route geometry.</small>
        )}
        {mode === "search" ? <small>Your saved route summaries stay on this device while searching.</small> : null}
      </div>
    </section>
  )
}
