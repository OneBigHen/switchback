# Switchback beta state

Updated: 2026-09-09
Repository baseline: `main` @ `b8c0f96ce66a6b4edb2a4a48bd12295924e65f9e`

## Verdict

**HOLD — integration and the truth lane are both closed; beta qualification is
not.**

The supply-chain gate is green, the janitorial cleanup has landed, there is one
canonical basemap authority, and all five product-truth defects are fixed. HOLD
stands for the same reason it always did: none of the physical, deployed or
human evidence exists yet, and no automated result can substitute for it.

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

**DB-7 test rewrite: point `route-comparison.test.tsx` at the configuration
production actually ships.**

DB-1 is done — see `PREPARE-RIDE-AUDIT.md`. It found something that reorders the
debloat queue: `tests/components/route-comparison.test.tsx` renders
`RouteComparison` about fifteen times and passes `showRouteChoices` **zero**
times, so every render exercises the default `true` branch. Production always
passes `false` (`PlannerComposition.tsx:155`).

Every DOM assertion about the preparation surface therefore describes a
configuration the app never ships, and the shipped configuration has no
component-level coverage at all. That has to be fixed before the surface is
rearranged, or the rearrangement will be verified against the wrong branch.

Once those tests describe reality, the dead `showRouteChoices=true` branch
(`RouteComparison.tsx:246-300`) can be retired, and the rest of the debloat
sequence in `PREPARE-RIDE-AUDIT.md` becomes safe to execute.

Two findings from DB-1 that need an owner decision rather than an agent's
judgement, both recorded in that document:

- **Weather fetches when the disclosure mounts — and it must keep doing so.**
  The panel renders severe-weather alerts in a `role="alert"` block above the
  sample cards, so mounting it lazily would hide an alert from any rider who
  did not open the weather section. You cannot know whether there is an alert
  without fetching, so the request is the price of the warning being primary.
  The available debloat is visual: collapse the sample cards, keep the fetch and
  the elevated alert. `PREPARE-RIDE-AUDIT.md` records the correction.
- **A pre-ride 5★ rating carries `+2` while a completed ride carries `+0.5`**
  (`rider-preferences.ts:66-79`), and the result auto-reselects routes on the
  next plan (`PlannerShell.tsx:333-345`). The model learns more from a guess
  than from experience. Relocating the control post-ride does not by itself
  answer whether that weighting is intended.

## Integration status

| Area | Status | Exact evidence |
|---|---|---|
| #88 security | **MERGED** `454b76ce630837bdddc7dad4211429c51aa3e19c` | 4 advisories cleared; `npm audit --audit-level=moderate` → 0 vulnerabilities |
| #86 janitorial | **MERGED** `8849dc2949ea4c23ad903e1d8801a5057f9349f6` | deletion-only cleanup; `better-sqlite3` → `node:sqlite`; tree stays clean after a visual run |
| #82 map presentation | **MERGED** `01f8b53233dd7ec53399b9571b92274c54b69d71` | one basemap authority: `road \| terrain \| satellite` |
| #85 beta control plane | this branch | rebased onto the three merges above |
| #66 / #80 / #81 | STALE DRAFTS, salvage ledgers written | see `SALVAGE-LEDGERS.md`; close after ports land |

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
| PlannerShell | OVER-CONCENTRATED | extract one lifecycle at a time |
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

## Automated beta evidence

Branch protection requires the nine checks named above. A final beta candidate
additionally follows `docs/astra/RELEASE-GATES.md`.

There is still **no single exact candidate documented here as fully green and
deployed**. Do not aggregate passes from different SHAs into a beta claim.

## Physical/human evidence

Still entirely open. No fresh exact-candidate pass exists for:

- real iPhone installed PWA;
- safe areas and short landscape;
- background/foreground GPS and session continuity;
- weak/no network;
- real off-route/reroute recovery;
- Free Ride → suggestion → Head Home without losing recording or hard constraints;
- keyboard/accessibility alternatives for editing flows;
- daylight/mounted/glove glanceability;
- at least one real safe road ride;
- a fresh black-box Luna run against the same deployed SHA.

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
