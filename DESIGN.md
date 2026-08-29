# Switchback CINCO Design System

## 1. Atmosphere & Identity

Switchback is a calm, premium motorcycle-routing instrument: exploratory and
tactile while planning, spare and high-contrast while riding. The map is the
workspace. The signature is terrain-aware depth with restrained instrument
surfaces that organize decisions without turning the ride into a dashboard.
The primary product flow is Plan → Choose → Prepare → Ride → Recap. Route Atlas
is a secondary Library collection for browsing and showing imported custom rides;
it never displaces the map workspace as the product home.
The existing `design/DESIGN-CONTRACT.md` remains the detailed historical
reference; this file is the active CINCO implementation contract.

## 2. Color

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Map canvas | `--sb-canvas` | `#F4F8FB` | `#07121E` | App and map fallback surface |
| Floating surface | `--sb-surface` | `#FFFFFF` | `#0E1D2C` | Sheets and controls |
| Raised surface | `--sb-surface-raised` | `#F0F4F8` | `#14283A` | Selected controls and nested groups |
| Primary text | `--sb-text` | `#10253D` | `#F3F7FA` | Headings and primary metrics |
| Muted text | `--sb-text-muted` | `#607287` | `#9FB0C0` | Supporting copy and metadata |
| Border | `--sb-border` | `#D8E2EA` | `#294156` | Dividers and focus context |
| Action | `--sb-action` | `#246BCE` | `#4D91F2` | Actions and focus |
| Route primary | `--sb-route-primary` | `#FF3B24` | `#FF573D` | Selected/twisty route and ride commitment |
| Route scenic | `--sb-route-scenic` | `#10A6A6` | `#31C7C7` | Scenic route meaning |
| Route adventure | `--sb-route-adventure` | `#E99400` | `#F4B138` | Gravel/adventure meaning |
| Route alternative | `--sb-route-alternative` | `#8D9AAA` | `#7F90A3` | Unselected route |
| Traversed/navigation | `--sb-route-traversed` / `--sb-navigation` | `#246BCE` | `#4D91F2` | Progress and active guidance |
| Warning/closure/weather | `--sb-warning` / `--sb-closure` / `--sb-weather-risk` | `#C87808` / `#D74646` / `#C87808` | `#F0A52C` / `#FF6666` / `#F0A52C` | Actionable risk only |

Semantic aliases are declared in `src/app/globals.css` and
`src/app/styles/design-system.css`. New UI uses aliases, not one-off colors.

## 3. Typography

| Role | Family | Size | Weight | Usage |
| --- | --- | --- | --- | --- |
| Display | Sora Variable | 24–30px mobile, 28–34px desktop | 600 | Screen and route titles |
| Maneuver | Sora Variable | 22–30px | 600 | Active ride instruction |
| Route title | Sora Variable | 16–22px | 600 | Route cards and sheets |
| Primary metric | DM Sans Variable | 20–30px | 600 | Time, distance, elevation |
| Supporting metric | DM Sans Variable | 14–16px | 500 | Rider-language facts |
| Label/metadata | DM Sans Variable | 11–14px | 500–700 | Overlines, provenance, status |
| Warning | DM Sans Variable | 13–16px | 600 | Actionable warnings |

Body copy remains at least 14px. Telemetry uses tabular lining numerals.

## 4. Spacing & Layout

Spacing uses the existing 4px base: `--sb-space-1` through `--sb-space-10`.
Interactive controls are at least `--sb-touch-target` (44px). Existing
breakpoints remain authoritative: 760px mobile ceiling, 761px desktop/tablet
landscape, and short landscape at 520px height.

Responsive compositions are intentional:

- phone portrait: full map, top search, compact controls, bottom ContextSheet;
- phone landscape: map-first with compact edge sheet and safe-area padding;
- tablet portrait: planning rail plus visible map;
- tablet landscape: 384px target left workspace, remaining map, optional right inspector;
- desktop: rail plus map workspace without a stretched phone frame.

Camera fitting consumes `MapViewportInsets`; it never fits against the covered
DOM box. Moving states use the `immersive` sheet detent.

