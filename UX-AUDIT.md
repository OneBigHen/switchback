# UX audit — Switchback

**Date:** 2026-07-14
**Auditor:** Codex (`sp-ux-audit`)
**Pages audited:** 1 application route, across planner, comparison, library, layers, and ride states
**Overall score:** 3.7/4

## Pillar scores

| Pillar | Score | Summary |
|---|---:|---|
| Visual consistency | 4/4 | The warm map canvas, cream planning surfaces, orange route signal, typography, radii, and icon system are consistent across every state. |
| Layout and responsiveness | 4/4 | Desktop, portrait phone, and two short-landscape phone sizes keep the planner, library, ride HUD, and primary actions inside the viewport. |
| Interaction quality | 4/4 | Plan, replan, start, minimize, directions, library, import/export, map layers, and ride controls expose immediate feedback and useful states. |
| Accessibility | 3/4 | Core controls are labeled and keyboard reachable; the library traps/restores focus and the layers popover closes with Escape. A full automated WCAG contrast audit is still recommended before public launch. |
| Performance and errors | 3/4 | No application console exceptions appeared in the audited flows. Map and routing quality still depend on external tile, weather, geocoder, and routing services. |
| Content and copy | 4/4 | Calls to action are specific and ride-oriented; empty, loading, offline, GPS, reroute, and weather states use human-readable copy. |

## Resolved findings

### Primary route actions disappeared below long content

The route planner previously placed planning and ride-start actions below configuration, route comparison, and weather content. A persistent command dock now keeps `Plan route` visible before routing and changes to `Replan` plus `Start ride` when a route is ready.

Evidence: [desktop planner](artifacts/screenshots/e2e-planner-desktop-chromium.png), [portrait planner](artifacts/screenshots/e2e-planner-mobile-safari.png)

### Mobile sheet looked draggable but could not be minimized

The decorative sheet handle was replaced with a keyboard-accessible minimize control. The minimized state preserves route context and the primary action, and an explicit expand control restores the planner.

### Map controls overlapped on portrait phones

The layers control and MapLibre location/zoom stack occupied the same top-right space. The layers control now moves to the top-left below 760px, and a browser regression assertion prevents future overlap.

### Turn instructions were hidden until ride mode

The selected route now includes an expandable, scrollable turn-by-turn preview with street names and segment distances. The toggle has a concise dynamic accessible name.

### Layers popover lacked keyboard dismissal

Escape now closes the layers popover and returns focus to its trigger.

## Evidence matrix

| State | Desktop | Mobile portrait | Mobile landscape |
|---|---|---|---|
| Planner and comparison | [desktop](artifacts/screenshots/e2e-planner-desktop-chromium.png) | [portrait](artifacts/screenshots/e2e-planner-mobile-safari.png) | [landscape](artifacts/screenshots/e2e-planner-mobile-landscape-narrow.png) |
| Route library | [desktop](artifacts/screenshots/e2e-library-desktop-chromium.png) | [portrait](artifacts/screenshots/e2e-library-mobile-safari.png) | [landscape](artifacts/screenshots/e2e-library-mobile-landscape-narrow.png) |
| Ride guidance | [desktop](artifacts/screenshots/e2e-ride-desktop-chromium.png) | [portrait](artifacts/screenshots/e2e-ride-mobile-safari.png) | [landscape](artifacts/screenshots/e2e-ride-mobile-landscape-narrow.png) |

## Remaining non-blocking work

- Run a dedicated WCAG color-contrast scanner against production map styles.
- Validate live GPS, speech synthesis, and automatic rerouting on a physical phone over HTTPS.
- Load-test very large GPX libraries and unusually instruction-heavy routes.
