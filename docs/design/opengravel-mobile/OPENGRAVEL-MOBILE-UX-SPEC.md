# OpenGravel mobile UX specification

Status: approved design direction, 2026-09-13.

Primary phone target: **390×844 CSS px**. Also validate common nearby sizes such as 393×852 and 430×932, plus the existing mobile landscape/tablet breakpoints.

The reference images are composition targets. Production values must come from live application data.

---

## 1. Shared visual system

Use existing OpenGravel tokens first. If a missing semantic token must be added, keep it close to this approved direction rather than hard-coding one-off component colors:

| Role | Approved direction |
| --- | --- |
| App/sheet background | warm cream, approximately `#FBF6EC` |
| Elevated surface | near-white warm cream, approximately `#FFFDFC` |
| Primary accent | terracotta/orange, approximately `#C94A2A` |
| Primary dark | deep forest, approximately `#173C38` |
| Muted copy | gray-green, approximately `#68736F` |
| Quiet border | warm tan, approximately `#DDCFBC` |
| Warning/estimated | muted amber, approximately `#D89A36` |

These are visual anchors, not a command to duplicate existing near-equivalent tokens.

### Layout language

- Use an 8 px spacing rhythm, with 4 px half-steps where necessary.
- Typical phone horizontal gutter: 16 px; allow 20 px on larger phones where the reference breathes more.
- Controls/cards generally use 14–20 px radii; bottom sheets/large surfaces can use 24–30 px top radii.
- Shadows are soft and restrained. Avoid the appearance of every row being a floating card.
- Use typography, spacing, and dividers for grouping before adding another border.
- Keep map controls visually light so they do not compete with route/search actions.
- Minimum interactive target: 44×44 CSS px.
- Preserve safe-area padding at the top and bottom.

### Type and iconography

Reuse the existing OpenGravel fonts and brand assets (`Inter`, `Oswald`, `OpenGravelMark`) and Phosphor icons unless a current branded primitive already exists. Headings should feel strong and editorial; utility text should remain highly legible.

---

## 2. Shared mobile navigation

Approved primary destinations:

**Plan · Explore · Saved · Record · Settings**

- `Plan`: route creation/editing/navigation preparation.
- `Explore`: map/list route discovery, including the GPX Library.
- `Saved`: rider-owned/saved/imported/recorded material according to existing data model capabilities.
- `Record`: recording/free-ride recording surface.
- `Settings`: settings/profile.

The selected tab uses terracotta emphasis and a quiet selected surface. Navigation should remain stable across the four referenced screens unless a full-screen riding mode explicitly suppresses it.

---

# 3. Planner

Reference: `reference/planner.webp`.

## Product intent

Planning should feel like manipulating geography, not filling out a form that happens to sit above a map. The map remains visible and useful through normal planning.

## Sheet behavior

Use the existing `ContextSheet` / planner detent architecture.

Recommended phone states:

- **Peek:** approximately 110–140 px of planner content above bottom navigation.
- **Planning/half:** approximately 40–55% of usable viewport depending on device height and content.
- **Expanded:** approximately 85–90%, only for explicit deeper tasks such as advanced options, long search results, advisor conversation, or detailed editing.

Normal initial planning and route-ready transitions must **not** automatically hide nearly all of the map. In the ordinary planning state, preserve roughly 45–50% useful map visibility on a 390×844 target when practical.

Map viewport insets must track the visible sheet/navigation so route fit does not disappear underneath controls.

## Default planning composition

From top to bottom inside the planning sheet:

1. drag handle,
2. request/search input,
3. mode selector,
4. compact preference summary,
5. primary CTA,
6. secondary manual-draw action,
7. concise ride state/summary,
8. compact Gravel Goblin row.

### Search/request input

Copy: **`Search a place or describe a ride`**

- Search icon/location affordance on the left as current semantics require.
- Voice affordance on the right where speech input is supported.
- Destination autocomplete and natural-language ride intent can share the presentation without creating two competing giant inputs.

### Mode selector

One segmented control:

**To | Loop | Free Ride**

- `To` maps to the current destination planning mode.
- `Loop` maps to the current loop/timebox mode.
- `Free Ride` invokes the current free-ride behavior; it is not just decorative UI.
- Selected state is terracotta with strong contrast.

Avoid a separate permanent `Free Ride` button alongside another Destination/Loop segmented control.

### Preference summary

Default collapsed example:

**`90 min · Backroads · Pavement ▾`**

The exact fields derive from current planner configuration (timebox/profile/surface/highway/gravel preferences). Tapping opens the existing detailed controls in a compact sheet/expanded region. This row summarizes state; it does not create a second source of truth.

### Primary and secondary actions

- Primary: **`Create ride`** (or a contextually equivalent current routing label while an operation is in progress).
- Secondary: **`Draw manually`**.

