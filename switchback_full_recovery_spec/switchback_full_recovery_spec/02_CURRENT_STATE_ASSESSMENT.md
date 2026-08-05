# Current State Assessment

Verify every finding against the current repository before modifying code.

## Strengths

- Real GraphHopper integration and optional Valhalla boundaries.
- Good local-first IndexedDB foundation.
- Broad unit/E2E coverage, real-router fixture, and PWA smoke checks.
- Progressive route planning, route history, weather, evidence, recording, replay, and provider degradation.
- Recent work addressed important planner races and mobile action-dock issues.

## Critical defects

### Road requirements
Manual taps are not graph-snapped. They produce straight geometry, no edge IDs, permissive placeholder access, and “exact” confidence. Current must behavior appears to zero priority outside a thin polygon, trapping the entire route in the corridor rather than requiring one road. Prefer can globally penalize the rest of the route. Validation checks proximity but not ordered traversal.

### Segmented routing
Per-leg requests do not consistently forward bike profile, road requirements, toll policy, and the full normalized constraint set.

### Timeboxed fallback
A shaped candidate that failed quality gates may still be selected by closest duration and described as safe. Hard eligibility and soft ranking are mixed.

### Free Ride
The endpoint assigns synthetic road class, scenic, elevation, traffic, novelty, legal-access, and confidence values. Heading is not adequately enforced. Suggestions can outlive expiration or the decision point. Acceptance does not guarantee traversal of the proposed road.

### Privacy sharing
Geometry and waypoints may be removed while instructions and street names retain protected-location information. Metrics and instruction intervals can still refer to original geometry.

### Offline
Large-download confirmation can recurse. Wi-Fi update does not prove Wi-Fi. Suite and rebuild controls may be presentational or unwired. Storage totals can materialize binary blobs. Current PWA tests do not prove regional offline rerouting.

### Preference learning
Low ratings still move averages toward disliked route features. Motorcycle identity is fragmented. Late alternatives can trigger automatic re-ranking after explicit selection.

### Settings
Several fields are stored but not applied. Bike configuration is duplicated.

### Planner architecture
PlannerShell owns too many domains and relies on interacting effects and booleans.

### Service worker
Caching is broad, cache-first, and effectively unbounded.

## UX risks

- Too many advanced controls in one mobile sheet.
- Directions compete with route choice.
- Desktop is stretched mobile rather than an editing workspace.
- Duplicate branding consumes space.
- Destructive actions lack confirmation.
- Static scenic images imply unsupported route evidence.
- Offline readiness is fragmented.

## Documentation drift

Reconcile profiles, Node runtime, loop behavior, provider concurrency, offline claims, experimental status, installation, and device requirements.
