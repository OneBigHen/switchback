# OpenGravel long-trip choices, Route Policy V2, and provider expansion — implementation plan

> **Execution authority:** `2026-09-14-cheap-agent-execution-authority.md` is the
> canonical execution index, dependency graph, status record, and runbook directory
> for this plan. This document remains the design rationale and evidence inventory;
> its sequencing or completion language is superseded where the authority says so.

> **For the implementing agent (any model):** execute task by task, in order, and run each task's verification before starting the next. Do not "improve" anything outside your assigned task. Do not commit unless a task says to. Every line citation was verified on the base branch below; re-verify a line before editing it, and if a citation is wrong, fix the citation in this file in the same PR rather than guessing.

**Validated base at plan time:** `ux/streamline-pass-1` @ `a1346aeb` (draft PR #139 →
`main`). Reconcile the live branch and PR head before every execution packet. PR 1
stacks on the reconciled #139 base; later packets must follow the authority graph.

**How to read this document.** The owner's request, the roadmap mapping, and the capability inventory are context. The work is in **Workstreams** below. If you only need to implement, read *Execution rules* → *Task index* → your assigned workstream.

---

## Execution rules (hard constraints)

1. **Never mark a phase or PR complete without its own evidence.** Running the gates is evidence; a green conversation is not.
2. **One PR = one workstream.** Do not fold two workstreams into one branch.
3. **Run gates in the worktree**, and only on the megaplex appliance for heavy runs (see *Verification*). Never point a `pull_request` CI job at `self-hosted` — `docs/SELF-HOSTED-CI.md` forbids it.
4. **Do not touch frozen decisions.** `PA_NJ_ROUTE_POLICY_V1` stays byte-identical. Mapbox Directions, the Mapbox Navigation SDK, a learned ranker, Redis, billing, and microservices are rejected — do not add them.
5. **Do not change what a rider sees unless the task says to.** In particular PRs 1, 2 and 5 are server-side; the only intended UI change before PR 4 is the "couldn't find a different route in time" message in PR 1.
6. **Do not write to production** (`/etc/switchback/switchback.env`, `/root/Vibe/switchback/.env.local`, the running service) unless the task explicitly says so and the owner has approved deploy.
7. **TDD order is mandatory where a task lists tests:** write the failing test, watch it fail, then implement, then watch it pass. Never rewrite a test to match broken behaviour; if a test is genuinely outdated, say so in the PR body.
8. **Change one test expectation at a time and explain why in the PR body.** Existing planner tests assert ordering and warnings, so several will need deliberate updates — that is expected work, not noise to be silenced with snapshot rewrites.
9. **If a task is ambiguous, stop and ask.** Do not invent a policy, a threshold, or a product decision. The *Open items* section is where unresolved decisions live.
10. **Report honestly.** If a gate fails, say which gate, which spec, and whether it is pre-existing (see *Inherited gate state*). Never describe an unrun check as passing.

---

## Task index — 33 canonical tasks

| Task | Workstream | Files (primary) | Done when |
|---|---|---|---|
| T-0.1 | Step 0 | `bench/run.mts`, `docs/design/2026-09-04-advisor-provider-bakeoff.md`, `.env.example` | bench can target any OpenRouter model |
| T-0.2 | Step 0 | production `.env.local` | advisor answers on the new model through the app |
| T-1.1 | PR 1 | `src/lib/routing/deadline.ts` (new) | fake-timer unit tests pass |
| T-1.2 | PR 1 | `src/lib/routing/alternatives-strategy.ts` (new) | strategy unit tests pass |
| T-1.3 | PR 1 | `normalized-request.ts`, `graphhopper-request.ts`, `valhalla.ts`, `handler.ts` | `engineAlternates` honoured and stripped from client input |
| T-1.4 | PR 1 | `src/lib/routing/candidate-lanes.ts` (new) | completion-order tests pass |
| T-1.5 | PR 1 | `planner.ts` | lane tables implemented; no `await` in index order |
| T-1.6 | PR 1 | `planner-contract.ts`, `planner-shared.ts`, `hybrid.ts`, `route.ts` | enrichment and fallback respect the deadline; Valhalla has its own limiter |
| T-1.7 | PR 1 | `planner-contract.ts`, `trip-planning-coordinator.ts`, `handler.ts` | `alternativesOutcome` + diagnostics + Server-Timing land; client message shows |
| T-1.8 | PR 1 | `graphhopper-response.ts`, `hybrid.ts` | double scoring removed, tests still green |
| T-1.9 | PR 1 | `tests/unit/*`, `tests/components/*` | new + updated specs pass |
| T-1.10 | PR 1 | `scripts/benchmark-routing.mjs`, `artifacts/routing-rework/reports/` | route count + Server-Timing recorded; calibration sweep recorded |
| T-2.1 | PR 2 | `src/lib/recommendation/route-policy.ts` | `PA_NJ_ROUTE_POLICY_V2` frozen; V1 pinned by test |
| T-2.2 | PR 2 | `src/lib/recommendation/route-score.ts` | V2 rescales axes; V1 output byte-identical |
| T-2.3 | PR 2 | `src/lib/recommendation/route-roles.ts` (new) | role assignment unit tests pass |
| T-2.4 | PR 2 | `planner-contract.ts` | `TripPlan.decision` typed and populated |
| T-2.5 | PR 2 | `RouteDecisionCard.tsx`, `route-explanations.ts`, `planner-store.ts`, `RouteComparison.tsx`, `PlannerShell.tsx` | no browser role guessing remains |
| T-2.6 | PR 2 | `tests/fixtures/routing/golden.ts`, `route-policy.test.ts`, `tests/components/route-role-truth.test.ts` | role corpus passes for V1 and V2 |
| T-2.7 | PR 2 | `artifacts/routing-rework/reports/` | policy-compare report checked in |
| T-3.1 | PR 3 | `next.config.ts` | CSP allows Mapbox; the `arcgisonline` typo is fixed |
| T-3.2 | PR 3 | `src/components/planner/MapStage.tsx` | runtime fallback unit test passes |
| T-3.3 | PR 3 | `v2/LayersSheet.tsx`, `MapStageLayerControl.tsx` | labels match the active renderer |
| T-3.4 | PR 3 | new Playwright spec | Mapbox mounts in a browser test; forced failure falls back |
| T-3.5 | PR 3 | production `.env.local`, ADR 0015 note, `docs/astra/ASTRA-STATE.md` | owner-approved deploy; picker shows Satellite on prod |
| T-3.6 | PR 3 | production `.env.local`, provider dashboard, `docs/astra/ASTRA-STATE.md` | **OWNER OPS only:** approved production rollout, monitoring, and rollback evidence |
| T-4.1 | PR 4 | `v2/RideStyleChips.tsx` (new), `PlanOptions.tsx`, `PlanComposer.tsx` | one-tap style; chips test passes |
| T-4.2 | PR 4 | `RouteDecisionCard.tsx`, `RouteComparison.tsx` | cards show role, +N min, explanation, climb, toll, gravel |
| T-4.3 | PR 4 | `src/lib/traffic/tomtom.ts`, `api/route-traffic/route.ts` | up to 3 routes; budget + breaker; card messages |
| T-4.4 | PR 4 | `LayersSheet.tsx`, `ExploreDestination.tsx`, `RidesSurface.tsx`, `api/capabilities/route.ts` (new), `RideIntentFeedback.tsx` | hidden work visible; dead Free Ride hidden |
| T-4.5 | PR 4 | `tests/components/*`, visual baselines, mobile-core | component + visual + 390 px checks pass |
| T-5.1 | PR 5 | `src/lib/routing/tomtom-routing.ts` (new) | adapter unit tests pass; flag off |
| T-5.2 | PR 5 | `src/lib/routing/tomtom-routing.ts` | GraphHopper re-normalization + overlap discard tested |
| T-5.3 | PR 5 | `scripts/bakeoff-tomtom-thrilling.mjs` (new), `docs/design/2026-09-xx-tomtom-thrilling-bakeoff.md` | bakeoff recorded |

