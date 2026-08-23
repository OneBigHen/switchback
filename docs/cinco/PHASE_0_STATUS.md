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
| `npm test` | 223 files — 1367 passed, 1 skipped |
| `npm run test:e2e:critical` | 32 passed |
| `npx playwright test --project=visual` | recorded after fixture commits |

## Visual evidence
- [x] phone portrait (390x844)
- [x] phone landscape (844x390)
- [x] tablet portrait (768x1024)
- [x] tablet landscape (1024x768)
- [x] desktop (1440x900)

Evidence copies: `artifacts/cinco/phase-0/`.

## Decisions
- Visual drift made deterministic via test harness only (pinned clock,
  settle window for 650 ms camera animations, masked dev toast); no app code
  changed. See `docs/cinco/UX_STATE_CONTRACT.md`.
- State evidence captured at phone portrait + desktop; primary screens carry
  the full five-viewport matrix to bound suite runtime.
- Free Ride suggestion fixtures use a far-future expiry constant so freshness
  checks cannot rot as wall-clock time advances.

## Known limitations
- Off-route state captures the immediate recovery surface; sustained-deviation
  auto-reroute timing remains covered by component tests, not E2E.
- Map canvas pixels rely on a mocked empty style; tile-level cartography is
  not under visual test by design.

## Next action
Phase 1 — Map Workspace architecture (ContextSheet, viewport insets, UI
boundary extraction) on branch `cinco/phase-1-map-workspace`.
