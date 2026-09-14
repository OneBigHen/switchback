# OpenGravel routing rework — cheap-agent execution authority

> **Execution status:** authoritative for low-cost/limited-context agents. The longer
> `2026-09-14-long-trip-choices-and-policy-v2.md` remains the design rationale and
> evidence inventory. Where that document and this file disagree about execution
> order, phase closure, task boundaries, or unresolved choices, **this file wins**.
> ADRs remain higher authority than both files.

## Validated starting refs

- Repository: `OneBigHen/switchback`
- `main`: `030b256a02409f6b0efcf53583ba421e2ea27841` when this authority was written.
- PR #139 `ux/streamline-pass-1`: `a1346aeb85ffc25584ec46e19f124995d4568c9d`.
- Planning PR #141: `docs/routing-rework-plan-20260914`.
- PR #141 Quality and Mobile Core were green on its then-current head before this
  follow-up docs commit. Re-check CI after every docs/code head change.
- PR #142 `fix/routing-long-trip-alternatives` is the pushed PR1 implementation
  stack at `1a218cd4d0cea29e19a08c605a5e8e5792d5c090`.
- PR #143 `fix/routing-allow-with-warning` is the pushed warning-contract follow-up
  at `851a6ac9a9ef3bf2883212dd996eddd9bdda3aba`, stacked on PR #142.

Do not assume these SHAs are still current. Every execution packet starts by
fetching and reconciling the refs it names.

## Read order for a cheap agent

1. This file.
2. The one PR-specific runbook assigned to the agent.
3. Only the ADRs and source files named by that runbook.
4. The master plan only when the runbook explicitly points to a section.

**Do not feed the complete master plan as the active prompt.** It spans independent
subsystems and contains historical sequencing language that is useful to a reviewer
but hazardous to a model that treats every sentence as an immediate instruction.

## Hard execution protocol

1. Work on **one task id only** until its test cycle and commit are complete.
2. Use a dedicated worktree and branch. Never edit `main` or another open PR's
   checkout directly.
3. Before editing, print `git status --short --branch`, `git rev-parse HEAD`, and
   `git merge-base HEAD <expected-base>`; stop on an unexplained mismatch.
4. TDD is mandatory for behavior changes: add/modify the smallest test, run it and
   observe the expected failure, implement, then run it green.
5. Run only the targeted test during the red/green loop. Run broader gates at the
   runbook checkpoints.
6. Do not change an ADR, threshold, public type, product label, or phase definition
   to make code easier. Stop and report the conflict instead.
7. Do not modify production files, systemd, provider dashboards, secrets, or live
   data. Production actions are separate **OWNER OPS** steps.
8. Do not update visual snapshots merely because they changed. First prove the
   visual change is the task's intended behavior and attach before/after evidence.
9. Do not suppress a failing test, broaden a catch, add `any`, disable lint, or
   remove an assertion to get green.
10. Commit after each independently reviewable task. No drive-by cleanup.
11. When a cited line moved, locate the symbol by name. If behavior differs from
    the runbook, stop; do not guess from nearby code.
12. A PR is not done until required repository gates and its runbook acceptance
    evidence are recorded against the exact head SHA.

## Corrections to the master plan

These are execution blockers, not editorial preferences.

### C1 — phase 7 cannot close before real traffic cost exists

The master plan maps its PR 2 to Phase 7 while its own open item P1 says the
Protect-the-Ride cost is not implemented. ADR 0019 requires traffic to enter the
versioned deterministic scorer as a tested cost; ADR 0022 says Route Policy V2
uses traffic as real evidence rather than a neutral placeholder. Therefore:

- Do **not** claim Phase 7 complete from old T-2.1 through T-2.7 alone.
- Do **not** activate V2 as the rider-facing decision policy before the Phase 6
  traffic contract exists.
- Policy/role code may be developed as a dark/scaffolded precursor, but activation
  and Phase 7 closure happen only in the Phase 7 packet defined below.

### C2 — old PR 4 mixes three independent subsystems

The old PR 4 combines:

- ride-style UX and route-card presentation;
- server capability/entitlement declaration;
- TomTom traffic retrieval and route evidence.

They have different dependencies and acceptance criteria. Cheap-agent execution
must split them into separate packets/commits; never assign old T-4.1 through
T-4.5 as one undifferentiated job.

### C3 — ADR 0021 capability payload must be complete enough to replace the flag

The old T-4.4 payload `{ freeRideLive, tomtomTraffic, tomtomRouting, advisor }`
cannot supersede the temporary Mapbox build flag and cannot close Phase 4. ADR
0021 defines the capability family as:

