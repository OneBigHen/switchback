# Test and Release Gates

## Philosophy

Lint and happy-path browser tests are insufficient. Release must prove semantic behavior.

## Required suites

### Static
Lint, typecheck, dependency audit, dead-code detection, circular-dependency detection, and import-boundary checks.

### Unit
Normalized constraints, eligibility, scoring, road matching, requirement traversal, privacy clipping, learning, migrations, offline manifest validation, and service-worker policy helpers.

### Integration
GraphHopper fixture, Valhalla degradation, segmented routing, timeboxing, alternatives, road requirements, offline router, Free Ride acceptance, and share restore.

### Browser E2E
Desktop Chromium, desktop WebKit, mobile Safari emulation, narrow landscape, production PWA, real router, and offline regional data.

### Physical iPhone
Manual scripted drill with captured evidence.

## Mandatory semantic tests

1. Every route mode respects bike constraints.
2. Segmented routing rejects incompatible surfaces.
3. Must road can be approached from outside its corridor.
4. Must road is traversed in order.
5. Failed-gate timebox candidate is not called safe.
6. Protected share has no protected coordinates or street names.
7. User selection survives late alternatives.
8. One-star rating reduces affinity.
9. Free Ride rejects roads behind the rider.
10. Expired Free Ride suggestion disappears.
11. Accepted suggestion route traverses proposed road.
12. Failed suggestion conversion preserves recording.
13. Large-download confirmation starts one job.
14. Paused region resumes.
15. Failed update preserves active version.
16. Offline reroute works without live provider.
17. Every visible profile setting changes behavior.
18. Storage totals do not load all blobs.
19. Tile cache limits are enforced.
20. Migration preserves prior routes/settings.

## CI gates

Required: code quality, unit/integration, critical browser, real-router, PWA, migration, and semantic invariants. Live provider smoke may be non-blocking only when credentials are unavailable and results are summarized.

## Release evidence

Commit SHA, workflows, test summary, known degradations, mobile/desktop screenshots, physical-device result, graph/data versions, schema version, and rollback instructions.

## Failure policy

Do not weaken assertions. A skipped test is a failure unless explicitly approved and recorded. Mocks can verify UI, but routing semantics require a real fixture or live router.
