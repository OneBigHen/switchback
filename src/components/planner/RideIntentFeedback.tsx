"use client"

import { getRideIntent, usePlannerStore } from "@/stores/planner-store"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "./PlannerDeckViewModel"
import styles from "./RideIntentFeedback.module.css"

/**
 * The rider's ride, in their words, plus the one action the current state
 * calls for. Everything here is read from the canonical intent, the committed
 * result and the recovery status — so it can only ever describe what those
 * three actually say.
 */
export function RideIntentFeedback({
  viewModel,
  commands
}: {
  viewModel: PlannerDeckViewModel
  commands: PlannerDeckCommands
}) {
  const minutes = usePlannerStore((state) => state.targetMinutes)
  const highways = usePlannerStore((state) => state.avoidHighways)
  const gravel = usePlannerStore((state) => state.bikeProfile.allowMaintainedGravel)
  const recovery = usePlannerStore((state) => state.recoveryStatus)
  const start = usePlannerStore((state) => state.start)
  const plan = usePlannerStore((state) => state.plan)
  const mode = usePlannerStore((state) => state.mode)
  const shaped = usePlannerStore((state) => state.timeShaped)
  const updating = usePlannerStore((state) => state.isRecalculating)
  const failed = usePlannerStore((state) => state.status === "error")
  const currentIntentKey = usePlannerStore((state) => JSON.stringify(getRideIntent(state)))
  const committedIntentKey = usePlannerStore((state) => state.committedRide
    ? JSON.stringify(state.committedRide.intent)
    : null)

  const { canUndoRideChange, canRedoRideChange, lastChangeLabel } = viewModel.rideHistory
  const { onUndoRideChange, onRedoRideChange } = commands.rideHistory
  // Identity says which calculation produced a route; the rider-facing action
  // asks a different question: does the shown route answer the ride currently
  // authored? Cancel restores the same intent with a fresh revision identity,
  // so compare the canonical intents here instead of forcing a second Cancel.
  const hasUnappliedChange = Boolean(plan && committedIntentKey && currentIntentKey !== committedIntentKey)
  // A failed update is only a *recoverable* failure while a usable route is
  // still on screen to fall back to.
  const updateFailed = failed && Boolean(plan)

  const startBackroads = () => {
    const state = usePlannerStore.getState()
    const outcome = state.editRide({
      mode: "loop",
      finish: null,
      targetMinutes: 90,
      timeShaped: true,
      profile: "twisty",
      avoidHighways: true,
      bikeProfile: { ...state.bikeProfile, allowMaintainedGravel: true, allowRoughTracks: false }
    }, "90-minute backroads ride")
    if (outcome === "applied" && usePlannerStore.getState().start) commands.onPlan()
  }

  // An untouched planner has nothing to summarise: the composer already says
  // what kind of ride this is, and the idle Plan panel has a hard height budget
  // it must not spend restating defaults.
  const hasSomethingToReport = Boolean(plan) || canUndoRideChange || canRedoRideChange
    || updateFailed || recovery === "restored" || recovery === "conflict"
    || recovery === "invalid" || recovery === "unavailable"

  const statusLine = updating ? "Updating your ride…"
    : updateFailed ? "Couldn’t update this ride. You’re still looking at your last one."
    : lastChangeLabel ?? (start ? "Ready when you are" : "Choose a start to find your ride")

  if (!hasSomethingToReport) return null

  return (
    <section className={styles.summary} aria-label="Your ride">
      <div className={styles.heading}>
        <span>Your ride</span>
        {recovery === "restored" ? <span className={styles.restored}>Ride restored</span> : null}
      </div>
      <p className={styles.description}>
        {mode === "loop" || shaped ? `${minutes} min` : "Destination ride"}
        {highways ? " · No highways" : ""}{gravel ? " · Mixed surfaces" : " · Pavement"}
      </p>
      {gravel ? <p className={styles.detail}>Unpaved difficulty depends on available evidence.</p> : null}
      <div className={styles.actions}>
        {!plan ? (
          <button type="button" onClick={startBackroads} disabled={recovery === "loading"}>90-minute backroads</button>
        ) : null}
        {/* Nothing has been changed yet, so there is nothing to reverse: two
            permanently disabled controls are noise on the most crowded surface
            the app has. The Ride options panel carries the same pair, and it
            renders only while the route editor is open — this strip is hidden
            then, so exactly one "Undo ride change" control exists at any moment. */}
        {canUndoRideChange || canRedoRideChange ? (
          <>
            <button type="button" aria-label="Undo ride change" onClick={onUndoRideChange} disabled={!canUndoRideChange}>Undo</button>
            <button type="button" aria-label="Redo ride change" onClick={onRedoRideChange} disabled={!canRedoRideChange}>Redo</button>
          </>
        ) : null}
        {updateFailed ? (
          <button type="button" onClick={commands.onPlan}>Try this change again</button>
        ) : null}
        {hasUnappliedChange && !updating && !updateFailed && start ? (
          <button type="button" onClick={commands.onPlan}>Update ride</button>
        ) : null}
        {hasUnappliedChange && !updating ? (
          <button type="button" aria-label="Cancel ride change" onClick={commands.onCancelRideChange}>Cancel change</button>
        ) : null}
      </div>
      <p className={styles.detail} role="status">{statusLine}</p>
      {recovery === "unavailable" ? (
        <p role="status">This ride cannot be saved on this device right now. Keep this tab open.</p>
      ) : null}
      {recovery === "invalid" ? (
        <p role="status">The saved draft could not be safely restored. Your saved library is unchanged.</p>
      ) : null}
      {recovery === "conflict" ? (
        <div role="alert">
          <p>Another tab saved a newer ride. This tab’s changes have not overwritten it.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload the saved ride</button>
        </div>
      ) : null}
    </section>
  )
}
