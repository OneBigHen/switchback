# Wave 1 migration — what moved, and what a rider keeps

Wave 1 moved active ride intent out of React component state and localStorage
and into one owner with its own recovery store. Nothing a rider had saved is
deleted, and nothing is rewritten in place.

## Storage

| Store | Before | After |
|---|---|---|
| `switchback.planner.v1` (localStorage) | Ride profile, bike profile, kept roads, saved places, recent searches, curvature toggle | **Read-only.** Never written or deleted again. It is the rollback source. |
| `switchback.planner.ui.v1` (localStorage) | — | Saved places, recent searches, curvature toggle only |
| `switchback-ride-intent` (IndexedDB) | — | The active ride's authored intent, one record, compare-and-swapped |
| Saved routes, recordings, road-lock library, offline packs | Their own stores | **Untouched.** Wave 1 opens none of them. |

**Why a new localStorage key.** Ride intent no longer belongs in localStorage,
and the old key's shape says otherwise. Keeping the legacy record intact — rather
than migrating it in place — means a rollback finds exactly what it left.

**How nothing is lost.** The persist middleware reads the new key first; when it
is absent it falls back to the legacy blob and adopts only the validated UI index
(saved places, searches, curvature). This happens in the store's own storage
layer, so it works even on a device where IndexedDB is unavailable and ride
recovery never starts. Ride *preferences* (road feel, bike profile, kept roads)
are adopted separately, once, by the checkpoint hook when no checkpoint exists
yet — as initialization, so they never become the rider's first Undo.

## Behaviour a rider will notice

- **Editing no longer blanks the map.** Changing road feel, duration, highways,
  surfaces, avoid areas or kept roads keeps the current route on screen until a
  replacement is ready.
- **Failed updates keep both halves.** The attempted ride stays current, the last
  usable route stays visible, and the summary offers *Try this change again* and
  *Cancel ride change*.
- **Undo is ride-level.** One rider decision — including compound ones like a ride
  prompt, an Advisor hand-off or a duration preset — is one undo step.
- **Refresh restores the ride.** The intent comes back and the route is re-asked
  for automatically.
- **A second tab cannot silently overwrite newer work.** The losing tab stops
  writing and says so, with a reload action.

## Rolling back

1. Revert the branch. No forward migration has to be undone.
2. `switchback.planner.v1` still holds the pre-Wave-1 profile, bike profile,
   kept roads, saved places and searches, so the old planner rehydrates as before.
3. `switchback-ride-intent` becomes an orphaned IndexedDB database. It holds only
   draft intent — no library data — and can be deleted or left alone.

## Contract changes that touched existing tests

Each was a deliberate product decision, not a test accommodation:

- `planner-store`: preference and point edits keep the committed plan instead of
  clearing it. Tests asserting `plan: null` after an edit were rewritten to assert
  the plan survives and a new intent revision exists.
- `ride-checkpoint`: sequence numbers are no longer a conflict rule (the write
  token is), and the checkpoint stores no derived result. Two tests changed accordingly.
- `useRideCheckpoint`: a recovery that loses a race with the rider is `superseded`,
  not `conflict`, and checkpointing continues.
- Ride time is one command (`onRideTimeChange`) instead of `onTargetMinutesChange`
  plus `onTimeShapedChange`, and the custom-duration field commits on blur/Enter
  rather than per keystroke.
- Undo/redo are ride-level commands (`onUndoRideChange` / `onRedoRideChange`,
  labelled "Undo ride change"), not waypoint actions.
- `cancelPlanning()` no longer reports a cancellation when nothing was in flight.
- `planner.spec.ts` opened route details through a control the Wave 0 decision rail
  had already replaced. The locators were updated to the shipped flow; the same
  failures reproduce on the untouched branch base (`6744b01`).