---

## Coverage matrix (the owner's ask → where it is handled)

The request was: *find the long-trip alternatives; make it easier to pick a route kind; keep improving the routing algorithm; leverage TomTom and other capabilities; Mapbox is not a real map option (only default terrain and normal); lots of built work isn't visible.*

| Owner's ask | Handled in | Evidence that closes it |
|---|---|---|
| Long trips show one route and no choices | PR 1 | `routes.long.alts` p50 ≤ 11 s with ≥ 1 route, every run |
| Easier to pick the kind of route | PR 4 T-4.1 | one tap to any style; chips test + 390 px check |
| Keep improving the routing algorithm | PR 1 (deadline/lanes), PR 2 (policy V2, fair scoring, server roles), PR 5 + T7 (new candidate source) | policy-compare report; role corpus |
| Leverage TomTom | PR 4 T-4.3 (traffic per card), PR 5 (routing adapter, dark), T7 (federation) | bakeoff report; per-card incident text |
| Leverage other capabilities | PR 4 T-4.2/T-4.4, capability table below | climb, toll, gravel evidence on cards; `/api/capabilities` |
| Mapbox is not a real map option | PR 3 | Satellite + Lighting in the picker on prod, with fallback |
| A lot of built work isn't visible | PR 4 T-4.4 + capability table | layer cap raised, 3D rides in nav, capabilities payload |

Everything the owner named is covered. Everything found but **not** covered is listed with an explicit disposition or in *Open items* — nothing is silently dropped.

---

## Roadmap phase mapping

`docs/release/ROADMAP-WAVES.md` freezes "each phase is one reviewable PR". This plan executes several phases, so the mapping is explicit and no phase is declared complete without its own acceptance evidence.

| This plan | Roadmap phase | Covers |
|---|---|---|
| PR 1 | **unphased bugfix** | Long-trip alternatives deadline + the candidate-lane substrate Phase 7 builds on. Filed as a fix outside phase sequencing (owner decision 2026-09-14). |
| PR 2 | **Phase 7** | `PA_NJ_ROUTE_POLICY_V2`, rider-facing route roles, Protect the Ride cost, traffic as real evidence. |
| PR 3 | **Phase 1 (rollout)** + **part of Phase 2** | Mapbox Standard live behind the existing owner-only gate, with parity/fallback evidence. Picker labels + Satellite are Phase 2. Light presets, premium route ribbon, road-character layer and map-pack migration stay open. |
| PR 4 | **Phase 4** + **part of Phase 6** | Server-declared capabilities (ADR 0021 slice) + traffic evidence end to end. Future-departure-time routing stays open. |
| PR 5 | **Phase 5** | TomTom capability bakeoff, recorded findings, tested adapter that ships **dark**. |
| Step 0 | **ops** (no phase) | Advisor model swap; config only, no build. |

**Phase 5 boundary is honoured:** PR 5 does not change route selection. Federating Thrilling candidates is Phase 7 work — *Open item T7*.

Untouched phases: 3, 8, 9, 10, 11, 12.

---

## Owner decisions (2026-09-14)

- **Mapbox:** on in production, with a MapLibre fallback.
- **TomTom:** traffic on every route card; Thrilling generation ships dark in Phase 5, federated in Phase 7.
- **Advisor:** move off DeepSeek onto a free OpenRouter model.
- **Ride style:** always-visible chips, not a collapsed row.
- **Plan home:** this document plus the roadmap mapping.
- **Long-trip fix:** standalone PR based on #139.

---

## Baseline and inherited gate state (measured 2026-09-14)

`artifacts/routing-rework/reports/baseline-2026-09-14.md`, tag `after-ux1-8dcb1db8`, base URL `http://127.0.0.1:3200`, 3 runs:

| Endpoint | p50 | p95 | max | provider counts |
|---|---|---|---|---|
| `routes.direct.alts` | 973 ms | 1141 ms | 1141 ms | graphhopper×2 |
| `routes.long.alts` | **12008 ms** | 12020 ms | 12020 ms | **n/a** |

`routes.long.alts` at exactly the 12 s deadline with `n/a` providers is the defect in one line: no routes returned. The report also notes "Thresholds are NOT enforced here; Phase 7 owns the performance budget gates" — so PR 1's benchmark numbers are recorded evidence, and the numbers above are the comparison baseline for §10.

**Known-red gates on the base tip.** The megaplex run `logs/ux1-20260914-074925` (after the same commit) shows:

