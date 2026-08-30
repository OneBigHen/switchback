# Switchback Design Contract V2.0

Status: **replacement visual and interaction source of truth**  
Baseline: `main@2774091a1dbb5205145c018689da1083ff34b90f`  
Mode: **Operate**  
Product character: **cartographic field instrument for motorcycle riders**

This contract supersedes `design/archive/DESIGN-CONTRACT-v1.1.0.md`. Do not maintain two active visual truths.

## 1. Visual thesis

Switchback should look like a purpose-built route instrument that happens to be beautifully branded.

It should evoke:
- topographic maps,
- trail notebooks,
- instrument clusters,
- durable motorcycle gear,
- field guides,
- understated premium outdoor equipment.

It should **not** evoke:
- an AI SaaS dashboard,
- a generic blue fintech application,
- a DTC outdoor ecommerce landing page,
- a Dribbble concept with giant headings and unusable whitespace,
- a dashboard builder with arbitrary widgets,
- a translucent-glass mobile template.

The **map supplies atmosphere**. The **chrome supplies control**.

## 2. Approved core palette

These values are extracted from the owner's approved brand boards and are canonical brand colors:

| Brand token | Hex | Purpose |
|---|---:|---|
| Switchback Ink | `#161D1C` | deepest chrome, dark canvas, primary text |
| Deep Spruce | `#243A35` | dark raised surfaces, secondary dark chrome |
| Trail Moss | `#65745D` | muted semantic accent, valid normal text on Paper |
| Topo Sage | `#9DA98F` | quiet fills, map/topo accents, decorative rules |
| Canvas | `#F4F0E7` | warm app background |
| Paper | `#FBF9F4` | primary light surface |
| Sandstone | `#D8C8B7` | borders/fills, warm neutral |
| Slate | `#68716F` | muted text, borders |
| Ember | `#D65A36` | route highlight, selected geometry, brand accent |
| Signal Blue | `#397C96` | GPS/navigation information, location state |
| Golden Hour | `#C99A46` | cautionary/warm contextual accent |
| Trail Brown | `#776353` | terrain/surface context, secondary text in light UI |

### Functional accessibility variants

Brand colors may not be altered casually. These derived functional colors exist only where text contrast requires them:

- `--sb-ember-strong: #BF4829` — filled primary button background with Paper text.
- `--sb-signal-strong: #2A6175` — filled information/navigation button background with Paper text.
- `--sb-danger: #A83E32` light / `#E57368` dark.
- `--sb-success: #3E6B55` light / `#72A98A` dark.
- `--sb-border-dark: #3B4945`.
- `--sb-dark-raised: #1C2825`.

Ember is not body text on Paper. Topo Sage is not body text on Paper. Golden Hour is not body text on Paper.

## 3. Semantic themes

### Light planning theme

- Canvas: `#F4F0E7`
- Surface: `#FBF9F4`
- Raised surface: `#EFE9DE`
- Text: `#161D1C`
- Muted text: `#5F6967` (AA-adjusted Slate; raw Slate `#68716F` reaches 4.4:1 on Canvas, below the AA floor, and stays reserved for borders/decorative fills)
- Quiet text: `#776353`
- Border: `#D8C8B7`
- Primary route/accent: `#D65A36`
- Primary filled action: `#BF4829`
- Location/navigation info: `#397C96`
- Focus ring: `#2A6175`
- Link/interactive text: `#2A6175` (`--sb-text-link`; AA on Canvas/Paper/Raised)

### Dark planning theme

- Canvas: `#161D1C`
- Surface: `#1C2825`
- Raised surface: `#243A35`
- Text: `#FBF9F4`
- Muted text: `#B9B6AB`
- Border: `#3B4945`
- Route/accent: `#E56A45`
- Primary action: `#D65A36`
- Location/navigation info: `#5D9CB3`
- Focus ring: `#7FB5C7`
- Link/interactive text: `#7FB5C7` (`--sb-text-link`; AA on Ink/Spruce)

### Ride Focus theme

Active guidance, recording and Free Ride Live use dark chrome in both day and night:
- Ink/Spruce surfaces
- Paper text
- Ember route/commit
- Signal Blue current-position/navigation state

The map itself can remain daylight/auto-lit underneath. The stable dark HUD keeps glance behavior consistent and reduces layout/theme variance while riding.

## 4. Typography

Replace the current Sora + DM Sans product UI with the brand-board pairing:

- **Headings / compact identity / section markers:** Oswald Variable.
- **Body / controls / numeric UI:** Inter Variable.
- Fonts must be bundled locally through the existing fontsource approach or an equivalent package; no runtime Google Fonts request.

