# OpenGravel mobile UX redesign implementation plan

> **For Claude/Codex:** Execute this plan against a freshly reconciled branch. Do not assume file contents or branch SHAs remained unchanged after this document was written.

**Goal:** Rebuild the OpenGravel phone planner, Explore/GPX discovery, route list, and route-detail presentation to match the approved map-first visual references while preserving the current routing, planner, persistence, GPX, and adaptive-workspace contracts.

**Architecture:** Keep the existing planner/store/domain authorities. Refactor presentation around `PlannerDeck`, the v2 plan composer, `ContextSheet`, current atlas/catalog data, and existing MapLibre/Mapbox infrastructure. Add one shared geographic route-preview path so Explore cards, GPX list cards, and route detail all derive from actual route geometry rather than decorative SVG track art. Map/List should be presentation state over one catalog/filter model.

**Stack:** Next.js 16, React 19, TypeScript 6, Zustand, MapLibre GL / Mapbox GL, Phosphor icons, CSS modules/global app styles, Vitest + Testing Library, Playwright.

**Design source:** `docs/design/opengravel-mobile/README.md` and its four reference WebPs.

---

## Task 0 — Reconcile current repository before implementation

**Files:** none.

1. Fetch and inspect the current base:

   ```bash
   git status --short
   git fetch origin --prune
   git rev-parse origin/main
   git log --oneline --decorate -12 origin/main
   ```

2. Read the current versions of all files named below. If a later PR has moved a responsibility, update this plan's path mapping before editing rather than reintroducing an obsolete component.
3. Create an isolated implementation branch/worktree.
4. Record the exact starting `origin/main` and branch SHAs in the eventual PR description.

---

## Task 1 — Lock the phone shell and navigation contract with tests

**Modify:**
- `src/components/shell/AppNavigation.tsx`
- `src/components/shell/AppShell.tsx` only if shell ownership requires it
- `src/app/styles/shell-v2.css`
- `src/app/styles/tokens.css` only for genuinely missing semantic tokens

**Create/modify tests:**
- `tests/e2e/mobile-qa/opengravel-mobile-redesign.spec.ts`

### Step 1: Write failing shell assertions

At 390×844, prove the persistent mobile navigation exposes exactly the intended primary model:

`Plan`, `Explore`, `Saved`, `Record`, `Settings`.

Also assert:

- selected destination exposes an accessible selected/current state,
- navigation remains above safe-area/home-indicator space,
- no horizontal overflow at 390 px,
- each target has a minimum 44 px hit box.

Run the focused test and confirm RED for the existing model before editing.

### Step 2: Implement the navigation mapping

Refactor the existing shell navigation rather than creating a second phone-only nav. Map existing destinations into the approved labels/ownership without dropping working routes. `Explore` should lead to route discovery/GPX browsing; `Saved` should lead to the rider library surface supported by the current app.

### Step 3: Apply shared visual primitives

Prefer existing OpenGravel tokens. Add semantic aliases only where a reusable role is missing (cream surface, terracotta action/selected state, forest primary text, muted copy, quiet border, warning/estimated state).

Do not add a new component framework.

### Step 4: Verify GREEN

Run focused Playwright + existing shell/mobile layout tests. Commit only after the new nav is accessible and non-overflowing.

---

## Task 2 — Recompose the planner without changing planner authority

**Modify:**
- `src/components/planner/PlannerDeck.tsx`
- `src/components/planner/v2/PlanComposer.tsx`
- `src/components/planner/v2/PlanModeSelector.tsx`
- `src/components/planner/v2/PlanOptions.tsx`
- `src/components/planner/v2/RideAdvisor.tsx`
- `src/components/planner/v2/GravelGoblinOpinion.module.css` as needed
- `src/app/styles/planner-deck.css`
- `src/app/styles/planner-shell.css`
- `src/app/styles/plan-v2.css`
- `src/components/planner/workspace/map-viewport-insets.ts` only if the new sheet geometry requires corrected map padding

**Preserve/reuse:**
- `src/components/planner/workspace/ContextSheet.tsx`
- existing planner store/actions and route-selection boundaries
- `src/components/planner/PlannerPresentationBoundary.ts`
- current recovery/checkpoint logic

