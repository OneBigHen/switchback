# Module quality sweep — Planner domain

Area: **Planner domain**
Paths: `src/lib/planner/`, `src/lib/domain/`, `src/lib/recommendation/`, `src/components/planner/`
Date: 2026-08-24
Branch: `quality-sweep/planner-domain`

Per `docs/quality/MODULE_SWEEP_BRIEF.md`, this is a per-area report file
(not the brief's originally-named shared file) — nine areas are running in
parallel isolated worktrees, so a shared file would just cause merge
conflicts across the resulting PRs. A follow-up pass consolidates all
per-area files into one report after they land.

## Prior audits checked before reporting anything as new

Grepped for `planner|recommendation|domain/|useEffect|state machine|
ContextSheet|PINNED_CLOCK` across `AUDIT-SUPPLEMENT.md`, `AUDIT-EVALUATION.md`,
`UX-AUDIT.md`, `docs/audit-deepseek-v4-pro.md`, `docs/audit-mimo-v2.5-pro.md`,
`docs/recovery/BASELINE_AUDIT.md`, `docs/reviews/2026-08-21/*`,
`docs/SHAREABILITY-REVIEW-2026-08-14.md`, and the relevant `docs/phase-reports/`
entries (P06 planning controller, P24 navigation state machine). The most
relevant prior documents for this area were `docs/recovery/BASELINE_AUDIT.md`
and `docs/reviews/2026-08-21/OPUS-ADVERSARIAL-REVIEW.md` +
`REMEDIATION-RESULT.md` (a real adversarial review/fix cycle against this
exact component tree, three weeks before this sweep).

Status found for the planner-domain items in those docs (see the rollup for
the full list): several are now resolved (confirmed by re-reading current
code, not by trusting the doc), a few residue items were still present and
got fixed here, and one (ADV-005/P1-C) was deliberately re-confirmed and left
as previously deferred rather than re-litigated.

---

## Findings

### [planner domain] Planner lifecycle state machine gets permanently stuck after the first cancel or routing failure

**File:** `src/lib/domain/planner-state-machine.ts:14-32` (`PLANNER_PHASE_TRANSITIONS`), consumed by `src/stores/planner-store.ts:495-521` (`failRouting`, `cancelPlanning`, `setPlanningPhase`), `src/components/planner/usePlannerRideIntent.ts:82,90,218`, and `src/lib/client/trip-planning-coordinator.ts:68-69,127,141,146,154`.

**Severity:** high

**Evidence:** `cancelPlanning()` and `failRouting()` set `planningPhase` directly to `"cancelled"`/`"error"`, bypassing the `canTransitionPlannerPhase` gate (which is fine — every phase's transition set already allows moving to `cancelled`/`error`). The bug is on the way back out: the old transition table only allowed `cancelled → idle` and `error → idle`, and **no code anywhere ever calls `setPlanningPhase("idle")`** — `planningPhase` is set to `"idle"` only once, at store initialization (`src/stores/planner-store.ts:273`). Every real "start a new plan" entry point instead calls `setPlanningPhase("interpreting")` (the next ride prompt, `usePlannerRideIntent.ts:82`) or `setPlanningPhase("routing-primary")` (a direct replan, `trip-planning-coordinator.ts:69`) — and both of those source transitions were illegal from `cancelled`/`error`, so the gate silently rejected them (`canTransitionPlannerPhase("cancelled", "interpreting")` and `("error", "routing-primary")` both returned `false`).

Net effect: after the very first cancelled plan or the very first routing/interpretation failure in a session, `planningPhase` freezes at `"cancelled"`/`"error"` for the rest of the session. `isActivePlanningPhase()` (`PlannerDeckViewModel.ts:88`) then always returns `false`, so the planning-progress UI in `PlannerDeck.tsx` (the "Routing your ride…"/"Adding alternatives…" status line, elapsed timer, and Cancel button, gated on `planningActive` at `PlannerDeck.tsx:377`) never reappears again — even though routing genuinely runs in the background on every later attempt. No crash, no wrong route; a silent, permanent regression to the ride-planning progress affordance, exactly the shape of the timezone/`PINNED_CLOCK` bug already fixed elsewhere in this codebase this session.

Reproduced against the real store before the fix:
```
store.setPlanningPhase("interpreting")
store.cancelPlanning()                       // planningPhase === "cancelled"
store.setPlanningPhase("interpreting")        // rejected: planningPhase stays "cancelled"
```
and the same shape via `failRouting()` → `error` → a blocked `setPlanningPhase("routing-primary")`.

Existing coverage missed this because `tests/unit/trip-planning-coordinator.test.ts` mocks `getPlanner()` with `vi.fn()` (no real gate logic at all), and `tests/unit/planner-lifecycle.test.ts`/`planner-state-machine.test.ts` each tested the terminal-state transition and the pure function in isolation, never "cancel/fail, then try to plan again" through the real store.

**Fix:** Extended `cancelled`/`error`'s allowed transition sets to also include `interpreting`, `geocoding`, and `routing-primary` (mirroring exactly what `ready` can already do to start a fresh lifecycle), so a terminal phase can never block the next plan. Updated the docstring to state the intent explicitly. Added a regression test to `tests/unit/planner-state-machine.test.ts` (pure-function edges) and two end-to-end store tests to `tests/unit/planner-lifecycle.test.ts` (`cancelPlanning()` then `setPlanningPhase("interpreting")`; `failRouting()` then `setPlanningPhase("routing-primary")`) that fail on the old table and pass on the fix.

---

### [planner domain] `useRoadLockDraft.resetLockDraft` ignored the road-requirements flag when resetting `lockMode`

**File:** `src/components/planner/useRoadLockDraft.ts:80-90` (`resetLockDraft`)

**Severity:** low

**Evidence:** Already documented as refactor residue in `docs/reviews/2026-08-21/OPUS-ADVERSARIAL-REVIEW.md` §8: initial state is `featureFlags.roadRequirements ? "must" : "prefer"`, but `resetLockDraft()` unconditionally called `setLockMode("must")`. Currently harmless in production because `featureFlags.roadRequirements` is `true` (`src/lib/domain/feature-flags.ts:25`), which is exactly why the prior remediation pass left it as a documented residue rather than a P0/P1 fix — but it would silently reintroduce a "must" UI default the moment that flag is ever turned off, in a file whose whole job is owning this state.

**Fix:** `resetLockDraft` now sets `setLockMode(featureFlags.roadRequirements ? "must" : "prefer")`, matching the initial-state clamp. Verified against `tests/unit/components/planner/use-road-lock-draft.test.tsx` (no flag mocking in that file, so behavior is unchanged under the current flag value; the mismatch this closes only manifests if the flag flips).

---

### [planner domain] LibraryDrawer's "Import as lock" affordance is clickable through to "Save" even when the callback isn't wired

**File:** `src/components/planner/LibraryDrawer.tsx:249,298-324` (`onImportAsLock?` optional in the type, and the button/picker render unconditionally)

**Severity:** low

**Evidence:** This is `ADV-008` from `docs/reviews/2026-08-21/OPUS-ADVERSARIAL-REVIEW.md` §4, left as a P2 "safe follow-up" and not touched by the P0/P1 remediation pass. `onImportAsLock` is typed optional, and `persistGpxLockFromFile` throws `"Road lock import is unavailable in this view."` if it's missing — reachable only after the rider clicks "Import as lock", picks a file, chooses must/prefer, names it, and clicks "Save road lock". `PlannerShell` is the only production caller and always passes it, so this is latent, not reachable today.

**Attempted and reverted:** first tried hiding the whole affordance when `onImportAsLock` is absent, but `tests/components/library-drawer-road-locks.test.tsx` (a test file not surfaced by the initial grep pass, since it doesn't match on `useEffect`/state-machine keywords) explicitly asserts the button renders and the file-picker/mode-radio UI opens and works with **no** `onImportAsLock` passed at all (three of its five tests render the drawer without the prop and interact with the picker) — only the final persistence step needs the callback. So the drawer's intended contract is "the local drafting UI always works; only committing needs a wired callback," which the hide-on-absent fix broke (caught by the same `npm run verify` run before commit; reverted, verified `git diff` on this file is empty again).

**Fix:** Flagged, not fixed — reverted the incorrect attempt. Given the actual contract, the right fix (if any) is narrower than ADV-008's own suggestion: keep the affordance and its draft UI always visible, and turn the final `persistGpxLockFromFile` throw-on-missing-callback into something more informative than a generic message, or accept it as intentionally unreachable in production since `PlannerShell` always wires the callback. Not worth a speculative change here; recorded so the next pass doesn't repeat the same mistake.

---

### [planner domain] ContextSheet's "immersive" detent and its restore-memory model are designed but never wired

**File:** `src/components/planner/workspace/context-sheet-state.ts:61-90` (`ImmersiveSheetState`, `enterImmersive`, `exitImmersive`, `isImmersive`)

**Severity:** medium

**Evidence:** Static cross-reference across `src/` and `tests/` (`grep -rl "enterImmersive|exitImmersive|isImmersive|ImmersiveSheetState"`) shows these four exports are used nowhere except their own dedicated unit test (`tests/unit/components/planner/workspace/context-sheet-state.test.ts`). No dynamic/string-keyed access either — `ContextSheet.tsx` and `map-viewport-insets.ts` both handle `"immersive"` as a bare `ContextSheetDetent` string literal (`ContextSheet.tsx:39`, `map-viewport-insets.ts:142`), never via the `ImmersiveSheetState` object. And nothing in the live app ever sets the sheet to `"immersive"` at all: the only two places `sheetDetentOverride` is set today are `PlannerDeck.tsx:246,332` (`"half"`/`"peek"`) plus the drag-gesture ladder in `ContextSheet.tsx` (`expandSheetDetent`/`collapseSheetDetent`, bounded by `CONTEXT_SHEET_EXPAND_ORDER = ["closed","peek","half","full"]`, which excludes `"immersive"` entirely).

So the richer design described in the doc comment ("Ride/free-ride surfaces take over the whole map area... Entering immersive twice keeps the original restore target rather than stacking") is not implemented in the running app today — a ride/free-ride surface transition does not currently produce or restore an immersive sheet state through this module.

**Fix:** Flagged, not fixed — see `NEEDS YOUR DECISION` below. This reads as scaffolding staged ahead of `docs/cinco/roadmap/phases/PHASE_2_CINCO_VISUAL_SYSTEM_AND_PREMIUM_MAP.md` (a premium/responsive map shell is exactly where a full-screen ride sheet belongs), and this sweep's guardrails explicitly say not to start CINCO Phase 2 work or touch `docs/cinco/roadmap/`. Deleting it now risks discarding work Phase 2 will need in days; leaving it risks a small amount of permanently-dead code if Phase 2 goes a different direction. No behavior changed.

---

## NEEDS YOUR DECISION

**Question:** Should the unused `ImmersiveSheetState`/`enterImmersive`/`exitImmersive`/`isImmersive` scaffolding in `context-sheet-state.ts` be deleted now (dead code today) or left in place (likely Phase 2 CINCO input)?
**Recommended default:** Leave it. It's inert (no runtime path reaches it), well-isolated, and has its own passing unit test; deleting it and needing to re-add the same design in Phase 2 is more churn than leaving four unused-but-tested functions in a file whose entire purpose is owning this state.

---

## Confirmed still-present items from prior audits (not new findings)

- **`docs/reviews/2026-08-21/OPUS-ADVERSARIAL-REVIEW.md` ADV-005 / `REMEDIATION-RESULT.md` P1-C** — `src/lib/client/recorded-ride-finalization.ts:18` still duplicates the `points.length < 2` guard already enforced by its only caller (`PlannerShell.tsx:281`), making the module's own throw unreachable today. The prior remediation pass explicitly reproduced this and **deliberately deferred** it ("no speculative ownership rewrite was made") rather than pick a side; re-confirmed here, not re-fixed, for the same reason — picking "caller owns the guard" vs. "wrap the call so cleanup always runs" changes a contract with its own dedicated unit test, which is a bigger call than this sweep's "small reviewable fix" bar.
- **`docs/reviews/2026-08-21/OPUS-ADVERSARIAL-REVIEW.md` ADV-006** — `MapStage.tsx`'s manual `addRoadLock` path still does not call `routeRequestGate.invalidate()`, unlike `PlannerShell.tsx`'s `handleImportAsLock` path (`PlannerShell.tsx:598`). Still inconsistent, still low severity (the store's `addRoadLock` already resets `plan`/`selectedRouteId`, so the practical effect is small) — not fixed, since picking one contract for both paths is a product-level nuance, not a pure cleanup.
- **`docs/recovery/BASELINE_AUDIT.md` #9** — `PlannerShell.tsx` is still a god component (now 1,583 lines, was 1,440; 14 `useEffect` blocks). Confirmed still true; not touched here — a real fix is a multi-file decomposition, well outside a "small reviewable" sweep PR, and risks exactly the kind of "refactor commit that hides a behavior change" failure mode `OPUS-ADVERSARIAL-REVIEW.md` documented against this same file tree three weeks ago.

## Confirmed resolved since the prior audits (worth closing the loop on)

- **`docs/recovery/BASELINE_AUDIT.md` #10** (misleading copy) — the `MapStage.tsx` portion of this finding ("safe"/"verified"/"snaps to the nearest routable edge" at the old `MapStage.tsx:1402`) is gone; `grep` for those strings in the current file returns nothing. (The finding's other files — `FreeRideHud.tsx`, `AppNavigation.tsx`, `routing/planner.ts` — are outside this area's paths and not verified here.)
- **`docs/recovery/BASELINE_AUDIT.md` #11** (`onBuildCorridor` never passed) — now wired: `PlannerShell.tsx:1510` passes `handleBuildCorridor` to `RegionDownloadsPanel`. The old no-op `DownloadModePicker`/`onDownloadModeChange` referenced in the same finding no longer exists in the tree at all (matches the git history: "wire corridor rebuild + remove no-op download picker").
- **`AUDIT-EVALUATION.md`'s hardcoded "Recent" section** (old `PlannerDeck.tsx:319`, static "Home"/"New Hope scenic route" masquerading as dynamic recent destinations) — the current `PlannerDeck.tsx:406` "New Hope scenic route" is a quick-intent example prompt button that submits a real ride request, not a fake history entry.
- **`docs/reviews/2026-08-21/OPUS-ADVERSARIAL-REVIEW.md` ADV-002** — re-verified intact, not regressed: `useRoadLockDraft.ts`'s must-mode match failure still rethrows (`if (draft.mode !== "prefer") throw caught`) rather than silently persisting an unresolvable required lock.

## Adjacent note (not this area's fix to make)

`docs/audit-deepseek-v4-pro.md` HIGH #2 (free-ride endpoint unauthenticated/unrate-limited) calls into this area's `src/lib/recommendation/free-ride.ts:121` (`buildGraphBackedFreeRideCandidates`), and is still unfixed — `src/app/api/free-ride/suggestions/route.ts` has no rate limiter today. The vulnerable code is the API route itself (`src/app/api/`), which is the **App shell & routes** sweep area's scope per the brief's module table, not this one's. Noting it here only so it isn't lost between areas; not counted in this report's rollup.

---

## Rollup

| Severity | Found | Fixed | Flagged (not fixed) |
|---|---|---|---|
| Blocker | 0 | 0 | 0 |
| High | 1 | 1 | 0 |
| Medium | 1 | 0 | 1 |
| Low | 2 | 1 | 1 |
| **Total** | **4** | **2** | **2** |

Plus: 3 still-present items re-confirmed from prior audits (2 deliberately left as-is, 1 too large for this sweep), and 4 prior-audit items confirmed now resolved.

Note: an initial attempt to fix the LibraryDrawer finding (hide the affordance when `onImportAsLock` is absent) was caught as incorrect by `npm run verify` — it broke `tests/components/library-drawer-road-locks.test.tsx`, which deliberately asserts the affordance works without that prop — and was reverted before commit. See that finding's "Attempted and reverted" note.

**On archiving prior audit docs:** none of the 8 prior audit docs listed in the brief are fully resolved/archivable as a whole — each covers far more than the planner domain (routing engine, deployment, CI, styles, etc.), and other sweep areas are independently checking their own sections in parallel. Within just the planner-domain slice of `docs/recovery/BASELINE_AUDIT.md` and `docs/reviews/2026-08-21/*`, items #10 (partially) and #11 are now resolved and ADV-002 is confirmed intact, per above — but the docs themselves should only be archived once every area's report confirms its own slice, which is the consolidation pass's job, not this one's.

## Verification

`npm run verify` (lint + typecheck + unit tests + build) run in full on this branch before opening the PR; see the PR for the final result. No tests were weakened — two files gained regression tests (`tests/unit/planner-state-machine.test.ts`, `tests/unit/planner-lifecycle.test.ts`); none were loosened or removed.
