# Data Density and Progressive Disclosure

## Principle

“Pack as much data as possible” does **not** mean “show everything simultaneously.”

The design target is:
- high data availability,
- low initial cognitive load,
- one-step detail access,
- preserved map context.

## Route data ladder

### Level 0 — glance
- label,
- time,
- distance,
- elevation,
- 2–3 trait words,
- critical warning indicator.

### Level 1 — quick expansion
- great-curve miles,
- uninterrupted back-road miles,
- pavement/gravel,
- traffic controls,
- relative detour,
- top weather/incident summary.

### Level 2 — detailed analysis
- elevation chart,
- surface distribution,
- curve distribution,
- urban/town exposure,
- warnings by location/time,
- fuel/POIs,
- route comparison.

### Level 3 — advanced
- full scoring dimensions,
- data confidence,
- road provenance,
- provider/degradation warnings,
- technical route-lock details.

## Free Ride ladder

### Moving
- one opportunity,
- distance,
- added time,
- traits,
- Take / Pass.

### Stopped expanded
- why it was chosen,
- route fragment preview,
- route-quality explanation,
- surface/weather,
- preference match,
- confidence.

### Debug
Developer-only diagnostics, never normal rider UI.

## Conditions ladder

### Glance
`2 issues ahead`

### Quick
`Lane closure · 18 mi`
`Heavy rain warning · ETA 42 min`

### Detail
- source,
- updated time,
- affected lanes,
- event duration,
- detour,
- confidence/staleness.

## Visual rules

- use small typography only for metadata, never primary safety information;
- two-column metric grids are fine in expanded sheets;
- avoid more than 4–5 equal-weight metrics in one row;
- use icons only when familiar/meaningful;
- charts must not make text unreadable;
- keep the primary route line stronger than every overlay.

## Tablet advantage

Tablet may expose:
- persistent route stats,
- elevation profile,
- alternative route list,
while preserving a large map.

Do not use tablet space merely to increase card padding.
