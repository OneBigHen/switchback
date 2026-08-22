# Switchback — Opus Adversarial Pre-Merge Review

Branch: `audit-fixes/deepseek-v4-pro` @ `253a237`
Baseline (merge base with `main`): `54e9645`
Reviewed: 2026-08-21
Diff scope: 52 files, +3703 / −2126

---

## 1. Verdict

**NOT READY**

Three defects survived falsification, two of them introduced by commits whose
messages claim pure extraction. The KMZ import path deadlocks permanently on any
realistically sized file — reproduced in Node 24, Chromium and WebKit, and the
pre-refactor implementation passes the identical experiment. The road-lock draft
hook silently swallows graph-match failures and persists a lock that makes every
subsequent route ineligible. `restore.sh` can now resolve its data root to an
unrelated Docker project and overwrite that project's databases. None of these
are caught by the 1,359 green tests. Separately, GitHub Actions has been
billing-blocked since 2026-08-15, so `real-router` and `live-smoke` are unproven
for this branch *and* for the baseline — the "push and wait for CI" next action
in FINAL-RESULT.md is not currently executable.

---

## 2. Executive Summary

Ordered by actual risk:

1. **ADV-001 (Critical)** — `extractKmzKml` was rewritten from a piped stream to
   a manual writer with no concurrent reader. Every deflated KMZ larger than one
   stream queue hangs forever. The import worker promise never settles, so the
   tab's import lockout counters never release: *all* later route and lock
   imports fail until reload. Regression proven against the baseline.
2. **ADV-002 (High)** — `useRoadLockDraft.commitLockDraft` gained an inner
   `try/catch` that turns a road-match failure into a silently saved
   `edgeIds: []` must-lock. That lock is ignored by the GraphHopper request
   builder but fails `must-road-unresolved` eligibility on every candidate, and
   it is persisted to `localStorage`. The rider is left with a planner that
   cannot produce a route and no message explaining why.
3. **ADV-003 (High)** — the new `resolve_switchback_data_root` falls back to a
   project-agnostic `docker ps --filter label=com.docker.compose.service=web`
   lookup whenever the compose-scoped lookup fails. Reproduced: it returns
   another project's `/data` mount. `restore.sh` then `cp`s over that project's
   SQLite files.
4. **CI reality (blocking context)** — last green Actions run was 2026-08-13,
   five commits before the merge base. Real-router and live-provider coverage is
   currently unobtainable.
5. Everything else is Medium or lower. The routing-core extractions (P02, P04,
   P05) are, on line-level comparison, genuinely behavior-preserving — I tried
   hard to break them and could not.

---

## 3. Blocking Findings

### ADV-001

- **ID:** ADV-001
- **Severity:** Critical
- **Confidence:** High
- **Area:** Route/road-lock import (KMZ), Web Worker
- **Files:** `src/lib/routing/import/kmz-parser.ts:60-77`,
  `src/lib/routing/gpx-import.ts:35-42`,
  `src/workers/route-import.worker.ts:40`,
  `src/lib/client/route-import-client.ts:60-83`
- **Evidence:**

  P08 replaced the baseline implementation

  ```js
  const stream = new Blob([new Uint8Array(entry.compressed)]).stream()
    .pipeThrough(new DecompressionStream("deflate-raw"))
  const decoded = await new Response(stream).text()
  ```

  with

  ```js
  const decompressor = new DecompressionStream("deflate-raw")
  const writer = decompressor.writable.getWriter()
  await writer.write(new Uint8Array(entry.compressed))   // ← blocks here
  await writer.close()
  const decoded = await new Response(decompressor.readable).text()
  ```

  A `DecompressionStream` is a `TransformStream` whose readable side has
  `highWaterMark: 0`. No reader is attached until after `writer.close()`
  resolves, so as soon as the decompressed output exceeds the readable queue,
  backpressure is asserted and `writer.write()` never settles.

  Reproduced with a 117 KB KML compressed to 417 bytes (a small real-world KMZ):

  ```
  Node v24.15.0   OLD(Blob.stream pipeThrough): OK len=117032   NEW(getWriter): HANG
  chromium        { old: 'OK len=117011', neu: 'HANG' }
  webkit          { old: 'OK len=117011', neu: 'HANG' }
  ```

  A temporary vitest case driving the real `extractKmzKml` with that archive
  timed out at 10 s (test removed after the run).

