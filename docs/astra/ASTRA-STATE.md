# Astra implementation checkpoint

Updated 2026-09-06. **Wave 0 landed on `main`; Wave 1 open. No wave is
release-qualified. DO NOT SHIP.**

## Repository and authority

- Repo `/root/Vibe/switchback`, working branch `implement/astra-wave-1`,
  based on `main` @ `3acc8562d688aaa84facf8ed100541e2c6e9d4bd`.
- Wave 0 and the premium map-sculpting wave are now on `main`:
  - PR #61 `ux/map-native-route-sculpting` → `main` merge `de775f0bd59ada65de6b8f71deb5d12733da5388`.
  - Astra Wave 0 rebased onto that base, tip `e46d67cd158621b18c3a68b0b3b3578f874254e2`
    (17 commits `f10d196…16fa625` replayed unchanged; `git range-diff`
    confirmed content-identical, no squash).
  - PR #63 `implement/astra-wave-0` → `main` merge `3acc8562d688aaa84facf8ed100541e2c6e9d4bd`
    (= current `main` HEAD).
  - Both feature branches deleted from the remote after merge.
- Checkpoint base for review provenance: `f10d196228599ac6626bcc07ba7ce22540011228`
  (reviewed Astra package). Application baseline is now `main` @ `3acc856`.
- `ROADMAP-WAVES.md` sequences Astra inside the existing premium wave; no
  second roadmap. Follow `IMPLEMENTATION-BACKLOG.md` dependency order.
- No production restart, deployment, identity/library migration, or provider
  change. Local production build attested below; deployed SHA remains
  unattested.

## Wave 0 — landed on `main` (advisor truth, retry, request contract, Home, selection)

- **One advisor request-contract authority** — `MAX_ADVISOR_CONVERSATION_TURNS = 12`
  beside `MAX_ADVISOR_BODY_BYTES` in `src/lib/advice/request-limits.ts`;
  server payload schema and client transcript trim both consume it; the
  client-only `MAX_POSTED_CONVERSATION` constant is gone.
- **Explicit "take me home" is a resolved return-target, never inferred** —
  `isExplicitHomeDestinationRequest` exported from `ai/ride-intent.ts`; the
  advisor handler short-circuits an explicit home turn with planner guidance
  rather than inventing a location; loop-qualified / generic wording still
  reaches the adviser; `usePlannerRideIntent` asks for a start point instead
  of routing saved Home to itself.
- **Automatic Best-ride selection stays visible** — `PlannerShell` no longer
  nulls a valid automatic selection when >1 candidate exists; SB-005
  protection of an explicit user pick is unchanged in the store. The
  `alternatives` visual baselines (desktop + mobile) were regenerated to the
  visible-default-selection state (ADR 0013).
- **Surface survey evidence separated from access truth** — one provenance
  label (`PA_UNPAVED_ROADS_PROVENANCE`) and one boundary sentence
  (`PA_UNPAVED_ROADS_SURFACE_BOUNDARY`) in `src/lib/roads/types.ts`, consumed
  by the advisor briefing, advisor toolbox, `RouteEvidencePanel`,
  `RouteComparison`, and the map layer catalog. Zero overlap reads as an
  informational zero; an unavailable survey is never turned into a confirmed
  zero; routing/OSM surface evidence is never erased. `describeRouteGrounded`
  reports "survey surface overlap" rather than "official surface legality".

## Wave 0 verification (merged base)

- Node 24.15.0 is `/root/.n/bin/node`. **Non-login shells default to Node 22**;
  set `PATH=/root/.n/bin:$PATH` for all commands. Do not rebuild shared native
  dependencies for Node 22.
- Exact-HEAD local run on the Wave 0 tip (tree identical pre/post rebase,
  `16fa625` == `e46d67c`): `npm run lint` passed; `npm run typecheck` passed;
  full Vitest **316 files / 2,015 tests / 0 failed / 0 skipped**; production
  build passed (Next.js 16.3.3, **537** route-atlas manifest routes);
  Playwright `advisor.spec.ts --project=desktop-chromium` **8/8**;
  Playwright `--project=road-lock` **1/1**.
- CI `Quality` run `34005008433` on `e46d67c` against the merged base:
  all nine required checks green — `typecheck`, `lint`, `vitest`, `build`,
  `critical-e2e`, `pwa`, `road-lock`, `real-router`, `visual` — plus
  non-required `pwa-smoke` and `rider-journeys`.
