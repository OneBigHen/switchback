# Switchback design contract

Status: implementation source of truth  
Version: `1.0.0`  
Reference baseline: `design/reference/v1/FBD6D355-D01E-41E5-98D4-9E5FFA6E2C91.PNG`

## Product character

Switchback is a calm, premium motorcycle-routing instrument. Planning should
feel exploratory and tactile; active riding should feel spare, high-contrast,
and glanceable. The map remains the workspace. Panels organize decisions but
never turn the app into a generic dashboard.

## Type

- Display and headers: Space Grotesk, weight 600.
- Body and controls: Inter, weight 400 or 500.
- Telemetry: Inter with `font-variant-numeric: tabular-nums lining-nums`.
- Mobile display sizes: 24/30, 20/26, 16/22. Body: 14/20 and 12/17.
- Desktop display sizes: 28/34 and 22/28. Body remains 14/20.

Fonts must be bundled. Generic sans-serif fallbacks are allowed only while a
font file is still loading.

## Semantic color tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| canvas | `#F4F8FB` | `#07121E` | app background |
| surface | `#FFFFFF` | `#0E1D2C` | cards and sheets |
| surface-raised | `#F0F4F8` | `#14283A` | raised controls |
| text | `#10253D` | `#F3F7FA` | primary copy |
| text-muted | `#607287` | `#9FB0C0` | secondary copy |
| border | `#D8E2EA` | `#294156` | separators and outlines |
| action | `#246BCE` | `#4D91F2` | general actions and focus |
| focus | `#E7F1FF` | `#173B61` | focus halo fill |
| success | `#168B5B` | `#36C78A` | available and complete |
| warning | `#C87808` | `#F0A52C` | stale and uncertain |
| danger | `#D74646` | `#FF6666` | destructive and recording |
| twisty | `#FF3B24` | `#FF573D` | Twisty routes and ride commit |
| scenic | `#10A6A6` | `#31C7C7` | Scenic routes |
| adventure | `#E99400` | `#F4B138` | Adventure routes, dashed |
| direct | `#8D9AAA` | `#7F90A3` | Direct routes |

Coral is not a general accent. It appears only for Twisty route meaning,
selection commitment, Start Ride, and the restrained recording indicator.

## Geometry and elevation

- Spacing uses a 4 px base grid: 4, 8, 12, 16, 20, 24, 32, 40.
- Interactive controls are at least 44 by 44 px.
- Inputs and compact controls use 10–12 px radii; cards use 16 px; sheets use
  24 px top corners; capsules are fully rounded.
- Borders are 1 px. Route strokes are 4–6 px with a contrasting casing.
- Light elevation: `0 8px 28px rgb(16 37 61 / 12%)`.
- Dark elevation uses borders and restrained `0 12px 32px rgb(0 0 0 / 32%)`;
  it does not use glow.

## Icons and marks

- Generic controls use Phosphor regular icons at 20 or 24 px with 2–2.25 px
  perceived stroke weight.
- The Switchback mark and route-profile glyphs are custom SVG assets.
- Icons never replace a necessary accessible name. Active tab state uses both
  color and a text/shape cue.

## Surface contracts

- Home: full-bleed map, compact weather/offline capsule, visible GPS state,
  spring sheet prompt, four quick actions, and persistent navigation.
- Route Ribbons: map geometry and horizontally synchronized cards; one adjacent
  card always peeks. Compare is secondary; Select is route-semantic.
- Route Details: road character, surface, best stretch, stops, weather/evidence,
  save/share/export, and a fixed Start Ride commitment.
- Ride HUD: one dominant maneuver, next maneuver, map, three compact tools, and
  a bottom telemetry strip. Decorative movement is disabled.
- Supporting surfaces preserve real loading, empty, success, error, denied,
  stale, interrupted, and offline states. Provider failures remain visible.

## Navigation and overlays

- Tabs are Plan, Library, Record, and Profile.
- Phone and tablet retain bottom navigation. Minimizing a sheet collapses only
  sheet content; navigation remains mounted and operable.
- Desktop uses a 72 px navigation rail, 420–480 px floating panels, bottom
  route ribbons, and a right details panel.
- Route details and overlays participate in browser history while the map stays
  mounted. Active ride is a dedicated state, not an overlay stack entry.

## Responsive behavior

- Phone reference viewport: 390 by 844 CSS px.
- Tablet: bottom navigation plus a 440–520 px constrained map sheet.
- Desktop: rail plus map workspace; no enlarged phone frame.
- Landscape phone: split map/panel where space allows and compact HUD otherwise.
- Safe-area insets are applied to fixed controls and navigation.

## Motion

- Sheets use a 220–320 ms spring-like transform.
- Route generation reveals geometry progressively over 450–700 ms.
- Planning GPS uses a low-amplitude 1.8 s pulse; recording uses a restrained
  red 1.4 s pulse.
- Active navigation suppresses decorative movement.
- `prefers-reduced-motion: reduce` removes springs, pulses, parallax, and route
  draw-in while preserving immediate state transitions.

## Accessibility

- WCAG AA contrast is required in both themes.
- Every interactive element has visible `:focus-visible` treatment.
- Sheets and overlays expose headings, dialog semantics when modal, focus
  return, Escape behavior, and screen-reader status announcements.
- Keyboard navigation and touch interaction must expose equivalent actions.
- Map-only meaning is duplicated in text. Route profiles never rely on color
  alone: Twisty glyph, Scenic markers, Adventure dashes, and Direct arrow/slate.

## Generated reference inventory

`design/generated/v1` contains a checksummed contact sheet and standalone crop
for each of the 11 mobile surfaces, four desktop primary screens, and four dark
primary screens. Generated references clarify layout only; where a generated
detail conflicts with the canonical board or this contract, this contract and
the canonical board win.
