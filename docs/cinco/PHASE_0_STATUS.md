# CINCO Phase Status

## Phase
`0 — Baseline and UX contract`

## Branch
`cinco/phase-0-baseline-ux-contract`

## Starting SHA
`b2d78ca5267e7995a0bc9a9520e90a0e46aa4a5f`

## Current SHA
See `git rev-parse HEAD` on the phase branch (updated per commit).

## Requirements
- [x] `QA-001` — all existing deterministic gates verified green at baseline, none weakened
- [x] `QA-002` — snapshot discipline documented; no automatic snapshot updates
- Phase 0 defines evidence infrastructure; feature requirements begin Phase 1.

## Tasks
- [x] Record starting main SHA (`b2d78ca…`)
- [x] Record required tests and baseline status (see below)
- [x] Capture representative screenshots across required viewports
- [x] Deterministic fixtures for the 11 required UX states (`tests/e2e/helpers/ux-state-fixtures.ts`)
- [x] Required viewport coverage (5 viewports) in visual suite
- [x] `docs/cinco/UX_STATE_CONTRACT.md`
- [x] No intentional redesign; no app behavior change

## Tests
| Command | Result |
|---|---|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | 223 files — 1367 passed, 1 skipped (identical to baseline) |
| `npm run test:e2e:critical` | 32 passed (identical to baseline) |
| `npx playwright test --project=visual` | 52 passed, twice in a row, zero snapshot writes on the repeat run |

## Visual evidence
- [x] phone portrait (390x844)
- [x] phone landscape (844x390)
- [x] tablet portrait (768x1024)
- [x] tablet landscape (1024x768)
- [x] desktop (1440x900)

Primary screens: 6 screens × 5 viewports (`tests/e2e/visual/screens.spec.ts`
baselines). State contract: 11 states × phone portrait + desktop
(`tests/e2e/visual/ux-states.spec.ts` baselines, review copies under
`artifacts/cinco/phase-0/`).

## Decisions
- Visual drift made deterministic: `page.clock.install` (midday) pins theme
  AND freezes app timers (placeholder rotation), the dev-indicator portal is
  disabled via `devIndicators: false`, Free Ride polls are reached by explicit
  clock advances. See `docs/cinco/UX_STATE_CONTRACT.md`.
- Pre-existing visual-suite failure root-caused and fixed without
  rebaselining: tracked baselines failed whenever runs happened after 19:00
  local because the shell auto-switches theme dark by wall clock (CI's visual
  job is evidence-only for this exact reason). The midday pin restored all 12
  tracked desktop/mobile baselines to passing; no baseline pixels were
  rewritten to get there.
- State evidence captured at phone portrait + desktop; primary screens carry
  the full five-viewport matrix to bound suite runtime.
- CI visual job stays evidence-only for now: baseline pixels still depend on
  host font rasterization; gating it requires a pinned CI image (follow-up).
- Free Ride suggestion fixtures use a far-future expiry constant so freshness
  checks cannot rot as wall-clock time advances.

## Known limitations
- Off-route state captures the immediate recovery surface; sustained-deviation
  auto-reroute timing remains covered by component tests, not E2E.
- Map canvas pixels rely on a mocked empty style; tile-level cartography is
  not under visual test by design.
- Visual baselines remain host-dependent (font rasterization); reproducible on
  a given machine, not yet across arbitrary machines.

## Next action
Phase 1 — Map Workspace architecture (ContextSheet, viewport insets, UI
boundary extraction) on branch `cinco/phase-1-map-workspace`.
