"use client"

import { Stack, X } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import type { ReferenceMap } from "@/lib/client/reference-map"
import { catalogLayerSettings, featureMapLayerIds, riderLayerConfidence, type FeatureLayerState, type RiderLayerId, type RiderLayerSetting, type RiderMapPack } from "@/lib/client/map-layers"
import {
  MAP_LIGHT_PREFERENCES,
  type MapExperienceId,
  type MapLightPreference
} from "@/lib/client/map-experience"
import { provenanceSummary } from "@/lib/client/map-data-provenance"
import { useMapLayerMenu } from "./useMapLayerMenu"
import { LayersSheet } from "./v2/LayersSheet"

interface MapStageLayerControlProps {
  avoidMode: boolean
  mapExperience: MapExperienceId
  lightPreference: MapLightPreference
  /** Satellite and runtime lighting exist only on the premium renderer. */
  premiumExperiences: boolean
  riderLayers: RiderLayerSetting[]
  routeVisibility: "standard" | "high-contrast"
  mapPacks: RiderMapPack[]
  unpavedStatus: "hidden" | "loading" | "ready" | "zoom" | "error"
  unpavedCount: number
  riderLayerStates: Record<string, FeatureLayerState>
  riderLayerCounts: Record<string, number>
  onRetryRiderLayers(): void
  referenceMap: ReferenceMap | null
  referenceMessage: string
  onToggleAvoid(): void
  onMapExperienceChange(experience: MapExperienceId): void
  onLightPreferenceChange(preference: MapLightPreference): void
  onRiderLayerChange(id: RiderLayerId, patch: Partial<Pick<RiderLayerSetting, "visible" | "opacity">>): void
  onMoveRiderLayer(id: RiderLayerId, direction: "earlier" | "later"): void
  onRouteVisibilityChange(visibility: "standard" | "high-contrast"): void
  onSaveMapPack(name: string): void
  onApplyMapPack(id: string): void
  onReferenceFile(file: File | undefined): void
  onReferenceMapChange(reference: ReferenceMap | null): void
  onAlignReferenceToView(): void
  onRemoveReferenceMap(): void
}

const FEATURE_LAYER_SET: ReadonlySet<RiderLayerId> = new Set(featureMapLayerIds)

const LIGHT_LABELS: Record<MapLightPreference, string> = {
  auto: "Auto",
  dawn: "Dawn",
  day: "Day",
  dusk: "Dusk",
  night: "Night"
}

const EXPERIENCE_LABELS: Record<MapExperienceId, string> = {
  standard: "Standard",
  terrain: "Terrain",
  satellite: "Satellite"
}

// Keep the first layer decision compact; every other existing catalog layer
// remains available in the Advanced view below.
const QUICK_LAYER_IDS: RiderLayerId[] = ["curvature", "unpaved", "closures", "road-controls"]

/**
 * Satellite is a premium-renderer capability. Offering it on the fallback
 * renderer would name a view Switchback cannot actually draw there.
 */
function mapExperienceChoices(premium: boolean): { id: MapExperienceId; label: string }[] {
  const ids: MapExperienceId[] = premium ? ["standard", "terrain", "satellite"] : ["standard", "terrain"]
  return ids.map((id) => ({ id, label: EXPERIENCE_LABELS[id] }))
}

