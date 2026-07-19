# Switchback — Deep-Dive Supplementary Audit & Reuse Research

**Date:** 2026-07-16
**Purpose:** Fine-toothed code audit, open-source reuse opportunities, and path to first-class

---

## 1. THE 5,688-LINE CSS PROBLEM — DIAGNOSIS AND FIX

### 1.1 Current State
- `src/app/globals.css` contains **722 unique CSS class selectors** and **19 `@media` blocks**
- Single file holds styles for: map stage, planner deck, waypoint fields, ride HUD, navigation, library drawer, route comparison, Spotify dock, trip stages, route evidence, weather panels, profile switches, via points, avoid areas, sketch overlay — everything
- **27 rules** for `.library-drawer` alone, **16 for `.ride-omnibox`**, **14 for `.planner-deck`` — these are scattered across the file in different `@media` blocks, making it impossible to reason about a single component's full styling without scanning the entire file
- **31 transition/animation declarations** scattered throughout with no shared utility classes

### 1.2 The Fix — CSS Module Extraction

Split `globals.css` into per-component CSS Modules (Next.js native `.module.css`):

```
src/app/globals.css           → reset, tokens, font imports only (~200 lines)
src/components/planner/PlannerDeck.module.css
src/components/planner/WaypointField.module.css
src/components/planner/RouteComparison.module.css
src/components/planner/RideHud.module.css
src/components/planner/LibraryDrawer.module.css
src/components/planner/MapStage.module.css
src/components/spotify/SpotifyPlayerDock.module.css  (already module!)
```

**Effort:** Medium (mechanical extraction, one component at a time)
**Impact:** Each file becomes self-contained, dead code is visible, tree-shaking works, IDE autocomplete works per-component.

### 1.3 Design Token Consolidation

The `:root` has 12 CSS custom properties. Components reference them directly throughout. Introduce a **token layer**:

```css
/* tokens.css */
:root {
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;  --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px;
  --radius-sm: 6px; --radius-md: 12px; --radius-lg: 16px;
  --text-xs: 10px; --text-sm: 12px; --text-base: 14px; --text-lg: 18px; --text-xl: 24px;
  --color-bg: var(--oled); --color-surface: var(--machined); --color-raised: var(--raised);
}
```

This eliminates dozens of hardcoded `padding: 7px 10px` / `border-radius: 8px` / `font-size: 12px` declarations.

---

## 2. COMPONENT ARCHITECTURE — DECOMPOSITION PLAN

### 2.1 MapStage.tsx (1,368 lines) — Split into 5

| New File | Responsibility | ~Lines |
|----------|---------------|--------|
| `MapStage.tsx` | Container + lifecycle only | 200 |
| `MapLayers.tsx` | Layer control dialog, style switch, packs | 250 |
| `MapSketch.tsx` | Sketch canvas + pointer tracking | 200 |
| `MapWaypoints.tsx` | Draggable waypoint markers | 150 |
| `MapNavigation.tsx` | Follow camera, nav features, rider position | 200 |
| `map-utils.ts` | Pure functions (feature builders, source updaters) | 300 |

### 2.2 PlannerShell.tsx (1,063 lines) — Split into 3

| New File | Responsibility | ~Lines |
|----------|---------------|--------|
| `PlannerShell.tsx` | Render orchestration only | 200 |
| `useRoutePlanning.ts` | All trip planning handlers (plan, intent, stop ideas, research) | 300 |
| `useLibraryManagement.ts` | Save/load/delete/import/export/share handlers | 250 |
| `useRideLifecycle.ts` | Start ride, reroute, recording, recovery | 200 |

### 2.3 RideHud.tsx (616 lines) — Split into 3

| New File | Responsibility | ~Lines |
|----------|---------------|--------|
| `RideHud.tsx` | Render only | 200 |
| `useRideGps.ts` | GPS session, navigation frames, recovery | 200 |
| `useRideReroute.ts` | Reroute logic, rejoin policies | 150 |
| `useRideVoice.ts` | Voice guidance pipeline | 60 |

### 2.4 PlannerDeck.tsx (678 lines, 71 props) — Simplify

The 71-prop interface is a code smell. Group into context objects:

```typescript
interface PlannerDeckProps {
  routeState: { start, finish, via, startQuery, finishQuery, armedPoint }
  planState: { profile, status, error, planMode, targetMinutes }
  featureState: { curvatureVisible, avoidHighways, savedCount, avoidAreaCount }
  intentState: { status, summary, stopIdeas, researchStatus, researchSources }
  editState: { addingVia, segmentProfiles, canUndo, canRedo }
  selectedRoute?: PlannedRoute
  handlers: PlannerDeckHandlers  // grouped action callbacks
  children?: ReactNode
}
```

---

## 3. OPEN-SOURCE REUSE OPPORTUNITIES

### 3.1 Routing Engine Alternatives

**Current:** GraphHopper (self-hosted, Java, ~good)
**Issue:** Custom motorcycle profiles require Java compilation. Maneuver sign codes are limited.

| Engine | License | Maneuver Quality | Motorcycle Support | Self-Host | Effort to Adopt |
|--------|---------|-------------------|---------------------|-----------|-----------------|
| **Valhalla** | MIT | **Best in class** — Odin narrative engine generates rich maneuver types (keep left/right, sharp/slight, fork, merge, exit, roundabout count) | Excellent — `motorcycle` costing built-in, dynamic costing at runtime | Docker, easy | Medium — swap `graphhopper.ts` for Valhalla HTTP API |
| **GraphHopper** (current) | Apache 2.0 | Good but coarse sign codes | Custom profiles require recompile | Already running | None |
| **OSRM** | MIT | Basic — only left/right/straight | Car profile only, no motorcycle | Docker | High — no motorcycle profile |

**Recommendation: Migrate to Valhalla.** Valhalla's Odin maneuver generator produces **narrative instructions** ("Turn right onto Market Street, then continue for 2 miles") rather than bare sign codes. This directly solves the maneuver type gap (Section 2.1 of main audit). Valhalla supports dynamic costing — you can change motorcycle preferences at runtime without recompiling. Docker images are available. The `valhalla-app` React frontend (MIT) has turn-by-turn UI patterns we can study/adapt.

- **Repo:** https://github.com/valhalla/valhalla (5.9k stars, MIT license)
- **Demo server:** https://valhalla.openstreetmap.de (fair-use public API)
- **Docker:** `ghcr.io/valhalla/valhalla:latest`
- **Node bindings:** `@valhallajs/valhallajs` on npm
- **API docs:** https://valhalla.github.io/valhalla/api/

### 3.2 Map Turn-by-Turn UI

**MapLibre Navigation SDK** — There was a `maplibre-gl-directions` and navigation overlay projects.

| Resource | License | What to Reuse |
|----------|---------|----------------|
| **@watergis/maplibre-gl-legend** | MIT | Map legend control for rider layers — drop in instead of custom layer dialog |
| **maplibre-gl-geocoder** (fork) | MIT | Map-mounted autocomplete search box — the Google Maps single-searchbox pattern |
| **valhalla-app** (gis-ops) | MIT | Full React + MapLibre + Valhalla demo with route line, waypoint markers, and turn-by-turn list — study and adapt patterns |

**Repo:** https://github.com/gis-ops/valhalla-app
This is the single most valuable reference. It's a MIT-licensed React app that does exactly what Switchback needs: search box → route → turn-by-turn directions → map display. We can adapt the search box component, route line rendering, and maneuver list patterns directly.

### 3.3 Geocoding Enhancement

**Current:** Photon (OSM-based, self-hosted or Komoot's public instance)
**Issue:** No business search, no POI categories for destinations, limited to OSM name matching.

| Service | License | Self-Host | Quality | Key Advantage |
|---------|---------|-----------|---------|---------------|
| **Pelias** | MIT | Docker | High | Full-text search with address parsing, POI categories,藩 autocomplete, "near me" support. Can combine OSM + Who's on First data |
| **Nominatim** | GPL | Docker | Good | Official OSM geocoder, but no autocomplete, no business category search |
| **Photon** (current) | Apache | Docker | Fair | Autocomplete works, but limited to OSM name match |
| **Addok** | MIT | Docker | Good | France-focused, address search |

**Recommendation: Add Pelias as the primary geocoder.** Pelias is MIT-licensed, Docker-deployable, and supports the exact query patterns Google Maps does ("coffee near me", "Starbucks", "gas station"). It combines OSM data with Who's on First gazetteer for superior address resolution. Has a built-in autocomplete endpoint.

- **Repo:** https://github.com/pelias/pelias (MIT, 900+ stars)
- **Docker:** `pelias/docker` repository has fullcompose setup
- **API:** `autocomplete?text=starbucks&focus.point.lat=...` — exactly the autocomplete pattern you need

### 3.4 Turn-by-Turn Maneuver Icons

**Current:** Phosphor icons (`ArrowBendUpLeft`, `ArrowBendUpRight`, `ArrowUUpLeft`, `ArrowUUpRight`, `ArrowClockwise`, `CaretUp`, `FlagCheckered`) — 7 types only.

| Resource | License | What to Reuse |
|----------|---------|----------------|
| **Mapbox Android Navigation SDK** icons | BSD-3-Clause (the OSS-era Mapbox license) | 28+ maneuver icon SVGs — slight left/right, sharp left/right, fork, merge, roundabout with exit numbers, keep left/right, ferry, etc. |
| **Valhalla Odin** maneuver types | MIT | The type system itself — `ManeuverType` enum with 28+ types |
| **maplibre-gl-directions** (community fork) | MIT | SVG maneuver arrows designed for web maps |

**Recommendation:** Extract the maneuver SVG set from a MIT-licensed source. Valhalla's Odin generates the `type` field with values like `left`, `right`, `sharp_left`, `slight_right`, `uturn_left`, `roundabout_7th_exit`, `exit_right`, `merge_right`, `fork_left`, `keep_left`, `straight` — port these as an enum and pair with SVG glyphs.

### 3.5 CSS Framework Option

**Current:** 5,688 lines of hand-written CSS with custom design tokens

| Option | License | Bundle Size | What It Gives |
|--------|---------|-------------|---------------|
| **Tailwind CSS v4** | MIT | ~10KB (purged) | Utility classes that replace 80% of the custom CSS, design tokens via `@theme`, responsive variants built-in, dark mode built-in |
| **Open Props** | MIT | ~4KB | CSS custom property design system (spacing, colors, typography, shadows) — drop-in tokens without a framework |
| **Vanilla Extract** | MIT | ~0KB (zero runtime) | Type-safe CSS Modules with TypeScript autocomplete — eliminates class name typos |

**Recommendation: Tailwind CSS v4 + Open Props.** Open Props gives you a ready-made design token system (spacing, typography, shadows, colors, animations) that replaces the hand-rolled custom properties. Tailwind v4 uses the new Oxide compiler and generates only the utilities you use. This would reduce the 5,688-line CSS file to ~500 lines of component classes + Tailwind utilities.

However — if the existing CSS is working and the team is comfortable with it, a **CSS Module extraction** (Section 1.2) is the lower-risk path. Don't rewrite working CSS just for the sake of a framework.

### 3.6 Navigation-Specific Libraries

| Library | License | Purpose | Reuse Value |
|---------|---------|---------|-------------|
| **turf.js** | MIT | Geospatial analysis (distance, bearing, along-line, buffered corridors) | Replace hand-rolled haversine/bearing in `navigation-engine.ts` and `scoring.ts` with tested, tree-shakeable turf modules. Swap `coordinateDistanceMeters` for `@turf/distance`, `segmentBearingDegrees` for `@turf/bearing`, etc. |
| **@mapbox/polyline** | BSD-3 | Encode/decode route polylines | Valhalla returns encoded polylines — needed if migrating |
| **ol (OpenLayers)** | BSD-2 | Full-featured map alternative | Not needed — MapLibre is fine |
| **cheap-ruler** | ISC | Fast geodesic math for small areas | Drop-in speed upgrade for turf on local routes (valleys, single state) |
| **suncalc** | BSD-3 | Sunrise/sunset times | Auto day/night map style switch, daylight window in trip stage planning |

### 3.7 Additional Data Sources

| Source | License | What It Provides |
|--------|---------|------------------|
| **Overpass API** (OSM) | Public domain | Live OSM data queries for POI layers (fuel, food, camping, repair) — already partially used via `map-features/osm.ts` |
| **OpenRouteService** | MIT API, fair use | Alternative routing API with motorcycle profile if Valhalla self-hosting is too heavy. Has 2,500 free directions/day |
| **Overpass Turbo** | Public domain | Query builder for testing OSM data queries |
| **NWS API** (current weather) | Public domain | Already used — keep |
| **OpenStreetMap Speeds** | MIT | GPS-conflated speed data for Valhalla — improves ETA accuracy |
| **OpenChargeMap** | CC BY-SA 4.0 | EV charger locations (if ever adding EV motorcycle support) |
| **MotoCamp.sk / iOverlander** | CC BY-NC | Motorcycle-specific camping and rider stops — community data |

---

## 4. FINE-TOOTHED CODE FINDINGS

### 4.1 Routing Engine (graphhopper.ts:76-78)
```typescript
elevation: false,
locale: "en-US",
details: ["road_class", "surface", "track_type"],
```
**Issue:** `elevation: false` means no ascent/descent data from the routing engine. The `PlannedRoute.ascentMeters` and `descentMeters` will always be `null` from live routing. The `ascentMeters: path.ascend ?? null` at line 221 confirms this. The `TripStagePanel` uses daylight and fuel windows but no elevation gain for day planning.

**Fix:** Enable `elevation: true` in GraphHopper config (requires OSM elevation data import). Or use Valhalla's Skadi elevation service (MIT, samples elevation at any coordinate).

### 4.2 Alternative Route Request (graphhopper.ts:101-109)
```typescript
if (_request.points.length === 2) {
  return {
    ...baseRequest,
    algorithm: "alternative_route",
    "alternative_route.max_paths": 3,
    ...
  }
}
```
**Issue:** Alternative routes are ONLY generated for 2-point A-to-B routes. When shaping stops (via points) are added, no alternatives are offered — the rider gets exactly one route regardless of `compare: true`. The `planMotorcycleTrip` function at line 438 routes each comparison profile separately (4 separate GH requests), which is **4× the latency** for a comparison request.

**Fix:** Use GraphHopper's `ch.disable=true` with alternative routes even for multi-point, or switch to Valhalla which supports alternatives for multi-point routes natively.

### 4.3 Maneuver Sign Code Mapping (maneuver.ts:10-17)
```typescript
export function maneuverKind(sign: number): ManeuverKind {
  if (sign === 4 || sign === 5) return "finish"
  if (sign === 6) return "roundabout"
  if (sign === -8 || sign === -98) return "uturn-left"
  if (sign === 8) return "uturn-right"
  if (sign < 0) return "left"
  if (sign > 0) return "right"
  return "straight"
}
```
**Issue:** GraphHopper sign codes:
- `-7` = keep left → mapped to "left" (should be "keep-left")
- `-6` = leave roundabout → mapped to "left" (should be "roundabout-exit")
- `-3` = sharp left → mapped to "left" (should be "sharp-left")
- `-2` = slight left → mapped to "left" (should be "slight-left")
- `0` = continue/straight → mapped to "straight" (correct glyph but no "continue" cue)
- `2` = slight right → mapped to "right" (should be "slight-right")
- `3` = sharp right → mapped to "right" (should be "sharp-right")
- `6` = leave roundabout → mapped to "roundabout" (ambiguous)
- `7` = keep right → mapped to "right" (should be "keep-right")

**Fix:** Expand `ManeuverKind` to 14+ types and map each sign code precisely. If migrating to Valhalla, its `ManeuverType` enum already has these.

### 4.4 Navigation Instruction Lookup (navigation-engine.ts:324-338)
```typescript
function instructionAt(model, routeDistanceMeters) {
  const instruction = model.instructions.find((candidate) =>
    candidate.distanceFromStartMeters >= routeDistanceMeters - MANEUVER_PASS_METERS
  ) ?? model.instructions.at(-1)
```
**Issue:** Uses `Array.find()` on every GPS fix (1Hz or faster). For a route with 200 instructions, this scans the array from the beginning each time — O(n) per fix.

**Fix:** Track the current instruction index in the `NavigationFrame` and search from there. Or use a binary search. Low priority for typical routes (200 instructions × 1 fix/sec = negligible), but matters for imported GPX tracks with 2000+ instruction points.

### 4.5 Ride Intent Parser (ride-intent.ts:85-131)
The local NLU parser uses regex patterns:
```typescript
const destination = destinationQuery(prompt) ?? conciseDestinationQuery(prompt, duration)
```
**Issue:** The `conciseDestinationQuery` function at line 70 returns the **entire prompt** as a destination if:
- It's 2-80 characters
- No duration was parsed
- It doesn't contain keywords like "loop", "twisty", "scenic", etc.

This means typing "Costco" → interpreted as destination "Costco" (correct!). But typing "Home" → also matched as destination (correct, but no saved-places lookup). And typing "somewhere good for lunch" → contains "lunch" → NOT matched as concise destination → falls through to `stopQuery: "food"` and `mode: "loop"`.

**Actually this is clever and works well.** The regex-based parser is surprisingly robust for common patterns. The OpenRouter LLM fallback is a nice upgrade path when available.

**Missing:** No "saved places" concept — "Home" and "Work" just become geocode queries, not resolved toGPS-pinned saved coordinates.

### 4.6 Route Overlap Calculation (scoring.ts:138-147)
```typescript
function directionalOverlap(first, second) {
  for (const coordinate of first) {
    if (second.some((candidate) => haversine(coordinate, candidate) <= 140)) {
      matches += 1
    }
  }
```
**Issue:** O(n × m) nested loop for every pair of routes. For 3 routes with 2000 geometry points each, this is 2000 × 2000 × 3 = **12 million haversine calculations** per plan request. The function is called during comparison, so the user waits for this during routing.

**Fix:** Use a spatial hash (grid bucketing) like the navigation engine already does. Or cache the sample points. `turf/boolean-point-in-polygon` is faster for corridor comparison than point-by-point.

### 4.7 Google Places Integration (google-places.ts)
Uses `Places API v1` (the new API) with `searchNearby` endpoint. The `riderFitScore` function is genuinely good — it combines intent bonus, rating, review count, and corridor distance into a single score. The `selectDiverseRiderStops` function ensures category diversity (not all breweries).

**Issue:** `GOOGLE_NEARBY_SEARCH_URL` at line 3 is hardcoded. If the API key is absent (line 231: `if (!options.apiKey?.trim()) return []`), the function returns empty silently — the caller doesn't know whether no results or no API key.

**Fix:** Return a distinguishable status, or log a warning. The `place-ideas/route.ts` handler should surface "Google Places not configured" rather than falling back silently.

### 4.8 Photon Geocoder Pennsylvania Bias (photon.ts:138-149)
```typescript
if (!options.bias || !isCoordinateInPennsylvaniaCoverage(options.bias)) {
  return places
}
return places.sort((left, right) =>
  Number(isPlaceInPennsylvaniaCoverage(right.place)) -
    Number(isPlaceInPennsylvaniaCoverage(left.place)) || ...
)
```
**Issue:** Hardcoded Pennsylvania bounds. The app is motorcycle-focused but the routing region is configurable — yet the geocoder always promotes PA results. A user in California searching "Springfield" gets Springfield, PA promoted first.

**Fix:** Make the coverage bounds configurable via environment variable or derive from the GraphHopper/Valhalla bbox.

### 4.9 Store Architecture (planner-store.ts)
The Zustand store is clean with undo/redo (50-snapshot history limit). But:
- **No persistence:** Store state is ephemeral — page refresh loses start/finish/profile selection. The `RouteLibrary` uses Dexie/IndexedDB for saved routes, but the active planning session (current waypoints, profile, plan mode) isn't persisted.
- **No middleware:** No `persist` middleware, no `devtools` middleware for debugging.

**Fix:** Add `zustand/middleware` persist for non-route data (profile, planMode, targetMinutes, mapStyle, riderLayers) to localStorage. Add devtools middleware.

### 4.10 Spotify Integration Surface Area
6 files, ~1,200 lines of Spotify code:
- `src/lib/spotify/oauth.ts` — OAuth flow
- `src/lib/spotify/constants.ts` — Client ID, scopes
- `src/lib/spotify/client-token.ts` — Token exchange
- `src/lib/spotify/public-origin.ts` — Redirect URL
- `src/lib/spotify/web-playback-sdk.ts` — Player SDK
- `src/lib/spotify/remote-player.ts` — Remote player
- `src/lib/spotify/server/token.ts` — Server-side token
- `src/lib/spotify/server/session.ts` — Session
- `src/components/spotify/SpotifyPlayerDock.tsx` — 628 lines
- 4 API routes (login, token, transfer, player)

**Issue:** This is a lot of surface area for a niche feature. If the goal is "best Google Maps rival", Spotify is tangential. Consider making it an optional lazy-loaded module that doesn't affect initial page load.

**Fix:** `const SpotifyPlayerDock = lazy(() => import("./SpotifyPlayerDock"))` with Suspense. The 628-line component + SDK shouldn't be in the initial bundle.

---

## 5. BUNDLE SIZE & PERFORMANCE

### 5.1 Dependencies (package.json)
| Dependency | Size (min+gzip) | Necessary? |
|-----------|-----------------|------------|
| `maplibre-gl` | ~200KB | Yes |
| `next` | ~100KB (runtime) | Yes |
| `react` + `react-dom` | ~45KB | Yes |
| `zustand` | ~3KB | Yes |
| `zod` | ~60KB | Consider — used only for ride-intent validation. Could use lightweight `ajv` or hand-rolled validation |
| `dexie` | ~30KB | Yes — IndexedDB wrapper |
| `@phosphor-icons/react` | ~5KB (tree-shaken) | Yes |
| `@fontsource-variable/dm-sans` | ~60KB (woff2) | Consider — could use system fonts or subset |
| `@fontsource-variable/sora` | ~70KB (woff2) | Consider — can use one display font + system UI font |
| `better-sqlite3` | N/A (server) | Server-side only |
| `geojson` types | ~2KB | Yes |

**Optimizations:**
1. Remove `zod` dependency — the ride-intent schema validation can be done with hand-rolled checks (save ~60KB)
2. Load Spotify dock lazily (save ~50KB from initial bundle)
3. Use `next/font` for font optimization instead of `@fontsource` packages
4. Consider `cheap-ruler` instead of hand-rolled haversine for speed

### 5.2 Font Loading
Two variable fonts loaded via `@import` in CSS:
```css
@import "@fontsource-variable/dm-sans/index.css";
@import "@fontsource-variable/sora/index.css";
```
Both are full character set woff2 files (~130KB combined). `next/font` would subset to the actual glyphs used and preload them.

---

## 6. ACCESSIBILITY DEEP DIVE

### 6.1 What's Good
- `WaypointField` is ARIA combobox compliant (`role="combobox"`, `aria-autocomplete="list"`, `aria-activedescendant`, `aria-expanded`)
- Map controls have `aria-label`s
- Focus outlines visible (`outline: 2px solid var(--signal)`)
- `prefers-reduced-motion: reduce` is respected at line 3421 of globals.css

### 6.2 What's Missing
- **No `aria-live` region for navigation updates** — the RideHud instruction changes but screen readers won't announce them. Add `aria-live="polite"` to the instruction heading container.
- **No keyboard map interaction** — map pan/zoom requires mouse/touch. Add keyboard navigation (arrow keys to pan, +/- to zoom) via MapLibre's `keyboard` navigation control.
- **No `role="status"` on progress bar** — the route progress percentage updates silently.
- **Color-only feedback** — GPS state changes are communicated by color change on `.live-dot` and `.gps-status`. Add text labels for color-blind users.
- **No skip-nav link** — the page jumps straight into map + planner with no bypass for keyboard users.
- **No `lang` attribute on dynamic content** — voice instructions and weather alerts include place names that may have different language contexts.

---

## 7. SECURITY NOTES

### 7.1 API Key Handling
- `google-places.ts` — API key passed via `x-goog-api-key` header (correct, not URL)
- `ride-intent.ts` — OpenRouter API key via `Authorization: Bearer` (correct)
- `spotify/token` — server-side token exchange (correct — client never sees client secret)

### 7.2 Environment Variables
No `.env` file audit done, but the handlers reference `process.env` keys for:
- `GRAPHHOPPER_BASE_URL` (routing)
- `GOOGLE_PLACES_API_KEY` (place ideas)
- `OPENROUTER_API_KEY` (AI ride intent)
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`
- `PHOTON_BASE_URL` (geocoding)

All server-side. Good.

### 7.3 Input Validation
- `ride-intent.ts` uses Zod schema with `superRefine` (good)
- `gpx-import.ts` has `MAX_GPX_IMPORT_BYTES = 5MB` limit (good)
- `place-ideas` query radius is bounded `Math.max(5, Math.min(radiusKm, 50))` (good)
- No SQL injection risk — `better-sqlite3` uses parameterized queries

### 7.4 Concerns
- `gpx-import.ts` parses XML — check for XXE (XML External Entity) attacks. The `DOMParser` in browser is safe, but server-side parsing (if any) needs `entity: false` in the parser config.
- The `proxy.ts` file was not audited — needs review for SSRF if it proxies external URLs.

---

## 8. PRIORITIZED ACTION ITEMS FOR CODEX

### Phase 0 — Stabilize (Before adding features)
1. **Fix the 3 stale e2e tests** — update selectors to match current UI
2. **Extract globals.css into CSS Modules** — one component at a time
3. **Lazy-load SpotifyPlayerDock** — `lazy()` + Suspense
4. **Add `persist` middleware to Zustand** — persist profile, planMode, mapStyle to localStorage
5. **Add `aria-live="polite"` to RideHud instruction region** — accessibility

### Phase 1 — Routing Upgrade (Biggest single quality jump)
6. **Evaluate Valhalla vs GraphHopper** — Valhalla's Odin maneuver engine directly solves all maneuver type gaps. Docker setup is straightforward. Dynamic costing at runtime (no recompile for motorcycle profile tweaks).
7. **Expand maneuverKind() to 14+ types** — even without Valhalla, expand the sign code mapping
8. **Add "Continue Straight" cue** — detect long gaps between turns and show "Continue on [road] for X miles"

### Phase 2 — Search & Destination
9. **Add Pelias as autocomplete geocoder** — Docker-deployable, supports "coffee near me" patterns
10. **Add saved places to store** — Home, Work, favorite stops — persisted to IndexedDB
11. **Add search history** — last 20 searched destinations, persisted to localStorage
12. **Make PA coverage bounds configurable** — env var or derived from routing region

### Phase 3 — Turn-by-Turn UX
13. **Redesign RideHud instruction card** — Google Maps style: large maneuver icon, "In X ft" countdown, street name prominent, then-cue compact
14. **Add navigation overview strip** — persistent bar: route name, distance, ETA, mute, exit
15. **Add turn-by-turn list in planner** — before starting ride, show full scrollable instruction list (already in RouteComparison but hidden behind two toggles)
16. **Add voice guidance beep** — short audio queue before verbal instruction
17. **Add completed route segment dimming** — gray out traversed portions on map during navigation

### Phase 4 — Architecture & Performance
18. **Decompose MapStage.tsx** (1,368 → 5 files)
19. **Decompose PlannerShell.tsx** (1,063 → 3 hooks + shell)
20. **Decompose RideHud.tsx** (616 → 3 hooks + HUD)
21. **Replace zod with hand-rolled validation** — save 60KB
22. **Optimize route overlap calculation** — spatial hash instead of O(n×m)
23. **Enable elevation in GraphHopper** — or use Valhalla Skadi

### Phase 5 — Polish
24. **Add `turf.js` for geospatial math** — replace hand-rolled haversine/bearing
25. **Add `suncalc` for day/night detection** — auto switch map style at sunset
26. **Add speed limit display** — fetch from OSM `maxspeed` tags
27. **Add map-level alternative route labels** — floating ETA badges on map lines
28. **Add reroute card** — "Faster route available +2 min / -3 mi" visual card
29. **Consider Tailwind CSS v4 + Open Props** — to reduce CSS maintenance burden

---

## 9. SUMMARY SCORECARD

| Category | Current | Target | Gap |
|----------|---------|--------|-----|
| Maneuver Types | 7 | 20+ | Expand enum + glyphs |
| CSS Organization | 5,688 lines / 1 file | ~500 lines / 8 module files | Mechanical extraction |
| Max Component Size | 1,368 lines | <400 lines | Decompose 3 mega-components |
| Geocoder | Photon (OSM only) | Pelias (full-text + POI) | Add Pelias Docker container |
| Routing Engine | GraphHopper (coarse maneuvers) | Valhalla (rich narratives) | Docker swap |
| Saved Places | None | Home/Work/favorites | Add to store + IndexedDB |
| Search History | Hardcoded recents | Last 20 dynamic | Add to store + localStorage |
| Store Persistence | None | Profile/prefs persisted | `persist` middleware |
| Voice Guidance | 3 stages, raw TTS | 5+ stages, beep + SSML | Audio + phrasing |
| Accessibility | Basic ARIA | Full WCAG 2.1 AA | `aria-live`, keyboard nav |
| Bundle Size | ~500KB initial | ~350KB initial | Lazy-load, drop zod |
| E2E Tests | 3 (all stale) | 10+ (updated) | Fix selectors, add coverage |