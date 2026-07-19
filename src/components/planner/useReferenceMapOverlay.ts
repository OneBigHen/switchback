import type { Map as MapLibreMap } from "maplibre-gl"
import { useState, type RefObject } from "react"
import { boundsToReferenceCorners, normalizeReferenceMap, type ReferenceMap } from "@/lib/client/reference-map"

interface UseReferenceMapOverlayOptions {
  mapRef: RefObject<MapLibreMap | null>
  ready: boolean
  referenceMap: ReferenceMap | null
  onReferenceMapChange(reference: ReferenceMap | null): void
}

export function useReferenceMapOverlay({
  mapRef,
  ready,
  referenceMap,
  onReferenceMapChange
}: UseReferenceMapOverlayOptions) {
  const [referenceMessage, setReferenceMessage] = useState("")

  const alignReferenceToView = () => {
    const map = mapRef.current
    if (!map || !referenceMap) return
    const bounds = map.getBounds()
    onReferenceMapChange(normalizeReferenceMap({
      ...referenceMap,
      coordinates: boundsToReferenceCorners({
        west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth()
      })
    }))
    setReferenceMessage("Reference map aligned to the current map view. Trace over it with Sketch.")
  }

  const handleReferenceFile = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setReferenceMessage("Choose a PNG, JPEG, WebP, or other image file.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setReferenceMessage("Reference images must be 5 MB or smaller.")
      return
    }
    const map = mapRef.current
    if (!map || !ready) {
      setReferenceMessage("Wait for the live map to load before adding a reference image.")
      return
    }
    const reader = new FileReader()
    reader.onerror = () => setReferenceMessage("That reference image could not be read on this device.")
    reader.onload = () => {
      if (typeof reader.result !== "string") return
      const bounds = map.getBounds()
      try {
        onReferenceMapChange(normalizeReferenceMap({
          id: `reference-${Date.now().toString(36)}`,
          name: file.name.replace(/\.[a-z0-9]+$/i, ""),
          url: reader.result,
          coordinates: boundsToReferenceCorners({
            west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth()
          }),
          opacity: 0.62
        }))
        setReferenceMessage("Reference map placed over the current view. Pan/zoom to its location, then align and sketch.")
      } catch (caught) {
        setReferenceMessage(caught instanceof Error ? caught.message : "Reference map could not be added.")
      }
    }
    reader.readAsDataURL(file)
  }

  const removeReferenceMap = () => {
    onReferenceMapChange(null)
    setReferenceMessage("Reference map removed.")
  }

  return { referenceMessage, alignReferenceToView, handleReferenceFile, removeReferenceMap }
}
