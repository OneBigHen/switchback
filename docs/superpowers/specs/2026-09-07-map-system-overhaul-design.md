# Switchback map system overhaul — design specification

Date: 2026-09-07
Status: proposed architecture; approved in principle, implementation requires review of this written spec
Reviewed baseline: `372995dfdcfd6e0ed2276bdbc9bb190f4514cf40`

## Executive decision

Rebuild the map presentation layer around a small number of rider-facing map presets while preserving the parts of the current implementation that already enforce useful boundaries.

Switchback is a motorcycle trip decision engine, not a GIS layer browser. The map should make route character, terrain, access context, alternatives, and the selected ride easier to judge. It should not expose implementation details or accumulate provider switches because those are available.

The overhaul will keep Mapbox GL JS v3 with Mapbox Standard / Standard Satellite as the primary online renderer under ADR 0015. MapLibre remains only the existing rollback path. We will not add another renderer, another routing provider, a plugin framework, a custom map-style platform, or a new state-management system.

Map presentation has three independent inputs:

1. **Map preset** — what the world looks like: Road, Terrain, Topo, Satellite.
2. **Surface profile** — what the rider is doing: Explore, Plan, Ride.
3. **Lighting** — Auto, Dawn, Day, Dusk, Night.

Existing rider-layer settings remain the sole overlay state. The quick Layers UI may expose **rider lenses** such as Great Roads, Dual Sport, Land & Access, and Conditions, but those are only shortcuts over existing layer settings. They do not create a second persisted overlay model.

The three presentation inputs resolve into one explicit `MapPresentation`. The renderer receives only presentation properties that its current style family actually supports. Switchback overlay styling is resolved separately through semantic visual tokens.

This is a staged replacement inside the existing app, not a greenfield map rewrite.

## Why change the current implementation

The premium map wave established a good direction, but several parts remain vibe-coded rather than contract-driven.

### Confirmed architecture defects

1. **Declared 3D profile does not match the renderer contract.** `map-experience.ts` calculates `show3dTrees`, `show3dLandmarks`, and `show3dFacades`, but `standardConfigProperties()` does not translate those values. Current unit tests prove the resolver object, not that the live renderer receives the intended presentation.
2. **Style-family capabilities are implicit.** `applyExperience()` applies one generic Mapbox configuration path to Standard and Standard Satellite. A map style family should declare what configuration Switchback is allowed to send rather than relying on shared assumptions.
3. **Terrain and Satellite have duplicate meanings.** They are both rider-facing map experiences and individual `RiderLayerId` raster overlays. A rider can choose a Satellite basemap and then enable a second satellite overlay. The same conceptual collision exists for terrain.
4. **Map choices are duplicated in UI code.** `MapStageLayerControl.tsx` and `v2/LayersSheet.tsx` independently know the map choices and labels. Adding Topo or changing a name creates immediate drift risk.
5. **Route presentation is too coarse.** `routeEmphasis: standard | bright` reduces multiple basemap/lighting conditions to one binary switch. The selected route, alternatives, traversed route, locks, and road-character overlay need a shared contrast strategy.
6. **Layer ordering exposes painter implementation.** Global Up/Down controls let users manipulate draw order even though the product requirement is simply that useful context remains visible and the route/interaction surfaces always win.
7. **Terrain is not yet a serious ADV view.** Current Terrain mostly changes DEM exaggeration, camera pitch, and atmosphere. It does not yet provide the terrain-reading hierarchy expected from a dedicated terrain/topographic map.
8. **`PlannerMapStage.tsx` owns too many concerns.** It currently coordinates renderer lifecycle, presentation, sources, rider layers, drawing, avoidance, sculpting, selection, editing, navigation, and controls. This does not justify rewriting it wholesale, but new presentation logic should not continue accumulating there.

### What the audit does *not* justify

