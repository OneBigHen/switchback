# Stale PR salvage ledgers (BETA-003)

Written 2026-09-09 against `main` @ `01f8b53233dd7ec53399b9571b92274c54b69d71`.

PRs #66, #80 and #81 are **salvage sources, not merge candidates**. Every capability
below has either a destination on current `main` or an explicit rejection, so the
drafts can be closed without losing hidden value. Port onto fresh branches from
current `main`; do not rebase and merge the old PRs.

Produced by two read-only workers, one per PR stack. The coordinator independently
verified the load-bearing #66 claim rather than taking it on trust — see
"Verified by coordinator" at the end of the first ledger.

---

# PR #66 salvage ledger — `feat/recorded-rides-route-intelligence`

Head `2cf482d0`, base `main`, 12 files, +845/-14, draft. **Do not merge.** Port, then close.

## Ledger

| Capability | Where | Verdict | Destination on current main | Risk if ported blindly |
|---|---|---|---|---|
| Geometry-derived region classification (distance-weighted, sample-density-invariant, cross-region + outside detection) | `src/lib/rides/route-library-intelligence.ts:66-165` `classifyPaRouteRegion`; `ec6c59b`, `8e68040`, `c7162ce` | **PORT** | New bounded module near `src/components/rides/rides-view-model.ts`, retargeted at main's real region catalog `src/lib/offline/region-catalog.ts:4-24` / `src/lib/routing/region-policy.ts:24-61` (already covers PA/NJ/NY/WV) | Hardcodes `PaRideRegion = "ne"\|"nw"\|"se"\|"sw"` as a permanent taxonomy, duplicating and diverging from `OfflineRegion` |
| Real road-name extraction from provider instructions | `extractRouteRoadNames`, `route-library-intelligence.ts:174-189` | **KEEP AS-IS / PORT** | same module | Low. Pure function; respects `RouteInstruction.streetName` (`src/lib/routing/types.ts:127`) |
| Stored-geometry ride-card preview component | `src/components/rides/RouteGeometryPreview.tsx` (new, 82 lines); `26a87bb`, `7fb1dd2` | **DROP the component** | Wire `src/components/rides/RideListRow.tsx:62-64` to the existing `src/components/graphics/RouteThumbnail.tsx` instead | Reimplements `RouteThumbnail`; the cosine-latitude line is byte-identical to `graphics-math.ts:74`. Returns `null` on <2 points instead of an explicit "unavailable" state |
| Narrowing (not removing) fake route art | `RideListRow.tsx` `RouteGraphic` fallback; `26a87bb` | **DROP** | — | Still renders hash-seeded fake polylines for geometry-less rides |
| Region browsing UI (quadrant tabs) | `RidesSurface.tsx` `REGION_FILTERS`, `countsForRideRegions`; `94f38d9`, `41ccd2c` | **REWRITE** | `src/components/rides/RidesSurface.tsx` against real named regions | Ships PA-only compass quadrants as permanent global structure; every non-PA ride becomes "Outside PA" forever |
| "Ask Gravel Goblin" saved-route NL search | `src/lib/rides/ride-library-search.ts` (134 lines), `RideLibraryGoblin.tsx` (70) | **REWRITE** | Fold the parser into the single existing search box `src/components/rides/RideFilters.tsx:28-38` | Two search inputs filter the same list simultaneously (ANDed) — redundant UI, doubled maintenance |
| "Gravel Goblin" branding on a Rides regex filter | `RideLibraryGoblin.tsx` | **DROP** | — | Brand collision: "Gravel Goblin" is already the shipped key-gated LLM advisor (`src/components/planner/v2/RideAdvisor.tsx`, ADR 0021). Implies AI where there is plain keyword matching |
| "Generate new" mode inside Rides | `RideLibraryGoblin.tsx`; `e1ff2128` | **DROP** | — | The "hand-off" is literally `onGenerateNew={props.onClose}`. Rides is rider-owned material, not a generation surface |
| Region/road facts through the Rides view model | `rides-view-model.ts` `routeIntelligence()` | **PORT** | `src/components/rides/rides-view-model.ts` | Safe wiring pattern; no schema change or storage migration. Only the region taxonomy needs replacing |
| "Most climbing" sort | `RidesSurface.tsx` `SORT_OPTIONS` / `rankRides` | **PORT** | `src/components/rides/RidesSurface.tsx` | Low. Verify `ascentMeters` is populated for saved/recorded/trip kinds |

## Duplicate-type inventory

