# Code Review Prompt

Review the current V2.1 wave implementation adversarially. Do not reward prettier screenshots if correctness, accessibility, performance or product truth regressed.

Check current diff against:
- `AGENTS.md`
- `design/DESIGN-CONTRACT.md`
- `docs/ux/v2-1/START-HERE.md`
- current `waves/W*.md`
- `PRODUCT-UX-CONTRACT.md`
- `RESPONSIVE-MOTION-PERFORMANCE.md`

Return only concrete findings with severity P0/P1/P2/P3, file/line, state/viewport, violated contract, minimal fix and preventive test. Explicitly inspect state/store duplication, source IDs, Free Ride/Record semantics, fabricated metadata, off-route/GPS/recording safety, 44px/16px floors, modal focus, short landscape, dark theme, new dependencies/map renderers, animation cost and snapshot integrity.

Block the wave on any unresolved P0/P1.