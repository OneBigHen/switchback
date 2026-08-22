# Closure Progress Report — GLM 5.2 tech-debt closure

> Historical worktree report, not current release status. See [CLOSURE-REALITY-2026-07-21.md](./CLOSURE-REALITY-2026-07-21.md).

**Baseline:** `main` at `c75e0df`
**Worktree:** `/path/to/switchback-closure` on branch `closure/glm-wave-1`
**Current gate status:** `tsc --noEmit` clean · `eslint --max-warnings=0` clean · `vitest run` **633 passed** (baseline was 578)

> Scope reminder (from `docs/REMAINING-ROADMAP-GLM.md` line 7): GLM 5.2 stops after tech-debt closure + verification evidence. No reskin, no visual rewrite, no product broadening.

---

## Completed packages (Wave 1)

| Package | Outcome | Tests added | Files |
| --- | --- | --- | --- |
| **B1a** — Navigation session controller types/reducer | Pure `NavigationSessionState`, command union, effect descriptors, reducer, selectors. B1b/B1c will wire IO. | 26 (navigation-session-controller.test.ts) | `src/lib/client/navigation-session/*` (types, state, reducer, selectors, index, contract.md) |
| **A2** — Stable E2E matrix refresh | Refreshed `planner.spec.ts` selectors to current markup; added shared `/api/map-features` + geocode stubs; free-form-intent + route-sketch/edit smoke tests; desktop + mobile-safari journey coverage. E2E did not run in sandbox (Turbopack rejected symlinked `node_modules`) but spec compiles via `tsc`. | (spec compiles) | `tests/e2e/planner.spec.ts`, `playwright.config.ts` |
| **B3** — Accessibility primitives | `A11Y_TOKENS` (touch-target, focus-visible, reduced-motion, contrast, landscape-safe) + `AriaLiveRegion`, `FocusReturn`, `KeyboardScope` primitives. | 10 (4 test files) | `src/app/styles/a11y-tokens.ts`, `src/components/planner/a11y/*` |
| **C1** — Offline pack contracts + migration | Froze `OfflinePackManifest`, `OfflineGraphSegment`, `OfflineRoutingRequest/Result`, `OfflinePackEstimate`, `OfflinePackStatus` contracts. Bumped pack schema v2→v3; old route/cue packs migrate to follow-saved-route (no data loss). | 6 (migration) + existing suite updated | `src/lib/storage/offline-contracts.ts`, `offline-route-pack.ts` |
| **D1** — Local-first trip command model | `TripPlanCommand` union + pure reducer reusing existing validators; versioned alternates/checklist/fuel-envelope/daylight/service-stops/snapshots; migration helpers. | 13 (trip-command + migration) | `src/lib/trip/trip-command.ts`, `trip-plan-migration.ts`, `index.ts` |

## Remaining Wave 1 package

| Package | Status | What's needed |
| --- | --- | --- |
| **E1** — Map/data provenance | **LANDED on main** (`f979ea8`) | `RiderLayerDefinition` carries `provenance` + `dataCategory`; every `layerCatalog` entry is populated; `src/lib/client/map-data-provenance.ts` provides summary/verification helpers; unit tests cover the contract. |

## Not yet started — blocked / lead-owned / downstream

These are explicitly **not** GLM's to run autonomously, or depend on completed packages:

| Package | Why not done | Required owner / dependency |
| --- | --- | --- |
| **B1b** — Move geolocation/session effects out of `RideHud.tsx` | **Already present on main** — `useNavigationSessionController` owns GPS/session effects; the HUD remains presentation-first. | Verified in P2 |
| **B1c** — Recovery/recording/voice handoff behind controller commands | **LANDED locally in P2** — HUD consumes the grouped controller command boundary. | Verified in P2 |
| **B2** — Planner composition boundary (extraction only) | **LANDED locally in P2** — `PlannerComposition` owns PlannerDeck/RouteComparison composition; no behavior or UX change. | GLM |
| **D2** — Library and timeline integration | Depends on D1 contract | GLM |
| **D3** — Planned vs actual replay | Depends on D1 + privacy contract | GLM |
| **C2** — Data acquisition + worker integration | **LEAD-OWNED** — licensing, provenance, budgets, cache policy | Lead |
| **C3** — Offline UX / recovery drills | Depends on C1 + C2 | GLM after C2 |
| **E2** — Must-use road locks + reference-image line extraction | **SHAPE-06 delta landed locally in P4** — existing road-lock/avoid-area drawing and provider enforcement retained; unmatched `must` locks now remain explicitly unresolved instead of passing geometry-only satisfaction. Reference-image line extraction remains SHAPE-07 and is out of scope. | Lead / product |
| **E3** — Rider learning + community reports | Policy-heavy (consent, moderation, legal) | Lead / product |
| **E4** — Region manifests + expansion | Needs real graph data + region suites | Lead / product |
| **A1** — Refresh public-browser evidence | **LEAD-OWNED** — requires deployed `ride.henning.rodeo` + physical-device checks | Lead |
| **D4** — Sharing boundary | Account/community decision = separate product | Lead / product |

## Recommended next steps

1. **Verify E1 on current main** against its helper and unit-test contract; do not reimplement it.
2. **Integrate Wave 1**: commit each remaining package separately on `closure/glm-wave-1`, then run the full release gate (`npm run lint && npm run typecheck && npm test && npm run build`).
3. **Wave 2** (GLM-delegatable, after integration): B1b → B1c (sequential), then B2, D2, D3 in parallel.
4. **Lead-only items** (A1, C2, E2, E3, E4, D4) must be closed or explicitly deferred by the user before the reskin handoff gate; they cannot be smuggled into autonomous packages.

## Known caveats

### B2 UX boundary

The destination-only builder remains disabled until the rider supplies an
explicit start or grants browser GPS. The Free Ride prompt remains the
supported start-free entry path.

- E2E suite (`test:e2e`) could not execute in this sandbox because Turbopack refuses the symlinked `node_modules`. The spec compiles under `tsc` and should be run on a real machine against `npm run dev` before the A1 gate.
- The `service-worker.test.ts` unit test needs a gitignored `public/sw.js` to exist; the worktree copy was seeded from the main repo. Same applies to `data/gpx-library/` fixtures.
