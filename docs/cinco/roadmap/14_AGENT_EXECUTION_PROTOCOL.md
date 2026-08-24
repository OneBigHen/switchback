# Agent Execution Protocol

## Why this exists
The implementing agent is expected to be capable but may not have strong product judgment. Follow this protocol exactly.

## Start of every phase

```bash
git fetch origin
git checkout main
git pull --ff-only
git status --short
git rev-parse HEAD
npm ci
npm run typecheck
```

If baseline is not clean, document the failure before making changes.

Create a branch:
```text
cinco/phase-<N>-<short-name>
```

## Work loop

For each task:
1. identify existing behavior and tests;
2. write/adjust the smallest failing test;
3. make the smallest implementation;
4. run targeted test;
5. review diff;
6. commit;
7. proceed.

## Commit policy
Prefer small semantic commits:
- `refactor: extract map viewport controller`
- `test: cover context sheet detents`
- `feat: add route character summary`
- `design: add cinco semantic route tokens`

Do not use:
- `updates`
- `fix stuff`
- one giant 80-file commit.

## Ambiguity policy

If requirements are ambiguous:
1. preserve existing behavior;
2. choose the lower-risk implementation;
3. record the ambiguity in `docs/cinco/DECISIONS.md`;
4. do not invent a new product rule.

## No scope creep

An agent may not add:
- authentication redesign,
- new backend framework,
- state library replacement,
- routing engine replacement,
- new database,
- unrelated CI framework,
- broad dependency upgrades,
- social gamification,
- generative AI feature,
unless phase requirements explicitly require it.

## Large-file rule

If touching:
- `PlannerShell.tsx`
- `MapStage.tsx`
- `PlannerDeck.tsx`

do not add a large new responsibility.
Extract first when the phase requires substantial behavior.

## Test failure policy

### Failure caused by new code
Fix it.

### Existing unrelated failure
Prove it existed at baseline, document it, and do not “fix” it by disabling the test.

### Visual failure
Inspect the image. Never blindly accept snapshots.

## External APIs

- use official documentation;
- keep provider parsing isolated;
- fixture external responses;
- do not make unit tests hit the network;
- do not commit tokens;
- document rate/cost/freshness assumptions.

## Handoff contents for every PR

PR body must include:

```markdown
## Phase
CINCO Phase N — <name>

## Starting SHA
<sha>

## Requirements implemented
- UX-...
- MAP-...
- ...

## What changed
...

## What intentionally did not change
...

## Tests
- command — result

## Visual evidence
- phone portrait
- phone landscape
- tablet portrait
- tablet landscape

## Known limitations
...

## Follow-up
...
```

## Stop conditions

Stop phase and report instead of improvising if:
- existing route legality must be changed to continue;
- a Mapbox license/terms issue blocks required behavior;
- offline behavior would need to be removed;
- a provider requires unexpected payment/contract;
- tests reveal a serious unrelated production defect;
- phase requires a cross-cutting schema migration not described in the spec.

## Definition of done
Done means:
- requirements satisfied,
- tests green,
- screenshots reviewed,
- no known silent regression,
- docs updated,
- PR narrowly scoped,
- no production deployment performed.
