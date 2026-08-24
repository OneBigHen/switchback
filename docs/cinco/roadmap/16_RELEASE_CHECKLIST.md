# CINCO Core Release Checklist

## Architecture
- [ ] Map workspace boundary exists.
- [ ] ContextSheet / responsive workspace model exists.
- [ ] Map viewport insets are tested.
- [ ] Major new behavior is not concentrated in PlannerShell/MapStage.
- [ ] Renderer-specific behavior is isolated.

## Phone UX
- [ ] Map-first home.
- [ ] Search is obvious.
- [ ] Free Ride / Round Trip / Destination obvious.
- [ ] Route sheet peek/half/full works.
- [ ] Route detail does not lose map context.
- [ ] Navigation HUD sparse.
- [ ] Add-stop keeps ride context.
- [ ] Landscape works.

## Tablet UX
- [ ] Landscape has real planning workspace.
- [ ] Portrait uses width intelligently.
- [ ] Map camera accounts for panels.
- [ ] Optional inspector does not crush map.

## Route intelligence
- [ ] Best/Twisty/Flowy/Scenic concepts work.
- [ ] Route reasons use real metrics.
- [ ] Alternatives show tradeoffs.
- [ ] Explicit user selection persists.
- [ ] Deep detail is expandable.

## Map
- [ ] Mapbox Standard validated.
- [ ] Standard Satellite validated.
- [ ] MapLibre fallback works.
- [ ] 3D terrain is useful and legible.
- [ ] Day/dusk/night route contrast works.
- [ ] Token/style failure does not kill routing.
- [ ] Route visual semantics centralized.

## Navigation
- [ ] Maneuver dominates.
- [ ] Next maneuver secondary.
- [ ] ETA/remaining/speed strip clear.
- [ ] Follow/recenter works.
- [ ] Recovery UI works.
- [ ] Warning priority works.

## Conditions
- [ ] Static traffic-controls naming fixed.
- [ ] Static construction naming fixed.
- [ ] PA live provider integrated where available.
- [ ] NJ live provider integrated where available.
- [ ] Weather normalized.
- [ ] stale/offline provider state honest.

## Free Ride
- [ ] Existing graph-backed engine preserved.
- [ ] Rolling/event-triggered evaluation.
- [ ] Dynamic workload.
- [ ] One moving suggestion.
- [ ] Take/Pass.
- [ ] Expanded detail when stopped.
- [ ] Cooldown/prompt budgets preserved.
- [ ] rider preference reaction preserved.

## Offline/performance
- [ ] Offline-v2 actual integration documented.
- [ ] No offline code removed.
- [ ] reduced/standard/premium map detail.
- [ ] no obvious memory/listener growth.
- [ ] PWA tests green.

## QA
- [ ] lint
- [ ] typecheck
- [ ] unit
- [ ] build
- [ ] critical browser
- [ ] relevant real-router
- [ ] PWA
- [ ] visual evidence
- [ ] physical ride drill before claiming ride UX release-ready
