# Switchback beta state

Updated: 2026-09-09
Repository baseline: `main` @ `c91858479c176119ba633580cfc0902c6863ba8c`

## Verdict

**HOLD — integration, the truth lane, the bounded planning-orchestration seam,
and the Prepare Ride debloat slice are closed; beta qualification is not.**

The supply-chain gate is green, the janitorial cleanup has landed, there is one
canonical basemap authority, and all five product-truth defects are fixed. An
exact current build is now deployed and has fresh Luna evidence, but that
evidence found two reproducible beta blockers (wrong-place destination
resolution and recording controls disappearing after GPS denial) plus a high-
confidence impossible Advisor percentage. Physical-device evidence remains
open; no automated result substitutes for it.

What the truth lane found is worth carrying forward. All five were the same
shape — a value computed correctly in one place and never carried to the thing
the rider reads:

| Defect | The value existed | The rider saw |
|---|---|---|
| BETA-014 | `RouteThumbnail`, shipped by #83 | a hash-seeded procedural line |
| BETA-013 | the recording's own clock | the plan, unlabelled |
| BETA-012 | `routeScore.total` on every candidate | a chip driven by profile |
| BETA-010 | `intent.tollPolicy` in the request | a control saying the opposite |
| BETA-011 | a topology with one leg | three per-leg styles |

None needed new capability. Four of the five were fixed by carrying an existing
value to where it was already expected. That is the argument for convergence
over capability, tested five times.

## Exact next task

**Remediate and RED-test the two reproducible beta blockers, then qualify the
replacement immutable candidate before starting any more product or
architecture work.**

PR #96 made the `RouteComparison` component tests use the configuration the app
shipped, PR #97 retired the now-dead route chooser, PR #100 made weather detail
contextual while keeping severe alerts primary, and PR #101 added a focused
visual guard for the resulting preparation surface. PR #102 then extracted the
bounded planning orchestrator and store-free presentation boundary. The former
DB-7 and planning-orchestration tasks are complete; neither is the next task.

The current lane has completed exact-head gate health, deployment attestation,
fresh Luna missions, and adversarial triage for `c918584`. The candidate found
two blockers: selected-place identity is lost before route resolution, and a
GPS-denied recording can become map-only. The next bounded lane is:

1. write RED tests for selected-place identity preservation and recording
   permission-denial recovery;
2. implement only those narrow remediations;
3. deploy and re-verify a new exact SHA, then rerun automated and focused Luna
   evidence;
4. only if that replacement candidate is clean, begin the real-iPhone
   checklist.

Do not aggregate evidence across SHAs, and do not open another architecture or
UX wave merely because the implementation backlog contains later work.

## Integration status

| Area | Status | Exact evidence |
|---|---|---|
| #88 security | **MERGED** `454b76ce630837bdddc7dad4211429c51aa3e19c` | 4 advisories cleared; `npm audit --audit-level=moderate` → 0 vulnerabilities |
| #86 janitorial | **MERGED** `8849dc2949ea4c23ad903e1d8801a5057f9349f6` | deletion-only cleanup; `better-sqlite3` → `node:sqlite`; tree stays clean after a visual run |
| #82 map presentation | **MERGED** `01f8b53233dd7ec53399b9571b92274c54b69d71` | one basemap authority: `road \| terrain \| satellite` |
| #85 beta control plane | **MERGED** `5bc7cbc5e6ad44fce03ade7d84140a4b81c793f2` | current convergence authority |
| #89–#94 truth lane | **MERGED / CLOSED** through `f501b41ef3089423f9d55cc4222188a0cceb6273` | five RED-first fixes plus truth-lane closeout |
| #95–#101 Prepare Ride | **MERGED** through `bfa3cb5b7b676fc8cf7bd4113850dbed3af2ad80` | audit, shipped-config test, dead chooser retirement, contextual weather and visual guard |
| #102 planning orchestration | **MERGED** `c91858479c176119ba633580cfc0902c6863ba8c` | bounded lifecycle owner; store-free presentation boundary |
| #66 | **CLOSED, NOT MERGED** | salvage ledger remains evidence; BETA-014 already landed separately |
| #80 / #81 | OPEN STALE DRAFTS | salvage-only; not the current beta lane |

