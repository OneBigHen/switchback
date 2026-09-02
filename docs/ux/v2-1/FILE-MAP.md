# FILE MAP — Switchback V2.1

Use this to keep work inside existing ownership boundaries.

## Shared visual authority
- `design/DESIGN-CONTRACT.md` — visual source of truth.
- `src/app/styles/tokens.css` — canonical token authority.
- `src/app/styles/design-system.css` — map/sheet structural geometry.
- `src/app/styles/shell-v2.css` — desktop/phone/short-landscape navigation.
- `src/app/styles/plan-v2.css` — Plan presentation.

Do not create a competing V2.1 token/global-style layer.

## Planner
- `src/components/planner/PlannerShell.tsx` — orchestration/state authority; avoid logic changes.
- `src/components/planner/PlannerComposition.tsx` — presentation composition boundary.
- `src/components/planner/PlannerDeck.tsx` — sheet state/detents/stage/action dock.
- `src/components/planner/PlannerDeckViewModel.ts` — presentation contract; only expose existing data if needed.
- `src/components/planner/v2/PlanComposer.tsx`
- `src/components/planner/v2/PlanModeSelector.tsx`
- `src/components/planner/v2/PlanOptions.tsx`
- `src/components/planner/v2/RouteDecisionRail.tsx` + module CSS
- `src/components/planner/v2/RouteDecisionCard.tsx` + module CSS
- `src/components/planner/v2/SketchRouteToolbar.tsx` + module CSS
- `src/components/planner/v2/LayersSheet.tsx` + module CSS
- `src/components/planner/RouteComparison.tsx`
- `src/components/planner/RoadLockLibraryDrawer.tsx`
- map-stage components only for presentation/clearance, not route algorithms.

## Rides
- `src/components/rides/RidesDestination.tsx` — adapters/wiring.
- `src/components/rides/rides-view-model.ts` — normalization/source identity authority; preserve.
- `src/components/rides/RidesSurface.tsx` + CSS
- `src/components/rides/RideListRow.tsx`
- `src/components/rides/RideFilters.tsx`
- `src/components/rides/ImportFlow.tsx` + CSS
- `src/components/planner/LibraryDrawer.tsx` — existing ownership connection.

## Discover/community
- `src/components/discover/DiscoverDestination.tsx` + CSS
- `src/app/routes/page.tsx`
- `src/app/routes/[routeId]/page.tsx`
- `src/app/styles/community.css`
- `src/components/community/CommunityPreviewMap.tsx`
- `src/components/community/CommunityReportForm.tsx`

## Settings/data
- `src/components/settings/SettingsDestination.tsx` + CSS
- `src/components/settings/SettingsSurface.tsx` + CSS
- `src/components/settings/UiCustomizationSettings.tsx` + CSS
- `src/components/v2/SettingRow.tsx` + CSS
- `src/components/v2/DestinationHeader.tsx` + CSS
- `src/components/v2/RouteGraphic.tsx` + CSS
- `src/components/shell/ProfilePanel.tsx` + CSS
- `src/components/planner/RegionDownloadsPanel.tsx`
- existing diagnostics components/styles.

## Ride/record
- `src/components/shell/RecordPanel.tsx`
- record style owner already used by component/shell
- `src/components/shell/FreeRideHud.tsx`
- `src/app/styles/free-ride.css`
- `src/components/planner/RideHud.tsx`
- `src/components/planner/RideHudStatus.tsx`
- `src/components/planner/RideRecoveryActions.tsx`
- `src/components/shell/RideRecordingHud.tsx`
- corresponding current Ride HUD style owner.

## Tests/fixtures
- `tests/e2e/visual/screens.spec.ts`
- `tests/e2e/visual/ux-states.spec.ts`
- `tests/e2e/helpers/planner-fixtures.ts`
- `tests/e2e/helpers/ux-state-fixtures.ts`
- existing unit/component tests beside or under current test layout.

## Expensive/no-go boundaries

### PlannerShell
Presentation prop wiring: allowed. State/store/routing orchestration refactor: out of scope.

### `rides-view-model.ts`
Formatting/derived display helper may be acceptable if it preserves IDs/semantics. Replacing normalization or inventing a second presentation store is not.

### Routing/providers
Do not edit route algorithms/provider selection/scoring merely to make a screen easier to render.

### Identity/sync/offline
Presentation only. No cryptography/session/storage redesign.

### Community privacy
Do not weaken sanitization or report/download behavior.

### CI
Add focused deterministic assertions if needed. Do not rewrite the CI architecture or remove compatibility contexts in this branch.

## Component extraction rule
Extract a new component only when:
- reused by at least two current screens; or
- the current component has a clearly separate visual responsibility; or
- extraction materially improves deterministic testing.

Do not build a generic design-system catalogue during V2.1.