**Tests:**
- `tests/e2e/mobile-qa/opengravel-mobile-redesign.spec.ts`
- `tests/e2e/planner.spec.ts`
- `tests/e2e/free-ride.spec.ts`
- `tests/e2e/adaptive-workspace-baseline.spec.ts`
- `tests/e2e/short-landscape-geometry.spec.ts`

### Step 1: Add RED assertions for the approved composition

At 390×844 prove the default/ready planner:

- retains a substantial visible map region (target roughly 45–50% in the normal planning state),
- exposes `Search a place or describe a ride`,
- presents one `To | Loop | Free Ride` mode control,
- presents one compact current-preferences row,
- exposes `Create ride` as primary action,
- exposes `Draw manually` as secondary,
- has a compact Gravel Goblin entry rather than a large persistent advisor card,
- does not show permanent undo/redo when no edit action is available.

Use semantic locators/data attributes rather than brittle pixel-only selectors.

### Step 2: Use current sheet detents

Adapt `PlannerDeck` / current detent override behavior so normal planning uses the medium state instead of an oversized opaque surface. Maintain existing `peek`, `half`, and expanded semantics unless current code has since renamed them.

Do not invent a new parallel sheet state machine.

### Step 3: Consolidate plan modes

Rework `PlanModeSelector` / composer presentation so destination, loop, and free ride appear as one mode family while calling the existing behaviors underneath.

The selected mode must be reflected in accessibility state and survive existing checkpoint/recovery rules where those currently apply.

### Step 4: Collapse default options

Make the normal `PlanOptions` presentation a summary such as:

`90 min · Backroads · Pavement ▾`

The detailed controls remain available on interaction. The summary is derived from the same state, not duplicated state.

### Step 5: Compact the advisor entry

Make Gravel Goblin a one-row collapsed affordance in the normal planner. Preserve the existing full advisor behavior when opened.

### Step 6: Correct map insets

Validate route fit, selected route framing, geolocation controls, and map interactions with the new sheet height. Update `map-viewport-insets.ts` only if tests demonstrate that existing inset calculations no longer match the actual occupied regions.

### Step 7: Regression verification

Run the existing planner/free-ride/recovery/short-landscape tests before moving on. Fix regressions at the presentation boundary rather than bypassing the underlying behavior.

---

## Task 3 — Make GPX/route discovery one Map/List experience

**Modify:**
- `src/app/gpx-library/AtlasBrowser.tsx`
- `src/app/gpx-library/atlas-browse.ts` only when a view-model field is genuinely missing
- `src/app/gpx-library/atlas-listing.ts` only when a view-model field is genuinely missing
- `src/app/styles/route-atlas.css`

**Create if needed:**
- `src/components/route-library/RouteLibraryMap.tsx`
- `src/components/route-library/RouteDiscoveryCard.tsx`

**Tests:**
- `tests/e2e/mobile-qa/opengravel-mobile-redesign.spec.ts`
- focused unit tests beside any new pure view-model/filter helpers

### Step 1: Write RED map/list state tests

Prove that:

- `/gpx-library` can present `Map` and `List` views,
- both views retain the same active search/filter state,
- map selection updates the selected card,
- card selection updates the selected route overlay,
- a manual map pan is not immediately undone by an unrelated state update.

### Step 2: Preserve existing atlas query semantics

Keep current search/sort/radius/ride-length/curvature/region/riding-area filtering logic. Reorganize which filters are top-level chips vs the expanded filter UI; do not silently remove capabilities.

### Step 3: Build the Explore map composition

Implement the reference hierarchy:

- `Explore routes`,
- `Map | List` toggle,
- route/place/region search,
- `Nearby`, `Gravel`, `Twisty`, `2–4 hr`, `Filters` quick chips,
- large interactive route map,
- bottom snap card rail,
- shared primary navigation.

Selected route = terracotta/high emphasis. Other returned routes = quieter forest/gray-green treatment.

### Step 4: Synchronize map and carousel deliberately

Only explicit route selection should trigger route fit after the rider has manually explored the map. Track that distinction in presentation state rather than repeatedly calling `fitBounds` from render/effect churn.

---

## Task 4 — Build one real geographic route-preview pipeline

**Inspect/reuse:**
- `src/components/graphics/RouteThumbnail.tsx`
- `scripts/build-route-atlas.mjs`
- `scripts/prepare-route-atlas.mjs`
- current atlas/catalog generated-data pipeline
- current map style/source helpers

