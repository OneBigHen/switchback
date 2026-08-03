---
type: planning
entity: plan
plan: "routing-intelligence-rework"
status: active
created: "2026-07-22"
updated: "2026-07-22"
---

# Plan: Switchback Routing Intelligence Rework

## Objective

Rebuild Switchback's online route-planning path so a rider receives one useful route quickly, timeboxed destination requests are honored, "fun" means maximum twisties, tolls are disclosed, and progressively loaded alternatives are relevant rather than arbitrary detours.

The primary golden scenario is:

> `2 hour fun ride from Hatboro to Stockton NJ`

The selected route must keep Stockton as the destination, target 108–132 minutes, favor the Upper Bucks/Delaware corridor family over Philadelphia, avoid unnecessary PA/NJ recrossing, and explain any toll exposure.

## Motivation

The current planner parses a destination duration and then drops it, treats "fun" as a generic Scenic fallback, blocks the first result on every profile and enrichment, and hides its loading state during the slowest work. Request-time regional masks are located at `(0,0)`, so they add routing cost without applying PA/NJ policy. Tolls and meaningful bridge crossings are not represented in the route contract or scoring.

## Requirements

### Functional

- [ ] Preserve destination `targetMinutes` through free-text parsing, request construction, routing, storage, and route explanations.
- [ ] Interpret unqualified "fun" as maximum-twisties paved-road behavior.
- [ ] Return one primary route before starting nonessential comparison, elevation, PASDA, or web-research work.
- [ ] Add at most two progressively loaded, meaningfully different alternatives.
- [ ] Generate timeboxed A-to-B detours from validated curvature, GPX, and optional researched corridor evidence.
- [ ] Detect, penalize, and visibly disclose toll exposure while retaining toll routes as eligible.
- [ ] Penalize urban exposure, highways, backtracking, self-overlap, and unnecessary state/major-river recrossing.
- [ ] Preserve bike profile, road locks, avoid areas, shaping stops, toll preference, and per-leg choices when free text is used.
- [ ] Support cancellation from browser through provider requests.
- [ ] Show continuous progress from prompt submission until the primary route is usable.
- [ ] Use You.com only as a non-blocking, source-preserving corridor adviser; validate every hint before routing it.

### Non-Functional

- [ ] Direct primary-route API p95 is at most 2.5 seconds on the deployment micro-PC.
- [ ] Timeboxed destination primary-route API p95 is at most 5 seconds.
- [ ] Free-text submission to visible primary route p95 is at most 10 seconds, including geocoding.
- [ ] Visible progress begins within 100 ms.
- [ ] Alternative work has concurrency one and a 12-second total deadline.
- [ ] Primary routing works without OpenRouter, You.com, Valhalla elevation, PASDA, or offline data.
- [ ] Online planning never invokes offline pack extraction or the offline routing worker.
- [ ] Existing manual planning, round trips, avoid areas, road locks, navigation, saved routes, and route sharing remain compatible.

## Scope

### In Scope

- Free-text intent and endpoint resolution.
- Route request/response contracts and planner state.
- GraphHopper/Valhalla orchestration, cancellation, concurrency, caching, and enrichment timing.
- GraphHopper encoded values, custom profiles, graph re-import, and rollback.
- Timeboxed A-to-B corridor generation and route scoring.
- Toll, curvature, urban, bridge/crossing, overlap, and duration evidence.
- Optional You.com corridor research and caching.
- Planner progress, cancellation, primary-first rendering, and progressive alternatives.
- Unit, integration, golden-route, performance, browser, local-runtime, and public-runtime verification.

### Out of Scope

- Visual reskin or design-system replacement.
- Navigation HUD redesign.
- Offline-region routing changes or new offline downloads.
- Automatic map-image route extraction.
- Social, collaboration, or authenticated sharing features.
- Guaranteeing that an external research provider is available.
- Treating AI/MCP output as routable geometry or safety truth.

## Locked Decisions

| Decision | Outcome |
|---|---|
| Destination duration | Target, accepted within ±10%; closest safe route plus warning if impossible |
| Meaning of "fun" | Maximum twisties, with rurality and low highway/urban exposure as secondary goals |
| Toll default | Allow with warning; strongly penalize, never silently hide |
| Web intelligence | Optional, background, cached corridor hints; never blocks primary routing |
| Primary delivery | One route first, then at most two alternatives |
| Runtime AI integration | Production HTTP API, not an MCP dependency |
| Worker strategy | Isolated branches/worktrees; GLM 5.2 only for bounded adapters/tests |

