# Beta convergence agent task queue

This is a bounded queue, not permission to execute everything at once. Re-evaluate priorities after every merge. Tasks with overlapping OWN files are sequential even when they look independent.

Scoring: `V` rider value, `T` trust/correctness reduced, `L` agent leverage, `C` cost, `X` permanent complexity. Higher `V+T+L-C-X` wins.

## Integration lane

### BETA-001 — Classify and resolve current dependency-audit failure

**Score:** V1 T5 L4 C1 X0 = 9
**Parallel-safe:** yes, read-only investigation can run while code review proceeds.

**Rider problem:** red supply-chain gate blocks trustworthy integration even when product tests are healthy.

**OWN:** `package.json`, lockfile, workflow dependency-audit policy only if a confirmed fix requires change.

**READ:** latest PR #82 workflow/job output, install-script policy, dependency tree.

**DO NOT CHANGE:** product code, branch protection, audit severity threshold merely to make CI green.

**Work:** reproduce exact advisory; identify direct/transitive package, affected versions, exploit relevance, available patched version, compatibility risk. Prefer patch/minor dependency upgrade or narrow override with evidence. If no fix exists, document explicit temporary accepted risk; do not hide it.

**Verify:** `npm ci`, repository install-script verification, `npm audit` command used by CI, lint/typecheck/unit/build if lockfile changes.

**Exit:** exact-head dependency audit classification is recorded and #82 can rerun without an unexplained early failure.

---

### BETA-002 — Rebase/review/merge canonical map PR #82

**Score:** V4 T5 L5 C2 X-1 (removes complexity) = 13
**Depends:** BETA-001 if the audit still blocks the exact head.

**OWN:** PR #82 files only plus conflict resolutions caused by #83.

**READ:** ADR 0015, #83 graphics primitives, map experience/presentation/storage migration tests.

**DO NOT CHANGE:** route provider behavior, planner RideIntent, unrelated UI redesign.

**Adversarial review:** legacy map packs; Standard Satellite config support; Road/Terrain/Satellite persistence; viewport measurement on 844x390; selected route fit; map style switch without map remount; no duplicate Topo/Satellite layers.

**Exit:** exact head green under required checks; current main rebased; one canonical runtime basemap authority; merge.

---

### BETA-003 — Stale PR salvage ledger for #66/#80/#81

**Score:** V3 T4 L5 C1 X-2 = 13
**Parallel-safe:** read-only workers can inspect one PR each.

**OWN:** documentation only.

For each PR produce a table by commit/capability:

- KEEP AS-IS
- PORT TO CURRENT AUTHORITY
- REWRITE
- DROP

Record destination type/module and regression/value proof. Explicitly identify duplicate route-facts/search/preference types. Do not merge any stale branch during this task.

**Exit:** every useful capability has a current-main destination or explicit rejection rationale; stale PRs can be closed after ports land without losing hidden value.

## Correctness/truth lane

### BETA-010 — Natural-language toll policy coherence

**Score:** V4 T5 L2 C1 X0 = 10

**OWN:** focused intent/planner tests; then the minimal prompt/command adapter if RED proves the defect.

**READ:** `usePlannerRideIntent`, canonical RideIntent/edit command, visible toll control, request builder.

**RED:** start with tolls allowed, submit `avoid tolls to New Hope`, assert canonical RideIntent, request and visible model all say avoid; one Undo restores the prior policy.

Also test inverse wording and unrelated follow-up preserves policy.

**Exit:** one compound rider command produces one coherent toll state everywhere.

---

### BETA-011 — Segment-profile stale-state attack

**Score:** V3 T5 L2 C1 X0 = 9

**OWN:** planner/request tests and minimal command adapter.

**RED:** construct destination ride with vias/per-leg styles; submit a new free-form destination/loop request; assert new point topology cannot carry stale incompatible `segmentProfiles`.

Attack mode switch, via clearing, fresh destination, loop, undo/redo.

**Exit:** request builder always receives segment-style cardinality compatible with canonical points, or segment styles are explicitly cleared in the same compound change.

---

### BETA-012 — Route role / `Best Ride` truth

**Score:** V5 T5 L2 C2 X0 = 10

**OWN:** route-decision presentation helpers/tests, no routing algorithm changes unless evidence shows the canonical ranker is wrong.

**RED:** create candidate set where a scenic/adventure route is not the deterministic selected/best candidate. Assert it cannot be labeled `Best Ride` merely from profile.

