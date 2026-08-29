# ADR 0016: Google 3D is a cinematic preview, never the navigation renderer

## Decision

Google Maps JavaScript 3D Maps (`maps3d`, `Map3DElement`, `Polyline3DElement`)
powers one optional surface: a photorealistic preview of the already-selected
route. The `maps3d` library is lazy-loaded only when the rider opens Cinematic,
the element is disposed on close, and Mapbox and Google never render active
canvases at the same time. Cinematic shows a single selected route with a
route-level camera fit, manual orbit, and an optional capped fly-through; it has
no planning, editing, or guidance role. Where imagery or 3D coverage is poor the
surface says so and offers Satellite instead.

## Consequences

Switchback gains a high-wow preview without becoming two planners. The browser
needs a referrer-restricted Google Maps key, delivered through the capabilities
payload; Immersive Maps' 5,000 free loads/month is ample because initialization
requires an explicit tap. Raw Photorealistic 3D Tiles and Cesium are not used.
Cinematic failure is non-blocking: planning and ride are unaffected, and the
control is hidden entirely when the capability is off.
