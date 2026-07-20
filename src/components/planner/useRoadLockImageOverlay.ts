"use client"

import { useCallback, useState } from "react"
import {
  IMAGE_TRACE_ACCURACY_STATEMENT,
  type RoadLockImageOverlayState
} from "@/lib/roads/road-locks"

type Phase = "upload" | "georeference" | "trace" | "review"

interface RoadLockImageOverlayHookOptions {
  defaultMode?: "must" | "prefer"
  defaultSourceRegionId?: string
  defaultSourceGraphVersion?: string
}

interface RoadLockImageOverlayHookResult {
  open: boolean
  phase: Phase
  state: RoadLockImageOverlayState
  accuracyStatement: string
  openOverlay(): void
  closeOverlay(): void
  setPhase(phase: Phase): void
  resetWorkspace(): void
  patchState(patch: Partial<RoadLockImageOverlayState>): void
}

const EMPTY_STATE: RoadLockImageOverlayState = {
  controlPoints: [],
  translate: { x: 0, y: 0 },
  scale: 1,
  rotationDegrees: 0,
  opacity: 0.65,
  traces: []
}

export function useRoadLockImageOverlay(options: RoadLockImageOverlayHookOptions = {}): RoadLockImageOverlayHookResult {
  const _mode = options?.defaultMode ?? "must"
  const _region = options?.defaultSourceRegionId ?? "image-trace"
  const _graph = options?.defaultSourceGraphVersion ?? "image-trace"
  // Captured for future parity with the inline component path. We
  // currently use the hook only to expose state to the parent shell;
  // the inline `RoadLockImageOverlay` component owns the actual save
  // flow. We surface the defaults so the reskin can introspect them.
  void _mode; void _region; void _graph
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>("upload")
  const [state, setState] = useState<RoadLockImageOverlayState>(EMPTY_STATE)

  const openOverlay = useCallback(() => {
    setOpen(true)
    setPhase("upload")
    setState(EMPTY_STATE)
  }, [])

  const closeOverlay = useCallback(() => {
    setOpen(false)
    setState(EMPTY_STATE)
    setPhase("upload")
  }, [])

  const resetWorkspace = useCallback(() => {
    setState(EMPTY_STATE)
    setPhase("upload")
  }, [])

  const patchState = useCallback((patch: Partial<RoadLockImageOverlayState>) => {
    setState((previous) => ({ ...previous, ...patch }))
  }, [])

  return {
    open,
    phase,
    state,
    accuracyStatement: IMAGE_TRACE_ACCURACY_STATEMENT,
    openOverlay,
    closeOverlay,
    setPhase,
    resetWorkspace,
    patchState
  }
}

export { IMAGE_TRACE_ACCURACY_STATEMENT }
