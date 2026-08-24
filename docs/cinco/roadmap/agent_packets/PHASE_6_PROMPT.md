# Agent Packet — Phase 6: Free Ride 2.0

    Paste the block below into the implementing agent.

    ---

    Implement **CINCO Phase 6 only**.

Read `phases/PHASE_6_FREE_RIDE_2.md` and `12_FREE_RIDE_WORKLOAD_MODEL.md`.

Preserve the current graph-backed candidate engine.

Required:
- rolling/event-driven candidate refresh;
- real deterministic workload estimator;
- high-workload suppression;
- one compact moving opportunity;
- Take / Pass;
- expanded detail when stopped;
- preference/cooldown/prompt-history behavior preserved;
- live-condition-aware scoring where Phase 5 makes data available.

The result should interrupt the rider less, not more.

Do not show raw scores/provenance in the moving prompt.

    ## Universal execution requirements

    - Work from current `main` and record starting SHA.
    - Use branch `cinco/phase-6-<short-name>`.
    - Preserve existing deterministic quality gates.
    - Use small semantic commits.
    - Do not deploy production.
    - Do not merge without owner review.
    - Written requirements override visual mockups.
    - Return requirement IDs satisfied and tests run.
