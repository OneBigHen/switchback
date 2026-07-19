"use client"

import { useCallback, useEffect, useRef } from "react"
import { requestRideResearch } from "@/lib/client/ride-research-client"
import type { RideResearchSource } from "@/lib/ai/ride-research"

type PlannerNotice = { kind: "success" | "warning"; message: string }

interface UsePlannerRideResearchOptions {
  setStatus(status: "idle" | "researching"): void
  setSources(sources: RideResearchSource[]): void
  setSummary(summary: string): void
  onNotice(notice: PlannerNotice): void
}

/** Keeps optional web research cancellable and prevents stale results from repainting the planner. */
export function usePlannerRideResearch({ setStatus, setSources, setSummary, onNotice }: UsePlannerRideResearchOptions) {
  const activeRequestRef = useRef<AbortController | null>(null)

  useEffect(() => () => activeRequestRef.current?.abort(), [])

  const cancel = useCallback(() => {
    activeRequestRef.current?.abort()
    activeRequestRef.current = null
    setStatus("idle")
  }, [setStatus])

  const researchRideIdea = useCallback(async (prompt: string) => {
    activeRequestRef.current?.abort()
    const controller = new AbortController()
    activeRequestRef.current = controller
    setStatus("researching")
    try {
      const sources = await requestRideResearch(prompt, fetch, controller.signal)
      if (activeRequestRef.current !== controller) return
      setSources(sources)
      setSummary(`Found ${sources.length} current road or stop ideas. Refine the prompt and research again whenever you want another angle.`)
    } catch (caught) {
      if (activeRequestRef.current !== controller || controller.signal.aborted) return
      onNotice({ kind: "warning", message: caught instanceof Error ? caught.message : "Web ride research is unavailable." })
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null
        setStatus("idle")
      }
    }
  }, [onNotice, setSources, setStatus, setSummary])

  return { researchRideIdea, cancel }
}
