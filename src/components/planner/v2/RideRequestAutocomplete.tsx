"use client"

import { MapPin } from "@phosphor-icons/react"
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { searchPlacesClient } from "@/lib/client/geocoding-client"
import type { GeocoderBias, PlaceResult } from "@/lib/geocoding/photon"
import {
  completeRidePromptWithPlace,
  ridePromptPlaceQuery
} from "@/lib/planner/ride-request-autocomplete"
import type { PlanMode } from "../PlannerDeckViewModel"
import styles from "./RideRequestAutocomplete.module.css"

export interface RideRequestAutocompleteProps {
  id: string
  name: string
  planMode: PlanMode
  value: string
  placeholder: string
  disabled: boolean
  /** Reserved for contextual discovery. Explicit typed place searches are
   * intentionally un-biased so "Austin" cannot become a nearer namesake. */
  bias?: GeocoderBias
  onChange(value: string): void
}

export function RideRequestAutocomplete({
  id,
  name,
  planMode,
  value,
  placeholder,
  disabled,
  onChange
}: RideRequestAutocompleteProps) {
  const generatedId = useId().replace(/:/g, "")
  const listId = `${id}-${generatedId}-places`
  const rootRef = useRef<HTMLDivElement | null>(null)
  const suppressSearchForValue = useRef<string | null>(null)
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [dismissed, setDismissed] = useState(false)
  const [searching, setSearching] = useState(false)

  const searchQuery = ridePromptPlaceQuery(value)
  const open = !dismissed && suggestions.length > 0

  useEffect(() => {
    if (disabled || !searchQuery) {
      setSuggestions([])
      setActiveIndex(-1)
      setSearching(false)
      return
    }
    if (suppressSearchForValue.current === value) {
      suppressSearchForValue.current = null
      setSuggestions([])
      setActiveIndex(-1)
      setSearching(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setSearching(true)
      // Explicit text is global truth. Do not send the current ride location as
      // a geocoder bias or "Austin" can be pulled toward a local namesake.
      void searchPlacesClient(searchQuery, fetch, controller.signal)
        .then((places) => {
          if (controller.signal.aborted) return
          setSuggestions(places.slice(0, 5))
          setActiveIndex(-1)
        })
        .catch(() => {
          if (!controller.signal.aborted) setSuggestions([])
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false)
        })
    }, 220)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [disabled, searchQuery, value])

  const choose = (place: PlaceResult) => {
    const completed = completeRidePromptWithPlace(value, place.label, planMode)
    suppressSearchForValue.current = completed
    setSuggestions([])
    setActiveIndex(-1)
    setDismissed(true)
    onChange(completed)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && open) {
      event.preventDefault()
      setDismissed(true)
      setSuggestions([])
      setActiveIndex(-1)
      return
    }
    if (!open) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1))
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) => index <= 0 ? suggestions.length - 1 : index - 1)
      return
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault()
      const selected = suggestions[activeIndex]
      if (selected) choose(selected)
    }
  }

  return (
    <div
      ref={rootRef}
      className={styles.root}
      onBlur={() => {
        window.setTimeout(() => {
          if (!rootRef.current?.contains(document.activeElement)) {
            setDismissed(true)
            setSuggestions([])
            setActiveIndex(-1)
          }
        }, 0)
      }}
    >
      <input
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-label="Ride request"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-busy={searching}
        disabled={disabled}
        onChange={(event) => {
          setDismissed(false)
          onChange(event.target.value)
        }}
        onFocus={() => {
          if (suggestions.length > 0) setDismissed(false)
        }}
        onKeyDown={onKeyDown}
      />

      {open ? (
        <div className={styles.suggestions} id={listId} role="listbox" aria-label="Place suggestions">
          {suggestions.map((place, index) => (
            <button
              key={place.id}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-label={place.label}
              aria-selected={activeIndex === index}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(place)}
            >
              <MapPin weight="fill" aria-hidden="true" />
              <span>
                <strong>{place.name}</strong>
                <small>{[place.region, place.country].filter(Boolean).join(" · ")}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
