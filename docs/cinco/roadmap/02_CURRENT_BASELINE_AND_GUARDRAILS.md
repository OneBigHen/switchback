# Current Baseline and Guardrails

## Repository baseline observed 2026-08-22

Repository: `OneBigHen/switchback`

Before modifying anything, the implementing agent must run:

```bash
git fetch origin
git checkout main
git pull --ff-only
git status --short
git rev-parse HEAD
node --version
npm --version
```

Record the actual starting SHA in the phase status file or PR description.

### Recent repository state
- PR #5 was merged as the consolidation/release baseline.
- It preserved refactor and adversarial fixes around KMZ import, deadlines, road-lock failure handling, reroute abort cleanup, deployment-root safety, public CI, and trusted validation.
- Visual regression was intentionally informational while automatic-theme drift was being stabilized.
- Production deployment remained a separate concern.
- PR #6 was open as a docs-only Paperclip evidence change when this pack was prepared.

Do not infer deployment readiness from this UX pack.

## Current stack

Observed `package.json`:
- Node `>=24`
- Next.js `16.3.0`
- React / React DOM `19.2.7`
- TypeScript `6.0.3`
- Zustand `5.0.14`
- MapLibre GL `5.24.0`
- Vitest `4.1.10`
- Playwright `1.61.1`
- Dexie `4.4.4`
- Turf modules
- Phosphor icons
- DM Sans + Sora variable fonts

Do not upgrade framework versions as part of this UX program unless a phase explicitly requires it.

## Existing QA commands

Preserve these commands and their meaning:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:critical
npm run test:e2e:real-router
npm run test:e2e:pwa
npm run qa:pr
npm run verify
```

Use targeted tests while iterating, then the phase’s required full gates before handoff.

## Existing architectural strengths to preserve

### Routing
Do not replace the routing/provider architecture to make UI work easier.

### Navigation
The current navigation engine already includes map matching, heading/continuity penalties, off-route logic, progress, ETA, maneuvers, and recovery behavior. UI work must consume it, not duplicate it.

### Free Ride
The current implementation already includes:
- graph-backed candidate discovery,
- directed forward opportunities,
- route-provider validation,
- candidate scoring,
- GPS confidence gating,
- workload gating,
- cooldowns,
- prompt limits,
- rejected/recent candidate memory,
- corridor traversal verification,
- preference-learning seams.

The program extends these systems.

### Road intelligence
The repository contains substantial road / RIG / scoring infrastructure. Surface it better before inventing another scoring platform.

### Offline
There is substantial offline routing code and worker infrastructure. Do not delete or bypass it for an online-only UI.

## Known concentration points

Current files are large enough that UI work must avoid adding more responsibility to them.

Observed sizes on `main`:
- `src/components/planner/PlannerShell.tsx` ~68 KB
- `src/components/planner/MapStage.tsx` ~55 KB
- `src/components/planner/PlannerDeck.tsx` ~38 KB
- `src/components/planner/LibraryDrawer.tsx` ~27 KB
- `src/components/planner/RegionDownloadsPanel.tsx` ~28 KB

### Rule
Do not add a major new UX subsystem directly into `PlannerShell.tsx` or `MapStage.tsx`.

If a phase touches them, the normal pattern is:
1. extract a focused controller/hook/component,
2. add tests,
3. reconnect the existing orchestration,
4. keep behavior stable,
5. then layer new UX on the new boundary.

## Behavior that must not regress

- route legality / access restrictions,
- road-lock handling,
- GPX import intent,
- request staleness / abort behavior,
- primary and alternative route planning,
- explicit user route selection,
- rider preference learning,
- PWA shell behavior,
- saved route persistence,
- offline routing seams,
- navigation progress,
- off-route recovery,
- Free Ride safety suppression,
- route recording,
- phone controls remaining tappable,
- light/dark behavior.

## Forbidden shortcuts

Do not:
- replace MapLibre globally in one commit;
- replace Zustand with another state library;
- rewrite routing contracts;
- rewrite the navigation engine;
- invent fake live traffic;
- call OSM traffic-control features “real-time traffic”;
- represent static construction tags as live closures;
- remove offline code because Mapbox is easier;
- weaken E2E checks because selectors change;
- update snapshots blindly;
- add duplicate state in components to work around store architecture;
- ship diagnostics or debug scoring as primary rider UI.
