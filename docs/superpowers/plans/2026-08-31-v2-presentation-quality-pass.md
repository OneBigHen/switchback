# Switchback V2 Presentation Quality Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace modal-era Settings/Library presentation with destination-grade V2 surfaces, add Switchback-specific visual primitives, and verify preserved storage/domain behavior.

**Architecture:** `PlannerShell` keeps all domain/storage callbacks. Navigation promotes Settings to a primary destination. New focused settings sections consume the existing `RiderSettings` source and existing identity/sync/learning/download/diagnostics capabilities. Rides keeps its normalization adapter and gains reusable route graphics and improved contextual presentation; legacy `LibraryDrawer` becomes compatibility-only.

**Tech Stack:** Next.js, React, TypeScript, CSS Modules, Phosphor icons, Vitest/Testing Library, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-31-v2-presentation-quality-pass-design.md`

## Global Constraints

- Preserve existing domain/storage ownership; do not introduce a second settings, route, ride, trip, import, sync, or identity store.
- All interactive targets must remain at least 44px.
- Settings becomes a primary destination and `?tab=profile` migrates to it.
- Keep Record and Downloads as activity/overlay flows.
- Use code-native SVG/CSS route/bike graphics; no raster asset dependency.
- Do not blindly rebaseline visual tests.

---

### Task 1: Promote Settings to primary navigation

**Files:**
- Modify: `src/lib/client/app-navigation.ts`
- Modify: `src/components/shell/AppNavigation.tsx`
- Modify: `src/components/planner/PlannerShell.tsx`
- Test: `tests/components/app-navigation.test.tsx`
- Test: `tests/e2e/critical/v2-destination-navigation.spec.ts`

**Interfaces:**
- Produces: `PrimaryDestination = "plan" | "rides" | "discover" | "settings"`
- Produces: `destinationFromLocation("...?tab=profile") -> { destination: "settings", overlays: [] }`

- [ ] Write failing navigation tests asserting Settings is a destination, not an overlay, and legacy `?tab=profile` resolves to it.
- [ ] Run focused Vitest/critical browser tests and verify failure against current overlay behavior.
- [ ] Update navigation types/reducer/deep-link migration and AppNavigation control.
- [ ] Replace PlannerShell `ProfilePanel` overlay mount with a `navigation.destination === "settings"` destination mount point while leaving downloads/record overlays intact.
- [ ] Run focused tests and commit `refactor(ux-v2): promote Settings to destination`.

### Task 2: Build code-native visual primitives

**Files:**
- Create: `src/components/v2/RouteGraphic.tsx`
- Create: `src/components/v2/RouteGraphic.module.css`
- Create: `src/components/v2/DestinationHeader.tsx`
- Create: `src/components/v2/DestinationHeader.module.css`
- Create: `src/components/v2/SettingRow.tsx`
- Create: `src/components/v2/SettingRow.module.css`
- Test: `tests/components/v2-presentation-primitives.test.tsx`

**Interfaces:**
- `RouteGraphic({ seed, variant, label? }: { seed: string; variant: "route" | "bike" | "library"; label?: string })`
- `DestinationHeader({ eyebrow, title, description, graphic?, actions? })`
- `SettingRow({ title, description?, children, danger? })`

- [ ] Write failing component tests for deterministic SVG output, accessible decorative/label semantics, and 44px control row structure.
- [ ] Implement deterministic route-line path generation from a stable string hash without randomness/global state.
- [ ] Implement header and setting-row primitives using existing Switchback tokens.
- [ ] Add responsive CSS with bounded desktop width and single-column mobile behavior.
- [ ] Run component tests/lint/typecheck and commit `feat(ux-v2): add presentation primitives`.

### Task 3: Replace ProfilePanel with SettingsDestination sections

**Files:**
- Create: `src/components/settings/SettingsDestination.tsx`
- Create: `src/components/settings/SettingsDestination.module.css`
- Create: `src/components/settings/RiderBikeSettings.tsx`
- Create: `src/components/settings/RiderDefaultsSettings.tsx`
- Create: `src/components/settings/AccountSyncSettings.tsx`
- Create: `src/components/settings/DataDiagnosticsSettings.tsx`
- Rewrite: `src/components/settings/SettingsSurface.tsx`
- Rewrite: `src/components/settings/SettingsSurface.module.css`
- Modify: `src/components/planner/PlannerShell.tsx`
- Test: `tests/components/settings-destination.test.tsx`

**Interfaces:**
- `SettingsDestination` owns presentation-local disclosure/notice state only.
- `RiderSettings` is passed in and all persistence uses `saveRiderSettings`.
- Existing passkey/sync controller, learning callbacks, downloads callback, and diagnostics collector remain the behavior providers.

- [ ] Write failing tests proving Settings renders as `role=region`, active bike is prominent, edits persist through the existing store, and no `profile-panel sb-bottom-sheet` exists.
- [ ] Move rider/bike/default controls into focused sections with SettingRow geometry.
- [ ] Move passkey/recovery/sync behavior from `ProfilePanel` into `AccountSyncSettings` without changing controller methods.
- [ ] Move learning export/reset, downloads entry, and diagnostics disclosure into `DataDiagnosticsSettings`; keep destructive confirmation.
- [ ] Mount `UiCustomizationSettings` as one coherent section instead of an unrelated page fragment.
- [ ] Synchronize theme changes to both `RiderSettings.theme` and navigation theme.
- [ ] Run settings tests, migration tests, lint/typecheck and commit `feat(ux-v2): rebuild Settings destination`.

### Task 4: Rebuild Settings visual hierarchy and controls

**Files:**
- Rewrite: `src/components/settings/UiCustomizationSettings.tsx`
- Rewrite: `src/components/settings/UiCustomizationSettings.module.css`
- Modify: `src/components/settings/SettingsDestination.module.css`
- Test: `tests/components/settings-destination.test.tsx`
- Test: `tests/components/rider-settings-v2.test.ts`

**Interfaces:**
- Existing `RiderUiPreferences` arrays remain canonical.
- Reordering continues through `onChange(nextPreferences)` only.

- [ ] Add tests for reset, reorder, required route-detail visibility, and keyboard-accessible controls.
- [ ] Replace repeated arrow-button rows with denser ordered controls while retaining explicit accessible move actions.
- [ ] Use section dividers and grouped settings rather than nested cards.
- [ ] Verify all controls >=44px and mobile layout has no horizontal overflow by contract selectors.
- [ ] Commit `style(ux-v2): refine Settings control hierarchy`.

### Task 5: Elevate Rides from list to professional library surface

**Files:**
- Rewrite: `src/components/rides/RidesSurface.tsx`
- Rewrite: `src/components/rides/RidesSurface.module.css`
- Rewrite: `src/components/rides/RideListRow.tsx`
- Modify: `src/components/rides/RideFilters.tsx`
- Modify: `src/components/rides/RidesDestination.tsx`
- Test: `tests/components/rides-surface.test.tsx`
- Test: `tests/components/rides-destination-management.test.tsx`

**Interfaces:**
- `RideLibraryItem.sourceId` remains the dispatch identity.
- Existing `onOpen`, `onManage`, `onImport`, and road-lock import callbacks are unchanged semantically.

- [ ] Write failing tests for source breakdown, route graphic, contextual Manage disclosure, and preserved exact source dispatch.
- [ ] Add library hero with total/source metrics and deterministic RouteGraphic.
- [ ] Redesign ride rows with type marker, graphic trace, metrics, open action, and contextual management affordance.
- [ ] Keep search/type filtering compact and accessible; do not restore V1 facet studio.
- [ ] Keep destructive delete quiet until explicit confirmation.
- [ ] Run Rides tests/lint/typecheck and commit `style(ux-v2): elevate Rides library surface`.

### Task 6: Retire modal LibraryDrawer contracts

**Files:**
- Rewrite: `src/components/planner/LibraryDrawer.tsx`
- Rewrite: `tests/components/library-drawer.test.tsx`
- Rewrite: `tests/components/library-drawer-road-locks.test.tsx`
- Verify: `tests/components/import-flow-v2.test.tsx`

**Interfaces:**
- `LibraryDrawer` remains a compatibility export of `RidesDestination` only; no modal focus trap or separate filtering state.

- [ ] Replace modal-only tests (focus trap, close button, old facet studio) with compatibility tests proving the export delegates to V2 Rides and preserves load/import/delete/road-lock callback semantics.
- [ ] Confirm V2 ImportFlow tests cover Prefer/Require-to-existing-lock-mode mapping.
- [ ] Remove dead modal CSS/imports referenced only by retired LibraryDrawer.
- [ ] Run focused library/import tests and commit `refactor(ux-v2): retire modal library contracts`.

### Task 7: Adversarial review and regression fixes

**Files:**
- Modify only files implicated by findings.
- Create: `docs/phase-reports/PRESENTATION-QUALITY-ADVERSARIAL-REVIEW.md`

**Review:**
- duplicate state/authority
- V1/modal leftovers
- box/card overuse
- duplicated actions
- button density and touch sizes
- contrast/token misuse
- mobile overflow
- keyboard/focus semantics
- empty/loading/error states
- destructive confirmation
- storage/callback identity preservation
- dead CSS/imports

- [ ] Review every changed component against the checklist and record concrete findings with severity and resolution.
- [ ] Add a failing regression test for each behavior defect found before fixing it.
- [ ] Fix all Critical/High/Medium findings in scope; document Low observations only when genuinely non-blocking.
- [ ] Commit `fix(ux-v2): address presentation adversarial review`.

### Task 8: Full verification and integration handoff

**Files:**
- Modify PR/report docs only if needed.

- [ ] Run `npm test -- --reporter=dot`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run clean production build.
- [ ] Run critical Playwright, PWA, road-lock, real-router, visual, and Mobile QA workflows.
- [ ] Inspect failures and distinguish stale assertions from actual behavior regressions; never blindly update snapshots.
- [ ] Update PR metadata with exact verified SHA and remaining external blockers.
- [ ] Fast-forward `ux/v2-final-integration` only after required gates are green or explicitly understood/documented.
- [ ] Commit any final verification-only fixes and report exact branch/SHA for local continuation.