The audit does not justify replacing the routing engine, rebuilding navigation-camera math, changing source provenance, adding a generic map framework, adding Mapbox Directions, or adopting a third renderer. Those would increase risk without fixing the identified map-product problems.

## Product goal

A rider should be able to look at Switchback and answer, with minimal configuration:

- Which route is selected?
- What makes the alternatives materially different?
- What kind of terrain and roads does this ride cross?
- Where are the useful dirt/access/condition signals?
- What should I pay attention to while actually riding?

The map should feel curated for motorcycle decisions rather than like an enthusiast GIS console.

## Non-goals

This overhaul will not:

- introduce a permanent multi-renderer architecture;
- add a new external map-data provider merely to fill out a preset;
- create one Mapbox Studio style per Switchback preset;
- adopt a plugin/provider marketplace;
- add a generic theming DSL;
- add a new persisted state model for quick overlay controls;
- redesign routing, ride intent, undo, drawing semantics, or Astra's command ownership;
- encode route selection, road surface, traffic, provider, difficulty, and confidence into one rainbow route line;
- make full-screen Mapbox pixels a stable visual-test contract;
- remove the MapLibre rollback path before Mapbox acceptance gates are satisfied.

## Preserve, rewrite, remove

### Preserve

These parts already solve real problems and should survive unless an implementation test proves otherwise:

- `PlannerMapRenderer` as the narrow renderer seam during migration;
- Mapbox Standard slots instead of basemap-internal layer IDs;
- Mapbox map-load counting and the rule that ordinary presentation changes must not create new maps;
- MapLibre misconfiguration fallback / rollback behavior;
- day-phase-based lighting resolution;
- Explore / Plan / Ride as the task-level surface model;
- `NavigationCameraController` ownership of the active ride camera;
- route source geometry plus distinct visible and hit-test layers;
- the selected-route casing/core/shadow concept;
- route sculpting, drawing, avoid-area, road-lock, and navigation behavior that is outside presentation scope;
- rider-layer settings as the sole overlay state authority;
- rider-layer provenance, freshness, coverage, loading state, and error-state information;
- existing data adapters and viewport-scoped fetch behavior.

### Rewrite

- `map-experience.ts` into a registry/resolver with one authoritative preset definition;
- Mapbox configuration translation into a capability-aware translator;
- route and overlay paint values into semantic visual tokens;
- the quick Layers UI into a visual preset selector plus rider-oriented lens shortcuts;
- global layer ordering into semantic layer bands;
- the presentation portion of `PlannerMapStage.tsx` into a focused controller/helper while leaving unrelated interaction code in place;
- persistence migration so the new preset names are explicit and deterministic.

### Remove or deprecate

- duplicated hard-coded Standard/Terrain/Satellite arrays and labels;
- the binary `routeEmphasis` abstraction after semantic visual tokens replace it;
- redundant rider-facing `terrain` / `satellite` base overlays once equivalent preset behavior is proven and migration is safe;
- arbitrary cross-category Up/Down controls;
- configuration fields that are not translated into a supported renderer operation;
- comments/tests that describe visual behavior not actually asserted at the renderer boundary.

Deletion of persisted fields or user-visible saved data requires a compatibility check first. Deprecation should precede destructive removal when old map packs can contain the field.

## Architecture

### 1. Authoritative preset registry

Create one small registry, initially `src/lib/client/map-preset-registry.ts`.

Each preset contains rider-facing metadata and presentation intent, not raw Mapbox calls:

```ts
type MapPresetId = "road" | "terrain" | "topo" | "satellite"

interface MapPresetDefinition {
  id: MapPresetId
  label: string
  description: string
  styleFamily: "standard" | "standard-satellite"
  terrainMode: "none" | "relief" | "topographic"
  baseTheme: "road" | "natural" | "imagery"
  previewKey: MapPresetId
}
```

The exact interface may change during TDD if a field has no second consumer. The important contract is one registry and no independent UI copies.

### 2. Presentation resolver

The resolver accepts:

