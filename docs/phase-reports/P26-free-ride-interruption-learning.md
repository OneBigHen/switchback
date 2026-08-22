# P26 — Free Ride interruption/learning

**Phase:** P26 — sparse prompts, quiet periods, preference updates, and Head
Home
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P25/P26 worktree changes
**Release gate:** G5

## Before behavior

- Free Ride polled every 15 seconds after a visible suggestion cleared, even
  when the reducer's short cooldown already meant no prompt should be shown.
- Ignore history was not time-bounded and the prompt budget was not explicit.
- The existing local preference signals were present, but the interruption
  lifecycle had no escalating quiet period or hourly prompt cap.
- Free Ride had no direct escape to a saved local Home route.

## After behavior

- The existing recommendation reducer now owns bounded prompt and ignore
  history. It allows at most three prompts per rolling hour, waits five minutes
  after a normal response, and waits twenty minutes after repeated ignores or
  `Less like this`. Candidate IDs are capped at 32.
- Quiet state is passed through the typed API boundary and checked before graph
  or routing work. The client also skips polling while the quiet period is
  active, so a rider's attention and the optional provider are both spared.
- Accept, Ignore, and Less like this continue to write the established local,
  stable-bike preference signals: accepted `+1`, ignored `-0.5`, and
  less-like-this `-2`. No account, raw GPS trail, or second learning store was
  added.
- When a saved browser-local Home exists, Free Ride exposes Head Home. It uses
  the latest real GPS point, routes through the normal planner/provider path,
  preserves the recording-to-ride transition, and refuses honestly without a
  fix or saved Home.

## Files changed

- `src/lib/recommendation/free-ride.ts` — bounded prompt/ignore history,
  rolling prompt budget, quiet periods, and reducer lifecycle.
- `src/app/api/free-ride/suggestions/handler.ts` — validated cooldown input and
  provider-free quiet responses.
- `src/components/planner/PlannerShell.tsx` — quiet polling gate, explicit
  timestamps, and Head Home route transition.
- `src/components/shell/FreeRideHud.tsx` and
  `src/app/styles/switchback-v1.css` — accessible Home action and responsive
  control layout.
- `tests/unit/free-ride-recommendation.test.ts`,
  `tests/unit/free-ride-api.test.ts`, `tests/components/free-ride-hud.test.tsx`,
  and `tests/e2e/free-ride.spec.ts` — quiet-period, API, UI, and Home journey
  regressions.

## Files deleted

None.

## Migrations

None. Prompt history is ephemeral bounded reducer state; saved Home and rider
preference data retain their existing local schemas.

## Tests

- the validation host focused P26 audit: 3 files / 22 tests passed; lint and typecheck
  passed.
- the validation host `npm run verify`: 185 test files / 1,232 passed / 1 skipped; lint,
  typecheck, and production build passed.
- Free Ride browser matrix: 8/8 across desktop Chromium, mobile Safari, and
  both landscape projects, including the saved Home transition.
- Broad browser matrix: 28/28 passed.
- Critical Chromium/WebKit matrix: 30/30 passed.
- PWA/offline matrix: 2/2 passed.
- Real GraphHopper fixture: 5/5 passed with clean router shutdown.
- Memory soak: 1/1 test, 10/10 planner cycles.
- `git diff --check` passed.

## Commands

```text
npm exec -- vitest run tests/unit/free-ride-recommendation.test.ts \
  tests/unit/free-ride-api.test.ts tests/components/free-ride-hud.test.tsx \
  --reporter=verbose
npm run test:e2e -- tests/e2e/free-ride.spec.ts
```

The full acceptance commands ran in `/tmp/switchback-validation-test.LDEtb5`
inside a dedicated test LXC with Node 24.

## Memory/performance evidence

Prompt timestamps, ignore timestamps, and rejected candidate IDs are bounded;
no new listener, worker, route-geometry store, or persistent GPS trail was
introduced. The browser resource soak passed ten planner cycles.

## Routing quality evidence

The Home journey proves that the saved local endpoint and current fix reach the
normal route request and Ride transition in all four browser layouts. The real
router fixture remains green. This does not prove current production map data,
the installed RIG corpus, or field GPS/provider/model quality.

## Known limitations

- Prompt history resets with a new Free Ride session or page lifecycle; it is a
  bounded attention guard, not cross-device analytics.
- Browser Home tests use the local fixture route provider; they do not prove an
  authenticated browser, outdoor GPS, or physical mounted-phone behavior.
- The known MapLibre narrow-viewport canvas-fit warning appeared during the
  broader browser run and did not fail or alter any test outcome.

## Deferred

- P27 — GPX analysis, confidence, unmatched spans, and grounded descriptions.
- Physical-device drill and production-concurrency evidence remain release
  gates outside this local/the validation host acceptance loop.

## Rollback

Remove the P26 reducer fields, cooldown payload, Head Home action, and focused
tests; restore the prior Free Ride poll/control behavior. No route, Home, or
preference data rollback is required.

## Next dependency

P27 — GPX intelligence.
