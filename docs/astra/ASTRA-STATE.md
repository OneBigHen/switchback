# Astra implementation checkpoint

Updated 2026-09-05. **Implementation active; no wave complete. DO NOT SHIP.**

## Repository and authority

- Repo `/root/Vibe/switchback`, branch `implement/astra-wave-0`.
- Checkpoint base: `f10d196228599ac6626bcc07ba7ce22540011228` (reviewed Astra package). Application baseline: `63de8ef583e93a6f323662cfe390febcb8480f60`.
- Claude's new `WAVE-RECONCILIATION.md` was found in `/tmp/switchback-astra-audit`, read, and incorporated by fast-forwarding this implementation branch to the published docs commit. Original untracked docs preserved at `/tmp/switchback-astra-original-20260905-0939`.
- The owner's full implementation instruction adopts Astra as product direction. `ROADMAP-WAVES.md` now sequences it inside the existing premium wave; no second roadmap. Existing Advisor/workspace/comparison/sculpting integration is preserved.
- No production restart, deployment, identity/library migration, or provider change. The local production build is attested below; deployed SHA remains unattested.

## Current uncommitted Wave 0 slice

- Actual advisor handler accepts the browser's `context: null` before routing, as well as omitted context; malformed objects remain rejected.
- Client distinguishes 400/413 invalid requests from operational unavailability. UI explains invalid/malformed replies and retains failed rider text without overwriting newly typed input.
- Advisor briefing describes missing/all-unknown surface evidence as unknown and marks partial coverage. Empty POI search reports its bounded radius and incomplete coverage instead of claiming no stops exist. Place matches no longer imply verified routing access.
- Goblin road-search evidence is now marked separately from intentional shaping points; loop handoff drops only those evidence midpoints so the existing adaptive timebox route remains in control. Builder-only tool turns are capped at two while existing-route turns keep their broader budget.
- AGENTS/roadmap/reconciliation documents record one implementation authority and the required Astra visual gates.

## Fresh evidence

- Node 24.15.0 is `/root/.n/bin/node`. **Non-login shells default to Node 22**; explicitly set `PATH=/root/.n/bin:$PATH` for all commands. Do not rebuild shared native dependencies for Node 22.
- Red/green: handler null-context reproducer failed twice before fix. Invalid-request status failed before fix. Four surface/search uncertainty tests failed before fix.
- Focused Vitest: **6 files / 111 tests passed** for the affected advisor, handoff, routing, and request-budget seams, including road-evidence resolution, planner handoff, and the two-round builder cap.
- Current Node24 gates: `npm run lint`, `npm run typecheck`, and the full Vitest run **314 files / 1,989 tests passed**.
- Current production build passed with Next.js 16.3.3 after verifying **537** route-atlas manifest routes; no production deployment was performed.
- Targeted Playwright: **3/3 desktop Chromium passed**: invalid-request text/recovery, no turn on opening, keyboard operation. UI transport fixture separate from actual handler contract tests.
- Manual browser: actual local handler rejected injected oversized body; UI retained original rider text. Desktop/tablet error screens inspected. Phone requires scrolling and cannot show error/context/retry together in its default sheet: **visual gate not passed**.
- Screenshots: `evidence/wave0/advisor-error-{phone,tablet,desktop}.png` and `advisor-error-phone-scrolled.png`. Intentional regional default, no real GPS/provider result claimed.
- Earlier intermediate Node24 run was not green while the uncertainty edits were still in flight; it is superseded by the current full green rerun above. Earlier accidental Node22 run stopped, not product evidence.
- Independent standards/spec reviews finished; findings tracked in `evidence/wave0/review.md`. Duplicate retry transcript and byte-bounded history are being corrected. No release E2E, live provider task-success, or physical gate passed.

## Isolated runtime

- `/tmp/switchback-astra-candidate`, detached at docs base with candidate source patches, own data/build paths; only `node_modules` symlinked. No production data/env symlinks.
- Node24 webpack dev port **3124**, exec session `87659`. Advisor enabled with an invalid fixture key solely for capability/error testing; do not send ordinary requests to a real provider with this setup.
- Browser session `astra-wave0`; local browser has a temporary fetch wrapper making POST advisor text oversized to exercise real validation. Reload before other tests.
- Targeted Playwright config `/tmp/switchback-astra-candidate/astra-playwright.config.ts`; JSON `/tmp/astra-wave0-playwright.json`, outputs `/tmp/astra-wave0-test-results`. Uses installed Chrome 149.
- Candidate is a copied diff; sync affected files before retesting new implementation changes.

## Next exact tasks

1. Finish this checkpoint: resolve retry/history review findings; recheck integrated Luna changes; record current lint/typecheck/tests and commit coherent partial Wave0.
2. Close Wave0 Home ambiguity through explicit semantic return-target resolution; never infer Home from route destination. Complete failed/partial search and null/malformed surface boundary coverage.
3. Reconcile six audited E2E failures (semantic labels/helper transitions), default Best ride selection, tiny-phone/landscape baselines, ADR0023 model preference/preview and sharing scope policy. Record runtime/provider baseline without secrets.
4. Only then implement Wave1 canonical intent/commands/revisions/checkpoint under existing controls; remove migrated competing setters. Follow backlog dependency order through release qualification.

## Release boundaries

All original critical findings outside the slice remain open: draft/session loss on reload, Free Ride recording/constraint continuity, intent-wide undo, editable polygons/sketches, full typed AI proposals, responsive composition, honest route-specific offline recovery. Audit artifacts remain valid historical evidence, not current acceptance. Real iPhone/PWA/GPS/background/airplane mode and rider corpus/usability review require actual device/people evidence. Never mark these passed from simulation.

## Active Luna ownership (owner requested lower-cost delegation)

- `luna_e2e_reconciliation`: audited E2E/helper semantic drift plus retry payload assertion; preserves root error-recovery test.
- `luna_home_resolution`: shared `ai/ride-intent.ts` Home classification and parser tests only. Existing saved Home is `planner-location.ts`/`usePlannerHome`; Advisor currently receives none. Root owns Advisor integration.
- `luna_selection_owner`: shell automatic selected-route visibility and component/store regressions; no E2E ownership. Root cause confirmed: shell deliberately nulled valid automatic choice when >1 candidates.
- `luna_advisor_request_budget`: client UTF-8 payload budget/shared request limit/new tests; root integrates shared limit into handler.
- All agents must preserve shared edits and use explicit Node24; root owns commits, docs, runtime and integration.
