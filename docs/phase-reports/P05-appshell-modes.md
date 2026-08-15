# P05 — AppShell modes

**Status:** complete for the P05 phase.

**Phase:** P05 — AppShell modes

**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` before the
uncommitted P02–P05 worktree changes.

## Before behavior

- `src/app/page.tsx` mounted `PlannerShell` directly. The component owned the
  map, tab state, planning surfaces, library, recording, and ride HUD.
- The map was rendered once in that component, but the target high-level
  Explore/Plan/Ride/Library mode contract was implicit rather than typed.
- The compatibility navigation still exposed Record and Profile as tabs.

## After behavior

- Added `AppShell`, a stable top-level boundary that retains the existing
  `planner-shell` styling and the single map/content slot.
- Added typed `AppMode` derivation for Explore, Plan, Ride, and Library from
  existing planner surface, tab, and route state. A planned result is Plan;
  the empty prompt surface is Explore; active ride/free-ride is Ride; and the
  library remains Library.
- Kept the current MapStage mounted in one place and preserved existing local
  route, GPX, recording, settings, offline, and library behavior.
- Kept the Record/Profile compatibility panels intact; their controller and
  final visual migration belongs to P06/P19 and does not justify duplicate
  shell state in P05.

## Files changed

- `src/components/shell/AppShell.tsx`.
- `src/components/planner/PlannerShell.tsx`.
- `src/lib/client/app-navigation.ts`.
- `tests/components/app-shell.test.tsx` and
  `tests/unit/app-navigation.test.ts`.
- `docs/recovery/WORKLOG.md`.

## Files deleted

None.

## Migrations

None. No persisted navigation key, route, GPX, IndexedDB schema, runtime
database, or user data was changed. The existing compatibility tab behavior is
preserved.

## Tests

The complete gate ran in an isolated checkout on Megaplex's `docker-stable`
LXC 109 (`192.168.1.175`) using Node 24.15.0. The checkout excluded
`.env.local`, Git metadata, production routing data, runtime databases,
dependencies copied from the workstation, and generated artifacts. No
production Switchback service was restarted or reconfigured.

## Commands

- `npx vitest run tests/components/app-shell.test.tsx tests/unit/app-navigation.test.ts tests/components/planner-shell-geocoding.test.tsx --reporter=dot`
- `npm run lint`
- `npm run typecheck`
- `npm run verify`
- `npm run test:e2e`
- `npm run test:e2e:critical`
- `npm run test:e2e:pwa`
- `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router`
- `npm run test:e2e:memory-soak`
- `git diff --check`

## Results

| Command/evidence | Result |
|---|---|
| focused P05 Vitest run | 3 files / 20 tests passed locally |
| local lint and typecheck | passed |
| Megaplex `npm run verify` | lint and typecheck passed; 169 files / 1,163 tests passed, 1 skipped; production build passed |
| `npm run test:e2e` | 24/24 passed across desktop Chromium, mobile Safari, and both landscape projects |
| `npm run test:e2e:critical` | 30/30 passed across Chromium and WebKit |
| `npm run test:e2e:pwa` | 2/2 passed |
| `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router` | 5/5 passed, including honest fixture refusals; fixture stopped and port 8998 was clear afterward |
| `npm run test:e2e:memory-soak` | 10/10 cycles passed in 46.4s; used JS heap 39.6 MB, total heap 50.4 MB, one map instance each cycle |
| `git diff --check` | passed |

The current soak output is the ignored generated artifact at
`artifacts/quality/memory-soak.json`.

## Memory/performance evidence

The shell boundary does not create another map or route-geometry owner. The
ten-cycle automated soak held one map instance and stable measured heap values.
This is not a two-hour plateau, physical GPS result, or production load
benchmark.

## Routing quality evidence

No routing algorithm, provider, geometry, or legality behavior changed. The
isolated real-router suite remains 5/5, including the refusal fixtures.

## Known limitations

- The visible compatibility navigation still labels the existing Plan,
  Library, Record, and Profile panels. The typed four-mode shell boundary is
  now in place; final visible Explore/Plan/Ride information architecture is
  intentionally deferred to P19–P23 after ownership cleanup.
- The known non-failing mobile MapLibre fit warning remains in broad E2E.
- Automated checks do not prove physical-device, authenticated-browser, or
  production-concurrency behavior.

## Deferred

- P06 — move planning orchestration out of the React god component.
- P07/P08 — canonical geometry ownership and worker/resource lifecycle.
- P19–P23 — final visible Explore, Plan, customize/edit, and Ride shell UX.

## Rollback

Before phase close, the worktree baseline is `main` at
`5632af2ea7109ae860d608069b8c4364d6f80273` plus the uncommitted P02–P04
changes. Rollback is the inverse of this P05 patch, preserving overlapping
earlier work; do not use a broad reset that would discard user changes.

## Next dependency

P06 — planning controller.
