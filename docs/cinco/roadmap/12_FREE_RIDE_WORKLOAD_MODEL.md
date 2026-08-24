# Free Ride Workload Model

## Objective
Provide a deterministic, conservative `low | normal | high` workload classification.

This is an interaction-suppression heuristic, not a safety certification.

## Inputs

Use only available reliable inputs. Candidate inputs:
- `distanceToNextManeuverMeters`
- `secondsToNextManeuver`
- `maneuverComplexity`
- `speedMph`
- `gpsConfidence`
- `headingVariance`
- `isOffRoute`
- `isRecovering`
- `activeWarningSeverity`
- `recentInteractionMs`
- `intersectionDensity` if available.

## Suggested deterministic rules

### High workload if any strong condition
Examples:
- off-route/recovering;
- severe warning active;
- GPS confidence below reliable threshold;
- very near upcoming maneuver at road speed;
- complex maneuver sequence;
- recent rapid interaction / state transition.

### Low workload only if all calm
Examples:
- no imminent maneuver;
- stable heading;
- GPS confident;
- no warning;
- no recovery;
- no recent interaction;
- speed/road context supports attention margin.

### Otherwise normal

## Important
Do not map speed alone to workload.
A slow complex intersection can be high workload.
A steady rural road can be normal/low.

## Output contract

```ts
interface RideWorkloadEstimate {
  level: "low" | "normal" | "high"
  reasons: string[]
  computedAt: number
}
```

Reasons are primarily for tests/diagnostics, not moving UI.

## Free Ride behavior

- `high` → suppress new suggestion.
- `normal` → only high-value suggestions, minimal UI.
- `low` → normal eligible suggestion behavior.

## Tests
Build fixture cases for:
- rural straight calm,
- imminent turn,
- off-route,
- GPS poor,
- warning active,
- recent user interaction,
- low-speed complex intersection.

Avoid tests that depend on wall-clock timing without injected time.