## Locked Progressive API Contract

The client generates a UUID `planningId` for each planning lifecycle and sends the complete normalized route request on both calls.

### Primary request and response

- Request: existing route fields plus `planningId` and `candidateSet: "primary"`.
- Response: `planningId`, one selected primary route, warnings, target/tolerance metadata, and server timing.

### Alternatives request and response

- Request: the same normalized route fields plus the same `planningId`, `candidateSet: "alternatives"`, and `primaryRoute` containing the primary ID plus geometry sampled to at most 128 coordinates.
- Response: the echoed `planningId`, zero to two differentiated routes, warnings, optional validated research status, and server timing.
- The alternatives endpoint is stateless: it must work after a server cache miss because the request carries all routing inputs and the sampled primary geometry needed for overlap rejection.
- The client merges a response only when `planningId` still matches the active lifecycle. It never changes the selected primary automatically.
- Missing/invalid primary summary on an alternatives request returns `400`; timeout or no useful alternatives returns a successful empty alternative set.
- A candidate is meaningfully different only when sampled geometry overlap with the primary and every accepted alternative is at most 85%.

## Locked Route-Quality Defaults

Hard gates run before scoring:

- Legal access and selected bike compatibility must pass.
- A normal scored candidate must be 90–110% of `targetMinutes`; if none pass, the general planner may return the closest safe route with a warning. The Hatboro→Stockton golden case has no fallback exemption and must land within 108–132 minutes.
- Reject A-to-B candidates with more than 15% immediate backtracking or more than 20% self-overlap.
- Reject shaping anchors outside the corridor envelope: `distance(start, anchor) + distance(anchor, finish)` must be no more than 105% of the estimated target-distance budget, and lateral distance from the direct baseline is capped at `min(40 miles, max(8 miles, 35% of target-distance))`.
- Explicit `tollPolicy: "avoid"` rejects toll exposure. `allow-with-warning` keeps it eligible.
- State-boundary transitions are calculated from a tracked, simplified PA/NJ boundary fixture. Minimum transitions are zero for same-state endpoints and one for opposite-state endpoints; every extra transition is penalized.

The estimated target distance is `directRouteMiles × targetMinutes ÷ directRouteMinutes`. Geometry is simplified with a 25-meter tolerance; meaningful turns use simplified segments of at least 40 meters and bearing changes from 15° through 120° so point noise and U-turns do not inflate fun.

The normalized 100-point maximum-twisties score is:

| Component | Points |
|---|---:|
| Segment-weighted GraphHopper curvature plus smoothed real turn density | 35 |
| Target-duration accuracy inside the ±10% band | 25 |
| Rural secondary/tertiary/unclassified road share | 15 |
| Low city/dense-residential exposure | 10 |
| Low motorway/trunk exposure | 5 |
| Validated GPX or researched-corridor evidence | 5 |
| Low backtracking/self-overlap inside allowed gates | 5 |

Component formulas are fixed for the first implementation:

- Curvature/turns: `24.5 × curvedDistanceShare + 10.5 × min(1, meaningfulTurnsPerMile ÷ 4)`, where curved distance is GraphHopper `curvature < 0.98`.
- Duration: `25 × max(0, 1 - abs(actual-target) ÷ (0.1 × target))`.
- Rural/backroad: `15 × (secondary+tertiary+unclassified share)`.
- Low urban: `10 × (1 - city/dense-residential share)`.
- Low highway: `5 × (1 - motorway/trunk share)`.
- Evidence: `5 × min(1, validatedEvidenceMiles ÷ max(5 miles, 20% of route miles))`.
- Low repetition: `5 × (1 - max(backtrackingShare ÷ 0.15, selfOverlapShare ÷ 0.20))`.

All shares are clamped to `0..1`. Penalties are applied afterward: `-15` per distinct tolled interval capped at `-30`, and `-20` for each state transition beyond the minimum. Scores and all component inputs are returned as evidence. Primary corridor work has a six-second shared server deadline, at most four initial candidates, at most one refinement pass, and at most two concurrent GraphHopper calls. Queued candidate calls consume the same deadline rather than receiving a fresh timeout.

## Artifact Policy

- Raw benchmark samples, provider payloads, and transient graph-import logs are generated under `artifacts/routing-rework/raw/` and ignored by git.
- Sanitized summaries, p50/p95 tables, golden assertions, and final release evidence are tracked under `artifacts/routing-rework/reports/`.
- Phase 1 owns the `.gitignore` rule and initial report schema. Phase 7 owns final tracked reports.

