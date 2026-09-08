# Switchback Graphics UX Foundation Design

## Purpose

Create a reusable visual-information system for Switchback that makes route character, GPX evidence, rider learning, bike capability, and map choices easier to understand without turning the product into an illustration-heavy UI.

This work must remain low-conflict with the active pre-beta stabilization work in PR #79 and the route-library work in PR #66. The first PR therefore creates an isolated graphics foundation almost entirely through new files. Existing planner, map, rides, and global design-system files are explicitly out of scope for this PR.

## Product principles

1. **Data before decoration.** Route geometry, elevation, surface evidence, confidence, and learned preferences should be visualized from real data whenever possible.
2. **Personality is sparse.** Gravel Goblin appears at high-value moments such as onboarding, learned-profile explanations, and AI guidance, never as a replacement for safety, routing, or navigation controls.
3. **Unknown stays unknown.** Missing evidence is rendered as unavailable/unknown rather than converted into a zero value or implied preference.
4. **AI never owns route truth.** Graphics display deterministic Switchback data contracts. They never imply that a model generated or verified route geometry.
5. **Accessible without color.** Every semantic state has text, shape, pattern, or label support in addition to color.
6. **Mobile-first and lightweight.** Core graphics are inline SVG/CSS and should not require network fetches or large raster assets during ordinary planning.
7. **No new graphics framework.** React, CSS modules, and SVG are sufficient.

## Conflict boundary

PR #79 currently modifies planner shell/composer/map rendering/global visual CSS. PR #66 modifies Rides intelligence. This foundation PR must not modify those hot files.

The following paths are therefore excluded from this PR unless a build fix makes a one-line change unavoidable:

- `src/components/planner/**`
- `src/components/rides/**`
- `src/components/discover/**`
- `src/components/settings/**`
- `src/components/shell/**`
- `src/app/styles/design-system.css`
- `src/app/styles/tokens.css`
- `src/app/styles/planner-command-surface.css`
- `src/app/styles/rider-glanceability.css`
- route-library domain contracts owned by PR #66

Integration into those surfaces belongs in a follow-up PR rebased after the stabilization/library branches settle.

## Foundation structure

```text
src/components/graphics/
├── RouteThumbnail.tsx
├── ElevationSparkline.tsx
├── SurfaceMixBar.tsx
├── RideCharacterBars.tsx
├── EvidenceMeter.tsx
├── ConfidenceBadge.tsx
├── MotorcycleSilhouette.tsx
├── MapStylePreview.tsx
├── graphics-types.ts
├── graphics.module.css
└── icons/
    ├── TwistinessIcon.tsx
    ├── SceneryIcon.tsx
    ├── GravelIcon.tsx
    ├── TechnicalityIcon.tsx
    ├── ElevationIcon.tsx
    ├── HighwayAvoidanceIcon.tsx
    └── index.ts

public/visual-system/
├── README.md
└── brand/
    └── switchback-compact-mark.svg

tests/components/graphics/
├── route-thumbnail.test.tsx
├── evidence-graphics.test.tsx
├── ride-character-bars.test.tsx
└── visual-primitives.test.tsx

docs/design/
├── GRAPHICS_UX_INTEGRATION_MAP.md
└── GRAPHICS_ASSET_GUIDE.md
```

## Public component contracts

### `RouteThumbnail`

Purpose: produce a recognizable mini route shape from actual route geometry.

```ts
export interface RouteThumbnailProps {
  points: ReadonlyArray<readonly [number, number]>
  label?: string
  className?: string
}
```

Behavior:

- Input coordinates are `[lon, lat]`.
- Non-finite points are discarded.
- Fewer than two valid points renders an explicit empty glyph rather than fabricating a path.
- Geometry is normalized into a `100 x 72` viewBox with padding while preserving aspect ratio.
- A single coordinate span on either axis is handled without division by zero.
- Start and finish markers are visually distinct.
- When `label` is provided the SVG has `role="img"` and that accessible label; otherwise it is decorative.