- `mapboxPremium`
- `googleCinematic`
- `tomtomTraffic`
- `tomtomRouting`
- `advancedFreeRide`

The resolver must combine deployment default, configured provider prerequisites,
optional stable-identity allowlist, and provider health. Missing prerequisites
force `false`; server secrets never enter the browser payload. `advisor` may be an
additional non-premium operational capability, but it does not replace the ADR
fields.

### C4 — style chips are profiles, route roles are decisions

Old T-4.1 says tapping a style may select a route that already "holds that role",
but profiles (`quick`, `balanced`, `twisty`, `scenic`, `adventure`, `gravel`) do
not have a one-to-one mapping to decision roles (`fastest-now`, `fast-and-fun`,
`best-ride`, `maximum-twisties`).

Frozen behavior for execution:

- Style chips change the requested **profile**.
- If the selected profile differs from the plan's scored profile, call the existing
  profile-change/replan path.
- Do not infer a role from a profile and do not silently select a card as a shortcut.
- Role cards remain a separate choice surface produced by server decision data.

### C5 — user-visible name is `Fastest` until the traffic-duration reference exists

The current route is shortest-duration, not traffic-aware. Do not ship the text
`Fastest Now` while that is true.

- Internal role ids may remain stable for compatibility.
- Display `Fastest` until Phase 6 supplies the traffic-duration reference required
  by ADR 0019.
- When Phase 6 is complete, the Phase 7 runbook may restore `Fastest Now` if the
  semantics actually match.

This removes the old "ask the owner" branch from T-4.2.

### C6 — `TripPlan.warnings` is rider-facing; diagnostics are internal

PR 1 already separates `warnings` from `diagnostics`. Therefore the old T-4.4
question is resolved:

- `TripPlan.warnings`: concise rider-facing copy that may be rendered.
- `TripPlan.diagnostics`: provider/lane/debug facts; never render directly.

Do not leave warning ownership ambiguous.

### C7 — T-3.6 exists and is OWNER OPS, not a cheap-agent task

The master task index omitted T-3.6 even though the PR 3 body defines it. Treat it
as an owner-approved production deployment step, not as an implementation task.
It must never be executed merely because preceding tests are green.

### C8 — TomTom budget/breaker is shared infrastructure

Old PR 5 says it uses the "shared TomTom budget and breaker" introduced by old
T-4.3. Therefore PR 5 cannot be developed as though it were independent of that
infrastructure. Put the reusable budget/breaker in a server-only TomTom utility
module, cover it with unit tests, and let traffic and routing adapters consume the
same API.

### C9 — task-count metadata is stale

The planning PR body describes 29 tasks. The master plan has 32 indexed rows and
an additional unindexed T-3.6. The canonical scope is therefore **33 tasks**
(T-0.1 through T-5.3, with T-3.6 restored). Do not use the PR-body count for
progress or completion decisions.

## Canonical task index and current status

This is the only execution status index for the routing-rework package. The
master plan is linked for rationale; stale phase/PR prose in it is not a second
status source. Statuses below were reconciled against the live repository,
implementation branches, and PRs on 2026-09-14. Update this file whenever a task
commit or evidence gate changes.