| Gate | Result | Failing spec |
|---|---|---|
| lint, typecheck, vitest, build, roadlock, pwa, realrouter | pass | — |
| critical | **rc=1** (1 failed) | `tests/e2e/critical/planner-surface-composition.spec.ts:237` — "a failed route plan shows the rider why, without hunting for it" |
| visual | **rc=1** (3 failed) | Record screen (desktop + phone-landscape) and a ux-state route-preparation surface |

**Before starting PR 1:** re-run `critical` on the base and on `main`. The Record-screen visual is a known-flaky pre-existing failure. The other two touch exactly the surfaces PR 1 changes (plan-failure messaging and route preparation), so they must be triaged *before* PR 1 lands rather than blamed on PR 1 — fix them in a small separate commit on the base if they are real, and say so in the PR body. PR 1 must not be reported green while these are unexplained.

---

## Capability inventory and disposition

Every capability the scouts found, with an explicit disposition. "Prod?" reflects the two real env sources on the production host: `/etc/switchback/switchback.env` (systemd, server-only secrets) and `/root/Vibe/switchback/.env.local` (build-time `NEXT_PUBLIC_*` **and** Next-loaded runtime vars).

| Capability | Gate | Prod? | Disposition |
|---|---|---|---|
| Mapbox renderer, Satellite, Lighting, real Terrain | `NEXT_PUBLIC_SWITCHBACK_PREMIUM_MAPBOX` + token + CSP | **No** (flag unset, CSP blocks) | **Ship** — PR 3 |
| Mapbox on non-planner maps (route library, route detail, thumbnails, Recon) | always MapLibre | n/a | **Out of scope** — PR 3 covers the planner only |
| Light presets (Auto/Dawn/Day/Dusk/Night) | premium renderer only | No | **Delivered by PR 3** (the picker already exists at `MapStageLayerControl.tsx:217-235`) |
| `GET /api/capabilities` (ADR 0021 slice) | not implemented | No | **Ship** — PR 4 T-4.4, no identity gating yet |
| TomTom traffic incidents | `TOMTOM_API_KEY` | **Yes** | **Extend** — PR 4 T-4.3 (all cards, budget, breaker) |
| TomTom routing / Thrilling | not implemented | No | **Ship dark** — PR 5; federate in T7 |
| GraphHopper | `GRAPHHOPPER_URL` | Yes | Keep as the baseline engine that must answer alone |
| Valhalla routing | `VALHALLA_URL` | Yes | **Tighten** — own limiter, no fallback after abort (PR 1 T-1.6) |
| Valhalla elevation → `ascentMeters` | `VALHALLA_ELEVATION_URL` | Yes | **Show it** — PR 4 T-4.2 (computed today, rendered nowhere) |
| Curvature DB | `CURVATURE_DB_PATH` | Yes | Keep; PR 4 makes its influence legible via explanations |
| Gravel Atlas | `GRAVEL_ATLAS_DB_PATH` + graph/source fingerprints | **Yes** (both fingerprints are in `.env.local`) | **Show it** — PR 4 T-4.2 renders `gravelAtlasEvidence` |
| Toll evidence | GraphHopper `toll` detail | Yes | **Show it** — PR 4 T-4.2; today `allow-with-warning` never warns |
| Weather (NWS) | `NWS_USER_AGENT` | Yes | No change |
| Google places / geocode | server `GOOGLE_MAPS_API_KEY` | **Yes** (in systemd env) | No change |
| Google 3D cinematic (ADR 0016) | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — read nowhere in `src` | Key present, **not built** | **Defer** — Phase 10 |
| Advisor (Gemini / OpenRouter) | `GEMINI_API_KEY`, `ADVISOR_OPENROUTER_API_KEY` | Yes | **Swap model** — Step 0 |
| OpenRouter ride intent | `OPENROUTER_API_KEY` | Yes | No change |
| You.com ride research + corridor hints | `YOU_API_KEY` | **Yes** (in systemd env) | No change |
| Photon geocoding | `PHOTON_URL` | Yes | No change |
| Passkey identity / sync / community publish | `SWITCHBACK_SESSION_SECRET` (32+) | **Yes** | No change |
| Community operator tools | `SWITCHBACK_COMMUNITY_OPERATOR_IDS` | **No** | **Leave off** — not a rider surface |
| Free Ride Live | `FREE_RIDE_RIG_PATH` | **No** | **Hide when unconfigured** — PR 4 T-4.4 |
| `/labs/recon` 3D rides | default on | Yes, but reachable **only** from a replay back link | **Make reachable** — PR 4 T-4.4 |
| "Road controls" quick layer | Overpass | Yes, but cut by a cap of 4 | **Fix the cap** — PR 4 T-4.4 |
| Unused graphics: `ElevationSparkline`, `SurfaceMixBar`, `RideCharacterBars` | — | — | **Use** — PR 4 T-4.2 |
| Unused graphics: `EvidenceMeter`, `ConfidenceBadge`, 6 icons | — | — | **Leave unused.** Do not delete in these PRs |
| `featureFlags.neuralRanking` | defined, never read | n/a | **Hide the "Neural" chip** (PR 4 T-4.1); do not delete the flag |
| Loops get one route (ADR 0020 "up to three") | not implemented | No | **Out of scope** — *Open item L1* |
| Protect the Ride cost (ADR 0019) | not implemented | No | **Partial in PR 2** — *Open item P1* |
| Rider-history re-ranking | `rider-route-ranking.ts` | Yes, unlabelled | **Label it** (PR 4 T-4.2); hysteresis in PR 2 T-2.5 |

**Production evidence (probed 2026-09-14 against `127.0.0.1:3100`):** `GET /api/map-features?layers=gravel-atlas` over a New Jersey bbox returned **200 with 11 features**, and `?layers=road-controls` returned **200 with 369 features**. Gravel Atlas is genuinely live, so T-4.2 has real evidence to render and T-4.4 only has to fix the UI cap — neither is a missing-config problem.

---

## Root causes (verified on the base branch)

