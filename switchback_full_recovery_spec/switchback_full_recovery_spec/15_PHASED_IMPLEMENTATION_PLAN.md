# Phased Implementation Plan

## Phase 0 — Baseline and containment

- Baseline audit and feature disposition.
- Feature flags for road requirements, Free Ride, personalized ranking.
- Remove misleading copy.
- Disable current Must behavior.
- Align docs/runtime.
- Add failing regressions for confirmed P0 defects.

Exit: behavior is honestly labeled; placeholder requirements cannot affect routing.

## Phase 1 — Routing correctness

- Normalized route request.
- Route eligibility.
- Full constraint propagation.
- Segmented fix.
- Timeboxed fallback fix.
- Sticky explicit selection.
- Provider degradation.
- Semantic tests.

Exit: every shown candidate is eligible and every mode applies the same constraints.

## Phase 2 — Road requirements and sharing

- Graph matching endpoint.
- MatchedRoadRequirement.
- Ordered Must traversal.
- Bounded Prefer candidates.
- Rematching.
- Privacy clipping/instruction redaction.
- Preview/tests.

Exit: Must/Prefer are correct and protected shares leak no protected metadata.

## Phase 3 — Offline and storage

- Large-download fix.
- Pause/resume/activation/rollback.
- Metadata-based totals.
- Operational suites or removal.
- Corridor rebuild wiring.
- Readiness model.
- Bounded caches.
- Regional offline E2E.

Exit: prepared ride survives reload/provider outage and offline rerouting works.

## Phase 4 — Modularization

- Split PlannerShell.
- Planner/ride/offline state machines.
- Central notices/errors.
- Unified settings and bike identity.
- Draft recovery.
- Migrations/export.

Exit: domain state is testable without React and prior data migrates.

## Phase 5 — UX

- Mobile Search → Choose → Edit → Prepare.
- Ride home.
- Desktop three-pane editor.
- Destructive confirmations.
- Remove disconnected controls/static scenic gallery.
- Readiness and diagnostics.

Exit: mobile critical journeys pass and desktop editing is materially better.

## Phase 6 — Learning and Free Ride

- Signed preference model.
- Stable bike IDs.
- Inspectable learning.
- Graph-backed candidates.
- Direction/expiry/workload/traversal.
- Safe recording-to-guidance transition.

Exit: learning moves away from disliked roads; Free Ride passes semantics or remains disabled.

## Phase 7 — Qualification

Full CI, physical iPhone, performance, battery/GPS endurance, low-storage/eviction, accessibility, release docs, and rollback rehearsal.

Exit: `16_DEFINITION_OF_DONE.md`.
