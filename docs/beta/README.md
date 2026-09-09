# Switchback beta convergence

This directory is the execution control plane for bringing Switchback from the current integrated product to a small-rider beta without reopening old campaigns or creating a parallel architecture roadmap.

It is subordinate to `AGENTS.md`, ADRs, `docs/release/ROADMAP-WAVES.md`, and the surviving Astra product/interaction contracts. When these documents disagree, the higher authority wins and this package must be corrected.

## Start here

1. `BETA-STATE.md` — exact current verdict, integration status, open evidence, and one next task. Keep this current after merges.
2. `BETA-CONVERGENCE.md` — beta definition, branch/PR disposition, architecture/debloat priorities, value gates, HOLD conditions, and sequencing.
3. `DEBLOAT-AUDIT.md` — screen/code inventory showing what should stay primary, become contextual/post-ride/advanced, or be investigated for retirement before beta.
4. `OPUS-COORDINATOR.md` — copy/paste execution prompt for one high-budget coordinator that may delegate bounded work to cheaper agents.
5. `AGENT-TASKS.md` — concrete task queue with ownership, evidence, risk, and exit criteria.
6. `SALVAGE-LEDGERS.md` — per-capability KEEP / PORT / REWRITE / DROP disposition for the stale drafts #66, #80 and #81, each with a destination on current `main` or an explicit rejection.
7. `../superpowers/plans/2026-09-08-beta-convergence.md` — the first convergence wave. Its Task 1 (dependency gate) and Task 2 onward are superseded by the merges below; the method still applies.

## Current baseline

`main` @ `b8c0f96ce66a6b4edb2a4a48bd12295924e65f9e` (2026-09-09).

The integration lane is closed. Each merge was made only on an exact-head green
run of the nine required checks:

- **#88** security — `454b76ce630837bdddc7dad4211429c51aa3e19c`. Four advisories cleared; `npm audit --audit-level=moderate` reports 0 vulnerabilities. Includes the MapLibre v6 migration *and* the served worker bundle the version bump alone omitted — without it the fallback renderer draws a basemap and no route, silently.
- **#86** janitorial — `8849dc2949ea4c23ad903e1d8801a5057f9349f6`. Deletion-only cleanup, `better-sqlite3` → `node:sqlite`, and the working tree now stays clean after a visual run.
- **#82** map presentation — `01f8b53233dd7ec53399b9571b92274c54b69d71`. One basemap authority: `road | terrain | satellite`, with legacy experience ids confined to storage and migration.

The correctness/truth lane is closed too. All five defects were RED-tested
before the fix and merged on exact-head green:

- **#89** truthful ride-card geometry — `0ece54e…`
- **#90** recorded duration provenance — `e8f0a7f…`
- **#91** `Best Ride` follows the ranking — `1a25965…`
- **#92** prompt toll-policy coherence — `bb41fd4…`
- **#93** fresh topology drops stale per-leg styles — `b8c0f96…`

Every one was a value computed correctly in one place and never carried to what
the rider reads. None needed new capability.

Remaining stale drafts, now with written dispositions in `SALVAGE-LEDGERS.md`:

- PR #66 `feat/recorded-rides-route-intelligence` — port the geometry-derived region facts, road-name extraction and their tests; drop the second search surface, the Goblin branding collision and the PA-quadrant taxonomy. Its smallest slice is BETA-014.
- PR #80 `feat/gravel-goblin-route-intent` — keep only the relative-edit semantics, and only as a bounded adapter. `PROFILE_BASELINES` would be a second authority on what `twisty` means.
- PR #81 `feat/gravel-goblin-route-memory` — port nothing until a canonical Rides facts model exists. Its adversarial unknown-evidence tests are the most valuable thing in either draft.

No document in this directory grants permission to weaken a test, regenerate a visual baseline over a defect, fabricate physical-device evidence, or merge a stale branch because Git reports it as technically mergeable.