### `ElevationSparkline`

```ts
export interface ElevationSample {
  distanceMiles: number
  elevationFeet: number
}

export interface ElevationSparklineProps {
  samples: ReadonlyArray<ElevationSample>
  label?: string
  className?: string
}
```

Behavior mirrors route normalization: discard invalid samples, sort by distance, render no invented values, and show a neutral unavailable state for fewer than two usable samples.

### `SurfaceMixBar`

```ts
export type SurfaceKind = "paved" | "gravel" | "dirt" | "unknown"

export interface SurfaceShare {
  kind: SurfaceKind
  percent: number
}
```

Rules:

- Negative, non-finite, and zero shares are ignored.
- Values are normalized visually to their total, but labels retain the supplied percentages.
- Unknown is a first-class segment with a pattern treatment.
- Empty input produces `No quantified surface evidence`.

### `RideCharacterBars`

Provider-neutral display of bounded 0..1 rider-character axes.

```ts
export type RideCharacterAxis =
  | "twistiness"
  | "scenery"
  | "gravel"
  | "technicality"
  | "elevation"
  | "highwayAversion"

export interface RideCharacterValue {
  axis: RideCharacterAxis
  value: number | null
  previousValue?: number | null
  evidenceCount?: number
}
```

Rules:

- Clamp finite numeric values to 0..1 for rendering.
- `null` means unknown and must show `Still learning`.
- `previousValue` adds a compact before/after cue when a rider or Goblin refinement changes an explicit axis.
- The component never decides what the value should be.

### `EvidenceMeter`

```ts
export interface EvidenceMeterProps {
  value: number | null
  label: string
  detail?: string
}
```

`value` is 0..1 when quantified; `null` renders unknown. Used for provider match, map match, or evidence coverage.

### `ConfidenceBadge`

Accepts `high | medium | low | unknown`. Includes a visible word label and non-color visual differentiation.

### `MotorcycleSilhouette`

Accepts `street | touring | adventure | dual-sport`. These are intentionally simple same-viewBox SVG silhouettes, not model-specific motorcycle art.

### `MapStylePreview`

Accepts `standard | terrain | satellite`. These are symbolic preview graphics only; they do not impersonate exact Mapbox/MapLibre tiles or copyrighted map imagery.

## Icon system

The six rider-character icons use a shared `24 x 24` SVG viewBox and `currentColor` so they inherit the surrounding UI theme. They should remain legible at 20–32px and avoid gradients or image fills.

Semantics:

- Twistiness: S-curve road/trace.
- Scenery: horizon/sun/mountain composition.
- Gravel: road with pebble texture dots.
- Technicality: stepped/rough path with control marks.
- Elevation: mountain/elevation profile.
- Highway avoidance: divided-road motif crossed by a clear avoidance slash.

## Visual semantic states

Foundation components expose semantic CSS classes/data attributes but do not hard-code product meaning into arbitrary colors.

The intended integration convention is:

- **Measured / verified:** affirmative state.
- **Proposed / preference:** exploratory state.
- **Neutral navigation / informational:** neutral state.
- **Hard warning / failure:** danger state.
- **Unknown / insufficient evidence:** muted + patterned/dashed state.

Consumers must preserve text or shape cues so color is never the only signal.

## Raster/illustration policy

This PR does not require large raster illustrations to function. Generated Gravel Goblin and feature illustrations are art-direction assets and may be added in a later asset-only commit if an approved binary-upload path is available.

When raster assets are added:

- keep ordinary UI independent of them;
- WebP/AVIF is preferred for illustrations;
- transparent mascot assets should have a maximum practical source size around 1024px and be served responsively;
- no text should be baked into an illustration if the same wording must remain accessible/localizable;
- no generated image should be used as evidence for a route, road, place, or map condition.

## Integration roadmap after the foundation PR

### P0 — GPX Intelligence

