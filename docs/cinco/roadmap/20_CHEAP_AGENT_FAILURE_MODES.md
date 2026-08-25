# Common Agent Failure Modes — Do Not Do These

## 1. Paint the monolith
Bad behavior: add hundreds of JSX/CSS lines to PlannerShell and MapStage.
Correct behavior: extract interaction boundaries first.

## 2. Treat the mockup as exact product logic
The images contain conceptual labels and visual approximations.
Written requirements define behavior.

## 3. Replace MapLibre immediately
Mapbox is an experiment/default candidate, not permission to delete fallback/offline paths.

## 4. Use Mapbox routing because Mapbox map is being added
Do not. Rendering and routing are separate decisions.

## 5. Add a score badge everywhere
Use rider-language reasons. Raw total score is advanced detail.

## 6. Make Free Ride more talkative
The goal is *less* interruption and better recommendations.

## 7. Poll faster instead of making Free Ride event-aware
Do not solve freshness with a 1-second polling loop.

## 8. Call static OSM data “live”
Never.

## 9. Create fake traffic
Never.

## 10. Auto-accept visual snapshots
Inspect them.

## 11. Break explicit route selection
User choice wins over auto-ranking.

## 12. Force missed shape point U-turns
Shaping intent differs from required stops.

## 13. Make tablet cards bigger
Use tablet width for simultaneous map + context.

## 14. Add every detail to ride HUD
Moving state is intentionally sparse.

## 15. Add decorative 3D everywhere
Terrain should improve understanding.

## 16. Rewrite stores wholesale
Incremental state boundaries only.

## 17. Upgrade Next/React/TypeScript “while here”
Out of scope.

## 18. Touch deployment
Out of scope.

## 19. Remove offline code because it is incomplete
Verify and improve; do not delete.

## 20. Hide failures
Map failure, route failure, conditions failure, and GPS failure are different states and must stay distinguishable.
