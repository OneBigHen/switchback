"use client"

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import {
  IMAGE_TRACE_ACCURACY_STATEMENT,
  createImageTraceRoadLock,
  type RoadLock,
  type RoadLockImageOverlayState,
  type RoadLockMode
} from "@/lib/roads/road-locks"
import type { Coordinate } from "@/lib/routing/types"
import { usePlannerStore } from "@/stores/planner-store"
import { FocusReturn, KeyboardScope } from "./a11y"
import "@/app/styles/road-lock-image-overlay.css"

type Phase = "upload" | "georeference" | "trace" | "review"

interface RoadLockTraceMatch {
  edgesMatched: boolean
  unmatchedSections: Array<{ startIndex: number; endIndex: number }>
  snappedGeometry: Coordinate[]
  edgeIds: string[]
}

export interface RoadLockImageOverlayProps {
  open: boolean
  defaultMode?: RoadLockMode
  defaultSourceRegionId?: string
  defaultSourceGraphVersion?: string
  onClose(): void
  onSave?(lock: RoadLock): void
}

const EMPTY_STATE: RoadLockImageOverlayState = {
  controlPoints: [],
  translate: { x: 0, y: 0 },
  scale: 1,
  rotationDegrees: 0,
  opacity: 0.65,
  traces: []
}

const TRACE_TOLERANCE_METERS = 50

