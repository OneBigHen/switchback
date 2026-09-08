# Map System Foundation Phase 0–1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and repair the current map-presentation boundary, establish one canonical Road/Terrain/Satellite preset contract, and migrate saved map packs safely without changing routing, navigation, editing, or later-phase cartography.

**Architecture:** Preserve Mapbox GL JS v3 Standard / Standard Satellite behind `PlannerMapRenderer` and preserve MapLibre as rollback. Runtime presentation becomes `MapPresetId + MapSurfaceProfile + MapLightPreset -> MapPresentation`. One registry owns rider-facing preset metadata. One capability translator owns Mapbox style-family config. `RiderLayerSetting[]` remains the only overlay state authority.

**Tech Stack:** Next.js 16.3.3, React 19.2.7, TypeScript 6.0.3, Mapbox GL JS 3.28.1, MapLibre GL JS 5.24.0, Vitest 4.1.10, Testing Library, Dexie 4.4.4.

**Spec:** `docs/superpowers/specs/2026-09-07-map-system-overhaul-design.md`

## Global constraints

- [ ] Work from `design/map-system-overhaul` or a child branch based on its exact reviewed head; never edit `main` directly.
- [ ] Use Node 24. On the Switchback host use `PATH=/root/.n/bin:$PATH` because non-login shells may resolve Node 22.
- [ ] Preserve ADR 0015: Mapbox Standard / Standard Satellite primary, MapLibre rollback, custom layers placed by Standard slots.
- [ ] Do not touch routing providers, route scoring, GraphHopper/Valhalla/TomTom contracts, ride intent, drawing semantics, route sculpting, avoid-area behavior, navigation-camera ownership, or viewport feature fetching.
- [ ] Phase 1 preset IDs are exactly `road | terrain | satellite`. Do not add Topo. Topo is Phase 3 and must earn a separate value gate.
- [ ] Do not build semantic visual tokens, rider lenses, semantic layer bands, a new store, a new state machine, a renderer/provider framework, a Mapbox Studio style fleet, a new data provider, or a new dependency.
- [ ] Keep existing `topo`, `terrain`, and `satellite` `RiderLayerId` raster overlays and existing layer-order controls during Phase 1. Their cleanup is intentionally deferred.
- [ ] Keep current route ribbon/road-character paint behavior. Temporary `routeEmphasis` may remain until Phase 2.
- [ ] Do not split `PlannerMapStage.tsx` for file size. Only adapt its presentation imports/types/calls.
- [ ] Do not add `setStyle` preservation machinery or optimize Satellite map-load behavior without measured evidence.
- [ ] Never broad-rebaseline visual snapshots to hide a regression. The intended visible Phase 1 change is the rider-facing label `Standard` becoming `Road`.
- [ ] Every feature/refactor task uses failing contract -> minimal implementation -> focused regression -> commit.
- [ ] Do not claim physical-device validation, premium-map rollout acceptance, or release qualification from this plan.

---

## Task 0 — Freeze the execution baseline

**Read:** `AGENTS.md`, `docs/adr/0015-mapbox-primary-renderer.md`, `docs/astra/FULL-REFACTOR-SPEC.md`, `docs/astra/DESIGN-SYSTEM.md`, the approved map design spec, and `package.json`.

- [ ] Run `git status --short` and resolve any unrelated local changes before map work.
- [ ] Run `git rev-parse HEAD` and copy that exact SHA into the Phase 0–1 evidence notes as the implementation start.
- [ ] Run `PATH=/root/.n/bin:$PATH node --version` and require Node 24.
- [ ] Run the current focused baseline:

```bash
PATH=/root/.n/bin:$PATH npx vitest run \
  tests/unit/map-experience.test.ts \
  tests/unit/mapbox-config.test.ts \
  tests/unit/map-layer-migration.test.ts \
  tests/unit/map-layer-settings.test.ts \
  tests/unit/map-pack-library.test.ts \
  tests/components/layers-sheet-v2.test.tsx
PATH=/root/.n/bin:$PATH npm run typecheck
```