**Long trips return nothing**
- Every two-point comparison request uses GraphHopper `alternative_route` (`src/lib/routing/graphhopper-request.ts:354`), not just the primary's profile. Measured Philadelphia → State College: fastest 18.1 s, twisty 21.4 s (`c1159484`) against a 12 s deadline (`planner.ts:49`).
- `comparisonProfilesFor({profile:"twisty"})` returns `[twisty, quick, …]`, so the first pair both overrun. Nothing survives regardless of ordering.
- Results are consumed strictly in order via `await pending.get(index)` (`planner.ts:483`), so the deadline also discards a sibling that already finished. Result: HTTP 200 with `routes: []`.
- Enrichment (`planner.ts:508`) never gets the deadline signal; the Valhalla fallback still fires after cancellation (`hybrid.ts:77-79`).
- The client drops warning-only results (`trip-planning-coordinator.ts:174-178`).
- Loops return a single route by design (`planner.ts:394-401`) — see Open item L1.

**Picking a ride style**
- Road-feel chips sit in a collapsed row (`PlanOptions.tsx:164-212`): 2 taps before planning, 3 after. Cards are hidden while it is open (`PlannerDeck.tsx:509`).
- The row mixes real styles with "Avoid Highways" and "Neural"; Quick and Balanced both map to `motorcycle_fastest`.
- A destination ride stays "Fastest" until the rider also picks a time preset (3rd tap).
- `plan-preference-summary.ts:29-47` never receives the bike profile, so it never shows.

**Scoring**
- `baselineDurationSeconds` is never passed on the planner path (only `free-ride.ts` uses it), so `detourPct` is always 0 (`route-score.ts:332-335`).
- Adding the baseline alone is a trap: `scoreRoute` rejects outright when `detourPct > maxDetourPct` (default 0.25, `route-score.ts:346`) and the diversity functions drop rejected routes. Role envelopes must ship in the same change.
- Each alternative is scored with its own profile's weights, then totals are compared across profiles.
- Roles are guessed in the browser (`RouteDecisionCard.tsx:105`, `:125-129`). "Fastest Now" is the shortest duration — **not traffic-aware** despite the name.
- `signalDensity`, `stopDensity`, `incidentPenalty`, `novelty` are never filled in (default 0.5); `context.rider` is never passed, so preference fit is always 50.
- `routeTradeoff()`, `routeScore.explanations[]`, `ascentMeters`, toll evidence and `gravelAtlasEvidence` are computed but never rendered.
- GraphHopper responses are scored twice: `graphhopper-response.ts:206`, overwritten at `hybrid.ts:36`.

**TomTom**
- Only Orbis incident details are called (`src/lib/traffic/tomtom.ts:9`). `getTomTomRouteTraffic` covers only the selected route; incidents never reach the cards and never enter scoring (`route-score.ts:370` uses a highway-share proxy).
- No calculateRoute, no `routeType=thrilling`, no budget, no circuit breaker.

**Mapbox**
- `NEXT_PUBLIC_SWITCHBACK_PREMIUM_MAPBOX` unset in production; `mapboxRendererStatus()` (`mapbox-config.ts:24-44`) needs flag *and* token.
- The CSP (`next.config.ts:21-25`) allows no `mapbox.com` host, so tiles would be blocked even with the flag on. Same line has a typo: `https://server.arcgisonline` (no `.com`).
- No runtime fallback: on failure the stage shows an error (`PlannerMapStage.tsx:965-982`) and stays there.
- No Playwright config or workflow sets the flag, so **no browser test has ever run Mapbox**.
- On MapLibre, "Terrain" loads OpenFreeMap Liberty — no elevation, hillshade or 3D (`planner-map-renderer.ts:60-66`), and `applyExperience` is a no-op (`:311-314`).

**Built but hidden**
- "Road controls" is cut by a hard cap of 4 (`LayersSheet.tsx:61-62`) while `QUICK_LAYER_IDS` has 5 ids with `road-controls` last (`MapStageLayerControl.tsx:76`).
- `/labs/recon` is reachable only from the "All rides" back link on a replay page (`ReconRideView.tsx:39`).
- The Free Ride control renders although `FREE_RIDE_RIG_PATH` is unset, so it always answers "needs an installed verified RIG graph".
- The "90-minute backroads" preset only appears with existing undo/recovery state, so a new rider never sees it.
- `TripPlan.warnings` is sent to the advisor only, never shown to riders.
- Rider-history re-ranking silently changes the selected route with no label.
- `RouteEvidencePanel.tsx` still carries stale traffic copy ("Never inferred when a live licensed/agency feed is unavailable") despite the traffic strip existing.

---

## Step 0 — Advisor on a free model (config only, no roadmap phase)

**T-0.1 — make the bench target selectable**
- Files: `bench/run.mts`.
- Do: replace the hard-coded `DEEPSEEK_MODEL` with `process.env.BENCH_OPENROUTER_MODEL ?? DEEPSEEK_MODEL`. No other behaviour change. This commit rides in PR 1.
- Verify: `BENCH_OPENROUTER_MODEL=openrouter/free npx tsx bench/run.mts --help` (or a 1-task dry run) uses the override.
- Done when: the bench can target any OpenRouter model without a code edit.

**T-0.2 — bake off, then switch production**
1. Run a short bench: `BENCH_REPS=1`, `BENCH_ONLY` set to ~4 task classes (read-route, compare, build-from-sentence, route-only). Keep it small; free endpoints have daily caps.
   - **Pass bar:** schema-valid answers, real tool calls on tool tasks, turns under the 30 s deadline.
2. Candidate: `nvidia/nemotron-3-super-120b-a12b:free` — it supports tools and `response_format: json_schema` with `require_parameters: true`, which the adapter (`src/lib/advice/openrouter-adviser.ts`) sends. Verified against `GET /api/v1/models` (2026-09-14). If it fails the bar, try `nex-agi/nex-n2.5-pro:free` **and report before choosing**.
3. Back up production `.env.local` to `/etc/switchback/env.local.backup-<ts>`.
4. Append `OPENROUTER_ADVISOR_MODEL=<chosen>` to `/root/Vibe/switchback/.env.local`, then `systemctl restart switchback-cloudflare.service` (~2 s; server-side, no rebuild). Leave `OPENROUTER_MODEL=openrouter/free` alone. The override is read at `src/lib/advice/capability.ts:145`.
5. Verify one real advisor turn through the app.
6. Record it in `.env.example` and a bake-off doc addendum.

**Tell the owner:** free endpoints may log prompts and OpenRouter caps free calls per day. The advisor still falls back to Gemini under `ADVISOR_PROVIDER=auto`.

---

## PR 1 — `fix(routing)`: long trips return alternatives

