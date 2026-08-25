# Agent Packet — Phase 3: Route Intelligence UX

    Paste the block below into the implementing agent.

    ---

    Implement **CINCO Phase 3 only**.

Read `phases/PHASE_3_ROUTE_INTELLIGENCE_UX.md`.

Expose existing Switchback route intelligence in rider language.

Required:
- meaningful route labels such as Best Match / Twistiest / Flowiest / Scenic when supported;
- rider-language route reasons;
- meaningful relative tradeoffs;
- expandable deep route detail;
- first-class Flowy scoring derived from existing continuity/simplicity/traffic-control/fragmentation concepts;
- explicit user route choice remains authoritative.

Do not replace routing providers. Do not turn total score into the primary UI.

Stop before Ride HUD restructuring.

    ## Universal execution requirements

    - Work from current `main` and record starting SHA.
    - Use branch `cinco/phase-3-<short-name>`.
    - Preserve existing deterministic quality gates.
    - Use small semantic commits.
    - Do not deploy production.
    - Do not merge without owner review.
    - Written requirements override visual mockups.
    - Return requirement IDs satisfied and tests run.