- **Failure scenario:** A rider opens Library → "Import a GPX, KML, or KMZ file"
  (or "…as a road lock") and picks any Google-Earth-produced KMZ. The worker's
  `parseRouteFile` promise never settles, so:
  - the spinner runs forever with no error and no timeout
    (`parseRouteFileInWorker` has no deadline);
  - `activeImportWorkers` stays at 1 → every later import throws
    *"Another route import is already in progress."*;
  - inside the worker `activeRequests` stays populated → *"The route import
    worker is already processing a file."*

  Recovery requires a full page reload. Only stored (compression 0) entries
  survive, which is the rare case.

- **Why current tests miss it:** `tests/unit/lib/routing/import/kmz-parser.test.ts`
  is the only deflate coverage and uses a 51-byte KML — small enough to fit the
  readable queue before backpressure. The test's own compressor helper does
  `await writer.write(...)` too, and works for the same reason. No test uses a
  payload above one chunk.
- **How I tried to falsify it:** (a) read the WHATWG streams spec expecting the
  transform to enqueue unconditionally; (b) ran the small case first — it
  passes, which is why the suite is green; (c) ran the same experiment against
  the *baseline* implementation in the same processes to rule out a Node/
  Playwright quirk — baseline succeeds everywhere; (d) checked all three
  engines rather than only Node.
- **Recommended fix:** Revert to the piped form, or start the reader before
  writing:

  ```js
  const decompressor = new DecompressionStream("deflate-raw")
  const decoded = new Response(decompressor.readable).text()   // reader first
  const writer = decompressor.writable.getWriter()
  await writer.write(new Uint8Array(entry.compressed))
  await writer.close()
  return await decoded
  ```

  Independently, give `parseRouteFileInWorker` a deadline so a wedged worker can
  never permanently disable imports.
- **Recommended regression test:** In `kmz-parser.test.ts`, add one case that
  deflates a KML of ≥100 KB (e.g. a repeated `<coordinates>` line) and asserts
  `extractKmzKml` resolves to the exact original string, with an explicit
  `it(..., 10_000)` timeout. That single test fails on `253a237` and passes on
  the baseline.

### ADV-002

- **ID:** ADV-002
- **Severity:** High
- **Confidence:** High
- **Area:** Road locks / planner eligibility
- **Files:** `src/components/planner/useRoadLockDraft.ts:120-176` (vs baseline
  `src/components/planner/MapStage.tsx` `commitLockDraft`),
  `src/lib/roads/road-locks.ts:454-461`,
  `src/lib/domain/routing/eligibility.ts:281-305`,
  `src/lib/routing/graphhopper-request.ts` (`createGraphHopperRequest`,
  `expandMustLockWaypoints`), `src/stores/planner-store.ts:281,553`
- **Evidence:** Commit `0aa3309` is described as "extract road lock draft hook",
  but the extracted body is not the original. Baseline:

  ```js
  if (featureFlags.roadRequirements) {
    const matched = await requestRoadMatch({...})   // throws out to the outer catch
    ...
  }
  ```

  Branch:

  ```js
  if (featureFlags.roadRequirements) {
    try { const matched = await matchRoad({...}); ...; return }
    catch { /* Save an honest approximate lock when graph matching is unavailable. */ }
  }
  // falls through to the edgeIds: [] manual lock
  ```

  `featureFlags.roadRequirements` is `true` in production. The resulting lock has
  `edgeIds: []` and `confidence: "approximate"`. I confirmed the downstream
  consequence with a temporary test driving the real modules
  (`createManualRoadLock` → `evaluateRoadLockSatisfaction` → `evaluateEligibility`):
  the report comes back `eligible: false` with
  `"Must-use road has not been matched to the current routing graph."`
  Meanwhile `createGraphHopperRequest` and `expandMustLockWaypoints` both filter
  on `edgeIds.length > 0`, so the lock contributes nothing to the request. The
  lock is written through zustand `persist`, so it survives reload.

- **Failure scenario:** `/api/road-matching` is briefly unavailable (GraphHopper
  restart, deploy, network blip) while a rider draws a Must-use lock. Baseline:
  inline error *"The road lock could not be saved."*, nothing persisted. Branch:
  the lock saves and looks successful, then every subsequent plan — this session
  and every future session — fails eligibility with a message about graph
  matching that gives no hint the saved lock is the cause. The rider must find
  and delete the lock to plan any route again.
- **Why current tests miss it:** `tests/unit/components/planner/use-road-lock-draft.test.tsx`
  covers the fallback only in **prefer** mode
  (`"supports prefer mode and saves one approximate fallback when matching fails"`),
  which is harmless. The must-mode failure branch — the dangerous one — is
  untested. `tests/e2e/road-lock.spec.ts` covers only the successful graph match,
  and is in no CI project.
