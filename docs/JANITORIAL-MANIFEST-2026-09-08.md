# Janitorial manifest — 2026-09-08

An adversarial cleanup pass over the whole repository: dead code, retired
surfaces, generated output committed as if it were source, duplicated agent
tooling, and historical execution documents that git history already archives.

**Result: 51.2 MB of 81.2 MB tracked bytes removed (66%), 1,871 → 1,280 tracked
files, 395 → 128 markdown documents.** No product behaviour changed. Full
verification is at the end.

Method: every candidate was traced against runtime imports, build scripts, CI
workflows, tests, persisted-data migrations, current documentation authority,
and the four still-open integration PRs (#82 → #66 → #80 → #81) before deletion.
Automated tools (`find-dead-css-rules.mjs`, `find-orphaned-classes.mjs`,
`react-doctor`) were treated as evidence, not authority — every hit they
produced was confirmed by hand.

---

## 1. Deleted now

### CI workflows and debug configs

| Removed | Evidence |
|---|---|
| `.github/workflows/pr61-click-fence.yml` | Triggered only on push to `ux/map-native-route-sculpting`, a branch that no longer exists on the remote. Ran one vitest file that `quality.yml`'s `npm test` already runs on every PR |
| `.github/workflows/refresh-v2-visual-baselines.yml` | Self-described "Temporary release-candidate helper. Remove after…". Triggered only on push to `ux/v2-final-integration`, also gone from the remote |
| `playwright.debug.config.ts` | No script, workflow, or doc referenced it. Its sole project matched `_debug-geometry.spec.ts` |
| `tests/e2e/mobile-qa/visual/_debug-geometry.spec.ts` | A `console.log` geometry dump. Ran in zero projects |
| `tests/e2e/mobile-qa/core/debug-free-ride-trace.ts` | Explicitly `testIgnore`d by every mobile-qa project and named `.ts` not `.spec.ts`, so it was collected by nothing. Its `DEBUG_TRACE_SPEC` guard in `devices.ts` went with it |

The remaining seven workflows were each checked and kept: `quality.yml` (the
merge gate), `deep-qa.yml`, `mobile-core.yml`, `mobile-qa.yml` (advisory,
nightly), `live-validation.yml`, `homelab-ci-smoke.yml`, and
`homelab-integration.yml`. **No release gate was weakened.**

### Dead components, aliases, and CSS

| Removed | Evidence |
|---|---|
| `src/components/planner/LibraryDrawer.tsx` | A one-line compatibility re-export of `RidesDestination` from the V2 modal→destination migration. `PlannerShell` now imports the canonical component directly |
| `src/app/styles/switchback-v1.css` (18.9 KB) | The retired V1 presentation authority. Imported by nothing — it had been out of the live cascade since V2, and `tests/unit/global-class-coverage.test.ts` passes without it, which is that test's exact contract ("a stylesheet is only safe to delete once nothing renders its classes") |
| `src/app/styles/ride-omnibox.css` (8.8 KB) | 58 of ~77 rules flagged dead. Every class it defined (`.ride-omnibox`, `.ride-quick-intents`, `.ride-understanding`, `.ride-recents`, `.ride-voice-button`, `.plan-mode-switch`, `.brand-lockup`, `.ride-intent-heading`, …) is rendered by no component and selected by no e2e test — the surface was replaced by `planner/v2/PlanComposer` + `RideRequestAutocomplete`. Its three live rules (`.ride-deck-header`) moved verbatim into `planner-deck.css`, which is what renders them; specificity and cascade order are unchanged, and all 60 visual snapshots still pass |
| `public/assets/scenic/*.webp` (3 files) | V1-era generated imagery with no consumer. Their only styling was `.route-scenic-gallery` in `switchback-v1.css`, itself dead |

I searched for other alias-only re-export files (≤3 code lines, body is a
single `export {…} from`). `LibraryDrawer.tsx` was the only one.

### Production code that existed only for tests (relationship reversed)

| Removed | Evidence |
|---|---|
| `buildAtlasCollectionCopy` + `AtlasCollectionCopyCounts` + `countLabel` in `src/app/gpx-library/page.tsx`, and `tests/unit/atlas-copy.test.ts` | The function's own docstring said "Retained for `tests/unit/atlas-copy.test.ts`; the V2 browser header does not currently surface it." Nothing else called it |
| `tests/unit/touch-target-contract.test.ts` | Every assertion matched CSS text for `.ride-omnibox`-family and `.brand-lockup` classes that nothing renders. It reported green while protecting nothing |
| `tests/unit/editor-touch-target-contract.test.ts` | Same: `.plan-mode-switch button`, `.route-edit-toolbar button`, `.edit-route-button` are rendered by no component and used by no e2e selector |

Touch-target coverage did **not** regress: it is enforced against the rendered
UI by `expectMinimumTouchTargetSize(page, 44)` in
`tests/e2e/mobile-qa/assertions.ts` and by real-rect measurement in
`tests/audit/responsive.audit.pw.ts`. Measuring the DOM is strictly stronger
than string-matching a stylesheet.

### Dependencies

| Removed | Evidence |
|---|---|
| `@fontsource-variable/sora` | No stylesheet named the family. `globals.css` imported it and shipped it to every rider as unused font payload; the only other mention was a *negative* assertion in a test |
| `@fontsource-variable/dm-sans` | Same |
| `better-sqlite3` (+ `@types/better-sqlite3`, + its `allowScripts` install-script allowance) | It had two real consumers, so it was **migrated, not merely dropped**. All persisted storage already used Node's built-in `node:sqlite` (`DatabaseSync`); `scripts/build-offline-v2.mjs` and `tests/unit/curvature.test.ts` were the last holdouts. Both now use `node:sqlite`. `.pragma()` became `PRAGMA` via `exec`, and `.transaction()` — which `node:sqlite` lacks — became an explicit `BEGIN`/`COMMIT`/`ROLLBACK` wrapper that preserves the batching the import speed depends on |

That removes a native-compiled dependency and one of three reviewed
install-time lifecycle scripts. `npm run verify:install-scripts` still passes
with the two that remain.

**`build-offline-v2.mjs` is exercised by no test**, so I proved the migration by
A/B: I rebuilt the same region from `tests/fixtures/osm/switchback-test.osm`
with the original `better-sqlite3` implementation and the new one. Output was
**byte-identical** except the build timestamp — same version hash
(`2026-09-09-fa6524cb82c1b26c`), same tile SHA-256, same edge/way/restriction
counts (28 nodes, 13 ways, 11 eligible, 48 directed edges).

### Generated output that was committed as if it were source

| Removed | Size | Why |
|---|---|---|
| `artifacts/screenshots/**` (48 files) | 12.6 MB | Written by `page.screenshot({path: …})` inside the e2e suites on every run. Regenerated, never compared against — not baselines |
| `artifacts/cinco/**` (43) | 2.6 MB | Phase-evidence captures from the closed CINCO program |
| `artifacts/vqa/**` (7) | 0.9 MB | One PR's visual-QA run, pinned to commit `b51653b` |
| `.impeccable/review/*.png` (2) | 0.5 MB | Working screenshots for the design skill |
| `design/generated/v1/**` (25) | 13.4 MB | Model-generated V1 contact sheets and screens. V1 is not an acceptance target — `design/DESIGN-CONTRACT.md` (V2) supersedes it |
| `docs/astra/evidence/**` (47) | 14.2 MB | `ASTRA-STATE.md` itself called these "historical evidence, not current acceptance." Includes a 7.2 MB raw probe event log |
| `bench/out/results-*.jsonl`, `seam-*.jsonl` (12), `gemini-model-health-probe.txt` | 0.6 MB | Timestamped raw model responses from the advisor bakeoff |
| `bench/dbg.mts`, `bench/dbg-or.mts` | — | Single-trace `console.log` debuggers superseded by `run.mts`/`blind.mts`/`seam.mts` |

`.gitignore` was extended so all of it stays out, with a comment explaining
which artifacts are deliberately versioned and that real baselines live in
`tests/e2e/visual/*-snapshots/`.

### Vendored agent tooling

| Removed | Evidence |
|---|---|
| `.github/skills/impeccable/**` (148 files, 3.3 MB) | A **second, divergent copy** (21 files differ) of the Impeccable skill, mirrored for the GitHub Copilot harness. No workflow, npm script, Dockerfile, or source file referenced it |
| `.github/hooks/impeccable.json` | Pointed at that copy, and was a guaranteed no-op anyway: its bash guard only runs the hook on Node ≤ 22, while `package.json` requires Node ≥ 24 |
| `.github/agents/*.agent.md` (4) | Sub-agent definitions supporting only that mirror, referencing its now-removed `scripts/` paths |

**`.claude/skills/impeccable/**` was kept** — it is the live, user-invocable
skill for this repository (the session's `impeccable` skill resolves from it;
there is no copy at `~/.claude/skills/`). That is the brief's own exception: do
not remove a tool a current workflow genuinely depends on. If the Copilot
harness is ever wanted back, the skill's own `scripts/hook-admin.mjs` reinstalls
those manifests.

### Documentation

Every markdown file was classified as (1) current authority, (2) durable
architectural decision, (3) deliberately retained evidence, or (4) historical
execution material. Category 4 was removed; git history is the archive.

| Removed | Count | Why |
|---|---|---|
| `docs/cinco/**` | 45 | The superseded CINCO roadmap: 20 numbered docs, 9 agent prompt packets, 9 phase docs, 2 multi-megabyte visual boards. `DESIGN.md` already calls the CINCO system "migration evidence only" |
| `docs/phase-reports/P01–P36` | 36 | Completion reports for a finished build |
| `docs/ux/v2-1/**`, `docs/ux-v2/` | 29 | V2/V2.1 wave execution material, superseded by `design/DESIGN-CONTRACT.md` and `docs/astra/` |
| `docs/superpowers/plans|specs` | 15 | Completed implementation plans and their design specs |
| `plans/routing-intelligence-rework/**` | 21 | A completed rework plan with its own handovers and phase docs |
| `switchback_full_recovery_spec/**` + `.zip` | 28 | A ZIP **and** its expanded contents — verified byte-identical across all 27 files |
| `docs/switchback-build/**` + `SWITCHBACK_ROUTING_BUILD_PACKAGE.zip` | 10 | Same duplication: 3 of the 7 files were byte-identical to the ZIP's contents |
| `SWITCHBACK_COMPLETION_AND_PRACTICAL_QUALITY_PLAN.md` + `.zip` | 2 | Same file twice; a completed plan |
| `switchback-production-master-spec-2026-08-10.zip` | 1 | Superseded spec package — **and the source of the README's MapLibre/OpenFreeMap drift** (see §5) |
| `docs/quality/MODULE_SWEEP_*` | 10 | 2026-08-24 sweep reports from the closed remediation campaign |
| `docs/reviews/**`, `docs/recovery/**`, `docs/handovers/`, `docs/plans/`, `.planning/**` | 34 | Historical reviews, recovery worklogs, old handoffs, completed plans |
| `AUDIT-EVALUATION.md`, `AUDIT-SUPPLEMENT.md`, `UX-AUDIT.md` | 3 | July 2026 audits. `AUDIT-SUPPLEMENT`'s central finding — the "5,688-line globals.css problem" — was fixed long ago; `globals.css` is now 14 lines |
| `docs/CLOSURE-*.md`, `docs/PRE-RESKIN-PLAN.md`, `docs/UX-OVERHAUL-PLAN.md`, `docs/REMAINING-ROADMAP-GLM.md`, `docs/MOCKUP-BRIEF.md`, `docs/SHAREABILITY-REVIEW-*`, `docs/audit-*` | 11 | Historical snapshots; `CLOSURE-SUMMARY.md` was already marked superseded in its own first line |
| `docs/ai-workflow.md` | 1 | Described a Codex-lead / `glm-worker` workflow with no tooling left in the repo |
| `docs/current-architecture.md` | 1 | A 2026-08-04 snapshot that had drifted; its role is now the README's architecture section, which is one place instead of two |

Nothing was deleted before its still-valid unique content was extracted:

- **ADR 0024 (new): evidence integrity.** Four rules found only in the removed
  spec packages — a generated route is never its own evidence (already enforced
  as `RIG_SOURCE_WEIGHTS["switchback-generated-route"] = 0`); absence from a GPX
  is never negative evidence; community GPX is preference evidence, never legal
  authority; never claim "safe"/"verified"/"open" without exact supporting
  evidence. The code enforced these; nothing recorded *why*.
- **`docs/COMPATIBILITY.md` (new)** — the shim register described in §3.
- **`docs/DEPLOYMENT.md` (new)** — the self-hosting content moved out of the
  README verbatim, not dropped.
- **`docs/quality/UX-STATE-CONTRACT.md`** — promoted out of `docs/cinco/`. This
  is live authority, not history: `tests/e2e/helpers/ux-state-fixtures.ts` and
  `tests/e2e/visual/ux-states.spec.ts` are pinned to it. Both references updated.
- **AGENTS.md** gained the one deferred product decision the removed
  `LEAD-DECISIONS.md` held (no fully automatic route extraction from arbitrary
  map images), plus a note that this pass happened, so no future agent mines
  git history for the deleted campaign material as a worklist.
- The methodology and known blind spots documented in `CSS-DEAD-RULES.md` and
  `ORPHANED-CLASSES.md` moved into the header comments of the two scripts they
  describe — the tool is the right home for how the tool works. The per-rule
  campaign verdicts went.

Zero dangling markdown links remain (verified by a link checker across all 128
tracked `.md` files).

### Astra reduction

`AGENTS.md` gives `docs/astra/` implementation authority, so this was
reconciled against what has actually landed rather than trimmed by age. Waves 0
and 1 are both **merged** (PR #63 and #64, 2026-09-06).

Removed: `WAVE1-ARCHITECTURE.md`, `WAVE1-MIGRATION.md` (completed wave
instructions), `astra-handoff-report.md` (a handoff whose content was mostly
pointers to the removed evidence), `WAVE-RECONCILIATION.md` (its open question
— "is Astra a second roadmap?" — was answered on 2026-09-05 and the answer is
recorded in `ROADMAP-WAVES.md`), and `evidence/**`.

Kept as the current set: `FULL-REFACTOR-SPEC` (entry point),
`PRODUCT-NORTH-STAR`, `UX-AUDIT` (its U01… finding IDs are referenced by the
backlog), `ARCHITECTURE-ASSESSMENT`, `INTERACTION-SPEC`, `DESIGN-SYSTEM`,
`IMPLEMENTATION-BACKLOG`, `RELEASE-GATES`, `ASTRA-STATE`.

`ASTRA-STATE.md` had drifted — it still said Wave 1 was "not merged, not
deployed" and named a working branch that no longer exists. It now records
`main @ b53c177`, both waves merged, everything that has landed since, and the
next task (Astra Wave 2, gated on the open integration stack). All
cross-references into removed files were repaired, and `AGENTS.md` now names the
reduced set.

---

## 2. Deferred because of open integration work

Nothing below was touched. Each is either modified by an open PR or would
create a rebase conflict for one.

| Candidate | PR that touches it | Intended cleanup after reconciliation |
|---|---|---|
| `docs/superpowers/plans/2026-09-07-graphics-ux-foundation.md`, `docs/superpowers/specs/2026-09-07-graphics-ux-foundation-design.md` | **#82** modifies both | Delete with the rest of the completed superpowers plans once #82 lands. They are the only two left in that tree |
| `docs/superpowers/plans/2026-09-07-map-system-foundation-phase1.md`, `docs/superpowers/specs/2026-09-07-map-system-overhaul-design.md` | **#82** adds them | Not on `main` yet. Delete after the map-system wave closes |
| `docs/GRAVEL-GOBLIN-ROUTE-MEMORY-SPEC.md`, `docs/superpowers/plans/2026-09-07-gravel-goblin-route-memory.md` | **#81** adds them | Same — completed-plan cleanup after #81 lands |
| `docs/GRAVEL-GOBLIN-ROUTING-REVIEW.md` | **#80** adds it | Same after #80 lands |
| `docs/quality/sessions/2026-09-06-prebeta-evidence/**` (10 PNGs) | **#82** modifies this tree | Also protected by the #78 exception below — see §3 |
| `docs/design/GRAPHICS_*.md` (3) | **#82** modifies all three | Re-evaluate after #82; the asset guide is likely current authority, the adversarial review and integration map are likely category 4 |
| `src/lib/client/map-experience.ts` `legacyMapStyleFor`, `src/lib/storage/map-pack-library.ts` | **#82** modifies both | Documented in the compatibility register instead of edited. Deletion condition is MapLibre retirement (roadmap phase 11) |
| `PlannerShell.tsx` / `PlannerMapStage.tsx` decomposition | **#82** modifies both heavily | Not janitorial work — see §6 |

### Integration-stack safety, verified rather than assumed

All four open branches were test-merged against this cleanup with
`git merge-tree`: **`implement/map-system-phase1` (#82),
`feat/recorded-rides-route-intelligence` (#66),
`feat/gravel-goblin-route-intent` (#80), and
`feat/gravel-goblin-route-memory` (#81) all merge cleanly — zero conflicts.**

A clean textual merge is not proof the result works, so #82 — by far the
largest, and the only one that touches a file this pass edited — was actually
merged in a scratch worktree and built: **typecheck passes and the merged suite
is 341 files / 2,162 tests / 0 failed.** The merged tree contains no live
reference to anything removed here (the remaining `switchback-v1.css` mentions
are historical comments in other stylesheets, which were already accurate).

Conflict risk was also checked hunk-by-hunk, not assumed. The one edit this pass made
to a file an open PR touches is `PlannerShell.tsx` (the `LibraryDrawer` import at
line 69 and its single JSX usage at line 1794). #82's hunks in that file are at
lines 1–7, 13–22, 210, 858, 881, and 1414–1468 — no overlap, and not within
diff-context range of either edit.

---

## 3. Deliberately retained

| Kept | Why |
|---|---|
| **Persisted-data migrations** — `trip-plan-migration.ts`, `offline-route-pack.ts` v1→v2 upgrade, `migrateRiderLayerId`, `classifyLegacyOfflineBundle`, `region-download-client.ts` `LegacyGraphEntry`, `ride-checkpoint.ts` version guard | Rider data lives **only** on the rider's device — there is no server copy to re-derive from. Deleting one of these silently destroys someone's saved rides, trips, or packs. All are now contained and documented in `docs/COMPATIBILITY.md` with the old form accepted, the canonical output, whether new code can still write the old form, and an explicit deletion condition |
| `legacyMapStyleFor` — the one shim that **deliberately still writes** a legacy form | A pack saved by current code also writes the old `mapStyle` so it stays readable by an older installed PWA that has not updated. Recorded as such |
| **ADRs 0001–0024, including superseded ones** | ADR 0010 (MapLibre-only) stays with its *(superseded by 0015)* marker. Superseding preserves why the current architecture exists; erasing loses it |
| `docs/quality/sessions/2026-09-06-prebeta-agentic-audit.md` + its evidence | The #78 exception. #78 was merged deliberately as archived evidence. **This is a specific exception and was not used to justify retaining any other QA run** — `artifacts/vqa/`, `artifacts/cinco/`, and `docs/astra/evidence/` all went |
| `tests/e2e/visual/*-snapshots/**` (70 snapshots) | Genuine Playwright reference snapshots. These are test *inputs*, compared on every `visual` CI job — the opposite of run output |
| `docs/quality/archive/UX_REMEDIATION_LEDGER_2026-08-26.md` | `AGENTS.md`: "Ledgers under `docs/quality/archive/` are evidence, not worklists" |
| `artifacts/routing-rework/reports/**` | Sanitized, deliberately versioned benchmark summaries with a README defining their schema, explicitly distinguished from the gitignored raw samples |
| `artifacts/offline-parity-evidence.json` | The only record of the offline parity measurement (187/208, 89.9%) backing ADR 0003's honest "limited coverage" state. Regenerating it needs a full GraphHopper + PBF setup |
| `bench/out/blind-round*` (4 files) | A blind scoring corpus — anonymized answers, de-anonymization key, and scores — not run output. It is the evidence behind the ADR 0018 bakeoff |
| `design/reference/v1/**` (4 boards + README) | Owner-supplied originals imported from another machine, checksummed, **not** generated. The README now states plainly that they are historical and that V2 is the current authority |
| `.claude/skills/impeccable/**` | The live user-invocable design skill for this repo |
| `docs/quality/PREBETA_QA_*`, `PHYSICAL_DEVICE_*`, `LUNA-*`, `HUMAN-QA-MISSIONS`, `FAILURE_POLICY`, `RELEASE_FREEZE`, `CI-ARCHITECTURE`, `SELF-HOSTED-CI`, `operations/NATIVE_DECISION` | Current gates, protocols, and open decisions — several are named directly by `AGENTS.md` |

---

## 4. By the numbers

| Measure | Before | After | Change |
|---|---:|---:|---|
| Tracked bytes | 81.2 MB | 27.5 MB | **−51.2 MB (−66%)** |
| Tracked files | 1,871 | 1,280 | −591 |
| Markdown documents | 395 | 128 | −267 |
| `docs/` bytes | 22.8 MB | 4.0 MB | −18.8 MB |
| `design/` bytes | 20.4 MB | 8.8 MB | −11.5 MB |
| `artifacts/` bytes | 16.1 MB | 5 KB | −16.1 MB |
| `.github/` bytes | 3.15 MB | 30 KB | −3.12 MB |
| Runtime dependencies | 22 | 19 | −3 |
| Dev dependencies | 17 | 16 | −1 |
| Reviewed install scripts | 3 | 2 | −1 |
| CI workflows | 9 | 7 | −2 |
| Playwright configs | 4 | 3 | −1 |
| Stylesheets in `src/app/styles/` | 41 | 39 | −2 |
| Dead components / modules | — | — | 2 (`LibraryDrawer.tsx`, `buildAtlasCollectionCopy`) |
| Test files removed as protecting nothing | — | — | 5 |

---

## 5. README

The README was 388 lines and carried real architectural drift: it named
"MapLibre GL JS + OpenFreeMap" as *the* renderer with no mention of Mapbox at
all, contradicting ADR 0015 and `AGENTS.md`. The drift traced back to the
`switchback-production-master-spec-2026-08-10.zip` decision table
("Map renderer | MapLibre", "Default basemap | OpenFreeMap-compatible"), which
predates ADRs 0014–0022 and is now removed.

It is now 160 lines and states the actual position: Mapbox GL JS v3 is the
decided primary renderer, enabled per deployment by
`NEXT_PUBLIC_SWITCHBACK_PREMIUM_MAPBOX` plus a browser token; MapLibre +
OpenFreeMap ships as the default and the migration rollback path, retiring at
roadmap phase 11 after rollout evidence. Structure is now: what Switchback is →
current capabilities → quick start → architecture summary → configuration
pointer → testing pointer → links to canonical deeper docs. The ~230 lines of
deployment procedure moved verbatim to `docs/DEPLOYMENT.md` rather than being
lost.

---

## 6. Remaining known cleanup debt

Deliberately **not** done here, because each is its own verified change rather
than janitorial work:

1. **108 dead CSS rules across live stylesheets.** After this pass
   `find-dead-css-rules.mjs` still reports dead rules concentrated in
   `planner-deck.css` (38), `planner-shell.css` (23), `planner-controls.css`
   (14), `waypoint-field.css` (12) and `route-atlas.css` (7). These live in
   stylesheets that *are* loaded, so deletion needs the batch-and-check-visually
   discipline that `global-class-coverage.test.ts` exists to enforce — the last
   time a stylesheet was deleted on a name-based hunch, five surfaces shipped
   unstyled. `waypoint-field.css` is the most suspicious: its root
   `.waypoint-stack` and `.profile-switch` rules are both dead.
2. **`PlannerShell.tsx` / `PlannerMapStage.tsx` decomposition.** Architectural
   debt, not dead code. Both are heavily modified by #82; decomposing them now
   would be a rebase catastrophe for the integration stack. Record it as a
   post-#82 task.
3. **`routePointsFromSketch`** (`lib/planner/route-sketch.ts`) — a
   backward-compatible adapter with one real production caller
   (`road-match-request.ts`). Collapsing it into `routeIntentFromSketch` is a
   behaviour change (the V2 entry point infers start/finish and loop intent
   instead of throwing), so it needs its own test, not a janitorial edit.
   Recorded in `docs/COMPATIBILITY.md`.
4. **`npm audit` is red on `main` for pre-existing reasons** — critical
   `maplibre-gl <= 6.4.0`, high `js-yaml`, high `sharp`, moderate
   `@vitest/mocker`. This pass did not cause it and does not fix it; the
   `deps/security-advisories-20260908` branch does. See the note below.
5. **`react-doctor` reports 42 advisory findings** (unchanged by this pass). It
   is explicitly advisory and not merge-blocking per `ROADMAP-WAVES.md`.

### Note on the in-flight dependency branch

The working tree carried uncommitted work on
`deps/security-advisories-20260908` (maplibre-gl 5.24.0 → 6.8.0, vitest
4.1.10 → 4.1.11). It was **not** folded into this cleanup — a maplibre major
bump deserves its own verification. It is preserved as `git stash@{0}` and as a
patch at
`/tmp/claude-0/-root-Vibe-switchback/5cd1a575-2aa0-4ccc-918e-7500361d765a/scratchpad/jan/deps-security-advisories-20260908.patch`.
Both branches touch `package.json` / `package-lock.json`, so whichever lands
second needs a `npm install` re-resolve rather than a textual merge.

---

## 7. Verification

Run at exact HEAD of this branch, on Node 24.15.0 (`PATH=/root/.n/bin:$PATH`).
Not a lint-and-typecheck claim — the browser gates were run.

| Gate | Result |
|---|---|
| `npm run lint` (`--max-warnings=0`) | **pass** |
| `npm run typecheck` | **pass** |
| `npm test` (vitest) | **pass — 338 files, 2,136 tests, 0 failed** |
| `npm run build` (production) | **pass — 537 route-atlas manifest routes, poster art for 157** |
| `npm run verify:install-scripts` | **pass — 2 install scripts, all reviewed** |
| Playwright `--project=visual` | **pass — 60/60**, no baseline updated |
| Playwright `--project=critical-chromium` | **pass — 36/36** |
| Playwright `--project=critical-webkit-smoke` | **pass — 2/2** |
| Playwright `--project=road-lock` | **pass — 1/1** |
| Playwright `advisor.spec.ts --project=desktop-chromium` | **pass — 8/8** |
| `npm run test:e2e:pwa` | **pass — 2/2** |
| `build-offline-v2.mjs` A/B vs the pre-migration implementation | **byte-identical output** except build timestamp |
| `npm audit --audit-level=moderate` | **fails — pre-existing on `main`, see §6.4** |

The 60/60 visual pass is the load-bearing evidence for the CSS work: two
stylesheets were deleted and three rules were relocated across files, and not
one of the 60 reference snapshots moved a pixel.

Not run at this HEAD: `--project=real-router` (needs a GraphHopper import),
`mobile-core` / `mobile-qa` (advisory; `mobile-core` is documented-red on `main`
per issue #42), and physical-device evidence — unchanged by this pass and still
open per `ASTRA-STATE.md`.