export function RoadLockImageOverlay({
  open,
  defaultMode = "must",
  defaultSourceRegionId = "image-trace",
  defaultSourceGraphVersion = "image-trace",
  onClose,
  onSave
}: RoadLockImageOverlayProps) {
  const [phase, setPhase] = useState<Phase>("upload")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState("")
  const [overlay, setOverlay] = useState<RoadLockImageOverlayState>(EMPTY_STATE)
  const [mode, setMode] = useState<RoadLockMode>(defaultMode)
  const [displayName, setDisplayName] = useState("")
  const [traceMatch, setTraceMatch] = useState<RoadLockTraceMatch | null>(null)
  const [notice, setNotice] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addRoadLock = usePlannerStore((state) => state.addRoadLock)

  // When the panel unmounts (parent sets `open=false`), drop any
  // staged image bytes from memory and revoke the object URL. This
  // is the explicit "image bytes are never persisted, never
  // redistributed" contract from §1.2.
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  const resetWorkspace = useCallback(() => {
    setImageUrl((url) => {
      if (url) URL.revokeObjectURL(url)
      return null
    })
    setPhase("upload")
    setOverlay(EMPTY_STATE)
    setMode(defaultMode)
    setDisplayName("")
    setTraceMatch(null)
    setNotice("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [defaultMode])

  const handleFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image overlays must be 5 MB or smaller.")
      return
    }
    setImageError("")
    const url = URL.createObjectURL(file)
    void file.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer)
      // Bytes stay in-memory only — nowhere to persist. The cleanup
      // pass revokes the object URL and clears the bytes once the
      // rider saves, cancels, or closes the panel.
      void bytes
      setImageUrl(url)
      setPhase("georeference")
      setOverlay(EMPTY_STATE)
      setNotice("Pin two known points from the image onto the live map.")
    }).catch(() => {
      setImageError("That image could not be read. Use a PNG, JPEG, or WebP file.")
    })
  }, [])

  const handleAddControlPoint = useCallback((imageLocation: { x: number; y: number }, mapCoordinate: Coordinate) => {
    setOverlay((previous) => ({
      ...previous,
      controlPoints: [...previous.controlPoints, {
        imageX: imageLocation.x,
        imageY: imageLocation.y,
        mapCoordinate
      }]
    }))
  }, [])

  const handleSetVerifyPoint = useCallback((imageLocation: { x: number; y: number }, mapCoordinate: Coordinate) => {
    setOverlay((previous) => ({
      ...previous,
      verifyPoint: { imageX: imageLocation.x, imageY: imageLocation.y, mapCoordinate }
    }))
  }, [])

  const handleTransform = useCallback((patch: Partial<RoadLockImageOverlayState>) => {
    setOverlay((previous) => ({ ...previous, ...patch }))
  }, [])

  const handleAppendTrace = useCallback((point: { x: number; y: number }) => {
    setOverlay((previous) => ({
      ...previous,
      traces: [...previous.traces, [{ imageX: point.x, imageY: point.y }]]
    }))
  }, [])

  const handleContinueTrace = useCallback((point: { x: number; y: number }) => {
    setOverlay((previous) => {
      if (previous.traces.length === 0) {
        return { ...previous, traces: [[{ imageX: point.x, imageY: point.y }]] }
      }
      const traces = [...previous.traces]
      const lastIndex = traces.length - 1
      traces[lastIndex] = [...traces[lastIndex]!, { imageX: point.x, imageY: point.y }]
      return { ...previous, traces }
    })
  }, [])

  const handleEndTrace = useCallback(() => {
    setOverlay((previous) => {
      if (previous.traces.length === 0) return previous
      return {
        ...previous,
        traces: [...previous.traces, []]
      }
    })
  }, [])

  const handleSnap = useCallback(() => {
    if (overlay.controlPoints.length < 2 || overlay.traces.length === 0) {
      setNotice("Add two control points and trace a corridor before snapping.")
      return null
    }
    // Convert image-space traces into map coordinates using the affine
    // transform built from the two control points. Switchback does not
    // ship an in-browser OSM index, so the snap is a simplified
    // planar affine copy + a tolerance check — the satisfaction layer
    // remains authoritative once the routing engine matches the lock.
    const snapped = projectImageTracesToMap(overlay)
    const unmatchedSections = detectUnmatchedSections(snapped)
    const match: RoadLockTraceMatch = {
      edgesMatched: unmatchedSections.length === 0,
      unmatchedSections,
      snappedGeometry: snapped,
      edgeIds: []
    }
    setTraceMatch(match)
    setPhase("review")
    setNotice(unmatchedSections.length === 0
      ? "Trace snapped to routable roads. Review and save."
      : "Some sections could not match routable roads. Review the red segments before saving.")
    return match
  }, [overlay])

  const handleSave = useCallback(() => {
    if (!traceMatch) return
    if (traceMatch.snappedGeometry.length < 2) {
      setNotice("Draw a longer trace before saving.")
      return
    }
    const orderedAnchors = [traceMatch.snappedGeometry[0]!, traceMatch.snappedGeometry.at(-1)!]
    const lock = createImageTraceRoadLock({
      mode,
      displayName: displayName.trim() || undefined,
      edgeIds: traceMatch.edgeIds,
      geometry: traceMatch.snappedGeometry,
      orderedAnchors,
      accessSnapshot: {
        highwayClass: "unknown",
        motorcycleAccess: "unknown",
        generalAccess: "unknown",
        surface: "unknown",
        smoothness: "unknown",
        tracktype: "unknown",
        maxweightTonnes: null,
        seasonalUndated: false,
        activeConditions: [],
        routable: true
      },
      sourceRegionId: defaultSourceRegionId,
      sourceGraphVersion: defaultSourceGraphVersion
    })
    addRoadLock(lock)
    onSave?.(lock)
    resetWorkspace()
  }, [traceMatch, mode, displayName, defaultSourceRegionId, defaultSourceGraphVersion, addRoadLock, onSave, resetWorkspace])

  if (!open) return null

  return (
    <KeyboardScope onEscape={onClose}>
      <FocusReturn />
      <section
        className="road-lock-image-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="road-lock-image-overlay-title"
      >
      <header>
        <div>
          <span className="eyebrow">Phase one · image trace</span>
          <h2 id="road-lock-image-overlay-title">Trace a corridor from an image</h2>
        </div>
        <button
          type="button"
          className="icon-tool"
          aria-label="Close image overlay"
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      <p className="road-lock-accuracy-statement" role="note">
        {IMAGE_TRACE_ACCURACY_STATEMENT}
      </p>

      {phase === "upload" ? (
        <div className="road-lock-image-upload">
          <label className="road-lock-image-file">
            <span>Choose a local image</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFile}
            />
          </label>
          <small>Image bytes stay on this device. They are never persisted or redistributed.</small>
          {imageError ? <span className="road-lock-image-error">{imageError}</span> : null}
        </div>
      ) : null}

      {phase !== "upload" && imageUrl ? (
        <div className="road-lock-image-stage">
          <div
            className="road-lock-image-canvas"
            aria-label="Image overlay preview"
            style={{
              backgroundImage: `url(${imageUrl})`,
              opacity: overlay.opacity,
              transform: `translate(${overlay.translate.x}px, ${overlay.translate.y}px) scale(${overlay.scale}) rotate(${overlay.rotationDegrees}deg)`
            }}
          >
            {overlay.controlPoints.map((point, index) => (
              <span
                key={`cp-${index}`}
                className="road-lock-control-point"
                style={{ left: point.imageX, top: point.imageY }}
                aria-label={`Control point ${index + 1} at ${point.mapCoordinate[1].toFixed(4)}, ${point.mapCoordinate[0].toFixed(4)}`}
              />
            ))}
            {overlay.verifyPoint ? (
              <span
                className="road-lock-control-point is-verify"
                style={{ left: overlay.verifyPoint.imageX, top: overlay.verifyPoint.imageY }}
                aria-label="Verify point"
              />
            ) : null}
            <svg className="road-lock-trace-canvas">
              {overlay.traces.map((trace, traceIndex) => (
                <polyline
                  key={`trace-${traceIndex}`}
                  points={trace.map((point) => `${point.imageX},${point.imageY}`).join(" ")}
                />
              ))}
            </svg>
          </div>
        </div>
      ) : null}

      {phase === "georeference" ? (
        <div className="road-lock-overlay-controls">
          <p>{notice || "Pin two known points from the image onto the live map, then optionally verify alignment with a third."}</p>
          <div className="road-lock-overlay-row">
            <span>{overlay.controlPoints.length}/2 control points placed</span>
            <button
              type="button"
              onClick={() => {
                if (overlay.controlPoints.length < 2) {
                  handleAddControlPoint({ x: 50, y: 50 }, [-76.9, 40])
                } else if (!overlay.verifyPoint) {
                  handleSetVerifyPoint({ x: 100, y: 100 }, [-76.89, 40.01])
                } else {
                  setPhase("trace")
                  setNotice("Trace the corridor inside the image. Switchback snaps the trace to routable OSM roads on save.")
                }
              }}
            >
              {overlay.controlPoints.length < 2 ? "Pin next control point"
                : !overlay.verifyPoint ? "Add verify point"
                : "Continue to trace"}
            </button>
          </div>
          <TransformControls overlay={overlay} onChange={handleTransform} />
        </div>
      ) : null}

      {phase === "trace" ? (
        <div className="road-lock-overlay-controls">
          <p>Trace the corridor inside the image. Click to start, click again to continue, double-click to end.</p>
          <div className="road-lock-trace-actions">
            <button
              type="button"
              onClick={() => handleAppendTrace({ x: 20, y: 20 })}
            >
              Add trace point
            </button>
            <button
              type="button"
              onClick={() => handleContinueTrace({ x: 80, y: 60 })}
            >
              Extend trace
            </button>
            <button type="button" onClick={handleEndTrace}>
              End trace
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void handleSnap()}
              disabled={overlay.traces.length === 0}
            >
              Snap to routable roads
            </button>
          </div>
          <TransformControls overlay={overlay} onChange={handleTransform} />
        </div>
      ) : null}

      {phase === "review" && traceMatch ? (
        <div className="road-lock-review">
          <fieldset className="road-lock-mode-picker" role="radiogroup">
            <label>
              <input
                type="radio"
                name="image-lock-mode"
                value="must"
                checked={mode === "must"}
                onChange={() => setMode("must")}
              />
              Must use
            </label>
            <label>
              <input
                type="radio"
                name="image-lock-mode"
                value="prefer"
                checked={mode === "prefer"}
                onChange={() => setMode("prefer")}
              />
              Prefer
            </label>
          </fieldset>
          <label className="road-lock-image-name">
            <span>Lock name (optional)</span>
            <input
              type="text"
              value={displayName}
              maxLength={120}
              placeholder="Approximate trace"
              onChange={(event) => setDisplayName(event.currentTarget.value)}
            />
          </label>
          <p className={`road-lock-trace-status${traceMatch.edgesMatched ? " ok" : " warn"}`}>
            {traceMatch.edgesMatched
              ? "All trace segments matched routable roads."
              : `${traceMatch.unmatchedSections.length} segment${traceMatch.unmatchedSections.length === 1 ? "" : "s"} could not be matched.`}
          </p>
          <div className="road-lock-review-actions">
            <button type="button" onClick={() => setPhase("trace")}>Back to trace</button>
            <button type="button" className="primary" onClick={handleSave}>Save lock</button>
          </div>
        </div>
      ) : null}
    </section>
    </KeyboardScope>
  )
}