## 5. Components

### MapWorkspace

- **Structure:** map canvas plus chrome plus one context surface.
- **Variants:** planning, stopped detail, ride, Free Ride, renderer failure.
- **States:** loading, ready, fallback, error, reduced detail.
- **Accessibility:** map meaning has text equivalents; controls are keyboard and touch reachable.
- **Layout:** map shell; map owns the visual foundation.

### ContextSheet

- **Structure:** handle/tap alternative, heading, progressive content, primary action.
- **Variants:** `peek`, `half`, `full`, `immersive`, `closed`.
- **States:** default, expanded, collapsed, loading, empty, error.
- **Accessibility:** 44px handle target, labelled region, focus-visible controls, reduced motion.
- **Motion:** 220–320ms transform/opacity transition; no layout-property animation.
- **Gesture:** a deliberate pointer release moves one detent in the drag direction;
  tap, Enter, and Space provide the same progressive-disclosure path.

### RouteChoice

- **Structure:** label, time/distance/elevation, rider-language reasons, select action.
- **Variants:** Best Match, Twistiest, Flowiest, Scenic, Fastest baseline.
- **States:** selected, alternative, loading, unavailable, explicitly selected.
- **Accessibility:** route profile is not encoded by color alone.
- **Hierarchy:** rider-language difference and relative tradeoff precede raw score;
  directions and provenance begin collapsed; Start ride is the selected route's
  primary action, with Edit and Prepare secondary.

### RouteAtlas

- **Structure:** collection introduction, intrinsic poster gallery, poster detail,
  route story and facts, and an explicit path back to planning/Library.
- **Variants:** populated collection, empty collection, full-geometry poster,
  precomputed preview, and missing-geometry state.
- **Rule:** poster art explains route shape and curvature but does not imply live
  navigation, current conditions, or full offline readiness.
- **Accessibility:** route identity is readable outside the SVG; metadata remains
  legible at text zoom; the gallery never requires two-dimensional scrolling.

### RiderSession

- **Stages:** Plan, Choose, Prepare, Ride, Recap.
- **Rule:** each stage exposes one dominant next action and preserves a clear exit
  or recovery path. Advanced controls remain available one level deeper.

### RideHud

- **Structure:** dominant maneuver, secondary next maneuver, map, compact trip strip.
- **Variants:** guidance, preview, off-route, recovery, arrived.
- **States:** GPS waiting, normal, warning, high workload, paused.
- **Rule:** secondary actions are one interaction away while moving.

### FreeRidePrompt

- **Structure:** one opportunity, distance, added time, one or two traits, Take/Pass.
- **Variants:** no candidate, candidate, accepted, suppressed.
- **Rule:** detailed score/provenance is stopped/expanded content only.

## 6. Motion & Interaction

Only `transform`, `opacity`, and `filter` animate. Sheet detents, selected-route
changes, camera transitions, and temporary prompts may move; decorative route
glows, bouncing controls, and ride-mode parallax are prohibited. Reduced-motion
users receive immediate state changes with no ornamental animation.

## 7. Depth & Surface

Use mixed depth: tonal shifts establish hierarchy, while one restrained tinted
shadow and a 1px inner highlight identify floating surfaces. Cards exist only
when they group a decision. The map remains visually stronger than chrome.

## 8. Accessibility Constraints & Accepted Debt

- WCAG 2.2 AA target; 4.5:1 body contrast and 3:1 large-text contrast.
- Every interactive element has a visible focus state and a 44px minimum target.
- Touch sheet gestures have tap/keyboard alternatives.
- Warnings, route states, and layer meanings use text or shape in addition to color.
- Live, stale, unavailable, and static data are labelled honestly.

| Item | Location | Why accepted | Exit |
| --- | --- | --- | --- |
| Existing legacy aliases (`--oled`, `--machined`, etc.) | `globals.css` and legacy feature CSS | Existing surfaces still depend on them during phased migration | Remove only after each phase has migrated and visual baselines pass |
| Map tile pixels in deterministic E2E | visual fixtures | External tiles are not stable test input | Provider-specific visual QA in Phase 2/7 |
