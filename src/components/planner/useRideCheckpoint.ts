"use client"

import { useEffect } from "react"
import { getRideIntent, usePlannerStore, LEGACY_PLANNER_STORAGE_KEY, sanitizePersistedState } from "@/stores/planner-store"
import { RideCheckpointStore } from "@/lib/storage/ride-checkpoint"
import { defaultRideIntent, isRideIntent } from "@/lib/domain/ride-intent"
import { bikeProfileFromRiderSettings, loadRiderSettings } from "@/lib/settings/rider-settings"

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

    const write = (allowAfterDispose = false) => {
      const state = usePlannerStore.getState()
      const snapshot = {
        rideId: state.rideHistory.rideId,
        identity: state.rideHistory.identity,
        sequence: state.rideHistory.sequence,
        intent: getRideIntent(state)
      }
      queue = queue.then(async () => {
        if (blocked || (disposed && !allowAfterDispose)) return
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
        if (state.rideHistory.identity !== previous.rideHistory.identity) {
          // "restored" describes the checkpoint adoption event, not a mode the
          // tab remains in forever. The first later ride revision belongs to
          // the rider, so settle recovery before PlannerShell can interpret
          // that revision as another recovered ride and auto-plan underneath it.
          if (state.recoveryStatus === "restored" && previous.recoveryStatus === "restored") {
            usePlannerStore.setState({ recoveryStatus: "ready" })
          }
          save()
        }
      })
      write()
    }

    /**
     * Same identity alone is not proof that a ride is untouched: tests,
     * hydration adapters, or future bootstrap code can project authored fields
     * without advancing history. Defaults may only seed the exact domain
     * baseline, never an already-authored ride.
     */
    const isPristineRide = () => {
      const state = usePlannerStore.getState()
      return state.rideHistory.identity === initialIdentity
        && state.rideHistory.sequence === 0
        && state.rideHistory.past.length === 0
        && state.rideHistory.future.length === 0
        && state.plan === null
        && state.status === "idle"
        && JSON.stringify(getRideIntent(state)) === JSON.stringify(defaultRideIntent())
    }

    /**
     * Apply the current rider defaults while recovery still owns the bootstrap
     * boundary. `ready` must mean more than "IndexedDB returned empty": it must
     * also mean the first rider interaction will see the settings they saved.
     */
    const applyRiderDefaults = () => {
      if (!isPristineRide()) return
      const state = usePlannerStore.getState()
      const settings = loadRiderSettings()
      state.editRide({
        profile: settings.defaultProfile,
        bikeProfile: bikeProfileFromRiderSettings(settings),
        avoidHighways: settings.defaultAvoidHighways
      }, "Applied your rider defaults", "settings", false)
    }

    /**
     * Adopt ride *preferences* from the pre-Wave-1 planner blob exactly once,
     * when there is no checkpoint yet. Saved places and searches migrate
     * through the store's own storage bridge; the legacy key itself is only
     * ever read.
     */
    const adoptLegacyPreferences = (): boolean => {
      try {
        if (!isPristineRide()) return false
        const raw = localStorage.getItem(LEGACY_PLANNER_STORAGE_KEY)
        if (!raw) return false
        const legacy = sanitizePersistedState((JSON.parse(raw) as { state?: unknown }).state)
        const state = usePlannerStore.getState()
        const intent = {
          ...getRideIntent(state),
          ...(legacy.profile ? { profile: legacy.profile } : {}),
          ...(legacy.bikeProfile ? { bikeProfile: legacy.bikeProfile } : {}),
          ...(legacy.roadLocks ? { roadLocks: legacy.roadLocks } : {})
        }
        // Recovered defaults are not a ride change the rider made, so they
        // must not become the first thing Undo reverses.
        if (!isRideIntent(intent)) return false
        return state.editRide(intent, "Recovered your ride preferences", "settings", false) === "applied"
      } catch {
        // Missing or unreadable legacy data never erases a current draft.
        return false
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
        // A legacy ride preference wins exactly as it did before Wave 1. When
        // there is no legacy preference, seed the current versioned settings
        // before making the planner interactive.
        if (!adoptLegacyPreferences()) applyRiderDefaults()
        setStatus("ready")
        watch()
        return
      }
      // Storage failure must not also make the first route ignore the rider's
      // settings. There is no checkpoint to adopt in these branches, so use
      // the same current defaults before releasing the bootstrap gate.
      applyRiderDefaults()
      setStatus(loaded.status === "unavailable" ? "unavailable" : "invalid")
    }).catch(() => {
      applyRiderDefaults()
      setStatus("unavailable")
    })

    return () => {
      unsubscribe()
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      // Always enqueue the final current snapshot before marking the hook
      // disposed. This write is allowed to complete after unmount; only UI
      // status updates are suppressed after disposal.
      write(true)
      disposed = true
      void queue.finally(() => database.close())
    }
  }, [])
}
