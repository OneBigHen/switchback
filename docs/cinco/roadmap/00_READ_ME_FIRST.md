# Switchback CINCO UX / Product Upgrade Pack

**Date:** 2026-08-22  
**Purpose:** Execution-grade requirements for bringing Switchback from its current routing-heavy product into a map-first, motorcycle-native navigation experience with premium 3D cartography, progressive disclosure, stronger route explanation, a simplified ride HUD, and a substantially improved Free Ride mode.

## The one-sentence product target

> **Google Maps confidence and simplicity while navigating, with road intelligence Google Maps does not understand about why a motorcyclist would choose one road over another.**

## What this pack is

This is not a mood board and it is not permission for an agent to redesign the application however it wants.

It is a controlled, multi-phase implementation specification intended for an agent that:
- has little context,
- may be inexpensive,
- may overfit to screenshots,
- may refactor too aggressively,
- may invent APIs or behavior when instructions are vague.

The written requirements are authoritative. The visual boards in `references/visuals/` communicate tone, hierarchy, density, and the intended premium map experience. If a visual contradicts a written requirement, follow the written requirement.

## Required reading order

1. `01_PRODUCT_NORTH_STAR.md`
2. `02_CURRENT_BASELINE_AND_GUARDRAILS.md`
3. `03_UX_INTERACTION_SYSTEM.md`
4. `04_MAP_RENDERING_AND_3D_STRATEGY.md`
5. `05_REQUIREMENT_CATALOG.md`
6. `06_PHASE_ROADMAP.md`
7. The phase file you are implementing under `phases/`
8. `13_TEST_AND_ACCEPTANCE_MATRIX.md`
9. `14_AGENT_EXECUTION_PROTOCOL.md`
10. `15_MASTER_AGENT_PROMPT.md`

## Non-negotiable rules

1. **Do not replace the routing engine.** Preserve GraphHopper / Valhalla seams and current route-domain contracts.
2. **Do not rewrite the navigation engine.** The current map-matching/navigation behavior is an asset.
3. **Do not rewrite Free Ride from zero.** Extend its graph-backed candidate system and existing safety/preference seams.
4. **Do not turn Switchback into a dashboard.** The map is the primary canvas.
5. **Do not permanently occupy the phone with information cards.** Use progressive disclosure.
6. **Do not make moving-state UI denser.** Density increases while stopped, planning, or inspecting; ride mode becomes simpler.
7. **Do not hard-lock the product to Mapbox.** Mapbox may become the premium online renderer, but a renderer/fallback strategy must remain.
8. **Do not change behavior and architecture in one unreviewable PR.**
9. **One phase = one branch / PR unless the phase file explicitly allows smaller PRs.**
10. **No production deployment is part of this pack.**
11. **No silent test weakening.** Existing deterministic gates remain required.
12. **No “close enough” mobile UX.** Phone portrait, phone landscape, tablet portrait, and tablet landscape must be explicitly verified.
13. **No hidden magic values.** New layout constants, breakpoints, detents, map paddings, workload thresholds, and route-visual semantics must be named and documented.
14. **No new AI feature unless a requirement explicitly calls for it.**
15. **No social-feed expansion before core riding UX is complete.**

## Target completion definition

The program is complete when:
- a first-time rider can understand the map-first home screen within seconds;
- planning a strong ride requires only a few obvious actions;
- route alternatives explain *why* a rider might prefer each option;
- the app can expose dense route intelligence without obscuring the map;
- tablet uses available space for a true planning workspace rather than a stretched phone layout;
- active navigation is glanceable and intentionally sparse;
- Free Ride makes useful road suggestions without requiring a destination and without repeatedly interrupting the rider;
- premium 3D maps look cinematic but remain legible and performant;
- online premium mapping can fail or be disabled without destroying core routing/navigation behavior;
- existing route legality, road-lock, routing, PWA, and safety behavior remains intact.
