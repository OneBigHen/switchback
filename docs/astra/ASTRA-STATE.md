# Astra implementation checkpoint

Updated 2026-09-09. **Waves 0 and 1 are merged, the subsequent convergence
work through PR #102 is merged, and no wave is release-qualified. DO NOT SHIP.**

Current `main` is
`c91858479c176119ba633580cfc0902c6863ba8c`. Since the prior checkpoint, #82
landed the canonical map authority; #88 cleared the dependency/fallback-renderer
gate; #89–#94 fixed and closed the product-truth lane; #95–#101 completed the
shipped Prepare Ride slice; and #102 established a bounded planning
orchestrator plus store-free presentation boundary. PR #66 is closed without
merge. PRs #80 and #81 remain stale salvage-only drafts, not an integration
stack.

**Next task:** remediate and RED-test the two reproducible blockers found by
the exact-head Luna pass (selected-place identity preservation and recording
permission-denial recovery), then deploy and re-qualify the replacement SHA
before the real-iPhone checklist. Do not open Astra Wave 2 or another
refactor/UX wave in place of beta evidence.

## Repository and authority

- Repo `/root/Vibe/switchback`, `main` @ `c918584` (2026-09-09).
- Wave 0 and the premium map-sculpting wave are now on `main`:
  - PR #61 `ux/map-native-route-sculpting` → `main` merge `de775f0bd59ada65de6b8f71deb5d12733da5388`.
  - Astra Wave 0 rebased onto that base, tip `e46d67cd158621b18c3a68b0b3b3578f874254e2`
    (17 commits `f10d196…16fa625` replayed unchanged; `git range-diff`
    confirmed content-identical, no squash).
  - PR #63 `implement/astra-wave-0` → `main` merge `3acc8562d688aaa84facf8ed100541e2c6e9d4bd`
    (historical Wave 0 head; current `main` is recorded above).
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

## Wave 1 — "One recoverable ride intent" (merged to `main`, PR #64, 2026-09-06)

Reviewed and merged. Not deployed, not release-qualified.

