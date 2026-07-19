# Switchback — Full Audit & Refactor Evaluation Report

**Audit Date:** 2026-07-16
**Evaluated By:** Codex Audit Agent
**Target:** Google Maps-quality turn-by-turn UX + freeform destination input
**Playwright Session:** Completed — app renders correctly, all API endpoints operational, e2e tests are stale/out-of-sync with current UI layout

---

## 1. EXECUTIVE SUMMARY

Switchback is a deeply engineered motorcycle route planner — routing engine, navigation engine, weather overlays, offline packs, ride recording, and Spotify integration all exist and work. The code quality is high: clean TypeScript, well-typed Zustand store, spatial-indexed navigation matching, and a comprehensive e2e Playwright suite.

**However**, the UX does not currently deliver a Google Maps-quality experience. The core gaps are:

| Area | Grade | Key Issue |
|------|-------|-----------|
| Turn-by-turn UI | **B-** | Instructions work but the HUD is not Google Maps-style — no lane indicator, no map-follow animation, no audible beep/countdown, no street-name in the instruction card, no exit/roundabout numbering, no "in 500 ft" countdown style |
| Destination Input | **C+** | Photon geocoder is limited to OSM data (no business search, no POI categories for destinations). Only 2 comboboxes (start/finish) — no single-searchbox omnibox with implicit destination resolution |
| Map Follow Mode | **B** | Follow camera exists but the visual polish of Google Maps (smooth rotation animation, speed-adaptive zoom, road-highlight) is missing |
| Reroute UX | **B** | Rejoin controls work (nearest-safe, next-shaping, skip-point) but the UX is text-heavy button groups, not Google Maps-style "tap alternate route" with ETA difference shown inline |
| Voice Guidance | **C+** | Uses raw SpeechSynthesis — no Web Speech API TTS markup, no SSML, no natural-language street name rendering, no distance-countdown cues ("in 300 feet… 200 feet… now turn") |
| Mobile UX | **B** | Responsive but the planner deck takes substantial screen real estate; hiding it collapses route context too aggressively |

---

## 2. TURN-BY-TURN DIRECTIONS — GAP ANALYSIS

### 2.1 Current State (src/lib/client/maneuver.ts, src/lib/client/navigation-engine.ts)

**What works:**
- `NavigationFrame` tracks `routePercent`, `remainingDistanceMeters`, `remainingDurationSeconds`, `instruction` with `distanceToInstructionMeters`
- `instructionDistance()` formats distances ("Now", "50 ft", "0.1 mi", "1.2 mi")
- Voice announces via `SpeechSynthesisUtterance` at 3 stages: "now" (≤35m), "soon" (≤180m), "prepare" (≤800m)
- "Then" instruction shows next maneuver when ≤300m from current
- Off-route detection with 3-fix debounce + 8s auto-reroute delay
- 4 rejoin modes (nearest-safe, next-shaping, skip-point, preserve-original)

**What's missing for Google Maps parity:**

#### A. Maneuver Type Coverage (maneuver.ts:10-17)
Current: `straight | left | right | uturn-left | uturn-right | roundabout | finish`
Google Maps has: `turn-slight-left | turn-slight-right | turn-sharp-left | turn-sharp-right | uturn-left | uturn-right | turn-left | turn-right | fork-left | fork-right | roundabout | merge | keep-left | keep-right | ramp-left | ramp-right | ferry | exit-left | exit-right`
**Gap:** The `maneuverKind()` function maps GraphHopper sign codes only to coarse left/right. GH signs like -7 (keep left), -6 (sharp left), -2 (slight left), 7 (keep right), 6 (sharp right), 2 (slight right) all collapse into "left" or "right". No ramp/merge/ferry/exit detection.

#### B. Instruction Card Design (RideHud.tsx:539-595)
Current design is a single block:
```
[Icon] "Next instruction · 0.3 mi"
       "Turn left onto Valley Road"
       "Then continue onto Ridge Road"
```