- [ ] Record any pre-existing failure exactly. Do not weaken unrelated coverage to make the branch green.

**Value proof:** later failures can be attributed to this work rather than guessed.

---

## Task 1 — Characterize the actual Mapbox renderer boundary

**Create:** `tests/unit/planner-map-renderer.test.ts`

**Read:** `src/components/planner/planner-map-renderer.ts`, `src/lib/client/map-experience.ts`, `src/lib/client/mapbox-config.ts`.

This is characterization, not a feature; useful baseline assertions may pass immediately.

- [ ] Build a minimal fake map exposing only `setConfigProperty`, `setTerrain`, `setFog`, `getSource`, `getPitch`, and `easeTo`.
- [ ] Assert Standard-equivalent, Terrain-equivalent, and lighting changes produce one Mapbox style key while Satellite produces the other style-family key.
- [ ] Capture the exact current `setConfigProperty("basemap", ...)` names emitted for a Standard presentation.
- [ ] Capture the exact current config names emitted for a Satellite presentation. This records the defect before Task 4 fixes it.
- [ ] Assert terrain/fog lifecycle: relief sets them when DEM exists; flat presentation removes them.
- [ ] Assert Ride presentation never calls `easeTo`.
- [ ] Run `PATH=/root/.n/bin:$PATH npx vitest run tests/unit/planner-map-renderer.test.ts`.
- [ ] Commit:

```bash
git add tests/unit/planner-map-renderer.test.ts
git commit -m "test(map): characterize mapbox presentation boundary"
```

**Value proof:** renderer behavior is tested where Mapbox calls are emitted, not merely inside a resolver object.

---

## Task 2 — Create one canonical preset registry

**Create:**
- `src/lib/client/map-preset-registry.ts`
- `tests/unit/map-preset-registry.test.ts`

### 2A — Red

- [ ] Test the exact ordered IDs: `road`, `terrain`, `satellite`.
- [ ] Test labels: `Road`, `Terrain`, `Satellite`; `Standard` is implementation vocabulary, not rider-facing copy.
- [ ] Test Road/Terrain style family `standard`; Satellite `standard-satellite`.
- [ ] Test Satellite requires the premium renderer; Road/Terrain remain available on rollback.
- [ ] Test `availableMapPresets({ premiumRenderer: false })` returns Road/Terrain and the premium call returns all three.
- [ ] Test `isMapPresetId` rejects `standard`, `topo`, and arbitrary strings.
- [ ] Run `PATH=/root/.n/bin:$PATH npx vitest run tests/unit/map-preset-registry.test.ts` and confirm failure because the module does not exist.

### 2B — Green

- [ ] Implement only concrete Phase 1 fields:

```ts
export type MapStyleFamily = "standard" | "standard-satellite"
export type MapPresetId = "road" | "terrain" | "satellite"

export interface MapPresetDefinition {
  id: MapPresetId
  label: string
  description: string
  styleFamily: MapStyleFamily
  requiresPremiumRenderer: boolean
}
```

- [ ] Export one ordered `MAP_PRESETS`, `isMapPresetId`, `mapPresetDefinition`, and `availableMapPresets`.
- [ ] Do not add speculative `previewKey`, `baseTheme`, `terrainMode`, Topo entries, or extension hooks.
- [ ] Run the test green and run `PATH=/root/.n/bin:$PATH npm run typecheck`.
- [ ] Commit:

```bash
git add src/lib/client/map-preset-registry.ts tests/unit/map-preset-registry.test.ts
git commit -m "feat(map): add canonical preset registry"
```

**Value proof:** preset IDs, labels, availability, and style family have one authority.

---

## Task 3 — Make the resolver canonical without expanding scope

**Modify:**
- `src/lib/client/map-experience.ts`
- `tests/unit/map-experience.test.ts`

Keep the filename for Phase 1; avoid a mechanical repo-wide rename. Runtime types become presentation-oriented. “Experience” survives only in explicitly legacy persisted-data names.

