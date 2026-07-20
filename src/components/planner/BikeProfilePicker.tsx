"use client"

import { Gauge, Motorcycle, Wind } from "@phosphor-icons/react"
import { useMemo, useState } from "react"
import {
  MOTORCYCLE_PROFILES,
  listBikeProfiles,
  type BikeProfile
} from "@/lib/routing/bike-profiles"
import "@/app/styles/bike-profile-picker.css"

export interface BikeProfilePickerProps {
  value: BikeProfile
  onChange(profile: BikeProfile): void
  /** Currently selected routing profile so a mismatch hint can surface. */
  routingProfile?: string | null
  id?: string
}

const PROFILE_DESCRIPTIONS: Record<BikeProfile["category"], string> = {
  street: "Paved roads only. Refuses unknown surfaces and most tracks.",
  touring: "Long-haul pavement. Tolerates occasional compacted gravel.",
  adventure: "Maintained gravel OK. Penalizes impassable smoothness.",
  "dual-sport": "Tracks and rough surfaces allowed. Still enforces legal access."
}

function profileEquality(a: BikeProfile, b: BikeProfile): boolean {
  return (
    a.name === b.name &&
    a.category === b.category &&
    a.fuelRangeMiles === b.fuelRangeMiles &&
    a.reserveMiles === b.reserveMiles &&
    a.allowMaintainedGravel === b.allowMaintainedGravel &&
    a.allowRoughTracks === b.allowRoughTracks &&
    a.avoidUnknownSurface === b.avoidUnknownSurface
  )
}

function isProfileMismatch(bike: BikeProfile, routingProfile: string | null | undefined): boolean {
  if (!routingProfile) return false
  const expected = (() => {
    switch (bike.category) {
      case "street":
      case "touring":
        return routingProfile !== "adventure"
      case "adventure":
        return routingProfile === "adventure" || routingProfile === "scenic"
      case "dual-sport":
        return routingProfile === "adventure"
    }
  })()
  return !expected
}

export function BikeProfilePicker({ value, onChange, routingProfile, id }: BikeProfilePickerProps) {
  const presets = useMemo(() => listBikeProfiles(), [])
  const [editingFields, setEditingFields] = useState(false)

  const activeCategory = value.category
  const mismatched = isProfileMismatch(value, routingProfile ?? null)

  const handleSelectPreset = (preset: BikeProfile) => {
    if (profileEquality(preset, value)) return
    onChange(preset)
  }

  const handleFieldChange = (patch: Partial<BikeProfile>) => {
    onChange({ ...value, ...patch })
  }

  return (
    <section className="bike-profile-picker" id={id} aria-label="Motorcycle bike profile">
      <header className="bike-profile-picker-header">
        <div>
          <span className="eyebrow">Bike profile</span>
          <h3>{value.name}</h3>
        </div>
        <button
          type="button"
          className="bike-profile-fields-toggle"
          aria-pressed={editingFields}
          aria-label={editingFields ? "Hide bike profile fields" : "Edit bike profile fields"}
          onClick={() => setEditingFields((open) => !open)}
        >
          {editingFields ? "Hide fields" : "Edit fields"}
        </button>
      </header>

      <div className="bike-profile-segmented" role="radiogroup" aria-label="Motorcycle bike profile preset">
        {presets.map((preset) => {
          const selected = preset.category === activeCategory && preset.name === value.name
          return (
            <button
              key={preset.name}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`bike-profile-option${selected ? " is-selected" : ""}`}
              onClick={() => handleSelectPreset(preset)}
            >
              <span className="bike-profile-option-glyph" aria-hidden="true">
                {preset.category === "street" || preset.category === "touring" ? <Motorcycle /> : null}
                {preset.category === "adventure" ? <Wind /> : null}
                {preset.category === "dual-sport" ? <Gauge /> : null}
              </span>
              <span className="bike-profile-option-text">
                <strong>{preset.name}</strong>
                <small>{PROFILE_DESCRIPTIONS[preset.category]}</small>
              </span>
            </button>
          )
        })}
      </div>

      <p className="bike-profile-description">{PROFILE_DESCRIPTIONS[activeCategory]}</p>

      {mismatched ? (
        <p className="bike-profile-mismatch" role="status">
          Profile mismatch: your selected routing style does not match this bike. Routes may use surfaces this bike cannot ride.
        </p>
      ) : null}

      {editingFields ? (
        <div className="bike-profile-fields" role="group" aria-label={`Editable fields for ${value.name}`}>
          <label className="bike-profile-field">
            <span>Fuel range (mi)</span>
            <input
              type="number"
              min={20}
              max={600}
              step={5}
              value={value.fuelRangeMiles}
              onChange={(event) => {
                const next = Number(event.currentTarget.value)
                if (!Number.isFinite(next) || next < 20 || next > 600) return
                handleFieldChange({ fuelRangeMiles: next })
              }}
              aria-label="Fuel range in miles"
            />
          </label>
          <label className="bike-profile-field">
            <span>Reserve (mi)</span>
            <input
              type="number"
              min={0}
              max={120}
              step={1}
              value={value.reserveMiles}
              onChange={(event) => {
                const next = Number(event.currentTarget.value)
                if (!Number.isFinite(next) || next < 0 || next > 120) return
                handleFieldChange({ reserveMiles: next })
              }}
              aria-label="Reserve fuel range in miles"
            />
          </label>
          <label className="bike-profile-field bike-profile-field-toggle">
            <input
              type="checkbox"
              checked={value.allowMaintainedGravel}
              onChange={(event) => handleFieldChange({ allowMaintainedGravel: event.currentTarget.checked })}
            />
            <span>Allow maintained gravel</span>
          </label>
        </div>
      ) : (
        <ul className="bike-profile-summary" aria-label="Bike profile summary">
          <li><span>Fuel range</span><strong>{value.fuelRangeMiles} mi</strong></li>
          <li><span>Reserve</span><strong>{value.reserveMiles} mi</strong></li>
          <li><span>Maintained gravel</span><strong>{value.allowMaintainedGravel ? "Allowed" : "Avoided"}</strong></li>
        </ul>
      )}

      <p className="bike-profile-presets-hint">
        Preset list includes {MOTORCYCLE_PROFILES.length} built-in profiles. Custom profiles can be added at the routing layer.
      </p>
    </section>
  )
}