All three merges were made only on an exact-head green run of the nine required
checks (`build`, `critical-e2e`, `lint`, `pwa`, `real-router`, `road-lock`,
`typecheck`, `visual`, `vitest`), plus the advisory `mobile-core`.

### What the security lane actually found

Worth recording, because the recovered work looked complete and was not. The
previous session's `deps/security-advisories-20260908` existed only as
`stash@{0}` — the branch had no commits — and it changed **only**
`package.json` and the lockfile. Two MapLibre v6 breakages have no error and no
failing unit test:

1. `styleimagemissing` listeners can no longer resolve an icon for the current
   request, so generated fallback icons silently stop appearing.
2. v6 tiles every GeoJSON source in a worker split across two files. Turbopack
   emits only the worker, so its sibling import 404s and the worker dies before
   registering a handler. The map, controls, basemap and camera all look
   correct — the route, casing, waypoints and labels never render.

The visual suite caught (2) as five stable failures in both dev and production.
`scripts/copy-maplibre-worker.mjs` now publishes both files to
`public/maplibre/`, and tests pin the worker URL and its ordering.

**The lesson for this control plane: a green dependency bump is not evidence
that the renderer still draws.**

## Product-truth status

The truth lane is **closed**. Every item was RED-tested before the fix, and each
merged only on an exact-head green run of the nine required checks.