Standalone bugfix PR based on `ux/streamline-pass-1`. Not a roadmap phase. **Do not** wire Thrilling in here, and **do not** change scoring policy here.

The deterministic execution procedure for T-1.1 through T-1.10 is
`2026-09-14-pr1-long-trip-alternatives-agent-runbook.md`. That runbook's verified
symbols and tests supersede moved line citations below.

**T-1.1 — deadline helper (new `src/lib/routing/deadline.ts`)**
- Export `timeoutSignal(ms)`, `composeSignals(...)`, `createDeadline(ms, parent)`.
- Build on `setTimeout`/`clearTimeout`: `AbortSignal.timeout` does not follow Vitest fake timers, which `tests/unit/request-timeout.test.ts` already works around.
- Replace `AbortSignal.timeout` at `planner.ts:412-414`.
- Verify: new unit test advances fake timers and observes abort; existing `request-timeout` spec still passes.

**T-1.2 — distance strategy (new `src/lib/routing/alternatives-strategy.ts`)**
- `chooseAlternativesStrategy(req)` → `"engine-alternates"` only when: 2 points, no corridor, straight-line distance ≤ `ENGINE_ALTERNATES_MAX_CROW_MILES = 60`.
- Env override `ROUTING_ENGINE_ALTERNATES_MAX_MILES`, calibration only.
- Rationale: ~34 mi ≈ 0.5 s and 154 mi ≈ 16–21 s, so cost grows roughly as `d^2.4`. The final number comes from the T-1.10 sweep.
- Verify: unit test at the boundary (just under / just over) selects different strategies.

**T-1.3 — engine alternates become explicit**
- Add `engineAlternates?: boolean` to `NormalizedRouteRequest` (`src/lib/domain/routing/normalized-request.ts`).
- `createGraphHopperRequest` uses `alternative_route` only when it is true.
- `valhalla.ts:106` sends `alternates` only when it is set.
- **Strip the field from client input in `handleRouteRequest`.** The schema is `passthrough: true` (`handler.ts:124`) and `normalizeRouteRequest` copies unknown fields, so without this any client can set it.
- Verify: `graphhopper-request.test.ts:83` updated (it currently relies on the old condition), plus a wiring test proving a client-supplied `engineAlternates` is stripped.

**T-1.4 — lanes settle in completion order (new `src/lib/routing/candidate-lanes.ts`)**
- API: `settleLanes(lanes, { concurrency: 2, deadline, shouldStop })`.
- Each lane has its own `budgetMs`, **including limiter queue wait**.
- At the deadline, resolve immediately with every finished lane — never `await` in index order.
- Stop early once the reference and primary-style lanes settled and enough distinct candidates exist; stopping aborts the rest and frees limiter tokens.
- Verify: fake-timer tests in T-1.9.

**T-1.5 — lane tables in `planAlternativeRoutes` (`planner.ts:378`)**

| Trip | Lanes, in order |
|---|---|
| Short | `quick` single-path (3 s) → primary profile **with** engine alternates (5 s) → other comparison profiles, single-path (5 s each) |
| Long | `quick` single-path (3 s) → ≤ 2 corridor via-point lanes on the primary profile (7 s each) → other profiles, single-path, **excluding the primary profile** (7 s) → optional Valhalla lane (6 s) |

- **Corridor lanes:** anchors from `buildAnchorSets(start, finish, corridorEnvelope(primaryMiles × 1.35), options.resolveCorridors sources)` (`destination-corridors.ts:236`), then `generateCorridorCandidates(req, sets, { maxCandidates: 2 })` (`candidate-generator.ts:61`).
- **Budget:** candidates must land by 10 s; the last 2 s are for enrichment and selection.
- **Selection:** sort by lane priority and path index, **never by finish time**. Then `evaluateEligibility` → `chooseDistinctCandidate` (`src/lib/recommendation/route-diversity.ts`). `selectedRouteId` stays the primary.
- Fix the stale "concurrency one" comment while you are there.

**T-1.6 — deadline-aware enrichment and fallback**
- `RouteCandidateEnricher` gains `options.signal` (`planner-contract.ts`).
- `enrichCandidates` (`planner-shared.ts`) races the signal and runs **once, in parallel**, over the final ≤ 2 routes (today it is awaited one candidate at a time inside the loop).
- `hybrid.ts:77-79` skips the Valhalla fallback when the call was aborted or the error is `ROUTE_CANCELLED`.
- Export `createValhallaCandidateProvider` from `hybrid.ts` and inject it in `route.ts` with its **own** `createRouteJobLimiter(1)`. Today both providers share the two tokens from `route.ts:28`. Keep it off when `VALHALLA_URL` is unset.

**T-1.7 — contract and client**
- `TripPlan.alternativesOutcome` = `{ status: complete | partial | timed-out | none-distinct | unavailable, strategy }`.
- `TripPlan.diagnostics.lanes[]` carries internal "dropped duplicate" / "comparison unavailable" text; `warnings` keeps only rider-facing text.
- `timingMs` gains `alt-lanes`, `alt-enrich`, `alt-select`, `lane-<id>`, emitted via `serverTimingHeader` (`handler.ts:352`).
- Client (`trip-planning-coordinator.ts`): merge warning-only results; on `timed-out`/`unavailable` show "Couldn't find a different route in time — your route is ready."

**T-1.8 — remove the double scoring**
- Keep the score from `graphhopper-response.ts:206`; stop overwriting it at `hybrid.ts:36`.

**T-1.9 — tests**
New `tests/unit/planner-alternatives-deadline.test.ts` (fake timers):
- finished lanes are kept at the deadline;
- reversing finish order yields the same ids and order;
- an over-budget lane is aborted and the next lane starts;
- an enricher that never resolves still returns a plan by 12 s;
- short vs long strategy at the distance boundary;
- a long trip with curvature sources produces a 3+ point corridor request;
- an external cancel stops lane launches.

Update deliberately: `planner.test.ts` (145, 180, 578, 616, 646, 682), `graphhopper-request.test.ts:83`, `hybrid-routing.test.ts`, `candidate-enrichment.test.ts`, `trip-planning-coordinator.test.ts`, `routes-api-wiring.test.ts` (lane Server-Timing; injected `engineAlternates` stripped).