export function MapStageLayerControl({
  avoidMode,
  mapExperience,
  lightPreference,
  premiumExperiences,
  riderLayers,
  routeVisibility,
  mapPacks,
  unpavedStatus,
  unpavedCount,
  riderLayerStates,
  riderLayerCounts,
  onRetryRiderLayers,
  referenceMap,
  referenceMessage,
  onToggleAvoid,
  onMapExperienceChange,
  onLightPreferenceChange,
  onRiderLayerChange,
  onMoveRiderLayer,
  onRouteVisibilityChange,
  onSaveMapPack,
  onApplyMapPack,
  onReferenceFile,
  onReferenceMapChange,
  onAlignReferenceToView,
  onRemoveReferenceMap
}: MapStageLayerControlProps) {
  const catalogSettings = catalogLayerSettings(riderLayers)
  const experienceChoices = mapExperienceChoices(premiumExperiences)
  const {
    layerButtonRef,
    layerMenuOpen,
    mapPackName,
    setMapPackName,
    closeLayerMenu,
    toggleLayerMenu,
    handleLayerMenuKeyDown,
    saveMapPack
  } = useMapLayerMenu({ onSaveMapPack })

  // Aggregate count of how many layers are currently loading, errored, or
  // empty-but-loaded, so the panel header can surface a one-line status
  // summary that survives even when the panel is closed.
  const loadingLayerCount = Object.values(riderLayerStates).filter((state) => state === "loading").length
  const errorLayerCount = Object.values(riderLayerStates).filter((state) => state === "error").length
  const emptyLayerCount = Object.values(riderLayerStates).filter((state) => state === "empty").length
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    if (!layerMenuOpen) setAdvancedOpen(false)
  }, [layerMenuOpen])

  const closeMenu = () => {
    setAdvancedOpen(false)
    closeLayerMenu()
  }

  const toggleMenu = () => {
    if (layerMenuOpen) setAdvancedOpen(false)
    toggleLayerMenu()
  }

  return (
    <div className="map-layer-control" onKeyDown={handleLayerMenuKeyDown}>
      <div className="map-tool-row">
        <button type="button" className="map-layers-button map-avoid-button" aria-label={avoidMode ? "Cancel avoid area" : "Draw an avoid area"} aria-pressed={avoidMode} onClick={() => { closeMenu(); onToggleAvoid() }}>
          {avoidMode ? <X aria-hidden="true" /> : <span className="avoid-area-glyph" aria-hidden="true">▧</span>}
          <span>{avoidMode ? "Cancel" : "Avoid area"}</span>
        </button>
        <button ref={layerButtonRef} type="button" className={`map-layers-button${loadingLayerCount > 0 ? " is-loading" : ""}${errorLayerCount > 0 ? " has-error" : ""}`} aria-label={layerMenuOpen ? "Close map layers" : "Open map layers"} aria-expanded={layerMenuOpen} onClick={() => { if (avoidMode) onToggleAvoid(); toggleMenu() }}>
          {layerMenuOpen ? <X aria-hidden="true" /> : <Stack weight="fill" aria-hidden="true" />}
          <span>Layers</span>
          {loadingLayerCount > 0 ? <span className="map-layer-spinner map-layers-button-spinner" aria-hidden="true" /> : null}
        </button>
      </div>
      {layerMenuOpen ? <div className="map-layer-menu" role="dialog" aria-label="Map layers and style">
        {!advancedOpen ? (
          <LayersSheet
            mapExperience={mapExperience}
            premiumExperiences={premiumExperiences}
            riderLayers={riderLayers}
            quickLayerIds={QUICK_LAYER_IDS}
            onMapExperienceChange={onMapExperienceChange}
            onRiderLayerVisibilityChange={(id, visible) => onRiderLayerChange(id, { visible })}
            onOpenAdvanced={() => setAdvancedOpen(true)}
          />
        ) : (
          <>
            <button type="button" className="map-layer-advanced-back" aria-label="Back to quick map layers" onClick={() => setAdvancedOpen(false)}>
              <span>Quick map layers</span>
            </button>
        <div>
          <strong>Map view</strong>
          <div className="map-style-options" role="radiogroup" aria-label="Map view">
            {experienceChoices.map((choice) => (
              <button
                type="button"
                key={choice.id}
                role="radio"
                aria-checked={mapExperience === choice.id}
                onClick={() => onMapExperienceChange(choice.id)}
              >
                <span className={`style-swatch style-${choice.id}`} aria-hidden="true" />
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        {premiumExperiences ? (
          <div>
            <strong>Lighting</strong>
            <div className="map-light-options" role="radiogroup" aria-label="Map lighting">
              {MAP_LIGHT_PREFERENCES.map((preference) => (
                <button
                  type="button"
                  key={preference}
                  role="radio"
                  aria-checked={lightPreference === preference}
                  onClick={() => onLightPreferenceChange(preference)}
                >
                  {LIGHT_LABELS[preference]}
                </button>
              ))}
            </div>
            <small className="map-light-note">Auto follows sunrise and sunset where your ride starts.</small>
          </div>
        ) : null}
        <div className="overlay-options">
          <div className="overlay-options-header">
            <strong>Rider map studio</strong>
            {loadingLayerCount > 0 ? <span className="layer-section-status is-loading"><span className="map-layer-spinner" aria-hidden="true" /> Loading {loadingLayerCount}</span> : null}
            {errorLayerCount > 0 ? <span className="layer-section-status is-error">{errorLayerCount} failed</span> : null}
            {emptyLayerCount > 0 && loadingLayerCount === 0 && errorLayerCount === 0 ? <span className="layer-section-status is-empty">{emptyLayerCount} found nothing in view</span> : null}
          </div>
          {errorLayerCount > 0 ? (
            <div className="layer-error-banner" role="status">
              <span>Some layers failed to load — the OSM map-data provider may be busy or unreachable.</span>
              <button type="button" onClick={onRetryRiderLayers}>Retry layers</button>
            </div>
          ) : null}
          {catalogSettings.map(({ definition, setting }, index) => {
            // Per-layer detail line: for feature layers, surface load
            // state (loading / count / empty / zoom-too-low / failed) so
            // users can tell apart "loaded but nothing here" from "broken".
            const isFeatureLayer = FEATURE_LAYER_SET.has(definition.id)
            const layerState = isFeatureLayer ? riderLayerStates[definition.id] : undefined
            const layerCount = isFeatureLayer ? (riderLayerCounts[definition.id] ?? 0) : 0
            const detail = (() => {
              if (definition.id === "unpaved" && unpavedStatus === "ready") return `${unpavedCount} in view · official PASDA`
              if (!isFeatureLayer || layerState === undefined) return `${definition.source} · ${definition.coverage}`
              switch (layerState) {
                case "loading": return "Fetching features…"
                case "ready": return `${layerCount} in view · ${definition.source}`
                case "empty": return `None in view · ${definition.source}`
                case "zoom": return `Zoom in to ${definition.minZoom}+ to load · ${definition.source}`
                case "error": return "Failed to load — tap retry above"
                default: return `${definition.source} · ${definition.coverage}`
              }
            })()
            return <label key={definition.id} className={layerState ? `has-layer-state is-${layerState}` : undefined}>
              <input type="checkbox" checked={setting.visible} onChange={(event) => onRiderLayerChange(definition.id, { visible: event.target.checked })} />
              <span className={`overlay-key ${definition.id === "unpaved" ? "unpaved-key" : definition.id === "curvature" ? "curvature-key" : "catalog-key"}`} aria-hidden="true" />
              <span className="overlay-meta"><b>{definition.name}</b><small>{detail}</small><small className="layer-freshness">{definition.freshness} · zoom {definition.minZoom}+</small><small className="layer-legend">Legend: {definition.legend}</small><small className="layer-confidence">Confidence: {riderLayerConfidence(definition)}</small>
                <span className="layer-order-controls"><button type="button" aria-label={`Move ${definition.name} earlier`} disabled={index === 0} onClick={() => onMoveRiderLayer(definition.id, "earlier")}>Up</button><button type="button" aria-label={`Move ${definition.name} later`} disabled={index === catalogSettings.length - 1} onClick={() => onMoveRiderLayer(definition.id, "later")}>Down</button></span>
                <input className="layer-opacity" type="range" min="0.2" max="1" step="0.05" value={setting.opacity} aria-label={`${definition.name} opacity`} onChange={(event) => onRiderLayerChange(definition.id, { opacity: Number(event.target.value) })} />
              </span>
              {isFeatureLayer && layerState ? (
                <span className={`layer-status-badge is-${layerState}`} aria-hidden="true">
                  {layerState === "loading" ? <span className="map-layer-spinner" /> : null}
                  {layerState === "ready" ? layerCount : null}
                  {layerState === "empty" ? "0" : null}
                  {layerState === "zoom" ? "Z" : null}
                  {layerState === "error" ? "!" : null}
                </span>
              ) : null}
            </label>
          })}
        </div>
        <div className="map-provenance-options"><strong>Data sources</strong><small className="map-provenance-summary">{provenanceSummary().authoritative} authoritative · {provenanceSummary().heuristic} heuristic · {provenanceSummary().live} live updates</small><ul>{catalogSettings.map(({ definition }) => <li key={definition.id}><b>{definition.name}</b><span>{definition.provenance}</span></li>)}</ul></div>
        <div className="route-visibility-options"><strong>Route visibility</strong><label><input type="checkbox" checked={routeVisibility === "high-contrast"} onChange={(event) => onRouteVisibilityChange(event.target.checked ? "high-contrast" : "standard")} />High contrast route line</label></div>
        <div className="map-pack-options"><strong>Rider Map Packs</strong><div className="map-pack-save"><input value={mapPackName} maxLength={80} placeholder="Name this setup" aria-label="New map pack name" onChange={(event) => setMapPackName(event.target.value)} /><button type="button" onClick={saveMapPack}>Save</button></div>{mapPacks.length > 0 ? <div className="map-pack-list">{mapPacks.slice(0, 5).map((pack) => <button key={pack.id} type="button" onClick={() => onApplyMapPack(pack.id)}>{pack.name}</button>)}</div> : <small>Saved only on this device.</small>}</div>
        <div className="reference-map-options"><strong>Reference map or screenshot</strong><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Add reference map image" onChange={(event) => { onReferenceFile(event.currentTarget.files?.[0]); event.currentTarget.value = "" }} />{referenceMap ? <div className="reference-map-actions"><span>{referenceMap.name}</span><label>Opacity<input type="range" min="0.1" max="1" step="0.05" value={referenceMap.opacity} aria-label="Reference map opacity" onChange={(event) => onReferenceMapChange({ ...referenceMap, opacity: Number(event.target.value) })} /></label><button type="button" onClick={onAlignReferenceToView}>Align to current view</button><button type="button" onClick={onRemoveReferenceMap}>Remove</button></div> : null}<small>{referenceMessage || "Kept on this device. Align it over the live map, then trace the intended line."}</small></div>
          </>
        )}
      </div> : null}
    </div>
  )
}
