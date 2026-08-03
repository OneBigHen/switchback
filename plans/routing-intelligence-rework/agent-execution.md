# Agent Execution Guide: Routing Intelligence Rework

This is the entrypoint for an orchestrator or senior coding agent. Read [plan.md](plan.md), the active phase document, and that phase's implementation plan before assigning work.

## Non-developer summary

The work is deliberately split so agents cannot all rewrite the same routing code at once. First, the lead defines the shared language used by the UI and router. Then separate agents improve speed, GraphHopper data, and web research. Those pieces are combined into the new route-quality algorithm, followed by the loading experience and one final live release review.

## Branch and worktree rules

1. Commit this entire planning package first so it cannot be lost when worktrees branch from `origin/main`; record that exact planning commit hash.
2. Create one integration branch from the current `origin/main`, cherry-pick the planning commit, and preserve the user's working tree without reset or checkout-based cleanup.
3. Commit Phase 1 to the integration branch before spawning implementation workers.
4. Give every worker a separate branch and worktree created from the latest required integration commit.
5. Put the phase number in the branch name, for example `routing-rework/phase-2-primary`.
6. Workers may edit only the modules and test areas listed in their implementation plan.
7. Workers must not reformat unrelated files, update dependencies, alter design assets, restart services, or deploy.
8. Every worker must return a commit hash, changed-file list, focused verification output, and remaining risks.
9. The lead independently reads the diff and reruns verification before merging.
10. Preserve the pre-existing `next-env.d.ts` change unless its owner explicitly resolves it.

## Agent allocation

| Phase | Recommended owner | Can delegate | Must retain |
|---|---|---|---|
| 1 | Lead Codex/senior architect | Fixture inventory to an explorer | Contracts, decisions, integration baseline |
| 2 | Senior backend/routing agent | Timeout/cache tests to GLM 5.2 | Orchestration, cancellation, concurrency |
| 3 | GraphHopper/infrastructure specialist | Config fixture tests to GLM 5.2 | Graph import, cache swap, live runtime |
| 4 | Senior routing-algorithm agent | Pure scoring fixtures to GLM 5.2 | Corridor architecture and final weights |
| 5 | GLM 5.2 bounded package | Adapter and schema tests | Senior review of safety boundaries |
| 6 | Frontend/planner agent | Component test matrix to GLM 5.2 | State flow and integrated UX behavior |
| 7 | Lead Codex/release owner | Read-only review agents | Diff decisions, deployment, live proof, merge |

GLM work must use an isolated copy/worktree, an exact file allowlist, and exact verification commands. A verbal success report is not evidence; inspect the produced diff and rerun its tests.

## Dependency waves

```text
Phase 1: Shared contracts and baseline
   ├── Phase 2: Fast primary pipeline ─────┐
   ├── Phase 3: GraphHopper correctness ──┼── Phase 4: Corridor/scoring engine ──┐
   └── Phase 5: You.com adviser ──────────┘                                    ├── Phase 7
                         Phase 2 API ───────── Phase 6: Planner UX ─────────────┘
```

- Wave A: Phase 1 only.
- Wave B: Phases 2, 3, and 5 in parallel.
- Wave C: Phase 4 after 2+3; Phase 6 may begin after 2 but must rebase after 4.
- Wave D: Phase 7 after 2–6 are integrated.

## Worker prompt contract

Every spawned implementation agent receives:

```text
You own Phase N only.

Read:
- plans/routing-intelligence-rework/plan.md
- plans/routing-intelligence-rework/phases/phase-N.md
- plans/routing-intelligence-rework/implementation/phase-N-impl.md

Follow the implementation plan exactly. Do not expand scope or edit forbidden modules.
You are not alone in the repository; preserve unrelated edits and adapt to merged contracts.
Run the phase verify command. Commit only your owned changes.
Return: commit hash, changed files, test output summary, assumptions, and unresolved risks.
Do not deploy, restart services, rebuild the production graph, or merge branches unless Phase N explicitly authorizes it.
```

## Integration checklist for every phase

- Read the phase diff, not only its summary.
- Confirm changed files match ownership.
- Check `git diff --check`.
- Run the phase's primary verify command.
- Run affected existing tests without weakening assertions.
- Rebase onto the current integration branch.
- Resolve contracts in favor of Phase 1 and later lead-approved changes.
- Commit the merge separately so it can be reverted cleanly.
- Update [todo.md](todo.md) and the phase status.

## Stop conditions

Stop and return to the lead when:

- A required contract is missing or conflicts with Phase 1.
- A worker needs to edit another phase's owned modules.
- Graph import exceeds available disk/RAM or cannot preserve a rollback cache.
- A test can pass only by weakening existing safety or route-quality assertions.
- You.com output would need to be trusted without source, geocoding, and GraphHopper validation.
- The golden route can meet its time target only through unsafe, illegal, or obviously irrelevant detours.

## Final authority

Only the Phase 7 lead may merge the combined implementation to the release branch, swap the active graph cache, restart live services, or claim that the public route planner is fixed.
