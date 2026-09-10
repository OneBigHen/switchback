# Hermes Dual-Train Switchback Handoff

## Purpose

Hermes is the orchestration owner for two parallel Switchback workstreams:

1. **Train A — beta release correctness**: finish PR #109 trust work, reconcile #111/#113, freeze/qualify a replacement beta candidate under issue #114.
2. **Train B — UX V3 adaptive workspace**: implement issue #115 on an isolated branch/worktree with tablet-first Compact/Medium/Wide composition.

Hermes may use Pi coding agents for bounded phases, but Hermes owns repository truth, worktree isolation, phase gates, verification, GitHub checkpoints, and merge discipline.

Detailed plans:

- `docs/superpowers/plans/2026-09-10-beta-release-correctness.md`
- `docs/superpowers/plans/2026-09-10-adaptive-workspace-v3.md`

## Launch mode

Use the durable multi-phase runner, not a single giant detached Pi prompt:

```bash
hermes-task submit --repo /root/Vibe/switchback --auto
```

Use the local `pi-coding-handoff` skill/scripts for individual bounded coding/review jobs where useful. Pi workers must operate in one assigned worktree/branch each; never allow two writers in the same worktree.

Do **not** unpause an older Switchback Hermes run merely because it exists. Resume it only if all three are true:

1. its resolved repository is exactly `/root/Vibe/switchback`;
2. its package includes current authorities #114 and #115 plus these two plan files;
3. its recorded GitHub state is reconciled to current GitHub before execution continues.

Otherwise leave the old run parked and start a fresh task.

## Historical handoff snapshot — verify, never assume

At plan creation time:

- GitHub `main`: `c649214e4729c76649b38300422d1c8a4758ba4c`
- PR #109 head: `2ffab9c54446b33facfa590f3c73b13da988a142`
- PR #109: open, draft, mergeable
- exact-head Quality: `34498039614` SUCCESS
- exact-head Mobile Core: `34498039575` SUCCESS
- PR #111 head: `fa7974a9c49c1ad17cebd4756ee8ea297bea70f4`, still based on older main
- PR #113 head: `cfc6afad7ea082cfef6d0bc585365fb86f50e5ea`, still based on older main

GitHub is authoritative if any value has moved.

## Phase 0 — mandatory repository reconciliation

Before code or branch manipulation:

```bash
cd /root/Vibe/switchback
git remote -v
git fetch origin --prune
git status --short
git rev-parse HEAD
git rev-parse origin/main
git worktree list
df -h .
gh auth status
gh issue view 104
gh issue view 114
gh issue view 115
gh pr view 109
gh pr view 111
gh pr view 113
```

Also inspect current GitHub Actions for the exact PR #109 head.

If local `main`, `origin/main`, and GitHub main disagree, resolve repository truth before proceeding. Do not reset or destroy uncommitted work; inspect worktrees/branches first.

Disk space is a hard precondition for Next/Playwright work. A prior run exhausted the host filesystem. If cleanup is required, delete only ignored/generated output such as `.next`, `test-results`, and `playwright-report`. Never delete source, committed evidence, prompts, or another worker's worktree.

Pi may leave `.pi/` and `.pi-lens-probe-home/`; keep them untracked/ignored and out of PRs.

## Worktree layout

Prefer explicit isolated worktrees, adapting paths to the repo's established convention:

- Train A: existing PR #109 branch/worktree `fix/goblin-action-routing-104`
- Train B: new `ux/adaptive-workspace-v3` from current qualified main
- Recovery after #109: existing/rebased `fix/beta-recovery-copy`
- Latency diagnostic after #109: existing/rebased `fix/beta-alternatives-latency`

Train B must **never** be based on PR #109. Train A must **never** absorb UX V3 changes.

## Execution DAG

```text
P0 repository reconciliation
 |
 +--> A1 stop-inclusion proof ---------+
 |    A2 real map-source proof         |
 |    A3 structured-prose grounding    |--> A4 exact-head qualify/review --> merge #109/#104 close
 |                                     |
 +--> B1 baseline evidence             |
      B2 workspace-mode authority      |
      B3 adaptive topology             |
      B4 state hierarchy               |
      B5 route comparison -------------+

After #109 merges:
  +--> A5 diagnose/reconcile #111
  +--> A6 decide/reconcile #113
  +--> B6 rebase UX branch and integrate Goblin composition using merged trust callbacks

Then:
  A7 freeze exact beta candidate --> deploy/black-box/Luna/physical gates
  B7/B8 full tablet qualification + visual polish --> draft PR remains isolated until #114 lifts hold
```

B1–B5 may proceed in parallel with A1–A4 because they start from qualified main and do not consume #109. B6 is a synchronization barrier: do not implement or duplicate Goblin action/trust semantics in UX V3 before #109 is merged and rebased into the UX branch.

## Pi worker contract

Every Pi coding worker receives only one bounded phase plus the relevant plan section. Its prompt must include:

