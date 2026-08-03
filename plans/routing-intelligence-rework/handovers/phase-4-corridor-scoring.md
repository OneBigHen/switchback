# Phase 4 Handover: Timeboxed Destination Corridors and Scoring

> Attached artifact for Phase 4. Records what shipped, the live smoke results
> observed against the running (pre-Phase-3) graph, and what remains for the
> Phase 7 host.

## Shipped (this commit)

- `src/lib/routing/destination-corridors.ts` — pure timebox baseline,
  corridor envelope (105% path / min(40, max(8, 35% target)) lateral),
  envelope anchor gate, net-progress backtracking share (hairpins do not
  count; genuine out-and-backs do), 150 m-sampled 100 m self-overlap share,
  and bounded anchor-set builder (max 4 sets, curvature → GPX → hints).
- `src/lib/routing/route-quality.ts` — hard gates (duration ±10%,
  backtracking ≤15%, self-overlap ≤20%, toll hard-avoid; extra state
  crossings are PENALIZED −20 each, not gated), the locked maximum-twisties
  score components, measured-field explanations, and PA/NJ state-transition
  counting over the tracked simplified boundary fixture
  (`reference/pa-nj-boundaries.json`, PublicaMundi/U.S. Census derived).
- `src/lib/routing/scoring.ts` — smoothed metrics: 25 m Douglas-Peucker
  simplification, meaningful turns on ≥40 m segments with 15°–120° bearing
  change, curvature-detail share (<0.98) with geometry fallback. Point noise
  can no longer saturate twistiness.
- `src/lib/gpx/route-geometry.ts` — full imported-GPX geometry loading with
  clean `missing-file`/`unavailable` degradation.
- Orchestration in `planner.ts`: `planDestinationTimebox` — direct baseline,
  feasibility gate (>110% → closest safe + warning), in-band short-circuit,
  ≤4 corridors routed at ≤2 concurrency under a shared 6 s deadline, one
  refinement pass, gates → best score, closest-safe fallback with the actual
  gate failures in the warning.
- `src/app/api/routes/route.ts` — corridor-source resolver (curvature DB +
  GPX library, both optional).
- `graphhopper.ts` — graceful detail degradation: if the active graph lacks
  an encoded-value detail (e.g. `toll`), retry once without it so evidence
  fields stay unknown instead of every route 400ing; `GRAPH_OUT_OF_DATE` is
  no longer thrown (the retry absorbs it).

## Live smoke (against the running pre-Phase-3 graph on :8989)

The full pipeline was exercised live: baseline (2-point) request, 24
curvature segments + 4 GPX routes resolved, corridors routed by the real
GraphHopper, gates + score evaluated. Result:

- A **121.96-minute** Hatboro → Stockton shaped route was produced (inside
  the 108–132 golden band), but the best gate-passing candidate was a
  132.93-minute route that failed the backtracking/self-overlap gates, so
  the fallback surfaced the 121.96-minute route with an explicit warning.
- The toll detail retry worked as designed (running graph predates the
  Phase 3 toll encoded value): the request degraded, tollEvidence came back
  `known: false`, and routing succeeded.
- **Finding**: the current midpoint-anchor corridors route real meandering
  geometry that trips the backtracking/self-overlap gates. The gates are
  behaving per the locked spec; the corridor GENERATION needs tuning (better
  anchors, corridor smoothing) to produce clean golden routes. That is the
  remaining live work — best done on the Phase 7 host with the re-imported
  candidate graph (which also re-enables toll evidence and the golden test).

## Remaining for Phase 7 host

- Build/validate the Phase 3 candidate cache (`import-candidate phase3-toll`
  → `validate-candidate`), swap it in (`swap phase3-toll`), restart the app
  on the new code.
- Run `tests/integration/timeboxed-destination-routing.test.ts` live: it
  probes the router + toll detail + app health and only then asserts the
  108–132-minute, non-Philadelphia, Upper Bucks golden route.
- If the golden route still trips backtracking/self-overlap gates, tune
  corridor anchor generation (this commit ships the machinery, not the final
  corridor weights).
