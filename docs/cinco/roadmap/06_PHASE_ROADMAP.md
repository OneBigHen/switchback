# Multi-Phase Roadmap

## Program sequencing

The order is intentional. Do not start with Mapbox polish inside the existing monolith.

| Phase | Name | Main outcome | Depends on |
|---|---|---|---|
| 0 | Baseline + UX contract | Stable evidence and screen-state contract | Current main |
| 1 | Map Workspace architecture | ContextSheet, viewport insets, smaller UI boundaries | Phase 0 |
| 2 | CINCO visual system + premium map | Responsive shell, semantic tokens, Mapbox experiment | Phase 1 |
| 3 | Route intelligence UX | Best/Twisty/Flowy/Scenic results + deep detail | Phase 2 |
| 4 | Ride HUD + route actions | Sparse navigation, add-stop/overview/recovery | Phase 3 |
| 5 | Live road intelligence | PA/NJ incidents/closures/winter + unified conditions | Phase 4 |
| 6 | Free Ride 2.0 | Rolling discovery + dynamic workload + minimal prompts | Phase 5 |
| 7 | Offline/performance hardening | Renderer fallback, offline verification, device tiers | Phase 6 |
| 8 | Post-core expansion | Group rides/community/automotive exploration | Phase 7 |

## Why this order

### Phase 1 before visuals
If the agent paints the current monolith, later interaction changes will undo the work and increase regression risk.

### Route UX before Free Ride 2.0
Free Ride should reuse the same route-character vocabulary and visual language as normal planning.

### Ride HUD before Free Ride 2.0
Free Ride moving prompts need the same workload/safety/overlay rules as navigation.

### Live conditions before Free Ride 2.0
Traffic-escape and condition-aware suggestions require a normalized conditions service.

### Offline/performance after feature shape is clear
Do not optimize the wrong UI architecture.

## Release slices

Each phase must result in a usable product state.
No phase may leave the default UI half-migrated.

Feature flags are acceptable when:
- there is one documented owner,
- the old path remains functional,
- the flag has a removal criterion,
- tests cover both paths while both exist.

## Estimated implementation risk

- Phase 0: Low
- Phase 1: Medium/High
- Phase 2: Medium/High
- Phase 3: Medium
- Phase 4: Medium
- Phase 5: Medium
- Phase 6: High
- Phase 7: High
- Phase 8: Separate program

## “Stop and ask” decisions

An executing agent must not silently choose:
- whether Mapbox permanently replaces MapLibre;
- whether to buy/enable a commercial traffic provider;
- whether to change routing provider algorithms;
- whether to delete an offline implementation;
- whether to alter privacy defaults for ride data;
- whether to add a native mobile app;
- whether to make CarPlay/Android Auto a core phase;
- whether to add authentication/social requirements not already present.

Document the decision and continue only with the conservative existing behavior.
