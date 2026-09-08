# Graphics UX Integration Map

This document is the handoff map for applying the graphics foundation after the active stabilization/library branches settle. The foundation lives in `src/components/graphics/**` and is intentionally independent of live planner state.

## Sequencing rule

1. Merge or otherwise settle the pre-beta planner stabilization work in PR #79.
2. Merge or settle the Rides intelligence work in PR #66 and the Gravel Goblin route-memory work built on top of it.
3. Rebase this foundation branch/PR if needed.
4. Integrate one surface at a time, preserving its existing behavioral tests.
5. Add visual regression coverage only after the component behavior is proven.

Do not merge a broad "graphics everywhere" follow-up. The integration work should be split into small surface-level PRs so route correctness and mobile layout remain reviewable.

---

## 1. GPX Intelligence — highest-value first integration

**Target file:** `src/components/planner/GpxIntelligencePanel.tsx`

**Conflict owner:** PR #79 does not currently appear to own this file directly, but treat planner integration as post-#79 because adjacent layout/global styles are changing.

**Foundation components:**

- `ElevationSparkline`
- `SurfaceMixBar`
- `EvidenceMeter`
- `ConfidenceBadge`

**Inputs already available:**

- `report.distanceMeters`
- `report.durationMinutes`
- `report.elevation`
- `report.surface.distribution`
- `report.roadClasses.distribution`
- `report.match.matchPercent`
- `report.match.unmatchedPercent`
- `report.dataConfidence.level`

**Integration behavior:**

- Keep the existing measured-track text and evidence list.
- Add a compact visual summary above the long-form evidence.
- Only show `ElevationSparkline` if a real elevation profile is available from the intelligence pipeline; ascent/descent totals alone are insufficient to invent a profile.
- Convert surface distribution keys into `paved/gravel/dirt/unknown` only through an explicit mapping function in the GPX domain layer; unknown provider classifications must remain `unknown`.
- Convert match percentages to 0..1 only after checking for `null`.

**Fallback:** Existing textual report remains complete if no graphic can be rendered.

**Acceptance:** A rider can distinguish `0% unmatched` from `unmatched not quantified`, and no chart implies evidence that the report does not actually contain.

---

## 2. Rides library — route identity and learned character

**Target files:**

- `src/components/rides/RideListRow.tsx`
- `src/components/rides/RidesSurface.tsx`
- any route-memory details component introduced by PR #66/#81

**Conflict owner:** PR #66 currently modifies these files and already adds route geometry preview work. Do not integrate until that branch is resolved.

**Foundation components:**

- `RouteThumbnail`
- `RideCharacterBars` or a future compact wrapper around it
- `ConfidenceBadge`

**Inputs expected after #66:**

- stored route geometry (`Coordinate[]`)
- route-library region/road identity
- route fingerprint/learned character when available
- evidence counts

**Integration behavior:**

- Prefer `RouteThumbnail` over seeded decorative `RouteGraphic` when truthful geometry exists.
- Preserve the seeded `RouteGraphic` fallback when geometry is unavailable.
- Never fabricate a route thumbnail from route ID or route title for an actual saved/recorded ride.
- Use compact character rows only for axes backed by measured/learned data.
- `null` axes visibly say `Still learning` in expanded details rather than becoming 0.

**Acceptance:** Two rides with similar names but different geometry become visually distinguishable, and an unavailable fingerprint does not look like a low-scoring ride.

---

## 3. Discover / Community Atlas — actual route shapes instead of text-only cards

**Target file:** `src/components/discover/DiscoverDestination.tsx`

**Conflict owner:** currently independent from #79/#66, but wait until route payload/API shape is settled if community geometry is not yet returned in list summaries.

**Foundation component:** `RouteThumbnail`

**Data requirement:** real published route geometry or an intentionally stored simplified preview geometry. `routeFingerprint` alone is not enough to draw a truthful line.

**Integration behavior:**

- Add a small geometry preview at card top/left when real geometry is included in the API payload.
- Do not generate a decorative route line for a named public route.
- Keep the current provenance, distance, duration, title, and description prominent.
- If list payload size becomes a concern, add a server-side simplified preview geometry rather than shipping full GPX coordinates for 24 cards.

**Acceptance:** Route cards gain identity without adding stock photography or misleading map imagery.

---

## 4. Gravel Goblin / New Ride — make AI edits inspectable

**Likely target files after #79/#80/#81 settle:**

- `src/components/planner/v2/PlanComposer.tsx`
- `src/components/planner/v2/RideAdvisor.*`
- the final route-preference/ride-memory UI component

**Conflict owner:** PR #79 modifies `PlanComposer` and advisor layout. PR #80/#81 own preference/memory contracts. Do not integrate before those contracts settle.

**Foundation component:** `RideCharacterBars`

**Inputs:** final Switchback-owned normalized preference vector, not raw model output.

**Integration behavior:**

- Show a six-axis summary only when the rider opens AI/refinement detail; do not crowd the primary search row.
- When Goblin requests a deterministic preference edit, pass `previousValue` and current value so the rider sees e.g. `65 → 80`.
- Unmentioned axes should not animate/change.
- History-derived defaults are visually distinguished from explicit current-ride edits by surrounding copy/state, not by changing the numeric component contract.

**Acceptance:** The rider can see exactly what “more curves, less gravel” changed before/after route generation.

---

## 5. Settings — inspectable learned rider style

**Target files:**

