# CINCO Design System Spec

## Tone
- premium,
- technical,
- outdoors-oriented,
- instrument-like,
- dark-friendly,
- restrained.

Avoid:
- generic SaaS purple gradients everywhere,
- excessive glassmorphism,
- card shadows on every surface,
- neon gaming UI,
- mimicking Google blue/white,
- decorative 3D that reduces map readability.

## Existing fonts
- Sora: display / key route titles / major maneuver.
- DM Sans: body / metrics / controls.

## Core sizing guidance

### Touch targets
- normal primary: >=44x44
- ride-mode critical: prefer >=48x48

### Floating controls
- 44–48 square,
- 8px inter-control gap,
- consistent radius.

### Phone side margin
- target 12–16 px depending on safe area.

### Sheet radius
- use existing sheet token where possible; visually about 20–24px top corners.

## Color semantics
Exact palette must be visually verified.

Required semantic roles:
- neutral map/surface,
- primary selected route,
- alternative route,
- navigation path,
- success / accepted,
- warning,
- closure/danger,
- gravel/surface,
- scenic/fun-road,
- informational/weather.

Never assign a brand accent to every state.

## Map route treatment

Selected:
- thick casing + clear inner line;
- readable on satellite and vector.

Alternative:
- thinner / less saturated;
- still tappable.

Traversed:
- muted.

Recalculating old route:
- dim/dashed or otherwise subordinate.

Navigation:
- strongest “current instruction” line.

Free Ride candidate:
- short opportunity segment highlight, visually different from active route.

## Elevation graphics
- simple line/area;
- current/selected point may highlight;
- optionally align major warnings/surface transitions;
- no decorative 3D chart.

## Empty states
Do not show giant illustrations.
Use map context and a short action.

## Loading
Prefer:
- route line placeholder/progress,
- compact phase label,
- stable layout.

Avoid:
- full-screen spinner for routine replans.

## Error
Errors must answer:
1. what failed,
2. whether route/map still works,
3. what action is available.

Example:
`Premium map unavailable — using standard map. Routing is unaffected.`