| Task | Packet | Status | Dependency / evidence gate |
|---|---|---|---|
| T-0.1 | Step 0 | not started | local bench change; no production access |
| T-0.2 | Step 0 | OWNER OPS blocked | model bakeoff, owner approval, production config and app proof |
| T-1.1 | PR 1 | complete — PR #142 | `deadline.ts`; focused cleanup/cancellation tests pass |
| T-1.2 | PR 1 | complete — PR #142 | `alternatives-strategy.ts`; boundary/corridor/loop tests pass |
| T-1.3 | PR 1 | complete — PR #142 | server-owned `engineAlternates`; provider/API fixture tests pass |
| T-1.4 | PR 1 | complete — PR #142 | bounded completion-order lane settlement is implemented/tested |
| T-1.5 | PR 1 | complete — PR #142 | short/long lane table and corridor lanes are implemented/tested |
| T-1.6 | PR 1 | complete — PR #142 | cancellation-aware enrichment/fallback and Valhalla limiter are tested |
| T-1.7 | PR 1 | complete — PR #142 | outcome/diagnostics/timing and progressive merge contract is tested |
| T-1.8 | PR 1 | complete — PR #142 | hybrid double scoring removed; normalization score preserved |
| T-1.9 | PR 1 | complete — PR #142 | provider cancellation/regression matrix passes in the affected full suite |
| T-1.10 | PR 1 | partial — code complete, live evidence open | benchmark telemetry/help and unreachable smoke exist; no reachable branch calibration was available |
| T-2.1 | PR 2 | blocked — Packet F | V2 may remain dark until traffic contract exists |
| T-2.2 | PR 2 | blocked — Packet F | real traffic cost and unknown-axis semantics |
| T-2.3 | PR 2 | blocked — Packet F | common candidate pool and traffic evidence |
| T-2.4 | PR 2 | blocked — Packet F | decision payload contract |
| T-2.5 | PR 2 | blocked — Packet F | server decision payload |
| T-2.6 | PR 2 | blocked — Packet F | role corpus and V1/V2 evidence |
| T-2.7 | PR 2 | blocked — Packet F | policy comparison report |
| T-3.1 | PR 3 | not started | Packet C implementation |
| T-3.2 | PR 3 | not started | Mapbox fallback implementation |
| T-3.3 | PR 3 | not started | renderer-specific labels |
| T-3.4 | PR 3 | not started | browser Mapbox mount/fallback evidence |
| T-3.5 | PR 3 | not started | temporary rollout note; no production mutation here |
| T-3.6 | PR 3 | OWNER OPS blocked | owner-approved production rollout; see T-3.6 runbook |
| T-4.1 | PR 4 | blocked — Packet H | server profile/role contract |
| T-4.2 | PR 4 | partial — warning subtask complete in follow-up | T-4.2a/b warning carrier and propagation are implemented/tested; full cards wait for Packet F/role data |
| T-4.3 | PR 4 | blocked — Packet E/F | TomTom traffic adapter and shared budget/breaker |
| T-4.4 | PR 4 | blocked — Packet H | capability and visibility contracts |
| T-4.5 | PR 4 | blocked — Packet H | component, visual, mobile evidence |
| T-5.1 | PR 5 | blocked — Packet E | server-only adapter and shared budget/breaker |
| T-5.2 | PR 5 | blocked — T-5.1 | GraphHopper normalization/overlap contract |
| T-5.3 | PR 5 | blocked — T-5.1/T-5.2 | recorded bakeoff; no activation |

**Count check:** 2 Step 0 + 10 PR 1 + 7 PR 2 + 6 PR 3 (including T-3.6) +
5 PR 4 + 3 PR 5 = **33 tasks**.

The executable artifacts are:

- PR 1: `2026-09-14-pr1-long-trip-alternatives-agent-runbook.md`
- T-4.2 warning contract: `2026-09-14-t4-2-allow-with-warning-agent-runbook.md`

The T-4.2 status is intentionally partial: its warning contract can be isolated,
and the dependency-ready warning propagation is now implemented in the stacked
follow-up branch. The complete role/card/traffic surface must not be claimed until
Packet F and the Phase 7 decision payload exist.

## Implementation evidence at the current heads

- PR1 implementation: PR #142, branch `fix/routing-long-trip-alternatives`, head
  `1a218cd4d0cea29e19a08c605a5e8e5792d5c090`. The ten-task packet is implemented in reviewable commits; the
  cancellation follow-up also covers provider timeout classification, corridor
  resolution, and PASDA/elevation signal cleanup. T-1.10's local benchmark
  telemetry and calibration code are present, but no reachable branch
  GraphHopper was available for the p95 bar.
- Warning follow-up: branch `fix/routing-allow-with-warning`, head
  `851a6ac9a9ef3bf2883212dd996eddd9bdda3aba`, stacked on PR1. The focused
  provider/eligibility/planner/API/state/component suite is `133/133` passing;
  `allow-with-warning` remains eligible and carries
  typed warning data through enrichment, selection, serialization, state, and UI.
- The full repository suite at that warning-branch head is `424` files,
  `2,890` tests passed, `1` configured test skipped. Exact-head lint, typecheck,
  and production build also pass locally; the associated GitHub checks must still
  be read at each final PR head.
- No production deployment, provider activation, secret/config mutation, or
  T-3.6 owner operation was performed.

## Correct dependency graph

This is the build order. Independent packets may be developed concurrently only
when their bases and interfaces do not overlap.

### Packet A — prerequisite UX base

PR #139 must either:

- still exist at the exact validated head and be used as the explicit base for a
  stacked PR; or
- be merged into `main`, with that head proven as an ancestor of the new base.

Never reconstruct #139 changes manually.

### Packet B — long-trip alternatives defect fix

Corresponds to old PR 1. This is the **first executable packet** and has its own
runbook:

`docs/plans/2026-09-14-pr1-long-trip-alternatives-agent-runbook.md`

No policy V2, TomTom routing, Mapbox, capabilities, or general planner redesign.