**What changed.** Ride intent is one authored owner (`lib/domain/ride-intent` +
the planner store's `editRide`); a route is an answer to one revision of it.
The wave's own architecture and migration documents were removed on 2026-09-08
once the wave merged; the contracts they described are now the code, and this
checkpoint plus git history carry the rationale.

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
- Atomic IndexedDB checkpoint — done, **intent only**: the checkpoint stores
  the rider's intent and never route geometry, so recovery replans
  automatically rather than restoring a stale result.
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

## Wave 1 verification at review handoff (application SHA `371e5df`, tree `45e53bb`)

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

## The `45e53bb` rebaseline was captured with a key the reference has not

CI `visual` was red from `45e53bb` to `3fc2e73` (55/60). All five failures had
one cause, and it was in the baselines, not the product.

Gravel Goblin is a **server-declared, key-gated capability** (ADR 0021):
`advisorCapability` reports `enabled` only when `GEMINI_API_KEY` or
`ADVISOR_OPENROUTER_API_KEY` is present. This working copy's `.env.local` sets
both, so `next dev` served `GET /api/advisor` as enabled and the planner drew
the "Need a ride idea?" invite. CI holds no advisor secret, so it never draws
it. `45e53bb` regenerated seven snapshots on the keyed machine and baked that
optional card into five **generic** planner baselines.

Evidence, not inference: four of the five CI actuals are **byte-identical** to
the pre-`45e53bb` baselines that were green on `main` (`3841df8`); the fifth
(`plan-empty-320x700`) differs from it by **14 px, max channel delta 5** —
antialiasing, against a `maxDiffPixelRatio` of 0.02. The rebaseline, not the
Wave 1 code, moved those images.

- **Fix.** `installPlannerServices` now declares the optional advisor **absent**,
  so every generic fixture exercises the key-free baseline the product
  guarantees regardless of which machine runs it. `advisor.spec.ts` and
  `visual/gravel-goblin.spec.ts` install their own `/api/advisor` mock and own
  the enabled contract; neither uses `installPlannerServices`. Deleting the
  `expectAdvisorReady` wait (`fbc9f03`/`ed3bb57`) removed the assertion but left
  the environment dependence — the stub is what actually removes it.
- **Baselines.** The five generic snapshots are restored to the advisor-free
  product state. `map-provider-failure--desktop` was contaminated the same way
  and was **passing on threshold luck** (the card sits just under 2% of a
  1440x900 canvas); it is regenerated advisor-free. `gravel-goblin-routed-phone`
  keeps its `45e53bb` content — that spec mocks the capability on deliberately.
- `defaultRideIntent().profile` is `balanced`, matching the rider-settings
  default, so no snapshot depends on a first-route profile race.

## The bootstrap gate was swallowing the rider's first words

`planner.spec.ts` "turns a free-form timebox into a gravel loop" passes on
`main` and failed on this branch. It is not a required check, so CI never said
so. The cause was a real rider-facing regression, not a stale spec.

`1a43f1f` gated the planner deck with `inert` while `recoveryStatus` is
`loading`. `inert` cannot buffer input: instrumenting the load showed the
composer inert at first paint, `#ride-prompt` still empty after a full phrase
was typed, and the submit control disabled from then on. A rider who starts
describing their ride the moment the app paints loses the text and is told
nothing, because `inert` has no visible state.

Nothing needed that protection. Bootstrap is unsafe only if a checkpoint that
resolves late can overwrite an edit the rider already made, and the store
already forbids that: `restoreRide` adopts a checkpoint only while the intent
identity is still the one recovery started with and reports `superseded`
otherwise, and rider defaults seed only a semantically pristine ride. The gate
duplicated a guarantee the store makes, and charged the rider's input for it.

- **Fix.** `PlannerComposition` keeps `aria-busy` and drops `inert`. Bootstrap
  is reported, not enforced by confiscating the deck.
- **Guard.** `tests/components/planner-bootstrap-gate.test.tsx` asserts the
  attribute contract directly — busy is reported, the subtree is not inert, and
  the composer is inside the reported region. It fails against the `inert`
  wrapper, which was verified by restoring it. A browser-level version of this
  test was written and **discarded**: bootstrap settles faster than Playwright
  can type on a warm machine, so it passed with the bug present and would have
  implied coverage it did not have.
- `planner.spec.ts --project=desktop-chromium` is now **8/8** (was 7/8 with this
  regression); `ride-recovery.spec.ts` stays **3/3**.

## Wave 1 verification (application source unchanged from `371e5df`)

Full exact-head local run, Node 24.15.0, after the baseline correction:

- `npm run lint` (`--max-warnings=0`) passed; `npm run typecheck` passed.
- Vitest **324 files / 2,067 passed / 1 skipped / 0 failed** (401.38s).
- Production build passed, **537** route-atlas manifest routes.
- `--project=visual` **60/60**, twice, without `--update-snapshots`.
- `--project=critical-chromium` **19/19**; `--project=critical-webkit-smoke`
  **2/2**; `--project=road-lock` **1/1**.
- `npm run test:e2e:pwa` **2/2**; `npm run test:e2e:real-router` **5/5** against
  the local pinned GraphHopper 11.0 fixture.
- `mobile-core` (`webkit-standard` + `chromium-standard`, `tests/e2e/mobile-qa/core`):
  **46/48 on this host**. The two failures are both in `ride.core.spec.ts`
  ("recording starts…two bounded GPS samples" on WebKit, timeout; "off-route
  recovery presents a bounded rejoin action" on Chromium, an aborted
  `pa-unpaved-roads` request). Both reproduce **unchanged on the untouched
  head with these edits stashed**, and both pass in CI at that same head, so
  they are a property of this host's browser builds, not of Wave 1. CI's
  `mobile-core` is the reference for this gate.

## Next exact task

The exact-candidate deployment and beta qualification against
`c91858479c176119ba633580cfc0902c6863ba8c` completed the automated gates,
served-build attestation, Luna black-box rider missions, and adversarial
triage. The candidate is HOLD because the mission set reproduced wrong-place
destination resolution and recording-control loss after GPS denial. Any code
fix creates a new candidate and restarts the evidence chain. Do not reopen the
closed remediation campaign or start a new architecture wave.

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

No implementation-wave delegation is active. Candidate QA workers may own
bounded black-box rider missions; root owns the immutable-build evidence and
deduplicated beta verdict.
