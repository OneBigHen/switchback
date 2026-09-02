# Switchback V2.1 Premium UX Implementation Plan

> **For agentic workers:** Execute this plan wave-by-wave. Use small coherent commits, focused tests, and manual screenshot inspection. Do not redesign the architecture.

**Goal:** Turn the merged V2 product into a sleek, map-first, production-grade motorcycle navigation experience across planning, content destinations, riding surfaces, responsive layouts, dark mode, motion, performance and release QA.

**Architecture:** Presentation refactor over the existing V2 authorities. Keep one persistent map, existing planner/view-model commands, Rides normalization/source IDs, Free Ride contracts, recording/storage/sync/community semantics and current navigation model. Prefer focused component/CSS changes; avoid PlannerShell state/orchestration work.

**Tech Stack:** Next.js current repo version, React, TypeScript, CSS modules/shared canonical CSS, Mapbox GL JS v3, Phosphor icons, Playwright, Vitest, existing repository CI.

**Spec:** `docs/superpowers/specs/2026-09-01-switchback-v2-1-agent-handoff-design.md`

## Global constraints
- Map-first Plan; content-first destinations; calm at-speed surfaces.
- No new state/store authority, renderer, routing engine, component library, icon family or animation library without a proven blocker.
- Free Ride remains separate from `PlanMode`; Record remains a separated task action.
- Rides source IDs and normalization stay authoritative.
- Route labels/metrics must come from real data or deterministic existing derivations.
- Canonical design authority remains `design/DESIGN-CONTRACT.md` and existing token files.
- Touch targets >=44px; phone text/search inputs >=16px; reduced motion respected.
- Visual baselines are never bulk-updated without inspecting expected/actual/diff.
- Exact-head evidence is invalidated by any substantive later commit.

---

## Wave 1 — Planning instrument

### Task 1: Shared Plan grammar
**Files:** `src/app/styles/plan-v2.css`, `src/app/styles/shell-v2.css`, `src/components/planner/PlannerDeck.tsx`, V2 planner components/CSS.

- [ ] Add/confirm 320×700 semantic/geometry assertions for sheet height, nav separation, 44px controls, 16px input and overflow.
- [ ] Make omnibox the dominant idle control; group Destination/Loop/Draw; keep Free Ride separate; Options tertiary.
- [ ] Preserve existing detents and map-control clearance.
- [ ] Verify 320×700, 390×844, 430×932, 768×1024, 844×390, 1440×900.
- [ ] Run focused unit/visual tests and commit.

### Task 2: Secondary planning states
**Files:** `PlanOptions.tsx`, `SketchRouteToolbar*`, `LayersSheet*`, provider/error presentation, road-lock presentation.

- [ ] Group Options into Route, Stops & shape, Loop, Road requirements, Saved places.
- [ ] Keep Draw map-first; do not require a finish location.
- [ ] Make loading compact with elapsed + Cancel; do not replace the whole sheet.
- [ ] Make provider errors concise and actionable without warning-color flooding.
- [ ] Verify layers/road-lock overlays clear active sheet/nav.
- [ ] Test and commit.

### Task 3: Route decision and Prepare
**Files:** `RouteDecisionCard*`, `RouteDecisionRail*`, `PlannerComposition.tsx`, `PlannerDeck.tsx`, `RouteComparison.tsx`, action-dock styles.

- [ ] Use existing role/name/time/distance/delta/character/warning only.
- [ ] Make selected alternative an accent/border state, not full-card orange.
- [ ] Add compact selected-route summary before Start.
- [ ] Make `Start route` dominant; `Edit route` secondary; Offline/Road locks/Clear tertiary.
- [ ] Ensure route-detail actions group by Ride, Save/Export/Share, Trip, advanced facts.
- [ ] Ensure offline modal footer is visible at 320×700.
- [ ] Run `npm run qa:pr` at wave milestone and commit.

---

## Wave 2 — Content destinations

### Task 4: Rides
**Files:** `src/components/rides/*`, shared destination-header grammar only where genuinely reusable.

- [ ] Seed deterministic visual fixture with saved, recorded, trip and imported kinds.
- [ ] Compact header; Import; Search; horizontal filters; first row appears early.
- [ ] Row hierarchy: source → title → metrics → quiet tags → open affordance.
- [ ] Management remains collapsed; destructive delete isolated.
- [ ] Preserve source-ID dispatch/import behavior.
- [ ] Test callbacks, filtering, search, import and phone geometry; commit.