### Packet C — Mapbox Phase 1 rollout + bounded Phase 2 picker work

Corresponds to old PR 3 code tasks. It is independent of Route Policy V2 and may
branch from the reconciled #139 base. It includes CSP, runtime fallback, truthful
renderer labels, and a browser test that actually mounts Mapbox.

The production flag flip/rebuild is OWNER OPS after merge and approval.

### Packet D — Phase 4 capabilities

Implement ADR 0021 as the server authority. This packet owns:

- capability resolver and API contract;
- provider-prerequisite checks;
- stable-identity gate when configured;
- optional-provider health/degraded semantics;
- Mapbox public config exposure without server secrets;
- hiding unavailable premium controls.

This packet supersedes the temporary Mapbox client-only decision mechanism. It
may include the Free Ride visibility fix because that behavior directly consumes
capability state. Generic navigation links and presets are UX work, not Phase 4.

### Packet E — Phase 5 TomTom routing adapter + bakeoff, dark

Implement the adapter and recorded capability bakeoff. Do not federate it into
route selection. Reuse the shared server-only TomTom budget/breaker contract.

The bakeoff must cover ADR 0018's real questions: motorcycle mode, `departAt`,
traffic-aware duration, Thrilling, hilliness/windingness, guidance geometry, and
PA/NJ coverage. Record unsupported parameter combinations instead of coding
around them by assumption.

### Packet F — Phase 6 traffic evidence and future departure end-to-end

This is missing as a complete packet in the master plan. It must exist before
Phase 7 can close. It owns:

- multi-route traffic evidence retrieval;
- cache, daily budget and circuit breaker;
- traffic evidence attached to candidate data with explicit `available`,
  `degraded`, or `unknown` state;
- `departAt` request contract and provider propagation where supported;
- traffic-aware duration/reference semantics;
- closure/timebox hard eligibility behavior;
- rider-facing traffic evidence on route cards;
- tests proving unknown traffic is not treated as clear traffic.

Do not re-rank with an ad-hoc UI rule. The output is evidence for the deterministic
scorer used in Packet G.

### Packet G — Phase 7 policy V2, Protect the Ride, roles, federation

Only start after Packet F's traffic contract is available. This packet owns:

- frozen `PA_NJ_ROUTE_POLICY_V2` while V1 stays byte-identical;
- pure, tested Protect-the-Ride traffic cost from ADR 0019;
- unknown-axis rescaling and confidence semantics;
- common-scale re-scoring of the candidate pool;
- server role assignment and hysteresis;
- rider-facing decision payload;
- TomTom Thrilling federation **only if** Packet E's bakeoff passes the recorded
  distinctness/quality bar; otherwise leave it dark and document the rejection.

Phase 7 is complete only when the route corpus covers traffic delay, stale/unknown
traffic, closures, timeboxes, detour roles, and provider outage behavior.

### Packet H — planner UX follow-through

Execute after the server contracts it consumes exist. Split into reviewable commits:

1. Always-visible profile chips. Profiles trigger profile change/replan; no
   profile→role guessing.
2. Decision cards/details. Render server role, added minutes versus Fastest,
   explanation, climb, toll warning, gravel evidence, traffic evidence, and the
   existing graph components.
3. Visibility cleanup: 3D rides links, Road controls cap, first-run 90-minute
   backroads preset, rider-history label.
4. Mobile/accessibility/visual evidence.

## Production action quarantine

The following must be labeled `OWNER OPS` in every runbook and are **never**
executed by a cheap implementation agent:

- changing `/root/Vibe/switchback/.env.local`;
- changing `/etc/switchback/switchback.env`;
- restarting or deploying `switchback-cloudflare.service`;
- modifying provider token restrictions or provider dashboards;
- applying production data migrations/curation;
- enabling `TOMTOM_ROUTING_ENABLED`;
- turning on the Mapbox rollout flag in production.

An implementation PR can document exact commands and rollback, but it stops before
running them.

## Cheap-agent completion report format

Every assigned task ends with exactly this information:

```text
TASK: <id and title>
BASE: <base SHA>
HEAD: <new exact SHA>
FILES: <changed files only>
RED: <targeted test command + expected failure observed>
GREEN: <targeted test command + result>
BROADER: <broader checks actually run + result>
BEHAVIOR: <one paragraph describing only the intended change>
DEVIATIONS: none | <exact mismatch and why work stopped>
NEXT: <next task id; do not execute it unless assigned>
```

If `DEVIATIONS` is not `none`, stop. A cheap agent is not authorized to resolve a
new architecture or product decision on its own.
