import { useCallback, useEffect, useRef, useState } from "react"
import { requestRoadMatch } from "@/lib/client/road-match-client"
import { featureFlags } from "@/lib/domain/feature-flags"
import { createManualRoadLock, type RoadLock, type RoadLockMode } from "@/lib/roads/road-locks"
import { roadMatchToAccessSnapshot } from "@/lib/roads/road-matching"
import type { RoadAccessSnapshot } from "@/lib/roads/road-access"
import type { Coordinate } from "@/lib/routing/types"
import { subscribeMapEdit } from "./map-edit-command"
import { snapRouteTapToRoutableEdge } from "./map-drawing"

export type RoadLockDraftStep = "first" | "second" | "naming"

export interface UseRoadLockDraftInput {
  addRoadLock(lock: RoadLock): void
  matchRoad?: typeof requestRoadMatch
  /**
   * Called once after a lock committed from a *sculpt* gesture. Dragging the
   * route is a direct request to change it, so that path replans on its own.
   * The tap-to-draw flow deliberately does not fire this: there the rider
   * builds a lock and decides for themselves when to replan.
   */
  onSculptCommitted?(lock: RoadLock): void | Promise<void>
}

export interface RoadLockDraftState {
  lockDrawMode: boolean
  lockAnchors: Coordinate[]
  lockMode: RoadLockMode
  lockName: string
  lockDraftStep: RoadLockDraftStep
  lockDraftMessage: string
  beginLockDraft(): void
  /** Seed an existing map gesture into the ordinary road-lock review flow. */
  beginLockDraftFromAnchors(anchors: Coordinate[], mode?: RoadLockMode): void
  isLockDrawActive(): boolean
  resetLockDraft(): void
  handleLockDrawTap(point: { lat: number; lon: number }): void
  commitLockDraft(): Promise<void>
  setLockMode(mode: RoadLockMode): void
  setLockName(name: string): void
}

interface RoadLockDraftRef {
  active: boolean
  step: RoadLockDraftStep
  anchors: Coordinate[]
  mode: RoadLockMode
  name: string
  /** Which gesture opened this draft. Only "sculpt" replans on its own. */
  origin: "manual" | "sculpt"
}

/**
 * Permissive access snapshot for a manually drawn road lock. A graph match
 * replaces this with the real snapshot; the fallback stays explicitly
 * unknown but routable and never claims a legal access tag.
 */
function defaultManualLockAccessSnapshot(): RoadAccessSnapshot {
  return {
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
  }
}

