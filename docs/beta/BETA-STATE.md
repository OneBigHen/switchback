# Switchback beta state

Updated: 2026-09-09
Repository baseline: `main` @ `01f8b53233dd7ec53399b9571b92274c54b69d71`

## Verdict

**HOLD — the integration lane is clean, beta qualification is not done.**

The integration lane described in the previous checkpoint is finished: the
supply-chain gate is green, the janitorial cleanup has landed, and there is one
canonical basemap authority. HOLD stands because none of the physical, deployed
or human evidence exists yet. Automation is necessary and not sufficient.

## Exact next task

**BETA-014: stop rendering invented route art for real rides.**

This moved to the front because it is now a *confirmed* defect on `main`, not a
suspicion. #83 shipped the truthful graphics primitives and nothing adopted
them:

- `grep -rn "RouteThumbnail" src/` returns only its own definition, the
  barrel export and its tests — **zero consumers**.
- `src/components/rides/RideListRow.tsx:63` renders
  `<RouteGraphic seed={item.id} variant="route" />` for **every** ride card.
  `src/components/v2/RouteGraphic.tsx:30-36` generates a hash-seeded
  procedural path.

So a saved ride with real stored geometry currently shows a route-shaped line
that is not its route. `RouteThumbnail` already draws real geometry and already
has an explicit `data-route-thumbnail="unavailable"` state for rides without
it.

RED first: a `RideLibraryItem` with real geometry must render
`[data-route-thumbnail="ready"]` and never `[data-route-graphic="route"]`; an
item with absent or too-short geometry must render
`[data-route-thumbnail="unavailable"]`. That test fails on `main` today.

This is also the smallest useful slice of the #66 salvage, and it needs none of
that PR's region taxonomy or second search surface.

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

| Contract | Status | Next evidence |
|---|---|---|
| One canonical authored RideIntent/history | IMPLEMENTED | preserve |
| Stale routing result fencing | IMPLEMENTED | preserve |
| One basemap authority | **IMPLEMENTED** (#82) | preserve; presets are the only rider choice |
| Fallback renderer actually draws routes | **IMPLEMENTED** (#88) | worker + missing-image tests |
| Specific ride imagery always factual | **CONFIRMED DEFECT** | BETA-014 — evidence above |
| Prompt toll policy coherence | UNVERIFIED | BETA-010 RED test |
| Fresh-prompt segment-profile coherence | UNVERIFIED | BETA-011 RED test |
| `Best Ride` matches deterministic authority | SUSPECT | BETA-012 RED test |
| Recorded elapsed-duration provenance | SUSPECT | BETA-013 RED test |
| Unknown route evidence stays unknown | STRONG CONTRACT | preserve through every simplification |

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