- exact repo path `/root/Vibe/switchback`;
- exact assigned worktree and branch;
- GitHub authority issue/PR numbers;
- allowed files/scope;
- RED test required before production fix where applicable;
- exact verification commands expected;
- prohibition on merge;
- requirement to commit and push a durable checkpoint;
- requirement to report exact SHA, changed files, tests, failures, and remaining blocker.

Use `pi -p "@file.md" --mode json` through the tested handoff wrapper so monitoring receives streaming NDJSON. `agent_settled` means the worker finished; it does **not** mean the work is correct. Hermes verifies the branch independently after settlement.

## Train A acceptance authority

Train A follows issue #114 plus `2026-09-10-beta-release-correctness.md`.

The current remaining PR #109 semantic gates are:

1. compound route+stop success must prove the returned route actually traverses the grounded stop;
2. E2E must prove the real MapLibre `switchback-routes` source receives the new canonical geometry;
3. mutating action structured prose must be grounded in validated deterministic evidence or suppressed.

After any new #109 push, all previous exact-head CI is stale. Require fresh exact-head Quality and Mobile Core plus independent adversarial review before merge.

After #109 merges, reconcile #111 and #113 against new main; do not speculate around service-worker timeouts or alternatives latency.

No replacement candidate is READY until issue #114's full downstream qualification is actually recorded.

## Train B acceptance authority

Train B follows issue #115 plus `2026-09-10-adaptive-workspace-v3.md`.

Core topology:

- Compact `<=760`: map + contextual bottom sheet, preserving useful `peek/half/full` behavior.
- Medium `761..1180`: first-class tablet/constrained-desktop persistent map + planner/inspector compositions; ordinary planning must not depend on vertical detents.
- Wide `>=1181`: bounded/resizable planner workspace + live map and optional contextual inspector.

One canonical workspace-mode authority owns React topology; map insets must derive from the same layout truth. Do not solve tablet by stacking more CSS exceptions onto the binary phone/desktop architecture.

The primary journey should read as:

`Where? -> What kind of ride? -> Choose route -> Ride`

Advanced capabilities remain available through progressive disclosure rather than equal-weight primary surfaces.

## Verification discipline

For every phase:

1. record exact starting SHA;
2. reproduce RED where the phase fixes a defect;
3. make the smallest coherent change;
4. run focused tests;
5. run nearby regressions;
6. run typecheck/lint relevant to changed scope;
7. inspect `git diff` and `git status`;
8. commit with a narrow message;
9. push durable checkpoint;
10. Hermes independently verifies before advancing the phase.

Do not hide failing tests, loosen thresholds, blindly rebaseline visuals, add timing sleeps to paper over races, or declare environment failures as product passes.

## GitHub checkpoint format

At each meaningful phase boundary update the controlling GitHub issue/PR with:

```markdown
### Hermes checkpoint — <phase>
- Branch: `<branch>`
- Exact head: `<sha>`
- Base: `<sha>`
- RED evidence: <test/reproduction or N/A>
- GREEN/focused: <commands + counts>
- Regression gates: <results>
- CI: <workflow IDs/status if applicable>
- Review: <reviewer/result>
- Remaining blockers: <explicit list or none>
- Merge status: HOLD / READY-FOR-REVIEW (never merge without owner approval unless a later explicit instruction changes this)
```

Use #114 for release checkpoints and #115 for UX checkpoints. Keep PR #109 comments focused on #109 implementation/qualification rather than broad UX planning.

## Stop conditions

Stop the affected train and report HOLD when:

- repository SHA/base truth cannot be reconciled;
- a RED case cannot be reproduced deterministically enough to justify a product change;
- disk/environment failures make test results ambiguous;
- a supposed fix weakens deterministic evidence or creates a parallel state authority;
- #109 branch moved underneath a worker and exact-head evidence is stale;
- UX work requires a correctness semantic change that belongs to Train A;
- any worker proposes merging #110, #80, or #81 into the beta candidate;
- a physical-device/real-ride gate is required but was not actually run.

Do not stop the entire dual-train task because one independent lane is blocked. Continue safe work on the other lane when its dependencies are satisfied.

## Completion report

Hermes must finish with two independent summaries.

### Train A

- final main/candidate exact SHA;
- PR #109 merge SHA or remaining blockers;
- #104 state;
- #111 disposition;
- #113 disposition;
- exact automated workflow runs;
- deployed SHA/build if deployment occurs;
- black-box/Luna/physical iPhone/real-ride gate status;
- READY/HOLD with missing evidence named explicitly.

### Train B

- branch and exact SHA;
- workspace modes implemented;
- viewport/mission matrix results;
- before/after evidence locations;
- focused and regression test results;
- draft PR number/state;
- remaining UX findings;
- physical tablet gate status;
- confirmation that the UX PR was not merged into the beta candidate while #114 remained HOLD.