export function useRoadLockDraft({
  addRoadLock,
  matchRoad = requestRoadMatch,
  onSculptCommitted
}: UseRoadLockDraftInput): RoadLockDraftState {
  const [lockDrawMode, setLockDrawMode] = useState(false)
  const [lockAnchors, setLockAnchors] = useState<Coordinate[]>([])
  const [lockMode, setLockModeState] = useState<RoadLockMode>(featureFlags.roadRequirements ? "must" : "prefer")
  const [lockName, setLockNameState] = useState("")
  const [lockDraftStep, setLockDraftStep] = useState<RoadLockDraftStep>("first")
  const [lockDraftMessage, setLockDraftMessage] = useState("")
  const lockDrawRef = useRef<RoadLockDraftRef>({
    active: false,
    step: "first",
    anchors: [],
    mode: featureFlags.roadRequirements ? "must" : "prefer",
    name: "",
    origin: "manual"
  })

  useEffect(() => {
    lockDrawRef.current = {
      active: lockDrawMode,
      step: lockDraftStep,
      anchors: lockAnchors,
      // Must mode is disabled until graph-matched road requirements ship;
      // clamp any legacy "must" draft so it cannot silently become a lock
      // the provider model would misinterpret (SB-006 containment).
      mode: featureFlags.roadRequirements ? lockMode : "prefer",
      name: lockName,
      // Origin has no state mirror: it is set once by whichever begin* call
      // opened the draft, and this effect must not reset it to a default.
      origin: lockDrawRef.current.origin
    }
  }, [lockDrawMode, lockDraftStep, lockAnchors, lockMode, lockName])

  const resetLockDraft = useCallback(() => {
    const defaultMode: RoadLockMode = featureFlags.roadRequirements ? "must" : "prefer"
    lockDrawRef.current = {
      active: false,
      step: "first",
      anchors: [],
      mode: defaultMode,
      name: "",
      origin: "manual"
    }
    setLockDrawMode(false)
    setLockAnchors([])
    setLockDraftStep("first")
    setLockDraftMessage("")
    setLockNameState("")
    // Match the initial-state clamp above: must mode only when road
    // requirements are enabled, otherwise every draft (including the one
    // after a reset) starts in prefer mode (SB-006 containment).
    setLockModeState(defaultMode)
  }, [])

  const beginLockDraft = useCallback(() => {
    const mode: RoadLockMode = featureFlags.roadRequirements ? "must" : "prefer"
    lockDrawRef.current = { active: true, step: "first", anchors: [], mode, name: "", origin: "manual" }
    setLockDrawMode(true)
    setLockAnchors([])
    setLockModeState(mode)
    setLockNameState("")
    setLockDraftStep("first")
    setLockDraftMessage("Choose the first road point, then choose the corridor end.")
  }, [])

  const beginLockDraftFromAnchors = useCallback((anchors: Coordinate[], requestedMode: RoadLockMode = "prefer") => {
    const snapped = anchors.slice(0, 2).map((coordinate) => snapRouteTapToRoutableEdge(coordinate).coordinate)
    const mode: RoadLockMode = featureFlags.roadRequirements ? requestedMode : "prefer"
    const step: RoadLockDraftStep = snapped.length >= 2 ? "naming" : snapped.length === 1 ? "second" : "first"
    const message = step === "naming"
      ? "Review this road corridor, choose how strongly to use it, then save."
      : step === "second"
        ? "First road point set. Choose the corridor end."
        : "Choose the first road point, then choose the corridor end."

    // The map can seed a draft and immediately receive a follow-up event before
    // React's effect mirrors state. Keep the imperative event ref authoritative
    // in the same turn so a sculpted corridor can never lose an anchor.
    lockDrawRef.current = { active: true, step, anchors: snapped, mode, name: "", origin: "sculpt" }
    setLockDrawMode(true)
    setLockAnchors(snapped)
    setLockModeState(mode)
    setLockNameState("")
    setLockDraftStep(step)
    setLockDraftMessage(message)
  }, [])

  // The command bridge publishes one desired contextual map-edit mode. Road
  // preference owns its draft here, and an area-exclusion command explicitly
  // tears that draft down so the two map interaction surfaces cannot compete.
  useEffect(() => subscribeMapEdit((command) => {
    if (command === "prefer-road") beginLockDraft()
    else resetLockDraft()
  }), [beginLockDraft, resetLockDraft])

  const isLockDrawActive = useCallback(() => lockDrawRef.current.active, [])

  // Advancing the draft step and message are separate state updates, so they
  // must not run inside the setLockAnchors updater: React may invoke an
  // updater during render (and does so twice under StrictMode), which turns
  // them into "setState while rendering a different component". The draft ref
  // already mirrors the committed anchors and step — this handler was already
  // reading `step` from it — so the whole transition is decided here and each
  // piece of state is set once, from the event.
  const handleLockDrawTap = useCallback((point: { lat: number; lon: number }) => {
    const coordinate: Coordinate = [point.lon, point.lat]
    const snap = snapRouteTapToRoutableEdge(coordinate)
    const { step, anchors } = lockDrawRef.current

    if (step === "first") {
      const nextAnchors = [snap.coordinate]
      lockDrawRef.current = { ...lockDrawRef.current, anchors: nextAnchors, step: "second" }
      setLockAnchors(nextAnchors)
      setLockDraftStep("second")
      setLockDraftMessage("First road point set. Choose the corridor end.")
      return
    }

    if (step === "second") {
      // Reject a duplicate first/last tap; the rider must place two distinct anchors.
      const first = anchors[0]
      if (anchors.length === 1 && first && snap.coordinate[0] === first[0] && snap.coordinate[1] === first[1]) {
        return
      }
      const nextAnchors = [...anchors, snap.coordinate]
      lockDrawRef.current = { ...lockDrawRef.current, anchors: nextAnchors, step: "naming" }
      setLockAnchors(nextAnchors)
      setLockDraftStep("naming")
      setLockDraftMessage("Name this road preference (optional) and save.")
    }
  }, [])

  const finishCommittedLock = useCallback(async (lock: RoadLock) => {
    // Read the origin before the reset clears it.
    const sculpted = lockDrawRef.current.origin === "sculpt"
    addRoadLock(lock)
    resetLockDraft()
    if (!sculpted) return
    // The lock is already committed at this point. The ordinary planner owns
    // any replan failure UI, so a transport error must not reopen or duplicate
    // a successfully saved lock.
    try {
      await onSculptCommitted?.(lock)
    } catch {
      // Intentionally contained; planner request state surfaces its own error.
    }
  }, [addRoadLock, onSculptCommitted, resetLockDraft])

  const commitLockDraft = useCallback(async () => {
    const draft = lockDrawRef.current
    if (draft.anchors.length < 2) {
      setLockDraftMessage("Place two corridor points before saving the road preference.")
      return
    }
    const displayName = draft.name.trim() || undefined
    const [entry, exit] = draft.anchors
    if (!entry || !exit) {
      setLockDraftMessage("Place two corridor points before saving the road preference.")
      return
    }
    try {
      // SB-013/014: when road requirements are enabled, the browser graph-matches
      // the two anchors against the live router so the lock carries real edge ids
      // and ordered geometry. Matching is required for must locks; prefer locks
      // may fall back to an explicitly approximate manual lock.
      if (featureFlags.roadRequirements) {
        try {
          const matched = await matchRoad({
            start: { lat: entry[1], lon: entry[0], label: "Road preference entry" },
            end: { lat: exit[1], lon: exit[0], label: "Road preference exit" }
          })
          const lock = createManualRoadLock({
            mode: draft.mode,
            displayName,
            edgeIds: matched.edgeIds,
            geometry: matched.geometry,
            orderedAnchors: draft.anchors,
            accessSnapshot: roadMatchToAccessSnapshot(matched.access),
            sourceRegionId: "matched",
            sourceGraphVersion: matched.graphVersion
          })
          await finishCommittedLock(lock)
          return
        } catch (caught) {
          if (draft.mode !== "prefer") throw caught
        }
      }
      const geometry: Coordinate[] = draft.anchors.map(([lon, lat]) => [lon, lat] as Coordinate)
      const lock = createManualRoadLock({
        mode: draft.mode,
        displayName,
        edgeIds: [],
        geometry,
        orderedAnchors: draft.anchors,
        accessSnapshot: defaultManualLockAccessSnapshot(),
        sourceRegionId: "manual",
        sourceGraphVersion: "manual"
      })
      await finishCommittedLock(lock)
    } catch (caught) {
      setLockDraftMessage(caught instanceof Error ? caught.message : "The road preference could not be saved.")
    }
  }, [finishCommittedLock, matchRoad])

  const setLockMode = useCallback((mode: RoadLockMode) => {
    const next = featureFlags.roadRequirements ? mode : "prefer"
    lockDrawRef.current = { ...lockDrawRef.current, mode: next }
    setLockModeState(next)
  }, [])

  const setLockName = useCallback((name: string) => {
    lockDrawRef.current = { ...lockDrawRef.current, name }
    setLockNameState(name)
  }, [])

  return {
    lockDrawMode,
    lockAnchors,
    lockMode,
    lockName,
    lockDraftStep,
    lockDraftMessage,
    beginLockDraft,
    beginLockDraftFromAnchors,
    isLockDrawActive,
    resetLockDraft,
    handleLockDrawTap,
    commitLockDraft,
    setLockMode,
    setLockName
  }
}