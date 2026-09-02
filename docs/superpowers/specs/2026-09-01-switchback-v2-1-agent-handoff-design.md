# Switchback V2.1 Premium UX Agent Handoff Design

Status: approved direction, implementation not started  
Branch: `ux/v2-1-premium-mobile-polish`  
Audited base: `main@35cb60c4659c5e054c0e64b6ef24c567c4ceff17`

## 1. Purpose

This branch is the single execution lane for the next Switchback UX pass. A lower-cost coding agent must be able to clone the repository, read one entry document, and continue the work without chat history, an external ZIP, or product-design improvisation.

The work is a presentation refactor over the existing V2 architecture. It must improve hierarchy, density, transitions, responsiveness, performance, accessibility, and visual quality while preserving routing, recording, Rides normalization, Free Ride, identity/sync, offline, community, and navigation authorities.

Switchback remains a motorcycle trip decision instrument: map-first while planning, calm at speed, compact, rugged/premium, and explicitly not a generic SaaS dashboard.

## 2. Why four waves

The previous 12-phase package is useful as analysis, but too fragmented for cheap-agent execution. The GitHub handoff will collapse implementation into four waves with small commits inside each wave.

This gives enough guardrails to prevent architectural drift without forcing the agent to spend more effort operating a process than improving the product.

### Wave 1 — Planning instrument

Covers:
- shared header/navigation/component grammar needed by Plan;
- idle Plan sheet;
- Destination / Loop / Draw mode presentation;
- Free Ride launch affordance;
- Options hierarchy;
- Draw toolbar;
- loading and provider/error states;
- layer and road-lock utility presentation;
- alternatives;
- selected-route / Prepare surface;
- route detail/edit;
- route action dock;
- offline-pack modal.

Outcome: planning feels like one coherent compact instrument, the map remains dominant, and route choice/start is decisive.

### Wave 2 — Content destinations

Covers:
- Rides populated/search/filter/manage/import/empty states;
- Discover loading/populated/search/error/empty states;
- standalone community Atlas list/detail pages;
- Settings root;
- active motorcycle presentation;
- UI customization;
- Advanced identity/sync/data;
- region downloads/diagnostics.

Outcome: Rides, Discover, and Settings share Switchback visual DNA without becoming three copies of one giant hero template.

### Wave 3 — Ride instruments

Covers:
- Record idle/active/paused;
- Free Ride idle and suggestion states;
- active Ride HUD;
- off-route recovery;
- track-only guidance;
- GPS uncertain/error;
- arrival/finalization;
- ride-recording HUD.

Outcome: active riding surfaces reduce cognitive load. Maneuver/recovery/GPS state outrank decorative polish.

### Wave 4 — Product hardening

Covers:
- 320×700, 390×844, 430×932, 844×390, tablets and desktop;
- dark theme;
- reduced motion;
- keyboard/focus/accessibility;
- content stress cases;
- animation quality;
- rendering/performance budgets;
- deterministic visual fixtures;
- reviewed snapshot rebaseline;
- adversarial review;
- exact-head release proof.

Outcome: V2.1 behaves like a finished product, not a collection of good-looking primary screenshots.

## 3. Repository handoff structure

The branch will contain a deliberately small execution system under `docs/ux/v2-1/`:

- `START-HERE.md` — the only required entrypoint for an agent.
- `STATE.md` — current wave, completed commits, known blockers, and exact next action.
- `PRODUCT-UX-CONTRACT.md` — screen/state design rules and data-truth constraints.
- `VISUAL-SYSTEM.md` — palette, type, spacing, CTA/card/navigation grammar and examples.
- `RESPONSIVE-MOTION-PERFORMANCE.md` — geometry, transitions, reduced motion, performance budgets.
- `TEST-AND-RELEASE.md` — semantic, visual, WebKit, real-router and exact-head gates.
- `FILE-MAP.md` — real component/style ownership and explicit do-not-refactor boundaries.
- `waves/W1-PLAN.md`
- `waves/W2-DESTINATIONS.md`
- `waves/W3-RIDE.md`
- `waves/W4-HARDENING.md`
- `visuals/*.svg` — lightweight vector composition references stored directly in GitHub.