**T-1.10 — benchmark and calibration (`scripts/benchmark-routing.mjs`)**
- Record `routeCount`, Server-Timing and `alternativesOutcome` — today it records neither route count nor Server-Timing, which is why "0 routes" only shows as `n/a`.
- Add `routes.mid[.alts]` (Harrisburg → Scranton, ~100 mi).
- Add `--calibrate-alternates --graphhopper-url` sweeping 35/60/80/100/155 mi; threshold = largest distance where `alternative_route` p95 ≤ 4 s.
- **Acceptance:** `routes.long.alts` p50 ≤ 11 s with ≥ 1 route every run (target 2), and `routes.direct.alts` route count ≥ the 2026-09-14 baseline (3 runs, p50 973 ms).
- Write the report to `artifacts/routing-rework/reports/`.

**Optional ops (ask first, do not do unprompted):** #133 GraphHopper JVM sizing/swap and CH for base profiles — only if twisty single-path lanes still dominate.

---

## PR 2 — `feat(routing)`: Route Policy V2, server-side roles, fair scoring (Phase 7 foundation)

This packet is a **partial Phase 7 foundation**, not Phase 7 closure. It cannot be
called complete until the Packet F traffic contract supplies real traffic scoring,
the Protect-the-Ride cost, and the corpus/evidence gates required by the execution
authority.

**T-2.1 — policy.** Add a frozen `PA_NJ_ROUTE_POLICY_V2` in `src/lib/recommendation/route-policy.ts` next to the untouched V1.
- Role envelopes: fastest-now 0, fast-and-fun 0.15, best-ride 0.35, maximum-twisties 0.60.
- `preferredDetourPct` 0.15; `unknownAxisMode: "exclude"`; `bestRidePrimaryHysteresis` 3.
- ADR 0022 fixes the *shape* (Fastest Now none, Fast & Fun moderate, Best Ride generous, Maximum Twisties largest) and says weights are "starting coefficients validated against a route corpus". These numbers are proposals to validate in T-2.6.
- Verify: a test pins V1 byte-identical and V2 frozen.

**T-2.2 — scorer (`route-score.ts`).** V2 drops axes with no data and rescales the remaining weights; adds the explanation "Traffic evidence unavailable." (ADR 0019: unknown ≠ good). V1 output byte-identical.

**T-2.3 — roles (new `src/lib/recommendation/route-roles.ts`)**
- `rescoreCandidatePool` scores every route against the **requested** profile so totals share one scale. Baseline = fastest eligible duration; resample candidates to 128 points. The 0.60 envelope rejects; `targetMinutes` waives envelopes (ADR 0022: an explicit rider choice overrides the role default).
- `assignRouteRoles` fills roles in order, each ≤ 85% overlap:
  1. **Fastest Now:** ≥ max(5 min, 5%) faster than the primary, else the primary holds it.
  2. **Best Ride:** highest total within 35%, with a 3-point primary tie hysteresis.
  3. **Maximum Twisties:** within 60% and ≥ 5 twistiness points above Best Ride.
  4. **Fast & Fun:** within 15%.
  5. Any open slot filled by MMR.
- One role per route; outside every envelope → `role: null`. Replaces PR 1's selection step; sketch corridors untouched.

**T-2.4 — types (`planner-contract.ts`)**
- `TripPlan.decision: RouteDecisionSet` = `{ policyVersion, scoredProfile, baselineRouteId, baselineDurationMinutes, recommendedRouteId, assignments[] }`.
- Each assignment carries `role`, `detourPct`, `addedMinutes`, `addedMiles`, a score subset, ≤ 3 explanations.
- `primaryRoute` gains a bounded `summary` (≤ 24 keys) so the stateless endpoint can re-score the primary.

**T-2.5 — client**
- `RouteDecisionCard.tsx`: roles come from `decision`; delete the `isTopScored` guess (`:105`) and the `twistiness >= 70` heuristic (`:125-129`). A lone route shows "Your route"; older cached plans get neutral labels.
- Split out `formatRouteTradeoff` (`route-explanations.ts`).
- `planner-store.ts` `mergeAlternatives` copies `decision`.
- `RouteComparison.tsx` prefers the V2 score.
- `PlannerShell.tsx:309-334` already auto-selects on `routeScore.total` when preference learning is on, so re-scored totals change that path: apply the hysteresis so the painted route does not flip after alternatives arrive.

**T-2.6 — tests and evidence.** Add `PA_NJ_ROLE_CORPUS` to `tests/fixtures/routing/golden.ts` (long twisty +30%, +45%, tie, fastest ≈ primary, `targetMinutes`, unknown axes) with expected V1 and V2 roles. `route-policy.test.ts` pins V2 and V1 totals. Rewrite `tests/components/route-role-truth.test.ts` (it currently encodes the browser heuristics).

**T-2.7 —** `benchmark --policy-compare` report into `artifacts/routing-rework/reports/`.

---

## PR 3 — `feat(map)`: Mapbox Standard live, with fallback (Phase 1 rollout)

**T-3.1 — CSP (`next.config.ts`)**
- Add `https://api.mapbox.com https://events.mapbox.com` to `connect-src`. `img-src` already has `data: blob:`, `worker-src` already has `blob:`.
- Fix the `server.arcgisonline` typo (add `.com`) in `img-src`. Before removing unused tile hosts, confirm they are truly unused in `src` — do not delete a host a Recon or thumbnail path still needs.

**T-3.2 — runtime fallback (`src/components/planner/MapStage.tsx`)**
- Remount with `maplibreRenderer` when the Mapbox stage reports a style/WebGL failure (error states at `PlannerMapStage.tsx:965-982`) or has no token.
- Keep the preset, degrading Satellite → Road.
- Remember the fallback for the session so it does not flap.
- Verify: unit test for the fallback decision.

**T-3.3 — picker labels (`v2/LayersSheet.tsx`, `MapStageLayerControl.tsx`)**
- Mapbox: Road · Terrain (3D) · Satellite.
- MapLibre: rename Terrain → "Outdoors" (it loads Liberty and promises no elevation).

**T-3.4 — browser test that actually runs Mapbox**
- Playwright spec built with the flag and a fake token, style requests intercepted: Mapbox mounts, Satellite is listed, forced failure falls back to MapLibre.
- Add the spec to the critical workflow. (Today no browser test runs Mapbox at all.)

