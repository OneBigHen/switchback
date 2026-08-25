# Module quality sweep — App shell & routes

**Area:** `src/app/`, `src/app/api/`, `src/components/shell/`, `src/stores/`
**Date:** 2026-08-24
**Branch:** `quality-sweep/app-shell-routes`

This is the per-area report for the nine-area sweep. The audit traced route
callers and shell/store consumers before treating a symbol as dead, and kept
the generated `next-env.d.ts` change out of the branch.

## Findings

### [app-shell & routes] Free Ride suggestions had no provider-call limit

**File:** `src/app/api/free-ride/suggestions/route.ts`
**Severity:** high

**Evidence:** `PlannerShell.tsx` polls `/api/free-ride/suggestions` every 15
seconds while Free Ride is active. Each request can verify several candidate
detours through GraphHopper, but the route exported `POST` directly and had no
per-caller limiter. A caller could therefore make unbounded provider work
through a public endpoint.

**Fix:** wrapped the route in the existing in-memory `withRateLimit` seam with
a ten-request, one-minute window, matching the route's normal rider polling
budget. The handler still answers local suppression states without loading the
graph or router. `tests/unit/free-ride-api.test.ts` drives the exported route
with one client identity: ten calls receive the honest unavailable response
when no graph is configured, and the eleventh receives `429 RATE_LIMITED`.

### [app-shell & routes] Offline manifest/tile failures returned a different error shape

**Files:**
`src/app/api/offline/regions/[regionId]/manifest/route.ts` and
`src/app/api/offline/regions/[regionId]/tiles/[tileId]/route.ts`
**Severity:** medium

**Evidence:** the shared API surface returns typed errors under
`{ error: { code, message } }`, but these two handlers returned
`{ error: message }`. Offline clients could not distinguish an invalid region,
missing tile, and unavailable storage without parsing human copy.

**Fix:** added stable route-specific error codes while preserving status and
message behavior. `tests/unit/offline-region-api-v2.test.ts` now asserts the
invalid-region and missing-tile codes, alongside the existing traversal,
range, ETag, and HEAD checks.

### [app-shell & routes] Recording preview drew a synthetic path unrelated to the ride

**File:** `src/components/shell/RecordPanel.tsx`
**Severity:** medium

**Evidence:** the visible breadcrumb preview previously generated x/y points
from the sample index and a repeating four-row pattern. It could display a
zigzag that did not match the rider's captured GPS path, which is misleading
in a product that presents route evidence as factual.

**Fix:** normalize the actual recorded longitude/latitude points into the
existing SVG viewport. `tests/components/record-panel.test.tsx` asserts a
known two-point GPS recording produces the corresponding projected polyline.

## Coverage and boundaries checked

- `src/components/planner/PlannerShell.tsx` is the live caller for route,
  Free Ride, geocoding, map-feature, weather, GPX, and health APIs; offline
  manifest URLs are consumed by the region download catalog. No orphaned
  public API route was removed based on a grep-only result.
- `navigationStore`, the app-navigation reducer, and `usePlannerStore` are
  consumed by `PlannerShell` and the shell tabs/overlays. No dead store was
  found in this pass.
- Existing API handlers already use typed error objects in the newer contract
  paths. The two offline handlers were the concrete outliers fixed here.
- `SWITCHBACK_SESSION_SECRET` remains an environment/deployment gate owned by
  sync and identity; this branch does not claim production authentication.
  The Free Ride endpoint is now rate-limited, but it remains intentionally
  provider-backed rather than identity-gated.

## Rollup

| Severity | Found | Fixed | Flagged |
|---|---:|---:|---:|
| High | 1 | 1 | 0 |
| Medium | 2 | 2 | 0 |
| Low | 0 | 0 | 0 |
| **Total** | **3** | **3** | **0** |

No prior audit document is fully archivable from this area alone. The Free
Ride rate-limit concern is mitigated here, while the broader prior audits span
other modules and the live deployment boundary.

## Verification

Focused regression gate:

```text
npx vitest run tests/unit/free-ride-api.test.ts tests/unit/offline-region-api-v2.test.ts tests/components/record-panel.test.tsx
3 test files passed, 14 tests passed
```

The full `npm run verify` gate is run before this branch is committed and
opened as a PR.
