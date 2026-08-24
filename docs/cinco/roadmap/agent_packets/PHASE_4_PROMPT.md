# Agent Packet — Phase 4: Ride HUD and Route Actions

    Paste the block below into the implementing agent.

    ---

    Implement **CINCO Phase 4 only**.

Read `phases/PHASE_4_RIDE_HUD_AND_ROUTE_ACTIONS.md`.

Build the sparse active navigation experience:
- dominant maneuver;
- secondary next maneuver;
- map;
- compact speed/limit + ETA/remaining strip;
- secondary actions one tap away;
- add-stop flow that preserves navigation context;
- route overview and clear follow/recenter;
- deterministic warning priority;
- expose normalized workload inputs for Phase 6.

Do not add detailed scoring to the moving HUD.
Do not modify Free Ride ranking yet.

    ## Universal execution requirements

    - Work from current `main` and record starting SHA.
    - Use branch `cinco/phase-4-<short-name>`.
    - Preserve existing deterministic quality gates.
    - Use small semantic commits.
    - Do not deploy production.
    - Do not merge without owner review.
    - Written requirements override visual mockups.
    - Return requirement IDs satisfied and tests run.