### 3A — Red

- [ ] Rewrite resolver tests around `resolveMapPresentation({ preset, surface, lightPreset })`.
- [ ] Assert `MapPresentation` exposes canonical `preset` and registry-derived `styleFamily`.
- [ ] Preserve existing behavior contracts: Explore richer, Plan quieter, Ride restrained; Road flat; Ride transition zero; current terrain/atmosphere/camera behavior retained.
- [ ] Preserve `routeEmphasis` tests as Phase 2 compatibility.
- [ ] Add legacy premium-ID tests: `standard -> road`, `terrain -> terrain`, `satellite -> satellite`, invalid/missing -> Road.
- [ ] Change old style migration tests to return `{ preset, lightPreference }`: `clean -> road`, `explorer -> terrain`, `night -> road + night`.
- [ ] Test rollback mapping: `road -> standard`, `terrain -> terrain`, `satellite -> satellite` for the old premium `experience` field.
- [ ] Run `PATH=/root/.n/bin:$PATH npx vitest run tests/unit/map-experience.test.ts` and confirm red.

### 3B — Green

- [ ] Import `MapPresetId`, `MapStyleFamily`, and `mapPresetDefinition` from the registry.
- [ ] Replace runtime `MapExperienceConfig` with `MapPresentation` and runtime input with `{ preset, surface, lightPreset }`.
- [ ] Derive the Mapbox style URL from registry style family instead of a second preset switch.
- [ ] Keep existing terrain, atmosphere, labels, 3D intent, camera defaults, transition policy, surface behavior, and temporary `routeEmphasis` unless a failing test proves inconsistency.
- [ ] Add `LegacyMapExperienceId = "standard" | "terrain" | "satellite"` for compatibility only.
- [ ] Implement `migrateLegacyMapExperience`, updated `migrateLegacyMapStyle`, `legacyMapExperienceFor`, and canonical `legacyMapStyleFor`.
- [ ] Delete runtime `MAP_EXPERIENCES` and `isMapExperienceId`; registry validation replaces them.
- [ ] Run:

```bash
PATH=/root/.n/bin:$PATH npx vitest run \
  tests/unit/map-preset-registry.test.ts \
  tests/unit/map-experience.test.ts
PATH=/root/.n/bin:$PATH npm run typecheck
```

- [ ] Commit:

```bash
git add src/lib/client/map-experience.ts tests/unit/map-experience.test.ts
git commit -m "refactor(map): resolve canonical map presentations"
```

**Value proof:** runtime product state no longer uses a legacy map ID while persisted history remains recoverable.

---

## Task 4 — Enforce real Standard vs Standard Satellite capabilities

**Create:**
- `src/lib/client/mapbox-style-capabilities.ts`
- `tests/unit/mapbox-style-capabilities.test.ts`

**Modify:**
- `src/lib/client/mapbox-config.ts`
- `tests/unit/mapbox-config.test.ts`
- `src/components/planner/planner-map-renderer.ts`
- `tests/unit/planner-map-renderer.test.ts`

**Pinned contract to verify before coding if Mapbox changes:** Mapbox GL JS 3.28.1 Standard supports color theme and granular 3D controls (`show3dBuildings`, `show3dTrees`, `show3dLandmarks`, `show3dFacades`). Standard Satellite excludes Standard color theming and 3D-object configuration.

References:
- `https://docs.mapbox.com/map-styles/reference/standard/`
- `https://docs.mapbox.com/map-styles/reference/standard-satellite/`
- `https://docs.mapbox.com/mapbox-gl-js/guides/styles/set-a-style/`

### 4A — Red

