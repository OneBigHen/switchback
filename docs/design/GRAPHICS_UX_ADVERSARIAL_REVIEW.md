# Graphics UX Adversarial Review

## Purpose

This review records the failure-oriented pass over the graphics UX foundation in PR #83. It is a handoff document, not a claim that the primitives are already integrated into the live planner, Rides, Discover, Settings, or navigation surfaces.

The review target is the isolated foundation under `src/components/graphics/**`, the static assets under `public/visual-system/**`, and their tests. Live product integration remains intentionally deferred until the active planner and Rides branches settle.

## Scope and invariants

The foundation is required to preserve these invariants:

- factual route graphics use real route geometry rather than seeded decorative lines;
- numeric zero is distinguishable from unknown or unavailable evidence;
- unknown surface evidence is preserved rather than silently dropped;
- malformed or extreme presentation values do not emit `NaN` or `Infinity` into SVG/CSS output;
- the graphics package has no network, AI-provider, routing-provider, Mapbox, or MapLibre dependency;
- static SVG assets are self-contained and do not execute script or load external content;
- meaningful SVGs expose an accessible label and decorative SVGs are hidden from assistive technology;
- forced-colors/high-contrast users retain non-color cues;
- small graphics remain lightweight React/SVG/CSS primitives rather than introducing canvas/WebGL or a graphics runtime dependency.

## Automated attacks

The dedicated graphics tests intentionally exercise hostile and ambiguous inputs rather than only happy-path snapshots.

### Geometry

- route with 5,000 points;
- identical/degenerate coordinates;
- non-finite coordinate input;
- normalization into a bounded SVG viewport;
- verification that rendered path output does not contain `NaN` or `Infinity`.

### Evidence semantics

- explicit numeric zero;
- missing/non-finite evidence;
- unknown surface mixed with measured surface evidence;
- malformed/out-of-range normalized values;
- rider-character axes that are still unknown;
- preference before/after values outside the display range.

### Asset safety and dependency boundaries

- `<script>` and `<foreignObject>` rejection;
- embedded `<image>` rejection;
- external `href`/`xlink:href` and external CSS `url(...)` rejection;
- `javascript:` rejection;
- no `fetch` from `src/components/graphics/**`;
- no AI-provider or model imports;
- no routing-provider imports;
- no Mapbox/MapLibre imports.

### Accessibility and resilience

- meaningful route/elevation graphics receive accessible labels;
- empty labels fall back to decorative semantics rather than creating an empty announced image;
- unknown evidence remains textually distinguishable from a low/zero value;
- CSS contains forced-colors handling so important state is not color-only.

## Defects found during the adversarial pass

The review found three defects in the new test harness. None implicated the production graphics implementation, but all were corrected before handoff.

### 1. SVG namespace false positive

The initial asset-safety assertion rejected any `https://` text. That also rejected the required SVG namespace declaration (`xmlns="http://www.w3.org/2000/svg"`).

**Correction:** narrow the safety assertion to actual external reference surfaces such as `href`, `xlink:href`, and CSS `url(...)`, while continuing to reject scripts, embedded images, and `javascript:` references.

### 2. Vitest filesystem URL assumption

The first brand-asset test built filesystem paths from `import.meta.url`. In this repository's Vitest transformation, that value is not guaranteed to be a `file:` URL, causing Node `readFile()` to fail with `The URL must be of scheme file`.

**Correction:** resolve repository-owned fixture/assets from `process.cwd()`, matching the established test-suite pattern.

### 3. Documentation assertion coupled to heading capitalization

After the filesystem correction, one brand guide assertion still required the exact lowercase text `compact mark`, while the document correctly used the heading `Compact mark`.

**Correction:** make documentation-presence checks case-insensitive and semantic rather than coupling them to Markdown capitalization.

The corrected code/test head `b06fdea563b5b8058d4daae28bc9b8fb07b906fa` then passed lint, typecheck, production build, and the full Vitest suite: 334 test files passed, 2,099 tests passed, and 1 test was skipped (2,100 total). Real-router and PWA gates also passed on that head. This document is a later documentation-only commit and therefore must still receive its own exact-head CI before the PR is treated as handoff-ready.

## Invariants that held

The failure-oriented pass did not find a production graphics defect in the isolated foundation.

