# Agent Packet — Phase 0: Baseline and UX Contract

    Paste the block below into the implementing agent.

    ---

    Implement **CINCO Phase 0 only**.

Read the required root documents and `phases/PHASE_0_BASELINE_AND_UX_CONTRACT.md`.

Your task is to establish deterministic UX evidence and screen-state contracts. Do not redesign the UI, add Mapbox, or refactor core routing.

Required outputs:
- starting SHA recorded;
- deterministic fixtures for the required UX states;
- target viewport coverage;
- current screenshots/evidence;
- stabilized visual inputs for time/theme/location where needed;
- `docs/cinco/UX_STATE_CONTRACT.md`;
- existing critical E2E still green.

Stop after Phase 0. Return files changed, commands/results, screenshot paths, known baseline failures, and final SHA.

    ## Universal execution requirements

    - Work from current `main` and record starting SHA.
    - Use branch `cinco/phase-0-<short-name>`.
    - Preserve existing deterministic quality gates.
    - Use small semantic commits.
    - Do not deploy production.
    - Do not merge without owner review.
    - Written requirements override visual mockups.
    - Return requirement IDs satisfied and tests run.