Rules:
- Use Oswald as an instrument face, not as a marketing megaphone.
- Page title: 24–30px phone, 28–34px desktop.
- Section title: 18–22px.
- Compact route/ride title: Inter 15–18px semibold is acceptable when dense scanning is more important.
- Labels: Inter 11–13px, sentence case by default.
- Micro-eyebrows: Oswald 10–11px, uppercase, tracking 0.08em, only when they carry category/state.
- Body: 14–16px.
- Secondary: 12–13px.
- Telemetry: Inter with `font-variant-numeric: tabular-nums lining-nums`.
- Do not use uppercase paragraphs.
- Do not display a giant 40–52px headline inside a map planning sheet.

## 5. Geometry

Use a 4px base grid.

Spacing:
`4, 8, 12, 16, 20, 24, 32, 40`

Radii:
- inline chip/segmented element: 6–8px
- input/button: 8–10px
- object card: 10–12px
- phone sheet top corners: 16–20px
- desktop panel: 12–16px
- full pill only for status chips or true capsules

No default 24–28px radius on every rectangle.

Borders:
- 1px standard
- 2px selected object/route emphasis when needed
- shadows restrained; borders and tonal separation do most work

Touch:
- hit target at least 44×44 CSS px
- visual icon button may look 36–40px if its hit target remains 44px

## 6. Elevation and material

Light:
- primary floating panel: `0 8px 24px rgb(22 29 28 / 10%)`
- small control: `0 2px 8px rgb(22 29 28 / 9%)`

Dark:
- prefer border/tonal separation
- maximum shadow: `0 10px 28px rgb(0 0 0 / 26%)`
- no neon glow

Backdrop blur is allowed only where it materially improves map readability and must remain subtle. Never use glass styling as the identity.

## 7. Topographic motif

Allowed:
- launch/empty state,
- Discover headers,
- route poster/Atlas artwork,
- subtle selected-sheet header texture,
- offline/map-pack preview.

Not allowed:
- behind body text,
- behind every card,
- on active navigation controls,
- as a repeating decorative layer that reduces map/text clarity.

## 8. Logo use

Use the approved Switchback mark. Do not create a new symbol during the redesign.

Display it:
- desktop rail header,
- PWA/launch/icon surfaces,
- Discover/public brand surfaces,
- optional compact settings/about surface.

Do not repeat the full wordmark and tagline inside the Plan bottom sheet.

The tagline **“Find the roads worth riding.”** is reserved for:
- external/public brand surfaces,
- Discover empty/first-use moments,
- launch/about.

It is not planner filler.

## 9. Icons

- Continue using Phosphor for generic controls.
- Use consistent 20px/24px sizes.
- Use custom SVG only for the Switchback mark and product-specific map/route glyphs.
- Eliminate sparkles as a generic “smart/AI” signifier.
- Free Ride should use a winding-road/route glyph, not a magic sparkle.
- Icon-only buttons require accessible names and tooltips on hover-capable devices.

## 10. Cards and separators

A card represents an **object**:
- route candidate,
- saved ride,
- recorded ride,
- Discover route,
- bike,
- active warning that needs action.

A grouping of settings is usually not a card. Use:
- section heading,
- rows,
- dividers,
- grouped list background.

Do not nest cards inside cards merely to create hierarchy.

## 11. Motion

Allowed:
- sheet/dock movement 180–280ms,
- route selection/ribbon emphasis,
- map geometry transition,
- small selected-state transitions,
- long-press/reorder affordance,
- one restrained recording pulse.

Disallowed:
- decorative parallax while planning,
- springing every button,
- route-card hover theatrics,
- animated gradient/glow,
- decorative movement while riding.

`prefers-reduced-motion` removes all nonessential motion.

## 12. Map overlay colors

- Selected route: Ember with high-contrast casing.
- Alternatives: lower-opacity neutral/role colors but never equally prominent.
- Current position/navigation guidance: Signal Blue.
- Avoid area: warm danger/Ember family, low-opacity fill, solid selected edge.
- Unpaved intelligence: Trail Brown / Moss family.
- Great roads: Ember/Golden Hour intensity scale, not a debug dashed orange carpet.
- Traffic/closure colors remain semantically conventional when later phases land; do not force brand colors onto danger/closure semantics.

## 13. Accessibility

- WCAG AA for text/control states.
- Keyboard equivalence for every map-object edit that has a touch/mouse gesture.
- Focus visible on every interactive element.
- Never use color as the only selected/route-profile signal.
- Safe areas respected.
- Minimum 44px touch targets.
- Modal focus trapping only for true modal flows; primary destinations are not dialogs.
- Screen-reader announcements for route planning progress, selection, reroute, GPS degradation, recording state and destructive actions.

## 14. Design debt rule

Do not add `switchback-v2-overrides.css`.

V2 must progressively delete the need for:
- duplicate token definitions,
- `switchback-v1.css`,
- stale per-surface overrides,
- “loads last to neutralize previous rule” comments.

Every migrated surface ends with fewer competing style authorities than it started with.
