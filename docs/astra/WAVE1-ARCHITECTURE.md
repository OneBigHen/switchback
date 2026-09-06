# Wave 1 ownership and architecture — one recoverable ride intent

Contract for the Wave 1 slice. Implementation status lives in `ASTRA-STATE.md`;
this file records what owns what and, where a choice was available, which one
was taken and why.

## The shape

```
controls / map / Advisor / imports / drawing
        │  (one typed ride command each)
        ▼
   RideIntent  ──► identity ──► request ──► session controller ──► coordinator
   (authored)          │                                              │
        │              └──────────── fences ─────────────────────────┘
        ▼                                                            ▼
   ride checkpoint (IndexedDB, intent only)              committed result + entity cache
```

Rider intent is authored. A route is an *answer* to one revision of it. The two
are never allowed to be the same object, and the planner never claims a result
belongs to a ride it does not.

## Canonical owners

| Concept | Writable owner | Everything else |
|---|---|---|
| Every route-defining field (points, mode, time target and shaping, road feel, bike profile, highway/toll policy, avoid areas, kept roads, segment preferences, sketch corridor) | `planner-store` flat intent fields, written **only** through `editRide` / the actions that call it | Shell, composer, map, request builder read them |
| Ride identity, sequence, undo/redo stacks | `rideHistory` in the planner store, computed by `lib/domain/ride-intent` | `canUndoRideChange` / `canRedoRideChange` are projections |
| The ride the visible route answers | `committedRide` — moves only when a result commits | `hasUnappliedChange` is derived from it |
| Pending / settled result identity | `pendingResultIdentity`, `resultIdentity` | Coordinator passes them, store enforces them |
| Route candidates and geometry | `plan` summaries + `route-entity-cache` | Never intent, never history, never the checkpoint |
| Selected route | `selectedRouteId` + `selectionSource` (Wave 0, unchanged) | Automatic selection cannot replace an explicit pick |
| Draft recovery | `RideCheckpointStore` (own IndexedDB database) | `recoveryStatus` is the only status it publishes |
| Saved places / recent searches / curvature toggle | `switchback.planner.ui.v1` via the persist bridge | The pre-Wave-1 key is read once, never written |
| Camera, sheets, hover, search text, unfinished gestures, notices | Component state | Deliberately transient |

## Decisions

**Ride commands.** `editRide(changes, label, source, recordHistory?)` is the one
entry point. A command validates against the base identity, replaces the intent
atomically, and returns `applied | stale | invalid | noop`. One rider decision is
one command: a ride prompt, an Advisor hand-off, a track import, a saved-route
restore and a duration preset each land as a single revision, so a single Undo
reverses the whole thing rather than one field of it.

**History is linear and bounded.** 50 entries of intent, never geometry. Undo and
redo issue fresh identities so old async work cannot become current again.
`recordHistory: false` marks initialization — recovered preferences, a passive
GPS fix — which advances the identity (so stale results are still fenced) without
adding an undo step. It does **not** exempt a command from linearity: any command
that actually changes the intent has diverged from an undone branch and clears
redo. Callers of `recordHistory: false` therefore run only while there is no
history to diverge from, and `seedCurrentLocation` enforces that itself.

**Failed updates never rewrite intent.** Rider has ride A, edits to B, B fails.
The intent stays B — it is what they asked for, and it is what Retry and Cancel
act on. Route A stays visible and selectable, and `committedRide` still points at
A so nothing claims the route matches B. The next ride edit clears the stale
failure. The rejected alternative was to auto-restore A, which both discarded the
rider's edit and had to invent a rider-authored revision to do it, leaving Undo
pointing at the ride that just failed.

**Cancel means one thing:** stop the calculation in flight and put the last usable
ride back. The session controller aborts and fences; the store restores the
committed intent as one undoable revision, clears the error and settles the
status. With nothing committed yet it simply stops planning. There is one Cancel
command, `onCancelRideChange`.

**Stale results are fenced once, not guarded four times.** The coordinator builds
one fenced gate per lifecycle: current request id, not aborted, and the intent
identity unchanged. Primary, alternatives and the error path all ask that same
question. The store independently refuses any result whose `intentIdentity` is
not current and whose `requestId` is not the pending one, so a result cannot
commit even if a caller forgets to check.

**Cancellation is controller-local.** Each planning session owns its
`AbortController`. The previous module-global controller meant one planner could
abort another's provider work.

**Checkpoints store authored intent only.** Restoring a stored answer would put a
possibly stale route under a ride the rider may have changed, and would duplicate
route geometry into a second store. Recovery restores the intent and the planner
re-asks for the route, automatically, so "refresh restores your ride" does not
mean "refresh restores your inputs and a blank map". Known cost: recovering with
no connectivity restores the ride but not a drawn route — offline route packs
remain the owner of the offline case.

**Cross-tab safety is a write token, not a sequence number.** Every write rotates
the token; whoever last read the record owns the next write. A second tab that
saved in the meantime has rotated it, so this tab is refused, stops writing and
tells the rider. Sequence numbers are deliberately not a conflict rule: within a
tab they only move forward, and a tab that legitimately starts a fresh ride over
an old draft would otherwise be locked out of saving entirely. A recovery that
arrives after the rider already authored something is `superseded`, not
`conflict` — their ride wins **and** keeps being checkpointed.

**Location never overwrites authored intent.** A passive fix is skipped while
recovery is still loading, when another tab owns the ride, when a start already
exists (authored or recovered), while the rider is typing a start, and whenever
any ride history exists. A restored ride *without* a start still gets one:
recovery status alone never disables location.

**Migration is additive.** The persist key moved because ride intent left
localStorage; the UI index follows through a read-only bridge so no rider loses
saved places, and the legacy blob is never written or deleted. Ride preferences
are adopted once, as initialization, when no checkpoint exists yet. No saved-route
library, recording, road-lock or offline-pack database is opened by any of this.

## Boundaries for later waves

Drawing commits a corridor through the same `editRide` command (`source:
"drawing"`); the unfinished on-screen gesture stays with the map. Advisor already
hands off through one `source: "advisor"` command — the full typed proposal
protocol (Wave 4) can replace the payload without gaining a second writer.
Free Ride activity and navigation/recording observations remain specialized and
must not become alternative intent owners. Polygon/multi-stroke editing is Wave 3.

## Still adapters, and marked as such

`editRideField` in `PlannerShell` translates the React `SetStateAction` shape used
by a few remaining child callbacks into one ride command. It holds no state; each
use disappears as its caller gains a named command, as the ride-time controls
already did.