Google Maps shows:
```
┌────────────────────────────────┐
│  ┌─┐                           │
│  │ ← │ In 500 ft               │ ← Countdown distance
│  └─┘ Use the right 2 lanes     │ ← Lane guidance
│                                │
│  Turn right onto Market St     │ ← Street name prominent
│  Then left onto Oak Ave        │ ← Then cue compact
│  ┌───────────────────────────┐ │
│  │      Route overview bar   │ │ ← Always visible mini-map
│  └───────────────────────────┘ │
│   2.4 mi · 8 min               │ ← Remaining trip
└────────────────────────────────┘
```

**Missing elements:**
- No lane guidance data (GraphHopper doesn't provide it in the current API)
- No countdown-style distance animation
- No route overview mini-map within the HUD
- Instruction text doesn't emphasize the street name
- No roundabout exit numbering ("Take the 3rd exit")
- No "Continue straight" instruction rendering (keeps showing previous maneuver)

#### C. Voice Guidance Polish
Current approach: raw `SpeechSynthesisUtterance()` with plain text — no SSML, no speed/pitch control, no mute icon feedback animation.

Google Maps uses:
- Natural language: "In a quarter mile, turn right onto Main Street. Then continue straight for 2 miles."
- Countdown: "In 500 feet, turn right." → "Turn right." → (beep)
- Street names pronounced naturally (abbreviations expanded)
- Volume ducking during music playback

**Missing:**
- No beep/notification sound before verbal instruction
- No distance-countdown verbal cues (only 3 stages: prepare/soon/now)
- No abbreviation expansion for street names
- No route-summary verbal readout ("This route is 42 miles and takes about 80 minutes. Mostly twisty roads.")
- Voice toggle state is persisted in a ref (not UI-visible animation)

#### D. Map Visual While Navigating (navigation-map.ts)
Current: `buildNavigationMapFeatures()` returns 3 GeoJSON features — match-link (line from raw to matched), matched-position (point), rider-position (point with bearing icon).

**Missing:**
- Speed-adaptive zoom that smoothly transitions (currently a fixed zoom jump at 8 m/s and 20 m/s)
- Follow-camera that auto-pitches at turns (currently pitch is hardcoded at 52° navigating, 28° recovering)
- Road centerline snap visualization (show the matched road segment highlighted)
- Dimming of completed route segments (show gray behind, colored ahead)
- ETA display directly on the navigation map layer (not just in footer telemetry)

---

## 3. DESTINATION INPUT — GAP ANALYSIS

### 3.1 Current State

**Two input modes exist:**
1. **Omnibox** ("Where do you want to ride?") — freeform text → AI intent parser (`/api/ride-intent`) → plan
2. **Manual builder** — two comboboxes (start/finish) + photon geocoding dropdown

**WaypointField.tsx** is the combobox component — it handles:
- Debounced geocode queries (260ms) to `/api/geocode`
- Keyboard navigation (arrow keys, enter, escape)
- ARIA-compliant listbox
- Map-pick button to arm map interaction

### 3.2 Gaps

#### A. Single-Searchbar Experience
Google Maps lets you type ANYTHING in ONE box:
- Address → "1600 Amphitheatre Pkwy, Mountain View"
- POI → "Starbucks near me" or "gas station"
- Cross-street → "Main St & Oak Ave"
- Category → "coffee shops"
- Current location context → "Home" (saved places)

Current Switchback requires: start field + finish field (separate boxes). The omnibox exists but feeds into an AI intent parser, not a direct geocode-then-search flow.

**Missing:**
- Autocomplete categories (addresses, POIs, saved places, recent searches)
- Saved/favorite places integration (Home, Work, Saved stops — no `favoritePlaces` concept in the store)
- "Near me" contextual search (current GPS location as search center)
- Search history (query history for quick recall)

#### B. Photon Geocoder Limitations (photon.ts)
Photon is OSM-based. Good for places/addresses but:
- No business search (searching "Costco" works as OSM name match, not as business category)
- No reviews/photos/ratings in search results
- No "currently open" filter
- No gas station, EV charger, ATM category search
- Pennsylvania bias in `selectPreferredPlace()` — sorts PA results first, filters PA-only in fun stops

#### C. Place Ideas Integration (PlaceIdeasResult)
The `stopIdeas` flow (after AI intent) is well-designed: shows rider-fit scored stops with categories (brewery, coffee, food, scenic) and reasons. But:
- Only triggered by AI intent flow, not by manual builder
- Only shows after routing complete (no "search along route" in the planner)
- No "add stop" search box for manual route builder

#### D. Recent Rides / Recent Destinations
PlannerDeck.tsx:319 has hardcoded "Recent" section with "Home" and "New Hope scenic route" — these are static UI placeholders, not dynamic recent destinations.

---

## 4. UX LAYOUT & RESPONSIVENESS — GAP ANALYSIS

### 4.1 Current Layout Architecture

```
┌──────────────────────────────────────────┐
│  Map (full-screen, 100% width)           │
│                                          │
│  ┌──────────────────┐                   │
│  │ Planner Deck     │                   │
│  │ (scrollable      │                   │
│  │  sidebar,        │                   │
│  │  ~400px wide)    │                   │
│  │                  │                   │
│  └──────────────────┘                   │
│                                  ┌─────┐│
│                                  │Spot ││
│                                  │ify  ││
└──────────────────────────────────────────┘
```

### 4.2 Gaps

#### A. Mobile: Deck Takes Too Much Space
- On mobile, the planner deck is a bottom sheet but takes significant vertical space
- Close/minimize collapses all context — no persistent "strip" showing current route name + ETA
- No Google Maps-style bottom sheet that dynamically expands/collapses based on context

#### B. No Route Overview Strip
Google Maps shows a persistent top/bottom strip when a route is selected:
```
┌─────────────────────────────────────────┐
│  [X]  42 mi · 1h 20m    Favorite  Share│
└─────────────────────────────────────────┘
```
In Switchback, selecting a route hides the planner entirely in minimized mode — only showing "Route ready" + route name.

#### C. Route Comparison UX (RouteComparison.tsx)
Route comparison exists but is a scrollable list inside the deck. Google Maps shows ETA + distance differences inline on the map as alternative route lines with labels. Switchback shows 3 route cards in a list (RouteComparison component) — no map-level comparison labels.

#### D. Info Density
The planner deck has **17 sections/controls**:
1. Omnibox search with quick-intent chips
2. Ride understanding / recent rides
3. Stop ideas
4. Ride research
5. Profile switch (4 buttons)
6. Curvature toggle
7. Avoid highways toggle
8. Library button
9. Plan mode switch (Loop/A-to-B)
10. Waypoint composer (start/finish fields)
11. Time budget selector (loop mode)
12. Route shaping tools (add stop, undo, redo, reverse)
13. Via point list (drag/move/remove)
14. Segment profile controls
15. Avoid area summary
16. Map-pick hint text
17. Action dock (plan/replan/clear/start)

**This is overwhelming.** Google Maps hides advanced controls behind a "More options" or contextual disclosure.

---

## 5. ROUTING & MANEUVER QUALITY

### 5.1 What Works Well
- **Spatial indexing** in `navigation-engine.ts` (cell-based O(1) segment lookup) — excellent for large routes
- **Continuity penalty** for navigation matching (penalizes backward movement, rewards expected travel distance)
- **Ambiguous route detection** (dual-path detection within 60m accuracy window)
- **Weak-signal mode** (holds last reliable frame when GPS accuracy >100m)
- **Round-trip loop generation** with seeded randomness
- **Segment-specific profiles** (different road character per leg)
- **Rider preference scoring** (route-to-route quality comparison)

### 5.2 What's Missing

#### A. No Intermediate Maneuver Display List
Google Maps shows the full turn-by-turn list (scrollable) before starting navigation. Switchback stores `route.instructions[]` but the planner never renders them as a scrollable list — they're only consumed by the navigation engine during active guidance.

#### B. No Speed Limit Display
The `NavigationFix` has `speedMetersPerSecond` but there's no speed limit data from OSM or any API. No speed limit sign rendering on the map/HUD.

#### C. No Traffic / Road Conditions
No traffic API integration. No road closure detection beyond OSM "avoid areas" that the user must manually draw.

#### D. GraphHopper Sign Code Mapping (maneuver.ts)
Only 7 maneuver types. GraphHopper's sign codes map to ~20 instruction types in their standard client. The current mapping discards:
- `-7` (keep left) → treated as "left"
- `-6` (leave roundabout) → treated as "left"
- `-3` (sharp left) → treated as "left"
- `-2` (turn slight left) → treated as "left"
- `0` (straight/continue) → no instruction rendered
- `2` (turn slight right) → treated as "right"
- `3` (sharp right) → treated as "right"
- `6` (leave roundabout) → treated as "right"
- `7` (keep right) → treated as "right"

#### E. No "Continue Straight" Cue
When `sign === 0`, `maneuverKind` returns "straight" but the `ManeuverGlyph` renders a `CaretUp` icon (no visual "continue straight" glyph). The RideHud only shows instructions from `navigationFrame.instruction`, which means on long straight segments, the HUD shows the last turn instruction indefinitely rather than a "Continue straight for 5.2 miles" cue.

---

## 6. COMPLETE IMPROVEMENT SCOPE

### Priority 1 — Critical (Google Maps Parity)

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1.1 | **Expand Maneuver Types** — Add `slight-left`, `slight-right`, `sharp-left`, `sharp-right`, `keep-left`, `keep-right`, `ramp-left`, `ramp-right`, `merge`, `ferry`, `exit-left`, `exit-right`, `continue` to `maneuver.ts` and add corresponding SVG glyphs | Small | High |
| 1.2 | **Maneuver Countdown Animation** — Add CSS keyframe animation for distance countdown in instruction card (pulsing distance text, fading transition between "now/soon/prepare") | Small | High |
| 1.3 | **Instruction Card Redesign** — Redesign `RideHud` instruction area: larger maneuver icon, prominent street name, compact then-cue, "in X ft" countdown | Medium | High |
| 1.4 | **Route Overview Strip** — Persistent bottom/top bar showing: route name, distance, ETA, mute toggle, exit button — always visible during navigation | Small | High |
| 1.5 | **Full Turn List** — Render `route.instructions[]` as a scrollable turn-by-turn list in the planner, accessible before starting ride | Medium | High |
| 1.6 | **"Continue Straight" Cue** — Detect long gaps between turns and render "Continue straight on [road] for X miles" in the HUD | Small | Medium |

### Priority 2 — High (Google Maps Feature Gap)

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 2.1 | **Single Unified Search Box** — Merge start/finish fields into one Google Maps-style search field that accepts: addresses, POIs, "near me", cross-streets, saved places. Parse intent from the query (destination vs. search-along-route) | Large | High |
| 2.2 | **Search History & Favorites** — Add `searchHistory` and `savedPlaces` to Zustand store (persisted in IndexedDB). Surface as autocomplete suggestions | Medium | Medium |
| 2.3 | **Voice Guidance Upgrade** — Add beep/dong audio cues before verbal instruction, expand abbreviations, add route summary voiceover on start | Medium | Medium |
| 2.4 | **Speed Limit Display** — Fetch speed limits from OSM tags (GraphHopper edge data or OSRM) and render as a gauge on the HUD | Medium | Medium |
| 2.5 | **Map-Level Route Alternatives** — Show alternative routes as labeled lines on the map (not just in the comparison list) with floating ETA labels | Large | High |
| 2.6 | **Re-route Card UX** — Replace 4 text buttons with a visual card: "Faster route available +2 min / -3 mi" with accept/decline | Medium | Medium |

### Priority 3 — Medium (UX Polish)

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 3.1 | **Dynamic Bottom Sheet** — Replace current planner deck with a collapsible bottom sheet that has 3 states: collapsed (route name only), half (route summary + action buttons), full (full planner) | Large | High |
| 3.2 | **Follow Camera Animation** — Smooth camera transitions using `maplibre-gl`'s `flyTo` instead of jump cuts, speed-adaptive zoom curve | Medium | Medium |
| 3.3 | **Completed Route Dimming** — Gray out traversed route segments on the map during navigation, keeping upcoming segments highlighted | Medium | Medium |
| 3.4 | **ETA Card on Map** — Floating ETA badge pinned next to the finish marker on the map, updating in real-time | Small | Medium |
| 3.5 | **Add Stop to Current Route** — "Add stop" search box that searches along the current route (not just from center point) | Medium | Medium |
| 3.6 | **Gas/Charging Station Search** — Filtered POI search for gas stations near route with "detour time" shown | Medium | Low |

### Priority 4 — Low (Nice to Have)

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 4.1 | **Night Mode Auto-Switch** — Auto-detect sunset and switch map style to dark mode | Small | Medium |
| 4.2 | **Share ETA** — Share live ETA link with contacts (like Google Maps "Share trip progress") | Medium | Low |
| 4.3 | **Offline Voice Pack** — Pre-download TTS voices for offline navigation | Small | Low |
| 4.4 | **Photo Waypoints** — Let users attach photos to via points (scenic overlook markers) | Medium | Low |
| 4.5 | **Group Ride Sync** — Real-time location sharing between riders on the same route | Large | Low |

---

## 7. PLAYWRIGHT SESSION FINDINGS

### 7.1 App Health
- **Dev server:** Running on port 3100, responds HTTP 200 immediately
- **API health endpoint:** `{"ok":true,"app":{"ok":true},"router":{"ok":true,"status":200,"latencyMs":339}}`
- **Routing engine:** Returns real routes (e.g. Harrisburg→Gettysburg produces a twisty route)
- **Geocoding:** Photon API returns search results (6 results for "test" query)
- **GPX library:** 419 pre-imported project routes available
- **Rendered HTML:** Full planner deck + map stage + Spotify dock all present in server-rendered output

### 7.2 E2E Test Status
All 3 Playwright e2e tests fail — **but the tests are stale, not the app**:

| Test | Failure | Root Cause |
|------|---------|------------|
| `plans, compares, saves...` | `getByRole('heading', { name: /Pick two points/i })` not found | UI evolved from "Pick two points" builder to omnibox "Where do you want to ride?" flow. The waypoint composer is hidden behind "Edit route" toggle. |
| `turns a free-form timebox...` | `getByLabel('Describe the ride you want')` not found | The omnibox input now has `aria-label="Where do you want to ride?"` (PlannerDeck line 287), not "Describe the ride you want" |
| `draws a rough route...` | `getByRole('button', { name: 'Loop ride' })` not found | Same issue — "Loop ride" mode button is behind "Edit route" toggle, which the test doesn't click first |

**Action required for e2e tests:**
1. Test 1: Change heading matcher to the omnibox heading or click "Edit route" first
2. Test 2: Update label matcher from `'Describe the ride you want'` to the correct label/id
3. Test 3: Click "Edit route" before looking for "Loop ride" button

---

## 8. CODE QUALITY OBSERVATIONS

### 8.1 Strengths
- `navigation-engine.ts` spatial index is production-grade (cell-based, continuity-weighted)
- `planner-store.ts` has full undo/redo for route points with 50-snapshot history
- `RideHud` handles GPS weak signal, off-route, recovery checkpoints, and voice guidance stages
- `google-places.ts` rider-fit scoring model is well-designed (intent bonus + rating + review + corridor distance)
- All navigation math is haversine-based, no external dependency for distance/bearing
- Playwright e2e test covers full user journey (plan → compare → save → export → ride)
- CSS is responsive with breakpoints for mobile, landscape, and desktop

### 8.2 Technical Debt
- `globals.css` is 5,688 lines — too large for a single file, should be split into CSS modules per component
- `PlannerShell.tsx` is 1,063 lines with 30+ handlers — too many concerns in one component
- `MapStage.tsx` is 1,368 lines — map interaction, layer management, sketch canvas, and map controls all in one file
- `RideHud.tsx` is 616 lines — GPS session, reroute logic, voice guidance, recording, and weather alerts all in one component
- `PlannerDeck.tsx` has 71 props — some should be grouped into context objects
- No Playwright mobile visual regression tests (only desktop-chromium + mobile-safari in config)
- No component-level snapshot tests for RideHud, PlannerDeck, WaypointField

### 8.3 Accessibility
- ARIA attributes are comprehensive — `role="combobox"`, `aria-autocomplete`, `aria-busy`, `aria-expanded`, `aria-activedescendant` all present
- Voice navigation is keyboard-navigable in the combobox
- Color contrast on dark theme appears adequate
- Missing: no screen-reader announcement when instruction changes during navigation
- Missing: no `aria-live="polite"` region for distance countdown updates

---

## 9. TEST COVERAGE ASSESSMENT

### 9.1 Existing Coverage
- **Unit tests:** 60+ test files covering routing, geocoding, navigation, weather, GPX, storage, Spotify, rider preferences
- **E2E tests:** 3 Playwright scenarios: full user journey, free-form intent to gravel loop, route sketch
- **Test quality:** Good — mock services, assertion on API payloads, viewport validation, overlap prevention

### 9.2 Coverage Gaps
- No unit tests for `ManeuverGlyph`/`maneuverKind` with all GraphHopper sign codes
- No e2e test verifying voice guidance speech output
- No e2e test for mobile bottom-sheet interaction patterns
- No e2e test for map follow mode camera behavior during navigation
- No test for instruction list rendering
- No performance/Lighthouse budget test

---

## 10. RECOMMENDED IMPLEMENTATION ORDER

1. **Week 1:** Priority 1 tasks (1.1–1.6) — maneuver types, countdown animation, instruction card redesign, overview strip, turn list, continue-straight cue
2. **Week 2:** Priority 2 tasks (2.1–2.3) — unified search box, search history/favorites, voice upgrade
3. **Week 3:** Priority 2 remaining (2.4–2.6) + Priority 3.1–3.3 — speed limits, map-level alternatives, re-route cards, dynamic bottom sheet, camera animation, route dimming
4. **Week 4:** Priority 3.4–3.6 + Priority 4 — ETA card, add-stop search, gas stations, night mode, share ETA

---

## 11. APPENDIX: File Inventory

| File | Lines | Role |
|------|-------|------|
| `src/app/globals.css` | 5,688 | All CSS |
| `src/components/planner/MapStage.tsx` | 1,368 | Map rendering, layers, sketch, drag |
| `src/components/planner/PlannerShell.tsx` | 1,063 | Orchestrator — all handlers, sub-components |
| `src/components/planner/PlannerDeck.tsx` | 678 | Planner sidebar UI (71 props) |
| `src/components/planner/RideHud.tsx` | 616 | Turn-by-turn HUD, GPS, voice, reroute |
| `src/lib/client/navigation-engine.ts` | 468 | Spatial matching, navigation frames |
| `src/stores/planner-store.ts` | 279 | Zustand store with undo/redo |
| `src/lib/places/google-places.ts` | 284 | Google Places rider-fit scoring |
| `src/lib/geocoding/photon.ts` | 248 | Photon OSM geocoding |
| `src/components/planner/WaypointField.tsx` | 167 | Combobox geocoding input |
| `src/lib/client/maneuver.ts` | 18 | Maneuver kind from sign code |
| `src/lib/client/navigation-map.ts` | 86 | Nav camera & map features |
| `tests/e2e/planner.spec.ts` | 524 | Playwright e2e tests |