Factual role rules:
- Fastest = fastest eligible under same constraints;
- Maximum Twisties = measured highest twistiness subject to declared threshold/tie semantics;
- Best Ride = canonical decision policy-selected role;
- other candidates use factual character labels.

**Exit:** card role cannot contradict deterministic selection/evidence.

---

### BETA-013 — Recorded duration provenance

**Score:** V3 T4 L2 C1 X0 = 8

**OWN:** Rides read-model types/adapters/tests; avoid visual redesign.

**RED:** invalid/missing recording timestamps with a route that has planned duration. Assert UI/read model does not represent planned duration as actual elapsed recording time.

Introduce/consume explicit duration source only if needed.

**Exit:** recorded/planned/estimated/unknown time is truthful and testable.

---

### BETA-014 — Eliminate invented route geometry for specific rides

**Score:** V4 T5 L2 C1 X-1 = 11
**Depends:** #83 is on main; reconcile #66 if needed.

**OWN:** personal/community route card preview components/adapters.

**RED:** ride with no retained geometry renders explicit fallback, not procedural route-looking line; ride with geometry renders `RouteThumbnail`/canonical projector.

**Exit:** no named stored/community ride can visually imply geometry the source does not contain.

## Architecture/debloat lane

### BETA-020 — Extract planning orchestration from PlannerShell, behavior-neutral

**Score:** V2 T3 L5 C3 X1 = 6

**OWN:** `PlannerShell` planning handlers plus one new focused client/planner controller/hook and its tests.

**READ:** planner store, planning session controller, trip-planning coordinator, request builder, PlannerDeck model/commands.

**DO NOT CHANGE:** routing algorithm, visual composition, RideIntent schema, map behavior.

Move one coherent lifecycle:
- plan current RideIntent;
- cancel;
- replan after history move;
- coalesce replan after intent edit;
- clear route if naturally owned there.

Controller should expose small commands and lifecycle model; avoid a generic service abstraction.

**Regression:** existing planner/recovery/critical tests unchanged; add controller tests only where extraction creates a seam worth pinning.

**Exit:** subsequent planner task can plan/replan/cancel without editing the implementation body of PlannerShell.

---

### BETA-021 — PlanComposer grouped contract, behavior-neutral

**Score:** V1 T1 L5 C2 X0 = 5
**Depends:** can follow BETA-020; avoid concurrent edits to PlannerDeck/Composer.

**OWN:** `PlanComposer`, `PlannerDeck`, view-model/command types, focused component tests.

Replace the large flat prop surface with grouped model/command contracts aligned to existing `PlannerDeckViewModel` ownership. Do not add React context/global store reads to avoid props.

**Exit:** same DOM/visual behavior; fewer independent callback wires; a worker can understand one planner subsection from one typed group.

---

### BETA-022 — Extract Free Ride orchestration before changing Free Ride behavior

**Score:** V3 T4 L5 C4 X1 = 7

**OWN:** PlannerShell Free Ride state/handlers/effects and one focused controller; Free Ride domain modules only as necessary for clean inputs.

**DO NOT CHANGE:** recommendation algorithm or navigation engine during extraction.

Own:
- activity start/exit;
- suggestion polling/cooldown/suppression;
- accept/ignore/less-like-this feedback;
- Head Home transition;
- recording handoff state.

Factor the duplicated build-current-request/plan route path shared by acceptance and Head Home.

**Exit:** Free Ride behavior tests green; product behavior intentionally unchanged; future continuity fixes do not require editing unrelated PlannerShell library/map/advisor code.

---

### BETA-023 — CSS authority and legacy-font retirement inventory

**Score:** V2 T2 L5 C1 X-2 = 10
**Parallel-safe:** read-only audit is ideal for a cheap agent.

**OWN:** report only first.

Inventory every stylesheet imported by `src/app/layout.tsx` and every V1 alias/font family consumer.

Report:
- live owner/surface;
- duplicate selectors overridden later;
- compatibility reason if any;
- candidate delete/migrate order;
- Sora/DM Sans consumers;
- unused feature CSS/component pairs;
- stylesheet-specific responsive collision risk.

Do not delete during the inventory task.

**Exit:** surface-by-surface retirement queue exists; no speculative `unused` claim without a reference/search/build check.

---

### BETA-024 — Surface-by-surface CSS retirement

**Score:** varies; run only from BETA-023 evidence.

One PR per coherent surface when practical. Migrate to canonical V2 tokens/component modules and delete the authority it supersedes in the same PR. Never add another override stylesheet to solve the migration.