| Contract | Status | Merged |
|---|---|---|
| One canonical authored RideIntent/history | IMPLEMENTED | pre-existing |
| Stale routing result fencing | IMPLEMENTED | pre-existing |
| One basemap authority | IMPLEMENTED | `01f8b53…` (#82) |
| Fallback renderer actually draws routes | IMPLEMENTED | `454b76c…` (#88) |
| BETA-014 specific ride imagery always factual | **FIXED** | `0ece54e6bf94b09dcfd62d6dcaa9ab337c7f42a1` |
| BETA-013 recorded elapsed-duration provenance | **FIXED** | `e8f0a7f481912c7a01bd673115899cb3185b0ad5` |
| BETA-012 `Best Ride` matches deterministic authority | **FIXED** | `1a25965bab26a4bb29d3a7938ed7d670aefd3a53` |
| BETA-010 prompt toll policy coherence | **FIXED** | `bb41fd4a75829140548ada3e3efe21e0c5d17250` |
| BETA-011 fresh-topology segment-profile coherence | **FIXED** | `b8c0f96ce66a6b4edb2a4a48bd12295924e65f9e` |
| Unknown route evidence stays unknown | STRONG CONTRACT | preserve through every simplification |

Three things the lane taught that are worth keeping:

- **A test can encode the defect.** `rides-presentation-v2` asserted "generated
  route identity graphics"; a critical journey asserted a role chip while
  testing selection. Both were corrected to assert their real subject rather
  than weakened.
- **A green rebase is not evidence.** #82 rebased with zero conflicts and was
  still semantically broken; only `tsc` caught it.
- **A fixture that is less realistic than production hides defects.** The
  planner journey carried no `routeScore`, which every real provider attaches.

## Architecture status

Unchanged from the previous checkpoint except where integration touched it.

| Owner | Status | Decision |
|---|---|---|
| Routing/scoring/provider API | HEALTHY BOUNDARY | protect from cleanup rewrites |
| Planner store / RideIntent | HEALTHY DIRECTION | no second authority |
| Map presentation | **CONSOLIDATED** (#82) | presets are the authority; legacy ids only at storage/migration |
| MapLibre rollback renderer | **SECURE + TESTED** (#88) | now requires WebGL2 — record in the device review |
| PlannerShell | BOUNDED PLANNING OWNER EXTRACTED (#102) | no follow-on architecture wave during candidate qualification |
| PlannerMapStage | OVER-CONCENTRATED | exclusive interaction owner before more editing modes |
| PlanComposer | HIGH WIRING COST | group model/commands, no new global context |
| Global CSS authority | MIGRATION DEBT | 108 candidate dead rules remain; small visual-verified batches only |
| UI customization | QA MULTIPLIER | audit consumption; hiding arbitrary route-detail ordering is a beta candidate |

## Known CI flake — a required check hung for 30 minutes

Recorded because "required CI red or unexplained/flaky in release scope" is
itself a HOLD condition, so this cannot be waved away at release review.

On 2026-09-09, PR #98 — a **two-file markdown diff** — had `rider-journeys`
cancelled at exactly 30m00s (11:31:21 → 12:01:21). Every setup step succeeded;
the `Critical rider journeys in Chromium` step simply never completed.
`critical-e2e` and `road-lock` report from that same job and so showed as
failures after 3–4 seconds without running.

Re-running the identical commit passed in **4m49s**, its normal duration. So the
first attempt hung for roughly six times its usual runtime before the job
timeout killed it.

One observation, not a pattern. But it is a required check hanging rather than
failing, on a change that cannot affect it, and it must not be dismissed as
noise if it recurs during release qualification. If a second instance appears,
treat it as a runner defect worth chasing — the homelab runner is shared, and a
hang looks identical to a slow suite until it is killed.

Do not adopt "re-run until green" as a habit. It works here only because the
diff was provably incapable of causing the failure and the re-run was fast.

## Known environmental note

`real-router` fails 3 of 5 on the homelab workstation and **identically on
unmodified `main`**: the LAN GraphHopper's extract routes fixture paths the
spec expects it to reject. CI's `real-router` job is authoritative and has been
green on every merge above. Do not treat a local failure there as a regression
without first reproducing it on an untouched checkout.

## Automated and deployed beta evidence

Branch protection requires the nine checks named above. A final beta candidate
additionally follows `docs/astra/RELEASE-GATES.md`.

Candidate `c91858479c176119ba633580cfc0902c6863ba8c` is the one attested
deployment at https://ride.henning.rodeo, build
`build-TfctsWXpff2fKS`. Quality run `34368327230` attempt 2 is green for the
required contexts (`build`, `critical-e2e`, `lint`, `pwa`, `real-router`,
`road-lock`, `typecheck`, `visual`, `vitest`) plus `verify`, `rider-journeys`,
and `pwa-smoke`; Mobile Core run `34368327247` is also green. Attempt 1 had a
Playwright system-package installation timeout before the app suites ran and
is retained as an infrastructure event, not erased by the rerun.

Raw public HTML and loaded Next assets carry the exact SHA deployment marker;
the public health endpoint is green and both routers are healthy. The
candidate-specific attestation and Luna synthesis are in
`docs/quality/evidence/2026-09-09-c918584-luna/`.

The Luna pass was fresh, black-box, and exact-SHA, but it is a HOLD: Missions 2
and 4 independently resolved selected towns to distant streets/POIs, and
Mission 8 plus a coordinator recheck reproduced map-only recording after GPS
permission denial. Mission 6 also showed a transient `240% unpaved` Advisor
status. No code fix was made, so all findings and the deployed evidence remain
tied to this SHA.

## Physical/human evidence

The physical gate is **NOT RUN**. The exact checklist is
`docs/quality/PHYSICAL_IPHONE_BETA_CHECKLIST_2026-09-09.md`; it is tied to the
candidate above and marks every physical step pending. It covers:

- installed PWA, portrait, landscape, short landscape, safe areas, and touch
  targets;
- permission denial/recovery, foreground/background GPS, screen lock, and
  interruption/resume;
- weak/no network, route recovery, and reroute;
- Free Ride → suggestion → Head Home while recording, with rider constraints
  preserved;
- daylight/glanceability and accessibility basics.

Do not claim a physical pass until a real iPhone run records the device,
viewport/orientation, exact candidate marker, actions, and result for each
step.

`MapLibre v6 requires WebGL2` is new input for the device review: it narrows the
**fallback** renderer's floor. The premium Mapbox path is unaffected.

## Update protocol

After every meaningful merge:

1. update the baseline `main` SHA;
2. mark tasks with evidence, not optimism;
3. record what authority was removed or added;
4. name one next task;
5. keep the verdict HOLD until the advertised-scope conditions are actually closed.

Keep this file current, not historical. Detailed evidence belongs in the PR.