- **`mobile-core` remains red on `main`** — the documented advisory gate
  (nightly/manual, issue #42 "won't fix"). Its `planner.core.spec.ts` Level A
  specs are semantically stale; `"renders three V2 route decision cards
  without implying rider selection"` in particular now contradicts the
  Wave 0 visible-default-selection decision and will stay red until those
  specs are refreshed (Wave 1/2 scope). It is not a required check for `main`.
- Not exercised at this HEAD, still open: physical iPhone / PWA / GPS /
  background / airplane mode; rider corpus / usability review; the phone
  advisor error sheet cannot show error + context + retry without scrolling.

## Verification runtime

- Verification runs against the checked-out branch HEAD in `/root/Vibe/switchback`
  on Node 24. Playwright starts its own dev server (`playwright.config.ts`
  `webServer`); kill any orphaned `next dev` on the test port first. The old
  `/tmp/switchback-astra-candidate` scratch runtime is retired. Screenshots
  under `docs/astra/evidence/` and `docs/astra/evidence/wave0/` are historical
  evidence, not current acceptance.

## Wave 1 — "One recoverable ride intent" (implemented, awaiting adversarial review)

Branch `implement/astra-wave-1`. Application SHA `371e5df`; visual baselines
`45e53bb`. Not merged, not deployed.

**What changed.** Ride intent is one authored owner (`lib/domain/ride-intent` +
the planner store's `editRide`); a route is an answer to one revision of it.
Contract and rationale: `WAVE1-ARCHITECTURE.md`. Storage/rollback:
`WAVE1-MIGRATION.md`. Both are authoritative; this file is the checkpoint.

**Acceptance, against the Wave 1 list:**
- One writable owner per route-defining field — done; no direct field setter
  survives, and the last `SetStateAction` adapters are gone.
- Typed commands per migrated callback, legacy setters removed — done. Ride
  prompt, Advisor hand-off, saved-route restore, track import, sketch, settings
  and duration presets each land as one revision.
- 50-entry bounded intent history, no geometry — done; history is strictly
  linear, and any command that changes intent cuts redo.
- Pending/result revision identity enforced — done, in the coordinator's single
  fenced gate and again in the store.
- Controller-local abort — done.
- Atomic IndexedDB checkpoint — done, **intent only** (decision recorded in
  `WAVE1-ARCHITECTURE.md`); recovery replans automatically.
- Safe migration without losing library data — done; the pre-Wave-1 key is
  read-only, and the UI index carries over through the store's storage bridge.
- Cross-tab conflict detection — done, via a rotating write token.

**Corrections to the interrupted work.** Failed updates no longer rewrite the
rider's intent or fabricate a rider revision; Cancel has one meaning;
`cancelPlanning()` no longer reports a cancellation when nothing was in flight
(this had left the planner permanently "cancelled" and silently disabled the
location seed); a late recovery that loses to the rider is `superseded`, not
`conflict`, and keeps checkpointing; the checkpoint no longer declares a result
field it never wrote; `seedCurrentLocation` cannot cut a redo branch.

## Wave 1 verification (application SHA `371e5df`, tree `45e53bb`)

Node 24.15.0 (`PATH=/root/.n/bin:$PATH`; non-login shells default to Node 22).

- `npm run typecheck` passed; `npm run lint` passed (`--max-warnings=0`).
- Vitest **320 files / 2,061 passed / 1 skipped / 0 failed** (382.95s).
- Production build passed, **537** route-atlas manifest routes.
- Playwright `planner.spec.ts --project=desktop-chromium` **5/5**
  (was **2/5** on the untouched branch base `6744b01`).
- Playwright `ride-recovery.spec.ts --project=desktop-chromium` **3/3** — reload
  recovery, whole-ride undo/redo, failed-update + Cancel.
- `--project=road-lock` **1/1**; `--project=critical-chromium` **19/19**;
  `--project=critical-webkit-smoke` **2/2**.
- `--project=visual` **60/60** after rebaselining 7 planner snapshots.
- **Known flake:** `planner.spec.ts` "draws a rough route…" failed once at the
  Reverse-route step across three full-file runs (3/3 in isolation,
  `--repeat-each=3`). The same step fails on the untouched base `6744b01`, so it
  is pre-existing, not Wave 1. CI runs with `retries: 1`.

## Next exact task

Independent adversarial review of the Wave 1 PR by a fresh session, before
merge. Do not open Wave 2 until that review closes.

## Release boundaries

Wave 0 code is on `main`; its release gates are **not** met and must not be
marked passed from simulation: phone advisor error-sheet layout,
tiny-phone / short-landscape baselines, `mobile-core` spec refresh,
production source/build/provider baseline without secrets, real device /
PWA / GPS / background / airplane-mode evidence, rider corpus / usability
review. Draft/session loss on reload and intent-wide undo were the Wave 1 targets and
are closed. Still open outside the Wave 1 slice: Free Ride
recording/constraint continuity, editable polygons/sketches, full typed AI
proposals, responsive composition, honest route-specific offline recovery.
Wave 1 adds one boundary of its own: recovering with no connectivity restores
the ride but not a drawn route, because the checkpoint deliberately stores no
route geometry. Audit artifacts are historical evidence,
not current acceptance.

## Delegated ownership

No delegation active. Root owns `implement/astra-wave-1` — branch, commits,
docs, runtime, and integration.
