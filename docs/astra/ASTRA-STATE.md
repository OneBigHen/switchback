# Astra durable checkpoint

Updated: 2026-09-05. Task: audit + product definition; user subsequently requested a document for a full refactor. **No application implementation, deployment, merge, or data migration was performed.**

## Exact source and branch

- Repository: `OneBigHen/switchback`, `/root/Vibe/switchback`.
- Initial observed HEAD: `12d3bc2ef20f1399df39064b3839412e9cac774d`, branch `tmp/merge-61`, with two existing AI file edits.
- Those edits were committed by concurrent activity; review was frozen at **`63de8ef583e93a6f323662cfe390febcb8480f60`** in detached `/tmp/switchback-astra-audit`.
- Last checked original branch: `tmp/merge-61`, tracking `origin/ux/map-native-route-sculpting`; HEAD also `63de8ef583e93a6f323662cfe390febcb8480f60`.
- Active implementation PR: [#61](https://github.com/OneBigHen/switchback/pull/61), `ux/map-native-route-sculpting`, exact head `63de8ef583e93a6f323662cfe390febcb8480f60` at final check.
- Separate docs PR: [#57](https://github.com/OneBigHen/switchback/pull/57), `docs/ai-advisor-design`, `be25711c971db179afd0c64a20f1806dc494568d` at check. Not merged or adopted wholesale.
- Production: `https://ride.henning.rodeo`; service working directory `/root/Vibe/switchback`, port 3100. Production build SHA **unattested**. A service PID changed during the audit due to activity outside this task. Source and runtime findings are deliberately separated.

## Deliverable entry point

Read [FULL-REFACTOR-SPEC.md](FULL-REFACTOR-SPEC.md), then its nine linked documents. The user-supplied [astra-handoff-report.md](astra-handoff-report.md) is preserved. It describes the consultation limit and available artifacts; it contains no independent architectural review.

New work is under `docs/astra/`. It was pushed on branch `docs/astra-full-refactor-spec` from an independent review pass on 2026-09-05; see [WAVE-RECONCILIATION](WAVE-RECONCILIATION.md) for the one substantive addition that review made. Do not assume it is merged on GitHub because a PR exists.

## What was actually tested

- Production browser: select Harrisburg start/Carlisle destination, route calculation, route choices, selected details/preparation, invoke local save/private-link/export, Rides/Discover, browser Back/Forward, refresh planning, destination-free Free Ride with simulated GPS, refresh Free Ride.
- Captured seven route viewports: 320×568, 390×844, 430×932, 768×1024, 1440×900, 2560×1080, 844×390; additional phone/desktop Free Ride/details/discovery captures.
- Production probe: no recorded step failures/page errors; real route responses contained one primary plus two alternatives; public community response was empty and project catalog contained 537 records. This is observation at capture time, not permanent catalog truth.
- Twelve live AI endpoint prompts: first two pre-route `context:null` requests returned 400; ten routed prompts returned `ok`, **zero proposed rides/stops**. Candidate UI reproduced generic outside-source error.
- Focused Vitest: **8 files / 65 tests passed** (planner store/controller, sketch inference/sculpting, advisor handoff/adversaries, GPX import, Free Ride API).
- Candidate Playwright: **34 tests, 28 passed, 6 failed, 0 skipped**, 15.4 minutes. All use Chromium with test service interception where the existing suite installs it. JSON: [candidate-playwright.json](evidence/candidate-playwright.json).
- Candidate environment used local Node **22.21.0**, existing Chrome **149.0.7827.22**, webpack dev server at port 3123. Repository requires Node >=24; these are diagnostic results, not release-environment certification. Turbopack failed on the cross-root node_modules symlink; webpack allowed an isolated run without changing production config.

### Six browser failures: first triage

1. Stale AI answer test timed out looking for `Select Fastest Now`; captured UI exposed `Select Fast way south`. **Accessible-name/test-contract drift** prevented the stale-answer assertion from completing. It does not prove a stale reply painted.
2. Plan/save/export/restore/ride journey timed out looking for `Select Maximum Twisties`; UI exposed `Select Twisty route`. **Same naming drift**; downstream save/export coverage in this test did not complete.
3. Gravel-loop journey could not find `Ride options` after reaching a route-choice view.
4. Free-form destination journey failed at the same helper expectation.
5. Sketch/editable-point journey failed at the same helper expectation. **These three require helper/state-transition reconciliation**; do not claim full sketch/waypoint behavior tested.
6. Corridor-options test rendered three options but expected `Select Traced`; the UI used `Select Hugs the line you drew.` **Naming drift**; the recorded snapshot supports corridor cards rendering, not the later acceptance assertions.

No tests were weakened or application fixes implemented. Failure contexts/screenshots/traces remain under `/tmp/switchback-astra-audit/astra-test-results`; the durable JSON records errors. Future wave 0 should make semantic contracts consistent and rerun in the prescribed environment.

## Strongest conclusions

1. Keep the deterministic routing/GIS/import/navigation primitives. Rebuild fragmented ownership and task interactions.
2. One canonical, durable ride intent must own points, mode, time, preferences, exclusions, kept roads, and sketch intent. Undo covers that whole intent.
3. Preserve the last usable result during a pending edit; revision-gate all async mutations and selection.
4. AI needs a narrow typed proposal protocol; current pre-route schema fails, Home is guessed in a live answer, and successful prose does not execute requested changes.
5. Free Ride must remain one continuous session through accepted suggestions, return-home, and refresh. Current refresh becomes paused recording; transition code resets constraints.
6. Current phone/landscape clipping and Free Ride contrast are real defects despite successful capture/test steps.
7. Unify discovery and derivative workflows before adding community features. Make offline readiness specific to the actual ride.

## Product decisions to treat as the refactor's authority

N01–N12 in [PRODUCT-NORTH-STAR](PRODUCT-NORTH-STAR.md) are the proposed product contract: one ride, Best ride default, rider-level preferences, natural drawing endpoints, editable constraints, revision-scoped AI Apply, deterministic route selection, continuous Free Ride, honest offline/unknown evidence, derivative sharing, retained brand, and Mapbox rollout verification.

This audit does not silently amend frozen ADRs. Wave 0 must reconcile model second-opinion/preview policy, community comments versus sharing-only scope, visual gates, and new document authority before implementing conflicting changes. No full refactor implementation has begun. **Independent review on 2026-09-05 additionally found this package must be reconciled against the open premium maps + routing wave (ADRs 0015–0022, opened 2026-08-29) before sequencing — see [WAVE-RECONCILIATION](WAVE-RECONCILIATION.md).**

## Unresolved questions / proof boundaries

- Real-device riding, physical GPS loss/background recovery, voice/wake, daylight/gloves, and airplane-mode navigation remain unverified.
- Exhaustive messy drawings, polygon editing, rapid mixed gestures, large/malformed import UI, authenticated publish/remix/sync, and Mapbox rollout parity remain open. See audit coverage ledger.
- Production source/build attestation and real provider graph/policy versions need a baseline record.
- Difficulty/surface evidence coverage must be established before promising easy or technical terrain.
- Multi-day, cinematic preview, social comments, and premium provider expansion should not block the core refactor; disposition/migration remains explicit.
- The independent Claude review was blocked by subscription usage and produced no findings. Do not cite it as approval or retry billing without authorization.
- Whether this package is the detail for the premium wave's remaining phases or a separate superseding wave is explicitly undecided; see [WAVE-RECONCILIATION](WAVE-RECONCILIATION.md).

## Implementation starting point

Start wave 0 with the actual AI client→handler null/absent context regression, unsupported Home/coverage claims, and the named browser-test drift. Then introduce RideIntent/commands/checkpoint under existing controls (wave 1). Do not begin with a new theme, new routing provider, massive PlannerShell rewrite, or a standalone AI app. Sequence both waves as phases of the open premium maps + routing wave, not as a competing roadmap.

Temporary audit worktree contains `astra-probe.mjs`, `astra-advisor-probe.mjs`, and `astra-playwright.config.ts`; their artifacts are in this directory. Its `node_modules`, `.env.local`, and `data` are symlinks into the original checkout. **Do not run mutating data/identity/community tests against those shared data paths.** The audit-owned development server was stopped and the two audit browser sessions were closed at handoff; the worktree/evidence were retained. Recheck runtime status before reuse. Preserve production and unrelated work.
