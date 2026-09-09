# Switchback beta convergence

This directory is the execution control plane for bringing Switchback from the current integrated product to a small-rider beta without reopening old campaigns or creating a parallel architecture roadmap.

It is subordinate to `AGENTS.md`, ADRs, `docs/release/ROADMAP-WAVES.md`, and the surviving Astra product/interaction contracts. When these documents disagree, the higher authority wins and this package must be corrected.

## Start here

1. `BETA-CONVERGENCE.md` — current state, beta definition, branch/PR disposition, architecture/debloat priorities, value gates, and sequencing.
2. `DEBLOAT-AUDIT.md` — screen/code inventory showing what should stay primary, become contextual/post-ride/advanced, or be investigated for retirement before beta.
3. `OPUS-COORDINATOR.md` — copy/paste execution prompt for one high-budget coordinator that may delegate bounded work to cheaper agents.
4. `AGENT-TASKS.md` — concrete task queue with ownership, evidence, risk, and exit criteria.
5. `../superpowers/plans/2026-09-08-beta-convergence.md` — executable first convergence wave, intentionally narrower than the full task queue.

## Current baseline

Rebaselined on 2026-09-08 from `main` at `b53c177c1620098bfa00883257eae245411a6f5c` (merge of PR #83, graphics UX foundation).

Open integration work observed at this checkpoint:

- PR #82 `implement/map-system-phase1` — active map-presentation reconciliation. Treat as the next integration candidate, but its exact head must be green before merge.
- PR #66 `feat/recorded-rides-route-intelligence` — stale draft with useful geometry-first Rides ideas mixed with UI/product decisions that now overlap #83 and the beta direction. Salvage deliberately; do not merge wholesale.
- PR #80 `feat/gravel-goblin-route-intent` — stale draft with a useful provider-neutral preference-vector seam. Rebase concepts into canonical RideIntent/typed commands; do not let it become a second planner authority.
- PR #81 `feat/gravel-goblin-route-memory` — stacked on #80 and therefore not a clean integration candidate. Salvage deterministic fingerprint/search work only after the Rides/read-model boundary is settled.

No document in this directory grants permission to weaken a test, regenerate a visual baseline over a defect, fabricate physical-device evidence, or merge a stale branch because Git reports it as technically mergeable.
