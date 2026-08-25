# Requirement Catalog

Requirement IDs are stable. Use them in PR descriptions and tests where practical.

## Shell / workspace

### UX-001 — Map-first default
Planner home must open with map as primary canvas, not a large form.

### UX-002 — Unified context surface
Planning/detail content must use a coherent ContextSheet / workspace-panel model rather than independent overlapping drawers.

### UX-003 — Progressive disclosure
Peek / half / full states expose increasing detail without navigation away from the map.

### UX-004 — Dynamic map insets
Map fitting/following must account for visible sheets and desktop/tablet panels.

### UX-005 — Responsive, not stretched
Phone portrait, phone landscape, tablet portrait, tablet landscape, and desktop must use intentionally different compositions where needed.

### UX-006 — Touch target floor
Primary touch controls must meet a 44x44 CSS px minimum.

### UX-007 — Rider-language summaries
Primary route summaries use rider-relevant metrics and words, not opaque total scores.

### UX-008 — Dense while stopped, sparse while moving
Information density must decrease substantially in active ride mode.

## Design system

### DS-001 — Semantic route tokens
Route and hazard visuals use centralized semantic tokens.

### DS-002 — Surface hierarchy
Map, floating control, sheet, selected card, warning, and modal surfaces have distinct roles.

### DS-003 — Typography hierarchy
Display, primary metric, supporting metric, metadata, and warning styles are explicit and consistent.

### DS-004 — Reduced-motion support
Core transitions respect `prefers-reduced-motion`.

## Map

### MAP-001 — Renderer boundary
Premium map integration must not couple route/business logic to one rendering provider.

### MAP-002 — Mapbox premium experiment
Support Mapbox Standard / Standard Satellite behind controlled configuration.

### MAP-003 — MapLibre fallback
Preserve functional MapLibre path during and after initial Mapbox adoption.

### MAP-004 — 3D terrain is functional
3D pitch/terrain must improve road/terrain understanding and remain legible.

### MAP-005 — Route visual hierarchy
Selected, alternative, traversed, recalculating, Free Ride, and navigation states are visually distinguishable.

### MAP-006 — Panel-aware camera
Fit/follow camera respects ContextSheet / workspace panel occlusion.

### MAP-007 — Layer taxonomy
User layers are grouped by rider purpose: Road Character, Conditions, Discovery, Map.

## Route results

### ROUTE-001 — Meaningful alternative labels
At least Best Match / Twistiest / Flowiest / Scenic concepts can be expressed when data supports them.

### ROUTE-002 — Route explanation
Selected route exposes rider-language reasons from existing scoring data.

### ROUTE-003 — Relative tradeoffs
Alternatives show meaningful deltas: added time/distance, surface, curvature/flow, towns/controls, etc.

### ROUTE-004 — Flowy profile
Introduce a first-class “Flowy” route preference using existing simplicity/coherence/stop/signal/urban/backtrack concepts before adding a new routing engine.

### ROUTE-005 — Expandable details
Elevation, surface, quality, weather/conditions, and scoring evidence are available without permanently covering the map.

### ROUTE-006 — Preserve explicit selection
Automatic ranking must never silently replace a route the user explicitly selected.

## Waypoints / editing

### EDIT-001 — Waypoint intent model
Move toward STOP / SHAPE / ROAD / OPTIONAL semantics.

### EDIT-002 — Missed shaping behavior
A passed SHAPE point must not indefinitely force the rider backward.

### EDIT-003 — Road intent
Road/corridor intent remains distinct from arbitrary point intent.

## Ride HUD

### RIDE-001 — Top maneuver focus
Primary maneuver and distance dominate active ride UI.

### RIDE-002 — Next maneuver
Next maneuver is visible but clearly secondary.

### RIDE-003 — Bottom trip strip
ETA / remaining distance / arrival and speed-limit context are compact and legible.

### RIDE-004 — Secondary actions hidden
Mute, Add Stop, Report, Overview, Route Options, End Ride remain one interaction away, not permanently occupying the screen.

### RIDE-005 — Contextual warnings
Weather/incidents/recovery warnings appear only when actionable/relevant.

### RIDE-006 — Follow-state clarity
Manual pan clearly exits follow; one obvious action restores it.

## Live road intelligence

### LIVE-001 — Provider interface
Implement live road conditions through a shared provider abstraction.

### LIVE-002 — PennDOT
Support Pennsylvania event / winter-condition data where credentials and coverage permit.

### LIVE-003 — NJ 511
Support New Jersey incident/closure information from an appropriate public feed/API.

### LIVE-004 — NWS
Keep/extend NWS weather alert integration as time-aware route context.

### LIVE-005 — Honest labeling
Static OSM traffic controls are never labeled real-time traffic. Static construction context is never labeled live closure data.

### LIVE-006 — Unified consumption
Planner, map, navigation, and Free Ride consume the same normalized road-condition domain.

## Free Ride

### FR-001 — Preserve graph-backed candidate engine
Do not replace the existing graph-backed system.

### FR-002 — Rolling horizon
Candidate evaluation reacts to meaningful movement / heading / expiry / conditions instead of relying only on blind fixed-interval polling.

### FR-003 — Dynamic workload
Replace hard-coded/constant workload input with a real workload estimator from available ride/navigation signals.

### FR-004 — One primary opportunity
While moving, present at most one primary suggestion.

### FR-005 — Minimal moving prompt
Moving prompt contains road/opportunity name, distance, added time, one or two high-value traits, and Take / Pass.

### FR-006 — Expanded stopped detail
Detailed score/reasons/provenance remain available when stopped/expanded.

### FR-007 — Preference controls
Free Ride setup supports rider intent such as Curves / Scenery / Flow / Gravel / max detour.

### FR-008 — Time-aware exploration
Design for “ride for N minutes,” “home by X,” or “stay within N minutes of home.” Implement only when the phase explicitly schedules it.

### FR-009 — Suggestion kinds
Support the domain’s intended categories over time: fun road, scenic detour, traffic escape, overlook, stop, loop.

### FR-010 — Sparse interruption policy
Respect cooldown/prompt history and expand workload suppression.

## Offline / performance

### OFF-001 — No offline regression
Online map improvements may not delete or bypass offline routing systems.

### OFF-002 — Verify worker integration
Explicitly verify how offline-v2 worker is currently consumed before claiming offline routing is complete.

### OFF-003 — Enriched road graph direction
Plan toward shared road-character edge attributes so Free Ride can eventually work offline.

### PERF-001 — Map interaction
Map drag/zoom should remain smooth on target devices; expensive overlays must not update on every React render.

### PERF-002 — Event-driven updates
Use source updates / refs / controllers appropriately for high-frequency map/navigation data.

### PERF-003 — Capability reduction
Weak devices have a reduced map detail option without losing core route legibility.

## QA

### QA-001 — Existing deterministic gates remain
No phase may weaken lint/typecheck/unit/build/critical browser gates.

### QA-002 — Visual baselines stabilized deliberately
Do not update snapshots automatically to make CI green.

### QA-003 — Responsive E2E
Critical planner and ride flows cover representative phone and tablet dimensions.

### QA-004 — Map provider failure
Mapbox token/network/style failure must have an intentional tested fallback or error path.

### QA-005 — No routing logic regression
Route provider / road-lock / real-router tests remain green after UX phases.