- [ ] For Standard, expect common lighting/label properties plus `theme` and the granular 3D properties represented by `MapPresentation`.
- [ ] Do not expect broad `show3dObjects` when granular properties are emitted; avoid competing parent/child controls.
- [ ] For Standard Satellite, expect only supported common properties Switchback actually needs: lighting and label controls.
- [ ] Explicitly reject `theme`, `show3dObjects`, `show3dBuildings`, `show3dTrees`, `show3dLandmarks`, and `show3dFacades` from Satellite output.
- [ ] Do not add Satellite-only controls such as `showRoadsAndTransit` unless a current product requirement consumes them.
- [ ] Run `PATH=/root/.n/bin:$PATH npx vitest run tests/unit/mapbox-style-capabilities.test.ts` and confirm red.

### 4B — Green

- [ ] Implement one pure `mapboxBasemapConfig(presentation: MapPresentation)` translator keyed only by registry-derived style family.
- [ ] Remove `standardConfigProperties` from `mapbox-config.ts`; leave rollout/token gating and slot mapping there.
- [ ] Change `PlannerMapRenderer` presentation signatures from `MapExperienceConfig` to `MapPresentation`.
- [ ] Use the same translator when creating Mapbox (`config.basemap`) and applying live presentation (`setConfigProperty`).
- [ ] Preserve terrain/fog lifecycle, map-load counting, slot behavior, MapLibre fallback, and camera ownership.
- [ ] Update renderer-boundary tests from characterization to the fixed exact Standard/Satellite property sets.
- [ ] Run:

```bash
PATH=/root/.n/bin:$PATH npx vitest run \
  tests/unit/mapbox-style-capabilities.test.ts \
  tests/unit/mapbox-config.test.ts \
  tests/unit/planner-map-renderer.test.ts \
  tests/unit/map-experience.test.ts
PATH=/root/.n/bin:$PATH npm run typecheck
```

- [ ] Commit:

```bash
git add src/lib/client/mapbox-style-capabilities.ts \
  src/lib/client/mapbox-config.ts \
  src/components/planner/planner-map-renderer.ts \
  tests/unit/mapbox-style-capabilities.test.ts \
  tests/unit/mapbox-config.test.ts \
  tests/unit/planner-map-renderer.test.ts
git commit -m "fix(map): enforce style-family capabilities"
```

**Value proof:** every declared Standard 3D choice reaches Mapbox, while Satellite receives no unsupported theme/3D keys.

---

## Task 5 — Carry the preset contract through the planner without new state

**Modify:**
- `src/components/planner/map-stage-props.ts`
- `src/components/planner/PlannerShell.tsx`
- `src/components/planner/PlannerMapStage.tsx`
- `src/components/planner/MapStageLayerControl.tsx`
- `src/components/planner/v2/LayersSheet.tsx`
- `tests/components/layers-sheet-v2.test.tsx`
- `src/components/planner/MapStage.tsx` and `MapboxMapStage.tsx` only if type propagation requires it.

### 5A — Red

- [ ] Change the component test to `mapPreset="road"` and `onMapPresetChange`.
- [ ] Pass registry choices into the component and expect Road/Terrain/Satellite for premium mode.
- [ ] Pass non-premium registry choices and expect Road/Terrain with no Satellite.
- [ ] Assert selecting Road calls `onMapPresetChange("road")`.
- [ ] Keep quick-overlay count and Advanced-button assertions unchanged.
- [ ] Run `PATH=/root/.n/bin:$PATH npx vitest run tests/components/layers-sheet-v2.test.tsx` and confirm red.

### 5B — Green

- [ ] Rename only local `PlannerShell` presentation state to `mapPreset`/`setMapPreset`, default `road`. Do not move it into Zustand.
- [ ] Rename `MapStageProps.mapExperience` to `mapPreset` and callback to `onMapPresetChange`.
- [ ] Make `PlannerMapStage` call `resolveMapPresentation`; preserve surface derivation (`ride`, otherwise routes present `plan`, otherwise `explore`).
- [ ] Delete `EXPERIENCE_LABELS`, `mapExperienceChoices`, and the private `LayersSheet` `MAP_STYLES` array.
- [ ] Compute `availableMapPresets({ premiumRenderer: premiumExperiences })` once in `MapStageLayerControl`; use that exact array for Quick and Advanced selectors.
- [ ] Make `LayersSheet` accept a readonly `presets` array and remove private premium filtering.
- [ ] Leave lighting, overlay state, provenance, opacity, ordering, map packs, and reference maps unchanged.
- [ ] Do not add visual preview assets/cards yet if that creates unrelated CSS/snapshot churn; this phase fixes authority and vocabulary first.
- [ ] Run:

