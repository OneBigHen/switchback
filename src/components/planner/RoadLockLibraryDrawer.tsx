"use client"

import {
  ArrowCounterClockwise,
  Image as ImageIcon,
  MapTrifold,
  Path,
  PencilSimple,
  Trash,
  X
} from "@phosphor-icons/react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  type RoadLock,
  type RoadLockMode,
  type RoadLockProvenance
} from "@/lib/roads/road-locks"
import { ROAD_LOCK_MATCH_TOKEN, resolveRoadLockMatchColorMap } from "@/components/planner/map-drawing"
import { RoadLockLibrary } from "@/lib/roads/road-locks"
import { FocusReturn, KeyboardScope } from "./a11y"
import { usePlannerStore } from "@/stores/planner-store"
import "@/app/styles/road-lock-library-drawer.css"

export interface RoadLockLibraryDrawerProps {
  open: boolean
  onClose(): void
  /** External RoadLockLibrary instance if the caller maintains one; otherwise the drawer reads the planner store. */
  library?: RoadLockLibrary | null
  /** Lock id the parent currently highlights on the map (controlled). */
  highlightedLockId?: string | null
  onHighlightLock?(id: string | null): void
}

const PROVENANCE_META: Record<RoadLockProvenance, { label: string; icon: typeof PencilSimple }> = {
  manual: { label: "Manual", icon: PencilSimple },
  gpx: { label: "GPX", icon: Path },
  "image-trace": { label: "Image trace", icon: ImageIcon },
  rematched: { label: "Rematched", icon: ArrowCounterClockwise }
}

const MODE_BADGE: Record<RoadLockMode, string> = {
  must: "Must use",
  prefer: "Prefer"
}

