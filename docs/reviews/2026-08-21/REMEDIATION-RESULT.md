# Opus adversarial remediation result

Review: `OPUS-ADVERSARIAL-REVIEW.md`  
Reviewed HEAD: `253a237`  
Baseline: `54e9645`  
Remediation branch: `fix/opus-adversarial-blockers`

The three P0 claims were independently reproduced before fixing. The baseline
was checked where the review supplied a behavioral comparison. No GitHub
visibility, runner, Cirun, branch-protection, or CI-architecture files were
changed.

## ADV-001 — KMZ deadlock

**Status: CONFIRMED.**

### Reproduction and baseline

A valid KMZ was built with one deflated `doc.kml` entry containing a KML
LineString whose expanded UTF-8 content was over 100 KB. The real KMZ parser
path was exercised with exact string comparison. On `253a237`, the extraction
did not resolve within the durable 10-second test deadline. The same expanded
KML through the baseline parser resolved successfully in about 111 ms.

The failure was the claimed backpressure deadlock: the implementation awaited
`writer.write()` and `writer.close()` before starting a reader. The write could
not complete once the decompressor's readable side filled.

### Fix and regression coverage

`extractKmzKml` now feeds the compressed bytes through a closed
`ReadableStream<BufferSource>` piped into `DecompressionStream`, allowing the
transform's readable side to be consumed as the write proceeds. It does not
buffer the entire decompressed KML as a replacement strategy.

Regression coverage is in
`tests/unit/lib/routing/import/kmz-parser.test.ts`: the fixture is deflated,
the expanded KML is at least 100 KB, the test has a finite 10-second timeout,
and it asserts exact content equality.

Commits:

- `478c376` — `fix(import): prevent KMZ decompression deadlock`
- `4786544` — `fix(import): type KMZ decompression stream adapter`

Focused validation: KMZ parser `7/7`; the full unit suite also passed. The
browser critical suite passed in both Chromium and WebKit, but there is no
separate browser-only KMZ import scenario in the existing E2E suite, so that
specific browser boundary remains unobserved.

### Defense in depth

`parseRouteFileInWorker` now has a 30-second deadline. Timeout cleanup rejects
the request, terminates the worker, releases the worker metric and
`activeImportWorkers` slot, and allows a subsequent import. The silent-worker
test verifies both rejection and slot recovery.

Commits:

- `e3e2d54` — `fix(import): release wedged worker slots after deadline`
- `02e3314` — `fix(import): satisfy worker deadline lint`

Focused validation: worker client `8/8`.

## ADV-002 — poisoned required road lock

**Status: CONFIRMED.**

### Reproduction and baseline

With `roadRequirements === true` and draft mode `must`, a rejecting road-match
dependency was exercised through the hook's save path. Before the fix, the
matcher rejection was swallowed, `addRoadLock` was called with `edgeIds: []`,
the Zustand representative state and persisted localStorage state contained
the lock, and the request builder omitted the empty-edge lock. Eligibility
then treated the saved required lock as unresolved. The user-visible error was
not shown.

The baseline behavior was checked as the contract: a required-match failure
does not save a lock and exposes the failure. The existing prefer-mode
approximate fallback was preserved because the project feature-flag contract
explicitly treats that path as best effort.

### Fix and regression coverage

The matching catch now rethrows for `must` and retains the approximate manual
fallback only for `prefer`.

`tests/unit/components/planner/use-road-lock-draft.test.tsx` verifies the
rejecting required path through the actual planner store and localStorage:
the matcher is called, `addRoadLock` is not, no required lock is persisted,
and the visible error remains. The neighboring prefer-mode test verifies the
contractual approximate fallback. The planner-domain test in
`tests/unit/lib/routing/graphhopper-request.test.ts` separately proves an
empty-edge required lock cannot silently produce a provider request.

Commit: `4ef82a2` — `fix(road-locks): reject unresolved required road locks`

Focused validation: four road-lock/planner files, `48/48` tests.

Remaining uncertainty: the failure was simulated with a rejecting matcher;
no live external router outage was induced. The complete persistence and
request/eligibility chain is covered without touching live user state.

## ADV-003 — restore can target another project

**Status: CONFIRMED.**

### Reproduction and baseline

The resolver was run with test doubles where Switchback's Compose lookup
failed and a foreign Compose project exposed a generic `web` service with a
`/data` mount. On `253a237`, the generic fallback returned the foreign mount.
The same harness verified that multiple candidate mounts were ambiguous.
No real restore or project database was touched.

