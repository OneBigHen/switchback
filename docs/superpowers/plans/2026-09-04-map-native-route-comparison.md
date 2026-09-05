# Map-native route comparison implementation plan

**Goal:** join route choice cards, map geometry, and Gravel Goblin recommendations through existing deterministic route IDs while keeping preview transient.

**Architecture:** add a tiny external preview channel beside the planner store, enrich route GeoJSON with preview state, add a broad hit-test layer, and route all committed selection through the existing planner store command.

## Tasks

1. Add failing component/unit tests for selected-route-relative deltas, card preview/focus behavior, stale preview clearing, and GeoJSON preview properties.
2. Implement the ephemeral route-preview channel and route-card hooks.
3. Add preview-aware route layer styling and transparent hit target.
4. Add map route hit selection with guards for higher-priority drawing/ride interactions.
5. Add Gravel Goblin recommendation preview using the same preview channel.
6. Add focused browser coverage for card→map preview, map→selection, keyboard preview, stale ids, and 390px touch behavior.
7. Add desktop/phone visual evidence and run lint, typecheck, unit, build, critical/WebKit, road-lock, PWA, real-router, and visual gates.
8. Adversarial review: no duplicate selection authority, no persisted preview state, no stale route selection, no geometry/scoring changes.