**Create:**
- `src/components/route-library/RouteMapThumbnail.tsx` or the current architecture's equivalent shared component
- a pure helper for padded route bbox / preview specification if one does not already exist
- focused unit tests for preview-spec generation

**Potential build-time additions:**
- extend the existing atlas build/prepare pipeline only if static thumbnail generation is the selected approach

### Step 1: Write RED tests for preview geometry

Given a route geometry/bbox, prove the preview specification:

- computes a valid padded bbox,
- handles a point/degenerate bbox safely,
- uses deterministic style/version/size keys,
- distinguishes selected vs normal overlay style without changing geography,
- never substitutes an abstract normalized route silhouette for a geographic preview.

### Step 2: Choose a scalable renderer

Do **not** mount one MapLibre/Mapbox WebGL map for every list result.

Preferred shape:

`routeId + geometry fingerprint + padded bbox + map style version + preview size -> cacheable preview`

Use the current deployment/build capabilities. Pre-generated static map previews are acceptable; a low-cost runtime renderer is acceptable only if profiling proves equivalent behavior for the full catalog.

### Step 3: Produce small/medium preview variants

Support at least the list-card and selected-card/detail-summary sizes without wasteful source images. Use WebP/AVIF where appropriate.

### Step 4: Reuse the preview everywhere

Both GPX list cards and Explore carousel cards should consume the same preview contract so geographic rendering does not drift into separate implementations.

---

## Task 5 — Rebuild GPX Library list cards around rider decisions

**Modify:**
- `src/app/gpx-library/AtlasBrowser.tsx`
- `src/app/styles/route-atlas.css`
- `src/components/graphics/RouteThumbnail.tsx` only if it remains the chosen shared abstraction

**Use:**
- shared geographic preview from Task 4

**Tests:**
- `tests/e2e/mobile-qa/opengravel-mobile-redesign.spec.ts`

### Step 1: Add RED card assertions

For representative catalog fixtures, assert that a list card exposes:

- cleaned display title,
- geographic preview,
- distance,
- duration when known/estimated truthfully,
- area/region,
- surface/evidence state,
- rider-facing route character/tags,
- saved state where supported.

Turn count must not be the primary visual metadata.

### Step 2: Implement list reference proportions

At phone width target a roughly 45/55 preview-to-content split, with three information-dense cards fitting the spirit of the reference without shrinking touch targets/text below usable sizes.

### Step 3: Keep tablet/desktop atlas behavior

Retain the stronger existing tablet preview rail/split presentation where applicable rather than stretching the phone list to every viewport.

---

## Task 6 — Replace the generic route poster with a real detail map

**Modify:**
- `src/app/gpx-library/[routeId]/page.tsx`
- `src/app/styles/route-atlas.css`
- `src/components/route-library/RouteLibraryActions.tsx` where button presentation needs alignment

**Create:**
- `src/components/route-library/RouteDetailMap.tsx`

**Reuse where appropriate:**
- `src/components/graphics/ElevationSparkline.tsx`
- `src/components/graphics/ConfidenceBadge.tsx`
- `src/components/planner/RouteDataQualityPanel.tsx`
- route geometry, bbox, start, end, surface evidence, ascent/descent, route story/area fields already loaded by the page

**Tests:**
- `tests/e2e/mobile-qa/opengravel-mobile-redesign.spec.ts`
- unit tests for any new presentation helper

### Step 1: Prove the current abstract-poster experience fails the new contract

Add a route-detail test asserting the primary hero is a geographic route map and exposes actual route context. The old dark grid / “drawn from its own GPX geometry” poster should fail that assertion.

### Step 2: Add the interactive hero map

Use the page's real route geometry/bbox/start/end and current map sources. Fit with content-aware padding. Show start/end markers and normal geographic labels.

Do not remove poster-generation utilities globally if they are still used for an explicit share/poster feature; simply stop using the poster as the route-detail hero.

### Step 3: Implement the decision hierarchy

Below the hero map:

1. route-size/character eyebrow when supported,
2. cleaned title,
3. geographic area,
4. distance/time/character/surface stat row,
5. `Open in Planner`,
6. `Save`,
7. highlights,
8. elevation,
9. track/data confidence,
10. lower technical details.