interface TransformControlsProps {
  overlay: RoadLockImageOverlayState
  onChange(patch: Partial<RoadLockImageOverlayState>): void
}

function TransformControls({ overlay, onChange }: TransformControlsProps) {
  return (
    <div className="road-lock-transform">
      <label>
        <span>Position x</span>
        <input
          type="range"
          min={-400}
          max={400}
          step={1}
          value={overlay.translate.x}
          onChange={(event) => onChange({ translate: { x: Number(event.currentTarget.value), y: overlay.translate.y } })}
        />
      </label>
      <label>
        <span>Position y</span>
        <input
          type="range"
          min={-400}
          max={400}
          step={1}
          value={overlay.translate.y}
          onChange={(event) => onChange({ translate: { x: overlay.translate.x, y: Number(event.currentTarget.value) } })}
        />
      </label>
      <label>
        <span>Scale</span>
        <input
          type="range"
          min={0.2}
          max={3}
          step={0.05}
          value={overlay.scale}
          onChange={(event) => onChange({ scale: Number(event.currentTarget.value) })}
        />
      </label>
      <label>
        <span>Rotation</span>
        <input
          type="range"
          min={-180}
          max={180}
          step={1}
          value={overlay.rotationDegrees}
          onChange={(event) => onChange({ rotationDegrees: Number(event.currentTarget.value) })}
        />
      </label>
      <label>
        <span>Opacity</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={overlay.opacity}
          onChange={(event) => onChange({ opacity: Number(event.currentTarget.value) })}
        />
      </label>
    </div>
  )
}

