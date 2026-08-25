# Phase 3 — Route Intelligence UX

## Goal
Turn Switchback’s existing scoring depth into a rider-readable route choice experience.

## New primary route vocabulary

At minimum support display concepts:
- `BEST MATCH`
- `TWISTIEST`
- `FLOWIEST`
- `SCENIC`

`FASTEST` may appear as a baseline when useful.

Labels must be derived from measurable characteristics, not arbitrary names.

## Route summary

Primary selected route must show:
- duration,
- miles,
- elevation,
- profile,
- surface confidence/summary when available,
- relative time vs fastest or baseline,
- 3–5 rider-language reasons.

Examples:
```text
31 mi great curves
18 mi uninterrupted back roads
96% paved
4 traffic lights
Low town traffic
+11 min vs fastest
```

## Flowy profile

Create “Flowy” from the data already present before changing router engines.

Candidate factors:
- simplicity,
- corridor coherence,
- contiguous road quality,
- lower signal density,
- lower stop density,
- lower intersection density,
- lower urban penalty,
- lower fragmentation,
- lower backtracking,
- lower self-overlap,
- sufficient curve quality without maximizing turn count.

The exact scoring weights require tests and documented calibration.

## Route comparison

Expanded alternatives view must permit side-by-side conceptual comparison:
- time,
- distance,
- elevation,
- pavement/gravel,
- curves,
- flow,
- scenic,
- traffic controls / towns,
- warnings,
- confidence.

Phone: stacked cards / comparison sheet.
Tablet: denser comparison panel.

## Deep route detail

Expandable sections:
1. Overview
2. Road character
3. Elevation
4. Surface
5. Conditions
6. Stops/fuel
7. Data quality / advanced detail

Do not show all seven by default.

## Elevation / route story
Where data exists, provide a compact elevation trace keyed to route distance.
Future overlays can align:
- curve intensity,
- surface change,
- warnings,
- weather.

Do not block the phase on building every overlay.

## Explicit selection
If user taps an alternative, automatic rider-ranking updates must not silently move them back.

## Waypoint semantics design
Begin integrating STOP / SHAPE / ROAD / OPTIONAL in UI and contract only if it can be done without unsafe routing behavior changes.

Minimum in this phase:
- visually distinguish shaping intent from must-visit stop intent;
- document missed-point behavior.

## Acceptance tests
- labels are deterministic for fixtures;
- Flowy differs meaningfully from Twistiest in fixture data;
- user-selected route remains selected;
- route summary survives sheet detent changes;
- details do not reset plan;
- comparison works at phone/tablet sizes;
- route card text remains legible over dark/light maps.

## Acceptance criteria
No opaque score may be the only reason presented to the rider.
