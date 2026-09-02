# Transition State Map

Use this as a visual/interaction sanity check; it is not new application state.

```text
PLAN PEEK
  └─ expand → PLAN IDLE
                 ├─ Destination / Loop / Draw (same planning sheet)
                 ├─ Options open/close (same planning context)
                 ├─ Free Ride → FREE RIDE surface
                 └─ submit → PLANNING
                               ├─ cancel → prior editable Plan state
                               ├─ error → ERROR + retry/edit
                               └─ success → ALTERNATIVES / PREPARE
                                               ├─ select route → PREPARE
                                               ├─ details → DETAIL full sheet
                                               ├─ edit → EDIT / REPLAN
                                               └─ Start route → RIDE preview/live

NAV DESTINATIONS
  Plan ↔ Rides ↔ Discover ↔ Settings
  Record = separated task action/overlay, not destination #5

RECORD
  ready → active ↔ paused → finish/finalize
                         └─ destructive discard requires confirmation

FREE RIDE
  idle → suggestion → accept/ignore/less-like-this → idle
  GPS/workload suppression remains a real state

RIDE
  preview/no GPS → live guidance
  live → GPS uncertain / track-only / off-route as real state dictates
  off-route → recovery choice → remain/rejoin according to existing policy
  live → arrival/finalization
```

## Transition design rules

- Keep spatial continuity: sheet state changes should feel like the same object unless moving to a genuinely immersive surface.
- Do not remount the map for destination or sheet state changes.
- Loading does not blank the planning context.
- Selecting a route should not cause unrelated content/nav to jump.
- Full-height transitions are reserved for detail/edit/options that genuinely need space.
- Ride/off-route changes prioritize immediacy over decorative animation.
- Reduced motion preserves all state signaling without movement.