- **How I tried to falsify it:** (a) re-read the baseline `commitLockDraft` from
  `git show 54e9645:` to confirm there was no inner catch — there was not; (b)
  checked whether `roadRequirements` might be off in production — it is `true`;
  (c) checked whether an edgeless must-lock is filtered out harmlessly upstream —
  it is filtered from the *request* but not from *satisfaction evaluation*, which
  is what gates eligibility; (d) verified the poisoning end-to-end with a
  throwaway test rather than by reading.
- **Recommended fix:** Decide the intended contract explicitly and encode it. If
  approximate must-locks are genuinely wanted, downgrade them to `prefer` on
  fallback and tell the rider; if not, restore the baseline behavior (surface the
  error, save nothing). Either way, do not do it inside a commit labelled
  "extract".
- **Recommended regression test:** `useRoadLockDraft` with `lockMode: "must"` and
  a rejecting `matchRoad`: assert the intended outcome explicitly — either
  `addRoadLock` not called and `lockDraftMessage` non-empty, or the saved lock's
  `mode` is `"prefer"`. Pair it with a planner-level test asserting a saved
  `must` lock with `edgeIds: []` never reaches `request.roadLocks`.

### ADV-003

- **ID:** ADV-003
- **Severity:** High
- **Confidence:** High
- **Area:** Deployment / backup & restore
- **Files:** `deployment/lib/resolve-data-root.sh:11-40`,
  `deployment/restore.sh:9-13`, `deployment/backup.sh:11-13`,
  `deployment/docker-compose.production.yml`
- **Evidence:** The resolver tries the compose-scoped lookup first, then falls
  back to

  ```bash
  docker ps -aq --filter label=com.docker.compose.service=web
  ```

  which matches *any* compose project on the host whose service is named `web`.
  The fallback is reached whenever the first branch fails. That first branch is
  fragile by construction: `docker compose -f deployment/docker-compose.production.yml ps`
  interpolates the file, and the file uses `:?` on three variables. Verified on
  this machine:

  ```
  $ env -u SWITCHBACK_TAG -u SWITCHBACK_DOMAIN \
      docker compose -f deployment/docker-compose.production.yml ps -aq web
  error while interpolating services.graphhopper.volumes.[]:
    required variable SWITCHBACK_GRAPH_DATA_ROOT is missing a value
  exit=1
  ```

  Compose auto-loads `deployment/.env` for interpolation, but the compose file
  itself advertises `env_file: ${SWITCHBACK_ENV_FILE:-.env}` — and `env_file`
  does **not** feed `${}` interpolation. An operator following that documented
  option (`SWITCHBACK_ENV_FILE=/etc/switchback/prod.env`) puts the resolver on
  the fallback path permanently. A non-default compose project name does the
  same. Reproduced end to end with a docker shim:

  ```
  RESOLVED=/srv/some-other-project/data
  exit=0
  ```

- **Failure scenario:** A host runs Switchback plus any other compose stack with
  a `web` service that mounts `/data`. `deployment/restore.sh backup-dir` resolves
  `ROOT` to the other project's mount and executes
  `cp "$BACKUP/community.sqlite" "$ROOT/app/community.sqlite"`,
  `cp "$BACKUP/sync.sqlite" "$ROOT/app/sync.sqlite"` and
  `tar -C "$ROOT" -xzf artifacts.tgz` — overwriting a third party's data with
  Switchback's, while Switchback itself is not restored. `backup.sh` has the
  milder version: `sqlite3` creates missing files, so a wrong root yields a
  silently empty "successful" backup.
- **Why current tests miss it:** `tests/unit/deployment/resolve-data-root.test.ts`
  drives a docker shim in which `docker compose ps` and `docker ps` are the same
  branch (`if [ "$1" = "ps" ]`), so it never exercises "compose lookup fails,
  label lookup succeeds". `tests/unit/deployment-contract.test.ts` only greps for
  the presence of the resolver call.
- **How I tried to falsify it:** (a) checked whether compose auto-loads `.env`
  from the compose file's directory — it does, which is why this is not universal;
  (b) checked whether the fallback is project-scoped in some way I missed — it is
  not, the only filter is the service name; (c) confirmed the compose failure is
  real on a live docker binary rather than assumed; (d) confirmed the resolver
  does fail closed correctly when docker is absent or reports nothing.
