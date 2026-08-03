# Phase 7 Handover: Release Readiness and Live Verification Evidence

> Status: **release gate not executed** — the externally visible operations
> (candidate graph swap, live service restart, deploy, merge/push) are owned
> by the Phase 7 lead and require authorization plus a host with enough RAM.
> This document records what is VERIFIED, what was smoke-tested live, and the
> exact runbook.

## Verified in the workspace (all six phases merged on `routing-rework/integration`)

| Check | Result |
|---|---|
| `npm run lint` (eslint --max-warnings=0) | pass |
| `npm run typecheck` (tsc --noEmit) | pass |
| `npm test` (full vitest suite) | **157 files / 1084 passed + 1 live-gated skip** (one unrelated library-drawer timing flake passed 9/9 in isolation) |
| `npm run build` (next build) | **pass** — production bundle compiles all phases; new `/api/ride-corridors` in the route manifest |
| `git diff --check` | clean |

Commits on `routing-rework/integration`: `2163608` (planning) · `32d7586` (P1 + audit fixes) · `e334a9f` (P2) · `005dbb4` (P3) · `199b103` (P4) · `a9d2f86` (P5) · `84777c1` (P6).

## Live smoke of the NEW build (port 3200, production :3100/:8989 untouched)

The freshly built app was started on a spare port and exercised against the
running GraphHopper (8989) and Valhalla routers:

- `/api/health`: app + router + valhalla all ok.
- Golden intent `2 hour fun ride from Hatboro to Stockton NJ`:
  `{mode: destination, profile: twisty, rideCharacter: fun, targetMinutes: 120,
  destinationQuery: "Stockton NJ", tollPolicy: allow-with-warning}` — the Phase 1
  contract, live.
- `/api/routes` with `targetMinutes: 120` (Phase 4 timebox): **http 200 in 4.5 s**
  (inside the 5 s p95 budget). The pipeline ran baseline + corridors + gates +
  closest-safe fallback; the toll-detail retry degraded correctly against the
  pre-Phase-3 graph (`tollEvidence: {known: false}`).
- The gates correctly rejected a 25%-backtracking corridor; the fallback
  returned the closest safe route with an honest warning. **The golden
  108–132-minute Hatboro→Stockton route is NOT yet produced** — corridor anchor
  generation needs tuning (the documented Phase 4 follow-up), best done on the
  Phase 7 host with the re-imported candidate graph.

## Release runbook (Phase 7 lead, on a ≥6 GB RAM host)

```bash
# 1. Candidate graph beside the active cache (Phase 3 config: toll encoded value)
scripts/graphhopper.sh import-candidate phase3-toll     # needs >=6 GB free RAM
scripts/graphhopper.sh validate-candidate phase3-toll   # port 8988, all 4 profiles + toll detail

# 2. Deploy the merged app (current code)
git checkout routing-rework/integration
npm ci && npm run build

# 3. Stop the router, swap the candidate graph, restart
scripts/graphhopper.sh swap phase3-toll                 # keeps data/graph-cache-rollback-phase3-toll
npm run routing:start                                   # and start the app on the new build

# 4. Live verification
npm run test:e2e          # browser matrix against the new deployment (SWITCHBACK_E2E_URL)
SWITCHBACK_URL=http://<host>:3100 npm run benchmark:routing   # p95 gates (primary <=2.5s, timeboxed <=5s)
npm test -- --run tests/integration/timeboxed-destination-routing.test.ts  # golden 108-132 min, non-Philadelphia

# 5. Follow-ups if the golden route still fails the gates
#    - tune corridor anchor generation (Phase 4 follow-up, handovers/phase-4-corridor-scoring.md)
#    - wire the Phase 5 adviser into the alternatives path (todo.md pending item)

# 6. Merge integration -> release branch, then push (authorized lead only)
git checkout main && git merge routing-rework/integration && git push
```

Rollback at any point: `mv data/graph-cache-rollback-phase3-toll data/graph-cache` (stop the router first).

## What is blocked here

- **Candidate graph import**: ~2.5 GiB available RAM < the 5 GiB import heap
  (measured; the plan's stop condition applies).
- **Externally visible operations**: swapping the active graph, restarting live
  services, deploying, and merging/pushing to `main` require the Phase 7 lead's
  authorization — not performed in this workspace.
