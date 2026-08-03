# Phase 3 Handover: Graph Resources and Candidate-Cache Plan

> Attached artifact for Phase 3 Step 1 (audit) and Step 5 (candidate build).
> Generated from the integration workspace at Phase 3 implementation time.

## 1. Resources (measured on the integration host)

| Resource | Value | Note |
|---|---|---|
| Source extract | `data/pa-nj-motorcycle.osm.pbf` | 474 MB (PA+NJ merged, motorcycle-normalized) |
| Active graph cache | `data/graph-cache` | 1.3 GB; four `landmarks_motorcycle_*` sets present (LM prepared) |
| GraphHopper jar | `data/graphhopper-web-11.0.jar` | 11.0, symlinked from the shared Vibe cache |
| Java | OpenJDK 17.0.20 | Meets the README's Java 17+ requirement |
| CPUs | 4 | |
| Disk free | 18 GB of 345 GB (95% used) | Enough for a second 1.3 GB candidate cache |
| RAM total | 9.8 GiB | |
| RAM available | ~2.5 GiB | **Below the 5 GiB import heap** |

## 2. Stop condition hit: candidate import

The plan's stop conditions say to halt before import when "graph import exceeds
available disk/RAM or cannot preserve a rollback cache." The active graph can be
preserved (disk is fine, the candidate builds beside it), but **available RAM
(~2.5 GiB) is below the import heap (`-Xmx5g`)**. A side-by-side import was
therefore **not attempted in this workspace**; the next person must run it on a
host with ≥ 6 GB free RAM (README requirement) or reduce the import heap and
re-record timings.

## 3. What changed in code/config (Phase 3)

- `infra/graphhopper/config.yml`: `toll` added to `graph.encoded_values`
  (alongside the existing `road_environment`, `urban_density`, `curvature`).
- `infra/graphhopper/custom-models/motorcycle-{base,fastest,adventure}.json`:
  persistent toll penalty `toll == YES → multiply_by 0.2` (tolls stay eligible;
  explicit `tollPolicy: avoid` adds a request-time zero-priority rule).
- `src/lib/routing/graphhopper.ts`:
  - Removed the request-time region overlay rules (`in_switchback_region_*`)
    that referenced degenerate `(0,0)` polygons and never intersected routes.
  - Added `toll == YES → 0` when `tollPolicy: "avoid"`.
  - Requests now ask for `toll`, `road_environment`, and `urban_density`
    details; `normalizePath` emits `roadEnvironmentMix`, `urbanDensityMix`,
    and `tollEvidence` (`known:false` when the provider omits the detail —
    never a falsely clean "no toll").
- `src/lib/routing/region-policy.ts`: documented that `customModel` is
  reference intent now; runtime tuning lives in the persistent profiles with
  Phase 4 post-score for remaining per-region nuance.
- `scripts/graphhopper.sh`: `import-candidate <name>`,
  `validate-candidate <name>` (port 8988/admin 8991, all four profiles),
  and `swap <name>` (atomic, keeps `data/graph-cache-rollback-<name>`).

## 4. Candidate build and rollback runbook (for a host with enough RAM)

```bash
# 1. Build beside the active cache (active cache untouched)
npm run routing:import  # only if the active cache is intentionally rebuilt
scripts/graphhopper.sh import-candidate phase3-toll

# 2. Validate on the non-production port (health + four profiles + toll detail)
scripts/graphhopper.sh validate-candidate phase3-toll

# 3. Compare ordinary-request latency against the active cache before deciding.
#    Thresholds are Phase 7's, not Phase 3's.

# 4. Phase 7 production swap (stop the router first):
scripts/graphhopper.sh swap phase3-toll
#    Previous cache is preserved at data/graph-cache-rollback-phase3-toll
#    Rollback: stop router, `mv data/graph-cache-rollback-phase3-toll data/graph-cache`, start.
```

The active cache must remain untouched through Phase 7 so the release gate can
roll back; candidate caches under `data/graph-cache-*` are gitignored by the
`data/` rules.

## 5. Remaining Phase 3 verification (needs a live router)

- Config startup: all four profiles + LM preparation load the candidate cache.
- Live golden/control routes return `toll`, `road_environment`,
  `urban_density` evidence, and ordinary requests take the prepared fast path.
- Avoid-area and road-lock requests still respect rider geometry.
