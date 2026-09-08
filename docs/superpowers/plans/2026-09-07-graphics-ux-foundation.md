# Switchback Graphics UX Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a low-conflict, reusable graphics foundation that turns real route/evidence/preferences into lightweight accessible visuals and can be integrated after PR #79/#66 settle.

**Architecture:** Add only new graphics components, tests, docs, and brand primitives on a branch from `main`. Core visuals are inline SVG/CSS, receive deterministic data from consumers, make unknown evidence explicit, and have no dependency on AI/routing providers. Integration into planner, Rides, Discover, Settings, and map layers is documented but intentionally deferred.

**Tech Stack:** Next.js/React, TypeScript, CSS Modules, inline SVG, Vitest + existing React component test stack.

**Spec:** `docs/superpowers/specs/2026-09-07-graphics-ux-foundation-design.md`

## Global Constraints

- No new runtime dependencies.
- Do not modify planner, Rides, Discover, Settings, shell, or global design-system hot paths in this PR.
- Core graphics perform no network requests.
- Unknown evidence remains unknown; never convert missing evidence to zero.
- AI/routing providers are not imported by graphics components.
- Meaningful graphics require accessible labels; decorative graphics are aria-hidden.
- No route geometry is invented for real rides.

---

### Task 1: Shared graphics types and normalization helpers

**Files:**
- Create: `src/components/graphics/graphics-types.ts`
- Create: `src/components/graphics/graphics-math.ts`
- Test: `tests/components/graphics/graphics-math.test.ts`

**Interfaces:**
- Produces `FinitePoint`, `NormalizedPoint`, `normalizePoints`, `clamp01`, and `finiteNumber` used by later components.

- [ ] **Step 1: Write failing tests** for malformed points, degenerate spans, zero coordinates, and clamping.
- [ ] **Step 2: Run focused test** with `npx vitest run tests/components/graphics/graphics-math.test.ts` and verify RED because the modules do not exist.
- [ ] **Step 3: Implement minimal helpers** using only finite-number checks and O(n) min/max normalization into caller-supplied width/height/padding.
- [ ] **Step 4: Re-run focused test** and verify GREEN.
- [ ] **Step 5: Commit** `feat(graphics): add safe geometry normalization helpers`.

### Task 2: Route thumbnail

**Files:**
- Create: `src/components/graphics/RouteThumbnail.tsx`
- Create: `src/components/graphics/graphics.module.css`
- Test: `tests/components/graphics/route-thumbnail.test.tsx`

**Interfaces:**
- Consumes `normalizePoints`.
- Produces `RouteThumbnail({ points, label?, className? })`.

- [ ] **Step 1: Write failing tests** proving actual coordinates become an SVG path, start/finish markers exist, malformed/degenerate input never emits `NaN`/`Infinity`, and fewer than two points renders an explicit unavailable glyph.
- [ ] **Step 2: Run focused test** and verify RED because `RouteThumbnail` does not exist.
- [ ] **Step 3: Implement minimal component** with `viewBox="0 0 100 72"`, padded normalized path, start/finish circles, and accessible/decorative modes.
- [ ] **Step 4: Re-run focused test** and verify GREEN.
- [ ] **Step 5: Commit** `feat(graphics): add deterministic route thumbnails`.

### Task 3: Elevation and evidence primitives

**Files:**
- Create: `src/components/graphics/ElevationSparkline.tsx`
- Create: `src/components/graphics/EvidenceMeter.tsx`
- Create: `src/components/graphics/ConfidenceBadge.tsx`
- Test: `tests/components/graphics/evidence-graphics.test.tsx`

**Interfaces:**
- Produces `ElevationSample`, `ElevationSparkline`, `EvidenceMeter`, and `ConfidenceBadge`.

- [ ] **Step 1: Write failing tests** for reversed elevation input, flat profiles, invalid samples, quantified zero vs unknown evidence, and confidence labels.
- [ ] **Step 2: Run focused test** and verify RED.
- [ ] **Step 3: Implement minimal components**. Sort valid elevation samples by distance before normalization; unknown evidence renders visible text.
- [ ] **Step 4: Re-run focused test** and verify GREEN.
- [ ] **Step 5: Commit** `feat(graphics): add elevation and evidence visuals`.

### Task 4: Surface mix visualization

**Files:**
- Create: `src/components/graphics/SurfaceMixBar.tsx`
- Test: `tests/components/graphics/surface-mix-bar.test.tsx`

**Interfaces:**
- Produces `SurfaceKind`, `SurfaceShare`, `SurfaceMixBar`.

- [ ] **Step 1: Write failing tests** for mixed paved/gravel/unknown, totals above/below 100, invalid/negative/zero shares, and fully absent evidence.
- [ ] **Step 2: Run focused test** and verify RED.
- [ ] **Step 3: Implement minimal bar** that visually normalizes positive shares to total while displaying caller-supplied rounded percentages and patterning unknown segments.
- [ ] **Step 4: Re-run focused test** and verify GREEN.
- [ ] **Step 5: Commit** `feat(graphics): add measured surface mix visualization`.

### Task 5: Rider-character visualization and icon family

**Files:**
- Create: `src/components/graphics/RideCharacterBars.tsx`
- Create: `src/components/graphics/icons/TwistinessIcon.tsx`
- Create: `src/components/graphics/icons/SceneryIcon.tsx`
- Create: `src/components/graphics/icons/GravelIcon.tsx`
- Create: `src/components/graphics/icons/TechnicalityIcon.tsx`
- Create: `src/components/graphics/icons/ElevationIcon.tsx`
- Create: `src/components/graphics/icons/HighwayAvoidanceIcon.tsx`
- Create: `src/components/graphics/icons/index.ts`
- Test: `tests/components/graphics/ride-character-bars.test.tsx`