```ts
{
  preset,
  surface,       // explore | plan | ride
  lightPreset,   // dawn | day | dusk | night
}
```

and returns one `MapPresentation` containing:

- style family;
- supported basemap intent such as labels/theme/3D-object preference;
- terrain / hillshade intent;
- atmosphere intent;
- camera default only for non-Ride surfaces;
- visual-token key;
- transition policy.

Explore can be richer, Plan reduces clutter around route comparison, and Ride is quiet. Ride camera orientation remains owned by `NavigationCameraController`; the presentation layer must not fight it.

### 3. Style-family capability translator

Create `src/lib/client/mapbox-style-capabilities.ts`.

This module owns the only translation from `MapPresentation` to Mapbox Standard configuration calls. It explicitly declares which properties Switchback sends to each style family. Unsupported properties are omitted by construction.

The renderer should not need to know why a value is omitted. Tests will assert the actual emitted property set for Standard and Standard Satellite.

This removes the current false-positive test pattern where the resolver says one thing while the renderer ignores it.

### 4. Semantic visual tokens

Create `src/lib/client/map-visual-tokens.ts`.

Tokens describe meaning rather than individual layer implementation:

- selected route core;
- selected route casing;
- selected route shadow/halo;
- alternate route core/casing;
- previewed alternative;
- traversed route;
- route proposal / changed segment;
- great-road character;
- road lock confirmed / unresolved;
- waypoint / shaping-point hierarchy;
- exclusion/access treatment.

Tokens resolve from preset + lighting + surface, with high-contrast as an accessibility modifier.

The current Switchback Ember identity remains the default selected-route cue, aligned with `docs/astra/DESIGN-SYSTEM.md`. Satellite and dark lighting may strengthen casing, halo, or emissive treatment instead of changing the semantic meaning.

No arbitrary user color theme is introduced.

### 5. Terrain presentation module

Create `src/components/planner/map-terrain-layers.ts` only when Phase 3 begins.

It owns DEM / hillshade / contour-capable presentation required by Terrain and Topo. It does not become a general layer-provider abstraction.

Road stays visually clean. Terrain emphasizes landform and depth. Topo emphasizes terrain reading and minor-road context with a flatter, more information-dense treatment. Satellite prioritizes imagery while retaining route legibility.

Contour lines are conditional scope: they ship only if they can be delivered cleanly with the already-approved Mapbox data family and acceptable attribution/performance. If that cannot be proven without adding a provider or substantial bespoke tile infrastructure, Topo first ships as a restrained terrain/hillshade/readability preset rather than inventing a new backend.

### 6. Rider lenses: shortcuts, not state

The quick Layers surface may offer four rider jobs using existing layer settings:

- **Great Roads** — direct quick control for road-character / curvature.
- **Dual Sport** — direct quick control for unpaved-road evidence, with no claim that dirt equals legal access.
- **Land & Access** — shortcut for the existing public/restricted/MVUM context layers.
- **Conditions** — shortcut for the existing closures, road-controls, and weather context layers.

The first two may remain single-layer controls; they do not need to pretend to be bundles. Land & Access and Conditions may apply several existing layer visibility settings in one action.

A lens has no ID in persisted map state and no independent enabled flag. Its selected appearance is derived from the underlying layer settings. Applying a multi-layer lens is an idempotent command over those settings. If later behavior would require ownership, overlapping membership, or a separate reducer to explain what “off” means, keep the layers individual instead of growing a new model.

Advanced settings remain the authoritative place for individual layer provenance, availability, opacity, and failure details.

### 7. Semantic layer bands

Replace arbitrary global order with fixed semantic bands:

1. relief / basemap support;
2. land and access context;
3. conditions;
4. services;
5. road character;
6. route comparison;
7. waypoints and route-edit objects;
8. critical interaction / hit-test surfaces.

The route and its interaction targets cannot be buried under user-selected raster/context overlays. If ordering remains useful inside a band, keep it only where two existing layers genuinely need it; otherwise remove ordering UI entirely.

