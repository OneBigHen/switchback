# Switchback first-class routing handoff report

Date: 2026-08-04
Repository: `/root/Vibe/switchback`
Branch at handoff: `main`

## Outcome

The requested implementation slice is assembled on the current `main` line
and ready for continued product work. It includes first-class route profiles,
normalized scoring contracts, Free Ride / Neural Map, local preference learning,
offline corridor recovery, responsive HUD work, focused tests, and handoff
documentation.

## Included implementation

- Provider-neutral contracts in `src/lib/domain/contracts.ts`.
- Explainable deterministic route scoring and candidate normalization in
  `src/lib/recommendation/`.
- Eight explicit profiles across the planner, provider adapters, API/share
  contracts, intent parsing, and offline weighting.
- Free Ride API, reducer, HUD, suppression rules, accept/ignore/less-like
  actions, and transition into the existing Ride surface.
- Local-only rider preference ranking with reset/export/delete controls.
- Saved-pack offline recovery that checks freshness, coverage, graph integrity,
  one-way edges, and closures before producing a route.
- Responsive CSS and browser evidence for the Free Ride surface.
- ADRs 0001–0008 plus architecture, execution, status, and traceability docs.

## Verification evidence

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test -- --reporter=dot` | 168 files / 1,147 tests passed |
| `npm run build` | Passed |
| Free Ride Playwright | 4/4 passed: desktop, mobile Safari, wide/narrow landscape |
| Focused routing/profile/navigation checks | 40/40 passed |
| Visual artifacts | `artifacts/screenshots/e2e-free-ride-*.png` |

## Explicitly not claimed

- Live GraphHopper/Valhalla routing, geocoding, curvature, GPX, or external
  research success without those services running.
- Live traffic or incident freshness; the domain exposes capability states,
  but no commercial feed is silently treated as live.
- Physical iPhone install, background execution, voice, or airplane-mode proof.
- Full accessibility, security, battery, provider-cost, migration, and
  performance release review beyond the passing automated suite.

## Start here

1. Read `docs/switchback-build/STATUS.md` and
   `docs/switchback-build/REQUIREMENTS_TRACEABILITY.md`.
2. Continue from `src/components/planner/PlannerShell.tsx` for product mode
   transitions, `src/lib/recommendation/` for route intelligence, and
   `src/lib/client/offline-route-recovery.ts` for offline rerouting.
3. Run the release gates in `docs/switchback-build/EXECUTION_PLAN.md` with live
   provider credentials/services and a physical iPhone when available.