Sora/DM Sans package removal is a final consequence only after zero consumers.

## Rides / Discover lane

### BETA-030 — Canonical RideFacts/read-model reconciliation

**Score:** V5 T5 L5 C3 X-2 = 14
**Depends:** BETA-003; #82 merged; determine useful #66/#81 pieces.

**OWN:** `src/lib/rides/*` canonical facts/search types, Rides adapters and tests. Do not redesign UI in the first PR.

Define one bounded factual browse model sourced from real route evidence. Include only fields actually needed across Rides/Discover/search/graphics. Preserve explicit unknown/provenance. Store/project objects remain separate behind adapters.

Constraints:
- no duplicate fingerprint/search type families;
- no full raw GPX coordinate copy in every index document;
- deterministic and network/model independent;
- no PA-only assumption in core type; regional classifiers can be adapters.

**Exit:** #66/#81 equivalent facts/search code has one current-main authority with tests.

---

### BETA-031 — Personal Rides source cleanup

**Score:** V5 T4 L3 C2 X-1 = 11
**Depends:** BETA-030.

**OWN:** `RidesDestination`, Rides view-model/adapters, tests.

Rides includes user-owned saved/imported/recorded/trip data. Remove project/curated global corpus from the personal list; do not delete source data.

One search field. No `Generate new` mode. No second Goblin search surface.

**Exit:** heading/copy `Your roads` describes the actual data shown; curated corpus is reachable through the Discover path or a temporary explicit compatibility link.

---

### BETA-032 — Rides rows use truthful #83 graphics

**Score:** V4 T4 L2 C2 X-1 = 9
**Depends:** BETA-030.

**OWN:** Rides row/list components and module CSS.

Use real route thumbnail when shape is retained. Add at most one compact character/evidence fact. Avoid mini dashboards.

Named route with unknown shape gets neutral fallback.

Test 320x568, 390x844, desktop; ensure management actions remain reachable.

**Exit:** faster visual scan without increased row ambiguity or fabricated data.

---

### BETA-033 — Discover source/read-model adapter

**Score:** V5 T4 L4 C3 X0 = 10
**Depends:** BETA-030.

**OWN:** Discover data adapter/read model and tests, not final visual merge yet.

Create one browse result stream/view model able to represent curated/project catalog and community routes with explicit source/provenance. Reuse Atlas pure filtering/projectors where they remain factual.

Do not unify storage repositories.

**Exit:** Discover can render/search both sources without treating them as the same persistence object.

---

### BETA-034 — Discover + Atlas UX convergence

**Score:** V5 T4 L3 C4 X-2 = 10
**Depends:** BETA-033.

**OWN:** Discover surface and existing Atlas browse components/helpers as needed; compatibility routing tests.

Bring across high-value Atlas behavior:
- near me;
- radius;
- route length;
- curvature/character;
- region;
- real shape thumbnail;
- surface fact;
- map/geography context.

Preserve deep links/public route details. Do not build social feed mechanics.

**Exit:** one obvious place to find rides; duplicate listing page has documented redirect/retirement path.

## Route decision / map lane

### BETA-040 — Route-choice comprehension using #83 primitives

**Score:** V5 T4 L3 C2 X0 = 10
**Depends:** BETA-012 role truth.

**OWN:** `RouteDecisionCard/Rail` and CSS; route comparison data helpers only if needed.

Card budget:
- role;
- real route thumbnail;
- ETA/distance;
- delta;
- one character fact/compact evidence visual;
- warning.

Warnings outrank graphics. No six-axis gauge wall.

**Value test:** conduct a small deterministic/human review: can a reviewer state why candidate B costs extra time within a glance? Record evidence rather than claiming aesthetics alone.

**Exit:** route choices are differentiated by measurable rider tradeoffs, not provider/profile jargon.

---

### BETA-041 — Exclusive map interaction owner

**Score:** V5 T5 L5 C4 X1 = 10
**Depends:** #82; preferably BETA-020 so planner commands are stable.

**OWN:** map interaction state/controller plus `PlannerMapStage` migration one mode at a time.

Start with a pure reducer/state model and conflict tests before wiring pointer code.

Adversarial matrix:
- sketch → avoid area;
- avoid area → finish placement;
- road lock → Draw;
- add-via → Escape;
- lost pointer capture;
- cancel then map click;
- rapid mode switch;
- touch scroll while idle;
- route sculpt then Undo.

