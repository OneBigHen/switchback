# Owner workflow

Only three owner-facing states are used:

| State | Meaning | Next action |
|---|---|---|
| `AGENT WORKING` | Required work or checks are still running. | Wait for the agent summary. |
| `NEEDS YOUR DECISION` | A required gate failed or a product choice cannot be inferred safely. | Review the one named decision or failure. |
| `READY TO MERGE` | Required automated gates pass and physical-only checks are explicitly recorded. | Merge the pull request. |

The agent creates the branch, runs the checks, repairs failures, commits,
pushes, and opens or updates the pull request. The owner should not need to
rebase, inspect raw traces, or interpret CI internals.

The normal path is:

1. The agent starts from the requested baseline or a valid descendant.
2. The agent works on an agent-managed branch and keeps existing product work.
3. GitHub Actions runs code quality, critical browser, real-router, PWA, and
   live-smoke jobs.
4. The agent reads failure artifacts and adds a regression for every confirmed
   bug.
5. The pull request template and [release evidence](RELEASE_EVIDENCE.md) carry
   the plain-English handoff.

Physical device checks are never inferred from browser automation. A pending
iPhone drill is written as pending, with no invented result.