- **Polyline preview**: `RouteGeometryPreview.tsx:1-82` duplicates `RouteThumbnail.tsx:16-67` (on main since #83). Longitude correction byte-identical: `RouteGeometryPreview.tsx:21` vs `graphics-math.ts:74`.
- **Region concept**: `PaRideRegion`/`RideRegionSummary` (`route-library-intelligence.ts:3-16`) vs `OfflineRegion` (`region-catalog.ts:4-24`) vs `RegionPolicyOverlay` (`region-policy.ts:24-61`) — three models of "which region", incompatible shapes.
- **Search surface**: `parseRideLibraryQuery`/`searchRideLibrary` (`ride-library-search.ts:66-134`) vs the existing `RideFilters` search box.
- **Brand identity**: `RideLibraryGoblin` vs `RideAdvisor` (ADR 0021).

## Tests worth salvaging

- `tests/lib/route-library-intelligence.test.ts:24-39` — distance-weights segments; a route is not naively bucketed by its start point.
- `:41-55` — duplicate/densely-sampled GPS points must not distort region share (provider-independence invariant).
- `:57-61` — confirmed-outside-region routes must not match the same way geometry-less routes do (this distinction was itself the `c7162ce4` bug fix). Encodes "unknown stays unknown".
- `:63-77` — extracts real road names without inventing labels.
- `tests/lib/ride-library-search.test.ts:41-63` — no fabricated or fuzzy match when nothing matches (`"dragon teeth" → []`).

## Explicit rejections (so closing #66 loses nothing silently)

- `RouteGeometryPreview.tsx` — duplicate of `RouteThumbnail`, weaker fallback.
- `RideLibraryGoblin.tsx` — brand collision with the real advisor.
- Generate-new hookup (`e1ff2128`) — no-op hand-off.
- `PaRideRegion` NE/NW/SE/SW + `PA_BOUNDS` as a permanent taxonomy.
- Second search input (`goblinQuery`) — redundant with `RideFilters`.
- `2cf482d0` JSX lint fix — cosmetic, on dropped code.

## Smallest first port (= BETA-014)

Wire `RideListRow` to `RouteThumbnail`, replacing the unconditional `RouteGraphic` call at `RideListRow.tsx:62-64`.

**RED test first**: a `RideLibraryItem` with real `geometry` renders `[data-route-thumbnail="ready"]` (not `[data-route-graphic="route"]`); an item with `geometry: []`/`undefined` renders `[data-route-thumbnail="unavailable"]` and never a `RouteGraphic` route variant. Fails on main today.

Needs none of the region taxonomy or search work.

## Verified by coordinator (not taken on trust)

```
grep -rn "RouteThumbnail" src/ tests/ \
  | grep -v graphics/RouteThumbnail.tsx | grep -v graphics/index.ts | grep -v tests/components/graphics
  → (empty: zero consumers)

RideListRow.tsx:63   <RouteGraphic seed={item.id} variant="route" />
RouteGraphic consumers: RideListRow.tsx, RidesSurface.tsx, SettingsSurface.tsx
```

So #83 shipped truthful route graphics that nothing uses, while every ride card still renders seeded fake art. BETA-014 is a live defect on `main`, not a hypothetical.

---

# PR #80 / #81 salvage ledger — Gravel Goblin preference vector & route memory

- **#80** `feat/gravel-goblin-route-intent`, head `2e51f7af`, base `main`, 3 files, +380/-0, draft.
- **#81** `feat/gravel-goblin-route-memory`, head `3c370825`, **base is #80 (stacked)**, 7 files, +1313/-0, draft.

**Do not merge either.** Read-only audit.

## Ledger

| Capability | PR | Where | Verdict | Destination | Risk if ported blindly |
|---|---|---|---|---|---|
| `RidePreferenceVector` + `PROFILE_BASELINES` bridge | #80 | `src/lib/ai/ride-preferences.ts:1-125` | **REWRITE** | bounded module consumed only by `src/lib/advice/` explanation code | `PROFILE_BASELINES` is a second hand-authored table of what `twisty` means, living outside `src/lib/routing/scoring.ts` / `graphhopper-request.ts` which actually produce route character. Two tables will drift |
| Relative edit semantics `applyRidePreferenceEdits` (`less`/`more`/`much-*`) | #80 | `ride-preferences.ts:127-146` | **KEEP logic** (not the module) | same | The one genuinely new idea: preserving unspecified axes on a conversational edit. Pure function. Safe only if its output never reaches routing |
| BikeScout/openGpx adoption plan | #80 | `docs/GRAVEL-GOBLIN-ROUTING-REVIEW.md` | **PORT as research note** | `docs/design/` | Its "Phased implementation PR2–PR5" is a competing roadmap vs `docs/release/ROADMAP-WAVES.md` |
| `RideFingerprint` + `fingerprintPlannedRoute` | #81 | `src/lib/rides/ride-memory.ts:1-233` | **REWRITE, gated** | new `src/lib/rides/ride-fingerprint.ts` after Wave 6 | Has **no caller**; `src/lib/rides/` does not exist on main. Would be a fingerprint format nobody produces or persists |
| `deriveLearnedRiderProfile` (median, per-axis support/confidence, deterministic tie-break) | #81 | `ride-memory.ts:235-345` | **REWRITE, gated** | same, after ADR 0005 is scoped | Implements ADR 0005, which is *accepted but unimplemented*. Building it now front-runs the undecided question of which signals rider learning should use |
| `parseRideMemoryQuery` / `searchRideMemory` | #81 | `src/lib/rides/ride-memory-search.ts:1-360` | **REWRITE** | rebuild over `RideLibraryItem`, not a bespoke `RideMemorySearchDocument` | Would be the **third** "search my rides" implementation, alongside `RidesSurface.tsx:65-129` and #66's `ride-library-search.ts` |
| Model slots (`intent`/`goblin`/`reasoning`/`maps`) | #81 | planned only, not in the diff | **DROP** | — | On AGENTS.md's explicit reject list. `src/lib/advice/provider.ts` already has the one seam it needs (ADR 0023) |
| Two-mode Rides UI + eval corpus | #81 | planned; prototype lives in #66 | **DROP** | — | Second route-generation entry point in the UI layer |

## Second-authority audit (the question that matters most)

- **`RidePreferenceVector` + `PROFILE_BASELINES`** — **yes, a second authority as written.** Must become a read-only *view* derived from the real profile/scoring definitions, never an independent numeric table that can disagree with them.
- **`applyRidePreferenceEdits`** — no, pure function, no routing call. Safe *only* if the vector it edits isn't itself a second authority.
- **`RideFingerprint` / `deriveLearnedRiderProfile`** — not a routing authority (never touches geometry or GraphHopper), but on track to become a second **personalization** authority alongside ADR 0005.
- **`ride-memory-search`** — not a routing authority, but a second (really third) **Rides-search** authority.
- **Model slots** — would be a second **provider-selection** authority next to ADR 0023's `auto` logic.
- **Two-mode Rides UI** — second **route-generation entry point**.

## Value experiment required before any axis ships

- **Corpus:** 20–30 fixed `(origin, destination-or-loop, target-minutes)` requests, each with a rider ask containing a *combination* no single preset expresses ("twisty but not gravel"; "scenic, short on time, no big climbs"). No network.
- **Baseline:** existing profile selection + `preferGravel`/`avoidHighways` booleans through the real deterministic candidate generator/scorer.
- **Treatment:** `preferencesFromRideIntent` + `applyRidePreferenceEdits` re-weighting the *same* scorer. No new routing path.
- **Metric:** fraction of the corpus where the vector candidate's *measured* facts better satisfy the ask (hand-labelled once). Also record whether any unmentioned axis changed — must be zero.
- **Pass:** ≥70% win on the multi-axis subset, zero unmentioned-axis regressions, no regression on single-axis cases.

## Tests worth salvaging

- `tests/unit/advisor-ride-preferences.test.ts` (#80) — "changes only axes the rider explicitly edits"; "rejects unknown edit strengths rather than guessing".
- `tests/unit/ride-memory-adversarial.test.ts` (#81) — **the most valuable file in either PR**:
  - unknown-only provider classifications must not become confident zero shares (`gravelShare`/`highwayShare` stay `null`);
  - `NaN`/empty mixes must yield `samples: 0, learned: false`, never a confident value from garbage;
  - conflicting ride ids deduplicate deterministically regardless of input order.
- `tests/unit/ride-memory-search.test.ts` (#81) — positive character filters require actual evidence; contradictory constraints return none rather than silently relaxing.
- The spec's "Adversarial stage gates" checklist — keep as a checklist for whatever Wave 6 / ADR 0005 work eventually happens.

## Explicit rejections

- `PROFILE_BASELINES` as a standalone numeric authority.
- Model-slot resolver — no current use case; explicitly rejected by AGENTS.md.
- Two-mode Rides UI / "generate new" inside Rides.
- The PR-body "Phased implementation" roadmap (PR2–PR5).
- `docs/GRAVEL-GOBLIN-EVALS.md` fixed eval corpus — depends on the dropped model-slot work.
- `RideMemorySearchDocument` as a bespoke document shape — `RideLibraryItem` already exists.

## Smallest first port

**Port nothing from either PR yet.** The one code-complete, well-tested, low-risk piece (`applyRidePreferenceEdits`) has no caller on main and no vector to edit that isn't the second-authority `PROFILE_BASELINES` table.

The honest first move is upstream of both PRs: run the value experiment above using the *existing* `RouteProfileId`/scoring code, with **zero new files**. Only if it clears its threshold does porting the edit semantics — rewritten against real scoring inputs — become defensible.

Everything in #81 waits until Wave 6 and ADR 0005 settle what a ride record and a learned rider profile actually are. Confirmed not started: no `src/lib/rides/` on main, `RidesSurface.tsx` still does plain metadata filter/sort, ADR 0005 has zero implementation.
