# Free Ride Redesign

## Definition

Free Ride records an unplanned ride and may offer one optional road suggestion ahead. It is not autonomous navigation.

## Current disposition

Keep Experimental until all acceptance tests pass. Remove “safe,” “verified,” and similar claims unless proven.

## Candidate contents

- current snapped position and heading;
- legal approach route;
- matched suggested-road entry/exit and geometry;
- continuation/reconnect path;
- active-bike compatibility;
- graph version;
- access/closure evidence;
- actual added time/distance;
- decision distance/time;
- confidence.

## Directionality

Reject candidates behind the rider, requiring unapproved U-turns, outside heading threshold, unreachable before decision, too close for a safe decision, or too far to matter.

## Workload gating

Use conservative documented rules based on speed, GPS accuracy/stability, navigation context, and recent interaction. Do not pretend to infer precise rider workload.

## Lifecycle

Remove a suggestion when:

- expired;
- entry passed;
- heading materially changes;
- access changes;
- GPS confidence drops;
- ignored;
- superseded.

Polling continues while a suggestion is visible so it can be invalidated.

## Acceptance

Plan:

```text
current → suggested entry → traverse suggested road → suggested exit → continuation
```

Validate fragment overlap. If conversion fails, recording continues.

## Learning

Accept is positive, Ignore weak negative/neutral, Less like this strong negative. Use stable bike ID. Raw trail is not required.

## UI

At most one suggestion. Show action, decision distance, added time, surface/compatibility, and experimental/confidence status. Use large Accept, Ignore, Less like this controls. Do not show dense scores while moving.

## Tests

- Behind candidate rejected.
- Expired suggestion disappears.
- Passed entry invalidates.
- Accepted route traverses fragment.
- Failure preserves recording.
- Low-time/high-speed decision suppressed.
- Illegal/incompatible road rejected.
