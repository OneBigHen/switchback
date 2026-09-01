# Switchback V2 Presentation Quality Pass

Date: 2026-08-31

## Goal

Finish the V2 presentation migration by replacing weak modal-era and dashboard-like UI with destination-grade, map-first surfaces that feel like a professional motorcycle navigation product. Preserve domain/storage ownership and existing route, ride, trip, import, sync, identity, learning, diagnostics, and offline behaviors.

## Design principles

- **Map-first and rider-first.** Planning remains the dominant operational surface. Non-map destinations should feel intentionally separate, not like modal forms laid over the map.
- **Rugged-premium, not generic SaaS.** Use the existing Switchback Ink/Spruce/Canvas/Ember language with restrained contrast, strong typography, route-line graphics, topo motifs, and motorcycle-specific visual cues.
- **One visual hierarchy.** Destination title → primary object/status → compact sections → contextual actions. Avoid nested card stacks, button soup, repeated headings, and giant forms.
- **44px minimum interactive targets.** Mobile ergonomics are a hard requirement.
- **Progressive disclosure.** Common actions are visible; destructive, organizational, identity/sync, and advanced customization controls expand contextually.
- **No second state authority.** Presentation components receive and mutate the existing RiderSettings, route library, ride journal, trip library, sync controller, and planner handlers.
- **Generated visual language should be code-native.** Route/bike graphics use inline SVG/CSS/topographic motifs so they remain crisp, themeable, offline-safe, and do not add opaque raster dependencies.

## Architecture

### Navigation

Promote `settings` from an `AppOverlay` to a `PrimaryDestination` alongside `plan`, `rides`, and `discover`. Preserve `?tab=profile` as a migration path to `settings`. Settings must participate in browser history/back behavior like Rides rather than behaving as a bottom sheet.

The Record activity and Downloads remain overlays/activities because they are task-scoped and should not become permanent top-level destinations.

### Settings

Replace `ProfilePanel` as the visual authority. Split responsibilities into focused sections rendered inside `SettingsDestination`/`SettingsSurface`:

1. **Rider + bike hero** — active motorcycle, capability summary, rider identity, edit/change actions.
2. **Ride defaults** — units, voice guidance, learning, default route behavior.
3. **Customize** — existing curated quick actions/layers/HUD/route-detail ordering.
4. **Account & sync** — passkey identity, encrypted sync state, recovery-kit workflow.
5. **Offline & data** — region downloads entry, learning export/reset.
6. **Diagnostics** — progressive disclosure, never a giant always-open panel.
7. **Appearance** — theme controls integrated with the versioned rider settings source.

Settings state remains `RiderSettings`; editing functions write through `saveRiderSettings` and keep `navigation.theme` synchronized when theme changes.

### Rides / library

`RidesDestination` remains the primary destination authority. Retire modal-specific LibraryDrawer behavior and tests. `LibraryDrawer` becomes only a compatibility export and must not own focus traps, close semantics, filters, or storage behavior.

Improve Rides visually around three object layers:

1. **Library hero/summary** — total rides plus compact source breakdown and route-line/topo graphic.
2. **Filters/search** — sticky/compact; no large toolbar box.
3. **Ride object rows/cards** — strong source/type marker, route metrics, route-line motif, obvious open affordance. Contextual Manage expansion owns organization/matching/delete controls.

Import remains a contextual V2 workflow using existing route and road-lock handlers.

### Visual primitives

Introduce small reusable presentation primitives rather than more page-specific CSS:

- `DestinationHeader`
- `SettingsSection`
- `RouteGraphic` (inline SVG, deterministic from object id/kind)
- `MetricPill`/compact metric treatment
- `SettingRow` for label/description/control alignment
- `DisclosureSection` for advanced/destructive areas

Do not create a general-purpose design-system package; primitives live near the V2 surfaces and only cover repeated patterns actually used in this pass.

## Visual language

- Canvas/Paper backgrounds with Ink/Spruce typography.
- Ember only for selection, route accent, high-value actions, or warning emphasis.
- Thin topo/route-line graphics and clipped SVG route traces add identity without photographic clutter.
- Desktop destinations use a bounded content rail with intentional whitespace and optional two-column sections where useful.
- Mobile collapses to a single readable column, preserves 44px controls, and never relies on hover.
- Buttons follow three levels: primary filled action, secondary outlined/raised action, tertiary icon/text action. Destructive actions stay visually quiet until confirmation state.
- Inputs/selects use consistent 44–48px geometry, labels above or aligned in SettingRow, and visible focus states.

## Adversarial review criteria

Every migrated component is reviewed against:

- duplicate authority/state
- modal leftovers and stale V1 semantics
- nested-card or box-soup composition
- duplicated actions
- excessive button count
- sub-44px controls
- low-contrast text or token misuse
- mobile overflow / inaccessible horizontal layouts
- missing empty/loading/error states
- missing keyboard/focus semantics
- destructive actions without confirmation
- hidden behavior regressions in saved-route/trip/recorded/project/import/sync/identity flows
- desktop layouts that are stretched phone layouts
- dead CSS/classes/imports after migration

## Testing

Use TDD for behavior changes.

Required checks:

- focused Vitest component tests for Settings/Rides primitives and dispatch behavior
- navigation migration tests for `settings` destination and `?tab=profile`
- existing RiderSettings migration/storage tests
- import/road-lock tests
- critical Playwright destination navigation and persistence tests
- PWA offline saved-route access
- road-lock suite
- real-router suite
- typecheck, lint, production build
- Mobile QA Level A
- visual Playwright suite; visual failures are inspected as intentional vs regression rather than blindly rebaselined

## Branch strategy

Work on `ux/v2-settings-integration`, stacking from the verified Rides head. Keep changes in small semantic commits. Once Settings + Rides quality gates are green, fast-forward `ux/v2-final-integration` to the verified head rather than merging independent phase branches to main.

## Non-goals

- No new routing engine behavior.
- No new storage database.
- No redesign of Ride HUD/Free Ride beyond incidental shared primitive cleanup in this pass.
- No arbitrary dashboard customization or draggable layout builder.
- No new account backend or sync protocol.
