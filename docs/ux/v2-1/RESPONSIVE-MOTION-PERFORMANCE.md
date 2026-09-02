# RESPONSIVE, MOTION & PERFORMANCE — Switchback V2.1

## Responsive geometry

Preserve existing structural tokens/owners. Do not replace safe-area-aware formulas with simplified hardcoded offsets.

Critical viewports:
- 320×700: smallest required phone. Idle planner stays within existing map-first cap, all primary controls reachable, no nav overlap, inputs >=16px.
- 390×844: primary phone target.
- 430×932: same control scale, more map breathing room.
- 844×390: short landscape; left rail, all destinations + Record reachable, compact planner, no tall copy.
- 768×1024: preserve narrow tablet planner behavior.
- 1024×768: native tablet landscape composition, not stretched phone.
- 1440×900: primary desktop target.
- 1920×1080: constrained instruments/content; avoid giant empty panels.

Plan idle/route-ready should not consume more map than needed. Full sheet is for details/options/edit, not the default result state.

Destination panels on phone:
- 8px-class outer inset;
- clear bottom nav/safe area;
- 14–16px internal padding;
- compact populated header;
- first useful row/card appears quickly.

Ride/Free Ride:
- map remains dominant;
- telemetry stays fully on-canvas;
- critical actions never move below the viewport;
- short landscape must retain maneuver/recovery legibility.

## Motion

Motion communicates containment and state continuity.

Timing:
- sheet/dock: 180–280ms;
- disclosure: 140–200ms;
- selection/press: 120–160ms.

Prefer transforms/opacity where practical. Avoid animating expensive layout properties across large map-facing surfaces.

Good transitions:
- Plan peek → idle feels like one sheet expanding;
- idle → loading retains context;
- loading → alternatives/prepare does not flash/rebuild the whole workspace;
- route selection changes accent and map geometry without unrelated movement;
- destination changes do not remount/reflow the map;
- Ride warning/recovery state transitions immediately and clearly.

Forbidden:
- animated gradients/glows;
- parallax;
- bouncing CTA;
- spring on every button;
- route-card auto carousel;
- decorative Ride motion;
- large continuous backdrop blur.

`prefers-reduced-motion` removes all non-essential movement without hiding state.

## Performance budget

This pass is presentation work; a major bundle/runtime cost increase is a defect.

Do not add:
- another general-purpose UI library;
- another animation framework unless CSS/current tools demonstrably cannot meet a real requirement;
- runtime webfont requests;
- another map instance;
- map renderer per Rides/Discover card;
- repeated route geometry calculations just for decorative mini graphics;
- always-on large blur filters;
- polling/timers for visual flourish.

Prefer:
- existing bundled Fontsource fonts;
- CSS transitions;
- current Phosphor icons;
- lightweight SVG identity graphics;
- memoized/already-derived presentation data;
- lazy loading for existing heavy secondary surfaces;
- CSS containment/overflow behavior that does not clip required content.

## Performance verification

At W4 record:
- before/current production build output and obvious bundle changes;
- no new heavy dependency in lockfile/package manifest;
- map does not remount when opening destinations;
- Plan sheet opening/closing feels responsive on WebKit/mobile viewport;
- Rides/Discover list scrolling has no obvious jank;
- Ride HUD changes do not cause map stutter;
- visual effects do not create sustained high paint/layout work.

Use browser profiling when there is an observed issue; do not introduce a new benchmark harness merely for this UX pass.

## Content stress

Test representative:
- long route name;
- long motorcycle name;
- 3-digit miles;
- 3-hour+ duration;
- warning present;
- missing distance/duration;
- long tag/description;
- 320px phone.

Never solve stress by shrinking critical UI below the design/accessibility floor.