```bash
PATH=/root/.n/bin:$PATH npx vitest run \
  tests/components/layers-sheet-v2.test.tsx \
  tests/unit/map-experience.test.ts \
  tests/unit/planner-map-renderer.test.ts
PATH=/root/.n/bin:$PATH npm run typecheck
PATH=/root/.n/bin:$PATH npm run lint
```

- [ ] Commit:

```bash
git add src/components/planner/map-stage-props.ts \
  src/components/planner/PlannerShell.tsx \
  src/components/planner/PlannerMapStage.tsx \
  src/components/planner/MapStageLayerControl.tsx \
  src/components/planner/v2/LayersSheet.tsx \
  tests/components/layers-sheet-v2.test.tsx
git commit -m "refactor(map): use preset contract through planner"
```

**Value proof:** Quick and Advanced choices cannot drift, and riders see Road instead of renderer terminology.

---

## Task 6 — Migrate Rider Map Packs with bounded rollback dual-write

**Modify:**
- `src/lib/client/map-layers.ts`
- `src/lib/storage/map-pack-library.ts`
- `tests/unit/map-layer-migration.test.ts`
- `tests/unit/map-layer-settings.test.ts`
- `tests/unit/map-pack-library.test.ts`

No Dexie schema/index change is expected: the compatibility fields are ordinary object properties, not indexes.

### 6A — Red

- [ ] Test three stored generations: pre-premium (`mapStyle`), premium-wave (`experience` + optional lighting), canonical (`preset` plus rollback fields).
- [ ] Test read precedence: valid `preset` -> valid legacy `experience` -> `mapStyle` -> safe Road default.
- [ ] Test `clean -> road`, `explorer -> terrain`, `night -> road + night`.
- [ ] Test `standard -> road`, `terrain -> terrain`, `satellite -> satellite` for premium-wave `experience`.
- [ ] Test invalid canonical `preset` falls back to a valid older field rather than poisoning the row.
- [ ] Preserve `traffic -> road-controls` layer migration coverage.
- [ ] Change `AppliedRiderMapPack` assertions to canonical `preset`.
- [ ] Change `MapPackLibrary` tests to save `preset` and assert returned rows carry canonical `preset`, nearest old premium `experience`, and pre-premium `mapStyle` rollback fields.
- [ ] Explicitly test Road + Night -> `preset: road`, `experience: standard`, `mapStyle: night`.
- [ ] Explicitly test Satellite -> `preset: satellite`, `experience: satellite`; `mapStyle` remains only a coarse fallback while newer fields exist.
- [ ] Run:

```bash
PATH=/root/.n/bin:$PATH npx vitest run \
  tests/unit/map-layer-migration.test.ts \
  tests/unit/map-layer-settings.test.ts \
  tests/unit/map-pack-library.test.ts
```

and confirm red.

### 6B — Green

- [ ] Add optional canonical `preset?: MapPresetId` to `RiderMapPack`.
- [ ] Retain `experience?: LegacyMapExperienceId` and `mapStyle: LegacyMapStyleId`, documented as compatibility-only.
- [ ] Make `AppliedRiderMapPack` expose canonical `preset`.
- [ ] Implement tested read precedence using canonical registry validation and explicit legacy migration helpers.
- [ ] Change `MapPackInput` to `preset`.
- [ ] On save, dual-write `preset`, `legacyMapExperienceFor(preset)`, and `legacyMapStyleFor(preset, lightPreference)`.
- [ ] Do not eagerly rewrite/delete old rows and do not bump Dexie version unless a real IndexedDB constraint disproves the no-schema-change assumption.
- [ ] Do not change layer normalization or delete duplicate raster layers.
- [ ] Run:

