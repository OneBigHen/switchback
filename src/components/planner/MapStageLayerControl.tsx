"use client"

import { PencilLine, Stack, X } from "@phosphor-icons/react"
import type { ReferenceMap } from "@/lib/client/reference-map"
import { catalogLayerSettings, riderLayerConfidence, type MapStyleId, type RiderLayerId, type RiderLayerSetting, type RiderMapPack } from "@/lib/client/map-layers"
import { useMapLayerMenu } from "./useMapLayerMenu"

interface MapStageLayerControlProps {
  sketchMode: boolean
  avoidMode: boolean
  mapStyle: MapStyleId
  riderLayers: RiderLayerSetting[]
  routeVisibility: "standard" | "high-contrast"
  mapPacks: RiderMapPack[]
  unpavedStatus: "hidden" | "loading" | "ready" | "zoom" | "error"
  unpavedCount: number
  referenceMap: ReferenceMap | null
  referenceMessage: string
  onToggleSketch(): void
  onToggleAvoid(): void
  onMapStyleChange(style: MapStyleId): void
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

export function MapStageLayerControl({
  sketchMode,
  avoidMode,
  mapStyle,
  riderLayers,
  routeVisibility,
  mapPacks,
  unpavedStatus,
  unpavedCount,
  referenceMap,
  referenceMessage,
  onToggleSketch,
  onToggleAvoid,
  onMapStyleChange,
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

  return (
    <div className="map-layer-control" onKeyDown={handleLayerMenuKeyDown}>
      <div className="map-tool-row">
        <button type="button" className="map-layers-button map-sketch-button" aria-label={sketchMode ? "Cancel route sketch" : "Sketch a rough route"} aria-pressed={sketchMode} onClick={() => { closeLayerMenu(); onToggleSketch() }}>
          {sketchMode ? <X aria-hidden="true" /> : <PencilLine weight="bold" aria-hidden="true" />}
          <span>{sketchMode ? "Cancel" : "Sketch route"}</span>
        </button>
        <button type="button" className="map-layers-button map-avoid-button" aria-label={avoidMode ? "Cancel avoid area" : "Draw an avoid area"} aria-pressed={avoidMode} onClick={() => { closeLayerMenu(); onToggleAvoid() }}>
          {avoidMode ? <X aria-hidden="true" /> : <span className="avoid-area-glyph" aria-hidden="true">▧</span>}
          <span>{avoidMode ? "Cancel" : "Avoid area"}</span>
        </button>
        <button ref={layerButtonRef} type="button" className="map-layers-button" aria-label={layerMenuOpen ? "Close map layers" : "Open map layers"} aria-expanded={layerMenuOpen} onClick={() => { if (sketchMode) onToggleSketch(); if (avoidMode) onToggleAvoid(); toggleLayerMenu() }}>
          {layerMenuOpen ? <X aria-hidden="true" /> : <Stack weight="fill" aria-hidden="true" />}
          <span>Layers</span>
        </button>
      </div>
      {layerMenuOpen ? <div className="map-layer-menu" role="dialog" aria-label="Map layers and style">
        <div>
          <strong>Map style</strong>
          <div className="map-style-options">{(["clean", "explorer", "night"] as const).map((style) => <button type="button" key={style} aria-pressed={mapStyle === style} onClick={() => onMapStyleChange(style)}><span className={`style-swatch style-${style}`} aria-hidden="true" />{style === "clean" ? "Clean" : style === "explorer" ? "Explore" : "Night"}</button>)}</div>
        </div>
        <div className="overlay-options">
          <strong>Rider map studio</strong>
          {catalogSettings.map(({ definition, setting }, index) => {
            const detail = definition.id === "unpaved" && unpavedStatus === "ready" ? `${unpavedCount} in view · official PASDA` : `${definition.source} · ${definition.coverage}`
            return <label key={definition.id}>
              <input type="checkbox" checked={setting.visible} onChange={(event) => onRiderLayerChange(definition.id, { visible: event.target.checked })} />
              <span className={`overlay-key ${definition.id === "unpaved" ? "unpaved-key" : definition.id === "curvature" ? "curvature-key" : "catalog-key"}`} aria-hidden="true" />
              <span><b>{definition.name}</b><small>{detail}</small><small className="layer-freshness">{definition.freshness} · zoom {definition.minZoom}+</small><small className="layer-legend">Legend: {definition.legend}</small><small className="layer-confidence">Confidence: {riderLayerConfidence(definition)}</small>
                <span className="layer-order-controls"><button type="button" aria-label={`Move ${definition.name} earlier`} disabled={index === 0} onClick={() => onMoveRiderLayer(definition.id, "earlier")}>Up</button><button type="button" aria-label={`Move ${definition.name} later`} disabled={index === catalogSettings.length - 1} onClick={() => onMoveRiderLayer(definition.id, "later")}>Down</button></span>
                <input className="layer-opacity" type="range" min="0.2" max="1" step="0.05" value={setting.opacity} aria-label={`${definition.name} opacity`} onChange={(event) => onRiderLayerChange(definition.id, { opacity: Number(event.target.value) })} />
              </span>
            </label>
          })}
        </div>
        <div className="route-visibility-options"><strong>Route visibility</strong><label><input type="checkbox" checked={routeVisibility === "high-contrast"} onChange={(event) => onRouteVisibilityChange(event.target.checked ? "high-contrast" : "standard")} />High contrast route line</label></div>
        <div className="map-pack-options"><strong>Rider Map Packs</strong><div className="map-pack-save"><input value={mapPackName} maxLength={80} placeholder="Name this setup" aria-label="New map pack name" onChange={(event) => setMapPackName(event.target.value)} /><button type="button" onClick={saveMapPack}>Save</button></div>{mapPacks.length > 0 ? <div className="map-pack-list">{mapPacks.slice(0, 5).map((pack) => <button key={pack.id} type="button" onClick={() => onApplyMapPack(pack.id)}>{pack.name}</button>)}</div> : <small>Saved only on this device.</small>}</div>
        <div className="reference-map-options"><strong>Reference map or screenshot</strong><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Add reference map image" onChange={(event) => { onReferenceFile(event.currentTarget.files?.[0]); event.currentTarget.value = "" }} />{referenceMap ? <div className="reference-map-actions"><span>{referenceMap.name}</span><label>Opacity<input type="range" min="0.1" max="1" step="0.05" value={referenceMap.opacity} aria-label="Reference map opacity" onChange={(event) => onReferenceMapChange({ ...referenceMap, opacity: Number(event.target.value) })} /></label><button type="button" onClick={onAlignReferenceToView}>Align to current view</button><button type="button" onClick={onRemoveReferenceMap}>Remove</button></div> : null}<small>{referenceMessage || "Kept on this device. Align it over the live map, then trace the intended line."}</small></div>
      </div> : null}
    </div>
  )
}
