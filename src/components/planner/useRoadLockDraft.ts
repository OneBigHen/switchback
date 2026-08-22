import { useCallback, useEffect, useRef, useState } from "react"
import { requestRoadMatch } from "@/lib/client/road-match-client"
import { featureFlags } from "@/lib/domain/feature-flags"
import { createManualRoadLock, type RoadLock, type RoadLockMode } from "@/lib/roads/road-locks"
import { roadMatchToAccessSnapshot } from "@/lib/roads/road-matching"
import type { RoadAccessSnapshot } from "@/lib/roads/road-access"
import type { Coordinate } from "@/lib/routing/types"
import { snapRouteTapToRoutableEdge } from "./map-drawing"

export type RoadLockDraftStep = "first" | "second" | "naming"

export interface UseRoadLockDraftInput {
  addRoadLock(lock: RoadLock): void
  matchRoad?: typeof requestRoadMatch
}

export interface RoadLockDraftState {
  lockDrawMode: boolean
  lockAnchors: Coordinate[]
  lockMode: RoadLockMode
  lockName: string
  lockDraftStep: RoadLockDraftStep
  lockDraftMessage: string
  beginLockDraft(): void
  isLockDrawActive(): boolean
  resetLockDraft(): void
  handleLockDrawTap(point: { lat: number; lon: number }): void
  commitLockDraft(): Promise<void>
  setLockMode(mode: RoadLockMode): void
  setLockName(name: string): void
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

export function useRoadLockDraft({ addRoadLock, matchRoad = requestRoadMatch }: UseRoadLockDraftInput): RoadLockDraftState {
  const [lockDrawMode, setLockDrawMode] = useState(false)
  const [lockAnchors, setLockAnchors] = useState<Coordinate[]>([])
  const [lockMode, setLockMode] = useState<RoadLockMode>(featureFlags.roadRequirements ? "must" : "prefer")
  const [lockName, setLockName] = useState("")
  const [lockDraftStep, setLockDraftStep] = useState<RoadLockDraftStep>("first")
  const [lockDraftMessage, setLockDraftMessage] = useState("")
  const lockDrawRef = useRef({
    active: false,
    step: "first" as RoadLockDraftStep,
    anchors: [] as Coordinate[],
    mode: "must" as RoadLockMode,
    name: ""
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
      name: lockName
    }
  }, [lockDrawMode, lockDraftStep, lockAnchors, lockMode, lockName])

  const resetLockDraft = useCallback(() => {
    setLockDrawMode(false)
    setLockAnchors([])
    setLockDraftStep("first")
    setLockDraftMessage("")
    setLockName("")
    setLockMode("must")
  }, [])

  const beginLockDraft = useCallback(() => {
    setLockDrawMode(true)
    setLockDraftStep("first")
    setLockDraftMessage("Choose the first road point, then choose the corridor end.")
  }, [])

  const isLockDrawActive = useCallback(() => lockDrawRef.current.active, [])

  const handleLockDrawTap = useCallback((point: { lat: number; lon: number }) => {
    const coordinate: Coordinate = [point.lon, point.lat]
    const snap = snapRouteTapToRoutableEdge(coordinate)
    setLockAnchors((previous) => {
      if (lockDrawRef.current.step === "first") {
        const next = [snap.coordinate] as Coordinate[]
        setLockDraftStep("second")
        setLockDraftMessage("First anchor set. Choose the corridor end.")
        return next
      }
      if (lockDrawRef.current.step === "second") {
        // Reject a duplicate first/last tap; the rider must place two distinct anchors.
        if (previous.length === 1 && snap.coordinate[0] === previous[0]![0] && snap.coordinate[1] === previous[0]![1]) {
          return previous
        }
        const next = [...previous, snap.coordinate] as Coordinate[]
        setLockDraftStep("naming")
        setLockDraftMessage("Name the lock (optional) and save.")
        return next
      }
      return previous
    })
  }, [])

  const commitLockDraft = useCallback(async () => {
    const draft = lockDrawRef.current
    if (draft.anchors.length < 2) {
      setLockDraftMessage("Place two corridor anchors before saving the lock.")
      return
    }
    const displayName = draft.name.trim() || undefined
    const [entry, exit] = draft.anchors
    if (!entry || !exit) {
      setLockDraftMessage("Place two corridor anchors before saving the lock.")
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
            start: { lat: entry[1], lon: entry[0], label: "Lock entry" },
            end: { lat: exit[1], lon: exit[0], label: "Lock exit" }
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
          addRoadLock(lock)
          resetLockDraft()
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
      addRoadLock(lock)
      resetLockDraft()
    } catch (caught) {
      setLockDraftMessage(caught instanceof Error ? caught.message : "The road lock could not be saved.")
    }
  }, [addRoadLock, matchRoad, resetLockDraft])

  return {
    lockDrawMode,
    lockAnchors,
    lockMode,
    lockName,
    lockDraftStep,
    lockDraftMessage,
    beginLockDraft,
    isLockDrawActive,
    resetLockDraft,
    handleLockDrawTap,
    commitLockDraft,
    setLockMode,
    setLockName
  }
}