## Definition of Done

- [ ] The golden Hatboro→Stockton prompt passes every functional and geographic assertion.
- [ ] Primary-route and free-text p95 latency budgets pass on the live micro-PC.
- [ ] The planner displays continuous, accessible progress and a working Cancel action.
- [ ] A primary route appears before alternatives and enrichment.
- [ ] Tolls and route-quality evidence are visible and correct.
- [ ] New GraphHopper graph/profile configuration passes focused and live routing checks with a preserved rollback cache.
- [ ] All lint, typecheck, unit, build, and Playwright checks pass without deleting, disabling, or weakening unrelated tests.
- [ ] Local origin, GraphHopper, public health, and the exact public browser workflow are verified after deployment.
- [ ] Every worker diff has been independently reviewed and integrated in dependency order.
- [ ] Application build and graph cache rollback paths are documented and tested.

## Testing Strategy

- [ ] Contract tests for intent, request propagation, API validation, cancellation, and progressive merge behavior.
- [ ] Deterministic unit tests for corridor bounds, scoring components, duration tolerance, toll penalties, overlap, and crossing penalties.
- [ ] Pinned-graph golden-route tests, including Hatboro→Stockton and PA/NJ controls.
- [ ] Provider tests proving primary responses do not wait for alternatives or enrichment.
- [ ] Failure tests for GraphHopper, Valhalla, geocoding, You.com, malformed hints, and cancellation.
- [ ] Component tests for every progress state, retained route display, alternatives, toll warnings, and Cancel.
- [ ] Live benchmark output with per-phase p50/p95 and total wall-clock measurements.
- [ ] Desktop, portrait mobile, and landscape mobile browser verification.
- [ ] Public verification at `https://ride.henning.rodeo` after a controlled service restart.

## Phases

| Phase | Title | Scope | Status |
|-------|-------|-------|--------|
| 1 | Contracts, Baseline, and Golden Fixtures | [Detail](phases/phase-1.md) | completed |
| 2 | Fast Primary-Route Pipeline | [Detail](phases/phase-2.md) | pending |
| 3 | GraphHopper Toll and Fast-Path Correctness | [Detail](phases/phase-3.md) | pending |
| 4 | Timeboxed Destination Corridors and Scoring | [Detail](phases/phase-4.md) | pending |
| 5 | You.com Corridor Adviser | [Detail](phases/phase-5.md) | pending |
| 6 | Free-Text Preservation and Loading UX | [Detail](phases/phase-6.md) | pending |
| 7 | Integrated Evaluation, Deployment, and Review | [Detail](phases/phase-7.md) | pending |

## Execution and Delegation

Start with [Agent Execution Guide](agent-execution.md). Phase 1 is lead-owned and establishes shared contracts. After Phase 1 merges, Phases 2, 3, and 5 may run in parallel. Phase 4 begins after Phases 2 and 3. Phase 6 begins once the Phase 2 API behavior is stable and rebases after Phase 4. Phase 7 begins only after all other phases merge.

Detailed, code-grounded implementation instructions live under [`implementation/`](implementation/).

## Risks & Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|-------------------|
| Graph re-import is expensive | Runtime interruption or difficult rollback | Build beside the active cache, record disk/RAM/time, verify, then swap atomically while retaining the old cache |
| Maximum-twisties metrics saturate on noisy geometry | Bad routes receive perfect scores | Use GraphHopper curvature details plus smoothed geometry; test against straight, flowing, and artificial zig-zag fixtures |
| You.com is slow, unavailable, or returns invented roads | Slow or unsafe planning | Keep it outside the primary path; require sources, geocoding, corridor bounds, and legal GraphHopper validation |
| Parallel agents edit shared contracts | Merge conflicts and inconsistent behavior | Phase 1 owns contracts; later agents use strict allowlists and rebase before integration |
| Alternatives overload the micro-PC | Multi-minute route generation returns | Concurrency one, strict deadline, maximum two alternatives, abort propagation, and live benchmarks |
| Time target is impossible without absurd detours | Misleading route or endless retries | Four candidates, one refinement pass, hard 110% ceiling, closest safe route with warning for general routes; the known-feasible golden case must pass strictly |
| Current working tree has unrelated changes | User work could be overwritten | Preserve the existing `next-env.d.ts` modification and reject broad cleanup/reset operations |

## Changelog

### 2026-07-22

- Plan created from the live routing audit and user-locked decisions.
- Added agent orchestration, implementation briefs, golden route, performance budgets, and release gates.