- **Recommended fix:** Scope the fallback to the Switchback project as well —
  add `--filter label=com.docker.compose.project=<name>` and require the caller
  to supply the project name, or drop the label fallback entirely. Additionally,
  have `restore.sh` refuse a root it did not obtain from `SWITCHBACK_DATA_ROOT`
  or a compose-scoped lookup, and print the resolved root and require
  confirmation before overwriting.
- **Recommended regression test:** Extend `resolve-data-root.test.ts` with a
  shim that distinguishes `docker compose …` (exit 1, as real interpolation
  failure does) from `docker ps --filter label=… web` (returns a foreign
  container), and assert the resolver **fails** rather than returning the
  foreign mount.

---

## 4. Non-Blocking Findings

### ADV-004

- **Severity:** Medium · **Confidence:** High
- **Area:** In-ride reroute
- **Files:** `src/lib/client/ride-reroute.ts:127-133`
- **Evidence:** `resolveReroute` calls `throwIfAborted(signal)` immediately after
  a successful online resolve. `signal` is
  `AbortSignal.any([requestController.signal, AbortSignal.timeout(30_000)])`.
- **Failure scenario:** The routing response lands in the same tick the 30 s
  deadline fires. Baseline applied that route (the caller's only guard was the
  reroute version ref); the branch throws it away and shows the reroute error
  state, discarding a valid recovery line the rider is waiting on.
- **Why current tests miss it:** `ride-reroute.test.ts` only aborts *before* or
  *during* the online call, never between resolution and return.
- **How I tried to falsify it:** I first suspected a much larger regression here
  — that widening the fallback guard from `requestController.signal.aborted` to
  the combined signal removed offline fallback after the 30 s timeout. **That is
  false**, and I am recording the disproof because it looks like a bug: in the
  baseline, `recoverOffline()` passed the same already-aborted `rerouteSignal`
  into `recoverRouteFromInstalledRegions`, whose `geo-worker-client` returns
  `{ ok: false, kind: "cancelled" }` (`src/lib/offline/geo-worker-client.ts:158`),
  after which the baseline threw `"Offline reroute was cancelled"`. Both versions
  end in the same error state; the branch just gets there sooner. Only the
  post-success abort check is a genuine change.
- **Recommended fix:** Return the route when the online call already succeeded;
  reserve the post-abort check for the offline branches.
- **Recommended regression test:** Inject an `online` resolver that aborts the
  controller and then resolves; assert `resolveReroute` returns
  `{ source: "online" }`.

### ADV-005

- **Severity:** Medium · **Confidence:** High
- **Area:** Ride recording finalization
- **Files:** `src/lib/client/recorded-ride-finalization.ts:18`,
  `src/components/planner/PlannerShell.tsx:275-305`
- **Evidence:** `finalizeRecordedRide` throws for `points.length < 2`. It is
  called synchronously inside a `setTimeout` callback, *outside* the
  `rideJournalLibrary.save(...).then().catch().finally()` chain that performs the
  cleanup (`recording.discard()`, surface reset, `freeRideSessionRef` reset).
- **Failure scenario:** Any throw from finalization leaves the recording session
  stuck in `finished` with the ride surface never reset — an unhandled exception
  inside a timer, so no notice either. Currently unreachable: the caller
  duplicates the exact `points.length < 2` guard and returns first. It becomes
  reachable the moment either guard is edited independently.
- **Why current tests miss it:** `recorded-ride-finalization.test.ts` asserts the
  throw in isolation; no test covers the caller's error path.
- **How I tried to falsify it:** Read the caller and confirmed the duplicate
  guard, so I downgraded this from a blocker to a latent trap.
- **Recommended fix:** Either drop the throw (the caller owns the guard) or wrap
  the call so the cleanup always runs.
- **Recommended regression test:** Not worth a dedicated test; deleting the
  duplicate guard is the cheaper correction.

### ADV-006

- **Severity:** Low · **Confidence:** High
- **Area:** Planner state invalidation
- **Files:** `src/components/planner/PlannerShell.tsx:595-601`
- **Evidence:** `handleImportAsLock` adds `routeRequestGate.invalidate()`, which
  did not exist on the baseline lock-import path. `MapStage`'s manual
  `addRoadLock` path still does not invalidate.
- **Failure scenario:** None observed — the addition is defensible. The issue is
  that it is a behavior change smuggled into a refactor commit, and it makes the
  two lock-creation paths inconsistent.
- **Why current tests miss it:** No test asserts gate invalidation on lock add.
- **How I tried to falsify it:** Diffed the baseline drawer path; the store's
  `addRoadLock` already resets `plan`/`selectedRouteId`, so the practical effect
  is small.