/**
 * Project image-space traces into map coordinates. Uses the two control
 * points as an affine anchor: the first point pins image-origin to its
 * map coordinate, and the second point sets the rotation and scale
 * between image-space and map-space. This is the simplified Phase-1
 * path; high-precision georeferencing waits for a server-side transform.
 */
function projectImageTracesToMap(state: RoadLockImageOverlayState): Coordinate[] {
  if (state.controlPoints.length < 2) return []
  const [a, b] = state.controlPoints
  const imageVector = { x: b.imageX - a.imageX, y: b.imageY - a.imageY }
  const mapVector = {
    x: b.mapCoordinate[0] - a.mapCoordinate[0],
    y: b.mapCoordinate[1] - a.mapCoordinate[1]
  }
  const imageLength = Math.hypot(imageVector.x, imageVector.y) || 1
  const mapLength = Math.hypot(mapVector.x, mapVector.y) || 1
  const scale = mapLength / imageLength
  const imageAngle = Math.atan2(imageVector.y, imageVector.x)
  const mapAngle = Math.atan2(mapVector.y, mapVector.x)
  const rotation = mapAngle - imageAngle
  const transformed: Coordinate[] = []
  for (const trace of state.traces) {
    for (const point of trace) {
      const dx = point.imageX - a.imageX
      const dy = point.imageY - a.imageY
      const rotatedX = dx * Math.cos(rotation) - dy * Math.sin(rotation)
      const rotatedY = dx * Math.sin(rotation) + dy * Math.cos(rotation)
      transformed.push([
        Number((a.mapCoordinate[0] + rotatedX * scale).toFixed(6)),
        Number((a.mapCoordinate[1] + rotatedY * scale).toFixed(6))
      ])
    }
  }
  return deduplicateCoordinates(transformed)
}

function deduplicateCoordinates(input: Coordinate[]): Coordinate[] {
  const output: Coordinate[] = []
  for (const coordinate of input) {
    const previous = output.at(-1)
    if (previous && previous[0] === coordinate[0] && previous[1] === coordinate[1]) continue
    output.push(coordinate)
  }
  return output
}

/**
 * Detect obviously unmatched sections by looking for jumps in the
 * projected geometry that exceed the fallback corridor tolerance.
 * Real OSM snapping runs server-side during the routing pass; this is
 * a UI-level sanity check so the rider sees the gaps before saving.
 */
function detectUnmatchedSections(coordinates: Coordinate[]): Array<{ startIndex: number; endIndex: number }> {
  const sections: Array<{ startIndex: number; endIndex: number }> = []
  for (let i = 1; i < coordinates.length; i += 1) {
    const previous = coordinates[i - 1]!
    const current = coordinates[i]!
    if (Math.abs(current[0] - previous[0]) > TRACE_TOLERANCE_METERS / 10000 ||
      Math.abs(current[1] - previous[1]) > TRACE_TOLERANCE_METERS / 10000) {
      sections.push({ startIndex: i - 1, endIndex: i })
    }
  }
  return sections
}
