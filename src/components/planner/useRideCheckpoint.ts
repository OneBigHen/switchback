"use client"

import { useEffect } from "react"
import { getRideIntent, usePlannerStore, LEGACY_PLANNER_STORAGE_KEY, sanitizePersistedState } from "@/stores/planner-store"
import { RideCheckpointStore } from "@/lib/storage/ride-checkpoint"
import { isRideIntent } from "@/lib/domain/ride-intent"

/** Bursts of edits collapse into one write instead of one write per keystroke. */
const SAVE_COALESCE_MS = 200

type RecoveryStatus = ReturnType<typeof usePlannerStore.getState>["recoveryStatus"]

/**
 * Keeps the active ride recoverable.
 *
 * Saves are serialized per mounted planner and compare-and-swapped in
 * IndexedDB, so a second tab can never silently overwrite newer work. Nothing
 * here touches the saved-route library, recordings, road-lock stores or
 * offline packs: draft recovery gets its own database precisely so a bad
 * migration cannot take a rider's saved rides with it.
 */
export function useRideCheckpoint(): void {
  useEffect(() => {
    const database = new RideCheckpointStore()
    let disposed = false
    let token: string | null = null
    let blocked = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let unsubscribe = () => {}
    let queue = Promise.resolve()
    const initialIdentity = usePlannerStore.getState().rideHistory.identity

    const setStatus = (recoveryStatus: RecoveryStatus) => {
      if (!disposed) usePlannerStore.setState({ recoveryStatus })
    }

    const write = () => {
      const state = usePlannerStore.getState()
      const snapshot = {
        rideId: state.rideHistory.rideId,
        identity: state.rideHistory.identity,
        sequence: state.rideHistory.sequence,
        intent: getRideIntent(state)
      }
      queue = queue.then(async () => {
        if (blocked || disposed) return
        const result = await database.save(snapshot, token)
        if (result.status === "saved") {
          token = result.token
          return
        }
        // Stop writing rather than fight for the record: another tab owns it,
        // or this device cannot store the draft at all. Either way the rider
        // is told instead of quietly losing recovery.
        blocked = true
        setStatus(result.status === "conflict" ? "conflict"
          : result.status === "invalid" ? "invalid" : "unavailable")
      })
    }

    const save = () => {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; write() }, SAVE_COALESCE_MS)
    }

    const watch = () => {
      unsubscribe = usePlannerStore.subscribe((state, previous) => {
        if (state.rideHistory.identity !== previous.rideHistory.identity) save()
      })
      write()
    }

    /**
     * Adopt ride *preferences* from the pre-Wave-1 planner blob exactly once,
     * when there is no checkpoint yet. Saved places and searches migrate
     * through the store's own storage bridge; the legacy key itself is only
     * ever read.
     */
    const adoptLegacyPreferences = () => {
      try {
        const raw = localStorage.getItem(LEGACY_PLANNER_STORAGE_KEY)
        if (!raw) return
        const legacy = sanitizePersistedState((JSON.parse(raw) as { state?: unknown }).state)
        const state = usePlannerStore.getState()
        if (state.rideHistory.identity !== initialIdentity) return
        const intent = {
          ...getRideIntent(state),
          ...(legacy.profile ? { profile: legacy.profile } : {}),
          ...(legacy.bikeProfile ? { bikeProfile: legacy.bikeProfile } : {}),
          ...(legacy.roadLocks ? { roadLocks: legacy.roadLocks } : {})
        }
        // Recovered defaults are not a ride change the rider made, so they
        // must not become the first thing Undo reverses.
        if (isRideIntent(intent)) state.editRide(intent, "Recovered your ride preferences", "settings", false)
      } catch {
        // Missing or unreadable legacy data never erases a current draft.
      }
    }

    void database.load().then((loaded) => {
      if (disposed) return
      if (loaded.status === "restored") {
        token = loaded.checkpoint.token
        if (usePlannerStore.getState().restoreRide(loaded.checkpoint, initialIdentity)) {
          watch()
          return
        }
        // The rider authored something before the read came back. Their ride
        // wins and the older draft is dropped — this is not a cross-tab
        // conflict, and checkpointing must keep running for what they have
        // now, or the ride they can actually see stops being recoverable.
        setStatus("superseded")
        watch()
        return
      }
      if (loaded.status === "empty") {
        adoptLegacyPreferences()
        setStatus("ready")
        watch()
        return
      }
      setStatus(loaded.status === "unavailable" ? "unavailable" : "invalid")
    }).catch(() => setStatus("unavailable"))

    return () => {
      unsubscribe()
      // Flush a coalesced save before tearing down, or the rider's last edit
      // before navigating away would be the one edit that never got saved.
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
        write()
      }
      disposed = true
      void queue.finally(() => database.close())
    }
  }, [])
}