### Step 4: Use evidence-aware values

If surface matching was not evaluated, show `Unknown`; if derived, show `Estimated`; only use `Verified` when current evidence supports that status.

---

## Task 7 — Harden naming, route-story, and confidence presentation

**Inspect/modify as needed:**
- `src/lib/gpx/catalog-presentation.ts`
- route-story / catalog-presentation helpers under `src/lib/gpx/`
- `src/components/graphics/ConfidenceBadge.tsx`
- `src/components/planner/RouteDataQualityPanel.tsx`

**Tests:**
- existing tests for the modified helpers; add a colocated `.test.ts` if a helper currently lacks coverage

### Step 1: Add naming cases

Cover ugly import examples including:

`Green Lane-NJ-Bucks-Creek-Crossing-TRACK-CORRECTED`

Expected rider-facing fallback:

`Green Lane → Bucks Creek Crossing`

Do not destroy the original filename/provenance.

### Step 2: Establish display-name precedence

1. explicit user/public title,
2. strong existing catalog display title,
3. deterministic cleaned/generated fallback,
4. original filename final fallback.

No render-time LLM calls.

### Step 3: Normalize evidence vocabulary

Metric-specific states: `Verified`, `Estimated`, `Unknown`. Ensure a strong curvature score cannot accidentally imply strong surface confidence.

---

## Task 8 — Visual, responsive, accessibility, and performance acceptance

**Tests/artifacts:**
- `tests/e2e/mobile-qa/opengravel-mobile-redesign.spec.ts`
- current mobile-qa screenshot/output locations used by the repository
- existing critical/PWA/real-router suites

### Step 1: Capture the four exact acceptance states

At **390×844** capture:

1. Planner — normal `To` planning state.
2. Explore — Map mode with selected route + card rail.
3. GPX Library — List mode with geographic previews.
4. Route details — geographic hero map + top decision surface.

Also spot-check 393×852 and 430×932.

### Step 2: Compare against references

Review side by side for:

- map/content ratio,
- hierarchy,
- sheet/card radii,
- gutters,
- CTA dimensions,
- type scale/weight,
- filter density,
- adjacent carousel-card peek,
- bottom-nav proportions,
- absence of unnecessary nested borders.

Do not baseline obvious layout mistakes just to make the visual test green.

### Step 3: Accessibility checks

Verify:

- keyboard navigation/focus,
- selected tabs/modes have programmatic state,
- search and autocomplete semantics,
- screen-reader route-selection announcement,
- sheet operation without drag-only gestures,
- 44 px targets,
- AA contrast,
- reduced-motion behavior,
- safe-area handling.

### Step 4: Performance checks

On a populated catalog:

- list scrolling stays smooth,
- route thumbnails do not create a WebGL context per card,
- route-map selection does not recreate the main map unnecessarily,
- generated/static previews cache correctly,
- no repeated full-catalog geometry work occurs on every render.

