---
type: planning
entity: implementation-plan
plan: "routing-intelligence-rework"
phase: 7
status: draft
created: "2026-07-22"
updated: "2026-07-22"
---

# Implementation Plan: Phase 7 - Integrated Evaluation, Deployment, and Review

> Implements [Phase 7](../phases/phase-7.md) of [routing-intelligence-rework](../plan.md)

## Approach

Treat release as an independent evidence phase. Review every worker diff and shared interface, run the full suite, benchmark the candidate build/graph on the actual host, then perform controlled graph/application swaps with explicit rollback. Verify the public golden flow in real browser sizes before merging/releasing.

## Affected Modules

| Module | Change Type | Description |
|--------|-------------|-------------|
| `scripts/validate-live.mjs` | modify | Golden route, progressive behavior, and latency checks |
| `scripts/benchmark-routing.mjs` | modify | Final p50/p95 and phase metrics |
| `artifacts/routing-rework/reports/` | create/modify | Tracked sanitized verification evidence; raw samples remain ignored |
| `plans/routing-intelligence-rework/` | modify | Status, handover, changelog, and final evidence links |
| Runtime services/data | controlled operation | Candidate graph and app deployment with rollback |

## Required Context

| File | Why |
|------|-----|
| `plans/routing-intelligence-rework/agent-execution.md` | Integration and authority rules |
| All phase and implementation documents | Verify delivered work against gated scope |
| Worker commits and handovers | Diff ownership and claimed evidence |
| `scripts/validate-live.mjs` | Existing live release validation |
| `docs/CLOSURE-REALITY-2026-07-21.md` | Records prior `compare:true` timeout and release reality |
| `infra/systemd/` | Intended service definitions and runtime boundaries |

## Implementation Steps

### Step 1: Review and integrate worker commits

- **What**: Inspect every diff, file ownership, test change, and contract; reject empty/out-of-scope/weakening packages; rebase and merge in the documented order.
- **Where**: Integration branch and plan status files.
- **Why**: Worker reports are not proof and parallel branches may drift.
- **Considerations**: Preserve unrelated user changes; use separate merge commits for recoverability.

### Step 2: Run static and automated release checks

- **What**: Run diff checks, lint, typecheck, full unit suite, build, and full Playwright matrix.
- **Where**: Release candidate worktree.
- **Why**: Prove cross-phase compatibility.
- **Considerations**: No test deletion, `.skip`, timeout inflation, or assertion weakening to obtain green status.

### Step 3: Validate and stage graph rollback

- **What**: Compare active and candidate caches, validate checksums/startup/profiles/golden routes, record paths, and stage an atomic service-path swap with old cache retained.
- **Where**: Host GraphHopper data and service configuration.
- **Why**: Encoded-value changes require a new cache and can break runtime startup.
- **Considerations**: Stop if disk/RAM or rollback certainty is insufficient.

### Step 4: Benchmark the real host

- **What**: Run enough cold/warm direct, timeboxed, loop, cancel, cache, and concurrent requests to report p50/p95 per stage; write raw samples to ignored `artifacts/routing-rework/raw/` and sanitized summaries to tracked `artifacts/routing-rework/reports/`.
- **Where**: Local app/router with generated JSON artifact.
- **Why**: Performance is a release requirement, not an anecdote.
- **Considerations**: Separate geocoding/provider variance; ensure cache is not hiding cold metrics.

### Step 5: Deploy and verify public behavior

- **What**: Build, swap candidate graph, restart only required Switchback services, verify local/public health, then use a real browser for the exact golden prompt and control flows.
- **Where**: `switchback-graphhopper` and `switchback-cloudflare` runtime plus `ride.henning.rodeo`.
- **Why**: The actual user surface is the acceptance boundary.
- **Considerations**: Confirm live service uses the new build; stale deployments previously masqueraded as parser regressions.

### Step 6: Prove rollback and prepare user review

- **What**: Demonstrate documented rollback commands/paths without destroying old artifacts, collect screenshots/results, update plan status, and present combined diff/evidence to the user before final merge/release approval.
- **Where**: Plan handover and artifact folder.
- **Why**: User requested review of all diffs before merge.
- **Considerations**: Do not retire the prior graph/application build until approval.

## Testing Plan

| Test Type | What to Test | Expected Outcome |
|-----------|-------------|-----------------|
| Static/full | Entire repository | Diff, lint, typecheck, unit, and build green |
| E2E | Full device-size matrix | Planner, progress, alternatives, cancellation, and existing flows green |
| Golden live | Hatboro→Stockton | 108–132 minutes, correct corridor properties, evidence and toll disclosure |
| Performance live | Direct/timeboxed/free-text | All p95 budgets pass on micro-PC |
| Runtime | Local/public health and browser | Exact configured path works after restart |
| Recovery | App and graph rollback | Previous known-good artifacts can be restored |

Primary verify command:

```bash
npm run verify && npm run test:e2e && npm run validate:live && node scripts/benchmark-routing.mjs --assert-budgets && git diff --check
```

### Test Integrity Constraints

- No test may be disabled, deleted, or weakened to release.
- The golden test must examine returned geometry/evidence, not only HTTP 200.
- Performance must include cold and warm runs and cannot rely only on cache hits.
- Public browser verification is required; local code/build checks are insufficient.

## Rollback Strategy

Keep the pre-release application build and graph cache. If health, golden quality, latency, or browser checks fail, restore the previous graph service path and application build, restart only affected services, verify public health, and leave the release branch unmerged.

## Open Decisions

| Decision | Options | Chosen | Rationale |
|----------|---------|--------|-----------|
| Deployment authority | workers/lead | lead only | Centralized rollback and evidence |
| Merge style | squash all/per-phase commits | retain reviewed phase commits plus merge commits | Reviewability and targeted revert |
| Old graph retirement | immediate/after approval | after user approval and rollback window | Avoid unrecoverable live failure |

## Reality Check

### Code Anchors Used

| File | Symbol/Area | Why it matters |
|------|-------------|----------------|
| `scripts/validate-live.mjs` | live validation | Existing end-to-end release check requires expansion |
| `docs/CLOSURE-REALITY-2026-07-21.md` | public/device proof | Records current long-route timeout and physical/runtime boundaries |
| `infra/systemd/switchback-app.service` | app runtime template | Service restart/build boundary |
| `infra/systemd/switchback-router.service` | router runtime template | Graph cache/service boundary |

### Mismatches / Notes

- The live host currently uses services named `switchback-cloudflare.service` and `switchback-graphhopper.service`; verify actual unit definitions rather than assuming repo template names.
- The repository currently tracks `origin/main`; do not reuse older assumptions that it has no remote.