While routing, maintain current disabled/progress semantics and accessible status announcements.

### Ride summary

Keep compact in the default state. Example visual structure:

- **Destination ride**
- `90 min · scenic backroads`
- one quiet explanatory/status line where useful.

After results are available, the current route-choice/detail architecture still governs what appears; do not duplicate route state merely to preserve this placeholder.

### Gravel Goblin

Default presentation is a compact one-row invitation:

- mascot/avatar,
- eyebrow `GRAVEL GOBLIN`,
- **`Need a ride idea?`**,
- disclosure chevron.

Expand into the advisor experience on user intent. Do not reserve a large always-visible AI card in scarce phone space.

### Undo/redo

Undo and redo should appear contextually while a rider is editing route geometry/settings and where the operations are valid. They should not consume permanent default-planner space.

---

# 4. Explore — map mode

Reference: `reference/explore-map.webp`.

## Header and discovery controls

- Title: **`Explore routes`**.
- `Map | List` segmented presentation control; Map selected in the reference/default map experience.
- Search: **`Search routes, places, or regions`**.
- Quick chips: `Nearby`, `Gravel`, `Twisty`, `2–4 hr`, `Filters`.

Use the existing atlas/catalog filtering/search data rather than inventing a parallel collection. Map and list are two views over the same query/filter state.

## Map

Map occupies approximately 65–70% of the visual workspace before the card rail/bottom nav on the reference target.

Show:

- real OpenFreeMap/OSM-compatible geographic context via the app's current map stack,
- route geometries returned by the active filters,
- selected route in terracotta/high emphasis,
- nonselected routes in a quieter forest/gray-green treatment,
- current-location affordance where permitted,
- normal map labels, parks, water, and road context.

Avoid plotting every route at full complexity if it harms interaction; simplify geometry by zoom or use bounded result sets/clustering while preserving truthful shape.

## Route card rail

A horizontal snap carousel sits above primary navigation. One selected card is dominant, with enough of adjacent cards visible to communicate horizontal browsing.

Card hierarchy:

1. geographic map thumbnail,
2. route title,
3. distance + duration,
4. surface + character,
5. geographic area,
6. short route story/description,
7. primary `View route` action,
8. save/favorite affordance where supported.

The mockup's `Dirty Bucks Loop` data is illustrative only.

### Map ↔ card synchronization

- Selecting a map route selects/scrolls its card.
- Swiping/snapping to a new card highlights that route on the map.
- The first deliberate selection may fit/pad the route to the available map viewport.
- After the rider manually pans/zooms, do not aggressively re-fit on incidental state updates. Only explicit route selection or a clear “recenter” action should take control again.

---

# 5. GPX Library — list mode

Reference: `reference/gpx-library-list.webp`.

## Header

- Title: **`GPX Library`**.
- Dynamic catalog summary, e.g. `157 routes · 13,000+ miles` using real current counts/totals.
- Search: **`Search routes, locations, or keywords`**.
- Quick filters: `Nearby`, `Gravel`, `Duration`, `Difficulty` (or the closest truthful catalog concepts available).
- `Map | List` presentation toggle, List selected.

Existing atlas/search/region/time/curvature capabilities should be retained even if some live under `Filters` rather than remaining permanently visible.

## Route cards

Phone cards use a visually rich but compact geographic layout. Approximate target proportion: map preview 44–48% of card width, route information 52–56%.

Each card should prioritize:

- cleaned display name,
- distance,
- estimated/known duration,
- surface mix or surface evidence state,
- rider-facing character/difficulty/scenery labels,
- geographic area,
- concise route story when available,
- saved state.

Raw mapped-turn counts and other diagnostic/analyzer metrics are secondary details, not the leading reason to choose a route.

## Geographic thumbnails

**Abstract route-shape art is not acceptable for route discovery.**

Each preview must communicate where the ride is. It should contain:

- a real basemap,
- actual route geometry,
- route bbox fit with approximately 12–15% visual padding,
- start/finish markers where they improve comprehension,
- useful labels such as towns, parks, major water, or roads supplied by the basemap,
- the OpenGravel route styling used consistently across cards.

### Performance constraint

Do not mount a live MapLibre/Mapbox map for every result card. Prefer a deterministic cached/static preview system, for example:

`route geometry + padded bbox + map style version + preview size -> cached preview asset`

Provide at least small and medium density/size variants appropriate for list cards and richer selected cards. WebP/AVIF or equivalent efficient formats are preferred where compatible with the build/deployment pipeline.

If a runtime lightweight renderer is chosen instead of pre-generated images, it must demonstrate equivalent scrolling, memory, and network behavior with the full catalog.

---

# 6. Route details

Reference: `reference/route-details.webp`.

## Header

Compact mobile header:

- back,
- `Route details`,
- share,
- overflow.

## Hero map