- **Recommended fix:** Pick one contract and apply it to both paths; say so in
  the commit message.

### ADV-007

- **Severity:** Low · **Confidence:** Medium
- **Area:** Deployment shell portability
- **Files:** `deployment/lib/resolve-data-root.sh:30,34`
- **Evidence:** `for existing_source in "${data_sources[@]}"` and
  `for container_id in "${container_ids[@]}"` expand possibly-empty arrays under
  the caller's `set -u`. Safe on bash ≥ 4.4 (verified on bash 5.2.15: the empty
  paths return the intended fail-closed message). Bash 3.2 — still `/bin/bash` on
  macOS, which README lists as supported — treats this as an unbound variable.
- **Failure scenario:** On macOS the resolver aborts with `unbound variable`
  instead of the intended message. It still fails closed, so this is cosmetic
  correctness, not data risk.
- **How I tried to falsify it:** Ran every empty-array path on bash 5.2 — all
  clean. I did **not** have a bash 3.2 to test against, hence Medium confidence.
- **Recommended fix:** `"${arr[@]+"${arr[@]}"}"` in both loops.

### ADV-008

- **Severity:** Low · **Confidence:** High
- **Area:** LibraryDrawer contract
- **Files:** `src/components/planner/LibraryDrawer.tsx:238-249`
- **Evidence:** P09 removed the drawer's self-contained import path; the prop is
  now effectively required, but is still typed `onImportAsLock?`. Without it the
  affordance renders and fails with *"Road lock import is unavailable in this
  view."*
- **Failure scenario:** Latent only — `PlannerShell` is the sole production
  caller and passes the prop.
- **Recommended fix:** Make the prop required, or hide the affordance when it is
  absent.

### ADV-009

- **Severity:** Low · **Confidence:** High
- **Area:** Deployment documentation
- **Files:** `deployment/README.md`, `deployment/.env.example`
- **Evidence:** Neither documents `SWITCHBACK_DATA_ROOT`,
  `SWITCHBACK_LEGACY_DATA_ROOT`, nor the new fail-closed contract. Baseline
  backups silently used `/var/lib/switchback`; they will now hard-fail on hosts
  the resolver cannot classify.
- **Failure scenario:** A cron `backup.sh` starts exiting non-zero after deploy
  with a message no runbook explains.
- **Recommended fix:** Document the contract and add `SWITCHBACK_DATA_ROOT` to
  `deployment/.env.example` as the recommended explicit setting. (This is also
  the cheapest mitigation for ADV-003.)

---

## 5. Test Blind Spots

Ranked by expected defect-catching value.

1. **Deflated KMZ above one stream chunk.**
   *Current coverage:* one 51-byte deflate case.
   *Why it matters:* catches ADV-001 outright; the entire KMZ feature is broken
   without it and the suite is green.
   *Test:* in `tests/unit/lib/routing/import/kmz-parser.test.ts`, deflate a
   ≥100 KB KML into a `storedKmz` archive and assert
   `await extractKmzKml(archive)` equals the original string, with a 10 s
   per-test timeout.

2. **Must-mode road-lock draft when graph matching fails.**
   *Current coverage:* only prefer-mode fallback.
   *Why it matters:* catches ADV-002 and pins the intended contract instead of
   ratifying whatever the code does.
   *Test:* `useRoadLockDraft({ addRoadLock, matchRoad: rejects })` with
   `setLockMode("must")` → assert the intended outcome (no lock saved + message,
   or saved as `prefer`). Add a planner-level assertion that a `must` lock with
   `edgeIds: []` never appears in the outbound `roadLocks`.

3. **Resolver: compose lookup fails, label lookup finds a foreign container.**
   *Current coverage:* the shim collapses both docker calls into one branch.
   *Why it matters:* catches ADV-003, the only finding with destructive
   consequences.
   *Test:* shim where `docker compose …` exits 1 and `docker ps --filter label=…`
   prints a foreign container id; assert non-zero exit.

4. **Import worker deadline.**
   *Current coverage:* none — `parseRouteFileInWorker` has abort support but no
   timeout, and no test covers a worker that never replies.
   *Why it matters:* turns any future never-settling parse (ADV-001 was one) from
   a permanent tab-wide lockout into a recoverable error.
   *Test:* a worker stub that never posts a message; assert the promise rejects
   and that a second import is accepted afterwards.

