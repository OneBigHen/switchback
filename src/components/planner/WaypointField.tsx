"use client"

import { MapPinLine, SpinnerGap } from "@phosphor-icons/react"
import { useEffect, useId, useState } from "react"
import { searchPlacesClient } from "@/lib/client/geocoding-client"
import type { PlaceResult } from "@/lib/geocoding/photon"
import type { Waypoint } from "@/lib/routing/types"
import type { PlannerPointId } from "@/stores/planner-store"

interface WaypointFieldProps {
  id: PlannerPointId
  label: string
  point: Waypoint | null
  query: string
  armed: boolean
  onSelect(point: Waypoint): void
  onQueryChange(query: string): void
  onArm(): void
}

export function WaypointField({
  id,
  label,
  point,
  query,
  armed,
  onSelect,
  onQueryChange,
  onArm
}: WaypointFieldProps) {
  const listboxId = useId()
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState("")
  const errorId = `${listboxId}-error`
  const searchEligible = query.trim().length >= 2 && query.trim() !== point?.label
  const visibleSuggestions = searchEligible ? suggestions : []
  const visibleSearchError = searchEligible ? searchError : ""
  const visiblySearching = searchEligible && searching

  useEffect(() => {
    if (!searchEligible) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearching(true)
      setSearchError("")
      try {
        const results = await searchPlacesClient(query, fetch, controller.signal)
        setSuggestions(results)
        setActiveIndex(results.length > 0 ? 0 : -1)
      } catch (error) {
        if (!controller.signal.aborted) {
          setSuggestions([])
          setActiveIndex(-1)
          setSearchError(error instanceof Error ? error.message : "Place search failed.")
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 260)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [point?.label, query, searchEligible])

  const chooseSuggestion = (place: PlaceResult) => {
    onSelect({ lat: place.lat, lon: place.lon, label: place.label })
    setSuggestions([])
    setActiveIndex(-1)
  }

  const activeOptionId = activeIndex >= 0 && visibleSuggestions[activeIndex]
    ? `${listboxId}-option-${activeIndex}`
    : undefined

  return (
    <div className={`waypoint-field${armed ? " is-armed" : ""}`}>
      <span className={`waypoint-node waypoint-node-${id}`} aria-hidden="true">
        {id === "start" ? "S" : "F"}
      </span>
      <label htmlFor={`waypoint-${id}`}>
        <span>{label}</span>
        <input
          id={`waypoint-${id}`}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={visibleSuggestions.length > 0}
          aria-activedescendant={activeOptionId}
          aria-busy={visiblySearching}
          aria-describedby={visibleSearchError ? errorId : undefined}
          aria-errormessage={visibleSearchError ? errorId : undefined}
          aria-invalid={visibleSearchError ? true : undefined}
          autoComplete="off"
          value={query}
          placeholder={id === "start" ? "Where from?" : "Where to?"}
          onChange={(event) => {
            const value = event.target.value
            onQueryChange(value)
            setSuggestions([])
            setActiveIndex(-1)
            setSearchError("")
            if (value.trim().length < 2) {
              setSearching(false)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && visibleSuggestions.length > 0) {
              event.preventDefault()
              setActiveIndex((current) => current < 0 ? 0 : (current + 1) % visibleSuggestions.length)
            }
            if (event.key === "ArrowUp" && visibleSuggestions.length > 0) {
              event.preventDefault()
              setActiveIndex((current) => current <= 0 ? visibleSuggestions.length - 1 : current - 1)
            }
            if (event.key === "Enter" && activeIndex >= 0 && visibleSuggestions[activeIndex]) {
              event.preventDefault()
              chooseSuggestion(visibleSuggestions[activeIndex])
            }
            if (event.key === "Escape") {
              setSuggestions([])
              setActiveIndex(-1)
            }
          }}
        />
      </label>
      <button
        type="button"
        className="map-pick-button"
        aria-label={`${armed ? "Cancel" : "Set"} ${label.toLowerCase()} on map`}
        aria-pressed={armed}
        onClick={onArm}
      >
        {visiblySearching ? <SpinnerGap className="spin" aria-hidden="true" /> : <MapPinLine aria-hidden="true" />}
      </button>

      {visibleSuggestions.length > 0 ? (
        <ul className="place-suggestions" id={listboxId} role="listbox" aria-label={`${label} suggestions`}>
          {visibleSuggestions.map((place, index) => (
            <li key={place.id} role="none">
              <button
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={activeIndex === index}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseSuggestion(place)}
              >
                <strong>{place.name}</strong>
                <span>{[place.region, place.country].filter(Boolean).join(", ")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {visibleSearchError ? (
        <span className="field-error" id={errorId} role="status">{visibleSearchError}</span>
      ) : null}
    </div>
  )
}