- Large route geometry remained finite and bounded.
- Degenerate route geometry produced a safe result instead of invalid SVG numbers.
- Unknown evidence remained semantically distinct from measured zero.
- Surface `unknown` remained visible in the distribution.
- Presentation clamping prevented out-of-range normalized values from escaping into widths/positions.
- Static visual-system SVGs remained self-contained.
- The graphics package stayed independent of network/model/router/map SDK code.
- Existing real-router, PWA, and rider-journey checks were not coupled to the new primitives because the foundation does not alter those live surfaces.

## Explicit integration boundaries

These are not defects in the foundation, but downstream work must respect them.

### Surface distributions

`SurfaceMixBar` is a presentation component. It normalizes positive supplied shares for bar width while preserving caller-provided percentage labels. The GPX/route domain layer must validate and map provider classifications into coherent `paved`, `gravel`, `dirt`, and `unknown` evidence before rendering.

Do not use the component to repair contradictory domain evidence.

### Route thumbnails

`RouteThumbnail` renders a normalized relative shape. It is not a geodesic map projection and does not imply road basemap context.

For named saved, recorded, imported, or community routes:

- feed actual route geometry;
- simplify actual geometry upstream when list payload/performance requires it;
- never generate a plausible-looking line from route ID/title and present it as factual geometry.

The renderer is O(n), so high-density lists should receive intentionally simplified preview geometry rather than thousands of points per card.

### Rider-character evidence

`RideCharacterBars` is a display contract for normalized Switchback-owned values. Learned values, evidence counts, confidence, and axis availability remain the responsibility of deterministic route-memory/domain code.

Downstream callers should provide finite evidence counts and use `null` for axes that are not supported yet. Do not turn missing learned values into zero.

### Preference edits

Before/after rider-character values visualize deterministic preference state. They must not display raw, unverified LLM output. Gravel Goblin/model output should first resolve through Switchback-owned structured intent/preferences and validation.

### Elevation

Do not synthesize an elevation sparkline from ascent/descent totals. Render the sparkline only when a real sampled elevation profile exists.

### Map-style previews

`MapStylePreview` is intentionally symbolic. It helps a rider identify Standard/Terrain/Satellite choices without baking screenshots or provider-specific tiles into the component. It is not a representation of the current Mapbox/MapLibre style.

### Static editorial art

The Gravel Goblin and other visual-system illustrations are personality/explanation assets. They are not factual map, road, surface, weather, traffic, closure, or routing evidence.

Keep important UI wording as live HTML rather than baking it into art.

## Residual risks for downstream integration

The main remaining risks are integration risks rather than foundation risks:

1. **Concurrent planner work:** PR #79 owns broad planner/mobile stabilization. Do not wire graphics into its hot paths until it settles.
2. **Concurrent Rides geometry work:** PR #66 owns route-library/Rides geometry and intelligence. Prefer its final truthful geometry contract rather than creating a second preview pipeline.
3. **Route-memory contracts:** learned rider-character values should come from the deterministic ride-memory/fingerprint layer, not from UI inference.
4. **Payload size:** Discover/Rides list previews may need server-side simplified geometry instead of full GPX payloads.
5. **Accessibility at integration sites:** the primitives expose accessible contracts, but surrounding buttons/cards must still preserve correct focus, names, and reading order.
6. **Visual regression:** do not rebaseline screenshots merely because a new primitive is introduced. First establish that the intended live layout is correct on mobile and desktop.
7. **Browser support:** `color-mix()` and forced-colors behavior are covered by the existing browser/visual CI matrix; keep those gates authoritative as styling evolves.

## Required integration order

Follow `GRAPHICS_UX_INTEGRATION_MAP.md` rather than merging a broad visual rewrite:

1. GPX Intelligence measured-evidence visuals;
2. Rides truthful route thumbnails and learned character;
3. Gravel Goblin preference-refinement visualization;
4. Settings learned ride style;
5. map-style previews and layer legends;
6. navigation/brand mark integration.

Each follow-up should preserve the owning surface's behavior tests, add focused accessibility coverage, and receive mobile visual review.

## Handoff gate

PR #83 should remain isolated/draft until:

- its final exact head is green through Quality and Mobile Core workflows;
- the final PR head receives code review;
- any Critical/Important review findings are resolved;
- active #79/#66 integration boundaries are still understood by the receiving agent.

Passing this foundation gate means the primitives and assets are safe to hand off for staged integration. It does not authorize merging them broadly into live planner/Rides surfaces in one step.
