# Agent Packet — Phase 7: Offline, Performance, and Hardening

    Paste the block below into the implementing agent.

    ---

    Implement **CINCO Phase 7 only**.

Read `phases/PHASE_7_OFFLINE_PERFORMANCE_AND_HARDENING.md`.

Required:
- trace and document actual offline-v2 execution path;
- preserve offline routing;
- define honest offline map behavior;
- validate renderer failure/fallback;
- reduced/standard/premium map detail tiers;
- measure map/update/memory behavior;
- use existing PWA and memory-soak infrastructure where applicable.

Do not delete incomplete offline systems merely to simplify the product.
Do not violate map-provider caching/licensing requirements.

    ## Universal execution requirements

    - Work from current `main` and record starting SHA.
    - Use branch `cinco/phase-7-<short-name>`.
    - Preserve existing deterministic quality gates.
    - Use small semantic commits.
    - Do not deploy production.
    - Do not merge without owner review.
    - Written requirements override visual mockups.
    - Return requirement IDs satisfied and tests run.