```bash
PATH=/root/.n/bin:$PATH npx vitest run \
  tests/unit/map-layer-migration.test.ts \
  tests/unit/map-layer-settings.test.ts \
  tests/unit/map-pack-library.test.ts \
  tests/unit/map-preset-registry.test.ts \
  tests/unit/map-experience.test.ts
PATH=/root/.n/bin:$PATH npm run typecheck
```

- [ ] Commit:

```bash
git add src/lib/client/map-layers.ts \
  src/lib/storage/map-pack-library.ts \
  tests/unit/map-layer-migration.test.ts \
  tests/unit/map-layer-settings.test.ts \
  tests/unit/map-pack-library.test.ts
git commit -m "feat(map): migrate rider map packs to presets"
```

**Value proof:** all three saved-data generations restore deterministically without a second database or state model.

---

## Task 7 — Delete superseded runtime duplication only

- [ ] Run:

```bash
rg -n "MapExperienceId|MAP_EXPERIENCES|resolveMapExperience|standardConfigProperties|mapExperience|onMapExperienceChange" src tests
```

- [ ] Remove remaining runtime hits. Preserve `LegacyMapExperienceId`, `RiderMapPack.experience`, and explicit migration helpers as compatibility-only.
- [ ] Run:

```bash
rg -n '"Standard"|"Terrain"|"Satellite"' src/components src/lib/client
```

- [ ] Verify map-choice metadata exists only in `map-preset-registry.ts`; justify any other hits as unrelated copy rather than creating another registry.
- [ ] Run the anti-scope-creep scan:

```bash
rg -n "MapPresetId.*topo|map-visual-tokens|setStyle\(" src
```

- [ ] Confirm no Topo preset, visual-token module, or live-style swap was introduced. Also inspect the diff for any new lens state or semantic-band reducer because those may not match a single search phrase.
- [ ] Run the focused regression suite:

```bash
PATH=/root/.n/bin:$PATH npx vitest run \
  tests/unit/map-preset-registry.test.ts \
  tests/unit/map-experience.test.ts \
  tests/unit/mapbox-style-capabilities.test.ts \
  tests/unit/mapbox-config.test.ts \
  tests/unit/planner-map-renderer.test.ts \
  tests/unit/map-layer-migration.test.ts \
  tests/unit/map-layer-settings.test.ts \
  tests/unit/map-pack-library.test.ts \
  tests/components/layers-sheet-v2.test.tsx
PATH=/root/.n/bin:$PATH npm run typecheck
PATH=/root/.n/bin:$PATH npm run lint
```

- [ ] If cleanup changed files, review `git diff --name-only`, stage only the files shown by that review with explicit `git add path/to/file` commands, then commit `refactor(map): remove superseded experience contract`. Do not use `git add .`.

**Value proof:** Phase 1 ends with fewer runtime authorities; only deliberately bounded persisted-data compatibility remains.

---

## Task 8 — Acceptance, adversarial diff review, and evidence

**Create:** `docs/astra/evidence/map-system-phase0-phase1.md`

**Modify:** `docs/astra/ASTRA-STATE.md` only after verification.

### 8A — Automated acceptance

- [ ] Run focused map tests and record exact counts/results.
- [ ] Run full Vitest: `PATH=/root/.n/bin:$PATH npm test`.
- [ ] Run `PATH=/root/.n/bin:$PATH npm run lint`.
- [ ] Run `PATH=/root/.n/bin:$PATH npm run typecheck`.
- [ ] Run `PATH=/root/.n/bin:$PATH npm run build`.
- [ ] Run `PATH=/root/.n/bin:$PATH npm run test:e2e:critical`.
- [ ] Run the repository aggregate gate last: `PATH=/root/.n/bin:$PATH npm run qa:pr`.
- [ ] If any visual check fails, inspect the diff. Do not mass-update screenshots. Only a narrowly owned Road-label baseline change is expected from Phase 1.

### 8B — Adversarial diff review