At baseline `54e9645`, backup and restore used only the explicit
`SWITCHBACK_DATA_ROOT` or the fixed Switchback legacy path; they did not scan
generic Docker containers. The cross-project selection was introduced by the
P01 resolver refactor.

### Fix and regression coverage

Generic `docker ps --filter label=com.docker.compose.service=web` discovery was
removed. Resolution now accepts an explicit `SWITCHBACK_DATA_ROOT` or a
Switchback Compose-file-scoped `web` lookup. Ambiguous or absent inference
fails closed. `restore.sh` validates the resolved root and prints the restore
target before checksum/copy operations; unsafe root shapes are rejected.

`tests/unit/deployment/resolve-data-root.test.ts` covers: foreign generic web
container with failed Compose lookup, the correctly scoped Switchback project,
ambiguous matches, and unsafe roots. The deployment contract tests and shell
syntax checks also pass.

Commit: `e39cf77` — `fix(deployment): scope restore data-root resolution`

Focused validation: deployment resolver/contract tests `11/11`; `bash -n`
passed for resolver, backup, and restore scripts.

Remaining uncertainty: the safe reproduction used shims rather than a live
Docker daemon, and no destructive restore was intentionally performed. The
runtime path is therefore proven fail-closed by contract tests, not by a real
restore against a host filesystem.

## P1 follow-up

### P1-A — worker deadline and slot cleanup

**FIXED.** This was requested as defense in depth for ADV-001. See the worker
deadline commits and `8/8` focused tests under ADV-001.

### P1-B — post-success reroute abort

**CONFIRMED and fixed.** The extracted online resolver could successfully
return a route, then immediately throw because the combined abort signal had
expired during the final await. The regression test aborts the controller from
inside the online resolver and returns a valid route; before the fix it
rejected, and after the fix it returns the resolved route. Offline branches
retain their explicit cancellation checks.

Commit: `924e511` — `fix(reroute): keep routes resolved before abort`

Focused validation: reroute unit tests `10/10`.

### P1-C — recorded-ride finalization cleanup

**PARTIALLY CONFIRMED as a latent duplication; deferred.** The extracted
finalizer and its current timer caller both guard `points.length < 2`, but the
caller performs the notice/reset/surface cleanup before invoking the finalizer.
The only current finalizer throw is that same condition, so it is unreachable
through the current caller and no cleanup bypass was reproducible. No
speculative ownership rewrite was made.

### P1-D — explicit data-root documentation

**DEFERRED for integration.** The explicit `SWITCHBACK_DATA_ROOT` behavior is
implemented and tested, but shared deployment documentation was not edited
because the parallel CI/public-repository workstream may be changing it. The
original review and this result are stored under `docs/reviews/2026-08-21/`.

## Semantic-drift sweep

The refactor/extract commits from `54e9645` through `253a237` were inspected,
including the P01–P10 changes. A narrow sweep covered stream writers and
readers, unresolved promises, timeouts and worker release, abort ordering,
catch-and-continue persistence, required/optional fallbacks, generic Docker
identity, first-match discovery, and ambiguous filesystem resolution. The
known findings above survived reproduction; no additional candidate survived
falsification, so there are no new findings to report.

## Validation

All final local gates passed on the remediation tree:

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 223 files; 1,366 passed; 1 skipped |
| clean `npm run build` | PASS |
| `npm run test:e2e:critical` | PASS — 32/32 Chromium + WebKit |
| `npm run test:e2e:pwa` | PASS — 2/2 |
| `npx playwright test tests/e2e/road-lock.spec.ts --project=desktop-chromium` | PASS — 1/1 |
| deployment syntax and focused tests | PASS — 11/11 |

The requested clean-build boundary was honored in this dedicated worktree;
the shell rejected a literal recursive-delete form, so any pre-existing build
directory was quarantined rather than deleted. Temporary local dependency
trees used for verification were also quarantined outside the worktree and
are not part of the branch.

## Git and merge status

- Worktree: `/root/Vibe/switchback-opus-adversarial`
- Branch: `fix/opus-adversarial-blockers`
- Starting point: `253a237`
- Fix commits are separate by finding; follow-up defense-in-depth and typing
  corrections are separate commits.
- Push status: pushed to `origin/fix/opus-adversarial-blockers`; remote matched
  the local branch after each push. The final remote SHA is reported in the
  agent handoff.
- Merge status: not merged.

External GitHub-hosted public-runner and live-provider gates remain unproven.
This branch must not be treated as ready to merge until those gates run.
