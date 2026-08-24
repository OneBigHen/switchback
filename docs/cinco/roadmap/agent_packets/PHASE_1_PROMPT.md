# Agent Packet — Phase 1: Map Workspace Architecture

    Paste the block below into the implementing agent.

    ---

    Implement **CINCO Phase 1 only**.

Read the root requirements plus `phases/PHASE_1_MAP_WORKSPACE_ARCHITECTURE.md`.

Primary goal: create the Map Workspace / ContextSheet / viewport-inset architecture while preserving routing and navigation behavior.

Hard rules:
- do not add Mapbox yet;
- do not redesign route scoring;
- do not rewrite the navigation engine;
- do not rewrite the planner store wholesale;
- do not add major responsibilities to `PlannerShell.tsx` or `MapStage.tsx`.

Deliver focused boundaries for map composition, context sheet state, and panel-aware camera/insets. Use existing tests and add deterministic coverage for sheet transitions and route fitting.

Stop after Phase 1. Do not start visual overhaul work.

    ## Universal execution requirements

    - Work from current `main` and record starting SHA.
    - Use branch `cinco/phase-1-<short-name>`.
    - Preserve existing deterministic quality gates.
    - Use small semantic commits.
    - Do not deploy production.
    - Do not merge without owner review.
    - Written requirements override visual mockups.
    - Return requirement IDs satisfied and tests run.
