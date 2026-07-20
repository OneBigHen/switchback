"use client"

import { Check } from "@phosphor-icons/react"
import {
  OFFLINE_DOWNLOAD_LEVELS,
  SAVED_RIDE_CORRIDOR_DEFAULT_MILES,
  corridorMilesToHalfWidthMeters,
  getDownloadLevelOption,
  type OfflineDownloadLevel
} from "@/lib/offline/download-mode"

const RECOMMENDED_LEVEL: OfflineDownloadLevel = "saved-ride-corridor"

const CORRIDOR_TRIP_STYLES = [
  { id: "street", label: "Street", miles: SAVED_RIDE_CORRIDOR_DEFAULT_MILES.street },
  { id: "adventure", label: "Adventure", miles: SAVED_RIDE_CORRIDOR_DEFAULT_MILES.adventure },
  { id: "multiday", label: "Multi-day", miles: SAVED_RIDE_CORRIDOR_DEFAULT_MILES.multiday }
] as const

export type CorridorTripStyle = (typeof CORRIDOR_TRIP_STYLES)[number]["id"]

export interface DownloadModePickerValue {
  level: OfflineDownloadLevel
  corridorMiles: number
}

export interface DownloadModePickerProps {
  value: DownloadModePickerValue
  onChange(next: DownloadModePickerValue): void
  id?: string
}

export function DownloadModePicker({ value, onChange, id }: DownloadModePickerProps) {
  const handleLevelChange = (nextLevel: OfflineDownloadLevel) => {
    if (nextLevel === value.level) return
    if (nextLevel === "saved-ride-corridor") {
      onChange({ level: nextLevel, corridorMiles: SAVED_RIDE_CORRIDOR_DEFAULT_MILES.street })
      return
    }
    onChange({ level: nextLevel, corridorMiles: 0 })
  }

  const handleTripStyleChange = (tripStyle: (typeof CORRIDOR_TRIP_STYLES)[number]) => {
    onChange({ level: "saved-ride-corridor", corridorMiles: tripStyle.miles })
  }

  const halfWidthMeters = corridorMilesToHalfWidthMeters(value.corridorMiles || SAVED_RIDE_CORRIDOR_DEFAULT_MILES.street)

  return (
    <div className="download-mode-picker" id={id} role="group" aria-label="Offline download mode">
      <span className="download-mode-picker-label">Download scope</span>
      <ul className="download-mode-list" role="radiogroup" aria-label="Download scope">
        {OFFLINE_DOWNLOAD_LEVELS.map((option) => {
          const selected = value.level === option.level
          const recommended = option.level === RECOMMENDED_LEVEL
          return (
            <li key={option.level}>
              <label
                className="download-mode-option"
                data-selected={selected ? "true" : "false"}
                htmlFor={`download-mode-${option.level}`}
              >
                <input
                  id={`download-mode-${option.level}`}
                  type="radio"
                  name="download-mode"
                  className="download-mode-option-input"
                  checked={selected}
                  role="radio"
                  aria-checked={selected}
                  onChange={() => handleLevelChange(option.level)}
                  value={option.level}
                />
                <span className="download-mode-option-mark" aria-hidden="true">
                  <Check weight="bold" />
                </span>
                <span className="download-mode-option-text">
                  <span className="download-mode-option-title" data-recommended={recommended ? "true" : "false"}>
                    {option.label}
                  </span>
                  <span className="download-mode-option-description">{option.description}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {value.level === "saved-ride-corridor" && (
        <div className="download-mode-corridor" role="radiogroup" aria-label="Corridor width">
          <span className="download-mode-corridor-label">Corridor width</span>
          <div className="download-mode-corridor-options">
            {CORRIDOR_TRIP_STYLES.map((tripStyle) => {
              const selected = value.corridorMiles === tripStyle.miles
              return (
                <label
                  key={tripStyle.id}
                  className="download-mode-corridor-option"
                  data-selected={selected ? "true" : "false"}
                  htmlFor={`download-mode-corridor-${tripStyle.id}`}
                >
                  <input
                    id={`download-mode-corridor-${tripStyle.id}`}
                    type="radio"
                    name="download-mode-corridor"
                    className="download-mode-corridor-option-input"
                    checked={selected}
                    role="radio"
                    aria-checked={selected}
                    onChange={() => handleTripStyleChange(tripStyle)}
                    value={tripStyle.id}
                  />
                  <span className="download-mode-corridor-option-miles">{tripStyle.miles}</span>
                  <span className="download-mode-corridor-option-tag">{tripStyle.label}</span>
                </label>
              )
            })}
          </div>
          <p className="download-mode-corridor-hint">
            Half-width: <strong>{halfWidthMeters.toLocaleString()} m</strong> per side of the route. Defaults to Street (10 mi) before pressing Start Ride.
          </p>
        </div>
      )}
    </div>
  )
}

export const DOWNLOAD_MODE_PICKER_DEFAULT: DownloadModePickerValue = {
  level: RECOMMENDED_LEVEL,
  corridorMiles: SAVED_RIDE_CORRIDOR_DEFAULT_MILES.street
}

export { getDownloadLevelOption }