### 8. Focused stage decomposition

Do not rewrite `PlannerMapStage.tsx` from scratch.

As presentation code is changed, extract only the portion that owns:

- applying a resolved presentation;
- reacting to preset/light/surface changes;
- applying visual tokens;
- maintaining style-family lifecycle invariants.

Drawing, sculpting, avoidance, route selection, navigation, and source fetching remain untouched unless a failing test proves a presentation coupling blocks the work.

The goal is a smaller responsibility boundary, not an arbitrary line-count target.

## Map presets

### Road

**Job:** fastest visual comprehension of roads and the selected ride.

- Mapbox Standard style family.
- Flat or nearly flat presentation.
- Restrained POIs and 3D scenery.
- Strong road hierarchy and route contrast.
- Default candidate for planning and route comparison.

**Value test:** a selected route and two alternatives remain immediately distinguishable on both urban and rural test routes without enabling extra layers.

### Terrain

**Job:** understand landform and the shape of a mountain/backroad ride.

- Mapbox Standard style family.
- DEM relief and restrained terrain depth.
- Natural land/water context.
- Richer in Explore, quieter in Plan, reduced in Ride.

**Value test:** mountain/ridge context is visibly easier to judge than Road while route endpoints and alternatives remain readable.

### Topo

**Job:** ADV / dual-sport terrain reading and minor-road context.

- Mapbox Standard style family.
- Terrain/hillshade; contour treatment only if the Phase 3 evidence gate passes.
- Less cinematic pitch than Terrain.
- Fewer irrelevant POIs, more map-reading density.

**Value test:** on an ADV-oriented route, a rider can make a materially better terrain/road-context judgment than with Terrain. If human review cannot demonstrate that distinction, Topo is removed instead of shipping a redundant fourth button.

### Satellite

**Job:** inspect real-world land cover, road context, and surroundings where imagery is informative.

- Mapbox Standard Satellite style family.
- Capability-filtered configuration.
- Stronger route casing/halo and imagery-safe overlay tokens.
- No promises that depend on unsupported Standard-only configuration.

**Value test:** route and waypoint hierarchy remain legible over bright, dark, wooded, and urban imagery.

## Surface profiles

Surface profile is not another rider-visible map choice.

### Explore

Before a route is selected, the map may show more landform/scenery/context and a useful non-zero pitch where the preset benefits from it.

### Plan

Once alternatives exist, route comparison dominates. Reduce POIs, terrain exaggeration, and visual competition. Keep enough geographic context to judge the ride.

### Ride

Navigation dominates. Reduce scenery and optional overlays. Do not animate presentation changes. Do not modify bearing/pitch in conflict with the navigation camera. Existing Ride Focus behavior stays conceptually valid but must be backed by actual applied properties.

## State and migration

New persisted preset IDs are:

- `standard` -> `road`
- `terrain` -> `terrain`
- `satellite` -> `satellite`
- legacy `clean` -> `road`
- legacy `explorer` -> `terrain`
- legacy `night` -> `road` + Night lighting

`topo` has no legacy equivalent.

Rider lenses do not participate in migration because they do not add persisted state; existing rider-layer settings remain authoritative.

Old Rider Map Packs must continue to load deterministically. During the migration window, write the nearest legacy field required for rollback compatibility where the existing pack schema still needs it. If the pack schema becomes ambiguous, version it explicitly rather than inferring from missing fields.

Migration tests must cover saved data created before and after the premium-map wave.

## Runtime and map-load economics

Mapbox map loads are a product and cost constraint. The existing map-load counter remains a first-class acceptance signal.

Road, Terrain, Topo, and lighting changes all remain on Mapbox Standard and should reuse the same map instance. Satellite changes style family; the first implementation may retain the current map reconstruction behavior rather than adding a complex live-style swap.