### Task 5: Discover/community
**Files:** `DiscoverDestination*`, `src/app/routes/page.tsx`, `src/app/routes/[routeId]/page.tsx`, `community.css`.

- [ ] Compact Discover header and search-first composition.
- [ ] Use only guaranteed fields; no inferred ADV/Gravel/Twisty/Scenic taxonomy.
- [ ] Distinguish loading, API error, zero public routes and zero search matches.
- [ ] Unify standalone Atlas/detail visual language without mounting PlannerShell.
- [ ] Preserve sanitized preview/report/download semantics.
- [ ] Test and commit.

### Task 6: Settings/Advanced
**Files:** `SettingsDestination*`, `SettingsSurface*`, `UiCustomizationSettings*`, `SettingRow*`, `ProfilePanel*`, `RegionDownloadsPanel.tsx`.

- [ ] Compact header and active-bike identity card.
- [ ] Reduce redundant row descriptions, preserve consequence text.
- [ ] Keep one Advanced entry; inside Advanced group ID, Sync/Recovery, Offline/Local, Diagnostics.
- [ ] Keep linked/recovery/destructive states explicit.
- [ ] Verify dark mode and 320px modal containment.
- [ ] Test persistence/focus/escape and commit.

---

## Wave 3 — Ride instruments

### Task 7: Record
**Files:** `RecordPanel.tsx` and owned styles.

- [ ] Make ready/local state quiet; breadcrumb area meaningful.
- [ ] Align three telemetry metrics.
- [ ] Idle: Start primary. Active: Pause primary. Paused: Resume primary. Finish stays obvious.
- [ ] Preserve discard/finalization behavior.
- [ ] Test and commit.

### Task 8: Free Ride
**Files:** `FreeRideHud.tsx`, `free-ride.css`.

- [ ] GPS/speed/heading/riding state outrank recommendation score.
- [ ] Keep Experimental warning.
- [ ] One suggestion; max three reasons; Accept primary; Ignore/Less like this secondary.
- [ ] No carousel or decorative motion.
- [ ] Verify workload/suppression/exit/recording states; test and commit.

### Task 9: Ride HUD/recovery
**Files:** `RideHud.tsx`, `RideHudStatus.tsx`, `RideRecoveryActions.tsx`, RideRecordingHud and style owners.

- [ ] Topbar utilities quiet; maneuver/recovery owns attention.
- [ ] Preserve preview/live/track-only/GPS-uncertain/arrival distinctions.
- [ ] Off-route visibly stronger than normal guidance and preserves original route policy.
- [ ] Telemetry fully contained and aligned.
- [ ] Run Chromium + WebKit ride states, `npm run qa:pr`, commit.

---

## Wave 4 — Product hardening

### Task 10: Responsive/dark/a11y/motion
- [ ] Sweep 320×700, 390×844, 430×932, 844×390, 768×1024, 1024×768, 1440×900, 1920×1080.
- [ ] Sweep dark on Plan, route-ready, Rides, Discover, Settings, Advanced, Free Ride, Ride, errors.
- [ ] Keyboard/focus pass; reduced-motion pass; long-content/missing-data stress pass.
- [ ] Fix owner-specific CSS rather than global overrides.
- [ ] Commit.

### Task 11: Performance
- [ ] Compare build output before/after; investigate meaningful growth.
- [ ] Ensure no extra map instances, route-card map renderers, runtime font requests or new heavy UI dependencies.
- [ ] Prefer transform/opacity for motion; avoid large map-region blur/layout animation.
- [ ] Check Plan sheet, list scrolling and Ride HUD for obvious jank on phone/WebKit.
- [ ] Commit only necessary fixes.

### Task 12: Visual hardening/release
- [ ] Build planning/destination/ride/dark/responsive contact sheets.
- [ ] Run adversarial review in `docs/ux/v2-1/START-HERE.md` instructions.
- [ ] Resolve P0/P1 and reasonable P2 defects.
- [ ] Rebaseline only manually accepted snapshots, with bundled fonts proven loaded.
- [ ] Run exact-head `qa:pr`, full E2E, critical, real-router, PWA, mobile expanded QA, build, visual and road-lock gates as repository workflows require.
- [ ] Write final proof in `docs/ux/v2-1/STATE.md` and keep PR draft until exact-head evidence is green.

## Completion definition
A reviewer can move through idle Plan → route decision → preparation → Ride, plus Rides/Discover/Settings/Record/Free Ride, on phone/landscape/tablet/desktop/light/dark without encountering a screen that feels like a different app, an inaccessible control, fake data, clipped geometry, decorative motion, or an obvious performance regression.