- [ ] Run `git diff main...HEAD --stat` and `git diff main...HEAD -- src tests` and review the complete application/test diff.
- [ ] Confirm no routing/provider/domain files changed.
- [ ] Confirm `PlannerMapStage.tsx` changed only enough to consume the presentation contract.
- [ ] Confirm `RiderLayerSetting[]` remains the only overlay-state authority.
- [ ] Confirm no Topo preset, rider-lens state, semantic-band system, visual-token framework, new dependency, provider, or store exists.
- [ ] Confirm MapLibre rollback still compiles and canonical Road/Terrain map to sensible legacy styles.
- [ ] Confirm Road/Terrain/light share the Standard style key and Satellite alone changes style family.
- [ ] Confirm Standard emitted config includes the granular 3D intent represented by `MapPresentation`.
- [ ] Confirm Standard Satellite emitted config excludes unsupported theme/3D keys.
- [ ] Confirm saved-data read precedence and dual-write compatibility across all three generations.

### 8C — Evidence and checkpoint

- [ ] In `docs/astra/evidence/map-system-phase0-phase1.md`, record implementation start/end SHAs, production files changed, the two renderer defects proven/fixed, exact commands/results, style-key invariant, migration matrix, and explicitly deferred scope.
- [ ] Explicitly list deferred scope: Topo, semantic visual tokens, rider lenses, semantic layer bands, duplicate raster removal, presentation extraction, real-iPhone Mapbox acceptance.
- [ ] Append/update a compact map-system checkpoint in `docs/astra/ASTRA-STATE.md`; do not replace unrelated Astra history.
- [ ] Set the next task to Phase 2 **planning/review only if every Phase 1 value gate passes**. If any gate fails, name that failed gate as the next task instead.
- [ ] Stage only the evidence/checkpoint files and commit:

```bash
git add docs/astra/evidence/map-system-phase0-phase1.md docs/astra/ASTRA-STATE.md
git commit -m "docs(map): record phase 0-1 verification"
```

**Value proof:** Phase 1 is complete only when authority count is reduced, renderer claims equal emitted behavior, stored compatibility is proven, and the full PR gate is green.

---

## High-capability / cheaper-agent handoff boundary

The high-capability session completes Tasks 0–8 before handoff. The handoff package is the exact verified Phase 1 SHA, this plan, the approved design spec, and `docs/astra/evidence/map-system-phase0-phase1.md`.

Do not tell a cheaper agent to “continue improving the maps.” After Phase 1, write a separate evidence-driven Phase 2 plan for semantic visual tokens and route/cartography hierarchy. Phase 3 Topo remains unapproved until Terrain quality and distinct ADV rider value are proven. Phase 4 lenses/layer-band cleanup remains unapproved until the canonical system survives migration and usage checks.

A downstream worker executes only a subsequently approved plan. Any architectural change outside that plan escalates back to the design spec instead of becoming opportunistic cleanup.

## Expected Phase 1 end state

- [ ] Runtime map IDs are exactly `road | terrain | satellite`.
- [ ] Road/Terrain/Satellite metadata has one authority.
- [ ] Presentation is `preset + surface + lighting -> MapPresentation`.
- [ ] Standard and Standard Satellite receive only supported configuration.
- [ ] Standard granular 3D intent actually reaches Mapbox.
- [ ] Road/Terrain/light reuse the Standard style key; Satellite is the only style-family switch.
- [ ] Quick and Advanced selectors consume the same preset registry.
- [ ] Rider-facing copy says Road, not Standard.
- [ ] Existing overlay state, provenance, ordering, raster layers, route styling, routing, editing, navigation, and fetch behavior remain intact.
- [ ] Pre-premium, premium-wave, and canonical map packs restore deterministically.
- [ ] New packs dual-write bounded rollback fields without a second persistence model.
- [ ] No Topo, visual-token system, lens state, semantic-band framework, new provider, new store, or new dependency has been added.
- [ ] Full repository PR gate is green and exact evidence is recorded before Phase 2 is planned.