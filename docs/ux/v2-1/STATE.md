# STATE — Switchback UX V2.1

Branch: `ux/v2-1-premium-mobile-polish`  
PR: #41 (draft)  
Base: `main@35cb60c4659c5e054c0e64b6ef24c567c4ceff17`

## Current status

- Handoff design: complete.
- Execution package: complete when this commit lands.
- Product implementation: **W1 + W2 complete; W3 next**.
- Current wave: **W3 — Ride**.
- Human design approval: **approved**.
- Merge permission: **not granted**; PR must remain draft through implementation and exact-head proof.

## Exact next action

Read `START-HERE.md`, then execute `waves/W1-PLAN.md` from the current branch head.

Before editing product code:

```bash
git fetch origin
git status --short
git rev-parse HEAD
git rev-parse origin/main
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

If required baseline commands fail before W1 changes, record the failure here and stop mixing it with UX work.

## Wave ledger

| Wave | Status | Commits | Gate |
|---|---|---|---|
| W1 Plan | DONE | ea610ea aa57f2f 43a2ad8 af880c9 a2e8139 ea01cbd | lint/typecheck/build ✓ · vitest 1706/0 ✓ · critical e2e 21/21 ✓ · visual 54/54 ✓ (see report) |
| W2 Destinations | DONE | 5eaad11 ee50e27 648a6c4 | components 310/304-pass (6 were dev-server contention, pass isolated) · visual 54/54 after baseline approval · critical 21/21 · build ✓ |
| W3 Ride | BLOCKED ON W2 | — | Ride/Free Ride Chromium + WebKit + `qa:pr` |
| W4 Hardening | BLOCKED ON W3 | — | exact responsive/dark/a11y/perf/full release gates |

## Known product constraints

- Do not change route algorithms or provider policy in this branch.
- Do not add route taxonomy that the current data model cannot truthfully support.
- Do not convert Record into a fifth persistent destination.
- Do not convert Free Ride into a planner mode.
- Do not create a second ride library/store to simplify visuals.
- Do not make Mapbox premium rollout decisions as part of presentation polish.

## Update format for agent

When completing a wave, replace its status and append:

```text
WAVE: Wn
HEAD: <sha>
COMMITS: <list>
TESTS: <commands + pass/fail>
VISUALS: <states/viewports inspected>
SNAPSHOTS: <intentional changed baseline files>
LIMITATIONS: <none or concise list>
NEXT: <exact next action>
```

Do not turn this file into a diary. Keep only current actionable state and compact evidence.

WAVE: W1
HEAD: ea01cbd53514be79d171564e911ca281207499d4
COMMITS: ea610ea (idle-sheet collapse + leading status w/ Cancel + contract literals), aa57f2f (dock token chrome + V2 dark rebind + phone prepare Start row), 43a2ad8 (9 approved mobile baselines), af880c9 (phase-0 evidence refresh), a2e8139 (dark fills for paper-filled plan controls), ea01cbd (dark idle evidence)
TESTS: lint ✓ · typecheck ✓ · build ✓ · vitest 1706 passed / 0 failed (13 suites blocked by pre-existing Node22-vs-CI24 node:sqlite bundling; fails at base 35cb60c too) · test:e2e:critical 21/21 ✓ after WebKit system deps · playwright visual 54/54 ✓ (2 unrelated cold-server flakes passed isolated: Record tablet-landscape, free-ride-idle desktop) · qa:pr script exits 1 only at the Node-22 suite-load blocks; all gate components above verified individually.
VISUALS: mobile idle (pre/post fix), loading, alternatives, prepare (pre/post dock fix), detail, edit, provider-failure, dark idle (pre/post omnibox fix); suite viewports 320x700, 390x844, 430x932, 844x390, 768x1024, 1024x768, 1440x900, 1920x1080; every updated baseline's pixel diff inspected before approval.
SNAPSHOTS: screens: plan-empty-320x700/390x844/430x932, plan-result-mobile; ux-states: home/alternatives/route-selected/route-detail/map-provider-failure --mobile (all mobile Plan-family, all diff-inspected).
LIMITATIONS: quick layers panel + advanced map studio (map-layer-control.css) and planner-deck.css idle chrome keep hard-coded light styles in dark — deferred to W4 dark hardening; muted 10px Loop/Draw labels are contrast-risky — W4 a11y; omnibox placeholder truncates without ellipsis at 390; Node-22 env cannot run the 13 node:sqlite suites (CI authoritative); qa:pr cannot complete as one local script for the same reason.
NEXT: Begin W2 — Destinations per waves/W2-DESTINATIONS.md from HEAD ea01cbd.

WAVE: W2
HEAD: 648a6c44553893164b4ee35163d01ae5de236605
COMMITS: 5eaad11 (destination dark surfaces via paper->surface fills + canvas dark rebind; Rides true-empty/no-match split; phone hero trim; search placeholder fix), ee50e27 (W2 evidence captures), 648a6c4 (approved rides-mobile + profile-mobile baselines)
TESTS: lint ✓ · typecheck ✓ · build ✓ · CI vitest 1706 passed / 0 failed (13 env-blocked suites unchanged) · tests/components 310 passed after clearing dev-server contention (two earlier failures were my duplicate 'Import ride' accessible name, fixed by distinct empty-state CTA 'Import your first ride') · playwright visual 54/54 (2 intended baselines regenerated after diff inspection) · test:e2e:critical 21/21 ✓ · mobile-qa empty-rides pins updated to new true-empty copy.
VISUALS: Rides/Discover/Settings at 390x844 in light AND dark (pinned clock; shell auto-dark confirmed as the earlier capture condition); Settings scrolled to 'Account, sync & data' entry; public Atlas /routes mobile. All diff-inspected.
SNAPSHOTS: rides-mobile, profile-mobile (both intended: hero compaction + dark surface correction).
LIMITATIONS: Atlas true-empty suggests 'Publish one from a saved route' without a CTA (needs authenticated planner context — W4/product decision); Rides filter chip row scrolls horizontally but lacks end-fade/scroll affordance (W4); Settings bike-card surface-policy truncates with ellipsis at 390 (acceptable, noted); 'Rider name' input placeholder contrast is adequate but not strong (W4 a11y sweep); Node-22 env still cannot run the 13 node:sqlite suites (CI authoritative).
NEXT: Begin W3 — Ride per waves/W3-RIDE.md from HEAD 648a6c4.