Use `ElevationSparkline`, `SurfaceMixBar`, `EvidenceMeter`, and `ConfidenceBadge` in the measured GPX report. Keep the full textual evidence underneath.

### P0 — Rides library

Use `RouteThumbnail` from actual stored geometry and `RideCharacterBars`/compact variants from measured fingerprints. Do not block list rendering when geometry/intelligence is unavailable.

### P0 — Discover

Add actual route-shape thumbnails to community cards when geometry is available. Never synthesize decorative route shapes for a real published route.

### P0 — Gravel Goblin / New Ride

Expose deterministic preference-vector changes visually: for example `Curves 65 → 80`, `Gravel 45 → 30`. The LLM can request an edit; Switchback-owned state is what the component renders.

### P1 — Settings / learning

Add an inspectable `Your Ride Style` card beneath `Learn from my rides`, showing supporting ride counts and explicit `Still learning` axes.

### P1 — Bike profile

Replace semantically weak generic glyphs with the four consistent silhouettes and compact surface-capability cues.

### P1 — Map layers

Use `MapStylePreview` for Standard/Terrain/Satellite and add matching compact SVG legend glyphs for curvature, unpaved, closures, preferred/required roads, and excluded areas.

### P2 — Brand/personality

Use Gravel Goblin sparingly in onboarding, empty memory state, and explanatory AI moments. Never attach mascot art to safety alerts, provider failures, closure warnings, or active-navigation controls.

## Performance requirements

- No new runtime package dependencies.
- No canvas/WebGL for these primitives.
- Core graphics render as inline SVG/CSS.
- Route normalization should be O(n) in route points.
- Components should tolerate large point arrays, but consumers may optionally simplify geometry upstream for lists.
- No network requests from foundation components.

## Accessibility requirements

- Decorative graphics use `aria-hidden="true"`.
- Meaningful graphics accept explicit labels and expose `role="img"`.
- Unknown states include visible text.
- Charts are supplemental; measured values remain readable as text.
- No hover-only information.
- SVGs use `currentColor`/CSS and remain meaningful in forced-colors/high-contrast modes through outlines/patterns/text.

## Testing strategy

Tests use the existing React/Vitest setup and focus on behavioral contracts rather than snapshotting SVG implementation details.

Required cases:

1. Route thumbnail normalizes real coordinates and exposes start/finish markers.
2. Degenerate and malformed route geometry does not produce `NaN`/`Infinity` SVG attributes.
3. Elevation samples sort by distance and handle flat tracks.
4. Surface bar preserves unknown evidence and rejects malformed shares.
5. Ride-character values clamp safely and `null` renders `Still learning`.
6. Before/after values are only shown when supplied.
7. Evidence meter differentiates quantified zero from unknown.
8. All four motorcycle and three map-style variants render accessible deterministic SVG output.
9. All six icon components inherit `currentColor` and remain text-free.

## Adversarial review gates

Before the PR is considered handoff-ready, challenge the foundation with:

- all identical coordinates;
- longitude/latitude values of zero;
- invalid `NaN`, `Infinity`, and partial input;
- reversed elevation samples;
- all-zero surface evidence;
- surface totals over and under 100%;
- unknown evidence mixed with quantified evidence;
- preference values below 0 and above 1;
- empty labels/decorative mode;
- very long route arrays;
- high-contrast/forced-colors-compatible markup;
- assurance that no component performs fetches or imports AI/routing provider code.

## Definition of done

The branch is ready to hand over when:

- spec and implementation plan are committed;
- all listed reusable components and icon primitives are implemented through test-first commits;
- focused graphics tests are green;
- repository lint/typecheck/Vitest/build checks are green through GitHub Actions;
- an adversarial review document records what was challenged, what failed, and what was hardened;
- a separate integration map identifies exact target files and sequencing after PR #79/#66 settle;
- the draft PR clearly states that the foundation is intentionally low-conflict and does not yet change the live planner/Rides UX.