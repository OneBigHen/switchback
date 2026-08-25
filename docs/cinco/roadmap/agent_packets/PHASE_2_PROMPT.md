# Agent Packet — Phase 2: CINCO Visual System and Premium Map

    Paste the block below into the implementing agent.

    ---

    Implement **CINCO Phase 2 only** after Phase 1 exists.

Read `phases/PHASE_2_CINCO_VISUAL_SYSTEM_AND_PREMIUM_MAP.md`, `04_MAP_RENDERING_AND_3D_STRATEGY.md`, and the visual references.

Goals:
- map-first CINCO phone/tablet shell;
- semantic visual tokens;
- responsive phone/tablet compositions;
- Mapbox Standard / Standard Satellite experiment;
- preserved MapLibre fallback.

Hard rules:
- Mapbox is a renderer only;
- do not use Mapbox routing to replace current providers;
- token absence must not break planning;
- 3D terrain must improve legibility, not serve as decoration;
- written requirements override mockup details.

Provide phone portrait/landscape and tablet portrait/landscape visual evidence.
Stop before changing route scoring/Flowy behavior.

    ## Universal execution requirements

    - Work from current `main` and record starting SHA.
    - Use branch `cinco/phase-2-<short-name>`.
    - Preserve existing deterministic quality gates.
    - Use small semantic commits.
    - Do not deploy production.
    - Do not merge without owner review.
    - Written requirements override visual mockups.
    - Return requirement IDs satisfied and tests run.
