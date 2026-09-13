# OpenGravel mobile redesign

This directory is the design source of truth for the map-first mobile redesign approved on 2026-09-13.

The goal is not a loose inspiration pass. The implementation should reproduce the information hierarchy, proportions, navigation model, map prominence, control density, and visual character shown in the references while binding them to real OpenGravel state and data.

## Visual references

These are repository-optimized review copies of the approved 941×1672 concepts. They are intentionally downsampled to keep the repository light; their composition and hierarchy are authoritative, not the literal raster pixels.

### 1. Planner

![OpenGravel planner reference](./reference/planner.webp)

### 2. Explore — map mode

![OpenGravel Explore map reference](./reference/explore-map.webp)

### 3. Route details

![OpenGravel route details reference](./reference/route-details.webp)

### 4. GPX Library — list mode

![OpenGravel GPX Library list reference](./reference/gpx-library-list.webp)

## Read in this order

1. [`CLAUDE-BUILD-BRIEF.md`](./CLAUDE-BUILD-BRIEF.md) — execution contract and non-negotiables.
2. [`OPENGRAVEL-MOBILE-UX-SPEC.md`](./OPENGRAVEL-MOBILE-UX-SPEC.md) — detailed screen, interaction, data, responsive, and accessibility requirements.
3. [`../../plans/2026-09-13-opengravel-mobile-ux-redesign.md`](../../plans/2026-09-13-opengravel-mobile-ux-redesign.md) — task-by-task implementation plan tied to the current repository.

## Source-of-truth precedence

When requirements appear to conflict, use this order:

1. **Approved visual references** for layout, hierarchy, density, relative sizing, map prominence, and visual direction.
2. **UX spec** for interaction behavior, real-data rules, responsive behavior, accessibility, confidence semantics, and edge cases.
3. **Existing production state/API contracts** for routing correctness, persistence, planner identity, recovery, and data semantics.

The design must never be reproduced by hard-coding the sample route names, distances, map locations, or statistics shown in the concepts.

## Non-negotiable product principles

- **The map is the product.** Normal planner and discovery states must preserve useful geographic context.
- **Real geography replaces abstract GPX art.** Route cards and route details must show a basemap plus the actual route geometry.
- **Do not fork the planner state model to make the mockup easier to reproduce.** Reuse the existing store, `ContextSheet`, routing, checkpoint, and presentation boundaries.
- **Do not render a live MapLibre/Mapbox instance for every library card.** Use a cacheable/static geographic preview strategy or equivalent lightweight rendering.
- **Do not fabricate confidence.** Unknown and estimated route properties must look and read differently from verified data.
- **Keep the existing adaptive desktop/tablet experience viable.** These references are the phone source of truth, not permission to regress larger viewports.
- **Use the existing OpenGravel design tokens, icon system, typography, and brand assets where possible.** Extend them only when the design genuinely needs a missing primitive.

## Definition of done

A build is not done because the four screens merely contain the same controls. At minimum:

- the phone layouts visually match the references at the target viewport,
- the maps display real route/geographic data,
- map and card selection stay synchronized,
- the planner's existing routing/recovery/free-ride behavior still works,
- keyboard, screen-reader, safe-area, and reduced-motion behavior remain correct,
- the existing test suite and required PR quality gates are green,
- no console/runtime errors are introduced.
