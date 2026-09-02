# START HERE — Switchback UX V2.1

This branch is the complete handoff for the V2.1 premium UX pass.

## Your instruction

**Read this file, then `STATE.md`, then execute the current wave. Do not redesign the architecture. Do not wait for more product direction unless a stop condition below is hit.**

Branch: `ux/v2-1-premium-mobile-polish`  
Draft PR: #41  
Audited base: `main@35cb60c4659c5e054c0e64b6ef24c567c4ceff17`

## Read order
1. repository `AGENTS.md`
2. `design/DESIGN-CONTRACT.md`
3. `docs/superpowers/specs/2026-09-01-switchback-v2-1-agent-handoff-design.md`
4. `docs/superpowers/plans/2026-09-01-switchback-v2-1-premium-ux.md`
5. this directory: `STATE.md`, `PRODUCT-UX-CONTRACT.md`, `VISUAL-SYSTEM.md`, `RESPONSIVE-MOTION-PERFORMANCE.md`, `FILE-MAP.md`, `TEST-AND-RELEASE.md`
6. the current file under `waves/`
7. the relevant SVGs under `visuals/`

## Operating style

This is intentionally optimized for a lower-cost coding agent.

- Work fluidly **inside one wave**.
- Make small coherent commits after a screen family or risky state is genuinely green.
- Do not create sub-PRs, task databases, schedulers, orchestration frameworks, generic component libraries or new architecture.
- Prefer modifying the current components over creating replacements.
- Prefer existing tokens over local colors.
- Prefer semantic/geometry tests before risky presentation changes.
- Take screenshots and inspect them. Passing pixel math is not visual review.
- Update `STATE.md` when a wave finishes or when a real blocker changes the next action.
- Never merge PR #41 yourself.

## Four waves

### W1 — Plan
Idle, search, Destination/Loop/Draw, Free Ride launch, Options, drawing, loading/errors, layers/road locks, route alternatives, route-ready/Prepare, details/edit, action dock, offline modal.

### W2 — Destinations
Rides, import/manage/search/filter/empty; Discover and public Atlas; Settings, active bike, UI customization, Advanced identity/sync/offline/diagnostics.

### W3 — Ride
Record, Free Ride idle/suggestion, active Ride HUD, track-only, GPS uncertainty, off-route recovery, arrival, recording HUD.

### W4 — Hardening
All viewports, dark, accessibility, reduced motion, stress content, performance, snapshot review, adversarial QA and exact-head release evidence.

## Architecture you must preserve

- one persistent map workspace;
- existing planner/view-model/command authorities;
- newest-request-wins and stale-response fencing;
- current reroute cancellation behavior;
- router remains final road-geometry authority;
- Free Ride is separate from `PlanMode`;
- Record is a separated task action, not a fifth primary destination;
- Rides normalization and original source IDs;
- existing import, road-lock, bike/settings migration, encrypted sync, offline and recording authorities;
- community privacy/sanitized previews;
- four primary destinations: Plan, Rides, Discover, Settings.

`PlannerShell.tsx` is expensive territory. Presentation prop plumbing is acceptable. State/orchestration refactors are not V2.1 work.

## Product rule

Switchback is a **motorcycle trip decision instrument**. The map is atmosphere and context; chrome is compact control. It should feel like premium durable outdoor/navigation equipment, not a SaaS dashboard or Dribbble concept.

### Every screen should satisfy
- primary task obvious in ~2 seconds;
- one dominant CTA maximum;
- no invented data;
- no giant mobile hero;
- no unexplained blank area;
- no nested-card explosion;
- controls >=44px;
- phone text/search inputs >=16px;
- light and dark intentional;
- selected/error/warning state not color-only;
- current map remains usable when planning;
- at-speed surfaces contain **less**, not more, information.

## Do not invent data

Allowed: existing distance, duration, route role, twistiness/surface-derived character, provenance, real warnings.  
Forbidden: fabricated elevation, difficulty, ADV/Gravel/Scenic/Twisty tags inferred from prose, fake nearby claims, zero for a missing metric.

If a desired field does not exist, omit it and note the product gap in `STATE.md`.

## Motion rule

Use motion to preserve spatial continuity, not decorate:
- sheet/dock 180–280ms;
- selection/press 120–160ms;
- disclosure 140–200ms;
- transform/opacity preferred;
- no parallax, animated gradients, bouncing CTAs, auto-moving carousels or ride-mode theatrics;
- `prefers-reduced-motion` removes non-essential motion.

## Performance rule

Visual polish may not create map/list/sheet jank.

Do not add:
- another map instance;
- mini map renderer per card;
- runtime webfont requests;
- a general animation library without a demonstrated blocker;
- large continuously blurred map overlays;
- expensive geometry derivations purely for decoration.

## Snapshot rule

Never bulk-update snapshots because the redesign changed a lot.

For each changed visual group:
1. confirm bundled fonts loaded;
2. inspect expected/actual/diff;
3. verify deterministic map/data/clock/viewport;
4. explain the changed regions;
5. update only intended baselines;
6. keep thresholds/masks intact.

## Stop conditions

Stop and report in `STATE.md` rather than improvising if:
- `main` materially drifted through files this wave owns;
- baseline required tests fail before your changes;
- visual design requires unavailable domain data;
- a visual fix appears to require routing/storage/security architecture changes;
- a snapshot failure cannot be explained after font/environment inspection;
- iOS/WebKit requires a behavioral workaround that changes semantics;
- a safety/recovery/GPS/recording state would become less explicit.

## End-of-wave report

Before moving to the next wave, update `STATE.md` with:
- wave status;
- commits;
- tests run and result;
- screenshots/viewports inspected;
- intentional snapshot files changed;
- known limitations;
- exact next action.

Then continue unless a real blocker requires human review.