export function RoadLockLibraryDrawer({
  open,
  onClose,
  library,
  highlightedLockId,
  onHighlightLock
}: RoadLockLibraryDrawerProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const storeLocks = usePlannerStore((state) => state.roadLocks)
  const updateRoadLock = usePlannerStore((state) => state.updateRoadLock)
  const removeRoadLock = usePlannerStore((state) => state.removeRoadLock)
  const convertRoadLock = usePlannerStore((state) => state.convertRoadLock)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [regionFilter, setRegionFilter] = useState("")
  const [sourceFilter, setSourceFilter] = useState<"" | RoadLockProvenance>("")
  const [modeFilter, setModeFilter] = useState<"" | RoadLockMode>("")
  const [libraryError, setLibraryError] = useState("")
  // Internal highlight state. Tapping the same lock toggles it off
  // without requiring the parent to echo back the change. The drawer
  // is a modal surface, so the parent's `highlightedLockId` only needs
  // to seed the initial state when the dialog opens.
  const [internalHighlightedLockId, setInternalHighlightedLockId] = useState<string | null>(
    highlightedLockId ?? null
  )
  const activeHighlight = internalHighlightedLockId

  const [libraryLocks, setLibraryLocks] = useState<RoadLock[]>([])
  useEffect(() => {
    let cancelled = false
    async function syncLibrary() {
      if (!library) return
      try {
        const list = await library.list({})
        if (!cancelled) {
          setLibraryLocks(list)
          setLibraryError("")
        }
      } catch (caught) {
        if (!cancelled) {
          setLibraryError(caught instanceof Error ? caught.message : "Saved road locks could not be loaded.")
        }
      }
    }
    if (open) void syncLibrary()
    return () => {
      cancelled = true
    }
  }, [library, open])

  const locks = useMemo<RoadLock[]>(() => {
    const merged = new Map<string, RoadLock>()
    for (const lock of libraryLocks) merged.set(lock.id, lock)
    for (const lock of storeLocks) merged.set(lock.id, lock)
    return Array.from(merged.values())
  }, [libraryLocks, storeLocks])

  const regions = useMemo(() => {
    const set = new Set<string>()
    for (const lock of locks) set.add(lock.sourceRegionId)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [locks])

  const sources = useMemo(() => {
    const set = new Set<RoadLockProvenance>()
    for (const lock of locks) set.add(lock.source)
    return Array.from(set)
  }, [locks])

  const visibleLocks = useMemo(() => {
    return locks.filter((lock) => (
      (!regionFilter || lock.sourceRegionId === regionFilter) &&
      (!sourceFilter || lock.source === sourceFilter) &&
      (!modeFilter || lock.mode === modeFilter)
    ))
  }, [locks, regionFilter, sourceFilter, modeFilter])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const scrim = dialogRef.current?.parentElement
    const background = scrim?.parentElement
      ? Array.from(scrim.parentElement.children).filter(
        (element): element is HTMLElement => element instanceof HTMLElement && element !== scrim
      )
      : []
    const backgroundState = background.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden")
    }))
    for (const element of background) {
      element.inert = true
      element.setAttribute("aria-hidden", "true")
    }
    closeButtonRef.current?.focus()
    return () => {
      for (const { element, inert, ariaHidden } of backgroundState) {
        element.inert = Boolean(inert)
        if (ariaHidden == null) element.removeAttribute("aria-hidden")
        else element.setAttribute("aria-hidden", ariaHidden)
      }
      previouslyFocused?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="road-lock-scrim" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <KeyboardScope onEscape={onClose}>
        <FocusReturn />
        <aside
          ref={dialogRef}
          className="road-lock-library-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="road-lock-library-title"
          tabIndex={-1}
        >
        <header>
          <div>
            <h2 id="road-lock-library-title">Road locks</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-tool"
            aria-label="Close road lock library"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        {(regions.length > 1 || sources.length > 1) ? (
          <div className="road-lock-filters" role="group" aria-label="Filter road locks">
            {regions.length > 1 ? (
              <label>
                <span>Region</span>
                <select
                  aria-label="Filter road locks by region"
                  value={regionFilter}
                  onChange={(event) => setRegionFilter(event.currentTarget.value)}
                >
                  <option value="">All regions</option>
                  {regions.map((region) => <option key={region} value={region}>{region}</option>)}
                </select>
              </label>
            ) : null}
            {sources.length > 1 ? (
              <label>
                <span>Source</span>
                <select
                  aria-label="Filter road locks by source"
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.currentTarget.value as "" | RoadLockProvenance)}
                >
                  <option value="">All sources</option>
                  {sources.map((source) => (
                    <option key={source} value={source}>{PROVENANCE_META[source].label}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              <span>Mode</span>
              <select
                aria-label="Filter road locks by mode"
                value={modeFilter}
                onChange={(event) => setModeFilter(event.currentTarget.value as "" | RoadLockMode)}
              >
                <option value="">All modes</option>
                <option value="must">Must use</option>
                <option value="prefer">Prefer</option>
              </select>
            </label>
          </div>
        ) : null}

        {libraryError ? <div className="road-lock-library-error" role="status">{libraryError}</div> : null}

        {visibleLocks.length === 0 ? (
          <div className="road-lock-empty">
            <MapTrifold aria-hidden="true" />
            <strong>No road locks yet</strong>
            <p>Tap a corridor on the map, or import a GPX as a lock from the ride library.</p>
          </div>
        ) : (
          <ul className="road-lock-list">
            {visibleLocks.map((lock) => (
              <RoadLockRow
                key={lock.id}
                lock={lock}
                isHighlighted={activeHighlight === lock.id}
                isEditing={editingId === lock.id}
                isPendingDelete={pendingDeleteId === lock.id}
                onHighlight={(id) => {
                  const next = activeHighlight === id ? null : id
                  setInternalHighlightedLockId(next)
                  onHighlightLock?.(next)
                }}
                onStartEdit={() => setEditingId((current) => (current === lock.id ? null : lock.id))}
                onApplyEdits={(patch) => {
                  updateRoadLock(lock.id, patch)
                  if (library) {
                    void library.save({ ...lock, ...patch }).catch(() => {})
                  }
                  setEditingId(null)
                }}
                onCancelEdit={() => setEditingId(null)}
                onRequestDelete={() => setPendingDeleteId((current) => (current === lock.id ? null : lock.id))}
                onConfirmDelete={async () => {
                  if (library) {
                    try {
                      await library.remove(lock.id)
                    } catch (caught) {
                      setLibraryError(caught instanceof Error ? caught.message : "The lock could not be removed from the library.")
                      setPendingDeleteId(null)
                      return
                    }
                  }
                  removeRoadLock(lock.id)
                  setPendingDeleteId(null)
                }}
                onConvertToPrefer={() => {
                  convertRoadLock(lock.id)
                  setEditingId(null)
                }}
              />
            ))}
          </ul>
        )}
        <footer>
          <strong>{visibleLocks.length}</strong>
          <span>active road lock{visibleLocks.length === 1 ? "" : "s"}</span>
          <button
            type="button"
            className="road-lock-clear"
            aria-label="Clear all road locks"
            onClick={() => {
              usePlannerStore.getState().clearRoadLocks()
              setLibraryLocks([])
            }}
          >
            Clear all
          </button>
        </footer>
      </aside>
      </KeyboardScope>
    </div>
  )
}

interface RoadLockRowProps {
  lock: RoadLock
  isHighlighted: boolean
  isEditing: boolean
  isPendingDelete: boolean
  onHighlight(id: string): void
  onStartEdit(): void
  onApplyEdits(patch: Partial<RoadLock>): void
  onCancelEdit(): void
  onRequestDelete(): void
  onConfirmDelete(): void
  onConvertToPrefer(): void
}

function RoadLockRow({
  lock,
  isHighlighted,
  isEditing,
  isPendingDelete,
  onHighlight,
  onStartEdit,
  onApplyEdits,
  onCancelEdit,
  onRequestDelete,
  onConfirmDelete,
  onConvertToPrefer
}: RoadLockRowProps) {
  const [nameDraft, setNameDraft] = useState(lock.displayName ?? "")
  const [toleranceDraft, setToleranceDraft] = useState(String(lock.fallbackToleranceMeters))
  const provenance = PROVENANCE_META[lock.source]
  const ProvenanceIcon = provenance.icon
  return (
    <li className={`road-lock-row${isHighlighted ? " is-highlighted" : ""}${isPendingDelete ? " is-confirming" : ""}`}>
      <div className="road-lock-row-primary">
        <button
          type="button"
          className="road-lock-row-title"
          aria-pressed={isHighlighted}
          aria-label={`Highlight ${lock.displayName ?? "road lock"} on the map`}
          onClick={() => onHighlight(lock.id)}
        >
          <span className="road-lock-provenance"><ProvenanceIcon aria-hidden="true" /></span>
          <span>
            <small>{provenance.label} · {lock.sourceRegionId}</small>
            <strong>{lock.displayName?.trim() || lock.id}</strong>
          </span>
          <span className="road-lock-mode-badge" data-mode={lock.mode}>{MODE_BADGE[lock.mode]}</span>
        </button>
        {!isPendingDelete ? (
          <div className="road-lock-row-actions">
            <button
              type="button"
              className="icon-tool"
              aria-label={isEditing ? `Cancel edits to ${lock.displayName ?? "lock"}` : `Edit ${lock.displayName ?? "lock"}`}
              aria-pressed={isEditing}
              onClick={isEditing ? onCancelEdit : onStartEdit}
            >
              <PencilSimple aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-tool road-lock-delete"
              aria-label={isPendingDelete ? `Confirm delete ${lock.displayName ?? "lock"}` : `Delete ${lock.displayName ?? "lock"}`}
              aria-pressed={isPendingDelete}
              onClick={onRequestDelete}
            >
              <Trash aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
      {isEditing ? (
        <form
          className="road-lock-edit-form"
          onSubmit={(event) => {
            event.preventDefault()
            const tolerance = Number(toleranceDraft)
            onApplyEdits({
              displayName: nameDraft.trim() || undefined,
              fallbackToleranceMeters: Number.isFinite(tolerance) && tolerance >= 10 ? tolerance : lock.fallbackToleranceMeters
            })
          }}
        >
          <label>
            <span>Name</span>
            <input
              type="text"
              value={nameDraft}
              maxLength={120}
              placeholder="Optional name"
              onChange={(event) => setNameDraft(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Fallback corridor (meters)</span>
            <input
              type="number"
              min={10}
              max={5000}
              step={5}
              value={toleranceDraft}
              onChange={(event) => setToleranceDraft(event.currentTarget.value)}
            />
          </label>
          {lock.mode === "must" ? (
            <button
              type="button"
              className="road-lock-convert"
              onClick={onConvertToPrefer}
            >
              Convert to Prefer
            </button>
          ) : null}
          <div className="road-lock-edit-actions">
            <button type="button" className="ghost" onClick={onCancelEdit}>Cancel</button>
            <button type="submit">Save changes</button>
          </div>
        </form>
      ) : null}
      {isPendingDelete ? (
        <div className="road-lock-confirm">
          <span>Delete this lock?</span>
          <button type="button" onClick={onRequestDelete}>Keep</button>
          <button type="button" className="danger" onClick={onConfirmDelete}>Delete</button>
        </div>
      ) : null}
    </li>
  )
}

// Kept here so reskin tooling can re-theme every match-state swatch in
// one place without hunting across files. The actual lock surfaces on
// the map are rendered by map-drawing.ts using the same tokens.
export { ROAD_LOCK_MATCH_TOKEN, resolveRoadLockMatchColorMap }