**Exit:** exactly one map editing mode owns pointer input; cancellation cannot leak a map click or leave pan disabled.

---

### BETA-042 — Map direct-manipulation polish

**Score:** V5 T3 L2 C4 X1 = 5
**Depends:** BETA-041.

Only after interaction ownership is deterministic: improve road/route tap targeting, visible contextual actions, changed-segment feedback, camera preservation and object selection. Use existing road locks/sculpting; no second constraint system.

## Conversational / memory lane

### BETA-050 — Integrate preference-vector value into canonical commands

**Score:** provisional; run a value experiment first.
**Depends:** BETA-003, correctness lane, stable planner command boundary.

Port #80 concepts only if test corpus proves they express useful follow-ups not represented cleanly by current profiles.

`more curves`, `less gravel`, `avoid highways` must preserve unrelated intent and produce a validated typed command. No model-authored provider weights.

**Exit:** current request can evolve conversationally without creating a second planner model.

---

### BETA-051 — Deterministic ride-memory search

**Score:** V4 T4 L3 C2 X1 = 8
**Depends:** BETA-030; salvage #81 tests/logic.

Natural-language-like local constraints resolve to real ride documents only. Unknown positive evidence fails the filter. Contradictory constraints return none instead of silently relaxing.

No LLM/network required.

**Exit:** one canonical Rides search can answer character/source/range queries deterministically.

---

### BETA-052 — Learned rider profile experiment

**Score:** V3 T3 L1 C3 X2 = 2
**Depends:** BETA-051; non-blocking for beta.

Do not ship automatically because code exists. Run corpus experiment comparing baseline vs confidence-aware learned profile. Require measurable recommendation improvement and explicit inspectability. If benefit is weak, defer/close the stage.

## Ride / beta qualification lane

### BETA-060 — Free Ride constraint + recording continuity

**Score:** V5 T5 L3 C3 X0 = 10
**Depends:** BETA-022.

Scenarios:
- start Free Ride with current bike/hard route constraints where applicable;
- accept suggestion;
- accepted routing failure;
- continue recording;
- Head Home;
- return/exit;
- reload/paused recovery.

One activity/recording identity must survive transitions. Do not reset hard constraints through convenience defaults.

**Exit:** automated continuity tests plus real-device verification plan ready.

---

### BETA-061 — Exact deployed build attestation

**Score:** V1 T5 L3 C2 X0 = 7

Ensure deployed app/health/about metadata can expose a non-secret source/build identifier suitable for QA. Do not infer deployed SHA from checkout.

**Exit:** Luna/physical QA can record exact deployed build.

---

### BETA-062 — Real iPhone/PWA ride qualification

**Score:** V5 T5 L1 C3 X0 = 8
**Human/device task; cannot delegate to browser emulation.**

Run real device matrix from release gates: permissions, portrait/landscape, short landscape, daylight, background/foreground, wake/speech, weak/no network, GPS drift/loss, reroute, recording, Free Ride Head Home, installed PWA and airplane/offline claims.

File only evidence-backed defects. Physical evidence cannot be fabricated by an agent.

**Exit:** no beta-blocking device failure; remaining limitations are explicit.

---

### BETA-063 — Luna black-box beta pass

**Score:** V5 T4 L1 C1 X0 = 9
**Depends:** exact candidate deployed + BETA-061.

Run `docs/quality/LUNA-QA-COORDINATOR.md` against exact candidate. Keep workers black-box before diagnosis. Deduplicate by root cause. Convert repeatable blockers into deterministic regressions before fixing.

**Exit:** GO / GO WITH KNOWN ISSUES / HOLD report tied to exact build.

---

### BETA-064 — Final beta release review

**Coordinator-only.**

Verify:
- required branch checks green;
- dependency audit classified;
- zero known S1/blockers in advertised scope;
- exact deployed build attested;
- real iPhone/PWA evidence complete;
- Luna report reviewed;
- rollback path known;
- deferred features hidden or honestly labeled;
- no stale draft PR contains unaccounted unique value.

Only then invite beta riders.

## Cheap-agent starter batch

Once #82's current head is known, a coordinator can safely run these in parallel as **read-only** tasks:

1. BETA-001 dependency advisory classification.
2. BETA-003 PR #66 salvage analysis.
3. BETA-003 PR #80/#81 salvage analysis.
4. BETA-023 CSS/font authority inventory.
5. Planner truth test design for BETA-010/011/012 without editing production code.

The coordinator synthesizes results before any overlapping implementation starts.