No orchestration framework, task database, custom scheduler, agent daemon, or new workflow engine will be added.

The existing `AGENTS.md`, ADRs, repository scripts, GitHub Actions and branch protection remain authoritative for engineering behavior.

## 4. Agent execution contract

The cheap agent receives one instruction: read `docs/ux/v2-1/START-HERE.md` and execute the current wave recorded in `STATE.md`.

Inside a wave it may work fluidly, but it must:

1. fetch/rebase before starting;
2. inspect the current implementation before editing;
3. preserve existing state/data authorities;
4. add or tighten semantic/geometry tests before risky presentation changes;
5. make small coherent commits rather than one monolithic restyle;
6. run focused tests after each commit;
7. inspect real screenshots, not only pixel-diff output;
8. update `STATE.md` after a completed wave or meaningful blocker;
9. stop rather than invent missing product data;
10. never merge the draft PR itself.

A wave may contain several commits. It does not need a separate PR per screen.

## 5. Non-negotiable architecture

Preserve:
- one persistent map workspace;
- existing planner stores/view models/commands;
- newest-request-wins and stale-response fencing;
- reroute cancellation semantics;
- router authority over final road geometry;
- Free Ride as separate Discovery/Live contracts rather than another `PlanMode`;
- Record as a separated task action rather than a fifth primary destination;
- Rides normalization and original source IDs;
- existing import, road-lock, bike/settings migration, encrypted sync, offline and recording authorities;
- community privacy/sanitized previews;
- four primary destinations: Plan, Rides, Discover, Settings.

Presentation changes should normally stay in the focused components and CSS owners. `PlannerShell.tsx` is expensive territory: presentation prop plumbing is acceptable; state/orchestration refactors are not part of V2.1.

## 6. Visual direction

Use the existing V2 design contract rather than inventing V2.1 branding.

Core visual rules:
- Canvas/Paper/Sandstone provide warm tactile surfaces;
- Ink carries primary text;
- Ember is route/action/selection, not universal decoration;
- Spruce is restrained ride/adventure identity and a good Free Ride action color;
- Signal Blue is GPS/navigation information;
- Warning and Danger remain semantic;
- Oswald is an instrument face for titles/state, not a marketing megaphone;
- Inter remains body/control/numeric UI;
- 4px spacing system;
- 44px interaction floor;
- no giant mobile heroes;
- no nested-card explosion;
- no glassmorphism identity;
- no stock motorcycle photography;
- no invented route labels/traits.

### Plan

The map is the hero. The idle sheet should feel like a compact command instrument:
- one strong omnibox;
- Destination / Loop / Draw grouped;
- Free Ride adjacent but semantically separate;
- Options tertiary;
- no large blank lower area;
- no tagline/welcome panel.

Route-ready should answer, before Start:
- which route;
- time;
- distance;
- real ride character;
- real warning if any.

### Rides

The first useful ride row should appear quickly. Compact header, Import, Search, filters, then rows. The route graphic is identity, not a giant hero.

### Discover

Search and real route cards are primary. Filters are permitted only when backed by guaranteed fields. Do not infer `ADV`, `gravel`, `twisty`, or `scenic` from prose.

### Settings

Compact active-bike identity, ordinary rider/default/UI controls, then one Advanced entry. Security/sync/recovery status must remain explicit inside Advanced.

### Ride / Free Ride / Record

At speed, remove rather than add information. Priority is:
1. maneuver/recovery;
2. GPS state;
3. instruction distance;
4. route/map;
5. speed/remaining metrics;
6. utilities.

Free Ride suggestions remain experimental, one at a time, with score subordinate to road/safety context.

## 7. Motion and transition design

Transitions must make state changes feel coherent without becoming decoration.

Use:
- sheet/dock transitions: 180–280ms using the existing canonical easing/spring-like curve;
- selection/press transitions: 120–160ms;
- small disclosures: 140–200ms;
- map geometry transitions only when they improve comprehension;
- one restrained recording pulse where already semantically useful.

Do not use:
- animated gradients;
- parallax;
- bouncing CTAs;
- springing every control;
- auto-moving route card carousels;
- decorative ride-mode motion.

`prefers-reduced-motion` removes all non-essential motion.