**T-3.5 — ADR 0021 note, required in the PR body**
This turns on a **client-only build-time flag**, which ADR 0021 forbids as a permanent pattern. `mapbox-config.ts:34` documents it as "the temporary phase-1 rollout gate" that Phase 4 replaces with the server-declared payload. State this explicitly so a reviewer does not read it as an ADR violation, and make T-4.4 actually supersede it.

**T-3.6 — production (owner-approved deploy only)**
- **OWNER OPS only; do not execute in an implementation worktree.** Prerequisites
  are a merged PR 3 head, green exact-head gates, owner approval, a backed-up
  production environment file, an origin-restricted Mapbox public token, and a
  rollback build known to work with MapLibre.
- Owner action: set `NEXT_PUBLIC_SWITCHBACK_PREMIUM_MAPBOX=true` in the production
  `.env.local` and rebuild — `NEXT_PUBLIC_*` is inlined at build time. Confirm the
  token's URL restriction includes the production origin in the provider dashboard.
- Verification: record the deployed build SHA, map renderer/capability response,
  successful Road/Terrain/Satellite load, fallback behavior, map-load counter
  (`planner-map-renderer.ts:46-53`), and `/api/health` after restart.
- Rollback: restore the backed-up production environment/flag, rebuild the known
  MapLibre artifact, restart through the owner's deployment procedure, and repeat
  health plus planner-map smoke checks.
- Proof required before dependent work proceeds: owner approval, production build
  and service identity, token restriction evidence, renderer/fallback screenshots
  or trace, counter sample, health response, and the rollback result. The cheap
  implementation agent must stop before every production action.

**Scope boundary:** only the planner map. Route library, route detail, thumbnails and Recon stay MapLibre (Phase 11 owns retirement).

---

## PR 4 — `feat(planner)`: one-tap ride style, honest cards, surface hidden work (Phase 4 + part of Phase 6)

**T-4.1 — ride-style chips (new `v2/RideStyleChips.tsx`)**
- Choices: Fastest (`quick`) · Balanced · Twisty · Scenic · Back roads (`adventure`, with a "More gravel" sub-option mapping to `gravel`), each with a one-line description.
- Placement: under the search field in `PlanComposer.tsx`, and above `RouteDecisionRail` after planning, where it stays visible.
- Tapping a style selects the returned route that already holds that role (no replan); otherwise call the existing `onProfileChange`, which auto-replans (`PlannerShell.tsx:1612`).
- Remove the Road feel chips from `PlanOptions.tsx`. "Avoid Highways" stays only as the avoid checkbox. Hide "Neural" (its flag is never read).
- Add the bike profile to the collapsed summary (`plan-preference-summary.ts:29-47` never receives it today).
- Placeholder hint: "Search a place or describe a ride — 'twisty 2 hours'".
- `radiogroup` with roving tabindex and visible focus; DESIGN-SYSTEM tokens; honour reduced motion.
- Verify: component test for select-existing-role vs replan; 390 px layout check.

**T-4.2 — cards and details (`RouteDecisionCard.tsx`, `RouteComparison.tsx`)**
- Cards show: role; "+N min vs fastest" (always, per ADR 0013/0022); the top explanation; total climb (`ascentMeters`); a toll warning when `tollEvidence` shows tolls under `allow-with-warning`; gravel-atlas matched miles.
- Details view uses `ElevationSparkline`, `SurfaceMixBar`, `RideCharacterBars`.
- Label the rider-history re-ranking so a silent auto-selection becomes visible.
- The allow-with-warning behavior is a domain contract, not optional copy: the
  eligible candidate must carry structured warning evidence through normalization,
  recommendation, API/state projection, and the card. The dedicated deterministic
  procedure is `2026-09-14-t4-2-allow-with-warning-agent-runbook.md`.
- Until Packet F supplies a traffic-duration reference, the user-visible shortest
  route label is **Fastest**. Internal role ids may remain compatible; do not ship
  **Fastest Now** for duration-only data.

