# P19 — Design system and map shell

**Phase:** P19 — map-first responsive primitives, bottom sheet, typography,
and touch rules  
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P19 worktree changes  
**Release gate:** G4

## Before behavior

- Font imports bundled Inter and Space Grotesk while feature CSS also named
  Sora and DM Sans without bundling them.
- Shared spacing, color, focus, safe-area, and sheet rules were spread across
  legacy feature and responsive stylesheets.
- The persistent map shell and PlannerDeck sheet had no explicit shared
  primitive or DOM state contract.

## After behavior

- Added `src/app/styles/design-system.css` as the final shared style layer.
  It owns semantic HSL variables plus exact hex tokens, the 4px/8px spacing
  scale, 44px control minimum, focus treatment, safe-area layout, dark-theme
  sheet readability, landscape split behavior, and reduced-motion behavior.
- Added bundled `@fontsource-variable/dm-sans` and
  `@fontsource-variable/sora`; removed the retired Inter and Space Grotesk
  packages and routed feature CSS through `--font-body` and `--font-display`.
- Added `sb-map-shell` to the persistent AppShell and `sb-bottom-sheet` plus
  `data-sheet-state` to PlannerDeck. Collapse/expand controls now expose
  `aria-controls` and `aria-expanded` while MapStage remains mounted.
- Updated `design/DESIGN-CONTRACT.md` to version 1.1.0 so the shipped
  typography is the documented implementation source of truth.
- Added a compact CSS contract test and expanded AppShell coverage.

## Files changed

- `src/app/styles/design-system.css` — shared design-system and sheet rules.
- `src/app/globals.css` — bundled font imports and token font usage.
- `src/app/layout.tsx` — loads the shared layer last.
- `src/app/styles/*.css` — replaces retired/unbundled font declarations with
  shared tokens.
- `src/components/shell/AppShell.tsx` — map-shell marker.
- `src/components/planner/PlannerDeck.tsx` — sheet state and ARIA contract.
- `package.json`, `package-lock.json` — bundled font dependencies.
- `design/DESIGN-CONTRACT.md` — typography contract version 1.1.0.
- `tests/components/app-shell.test.tsx` — map-shell assertion.
- `tests/unit/design-system-contract.test.ts` — token/font primitive checks.
- `docs/recovery/WORKLOG.md`.

## Files deleted

The retired Inter and Space Grotesk package dependencies were removed. No
application data or production route file was deleted.

## Migrations

None. This is a CSS/asset migration; saved routes, local libraries, and
IndexedDB data are unchanged.

## Tests

- Local focused UI contract: 2 files / 3 tests passed.
- the validation host `npm run verify`: 184 test files / 1,225 passed / 1 skipped;
  lint, typecheck, and production build passed.
- the validation host broad browser matrix: 24/24.
- the validation host critical Chromium/WebKit: 30/30.
- the validation host PWA/offline: 2/2.
- the validation host real-router regression: 5/5.
- the validation host memory soak: 1/1 test with 10/10 planner cycles.
- Router cleanup: PID file absent and port 8998 closed.
- Final screenshots were captured for desktop, iPhone, landscape, Library,
  and Ride surfaces; the dark editor state was visually reviewed after the
  contrast correction.

## Commands

- `npm exec -- vitest run tests/unit/design-system-contract.test.ts tests/components/app-shell.test.tsx --reporter=verbose`
- `npm run lint`
- `npm run typecheck`
- `git diff --check`
- the validation host `npm run verify`
- the validation host `npm run test:e2e`
- the validation host `npm run test:e2e:critical`
- the validation host `npm run test:e2e:pwa`
- the validation host `npm run test:e2e:memory-soak`
- the validation host `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router`

## Memory/performance evidence

The design layer adds no listener, timer, worker, cache, or route geometry
store. The existing browser resource soak remained green at ten planner
cycles. CSS transitions are disabled under reduced motion.

## Routing quality evidence

P19 does not change routing code or route facts. The real GraphHopper fixture
was rerun as a regression gate at 5/5, including the existing honest refusal
cases. Provider quality, map matching, and field behavior remain outside this
UI phase.

## Known limitations

- Automated viewport tests cannot prove physical-device touch feel, outdoor
  brightness, keyboard hardware, or authenticated-browser behavior.
- The existing browser console may report the known MapLibre bounds warning in
  narrow journeys; it did not fail a test or change the route outcome.
- Visual captures are test-fixture states, not a claim that live map tiles or
  provider responses are production-current.

## Deferred

- P20 — Explore/search: simple home, free text, destination, loop, and GPX.
- Physical-device drill and production-concurrency evidence remain release
  gates outside this local/ the validation host acceptance loop.

## Rollback

Remove `design-system.css`, restore the previous font imports/dependencies and
font declarations, and remove the `sb-map-shell`, `sb-bottom-sheet`, and ARIA
state additions. No data rollback is required.

## Next dependency

P20 — Explore/search and simple home/free-text/destination/loop/GPX.