Do not implement in-place `setStyle` preservation machinery unless measured usage shows the additional Satellite map load is material. Complexity is not justified merely because it is technically possible.

No preset switch may cause repeated viewport-layer fetch churn through unnecessary camera movement. Existing deadband / move-event protections remain required.

## UI design

### Quick Layers surface

The quick surface should answer two questions only:

1. What map helps me read this ride?
2. What rider context should I show?

Use compact visual preview cards for Road / Terrain / Topo / Satellite rather than three identical text buttons. On narrow phone layouts, use a horizontally scrollable or 2x2 arrangement only if all controls retain a 44px touch target and the map remains visible under Astra's layout rules.

Below the map presets, show concise rider lenses. Great Roads and Dual Sport can remain direct toggles; Land & Access and Conditions can be shortcuts when grouping existing layers reduces decisions without obscuring provenance. Individual data-source controls are not duplicated here.

`Advanced map settings` retains:

- individual overlay visibility;
- opacity where it adds real value;
- data provenance / freshness / coverage;
- failures / loading / empty state;
- accessibility route-contrast option;
- saved map packs;
- reference-map tools if still useful and not conflicting with Astra task composition.

Lighting remains Advanced unless user testing demonstrates frequent intentional switching. Auto remains the default.

### Avoid false precision

The UI must not call OSM heuristics legal access, current closure truth, or carrier coverage. Existing confidence wording survives the redesign.

### Accessibility

- 44x44 minimum planning controls;
- selection encoded with shape/border/check/text, not color alone;
- selected route and meaningful overlay graphics target at least 3:1 contrast against the composited map where measurable;
- keyboard and Escape behavior in the Layers surface must remain intact;
- reduced motion removes presentation camera flights;
- route visibility High Contrast remains supported through tokens, not a separate divergent layer implementation.

## Implementation phases and adversarial value gates

Each phase can be stopped independently. A phase that cannot demonstrate its stated value does not earn the next layer of complexity.

### Phase 0 — establish truth before refactoring

**Work**

- Add renderer-boundary tests that capture actual `setConfigProperty`, terrain, fog, and camera calls for Standard and Standard Satellite.
- Add regression tests for map-instance counts across current experience / lighting switches.
- Record the current behavior of duplicate Terrain/Satellite concepts and current layer ordering.
- Capture a small visual reference set: phone + desktop, urban + mountain, Road-equivalent + Terrain-equivalent + Satellite, day + night where it changes Switchback overlays.

**Value proof**

The phase must either reproduce the identified resolver-to-renderer gaps or prove that runtime behavior already covers them through another path. No production refactor is justified by assumption.

**Stop condition**

If the suspected gaps are not real, narrow later phases to the confirmed problems only.

### Phase 1 — one source of map truth

**Work**

- Add preset registry and migration.
- Add style-family capability translator.
- Make both quick and advanced map UIs consume the registry.
- Wire the existing three experiences through the new model before adding Topo.

**Value proof**

- one authoritative preset list;
- no unsupported/unused presentation fields;
- duplicate map choice definitions deleted;
- existing saved map state restores correctly;
- no new map loads for Road/Terrain-equivalent or lighting changes.

**Stop condition**

Do not add Topo or quick lens grouping until current Road/Terrain/Satellite behavior is simpler and better specified than before.

### Phase 2 — coherent visual system

**Work**

- Add semantic visual tokens.
- Convert route ribbon, alternatives, road character, locks, and relevant map edit objects to tokens.
- Tune Road, Terrain, and Satellite against actual visual fixtures.
- Preserve Astra route hierarchy: selected route approximately 6px core with contrast casing at common planning zoom, alternatives subordinate, hit corridor independent of visible width.

**Value proof**

- selected route is legible on all three basemap families and day/night variants;
- alternatives cannot be mistaken for selection;
- high contrast is a modifier over the same semantic system;
- hard-coded duplicate palette decisions are reduced rather than multiplied.

**Stop condition**

