# Agent Packet — Phase 5: Live Road Intelligence

    Paste the block below into the implementing agent.

    ---

    Implement **CINCO Phase 5 only**.

Read `phases/PHASE_5_LIVE_ROAD_INTELLIGENCE.md`.

Build a normalized RoadConditionsService and regional providers using official sources.

Required:
- Pennsylvania provider integration where credentials/coverage permit;
- New Jersey 511/NJDOT provider integration where available;
- NWS weather normalization;
- stale/freshness handling;
- shared consumption by map/route/navigation seams;
- correct misleading static OSM labels.

Hard rule: never fabricate real-time traffic or closure status.
Do not purchase/add a paid commercial traffic feed without owner approval.

    ## Universal execution requirements

    - Work from current `main` and record starting SHA.
    - Use branch `cinco/phase-5-<short-name>`.
    - Preserve existing deterministic quality gates.
    - Use small semantic commits.
    - Do not deploy production.
    - Do not merge without owner review.
    - Written requirements override visual mockups.
    - Return requirement IDs satisfied and tests run.
