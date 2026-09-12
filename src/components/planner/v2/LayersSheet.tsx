"use client"

import {
  ArrowRight,
  MapTrifold } from "@phosphor-icons/react"
import {
  MapStylePreview,
  type MapStylePreviewVariant
} from "@/components/graphics"
import {
  layerCatalog,
  migrateRiderLayerId,
  type RiderLayerId,
  type RiderLayerSetting
} from "@/lib/client/map-layers"
import { type MapPresetId } from "@/lib/client/map-preset-registry"
import styles from "./LayersSheet.module.css"

const MAP_PRESETS: ReadonlyArray<{
  id: MapPresetId
  label: string
  preview: MapStylePreviewVariant
}> = [
  { id: "road", label: "Road", preview: "standard" },
  { id: "terrain", label: "Terrain", preview: "terrain" },
  { id: "satellite", label: "Satellite", preview: "satellite" }
]

export interface LayersSheetProps {
  mapPreset: MapPresetId
  premiumExperiences: boolean
  riderLayers: RiderLayerSetting[]
  quickLayerIds: RiderLayerId[]
  onMapPresetChange(experience: MapPresetId): void
  onRiderLayerVisibilityChange(id: RiderLayerId, visible: boolean): void
  onOpenAdvanced(): void
}

export function LayersSheet({
  mapPreset,
  premiumExperiences,
  riderLayers,
  quickLayerIds,
  onMapPresetChange,
  onRiderLayerVisibilityChange,
  onOpenAdvanced
}: LayersSheetProps) {
  const allowedPresets = MAP_PRESETS.filter((style) => style.id !== "satellite" || premiumExperiences)
  const settings = new Map<RiderLayerId, RiderLayerSetting>()
  for (const setting of riderLayers) {
    const id = migrateRiderLayerId(setting.id)
    if (!id || settings.has(id)) continue
    settings.set(id, { ...setting, id })
  }

  const canonicalQuickIds: RiderLayerId[] = []
  for (const legacyId of quickLayerIds) {
    const id = migrateRiderLayerId(legacyId)
    if (!id || canonicalQuickIds.includes(id)) continue
    canonicalQuickIds.push(id)
    if (canonicalQuickIds.length >= 4) break
  }
  const quickLayers = canonicalQuickIds.flatMap((id) => {
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
          {allowedPresets.map((style) => (
            <button
              key={style.id}
              type="button"
              role="radio"
              aria-checked={mapPreset === style.id}
              className={mapPreset === style.id ? styles.selected : undefined}
              onClick={() => onMapPresetChange(style.id)}
            >
              <MapStylePreview variant={style.preview} className={styles.stylePreview} />
              <span>{style.label}</span>
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