5. **`resolveReroute` post-success abort.**
   *Current coverage:* aborts before/during the online call only.
   *Why it matters:* catches ADV-004 and locks the deadline semantics.
   *Test:* online resolver aborts the controller then resolves → expect
   `{ source: "online" }`.

6. **Malformed / partial GraphHopper responses through the new response module.**
   *Current coverage:* `graphhopper-response.test.ts` uses one well-formed path.
   *Why it matters:* not a regression (P04 is a verified pure move), but the
   split created the natural home for it and the real-provider failure modes —
   `paths: []`, `points.coordinates` missing, absent `details`/`snapped_waypoints`
   — have no direct unit coverage anywhere.
   *Test:* three cases through `normalizeGraphHopperPath` with each field
   omitted, asserting no throw and honest degraded metadata.

7. **`tests/e2e/road-lock.spec.ts` is in no CI project.**
   *Current coverage:* it exists and passes (I ran it: 1 passed, 46.7 s) but
   `desktop-chromium` / `mobile-*` are not in `quality.yml`.
   *Why it matters:* the single end-to-end proof of the flow P07 rewrote never
   runs automatically.
   *Fix:* add the spec to the `critical-chromium` project or add a CI job for the
   default projects.

---

## 6. Architecture Assessment

**Simpler:** Yes, materially. `graphhopper.ts` 599 → 36 lines of transport with
request/response construction in named modules; `planner.ts` 717 → a thin
orchestrator over `planner-contract` / `-shared` / `-segmented` / `-timebox`;
`gpx-import.ts` 406 → a 60-line format router over three parsers. `MapStage.tsx`
sheds 172 lines of unrelated draft state. These are the right seams.

**Layering:** Mostly improved. P03 is a real fix, not just a move — the server
route `src/app/api/routes/route.ts` no longer imports `characterForProfile` from
`@/lib/client/corridor-hints-client`, removing a server→client-module edge.
I verified the new module graph has no cycles:
`planner → {contract, shared, segmented, timebox}`,
`graphhopper → {request, response}`,
`gpx-import → import/{gpx,kml,kmz,shared}` — all acyclic and one-directional.

**Facade discipline:** Verified export parity — nothing importable from
`planner.ts`, `gpx-import.ts`, `graphhopper.ts` or `destination-corridors.ts` at
the baseline is missing on the branch. `graphhopper.ts`'s re-exports are load
bearing (`src/app/api/road-matching/handler.ts` uses `createGraphHopperRequest`),
so that facade is real, not residue.

**Provider safety:** Unchanged, and correctly so. `hybrid.ts` was not touched;
it is genuinely fallback-only (Valhalla is invoked only inside the GraphHopper
`catch`), which is what P11's README rewrite now claims. The docs change is
accurate — I checked the code rather than the commit message.

**Production safety:** This is where the architecture is weakest. Two of the
three blockers are behavior changes hidden inside extraction commits (ADV-001,
ADV-002). The extraction *shape* is fine; the discipline of "extract, then change
in a separate commit" was not held, and the test added alongside each change
documents the new behavior instead of protecting the old one.

**Abstractions I would undo:** none of the module splits. Two small ones:
- `src/lib/client/corridor-hints-client.ts` re-exporting `characterForProfile`
  is a dead shim (only a test uses that path).
- `destination-corridors.ts` re-exporting `backtrackingShare`/`selfOverlapShare`
  keeps `route-quality.ts` importing geometry metrics from the corridors module;
  point it at `route-geometry-quality` and drop the shim.

---

## 7. Production / CI Risk

### Locally proven (I ran these myself on `253a237`)

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 223 files, 1,359 passed, 1 skipped, 291 s |
| `npm run build` | PASS (on a clean `.next`) |
| `npm run test:e2e:critical` | PASS — 32 passed, chromium + webkit |
| `npm run test:e2e:pwa` | PASS — 2 passed |
| `tests/e2e/road-lock.spec.ts` (desktop-chromium) | PASS — not part of any gate |

FINAL-RESULT.md's local numbers are accurate. One caveat worth recording: my
first `npm run build` failed with
`.next/dev/types/validator.ts(363,1): error TS1128`. That was **my** artifact —
the Playwright `webServer` runs `next dev` into the same `.next`, leaving a
partially written generated validator. `rm -rf .next && npm run build` passes.
CI is unaffected (clean checkout), but locally, always build on a clean `.next`
after an e2e run.

### Not yet proven