- `src/components/settings/SettingsDestination.tsx`
- `src/components/settings/SettingsSurface.tsx` or a new focused `LearnedRideStyleCard.tsx`

**Conflict owner:** independent of #66 implementation code but depends on route-memory contracts from #81.

**Foundation components:**

- `RideCharacterBars`
- `ConfidenceBadge`

**Integration behavior:**

- Place `Your Ride Style` immediately under `Learn from my rides` or in a linked detail section.
- Show supporting ride counts.
- Keep unsupported axes as `Still learning`.
- Add `See rides that taught Switchback this` only after a deterministic supporting-ride query exists.
- Keep reset/export controls in existing advanced data settings.

**Acceptance:** Personalization is inspectable and reversible rather than mysterious.

---

## 6. Bike profile — coherent silhouette family

**Target files:**

- `src/components/planner/BikeProfilePicker.tsx`
- `src/components/settings/SettingsSurface.tsx`

**Conflict owner:** planner variant should wait for #79; Settings can be integrated separately.

**Foundation component:** `MotorcycleSilhouette`

**Integration behavior:**

- Replace `Wind`/`Gauge` metaphors for Adventure/Dual-sport with the correct category silhouette.
- Keep real capability text and toggles; silhouettes are supplemental.
- Do not create specific make/model artwork because routing policy is category/capability based.

**Acceptance:** Street, Touring, ADV, and Dual Sport are visually differentiated without implying exact bike geometry or brand.

---

## 7. Map style/layers — preview what the choice means

**Target files:**

- `src/components/planner/v2/LayersSheet.tsx`
- `src/components/planner/MapStageLayerControl.tsx`

**Conflict owner:** PR #79 touches map/planner presentation broadly; wait until it settles.

**Foundation component:** `MapStylePreview`

**Integration behavior:**

- Add symbolic thumbnail above/beside `Standard`, `Terrain`, `Satellite` labels.
- Keep these clearly stylized previews rather than screenshots of provider tiles.
- Later add compact SVG legend glyphs for curvature, unpaved, closures, road controls, preferred/required roads, and excluded areas using the same `currentColor`/shape conventions.

**Acceptance:** A rider can choose a map style by sight while the control remains correct if exact provider styling changes.

---

## 8. Navigation brand mark

**Target file:** `src/components/shell/AppNavigation.tsx`

**Conflict owner:** not currently listed in #79 hot files, but navigation changes should be visually verified across desktop/mobile.

**Asset:** `public/visual-system/brand/switchback-compact-mark.svg`

**Integration behavior:**

- Replace the current one-off inline mark only after checking contrast at all nav sizes.
- Keep `Switchback` and `Motorcycle routing` as live text.
- For inline theming, either convert the compact mark into a React SVG component or provide a monochrome variant; do not rely on CSS filters against the colored static file.

**Acceptance:** Brand identity improves without reducing nav readability or increasing layout width.

---

## 9. Sparse Gravel Goblin personality

**Potential target surfaces:**

- Rides first-use/empty learning state
- learned-profile explanation
- advisor welcome/detail
- AI model/settings explanation

**Do not use mascot art in:**

- provider outage/error banners
- closure/access/safety warnings
- active navigation controls
- map layer controls
- every route card
- every AI message

**Acceptance:** Goblin feels like a recognizable guide rather than decorative noise.

---

## Suggested follow-up PR sequence

1. `feat(gpx): visualize measured ride intelligence`
2. `feat(rides): add truthful route thumbnails and learned character`
3. `feat(ai): visualize Gravel Goblin preference refinements`
4. `feat(settings): expose learned ride style`
5. `feat(map): add map-style previews and layer legends`
6. `feat(brand): apply compact Switchback identity`

Each follow-up should include mobile screenshots, accessibility assertions, and no snapshot rebaseline until behavior/layout is independently reviewed.

---

## Landed state (integration wave, 2026-09-08)

Recorded at the point PR #83 merged, so the next agent does not have to
re-derive which primitives are live.

**Wired at merge**

- `MotorcycleSilhouette` → `BikeProfilePicker` (section 6). Replaces the
  `Motorcycle`/`Wind`/`Gauge` metaphors, which did not distinguish the four
  routing bike categories the router actually supports. Not covered by a
  visual baseline: the picker only mounts while the Ride options disclosure
  is open, which no visual spec expands.

**Wired by the Rides intelligence work in the same wave**

- `RouteThumbnail` — the single route-preview authority for ride library
  cards. It supersedes the separate `RouteGeometryPreview` drafted on the
  Rides branch; that component was deleted rather than kept in parallel.
- `SurfaceMixBar`, `ElevationSparkline`, `ConfidenceBadge`, `EvidenceMeter`,
  `RideCharacterBars` and the rider-character icons — fed from deterministic
  `RideFacts`, never from model output.

**Corrections applied during integration**

- `RouteThumbnail` projects longitude by `cos(mean latitude)`. Plotting raw
  degrees stretched every route horizontally by about 1.31x at Pennsylvania
  latitudes, so the drawn shape was not the shape the rider rode.
- `SurfaceMixBar` renders an explicit `unmeasured` remainder when the
  supplied shares do not total the whole route. It previously rescaled
  partial evidence to fill the bar, which drew missing evidence as certainty.
- `RideCharacterBars` no longer renders "1 rides".

**Still unconsumed**

- `MapStylePreview` — intended for the map preset picker (section 7).
- `public/visual-system/illustrations/*.svg` — an asset library with a
  README, deliberately kept ahead of its surfaces.
