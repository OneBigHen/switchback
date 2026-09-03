# STATE — Switchback UX V2.1

> **Historical release-prep snapshot.** PR #41 merged on 2026-09-02. The branch/draft/merge instructions below describe the pre-merge release candidate and MUST NOT be used as current execution instructions. For current follow-up work, use [`FUTURE.md`](./FUTURE.md) and verify against current `main` before changing code.

Branch: `ux/v2-1-premium-mobile-polish`  
PR: #41 (**MERGED 2026-09-02**)  
Base at the time of this snapshot: `main@35cb60c4659c5e054c0e64b6ef24c567c4ceff17`

## Current status at the time of release preparation

- Handoff design: complete.
- Product implementation: **W1–W4 complete.**
- Human design direction: **approved**.
- Historical current wave: **none — do not restart W1–W4.**
- Historical release preparation: **final exact-head CI + review.**
- Final outcome: **PR #41 merged.** Do not interpret the old draft/merge language below as a current restriction.

## Historical exact next action

The following was the release-prep instruction before PR #41 merged. It is retained only as evidence of the release process:

1. Do **not** execute the implementation waves again.
2. Verify every protected required context is green on the **current PR head**.
3. Complete the final adversarial/code review and resolve any P0/P1 finding.
4. Review the accepted visual evidence and remaining P2/P3 polish items.
5. Keep PR #41 draft. Mark-ready/merge is a separate human/release decision.

Any commit after release proof creates a new candidate SHA and requires exact-head verification again.

## Wave ledger

| Wave | Status | Implementation evidence |
|---|---|---|
| W1 Plan | DONE | compact map-first planner; loading/Cancel visibility; Prepare hierarchy; mobile/dark fixes; focused unit/component/E2E/visual proof recorded in branch history |
| W2 Destinations | DONE | Rides/Discover/Settings density and dark-surface pass; honest empty/search states; source-ID behavior preserved; focused component/E2E/visual proof recorded |
| W3 Ride | DONE | Record CTA hierarchy; stronger off-route recovery; Ride/Free Ride safety semantics preserved; Chromium/WebKit proof recorded |
| W4 Hardening | DONE | responsive/dark/a11y/content-stress/performance review; reviewed visual baselines; no new runtime dependencies or state/store/routing authorities |

Historical detailed wave reports and screenshots remain in the commits and `artifacts/cinco/`. They are implementation evidence, not permission to reuse an old SHA as final release proof.

## Release-prep audit — 2026-09-02

- `main` remained at the audited base `35cb60c4659c5e054c0e64b6ef24c567c4ceff17`; the PR was not behind main during release preparation.
- The previously pushed PR head `c337b417738c4bf6a45103ed2c987a770abeb093` was mergeable and green across the protected required contexts before additional audit work.
- Audit found one concrete dark-theme defect in Rides: the route-kind badge used fixed `--sb-ink` text over a dark theme surface.
- Test-first regression commit `0b50fde1af74bdb3a0077aa65cd0995d791cfc0f` intentionally failed the unit gate before the product fix.
- Fix commit `e7bce4d1410980319b06cae9abd947ea577201b1` changed the badge to theme-aware `--sb-text`; the full unit suite then passed, with Chromium critical journeys, WebKit smoke, road-lock, real-router and PWA checks also green in the resulting Quality run.
- PR title/body were rewritten to describe the implemented V2.1 scope and exact-head release contract rather than the original handoff-only state.
- GitGuardian remained clean through the release-prep code commits.
- CodeRabbit full review must target the final stable candidate head; any review aborted because the head moved is not final review evidence.

## Protected required contexts

The release candidate was not ready unless these were successful on the exact current head:

- `typecheck`
- `lint`
- `vitest`
- `build`
- `critical-e2e`
- `pwa`
- `road-lock`
- `real-router`
- `visual`

Also require the repository's aggregate/compatibility jobs and security checks to be clean where they run.

## Architecture/product constraints preserved

- Do not change route algorithms or provider policy in this branch.
- Do not add route taxonomy that the current data model cannot truthfully support.
- Do not convert Record into a fifth persistent destination.
- Do not convert Free Ride into a planner mode.
- Do not create a second ride library/store to simplify visuals.
- Do not make Mapbox premium rollout decisions as part of presentation polish.
- Preserve one persistent map, existing planner/view-model commands, Rides normalization/source IDs, recording/storage/sync/community semantics, and current navigation authority.

## Deferred non-blocking polish at the time of PR #41

These were P2/P3 at the release-prep snapshot. Some have since been implemented or superseded; check [`FUTURE.md`](./FUTURE.md) and current code before acting:

- attribution/legal text links below the 44px control target (P3 exception candidate);
- ~~Ride short-landscape topbar crowding at 844×390 (P2)~~ — fixed, PR #47;
- Record idle dead space on tall viewports (P3);
- Rides filter chip row lacks an end-fade/scroll affordance (P3);
- muted Loop/Draw labels merit a contrast polish pass (P3) — the trip-shape rail no longer clips (PR #52) but the labels are still 11px;
- Atlas true-empty state lacks a direct publish CTA and needs an authenticated product decision (P2);
- local Node 22 cannot execute the Node-24 `node:sqlite` suites; CI Node 24 is authoritative.

## Historical release rule

All W1–W4 wave proof before the release candidate head was historical evidence only. Final release proof had to correspond to the exact current PR head after STATE cleanup and any later review fix. That release process completed with PR #41's merge; future work establishes its own exact-head proof.
