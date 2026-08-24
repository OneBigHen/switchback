# Phase 6 — Free Ride 2.0

## Goal
Transform Free Ride from an experimental/debug-like suggestion surface into Switchback’s signature passive road-discovery experience.

## Preserve existing foundation

Do not replace:
- graph-backed opportunity search,
- forward-direction behavior,
- route-provider validation,
- corridor traversal verification,
- scoring,
- cooldown,
- prompt history,
- GPS gating,
- preference-learning events.

## Pre-ride setup

Compact setup may expose:
- `Surprise me`
- Curves
- Scenery
- Flow
- Gravel
- max detour: +5 / +15 / +30 min / flexible

Do not require all controls.
Defaults must be useful.

## Moving UI

At most one primary opportunity.

Example:
```text
GREAT ROAD AHEAD
River Road · 1.2 mi
8 mi curves · +7 min

[Take it] [Pass]
```

Allowed secondary trait examples:
- `Flowy`
- `Scenic`
- `Low traffic controls`
- `Gravel`
- `Overlook`
- `Avoids incident`

Do not show:
- `/100` score,
- three-paragraph explanation,
- confidence percentages,
- graph provenance,
- debug counts.

Those belong in expanded/stopped details.

## Rolling horizon

Replace fixed “poll and hope” behavior with meaningful triggers.

Candidate refresh triggers should include a bounded subset of:
- moved beyond distance threshold,
- entered new matched segment/corridor,
- heading changed materially,
- current suggestion expired,
- suggestion passed,
- route conditions materially changed,
- graph tile/region changed,
- user accepted/passed,
- cooldown ended.

A low-frequency safety timer may remain, but must not be the primary logic.

## Dynamic workload estimator

Current workload contract already supports `low | normal | high`.
Produce it from real signals.

Candidate input factors:
- distance to upcoming maneuver,
- maneuver complexity,
- current speed,
- recent acceleration/deceleration if available,
- heading instability,
- GPS uncertainty,
- intersection density if available,
- off-route/recovery state,
- active warning severity,
- recent UI interaction.

### Conservative rule
When uncertain, classify upward, not downward.

### High workload
No new Free Ride prompt.

### Normal
Only high-value opportunity.

### Low
Opportunity may appear; expanded detail only after intentional interaction.

## Suggestion utility

Candidate ranking should combine:
- road quality,
- rider preference fit,
- curvature,
- flow,
- scenery,
- novelty,
- route continuity,
- surface preference,
- live condition penalties,
- added time,
- confidence,
- whether rider recently rode/rejected it.

Do not introduce opaque ML if deterministic scoring works.

## Opportunity kinds

Implement incrementally:
1. fun road
2. scenic detour
3. traffic escape
4. overlook
5. stop
6. loop

The initial PR does not need all six if the domain already lacks data for some.

## Time-aware Free Ride

Design contracts for:
- ride for 60/90/120 minutes,
- home by a selected time,
- stay within N minutes of home,
- ride until fuel reserve threshold.

Implement only the first safe subset. Do not fake fuel range without bike/range data.

## Preference reactions

Keep:
- Accept
- Pass / Ignore
- Less like this

“Less like this” may be hidden behind expanded detail if moving.

## Acceptance tests

### Unit
- workload estimator fixtures,
- high-workload suppression,
- suggestion expiration,
- movement-triggered refresh,
- heading/passed-candidate suppression,
- live-condition penalty,
- cooldown/prompt budget preserved.

### E2E
- start Free Ride,
- no candidate state,
- candidate appears,
- Take it → guided route,
- Pass → candidate suppressed,
- moving prompt compact,
- expanded stopped details available,
- route recording remains intact.

## Success definition
Free Ride should feel *quieter* after this phase even though its intelligence is substantially higher.
