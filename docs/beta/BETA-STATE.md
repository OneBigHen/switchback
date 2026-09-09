# Switchback beta state

Updated: 2026-09-08
Control-plane HEAD at creation: this file lives on `chore/beta-convergence-control-plane`.
Repository baseline used for audit: `main` @ `b53c177c1620098bfa00883257eae245411a6f5c`.

## Verdict

**HOLD — integration and beta qualification are not complete.**

This is not a claim that the app is broadly broken. The deterministic core has substantial automated coverage. HOLD means the current exact candidate has not yet satisfied the integration, product-truth, physical-device and deployed-build evidence required to invite beta riders confidently.

## Exact next task

**BETA-001: classify and resolve the dependency advisory blocking PR #82's `verify` job.**

Observed CI command:

```sh
npm audit --audit-level=moderate
```

Do not lower the threshold merely to pass. Identify the package/path/fixed versions and choose the smallest compatible resolution or explicit owner-reviewed temporary risk decision.

Once resolved, rebase and exact-head verify #82, then merge it before beginning overlapping map work.

## Integration status

| Area | Status | Evidence / action |
|---|---|---|
| Main baseline | KNOWN | `b53c177...`, #83 merged |
| #83 graphics foundation | LANDED | truthful route/evidence graphics available on main |
| #82 map presentation | BLOCKED | latest observed Quality verify failed at dependency audit; Mobile Core/real-router/visual/rider-journeys observed successful on that head |
| #66 Rides intelligence | STALE DRAFT | salvage domain/tests, do not merge wholesale |
| #80 preference vector | STALE DRAFT | salvage into canonical command model if value proven |
| #81 route memory | STACKED STALE DRAFT | salvage deterministic facts/search after Rides authority settles |
| #85 beta control plane | DRAFT | docs only; rebase after integration changes |

## Product-truth status

| Contract | Status | Next evidence |
|---|---|---|
| One canonical authored RideIntent/history | IMPLEMENTED | preserve; existing recovery/history tests |
| Stale routing result fencing | IMPLEMENTED | preserve coordinator/store gates |
| Prompt toll policy coherence | UNVERIFIED | BETA-010 RED/green test |
| Fresh-prompt segment-profile coherence | UNVERIFIED | BETA-011 adversarial test |
| `Best Ride` role matches deterministic authority | SUSPECT | BETA-012 test; current profile heuristic needs proof |
| Recorded elapsed-duration provenance | SUSPECT | BETA-013 test; current fallback may be planned duration |
| Specific ride imagery always factual | NOT YET | BETA-014 / Rides reconciliation; current row may use seeded RouteGraphic |
| Unknown route evidence stays unknown | STRONG CONTRACT | preserve across every UI simplification |

## Architecture status

| Owner | Status | Decision |
|---|---|---|
| Routing/scoring/provider API | HEALTHY BOUNDARY | protect from cleanup rewrites |
| Planner store / RideIntent | HEALTHY DIRECTION | no second authority |
| Planning coordinator | HEALTHY BOUNDARY | reuse |
| PlannerComposition / Deck view model | HEALTHY DIRECTION | extend grouped contracts |
| PlannerShell | OVER-CONCENTRATED | extract one lifecycle at a time, starting planning then Free Ride as needed |
| PlannerMapStage | OVER-CONCENTRATED | exclusive interaction owner before more editing modes |
| PlanComposer | HIGH WIRING COST | group model/commands, no new global context |
| Global CSS authority | MIGRATION DEBT | read-only inventory then surface-by-surface retirement |
| UI customization | QA MULTIPLIER | audit consumption; consider hiding arbitrary route-detail ordering for beta |

## Product-surface status

### Plan / route choice

**Usable foundation, not beta-qualified.**

Open issues for convergence:
- role-label truth;
- route-choice visual comprehension;
- large planner wiring surface;
- direct-manipulation mode ownership;
- exact short-landscape/device review.

### Prepare ride

**Overloaded.**

Current disclosure contains many independent products. See `DEBLOAT-AUDIT.md`.

Beta direction:
- warnings/hard conflicts + Start primary;
- concise readiness;
- detailed evidence/weather/offline contextual;
- trip staging explicit;
- rating post-ride;
- share/publish consolidated;
- export format chooser on demand.

### Rides

**Conceptually mixed.**

Target is personal material only. Current/project curated GPX integration must move to Discover without data loss. Specific route cards must use truthful geometry or neutral fallback.

### Discover

**Duplicated browse capability.**

Current community Discover is weaker than existing curated GPX Atlas. Consolidate UI/read model, not source storage. Preserve public/deep links.

### Gravel Goblin / AI

**Useful optional capability, not a second planner.**

Keep no-key structured controls complete. Port only deterministic preference/memory value from stale drafts through canonical commands after higher-priority truth/UX gates.

### Free Ride / Ride mode

**Featureful but requires continuity and physical qualification.**

Before beta prove recording/hard-constraint continuity through suggestion acceptance and Head Home, GPS recovery, background/foreground, PWA and real-road behavior.

## Debloat status

### Immediate investigate / simplify

- Prepare ride module inventory.
- Duplicate private-share vs community-publish privacy controls.
- Pre-ride route rating.
- Multi-day staging on ordinary single-route preparation.
- Route-detail arbitrary order/visibility customization.
- Duplicate browse list surfaces.
- legacy route chooser inside RouteComparison if no live caller.
- global stylesheet override chain and legacy font consumers.
- always-on / recovery-era feature flags after usage/reference audit.
- compatibility re-export shims after caller audit.

### Explicitly do not remove yet

- MapLibre rollback renderer before ADR/device/production retirement evidence.
- existing community/report data.
- GPX originals / imported data.
- stored rider UI preference fields without migration.
- provider adapters currently required by core/fallback policy.
- evidence/caveat logic just because the full panel is too prominent.

## Automated beta evidence

Main branch protection requires named checks for typecheck, lint, vitest, build, critical E2E, PWA, road lock, real router and visual.

A final beta candidate additionally follows `docs/astra/RELEASE-GATES.md` and the beta HOLD conditions. Passing snapshots alone is never beta evidence.

At this checkpoint there is **no single exact candidate documented here as fully green and deployed**. Do not aggregate passes from different SHAs into a beta claim.

## Physical/human evidence

Current beta package does not claim a fresh exact-candidate pass for:

- real iPhone installed PWA;
- mounted/daylight/glove readability;
- short landscape;
- background/foreground GPS/session continuity;
- weak/no network;
- real reroute/off-route recovery;
- Free Ride → suggestion → Head Home recording continuity;
- airplane/offline behavior;
- black-box Luna coordinator run against the exact deployed candidate.

These remain open until actually executed.

## Update protocol

After every meaningful merge:

1. update baseline `main` SHA;
2. mark tasks with evidence, not optimism;
3. record exact test/workflow run where useful;
4. record what architecture/data authority was removed or added;
5. name one next task;
6. keep verdict HOLD until all advertised-scope beta HOLD conditions are closed.

Do not let this file become a historical diary. Keep current state concise; commit detailed evidence in the relevant PR/test report.
