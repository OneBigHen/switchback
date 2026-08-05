# Desktop Editing Specification

## Purpose

Desktop is a deliberate route workspace, not a wider phone sheet.

## Layout

```text
┌──────────────────┬──────────────────────────────┬──────────────────────┐
│ Builder 360–420  │ Map flexible                 │ Inspect 380–480      │
└──────────────────┴──────────────────────────────┴──────────────────────┘
```

Panels may be collapsible/resizable.

## Builder

Start/finish, mode, shaping stops, per-leg character, active bike, surface policy, highway/toll options, avoid areas, road requirements, undo/redo, dirty state, save draft, and replan.

## Map

Candidates, selected emphasis, subdued alternatives, drag handles, requirements, avoid areas, evidence layers, styles, follow control, and full-screen mode.

## Inspect

### Compare
Time, distance, detour, road/surface mix, unknown surface, twistiness, confidence, provider, warnings, and personalized fit.

### Directions
Maneuvers, segment highlight, search/filter, and cues export.

### Prepare
Weather, offline readiness, fuel, data age, GPX, and sharing.

## Interactions

Keyboard undo/redo, delete point, reorder stops, Escape drawing mode, save shortcut, route candidate shortcuts, persisted panel sizes, and unsaved-change warning.

## Visual rules

Map primary, route choice secondary, evidence tertiary, experimental tools separated. Remove duplicate branding and generic scenic imagery.

## Responsive boundaries

- under 900 px: mobile;
- 900–1199: two-pane;
- 1200+: three-pane.