State transitions should preserve spatial continuity: expanding Plan feels like the same sheet, route loading does not replace the whole UI, route selection does not recompose the page unnecessarily, and active ride surfaces avoid layout shifts.

## 8. Performance budget

This pass must not trade responsiveness for visual polish.

Targets:
- no new general-purpose UI/component library;
- no runtime webfont fetches;
- no new renderer/map instance;
- no animation library unless a demonstrated requirement cannot be met with current CSS/React patterns;
- avoid backdrop blur on large continuously moving map regions;
- animate transform/opacity where practical instead of layout-heavy properties;
- no repeated expensive route-geometry derivation in render solely for decoration;
- route-list/Discover graphics should use already-available data or lightweight static SVG, not spin up map renderers per card;
- preserve lazy loading for cinematic/secondary heavy surfaces;
- avoid rerenders of the map because destination chrome changed;
- visual improvements must remain usable on current iPhone Safari and ordinary midrange mobile hardware.

Wave 4 will record before/after evidence for bundle/build output and representative interaction/render behavior. A visual change that introduces obvious input lag, scroll jank, sheet jank, or map stutter is a blocker even if tests pass.

## 9. Responsive geometry

Preserve current structural contracts, including the existing mobile edge/nav/sheet values and 44px touch floor.

Critical targets:
- 320×700: idle planner remains below the established map-first cap and fully usable;
- 390×844: primary phone design target;
- 430×932: more map breathing room, not larger controls;
- 844×390: left rail, all destinations + Record reachable, no tall stacked copy;
- 768×1024: preserve narrow tablet planner behavior;
- 1024×768: avoid stretched phone composition;
- 1440×900 / 1920×1080: deliberately constrained floating instruments and content, not huge whitespace.

Phone text inputs remain >=16px to prevent Safari zoom.

## 10. Data-truth rule

Visual labels require real backing data or a deterministic meaningful derivation.

Allowed examples:
- distance/duration from route stats;
- route role from existing role helper;
- route character from existing surface/twistiness data;
- provenance from community route metadata.

Forbidden examples:
- fake elevation;
- “expert difficulty” inferred from a title;
- `ADV` or `gravel` inferred from description prose;
- zero displayed for a missing metric;
- synthetic nearby claims without a location-aware query.

If the design wants a field the app does not have, the agent omits the field and records the gap instead of adding domain/schema work inside this UX branch.

## 11. Testing and visual integrity

The branch uses the repository’s existing tests and CI. V2.1 may add deterministic fixtures and targeted geometry/semantic assertions but should not replace the QA system.

Snapshot updates require:
- expected/actual/diff inspection;
- bundled fonts confirmed loaded;
- deterministic viewport/map/data/clock;
- explanation of the major changed regions;
- only affected baselines updated;
- unchanged thresholds and no broad masks.

CI-only visual drift is investigated rather than blindly rebaselined.

Any substantive commit after release evidence invalidates exact-head proof.

## 12. Success criteria

The branch is ready when:
- Plan feels map-first and decisive through idle → options/draw → loading → alternatives → prepare → ride;
- Rides is dense and useful without breaking source identity;
- Discover is attractive and truthful;
- Settings is easier to scan without hiding critical data/security state;
- Record, Free Ride and Ride HUD are calmer and safer at speed;
- light/dark and all critical viewports feel intentionally designed;
- transitions communicate state without decorative motion;
- no meaningful performance regression is observed;
- accessibility/geometry tests remain strong;
- visual baselines were manually reviewed;
- adversarial review has no unresolved P0/P1 issue;
- all required GitHub checks pass on the exact candidate SHA.

## 13. Explicit non-goals

V2.1 does not add:
- a new routing engine;
- a new renderer;
- another state/store architecture;
- native apps;
- CarPlay/Android Auto;
- social feeds/likes/follows;
- billing;
- LLM route ranking;
- generic plugin systems;
- a new agent orchestration system;
- broad repository refactors unrelated to the UX surfaces being touched.

## 14. Handoff principle

The GitHub branch itself is the memory. The agent should never need to ask “what was the plan?” or search old chat transcripts. `START-HERE.md`, `STATE.md`, the four wave files, screen contracts, visual SVGs, tests, commits, and the draft PR together are the complete execution context.