- **`visual` project (a CI job).** Fails locally, 10/12 snapshots, 33–72 % pixel
  diff. **I falsified this as a branch regression:** I checked out `54e9645` into
  a throwaway worktree and ran the same project — it fails identically, with
  byte-identical diff counts on the shared screens (Library 62,499 px on both;
  Record 461,898 px on both; Plan-route-result 422,059 px on both). The
  snapshots were generated on GitHub's runner and this machine's font stack does
  not match. The branch introduces no visual change to those screens — but the
  gate itself remains unverifiable outside CI.
- **`test:e2e` default projects** (`desktop-chromium`, `mobile-safari`,
  `mobile-landscape-*`) — not run locally beyond `road-lock.spec.ts`, and not run
  by CI either.
- **memory-soak** — not run.

### Requires GitHub / live-provider evidence

- **`real-router`** and **`live-smoke`** — the only jobs that exercise a real
  GraphHopper graph and live external providers. Neither has run for this branch.

  This is worse than "not yet run". `gh run list` shows the **last successful
  Actions run was 2026-08-13**; every run since (2026-08-15, 2026-08-16 ×2,
  2026-08-18 ×2) failed before starting with:

  > *The job was not started because recent account payments have failed or your
  > spending limit needs to be increased.*

  The merge base `54e9645` is itself one of those blocked runs. So real-router
  and live-provider coverage is unproven for the branch **and** for its baseline,
  and the FINAL-RESULT.md next action ("push, wait for the checks, merge if
  green") cannot execute until the billing block is cleared. Treat "CI will catch
  it" as unavailable, not pending.

---

## 8. Refactor Residue

- `docs/fix-brief.md` — the AI implementation prompt for this work
  ("You are working in <local checkout>…"), committed into `docs/`. It
  references `docs/audit-deepseek-v4-pro.md` as a source of truth and instructs
  not to commit audit docs. Delete or move out of the shipped tree.
- `src/lib/client/corridor-hints-client.ts:4` — `export { characterForProfile }`
  compat shim; only `tests/unit/corridor-hints-client.test.ts` uses it. Repoint
  the test and delete.
- `src/lib/routing/destination-corridors.ts:5` — re-export of
  `backtrackingShare`/`selfOverlapShare`; `src/lib/routing/route-quality.ts:2` is
  the only remaining consumer. Repoint it at `route-geometry-quality` and delete.
- `src/lib/client/road-lock-import.ts:2` imports `MAX_GPX_IMPORT_BYTES` from the
  `gpx-import` facade rather than `routing/import/shared`, pulling the parser
  chain into that module's graph unnecessarily. Neutral vs baseline, but the
  split made the cheaper import available.
- `src/components/planner/LibraryDrawer.tsx` — `onImportAsLock?` is optional in
  the type but mandatory in behavior (ADV-008).
- `useRoadLockDraft.resetLockDraft` sets `lockMode` to `"must"` unconditionally
  while the initial state is `featureFlags.roadRequirements ? "must" : "prefer"`.
  Pre-existing (carried over verbatim), but it is now in a file whose whole
  purpose is owning that state.
- `deployment/.env.example` / `deployment/README.md` do not describe the new
  data-root contract (ADV-009).
- No unused dependencies, abandoned flags, or stale env vars found. No consolidations
  that should be undone.

---

## 9. Five Most Dangerous Assumptions

1. **"Small stream fixtures behave like real files."** The KMZ deflate test
   works precisely because 51 bytes fits inside one queue. Every stream-shaped
   test in this repo should be sized above a chunk boundary; this one assumption
   hid a total feature failure behind a green suite.
2. **"A refactor commit contains only a refactor."** Two of the three blockers
   are semantic changes inside commits titled `refactor(P07)` and
   `refactor(P08)`. The review process, the commit log and FINAL-RESULT.md all
   describe these as extractions.
3. **"An error we can swallow is an error we should swallow."** ADV-002 turns a
   visible, recoverable failure into invisible, persisted, planner-wide breakage.
   The pre-existing *comment* claimed best-effort fallback; the code did not; the
   refactor made the comment true without asking whether it should be.
4. **"Discovering the environment at runtime beats being told about it."** The
   data-root resolver infers production topology from docker labels. It is right
   more often than the old hardcoded default was — and wrong in a way that can
   destroy an unrelated system's data, which the old default never could.
5. **"CI is the safety net for what we could not test locally."** Actions has
   been billing-blocked for six days; the last green run predates the merge base
   by five commits. Every risk currently deferred to `real-router` and
   `live-smoke` is, in practice, deferred to production.

---

## 10. Recommended Action Plan

### P0 — must fix before merge

1. **ADV-001** — restore streaming decompression in `extractKmzKml` (attach the
   reader before writing, or revert to `Blob.stream().pipeThrough(...)`). Add the
   ≥100 KB deflate regression test.
2. **ADV-002** — decide and encode the must-lock fallback contract in
   `useRoadLockDraft.commitLockDraft`; add the must-mode failure test.
3. **ADV-003** — scope the docker fallback to the Switchback compose project (or
   remove it), and make `restore.sh` refuse an unscoped root. Add the
   compose-fails/label-succeeds resolver test.

### P1 — should fix before merge

4. Add a deadline to `parseRouteFileInWorker` and release the
   `activeImportWorkers` / worker `activeRequests` slots on it — defense in depth
   for any future never-settling parse.
5. **ADV-004** — return an already-resolved online reroute instead of discarding
   it on a concurrent deadline.
6. **ADV-005** — remove the duplicate `points.length < 2` guard (keep one), so a
   finalization throw cannot skip the recording cleanup.
7. **ADV-009** — document the data-root contract and add `SWITCHBACK_DATA_ROOT`
   to `deployment/.env.example`.
8. Add `tests/e2e/road-lock.spec.ts` to a CI-executed project.
9. Clear the GitHub Actions billing block and get one green `real-router` +
   `live-smoke` run on this branch. Until then the merge is unverified against a
   real graph, regardless of the code fixes.

### P2 — safe follow-up

10. **ADV-006** — align gate invalidation across both lock-creation paths.
11. **ADV-007** — `"${arr[@]+"${arr[@]}"}"` in the resolver loops.
12. **ADV-008** — make `onImportAsLock` required or hide the affordance.
13. Remove `docs/fix-brief.md`; drop the `corridor-hints-client` and
    `destination-corridors` compat shims.
14. Add malformed-response cases to `graphhopper-response.test.ts`.

Do not hold the merge for P2.

---

## 11. Final Challenge

If this branch breaks Switchback in production despite every current test being
green, the three most likely reasons are:

1. **A rider imports a KMZ and the app's import subsystem dies for the rest of
   the session.** `extractKmzKml` blocks on `writer.write()` because nothing is
   reading `decompressor.readable`. The worker's `parseRouteFile` promise never
   settles, so `activeRequests` never clears in the worker and
   `activeImportWorkers` never decrements on the main thread. Both later reject
   every import — *"Another route import is already in progress."* — with no
   error surfaced for the original file and no timeout to break the wedge. Only
   a reload recovers. Reproduced in Node 24, Chromium and WebKit; the baseline
   implementation passes the same experiment.

2. **A road-match blip permanently bricks a rider's planner.** With
   `featureFlags.roadRequirements === true`, a failed `/api/road-matching` call
   during a Must-use lock draft now saves a lock with `edgeIds: []` instead of
   reporting the failure. `createGraphHopperRequest` and
   `expandMustLockWaypoints` both skip it (`edgeIds.length > 0`), so it never
   influences routing — but `evaluateRoadLockSatisfaction` returns
   `satisfied: false / "Must-use road has not been matched to the current routing
   graph"`, and `mustRoadFailure` in `eligibility.ts` therefore rejects every
   candidate. The lock is persisted through zustand `persist`, so the failure
   survives reloads and the rider has no way to connect the error message to the
   lock they saved days earlier.

3. **A restore writes Switchback's databases over an unrelated service's.**
   `resolve_switchback_data_root`'s second branch,
   `docker ps -aq --filter label=com.docker.compose.service=web`, is not scoped to
   the Switchback compose project. It is reached whenever
   `docker compose -f deployment/docker-compose.production.yml ps` fails — which
   it does whenever `SWITCHBACK_TAG` / `SWITCHBACK_DOMAIN` /
   `SWITCHBACK_GRAPH_DATA_ROOT` are not resolvable at interpolation time
   (verified: exit 1 with a `required variable … is missing a value` error), for
   example under the compose file's own documented `SWITCHBACK_ENV_FILE` option,
   since `env_file` does not feed `${}` interpolation. `restore.sh` then `cp`s
   over `$ROOT/app/community.sqlite`, `$ROOT/app/sync.sqlite` and untars
   `artifacts.tgz` into a directory belonging to a different application. No
   local test exercises that branch combination, and it exits 0.

---

### Review hygiene

All experiments were run against the working tree at `253a237` and cleaned up:
two temporary vitest files created and deleted, one baseline `git worktree`
created and removed, `test-results/` removed. `git status` is clean and
`git worktree list` shows only the primary checkout. No repository file was
modified by this review.
