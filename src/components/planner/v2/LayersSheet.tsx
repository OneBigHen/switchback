"use client"

import { ArrowRight, MapTrifold } from "@phosphor-icons/react"
import { layerCatalog, type RiderLayerId, type RiderLayerSetting } from "@/lib/client/map-layers"
import type { MapExperienceId } from "@/lib/client/map-experience"
import styles from "./LayersSheet.module.css"

const MAP_STYLES: ReadonlyArray<{ id: MapExperienceId; label: string }> = [
  { id: "standard", label: "Standard" },
  { id: "terrain", label: "Terrain" },
  { id: "satellite", label: "Satellite" }
]

export interface LayersSheetProps {
  mapExperience: MapExperienceId
  premiumExperiences: boolean
  riderLayers: RiderLayerSetting[]
  quickLayerIds: RiderLayerId[]
  onMapExperienceChange(experience: MapExperienceId): void
  onRiderLayerVisibilityChange(id: RiderLayerId, visible: boolean): void
  onOpenAdvanced(): void
}

export function LayersSheet({
  mapExperience,
  premiumExperiences,
  riderLayers,
  quickLayerIds,
  onMapExperienceChange,
  onRiderLayerVisibilityChange,
  onOpenAdvanced
}: LayersSheetProps) {
  const allowedStyles = MAP_STYLES.filter((style) => style.id !== "satellite" || premiumExperiences)
  const settings = new Map(riderLayers.map((setting) => [setting.id, setting]))
  const quickLayers = quickLayerIds.slice(0, 4).flatMap((id) => {
    const definition = layerCatalog.find((candidate) => candidate.id === id)
    const setting = settings.get(id)
    return definition && setting ? [{ definition, setting }] : []
  })

  return (
    <section className={styles.sheet} aria-label="Quick map layers">
      <div className={styles.group}>
        <div className={styles.heading}>
          <MapTrifold weight="fill" aria-hidden="true" />
          <div>
            <strong>Map</strong>
            <small>Choose the view that helps you read the road.</small>
          </div>
        </div>
        <div className={styles.styles} role="radiogroup" aria-label="Map style">
          {allowedStyles.map((style) => (
            <button
              key={style.id}
              type="button"
              role="radio"
              aria-checked={mapExperience === style.id}
              className={mapExperience === style.id ? styles.selected : undefined}
              onClick={() => onMapExperienceChange(style.id)}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.headingText}>
          <strong>Show on map</strong>
          <small>Keep only the overlays useful for this ride.</small>
        </div>
        <div className={styles.toggles}>
          {quickLayers.map(({ definition, setting }) => (
            <label key={definition.id}>
              <input
                type="checkbox"
                aria-label={definition.name}
                checked={setting.visible}
                onChange={(event) => onRiderLayerVisibilityChange(definition.id, event.currentTarget.checked)}
              />
              <span aria-hidden="true" />
              <b>{definition.name}</b>
            </label>
          ))}
        </div>
      </div>

      <button type="button" className={styles.advanced} aria-label="Advanced map settings" onClick={onOpenAdvanced}>
        <span>Advanced map settings</span>
        <ArrowRight weight="bold" aria-hidden="true" />
      </button>
    </section>
  )
}
