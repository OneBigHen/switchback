# STATE — Switchback UX V2.1

Branch: `ux/v2-1-premium-mobile-polish`  
PR: #41 (draft)  
Base: `main@35cb60c4659c5e054c0e64b6ef24c567c4ceff17`

## Current status

- Handoff design: complete.
- Execution package: complete when this commit lands.
- Product implementation: **not started**.
- Current wave: **W1 — Plan**.
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
| W1 Plan | READY | — | focused Plan + `qa:pr` at milestone |
| W2 Destinations | BLOCKED ON W1 | — | focused destination tests/visuals |
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
