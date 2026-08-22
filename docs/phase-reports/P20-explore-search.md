# P20 — Explore/search

**Phase:** P20 — simple home, free text, destination, loop, and GPX  
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted phase documentation changes  
**Release gate:** G4

## Before behavior

- The intent-first home, explicit route editor, place-resolution state machine,
  and Library GPX flows already existed in the working tree.
- The acceptance boundary was distributed across component and geocoding tests
  rather than recorded as a phase-level result.

## After behavior

- Confirmed the home ride field and quick intents feed the same typed ride
  request path; no duplicate Explore mode was added.
- Confirmed explicit destination and time-boxed loop editing, truthful current
  location actions, saved/Home/region fallback messaging, stale-request gating,
  and no partial mutation after failed place lookup.
- Confirmed Library search/load for project GPX and bounded local GPX/KML/KMZ
  import, road-lock matching, and delete confirmation.
- No production source, route data, or schema migration was needed. P20 is an
  audit/acceptance closure of the existing coherent implementation.

## Files changed

- `docs/recovery/WORKLOG.md` — P20 before/after evidence and boundary.
- `docs/phase-reports/P20-explore-search.md` — this phase report.

## Files deleted

None.

## Migrations

None.

## Tests

- the validation host focused audit: 4 files / 51 tests passed:
  `planner-deck.test.tsx`, `planner-shell-geocoding.test.tsx`,
  `library-drawer.test.tsx`, and `app-shell.test.tsx`.
- The unchanged source tree retained the P19 acceptance gates: `npm run
  verify` at 184 test files / 1,225 passed / 1 skipped, lint, typecheck, and
  build; browser 24/24; critical 30/30; PWA 2/2; real-router 5/5; memory soak
  10/10 planner cycles; and clean router shutdown.

## Commands

```text
npm exec -- vitest run tests/components/planner-deck.test.tsx \
  tests/components/planner-shell-geocoding.test.tsx \
  tests/components/library-drawer.test.tsx \
  tests/components/app-shell.test.tsx --reporter=verbose
```

## Gate boundary

P20 proves the local intent-to-request, destination/loop, and GPX entry paths
under component and browser fixtures. It does not prove authenticated-browser
behavior, physical-device behavior, current third-party place quality, or
model quality in the field.

## Deferred

- P21 — plan result UX with 2–3 meaningful alternatives and factual
  explanations.
- Physical-device drill and production-concurrency evidence remain release
  gates outside this local/the validation host acceptance loop.

## Rollback

Revert the two documentation files only. No production or data rollback is
required.
