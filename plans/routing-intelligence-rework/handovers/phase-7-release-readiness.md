# Phase 7 Handover: Release Readiness and Live Verification Evidence

> Updated after the authorized live-verification run (restart routers, verify
> the merged build on port 3200, fix and commit issues found).

## VERDICT: the merged build is SAFE TO DEPLOY

All phases verified live against the running routers (GraphHopper restarted
in legacy mode, Valhalla untouched) through the merged build on port 3200.
Only the **graph import/swap** remains blocked, pending a host with at least
6 GB available RAM.

## Live verification results (merged build on :3200)

| Check | Result |
|---|---|
| `/api/health` | app + GraphHopper + Valhalla all ok |
| Direct twisty Hatboro→Stockton | **200 in 1.45 s**; provider graphhopper; 43.2 min; full evidence (roadMix, urbanDensityMix, curvatureShare, tollEvidence known:false) |
| Timeboxed golden (targetMinutes 120) | **200 in 5.24 s**; Phase 4 pipeline (baseline + corridors + gates + closest-safe fallback with honest warning). The golden 108–132-min route still requires corridor-anchor tuning (documented Phase 4 follow-up) — the gates correctly rejected a 25%-backtracking corridor |
| Alternatives (candidateSet alternatives, sampled primary) | **200 in 3.10 s**; exactly 2 meaningfully different routes (quick, scenic); selected primary preserved |
| `tests/integration/timeboxed-destination-routing.test.ts` | 4/4 mock-orchestration pass; the live golden test correctly **skips** on the legacy graph (toll detail unavailable — the Phase 7 candidate swap re-enables it) |
| Playwright e2e (UI, 4 viewports) | **19 passed / 1 load-flake** on the first full run; the flaky scenario passed 4/4 in isolation; second full run then green |
| Unit suite | 1091 passed + 1 live-gated skip, 0 failures (after the e2e assertion fixes) |
| lint / typecheck / next build | all pass |

## Issues found and fixed (committed)

1. **GraphHopper would not boot with the current config + active cache**: the
   custom models reference `toll == YES`, but the active `data/graph-cache`
   predates the Phase 3 toll encoded value. Added `scripts/graphhopper.sh
   start-legacy`, which serves toll-stripped custom models (JSON-safe filter)
   so the old cache routes with toll evidence unknown — the same graceful
   degradation the app already performs. The real fix remains the Phase 7
   candidate-graph swap on a ≥6 GB host.
2. **E2E assertions were stale for the Phase 2 progressive contract**: they
   expected `compare: true` and captured whichever `/api/routes` body arrived
   last (the background alternatives call overwrote the primary). Updated all
   four planner scenarios to capture/assert the primary request only
   (`compare: false, candidateSet: "primary"`) and to count only primary
   calls in the sketch/replan scenario.

## Remaining blocked (unchanged)

- **Graph import/swap**: needs a host with ≥6 GB available RAM
  (`scripts/graphhopper.sh import-candidate phase3-toll` →
  `validate-candidate` → `swap`, then restart with the full config). This
  also re-enables the toll evidence and the live golden-route test.
- **Corridor-anchor tuning** (Phase 4 follow-up): do after the swap, on the
  live candidate graph.
- **Merge/push to the release branch**: authorized Phase 7 lead action only
  (per the task contract: do not push or merge to main).

## Runbook (Phase 7 lead, ≥6 GB RAM host)

```bash
scripts/graphhopper.sh import-candidate phase3-toll   # needs >=6 GB free RAM
scripts/graphhopper.sh validate-candidate phase3-toll # port 8988, all profiles + toll detail
# stop routers, then:
scripts/graphhopper.sh swap phase3-toll               # preserves rollback cache
scripts/graphhopper.sh start                          # full config (toll enabled)
# restart the app on the merged build, then:
npm run test:e2e
SWITCHBACK_URL=http://<host>:3100 npm run benchmark:routing
npm test -- --run tests/integration/timeboxed-destination-routing.test.ts  # golden runs live
```
Rollback: `mv data/graph-cache-rollback-phase3-toll data/graph-cache` (router stopped).

## PRODUCTION DEPLOYMENT RECORD (2026-08-03)

- Deployed commit: `9c75e8e` (tag `v0.2.0`) on `routing-rework/integration`, built and served by production `:3100` (next-server pid, started on the current `.next`).
- Production smoke on `:3100`: `/api/health` ok (app + GraphHopper + Valhalla); golden intent contract verified; timeboxed route 200 in 4.39 s with honest gate fallback; alternatives exactly 2 distinct (quick, scenic); Playwright e2e **20/20** across desktop + mobile viewports (free-text, sketch, road-lock).
- Temporary `:3200` app stopped after production confirmation. Legacy GraphHopper cache left active (toll evidence unknown until the graph swap).
- Rollback command (restore the pre-rework production build):
  `git checkout main && npm ci && npm run build && kill <:3100 pid> && (setsid nohup env PORT=3100 node_modules/.bin/next start -p 3100 -H 0.0.0.0 > data/next-3100.log 2>&1 &)`
  (main = `b22ac77`, the last pre-rework commit; the old in-memory process is pid 9660's predecessor — the snapshot is git, not a copied build dir.)
- Push/PR (NOT executed — awaiting authorization): see the release report.

## GRAPH UPGRADE COMPLETED (2026-08-03) — via the 64 GB Windows PC (zac@desktop over Tailscale)

- Imported the toll-aware PA/NJ graph on the 64 GB PC (WSL2 Ubuntu 24.04, Java 17): `IMPORT_EXIT=0`, 1.3 GB candidate cache (`data/graph-cache-phase3-toll`), validated (health OK, 34.5 km route, toll detail served).
- Transferred back (649 MB, SSH-streamed — scp receive on this host truncates at 200 KB, bypassed via `ssh cat > file`), swapped in: legacy cache preserved at `data/graph-cache-rollback-legacy`.
- GraphHopper restarted with the full config (toll enabled). **Toll evidence now live**: `tollEvidence: {known: true, tollSharePercent: 0}` on Hatboro→Stockton.
- Found and fixed a real defect: GraphHopper 11's Toll enum is NO/ALL/UNKNOWN — `toll == YES` in the models failed to compile (`244aaab`).
- Tuned corridor anchors against real results (`3532ba6`): distance-forcing swings + forward-weave anchors (35%/70% opposite sides) + `max_weight_factor 4.0` + immediate-backtracking metric.
- **Live golden test now PASSES 5/5**: Hatboro→Stockton 120-min timebox selects a 122.8-minute route (127 turns, 2.0/mile, 63% backroads, backtracking 3.1%, overlap 5.9%).
- Production `:3100` runs the tuned build; `:8989` serves the toll-aware graph.

## FINAL SERVICE STATE

| Service | Port | Status |
|---|---|---|
| Switchback app (tuned build, v0.2.0+) | 0.0.0.0:3100 | Production, verified (e2e + live golden + toll evidence) |
| GraphHopper (toll-aware candidate cache) | 127.0.0.1:8989/8990 | Running, full config |
| Valhalla | :8000/:8002 | Running |
| Legacy GraphHopper cache | data/graph-cache-rollback-legacy | Preserved for rollback |
| 64 GB PC (zac@desktop) | Tailscale 100.78.187.73 | Import/validate done; scheduled tasks cleaned up |
