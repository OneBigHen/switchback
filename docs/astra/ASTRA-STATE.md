# Astra implementation checkpoint

Updated 2026-09-05. **Implementation active; no wave complete. DO NOT SHIP.**

## Repository and authority

- Repo `/root/Vibe/switchback`, branch `implement/astra-wave-0`.
- Checkpoint base: `f10d196228599ac6626bcc07ba7ce22540011228` (reviewed Astra package). Application baseline: `63de8ef583e93a6f323662cfe390febcb8480f60`.
- Wave 0 hardening closeout committed at `4cca98a980d784dc50dfe05f9dfc9edb83abd63a`, on top of `3fc9eb8` (the hardening/cleanup plan) and the earlier Wave 0 fix commits (`bc32c39` failed-turn rollback, `09c0eff` advisor browser CI gate, `2d48a5e` unknown-surface contract, `77c49c9`, `f7618e3`, `35cd7b8`, `1bf20de`, `8dce217`).
- The owner's implementation instruction adopts Astra as product direction. `ROADMAP-WAVES.md` sequences it inside the existing premium wave; no second roadmap. Existing Advisor/workspace/comparison/sculpting integration is preserved.
- No production restart, deployment, identity/library migration, or provider change. Local production build attested below; deployed SHA remains unattested.

## Committed Wave 0 hardening (HEAD `4cca98a`)

- **Single advisor request-contract authority.** `MAX_ADVISOR_CONVERSATION_TURNS = 12` lives beside `MAX_ADVISOR_BODY_BYTES` in `src/lib/advice/request-limits.ts`. The server payload schema and the client transcript trim both consume it; the client-only `MAX_POSTED_CONVERSATION` constant is removed. Byte-bounded trimming and newest-message preservation are unchanged; tests import the shared constant.
- **Explicit Home is a resolved return-target, never inferred.** `isExplicitHomeDestinationRequest` is exported from `src/lib/ai/ride-intent.ts`. The advisor handler short-circuits an explicit "take me home" turn with guidance to set/save Home in the planner rather than letting the model infer a location it was never given; loop-qualified and generic wording ("three-hour loop back home", "Free Ride home") still reach the adviser. `usePlannerRideIntent` stops routing saved Home to itself when no current start is available and asks the rider to pick a start point.
- **Automatic Best-ride selection stays visible.** `PlannerShell` no longer nulls a valid automatic selection when more than one candidate exists; the default candidate renders selected and the flow advances. SB-005 protection of an explicit user pick is unchanged in the store (`applyAutomaticRouteSelection` still never replaces `selectionSource === "user"`).
- **Surface survey evidence is separated from access truth.** One provenance label (`PA_UNPAVED_ROADS_PROVENANCE`) and one boundary sentence (`PA_UNPAVED_ROADS_SURFACE_BOUNDARY`) in `src/lib/roads/types.ts`, consumed by the advisor briefing, the advisor toolbox, `RouteEvidencePanel`, `RouteComparison`, and the map layer catalog. Zero survey overlap reads as an informational zero, not "checked"; an unavailable survey is never converted into a confirmed zero; routing/OSM surface evidence is never erased by a survey result. `describeRouteGrounded` reports the gap as "survey surface overlap" rather than "official surface legality".
- AGENTS/roadmap/reconciliation documents record one implementation authority and the required Astra visual gates.

## Fresh evidence (exact HEAD `4cca98a`, Node 24.15.0)

- Node 24.15.0 is `/root/.n/bin/node`. **Non-login shells default to Node 22**; set `PATH=/root/.n/bin:$PATH` for all commands. Do not rebuild shared native dependencies for Node 22.
- Red/green during development: handler null-context reproducer failed twice before fix; invalid-request status failed before fix; four surface/search uncertainty tests failed before fix; the automatic-selection contract and the explicit-Home start reproducer failed before their fixes.
- `npm run lint` (`eslint . --max-warnings=0`): **passed**.
- `npm run typecheck` (`tsc --noEmit`): **passed**.
- Full Vitest (`npm test -- --reporter=dot`): **316 files / 2,015 tests passed, 0 failed, 0 skipped** (397.7s).
- Production build (`rm -rf .next && npm run build`, Next.js 16.3.3): **passed**; prebuild route atlas verified **537 manifest routes (157 distinct shapes)**. No production deployment performed.
- Playwright `tests/e2e/advisor.spec.ts --project=desktop-chromium` (Gravel Goblin browser contract): **8 passed / 0 failed / 0 skipped**.
- Playwright `--project=road-lock` (road-lock regression): **1 passed / 0 failed / 0 skipped**.
- The Playwright run required clearing an orphaned prior-session `next dev` on port 3100 before its own web server could start; no repository file was changed by that cleanup, and the only post-run tree churn was Next.js regenerating `next-env.d.ts`, which was reverted.
- Not run at this HEAD (unchanged risk, tracked as open gates): visual regression matrix, real-router browser checks, PWA smoke, critical rider journeys, WebKit compatibility smoke. The phone advisor error sheet still cannot show error + context + retry together without scrolling — **visual gate not passed**.

## Verification runtime

- Verification runs against the committed branch HEAD in `/root/Vibe/switchback` on Node 24. The earlier `/tmp/switchback-astra-candidate` copied-diff scratch runtime (dev port 3124) is retired; its screenshots under `docs/astra/evidence/wave0/advisor-error-*.png` remain valid historical evidence of the phone layout gap, not current acceptance.

## Next exact tasks

1. Wave 0 hardening is committed (`4cca98a`) and verified at exact HEAD (above). No further advisor-truth / selection / request-contract code work is open.
2. Close the remaining Wave 0 **release** gates (evidence, not code): tiny-phone / short-landscape baselines and the phone advisor error-sheet layout; production source/build/provider baseline without secrets; real iPhone / PWA / GPS / background / airplane-mode evidence.
3. Reconcile any remaining audited E2E semantic-label / helper-transition drift, and settle ADR 0023 model-preference/preview and sharing-scope policy.
4. Only then implement Wave 1 canonical intent/commands/revisions/checkpoint under existing controls; remove migrated competing setters. Follow backlog dependency order through release qualification.

## Release boundaries

All original critical findings outside the slice remain open: draft/session loss on reload, Free Ride recording/constraint continuity, intent-wide undo, editable polygons/sketches, full typed AI proposals, responsive composition, honest route-specific offline recovery. Audit artifacts remain valid historical evidence, not current acceptance. Real iPhone/PWA/GPS/background/airplane mode and rider corpus/usability review require actual device/people evidence. Never mark these passed from simulation.

## Delegated ownership

The Luna slices (shared advisor request budget, Home classification export, automatic-selection visibility, E2E/helper reconciliation) are integrated and committed in `4cca98a`. No delegated ownership is active; root owns the branch, commits, docs, and integration.