**Interfaces:**
- Produces `RideCharacterAxis`, `RideCharacterValue`, `RideCharacterBars` and six currentColor SVG icon components.

- [ ] **Step 1: Write failing tests** proving values clamp to 0..1, null renders `Still learning`, previous values render only when supplied, and all six axes map to a distinct icon.
- [ ] **Step 2: Run focused test** and verify RED.
- [ ] **Step 3: Implement icon family** in shared `24 x 24` currentColor viewBox with no embedded text.
- [ ] **Step 4: Implement `RideCharacterBars`** with visible labels/values and optional before→after cue.
- [ ] **Step 5: Re-run focused test** and verify GREEN.
- [ ] **Step 6: Commit** `feat(graphics): add rider-character visual language`.

### Task 6: Motorcycle and map preview primitives

**Files:**
- Create: `src/components/graphics/MotorcycleSilhouette.tsx`
- Create: `src/components/graphics/MapStylePreview.tsx`
- Test: `tests/components/graphics/visual-primitives.test.tsx`

**Interfaces:**
- Produces `MotorcycleSilhouette({ category, label? })` for four categories and `MapStylePreview({ variant, label? })` for three map-style concepts.

- [ ] **Step 1: Write failing tests** ensuring every variant renders deterministic SVG, meaningful labels work, decorative mode is aria-hidden, and variants remain distinguishable through data attributes/shape structure rather than text baked into SVG.
- [ ] **Step 2: Run focused test** and verify RED.
- [ ] **Step 3: Implement four simplified same-viewBox bike silhouettes** using currentColor.
- [ ] **Step 4: Implement three symbolic map previews** without copying real provider tile imagery.
- [ ] **Step 5: Re-run focused test** and verify GREEN.
- [ ] **Step 6: Commit** `feat(graphics): add bike and map preview primitives`.

### Task 7: Compact Switchback brand mark

**Files:**
- Create: `public/visual-system/brand/switchback-compact-mark.svg`
- Create: `public/visual-system/README.md`
- Test: `tests/components/graphics/brand-assets.test.ts`

**Interfaces:**
- Produces a static, text-free compact mark suitable for future navigation/app icon use.

- [ ] **Step 1: Write failing filesystem/content test** requiring a valid SVG viewBox, no raster/image references, no external URLs, and an explicit asset README.
- [ ] **Step 2: Run focused test** and verify RED because assets do not exist.
- [ ] **Step 3: Add compact winding-road/mountain SVG mark** and README documenting intended sizes/usage.
- [ ] **Step 4: Re-run focused test** and verify GREEN.
- [ ] **Step 5: Commit** `feat(brand): add compact Switchback visual-system mark`.

### Task 8: Integration and asset handoff documentation

**Files:**
- Create: `docs/design/GRAPHICS_UX_INTEGRATION_MAP.md`
- Create: `docs/design/GRAPHICS_ASSET_GUIDE.md`

**Interfaces:**
- Documents exact future target files and what each foundation component should replace/enhance after #79/#66 settle.

- [ ] **Step 1: Write integration map** covering GPX Intelligence, Rides, Discover, Gravel Goblin/New Ride, Settings learning profile, bike profile, map layers, navigation brand mark, and sparse mascot states.
- [ ] **Step 2: For each target, record conflict owner** (`#79`, `#66`, or independent), expected input data, fallback behavior, and visual acceptance criteria.
- [ ] **Step 3: Write asset guide** defining directory taxonomy, inline SVG vs raster rules, accessible text policy, optimization limits, generated-art policy, and semantic visual states.
- [ ] **Step 4: Commit** `docs: map graphics integration and asset conventions`.

### Task 9: Adversarial review and hardening

**Files:**
- Modify tests under: `tests/components/graphics/**`
- Create: `docs/design/GRAPHICS_UX_ADVERSARIAL_REVIEW.md`
- Modify production files only when a failing adversarial test proves a defect.

**Interfaces:**
- Produces the final evidence log and hardened foundation.

- [ ] **Step 1: Add adversarial tests** for identical coordinates, very long arrays, `NaN`/`Infinity`, all-zero surface evidence, mixed unknown evidence, out-of-range preferences, empty labels, and absence of `fetch`/AI/routing-provider imports.
- [ ] **Step 2: Run graphics test suite** and record any genuine failures.
- [ ] **Step 3: Harden only confirmed defects**, keeping public interfaces unchanged unless a test demonstrates the interface itself is unsafe.
- [ ] **Step 4: Run all focused graphics tests** until GREEN.
- [ ] **Step 5: Write adversarial review** with attacks, failures, fixes, residual risks, and deferred integration risks.
- [ ] **Step 6: Commit** `test(graphics): adversarially harden visual foundation`.

### Task 10: Repository verification and draft PR handoff

**Files:**
- No application files should change in this task.
- PR body documents verification and conflict boundary.

- [ ] **Step 1: Run/observe GitHub required checks** for branch head: lint, typecheck, Vitest, build, critical E2E, PWA, road-lock, real-router, visual where triggered.
- [ ] **Step 2: If a check fails because of foundation code, reproduce through a focused failing test where possible, fix via TDD, and rerun.**
- [ ] **Step 3: Compare changed filenames against PR #79/#66 hot files** and confirm foundation stayed isolated.
- [ ] **Step 4: Open/update draft PR** titled `feat: add Switchback graphics UX foundation` with implementation summary, verification, integration roadmap, and explicit note that live planner/Rides UX is intentionally unchanged.
- [ ] **Step 5: Leave PR draft** for visual/integration refinement after the larger branches settle.
