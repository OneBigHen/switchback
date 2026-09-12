# OpenGravel Graphics Asset Guide

## Goal

Keep OpenGravel visually distinctive without turning graphics into a parallel UI system. Data-driven visuals should explain real route/rider evidence; editorial art should add personality only where comprehension or brand memory benefits.

## Directory taxonomy

```text
src/components/graphics/        React/CSS/SVG primitives driven by live data
src/components/graphics/icons/  20–32px currentColor semantic icons
public/visual-system/brand/     static marks and identity assets
public/visual-system/illustrations/ optional editorial SVG/WebP assets
public/visual-system/previews/  optional static preview imagery
```

Do not place one-off feature art in random component directories.

## Choose the right format

### Inline React SVG

Use for:

- route shape thumbnails
- elevation profiles
- evidence meters
- surface mix
- rider-character bars
- small feature icons
- bike silhouettes
- symbolic map previews

Reasons: themeable, crisp, tiny, accessible, data-driven, no additional request.

### Static SVG

Use for:

- OpenGravel marks
- simple onboarding diagrams
- simple editorial feature illustrations that do not depend on runtime values

Keep static SVGs self-contained. No external URLs, linked fonts, scripts, or `<image>` references unless an explicit security review approves them.

### WebP / AVIF

Use only for larger editorial illustrations where SVG would become unwieldy: a detailed Gravel Goblin scene, rich promotional onboarding art, or share/marketing art.

Core planner usability must never depend on raster art loading.

## Generated-art policy

Generated illustrations are allowed as art-direction/personality assets, not as factual representations.

They must never be used to imply:

- a road exists or is open;
- a route follows a particular line;
- a surface type is verified;
- a place/landmark is present;
- weather/traffic/closure conditions are current;
- a model has verified deterministic routing output.

Do not bake important UI wording into generated images. Keep copy as real HTML.

## Gravel Goblin usage

Preferred:

- first-run advisor introduction;
- `I learned enough rides to personalize this` milestone;
- empty ride-memory state;
- explanation of AI model/privacy behavior;
- occasional advisor detail state.

Avoid:

- every chat turn;
- every route card;
- safety warnings;
- provider failures;
- active turn-by-turn navigation;
- map controls.

At compact sizes, use a dedicated cropped head/avatar rather than shrinking a full illustration.

## Semantic visual states

Use these meanings consistently in integration work:

| State | Meaning | Required non-color cue |
| --- | --- | --- |
| Measured / verified | evidence OpenGravel actually measured/received | numeric value, solid shape, or `Measured`/`Verified` text |
| Proposed / preference | rider or advisor intent that still needs routing | preference label, before→after cue, or proposal wording |
| Neutral | navigation/context | ordinary icon/label |
| Warning / failure | hard incompatibility or failure | warning icon + text |
| Unknown | insufficient/unavailable evidence | dashed/pattern treatment + `Unknown`/`Still learning` text |

Never use green alone to mean verified or gray alone to mean unknown.

## Icon construction rules

The rider-character icon family uses:

- `viewBox="0 0 24 24"`;
- `currentColor` strokes/fills;
- no gradients;
- no embedded text;
- recognizable silhouettes at 20px;
- line weights around 1.7–2.2px;
- no brand/provider logos.

New icons should match those constraints.

## Route graphics rules

For any named saved, recorded, imported, or community route:

- use actual geometry if a route line is displayed;
- if geometry is unavailable, show a neutral unavailable/decorative placeholder clearly distinct from a real path;
- do not seed a plausible-looking line from route ID and let it be mistaken for the actual route;
- simplify geometry upstream for lists if payload/performance requires it, but preserve the real shape.

## Data visualization rules

- Charts supplement text; they never replace the measured value.
- Normalize only presentation dimensions, not source values displayed in labels.
- Distinguish numeric zero from missing evidence.
- Clamp bounded UI scales only at the rendering boundary; domain code remains responsible for validation.
- Preserve unknown categories in distributions instead of silently dropping them.
- Never interpolate a missing elevation profile from ascent/descent totals.

## Accessibility

Meaningful SVG:

- explicit `role="img"`;
- caller-provided accessible label;
- visible numeric/text values remain outside or alongside chart where practical.

Decorative SVG:

- `aria-hidden="true"`;
- `focusable="false"`.

Interactive controls still require actual HTML buttons/inputs; do not make an SVG itself the control.

Test forced-colors/high-contrast behavior. Pattern/dash/outline should survive when custom colors are removed.

## Performance budgets

- No graphics-specific runtime dependency.
- No network request from `src/components/graphics/**`.
- No canvas/WebGL for small UI graphics.
- Route normalization is O(n).
- Prefer simplified preview geometry for large lists rather than repeatedly drawing thousands of points per card.
- Avoid large hidden illustration assets in the planner bundle.

## Naming

Use product meaning, not appearance:

- `RouteThumbnail`, not `SquigglyLineGraphic`;
- `SurfaceMixBar`, not `ColoredSegments`;
- `EvidenceMeter`, not `GreenProgress`;
- `HighwayAvoidanceIcon`, not `SlashRoadIcon`.

This keeps components stable if visual styling changes later.

## Review checklist for a new graphic

Before adding one, ask:

1. Does it explain data or meaning faster than text alone?
2. Is it showing real evidence or merely decoration?
3. If factual, is every displayed fact grounded in a deterministic data source?
4. Does an unknown/missing state exist?
5. Can a screen-reader user still get the same information?
6. Does it remain understandable without color?
7. Can it be implemented with the existing visual primitives?
8. Is it worth its bundle/layout cost on a phone mounted to a motorcycle?

If the answer to #1 is no, do not add the graphic.
