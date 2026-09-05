# Switchback design direction

## Keep the identity; replace the composition

Retain the approved Switchback mark, local Oswald/Inter pairing, and V2 palette in `src/app/styles/tokens.css`. The audit does not justify another rebrand. Current screens fail through hierarchy, clipping, disclosure, and contrast over map content. Fix those contracts rather than adding an override theme.

`design/DESIGN-CONTRACT.md` remains the brand reference. This document proposes stricter task and screen contracts for the refactor; wave 0 must reconcile them into one authority. Do not maintain competing token files.

## Layout by task and available space

| Context | Composition | Space rule |
|---|---|---|
| Phone portrait, idle | Search/start row + concise ride entry actions; bottom primary navigation | Default composer ≤160px, navigation/safe area separate; no permanent AI invitation card |
| Phone portrait, route choice | Selected route summary + horizontally discoverable alternatives or expandable comparison list | Default map-visible height ≥45% of usable viewport; one clear Prepare/Ride action |
| Phone editing | Context sheet with compact/half/full detents and pinned task action | Full sheet only after deliberate expansion; active map object remains visible when manipulation is required |
| Tablet ≥768px with adequate height | 320–380px docked workspace + map | No stretched mobile sheet; selected route and stops can coexist |
| Desktop ≥1100px | 360–420px left workspace; route comparison inside it; map receives remaining width | More width improves comparison and editing, not hero typography |
| Very wide desktop | Same readable workspace, optional task-specific second column for comparison/itinerary | Map stays useful; avoid filling space with extra widgets |
| Any landscape viewport ≤500px tall | Compact side workspace ≤42vw, or collapsed task strip | No tall card carousel in a clipped short panel; controls and primary action remain reachable |
| Active riding | Opaque instruction surface + quiet map + compact controls | One primary instruction, one secondary cue, up to three default metrics |

Breakpoints are proposals to validate at named sizes, not excuses to classify an 844×390 phone as a desktop. Height, touch input, safe areas, and keyboard visibility participate in layout. At 320×568, permit a vertically scrolling task list rather than squeezing three unreadable cards into a short carousel.

Compute the usable map rectangle from actual panel geometry. Fit the selected route and active object inside it. When a panel changes size, adjust only enough to retain context; do not reset the camera after every API update or steal it after the rider pans.

## Typography and information density

Use Oswald for the product mark and brief section headings, never long route descriptions. Inter 16px is the phone input/body baseline, 14px for secondary route facts, 12px minimum for nonessential metadata. Route names 16–18px semibold; main duration 22–26px; riding maneuver 24–32px depending on available height. Use tabular figures for time/distance. Avoid multi-line stacks such as "Compare / after / selecting."

Remove repeated "Route options / Choose your route / Choose your ride" headers. A selected route row should read: "Best ride · 37 min · +7 min" followed by one sentence explaining what those seven minutes buy. Labels come from rider meaning, never "Balanced alternative 2."

Spacing uses existing `4, 8, 12, 16, 20, 24, 32, 40` tokens. Use 12–16px inside compact route rows, 16px sheet edges, 8px between related controls, 24px between distinct task groups. Separate groups with spacing/rules instead of nesting cards.

## Color, contrast, and elevation

| Meaning | Existing token / treatment |
|---|---|
| Light surface/text | Paper `#FBF9F4` / Ink `#161D1C` |
| Dark surface/text | `#1C2825` or Spruce `#243A35` / Paper |
| Commitment | Ember strong `#BF4829` with Paper text |
| Selected route | Ember `#D65A36`, dark casing/light halo as basemap demands |
| Position/navigation | Signal `#397C96`; stronger `#2A6175` for text on light surfaces |
| Caution | Golden Hour as icon/background accent with independently contrasting text |
| Excluded area | Danger outline + restrained hatched fill + text label |
| Uncertainty | Neutral patterned/dashed treatment and explicit text; never healthy green |

Normal text ≥4.5:1, large text and meaningful nontext graphics ≥3:1. Critical Free Ride text must sit on an opaque surface; white text directly on a daylight map failed the captured screen. Test the actual composited surface, not token pairs alone. Selected state uses border/checkmark/text in addition to color.

Use three elevations: map-attached controls; task workspace; modal interruption. One restrained shadow (`0 8px 24px rgb(22 29 28 / 10%)`) plus a border is sufficient for the workspace. Do not add a separate shadow to every nested row. Existing 8–10px control, 12px card, and 18px sheet radii are adequate.

## Cartography and route comparison

At common planning zoom, selected route width 6px plus 2px contrast casing; alternatives 4px and visibly subordinate. Increase hit corridor to 24px independent of visual width; where routes overlap, tap opens an accessible chooser instead of guessing. Route text labels are collision-managed and belong to visible route segments; never stack three identical ETA labels on one junction.

Show start A, finish B, numbered stops, and unnumbered shaping handles. A stop is a planned visit; a shaping point influences the road without pretending to be a destination. Preserved sections have endpoint brackets and a "Keep" badge. Avoided roads use exclusion marks; avoid polygons remain selectable when filled.

During edits, retain the previous line and draw the proposed changed segment with a distinct dashed treatment. Unchanged geometry stays quiet. On success, show a short local transition and a time/surface delta; on failure, the old line remains usable with its status clear. Never animate the whole route repeatedly while comparing evidence.

Surface styling is available as a focused route inspection mode with a legend. Do not encode route selection, surface, provider, difficulty, traffic, and confidence into one rainbow line.

## Components and controls

Use cards for actual alternative rides, saved rides, or AI proposals. Use rows for preferences, stops, and preparation facts. Use a sheet for a task and a dialog only for a decision requiring exclusive attention.

One primary filled action per task: Find ride, Apply change, Prepare, or Start ride. Secondary actions are labeled neutral buttons. Destructive actions are contextual and recoverable where possible. Remove persistent Clear route from the dominant riding preparation position; place Start new ride in the route menu with undo/recovery.

Planning controls: minimum 44×44px hit area, 8px separation for adjacent map actions. Riding actions target 56×56px, with a glove/device test. Icons use the existing Phosphor family and consistent stroke weight. Uncommon actions require visible labels; a padlock alone cannot mean preferred roads. Hover tooltips do not solve touch discoverability.

AI occupies the same change/proposal pattern as manual edits. Collapsed entry: "Ask about this ride." Expanded: concise conversation, mapped proposal, measured change, Apply/Discard. Keep the Goblin persona optional and restrained; no mascot is required to understand or operate the product.

## Motion, feedback, and accessibility

Pointer feedback appears by the next practical frame; no network request per pointer move. Use 120–180ms for selection feedback and up to 280ms for sheet transitions. Respect reduced motion by removing camera flights and spatial morphs. Progress states announce their actual phase, keep Cancel visible, and preserve focus.

Support keyboard search, waypoint ordering, object selection through a list, Escape to cancel a gesture, undo/redo shortcuts outside editable text, and focus return to the invoking control. Announce routing success/failure and selection changes without reading an entire result list repeatedly. Do not place time-sensitive actions exclusively in a transient toast.

Validate complete screens: default/expanded planner, selected option, active edit, drawing, avoid area, AI proposal/error, preparation, Free Ride, off-route, GPS loss, offline, discovery empty/error, and import recovery. Pixel baselines detect change; human visual review decides whether the result is usable.