**T-4.3 — traffic on every card (TomTom, key-gated)**
- Add `getTomTomTrafficForRoutes(routes)` in `src/lib/traffic/tomtom.ts`: union of corridor boxes across candidates, one fetch per box, incidents assigned within 150 m, 3-minute in-process cache, daily request budget with a circuit breaker (ADR 0018).
- `POST /api/route-traffic` accepts up to 3 routes (today it takes one corridor's `points`).
- Each card shows "No reported incidents", "N min delay" or "Closure on PA-33".
- Advisory only: no re-rank; closures still hard-fail (ADR 0019).
- Fix the stale `RouteEvidencePanel` copy.

**T-4.4 — hidden work**
- Raise the quick-layer cap so "Road controls" is not cut (`LayersSheet.tsx:61-62`).
- Add a "3D rides" entry (`/labs/recon`) to Explore and Saved.
- New `GET /api/capabilities` → `{ freeRideLive, tomtomTraffic, tomtomRouting, advisor }`. Minimal ADR 0021 slice, no identity gating yet; `freeRideLive` is false without a RIG graph, which hides the currently dead Free Ride control.
- Show the "90-minute backroads" preset to first-run riders (`RideIntentFeedback.tsx`).
- `TripPlan.warnings` is rider-facing text; provider/lane diagnostics stay internal.
  Do not create a second warning channel.

**T-4.5 — tests.** Component tests for chips/cards/capabilities; intentional visual-baseline updates; mobile-core chip row at 390 px; Playwright screenshots at 1440 and 390 px plus a dark-mode contrast check.

---

## PR 5 — `feat(routing)`: TomTom adapter and bakeoff, shipped dark (Phase 5)

**Ships disabled and does not change route selection.** Phase 5 excludes selection change; that is T7.

**T-5.1 — adapter (new `src/lib/routing/tomtom-routing.ts`)**
- Calculate Route with `travelMode=motorcycle`, `routeType=thrilling`, `hilliness`, `windingness`, `maxAlternatives`, `traffic=true`, `sectionType=traffic,toll,motorway`.
- Server-only key, 5 s timeout, shared TomTom budget and breaker. Re-check parameter limits while implementing.

**T-5.2 — normalize through GraphHopper (providers propose, OpenGravel decides)**
- Sample 3–6 anchors from the TomTom geometry and route them with plain multi-point `/route`, so instructions, road class, elevation and scoring match every other card.
- Discard the candidate when overlap with the TomTom geometry is < 0.8. Keep `trafficDelayInSeconds` as evidence.
- Not wired into the lanes; stays behind `TOMTOM_ROUTING_ENABLED=false`.
- Verify: request/response fixtures, budget/breaker, overlap discard, and a provider outage removing the candidate without surfacing an error.

**T-5.3 — bakeoff.** `scripts/bakeoff-tomtom-thrilling.mjs` on the benchmark trips plus 4 known twisty PA/NJ corridors: distinctness, V2 score, added minutes, latency. Write up `docs/design/2026-09-xx-tomtom-thrilling-bakeoff.md` (ADR 0018 requires a recorded capability bakeoff, not an assumption).

**Do not** set `TOMTOM_ROUTING_ENABLED=true` in this PR. The bakeoff tells Phase 7 whether the candidates are worth federating.

---

## Open items

- **T7 (Phase 7):** federate Thrilling candidates into PR 1's lane pool, behind the same deadline and its own limiter, only if the T-5.3 bakeoff shows distinct, better-scoring candidates.
- **P1 — Protect the Ride cost (Phase 7):** not implemented in the current
  foundation. Packet F must provide the traffic contract and `TemporalContext`
  before the scorer can add the ADR 0019 cost and Phase 7 can close.
- **L1 — loop alternatives:** `planner.ts:394-401` returns one route for loops; ADR 0020's "up to three loops" is not implemented. Not in this plan.
- **Fastest naming:** display `Fastest` until the traffic-duration reference exists;
  this is resolved by the execution authority, not an open product question.
- **Phase 6 remainder:** future-departure-time routing (`departAt`).
- **Phase 2 remainder:** light presets are delivered by PR 3; premium route ribbon, road-character layer and map-pack migration stay open.
- **Unused graphics:** `EvidenceMeter`, `ConfidenceBadge` and 6 icons stay unused; deletion is a separate decision.

---

## Risks

- **Selection timing:** which lanes finish before the deadline varies with load. Selection stays deterministic *given* the finished set.
- **Short-trip candidates:** fewer engine alternates could reduce candidate count. If the benchmark drops, enable engine alternates for `quick` too (one table entry).
- **Corridor quality:** anchors from the curvature DB may overlap the primary by more than 85% and be dropped. Watch the long-trip route count.
- **Stale cached plans:** no `decision` → neutral labels.
- **Tampered summary:** a modified client can only mislabel its own cards.
- **Weights are starting values:** validate through the corpus, not by taste.
- **Inherited red gates:** `critical` and `visual` are already failing on the base (see *Inherited gate state*). Triage before attributing anything to PR 1.
- **Mapbox free tier:** watch the counter if the deployment is shared beyond the owner and trusted riders.
- **Test churn:** planner and role tests assert ordering and warnings; update deliberately.

---

## Verification

**Per PR, in the worktree:**
```
npm run lint && npm run typecheck && npm test && npm run build
```
Then `npm run test:e2e:critical`; `npm run test:e2e:real-router` and visual where the PR touches them.

**Heavy runs on the megaplex appliance** (`root@192.168.1.236`, host `github-ci`, 6 vCPU, Playwright browsers already cached):

```
/root/og-verify/gates.sh <worktree> <logdir> [gates...]
```
Gates: `install-scripts audit lint typecheck vitest build critical advisor webkit roadlock pwa visual realrouter mobile`. It writes `<logdir>/<gate>.log` and appends `name rc=N Ns` to `<logdir>/summary.txt`.

- The appliance is for **manual/heavy** work only. Never point a `pull_request` CI job at `self-hosted` (`docs/SELF-HOSTED-CI.md`).
- Normal PR gates run on GitHub-hosted runners from the PR itself.

**Routing evidence**
- `npm run benchmark:routing` against a branch build on :3200 vs production :3100.
- Check PR 1's acceptance numbers; check the policy-compare report into `artifacts/routing-rework/reports/`.
- Run with `VALHALLA_URL` unset, and with GraphHopper stopped mid-alternatives: no error, no fallback after abort.

**Live UI (Playwright on the branch build)**
- Philadelphia → State College shows Fastest and Best Ride with minutes vs fastest and per-card traffic once Packet F exists.
- The primary does not flip after alternatives arrive.
- Style chips switch in one tap.
- The Mapbox picker shows Satellite; a forced failure falls back to MapLibre.
- The advisor answers on the new model.
- No console errors; keyboard nav and focus visible at 1440 and 390 px.

**After deploy (owner go)**
- Re-run the benchmark against production and the place-selection QA check.
- Update `docs/astra/ASTRA-STATE.md` and record the next task there.

---

## Delivery shape

- **Branching:** PR 1 stacks on `ux/streamline-pass-1`; PRs 2–5 stack on PR 1. One worktree per PR under `/root/Vibe/wt/` (`ux/streamline-pass-1` already lives at `/root/Vibe/switchback-ux1`). Retarget to `main` once #139 merges.
- **Order:** Step 0 → PR 1 → PR 2 → PR 3 (independent of PR 2, may start after Step 0) → PR 4 (consumes PR 2's `decision`) → PR 5.
- **Deploy:** only on the owner's go, via the usual worktree build and `.next` swap. `NEXT_PUBLIC_*` is inlined at build time, so the Mapbox flip needs a rebuild while the advisor swap does not.

---

## Critical files

- `src/lib/routing/planner.ts`, `graphhopper-request.ts`, `hybrid.ts`, `valhalla.ts`
- `src/lib/routing/candidate-lanes.ts`, `deadline.ts`, `alternatives-strategy.ts`, `tomtom-routing.ts` (new)
- `src/lib/recommendation/route-score.ts`, `route-policy.ts`, `route-roles.ts` (new), `route-diversity.ts`
- `src/components/planner/v2/RouteDecisionCard.tsx`, `PlanOptions.tsx`, `RideStyleChips.tsx` (new), `LayersSheet.tsx`
- `src/components/planner/MapStage.tsx`, `MapStageLayerControl.tsx`
- `src/lib/client/mapbox-config.ts`, `next.config.ts`
- `src/lib/traffic/tomtom.ts`, `src/app/api/route-traffic/route.ts`, `src/app/api/capabilities/route.ts` (new)
- `scripts/benchmark-routing.mjs`, `scripts/bakeoff-tomtom-thrilling.mjs` (new)
