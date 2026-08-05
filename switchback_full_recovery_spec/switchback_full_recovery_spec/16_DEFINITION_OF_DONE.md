# Definition of Done

## Correctness

- All modes use normalized constraints.
- Legal access/closures are hard rules.
- Bike compatibility enforced.
- No failed candidate described as safe.
- Road requirements graph-matched and ordered.
- Free Ride graph-backed and traversable.
- Shares remove protected geometry and identifying instructions.
- Explicit choices never silently replaced.

## Cohesion

- Mobile uses Search → Choose → Edit → Prepare.
- Desktop has a real workspace.
- Ride, recording, and Free Ride form one section.
- Every setting is operational.
- Experimental features labeled/flagged.
- No no-op controls.
- No generic imagery presented as route evidence.

## Modularity

- PlannerShell decomposed.
- Explicit planner/ride state machines.
- Providers consume normalized contracts.
- One settings/bike source.
- Central scoring/eligibility.
- Dedicated offline controller.

## Offline

- Shell reloads.
- Local routes/rides accessible.
- Prepared data visible.
- Regional graph supports recovery.
- Downloads pause/resume and activate atomically.
- Failed updates preserve prior version.
- Storage/cache bounded.
- Readiness visible before ride.

## Data safety

- Persisted data versioned.
- Migrations tested.
- Export/restore works.
- Corrupt records isolated.
- Destructive actions confirmed.

## Quality

- Lint/typecheck/build pass.
- Unit/integration/real-router/PWA/semantic tests pass.
- No unjustified skips.
- Physical iPhone and accessibility qualification pass.

## Documentation

README, runtime, profiles/options, providers, offline levels, experimental status, runbooks, and rollback all match behavior.

## Cut rule

Any feature preventing these conditions may be removed or deferred. Completion is coherent working behavior, not feature count.
