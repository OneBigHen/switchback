# Module quality sweep — brief for an agent or agent team

**Purpose:** find and fix real dead code, correctness problems, and doc/code
drift across `src/`, then produce one dev report an owner can act on. This is
the horizontal "make everything clean and working" track. It is **not** the
UX redesign — that's a separate, already-fully-specified track, see below.

## Read this first: don't duplicate existing work

Before touching any module, check what's already been said about it:

1. `docs/phase-reports/` — 36 phase reports, each with a "what shipped /
   what's deferred" section. `P03-dead-complexity.md` already did a dead-code
   pass; check it wasn't re-introduced rather than re-finding it from zero.
2. Prior audits, several already exist and were never fully closed out:
   `AUDIT-SUPPLEMENT.md`, `AUDIT-EVALUATION.md`, `UX-AUDIT.md` (repo root),
   `docs/audit-deepseek-v4-pro.md`, `docs/audit-mimo-v2.5-pro.md`,
   `docs/recovery/BASELINE_AUDIT.md`, `docs/reviews/2026-08-21/*`,
   `docs/SHAREABILITY-REVIEW-2026-08-14.md`. Grep these for your module
   before reporting a finding as new — if it's already documented and still
   present, the finding is "still not fixed," not "discovered."
3. `docs/quality/CSS-DEAD-RULES.md` documents why naive coverage-based
   dead-code detection failed on this codebase (state-dependent UI hides real
   rules as "uncovered") and what worked instead (static cross-reference of
   every class name against every consumer, then batch-delete-and-test, not
   delete-on-suspicion). Apply the same discipline to TS/TSX: a symbol with
   zero static references is a candidate, not a verdict, until you've also
   checked for dynamic access (string-keyed lookups, `React.lazy`, config-
   driven dispatch tables) and re-run the full suite after removal.

**This repo's own failure pattern** (see the project's scope-hopping habit):
docs assert something is "done" or "verified" without the artifact that
proves it. Do not repeat that here. Every finding in your output needs
either a failing command, a file:line, or a reproduction — not just "this
looks off."

## Track split

- **UX/visual redesign → `docs/cinco/roadmap/`.** Fully specified 20-doc pack,
  already phased, already has ready-to-paste agent prompts under
  `agent_packets/`. Phase 0 (baseline/contract) and Phase 1 (map workspace
  architecture) are done and merged. **Phase 2 (CINCO visual system + premium
  map — responsive shell, semantic tokens, phone/tablet compositions,
  Mapbox experiment)** is the next phase and is what "efficient and mobile
  friendly" actually means for this app — read `06_PHASE_ROADMAP.md` then
  `agent_packets/PHASE_2_PROMPT.md` and paste that packet into the
  implementing agent as-is. Don't re-derive a redesign plan; this one
  exists, was reviewed, and has font/color/sizing/motion answers already
  (`09_DESIGN_SYSTEM_SPEC.md`). Do not start Phase 2 work in the same
  branch/PR as anything from this sweep.
- **Everything below → this brief.** Codebase health, not visuals.

## Module assignment (dispatch one agent per row, in parallel)

| Area | Paths | Watch for |
|---|---|---|
| Routing & providers | `src/lib/routing/`, `src/lib/roads/`, `src/lib/curvature/` | GraphHopper/Valhalla seam drift, dead profile logic, error paths that swallow provider failures silently |
| Planner domain | `src/lib/planner/`, `src/lib/domain/`, `src/lib/recommendation/`, `src/components/planner/` | State machines with unreachable branches, stale `useEffect` deps (see the timezone bug already fixed this session as a model finding) |
| Sync & identity | `src/lib/sync/`, `src/lib/identity/`, `src/lib/storage/` | Code with no UI wiring (per `PLAN_TONIGHT.md`: `sync-controller.ts`/`encrypted-sync.ts` are suspected unwired — confirm with a real trace, not a grep) |
| Offline & workers | `src/lib/offline/`, `src/workers/`, `src/lib/gpx/` | Build scripts (`scripts/build-offline-v2.mjs`) vs. what the app actually reads at runtime |
| Community & sharing | `src/components/community/`, `src/lib/community/`, `src/lib/share/` | Per `PLAN_TONIGHT.md`, flagged as possibly stub-quality; verify against real UI, not just presence of files |
| External data | `src/lib/weather/`, `src/lib/places/`, `src/lib/geocoding/`, `src/lib/map-features/`, `src/lib/ai/` | Unused provider fallbacks, hardcoded keys/URLs that should be env-driven |
| App shell & routes | `src/app/`, `src/app/api/`, `src/components/shell/`, `src/stores/` | Orphaned API routes with no caller, inconsistent error-response shapes across `api/*` |
| Styles | `src/app/styles/` | Re-run `scripts/qa/find-dead-css-rules.mjs`; anything new since `CSS-DEAD-RULES.md` was written |
| Tests & CI | `tests/`, `.github/workflows/`, `playwright.config.ts` | Skipped/`.only` tests left in, `continue-on-error` jobs whose original reason may now be resolved (the `visual` job is one — see `docs/CI-ARCHITECTURE.md`) |

Skip: `node_modules`, `.next`, generated files (`next-env.d.ts`), anything
under `docs/cinco/roadmap/` (reference material, not code to audit).

## What counts as a finding

- Dead code: unreferenced exports/files verified by static cross-reference
  **and** a check for dynamic access, not just "grep found nothing."
- Correctness: a concrete failure scenario (input → wrong output), not a
  style preference.
- Drift: a doc or comment asserting behavior the code no longer has (or
  never had) — cite both sides.
- Security: anything touching `src/app/api/`, secrets, or auth — hold to a
  higher bar, see `SECURITY.md`'s stated scope.

Do **not** report: formatting/style nits `eslint` would already catch (it's
currently clean — `npm run lint` passes with `--max-warnings=0`), or
hypothetical problems with no reachable trigger.

## Guardrails

Same rules as everything else in this repo right now (`PLAN_TONIGHT.md`):
- Don't touch the routing engine, navigation engine, or Free Ride's core
  logic as part of a "cleanup" — those are explicitly protected in the CINCO
  pack's non-negotiable rules too.
- One finding-area's fixes = one small, reviewable PR/branch, not one giant
  sweep commit.
- `AGENT WORKING` / `NEEDS YOUR DECISION` / `READY TO MERGE` — stop and ask
  only for the CINCO pack's own stop-and-ask list or anything else genuinely
  irreversible (deleting a feature, changing privacy defaults, exposing an
  internal service publicly).
- Full gate before calling anything done: `npm run verify` (lint + typecheck
  + unit tests + build). No silent test weakening to make a gate pass.

## Output: one dev report, not another pile

Write findings to `docs/quality/MODULE_SWEEP_REPORT_<date>.md`, one section
per module area above, each finding as:

```
### [area] short title
**File:** path:line
**Severity:** blocker / high / medium / low
**Evidence:** failing command output, or file:line pair showing the drift
**Fix:** what changed (link the commit/PR once applied), or "flagged, not
fixed" with why
```

End with a short rollup: total findings by severity, how many fixed vs.
flagged, and — explicitly — whether this report makes any of the 8 prior
audit docs listed above fully resolved and archivable. If yes, say which
ones and why; that's part of closing the loop this project keeps missing.
