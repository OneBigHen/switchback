# Claude build brief — OpenGravel mobile UX

## Objective

Implement the approved OpenGravel mobile redesign so the production app matches the four visual references in this directory as closely as practical without weakening existing planner, routing, persistence, GPX, accessibility, or responsive behavior.

This is a **build specification**, not a request to reinterpret the product into another aesthetic.

## Mandatory preflight

Before editing code:

```bash
git status --short
git fetch origin --prune
git rev-parse origin/main
git log --oneline --decorate -12 origin/main
```

Then reconcile the implementation branch against current `origin/main`. GitHub/current code wins over stale SHAs named in handoffs.

Read:

- `docs/design/opengravel-mobile/README.md`
- `docs/design/opengravel-mobile/OPENGRAVEL-MOBILE-UX-SPEC.md`
- `docs/plans/2026-09-13-opengravel-mobile-ux-redesign.md`

Inspect the current versions of every file named in the implementation plan before editing; the repository is active and may move after this spec lands.

## Source-of-truth precedence

1. The four visual references define visual composition, control hierarchy, map prominence, spacing relationships, and screen character.
2. The UX spec defines behavior, data semantics, accessibility, responsive behavior, confidence handling, and edge cases.
3. Existing production state/API contracts define routing correctness, planner identity, persistence/recovery, and data truth.

Do not solve a visual mismatch by breaking a state contract.

## Non-negotiable outcomes

### Planner

- Map remains the dominant spatial context.
- Mobile planning uses the existing sheet/detent architecture rather than a replacement state system.
- Main mode choice is presented as one clear `To | Loop | Free Ride` control.
- Search/request input reads as the primary entry point.
- Ride preferences collapse into one compact summary row in the default state.
- `Create ride` is the primary CTA.
- `Draw manually` is secondary.
- Gravel Goblin is compact by default and expands on demand.
- Undo/redo are contextual editing controls, not permanent top-level planner furniture.
- Normal planning must not automatically turn into a giant opaque cream surface that removes the useful map.

### Explore map

- `Explore` becomes the route-discovery destination.
- Map mode is a first-class/default discovery presentation on phone.
- Route overlays are geographic and correspond to real route records.
- A bottom horizontal route-card rail is synchronized with map selection.
- The selected route is visually dominant; nonselected routes remain visible but subdued.
- Manual map exploration must not be constantly overridden by auto-fit behavior.

### GPX Library list

- Every visible route card has geographic context.
- Replace the abstract track silhouette with a basemap + actual route geometry thumbnail.
- Cards prioritize location, commitment, surface, and ride character over diagnostic turn counts.
- List and Map are two presentations of the same filter/query state, not separate data silos.

### Route detail

- Delete the generic dark-grid route poster from the primary route-detail experience.
- Hero is a real geographic map using the route's actual GPX geometry, bbox, start, and end.
- The first viewport communicates name, location, distance, time, route character, surface confidence, and the primary action.
- Surface/data confidence is explicit: `Verified`, `Estimated`, or `Unknown` as applicable.
- Detailed diagnostics remain available lower in the page rather than dominating the decision surface.

### Shared navigation

Use the approved mobile model:

`Plan · Explore · Saved · Record · Settings`

`Explore` owns discovery/GPX-library browsing. `Saved` owns rider-owned/favorited/imported/recorded material as current product semantics allow.

## Data integrity rules

- **No screenshot-only mock data in production components.** The route names and numbers in the references are examples.
- Bind distance, duration, geometry, bbox, surface evidence, area/region, elevation, confidence, and saved state to actual app data.
- Preserve original imported filenames/metadata for provenance, but present a cleaned display title in the UI.
- Never upgrade `unknown` evidence into a confident gravel percentage or badge simply to fill the mockup.
- A missing metric should have an intentional unknown state rather than a fabricated value.

## Map implementation rules

- Reuse the existing MapLibre/Mapbox infrastructure and styles where appropriate.
- Do not instantiate ~157 live map canvases for a route list.
- Route-card previews should be lightweight and cacheable: pre-rendered/static geographic tiles, a deterministic preview renderer, or another approach with equivalent memory/network behavior.
- Preview generation must use the real route bbox with sensible padding and a stable style/version key.
- Detail and Explore map screens may use interactive map instances because they are primary map workspaces.

## Visual implementation rules

- Match the references before inventing new visual patterns.
- Favor the current OpenGravel cream / terracotta / forest design system.
- Reuse existing `Inter`, `Oswald`, OpenGravel mark, Phosphor icons, radii, and tokens where they fit.
- Do not add a UI framework just to reproduce these screens.
- Avoid excessive nested bordered cards. Use whitespace, type, and a few meaningful surface levels.
- Touch targets must remain at least 44×44 CSS px on phone.
- Respect iOS safe areas and standalone-PWA/browser viewport differences.

## Implementation discipline

Use test-driven changes for behavior and state transitions. For primarily visual work, establish or update the appropriate Playwright visual/layout assertions before accepting the final implementation.

Do not mass-rewrite working planner/domain code. Prefer presentation-layer refactors around the current store and presentation boundaries.

When an existing component already carries important semantics (for example `ContextSheet`, `PlannerDeck`, planner route-selection boundaries, route intelligence/confidence components), adapt it rather than creating a second authority.

## Required verification

At the end, run fresh checks from the final branch head. Do not report a gate as green based on an earlier SHA.

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e:critical
npm run build
npm run qa:pr
```

Also run the targeted mobile/visual tests added for this redesign, including the phone viewports defined in the implementation plan.

Capture final screenshots for all four approved states and compare them against the reference composition before calling the work complete.

## Completion report

Return:

- exact final branch/head SHA,
- files changed,
- screenshots/artifact locations for all four screens,
- test commands and exact pass/fail counts,
- known visual deviations from the approved references and why,
- any unresolved data-quality limitation that prevents a reference field from being shown truthfully,
- PR number and merge-readiness verdict.

Do not merge unless explicitly authorized.
