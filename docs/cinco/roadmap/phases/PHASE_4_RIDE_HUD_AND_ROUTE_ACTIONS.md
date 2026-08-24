# Phase 4 — Ride HUD and Route Actions

## Goal
Create a true riding-state UI: glanceable, sparse, safe, and still capable when expanded.

## Default active ride screen

### Top maneuver card
Must contain:
- maneuver icon,
- primary instruction,
- distance to maneuver,
- next maneuver as secondary line.

### Map
Dominant surface.
Camera:
- looks ahead,
- respects top/bottom HUD occlusion,
- route remains high contrast,
- traversed route is visually subordinate.

### Bottom instrument strip
Must support:
- current speed,
- speed limit when known,
- ETA,
- remaining distance,
- arrival time or time remaining.

Do not show every metric simultaneously if width is insufficient.

## Secondary actions
One tap from bottom strip / More:
- Mute / voice
- Add stop
- Report
- Overview
- Route options
- End ride

If an action is unavailable, omit it rather than presenting a dead button.

## Add stop along route
Design behavior:
1. open search while preserving navigation context;
2. search category or text;
3. show estimated detour cost;
4. choose stop;
5. recalculate;
6. remain in ride mode.

This must not behave like abandoning navigation and reopening the planner.

## Route overview
Overview must:
- temporarily fit remaining route;
- show significant warnings/stops;
- offer obvious return to follow mode.

## Recovery
Off-route behavior should present:
- recalculating state,
- locked-road/corridor status where relevant,
- inability-to-recover warning only when real.

Do not surface internal debug detail.

## Hazard / warning policy
Prioritize:
1. immediate route obstruction/closure,
2. severe weather ahead,
3. route recovery issue,
4. fuel risk if modeled,
5. lower-priority advisories.

Avoid stacking multiple noncritical alerts.

## Moving interaction policy
No dense expanded scoring, raw diagnostics, or detailed route editing while active ride state indicates moving/high workload.

## Workload signal preparation
This phase should expose normalized ride signals needed by Phase 6:
- distance to maneuver,
- navigation complexity,
- off-route/recovery state,
- speed,
- heading stability if available,
- GPS confidence,
- recent user interaction,
- current warning severity.

Do not yet redesign Free Ride ranking here.

## Acceptance tests
- primary maneuver readable at target viewports;
- next maneuver secondary;
- manual map pan exits follow;
- restore-follow button works;
- add-stop flow preserves ride context;
- route overview returns to ride;
- warning priorities deterministic;
- high-workload state does not expose secondary interaction stack.

## Physical device note
A real iPhone/PWA ride drill remains strongly recommended before release.
