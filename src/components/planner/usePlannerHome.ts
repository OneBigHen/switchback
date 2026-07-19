"use client"

import { useCallback, useState } from "react"
import {
  clearPlannerHome,
  readPlannerHome,
  savePlannerHome
} from "@/lib/client/planner-location"
import type { Waypoint } from "@/lib/routing/types"

type PlannerNotice = { kind: "success" | "warning"; message: string }

interface UsePlannerHomeOptions {
  invalidateRequests(): void
  setStart(point: Waypoint): void
  onNotice(notice: PlannerNotice): void
}

function loadPlannerHome(): Waypoint | null {
  if (typeof window === "undefined") return null
  try {
    return readPlannerHome(window.localStorage)
  } catch {
    return null
  }
}

/**
 * Keeps the rider's explicit Home location local to this browser while
 * exposing planner-safe actions for the route editor and prompt resolver.
 */
export function usePlannerHome({ invalidateRequests, setStart, onNotice }: UsePlannerHomeOptions) {
  const [home, setHome] = useState<Waypoint | null>(loadPlannerHome)

  const useHome = useCallback(() => {
    if (!home) return
    invalidateRequests()
    setStart(home)
    onNotice({ kind: "success", message: "Using your saved Home as the route start." })
  }, [home, invalidateRequests, onNotice, setStart])

  const saveHome = useCallback((start: Waypoint | null) => {
    if (!start) return
    try {
      savePlannerHome(window.localStorage, start)
      setHome({ ...start, label: "Home" })
      onNotice({ kind: "success", message: "Home saved only in this browser." })
    } catch {
      onNotice({ kind: "warning", message: "This browser could not save Home locally." })
    }
  }, [onNotice])

  const clearHome = useCallback(() => {
    try {
      clearPlannerHome(window.localStorage)
    } catch {
      // The in-memory control still reflects the rider's explicit removal.
    }
    setHome(null)
    onNotice({ kind: "success", message: "Saved Home removed from this browser." })
  }, [onNotice])

  return { home, useHome, saveHome, clearHome }
}