If a token has only one consumer and does not eliminate a duplicated/risky decision, keep the value local instead of expanding the abstraction.

### Phase 3 — earn Terrain and Topo

**Work**

- Isolate terrain presentation.
- Improve Terrain with restrained relief/hillshade where supported.
- Add Topo only after the base terrain module is stable.
- Evaluate contours under the existing approved Mapbox data family before adding any data source.

**Value proof**

- Terrain and Topo must be visually and functionally distinct for motorcycle decisions on at least one mountain/ADV fixture;
- route readability must not regress;
- no new provider is required;
- map-load invariant remains intact for Road/Terrain/Topo.

**Stop condition**

If Topo does not make a materially different rider decision easier, delete it. Four choices are a ceiling, not a target.

### Phase 4 — simplify overlays around rider jobs

**Work**

- Keep Great Roads and Dual Sport as direct quick controls where bundling would add no value.
- Add Land & Access / Conditions shortcuts only if they measurably reduce first-level decisions while preserving underlying layer truth.
- Introduce semantic layer bands.
- Remove global cross-band ordering UI.
- Resolve or retire duplicate `terrain` and `satellite` raster overlay concepts after compatibility checks.

**Value proof**

- quick map UI presents fewer decisions than today;
- no second overlay state authority exists;
- all useful individual layers remain reachable in Advanced;
- route/interaction surfaces cannot be visually buried;
- no new provider or network dependency is added;
- data provenance remains truthful.

**Stop condition**

If a lens requires overlapping ownership, its own persistence, or complex enable/disable semantics, keep the underlying layers individual instead.

### Phase 5 — extract presentation ownership only where earned

**Work**

- Extract presentation lifecycle from `PlannerMapStage.tsx` as required by the preceding phases.
- Delete superseded helper branches and comments.
- Leave drawing/sculpting/navigation/source-fetch ownership alone unless a failing contract forces a narrow move.

**Value proof**

- presentation behavior can be tested without constructing the whole planner interaction surface;
- `PlannerMapStage` has fewer reasons to change for future visual work;
- no second state authority is introduced;
- existing interaction tests remain unchanged except where the user-visible contract intentionally changed.

**Stop condition**

No file split whose only success metric is line count.

### Phase 6 — adversarial QA and rollout

**Work**

- run lint, typecheck, full Vitest, build, critical E2E, PWA, road-lock, real-router, and visual gates required by protected main;
- targeted map visual checks at 390x844, 1440x900, and short landscape;
- urban + rural mountain + ADV-oriented route fixtures;
- day/night and Satellite imagery contrast checks;
- Mapbox enabled and fallback renderer states;
- network-failure / token-missing behavior;
- real iPhone check for WebGL load, battery/heat, control reachability, and Ride legibility before calling premium Mapbox acceptance complete.

**Value proof**

The redesign is not complete because snapshots are green. A human rider-oriented pass must confirm that each preset has a clear job and that the quick Layers surface is easier to understand than the previous style/layer matrix.

## Test strategy

### Unit / contract tests

- preset registry contains unique IDs and complete metadata;
- resolver produces deterministic presentation for every preset/surface/light combination;
- capability translator emits only allowed Mapbox properties per style family;
- migration covers legacy and current persisted state;
- rider-lens UI derives from and changes existing layer settings rather than introducing new state;
- semantic band order is invariant;
- visual-token resolver covers every semantic map object;
- high-contrast modifier cannot reduce selected-route width/contrast treatment;
- map-load style keys group Road/Terrain/Topo and separate Satellite.

### Renderer tests

Use a minimal fake Mapbox surface to verify the calls that matter:

- `setConfigProperty` names/values;
- terrain source/exaggeration lifecycle;
- fog lifecycle;
- no camera move when target is already satisfied;
- no presentation camera ownership in Ride;
- no unsupported style-family config;
- no extra `Map` construction for Road/Terrain/Topo/lighting changes.

### Visual tests