The hero occupies roughly 35–40% of the target phone viewport before the content sheet begins.

Use the actual route:

- geometry,
- bbox,
- start,
- end,
- geographic labels/basemap,
- map controls appropriate for this detail context.

The current dark-grid generic route poster is removed from the primary route-detail experience. Poster-generation code may remain for other explicit poster/share use cases; it must not masquerade as geographic discovery.

## Decision surface

Immediately below the map:

- optional route-size/character eyebrow such as `BIG RIDE` when derived truthfully,
- cleaned display title,
- region/riding area,
- compact stat row,
- primary/secondary actions.

Reference stat row:

- distance,
- estimated/known time,
- ride character/twistiness,
- surface state + confidence.

Primary CTA: **`Open in Planner`**.
Secondary: **`Save`**.

The meaningful route decision data should be visible with minimal scrolling on a standard phone.

## Highlights

Rider-facing chips can include concepts such as:

- creek crossings,
- scenic,
- ADV-friendly,
- quiet roads,
- gravel-heavy,
- technical,
- remote.

Only show tags supported by route/catalog evidence. Do not manufacture them from the design example.

## Elevation

Show a compact elevation chart when elevation data is available, with total climb/ascent nearby. Reuse existing elevation primitives/data where possible.

If elevation is unavailable, use an intentional unavailable state rather than fake chart values.

## Track/data confidence

Make confidence visible but not alarmist. Example:

**Track confidence**  
`Lower confidence. This track has some GPS gaps or may follow unmapped roads.`

Technical counts/diagnostics can live behind `Learn more` / a lower detail section.

---

# 7. Naming and provenance

Imported filenames are provenance, not automatically product titles.

Maintain separate concepts where the current model allows them:

- original/imported filename,
- cleaned/generated display title,
- explicit user-edited/public title.

Precedence for display should be:

1. explicit user/public title,
2. high-quality existing catalog display title,
3. cleaned/generated fallback,
4. original filename only as final fallback.

Example:

`Green Lane-NJ-Bucks-Creek-Crossing-TRACK-CORRECTED`

may display as:

**`Green Lane → Bucks Creek Crossing`**

while retaining the original name in provenance/technical details.

Do not use an LLM request at render time to name route cards.

---

# 8. Evidence/confidence language

Use a small consistent evidence vocabulary anywhere the UI displays inferred route properties:

### Verified

Use for direct/strong matched evidence supported by the current data contract.

### Estimated

Use for values derived from map matching, inference, sampling, or incomplete evidence.

### Unknown

Use when the property has not been evaluated or cannot be supported.

Rules:

- Never style unknown as verified.
- Do not show a precise gravel percentage when the underlying evidence does not support one.
- A high-confidence twistiness metric must not imply high-confidence surface evidence; confidence is metric-specific.
- Explain lower-confidence track integrity when gaps/unmapped portions materially affect interpretation.

---

# 9. Accessibility and interaction quality

- WCAG AA contrast for text and essential controls.
- 44×44 px minimum touch targets.
- Visible keyboard focus.
- Correct button/tab/slider/combobox semantics; avoid clickable generic divs.
- Sheet drag/expand controls remain operable without touch dragging.
- Search/autocomplete remains keyboard and screen-reader operable.
- Announce asynchronous routing/status changes through the existing live-region patterns.
- Announce route selection changes in Explore without flooding the screen reader during map movement.
- Respect `prefers-reduced-motion`; no required information may depend on animation.
- Map/canvas content must have useful accessible alternatives/labels for the selected route and key state.
- Preserve safe areas and avoid placing actions under browser/PWA home indicators.

---

# 10. Responsive behavior

The four references are authoritative for compact phone composition.

For tablet/desktop:

- preserve the current adaptive workspace concepts and preview/detail affordances where they are stronger than simply stretching the phone layout,
- retain useful split-map/rail behavior,
- do not create a second unrelated design system,
- keep the same data hierarchy and evidence semantics,
- avoid regressions in short landscape layouts covered by existing tests.

---

# 11. Acceptance criteria

A reviewer should be able to answer **yes** to all of these:

1. Does the default phone planner clearly look like the planner reference, with the map still visible and useful?
2. Are `To`, `Loop`, and `Free Ride` one understandable mode family?
3. Is the GPX/Explore experience recognizably map-first rather than a file browser?
4. Does every primary route preview show geography, not merely a line silhouette?
5. Does route detail begin with the real route on a real map?
6. Are map/card/list selections all backed by the same real route records?
7. Are surface/confidence labels truthful when data is missing or inferred?
8. Is the new bottom-navigation model consistent?
9. Do planner recovery, routing, free ride, and saved-state behaviors still pass existing tests?
10. Do 390×844 screenshots for all four target states match the approved references in hierarchy and proportions without screenshot-specific hard-coding?