### Step 5: Run final gates from final HEAD

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e:critical
npm run build
npm run qa:pr
```

Run any relevant mobile/PWA/real-router/visual jobs required by current branch protection as well. Do not rely on stale green checks from an earlier SHA.

### Step 6: Prepare PR evidence

PR description should contain:

- starting and final SHAs,
- four final screenshots,
- test output summary,
- performance approach for route thumbnails,
- any deliberate visual deviation from references,
- any reference metric intentionally omitted because live data cannot support it truthfully.

Do not merge without explicit authorization.

---

# Implementation record

Executed 2026-09-13 against the plan above. What follows is what was actually
built, where it differs from the plan, and what the data could not support.

## Where the geography came from

The plan's Task 4 asked for a preview pipeline and offered pre-generated
static images or a profiled runtime renderer. Neither needed a new data
source: `scripts/build-route-atlas.mjs` projects each route's own geometry
into the poster viewBox with an **aspect-fit Mercator transform**, and stores
the route's real-world bbox beside it. That transform is invertible, so
`src/lib/routes/route-preview.ts` recovers true longitude/latitude from art the
listing already ships. The inverse is tested against the builder's own forward
maths rather than against itself.

The recovered line is the *simplified* line — jitter-filtered, RDP-reduced,
Chaikin-smoothed, rounded to a tenth of a viewBox unit. Over a 0.65-degree
route that is well under a tenth of a mile: a faithful shape at browse sizes,
not a claim of survey accuracy. Route detail, which already loads the real
geometry, draws the real geometry.

## Renderer choice

One shared off-screen MapLibre instance for the whole application
(`route-preview-renderer.ts`), serialised behind a queue, gated on visibility,
keyed by `routeId + geometry fingerprint + padded bbox + style version + size`.
Measured on the 537-route production catalog: first preview ~4s cold (style,
sprites, glyphs), then ~190ms each; one WebGL context total; zero canvases
inside route cards. Recovered geometry is memoised per row and resolution, so
re-ranking on every keystroke does not re-parse the catalog.

Where the renderer cannot run, the card shows the route's real line in its own
Mercator projection and says `Basemap unavailable`. That is deliberately not
the retired silhouette: the shape is in its true projection and the state is
stated.

## Deviations from the plan and the spec

- **Mobile-QA spec path.** The plan named
  `tests/e2e/mobile-qa/opengravel-mobile-redesign.spec.ts`. The mobile-QA
  projects only match `core/*.core.spec.ts` and the layout/visual specs, so a
  file at that path would have run in no project and guarded nothing. It lives
  at `tests/e2e/mobile-qa/core/opengravel-mobile-redesign.core.spec.ts`. A
  second spec, `tests/e2e/critical/opengravel-mobile-redesign.spec.ts`, runs in
  the PR gate at 390x844 so the contract is enforced on every PR rather than
  only on the nightly mobile matrix.
- **Destination ids renamed, not just relabelled.** `rides` became `saved` and
  `discover` became `explore`, with superseded `?tab=` values migrating through
  the door the V1 tabs already used. Leaving the code speaking a retired
  vocabulary would have been the larger cost.
- **`?open=record` added.** A page outside the app shell needs a way to hand
  the rider back to Record. `?tab=record` keeps its historical meaning (Plan,
  no overlay, no recording); `?open=record` shows the Record surface. Showing
  the panel still starts nothing.
- **The Discover destination was retired, not deleted.** Rider-published
  routes keep their own page at `/routes`; Explore links to it. The in-shell
  community browse surface is gone because Explore owns discovery.
- **Record sits in the destinations group.** The approved order puts it between
  Saved and Settings, so it shares the bar at equal weight while keeping its
  activity marking (`data-nav-cluster="secondary"`, never `aria-current`).

## What the data could not support

- **Surface percentages.** The shared listing carries no measured surface mix,
  so cards say `Surface unknown` unless a route's routing profile is adventure
  or gravel, which reads as `Gravel-capable · est`. The `Gravel` quick chip is
  offered **disabled with its reason** on a catalog with no such evidence,
  rather than enabled and always empty.
- **Elevation profile.** The catalog stores total ascent/descent, not samples
  along the line. Route detail shows total climb and its plain-language
  character, and states that a per-mile profile was not retained. No chart is
  drawn, because a flat or invented curve would read as a claim about the ride.
- **Highlight chips.** `creek crossings`, `scenic`, `quiet roads` and `remote`
  from the reference have no evidence anywhere in the import pipeline and are
  absent. What remains is derived from real fields: measured surface, curvature
  band, recorded ascent per mile, routing profile, distance.
- **`Create ride` starts disabled** in a fresh `To` planner with a start and no
  destination. That is the truthful state — there is no ride to create — and
  the line beneath says what is missing.

## Measured composition at 390x844

- Planner: sheet top at y=426, so the map keeps **50%** of the viewport.
- Explore: header 166px, map 293px, card rail 303px, navigation 68px. The map
  is **64%** of the workspace above the rail and the bar (spec: 65-70%).
- GPX Library list: three information-dense cards below the header, each with a
  geographic preview at a 45/55 preview-to-content split.
- Route detail: hero map **36%** of the viewport (spec: 35-40%).

## Reference images

The four WebP references in `docs/design/opengravel-mobile/reference/` are
**not decodable** — each is ~15KB of data with no RIFF/WebP header, identical
on origin. The build therefore followed the UX spec's explicit transcription of
those references (copy strings, element order, ratios, radii, gutters, colour
anchors). A visual side-by-side against the real references is still
outstanding and needs the images restored.