Do not multiply snapshots across the full Cartesian product. Curate representative states:

- Road / Plan / day with three alternatives;
- Terrain / Explore / day on a mountain route;
- Terrain or Topo / Plan on an ADV-oriented route;
- Satellite / Plan / day;
- Satellite / Plan / night or dusk;
- Ride / active navigation;
- High Contrast on the hardest basemap fixture;
- phone quick Layers surface and Advanced surface.

Pixel baselines detect changes to Switchback-owned overlays/UI. Human review decides whether Mapbox-hosted cartography is good.

### Interaction / performance checks

- route selection hit targets remain independent of visible line width;
- opening/changing Layers does not reset rider camera position unnecessarily;
- presentation changes do not refetch viewport-scoped feature layers unless the viewport actually changes;
- rapid preset changes settle to the latest choice without orphaned sources;
- token missing / Mapbox disabled falls back coherently;
- map attribution remains visible and correctly positioned in usable map area.

## Complexity budget

The following rules are part of acceptance, not suggestions:

1. No new map or routing provider in this overhaul unless a separate ADR identifies a rider decision existing data cannot support.
2. No generic provider or renderer plugin system.
3. No custom external state machine for presentation.
4. No new global store solely for map visuals; use existing persisted ownership and pure resolution functions.
5. No second persisted state model for rider lenses; existing layer settings remain authoritative.
6. No custom Mapbox Studio style per preset in the first implementation.
7. No full rewrite of `PlannerMapStage.tsx`.
8. No abstraction with speculative extension points. A module must either have at least two concrete consumers or remove an existing duplication/risk boundary.
9. No combinatorial visual-test matrix; representative evidence only.
10. No Topo-specific backend unless Topo first proves rider value and the data cannot be delivered within the accepted Mapbox family.
11. Prefer deletion after migration over maintaining old and new UI paths indefinitely.

## Failure and rollback

- Missing/invalid Mapbox capability continues to fall back rather than produce a blank map.
- A failed presentation change preserves the last usable map and route.
- Saved-state migration is idempotent.
- The rollout branch must not remove MapLibre rollback behavior.
- If a new preset causes rendering errors or substantial mobile performance regression, it can be removed from the registry without changing routing or stored ride intent.
- Quick rider lenses can be removed without migration because they do not own persisted state.

## Acceptance criteria

The overhaul is successful when all of the following are true:

- one authoritative map preset registry drives renderer resolution and both UI surfaces;
- Road, Terrain, and Satellite are at least as capable as current behavior before Topo is considered complete;
- any shipped Topo preset demonstrates a distinct ADV/topographic rider job;
- Standard vs Standard Satellite configuration is capability-aware and renderer-boundary tested;
- no presentation field exists solely as an unconsumed promise;
- Road/Terrain/Topo/light changes do not create additional Mapbox map instances;
- route visual hierarchy remains readable across the curated hard basemap fixtures;
- quick Layers exposes rider jobs without creating a second overlay state model;
- individual data provenance and failure states remain available in Advanced;
- arbitrary layer ordering can no longer bury route/interaction surfaces;
- duplicate terrain/satellite concepts are removed or intentionally documented during a bounded compatibility window;
- presentation logic stops growing inside `PlannerMapStage.tsx`;
- no new provider/framework/state-management dependency was needed;
- all protected-main automated gates pass;
- physical iPhone validation is recorded before declaring premium Mapbox rollout accepted.

## Decision record

This spec refines ADR 0015; it does not replace its core renderer decision. Mapbox Standard / Standard Satellite remain the primary online basemap family, slots remain the custom-layer contract, and MapLibre remains migration rollback only.

It also follows Astra's approved direction: one editable ride expressed through a map; quiet Ride presentation; route hierarchy and contrast are semantic; map UI must preserve usable map area; and new infrastructure must earn its rider-facing value.

If implementation discovers a conflict with those authorities, stop and amend this design/ADR rather than silently creating a competing architecture.
