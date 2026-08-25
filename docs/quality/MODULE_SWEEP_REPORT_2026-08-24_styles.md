# Module quality sweep — Styles (`src/app/styles/`)

Per-area report for the horizontal quality sweep described in
`docs/quality/MODULE_SWEEP_BRIEF.md`. This is one of 9 areas running in
parallel isolated worktrees; a follow-up pass consolidates all per-area
files into one report after they land. Scope for this file: `src/app/styles/`
only, watching specifically for anything new since
`docs/quality/CSS-DEAD-RULES.md` was written.

## What was checked before reporting anything as new

- `docs/quality/CSS-DEAD-RULES.md` in full (the prior dead-CSS audit for this
  area) and its script, `scripts/qa/find-dead-css-rules.mjs`.
- `docs/quality/ORPHANED-CLASSES.md` (the reverse-direction audit: JSX
  classNames with no matching CSS rule) — same `docs/quality/` folder,
  directly touches `src/app/styles/`.
- Grepped the 8 other prior audit docs listed in the brief
  (`AUDIT-SUPPLEMENT.md`, `AUDIT-EVALUATION.md`, `UX-AUDIT.md`,
  `docs/audit-deepseek-v4-pro.md`, `docs/audit-mimo-v2.5-pro.md`,
  `docs/recovery/BASELINE_AUDIT.md`, `docs/reviews/2026-08-21/*`,
  `docs/SHAREABILITY-REVIEW-2026-08-14.md`) for CSS-related content. The only
  hits are all about the old 5,688-line `globals.css` monolith
  (`AUDIT-SUPPLEMENT.md`, `AUDIT-EVALUATION.md`) — already resolved by the
  historical split into today's 29 feature-scoped files (a different
  mechanism than the CSS-Modules approach those docs proposed, but the same
  underlying problem, and it's gone). No overlap with any finding below.
- `docs/phase-reports/P03-dead-complexity.md` and `docs/reviews/2026-08-21/*`
  — no CSS-specific content in either.

## Methodology

Re-ran `scripts/qa/find-dead-css-rules.mjs`. It failed immediately:
`responsive.css`, the single file it was hardcoded to scan, was deleted on
2026-08-16 (commit `d58b5ce`, "TASK-2.3: split responsive.css into
per-component stylesheets") — one day *after* `CSS-DEAD-RULES.md` was
written against it. The script has been silently unusable since. Fixed
first (see Finding 1), then re-ran it across all 29 current stylesheets and
manually re-verified every `DEAD`/`PARTIAL` hit by reading the relevant
component source, exactly as `CSS-DEAD-RULES.md` prescribes (never delete on
the script's verdict alone). Every rule fixed below was independently
confirmed dead by hand before touching it; the full gate
(`npm run verify` — lint, typecheck, unit tests, build) was run clean after
the changes.

## Findings

### [Styles] Dead-CSS audit script silently broken since 2026-08-16
**File:** `scripts/qa/find-dead-css-rules.mjs`
**Severity:** medium
**Evidence:** `node scripts/qa/find-dead-css-rules.mjs` →
`Error: ENOENT: no such file or directory, open '.../src/app/styles/responsive.css'`.
`responsive.css` was deleted in TASK-2.3 (`d58b5ce`), which moved its
surviving rules into feature-scoped files, but the script (and
`CSS-DEAD-RULES.md`) still hardcoded that one path. This is new since
`CSS-DEAD-RULES.md` — the doc predates the deletion by a day.
**Fix:** Fixed. Generalized the script to scan every `*.css` file directly
under `src/app/styles/` (29 files today) instead of one hardcoded target,
and to prefix each flagged line with its source file. Re-run now produces
`{ KEEP: 1223, SKIP: 4, DEAD: 22, PARTIAL: 11 }` across the whole directory
with no errors.

### [Styles] Dead near-miss selectors: `.library-error`, `.library-drawer [role="alert"]`
**File:** `src/app/styles/library-drawer.css:1623` (pre-fix)
**Severity:** low
**Evidence:** `CSS-DEAD-RULES.md` already flagged `.library-error` by name
("genuinely has no user... flag for a human look in TASK-2.2 rather than
auto-delete") but TASK-2.2 (`f07ea57`) only removed `.engine-status` and
`.omnibox-helper` — this one was never actioned. Re-verified: zero renders of
`role="alert"` or `className="library-error"` anywhere in
`LibraryDrawer.tsx`; the component's only error surface uses a different,
already-styled class (`library-lock-import-error`, line 393). This is "still
not fixed," now fixed.
**Fix:** Fixed. Stripped the dead `.library-error` / `.library-drawer
[role="alert"]` fragments out of 4 compound rules (kept the still-live
`.library-empty` selectors and their `strong`/`p` sub-rules intact); deleted
the one rule (`border-color`/`background`/`color` override) that had no
selector left once the dead fragments were removed.

### [Styles] Dead rule: `.overlay-options label.is-unavailable`
**File:** `src/app/styles/map-layer-control.css:154` (pre-fix)
**Severity:** low
**Evidence:** `MapStageLayerControl.tsx`'s per-layer `layerState` switch
(lines ~118-134) only ever produces `"loading" | "ready" | "empty" | "zoom" |
"error"` for the `` `is-${layerState}` `` template class — `"unavailable"`
is not a reachable value. Confirmed dead by reading the switch statement,
not just by absence of the literal string (the sibling `is-error`/
`is-loading`/`is-ready`/`is-zoom` rules on the same file matched the same
"looks dead by grep" pattern from `CSS-DEAD-RULES.md`'s interpolation
blind spot but are genuinely alive — verified each against the switch's
real cases before ruling this one out as the exception).
**Fix:** Deleted.

### [Styles] Dead rule: `.region-suite-option-input`
**File:** `src/app/styles/region-suite-picker.css:77` (pre-fix)
**Severity:** low
**Evidence:** `display: none` rule sized for a native `<input>`, but
`RegionSuitePicker.tsx` renders every option as a `<button>` with a custom
`.region-suite-option-mark` indicator — no `<input>` element exists anywhere
in the file. Leftover from an earlier native-radio-input implementation.
**Fix:** Deleted.

### [Styles] Dead rules: `.status-ready > span`, `.status-offline > span`
**File:** `src/app/styles/planner-shell.css:311` and `:318` (pre-fix)
**Severity:** low
**Evidence:** Zero occurrences of `status-ready`/`status-offline` anywhere
in `src/components`. The app's live/connection dot renders via the sibling
`.live-dot` class alone (`RideHud.tsx:180`, `FreeRideHud.tsx:94`) — never
wrapped in a `.status-ready`/`.status-offline` parent.
**Fix:** Removed the dead `.status-ready > span` selector fragment from its
compound rule (kept `.live-dot`, confirmed genuinely alive); deleted the
fully-dead standalone `.status-offline > span` rule.

### [Styles] Dead legacy profile form: `.profile-grid` family + `.profile-storage-entry`
**File:** `src/app/styles/switchback-v1.css:448-469, 554, 573-608`, plus one
`@media` override (pre-fix)
**Severity:** low
**Evidence:** Zero references to `profile-grid`, `profile-check`, or
`profile-storage-entry` anywhere in `src/components`. `ProfilePanel.tsx`
(the current profile screen) never uses this grid layout at all;
`.profile-storage-entry`'s job was fully superseded by the differently-named
`storage-quota-meter.css` / `StorageQuotaMeter.tsx` (confirmed by reading
both — the newer component uses `storage-quota-meter-*` classes
exclusively). Matches the exact "same dead class, present in multiple files
across an old/new pair" pattern `CSS-DEAD-RULES.md` documented for
`.engine-status`.
**Fix:** Deleted the 5 dead `.profile-grid`/`.profile-check` rules, the dead
`.profile-grid` `@media` override, and the 2 standalone
`.profile-storage-entry` rules; stripped the dead `.profile-storage-entry`
fragment out of 3 more compound rules that also carry the still-live
`.record-readiness`, `.record-actions`, `.profile-actions`, and
`.app-overlay-panel` selectors (verified each of those four is genuinely
rendered before keeping them).

### [Styles] Naming drift: dead `.profile-actions .danger-action` vs. live, unstyled `.danger`
**File:** `src/app/styles/switchback-v1.css:610` (pre-fix); referenced
(read-only) `src/components/shell/ProfilePanel.tsx:284`
**Severity:** medium — real, visible UI gap, not just dead CSS
**Evidence:** CSS defined `.profile-actions .danger-action { color:
var(--danger) }`, but the actual "Reset learning" button in
`ProfilePanel.tsx` uses `className="danger"`. The two names never matched at
any point in this file's history, so the destructive action has always
rendered with default (unstyled, black) text instead of the intended
red/danger color. Not previously documented — `ORPHANED-CLASSES.md`'s
2026-08-15 scan of orphaned JSX classNames didn't flag `danger` as one of
its 33 hits, and `CSS-DEAD-RULES.md` only covered `responsive.css`, not
`switchback-v1.css`.
**Fix:** Fixed. Renamed the selector to `.profile-actions .danger` so it
matches the live class name; the reset button now gets its intended
destructive styling. Pure CSS-only change, no `.tsx` edit needed — stays
entirely within `src/app/styles/`, this area's assigned path.

### [Styles] NEEDS YOUR DECISION — `.sb-map-shell` dead since creation; may be a reserved CINCO Phase 2 seam
**File:** `src/app/styles/design-system.css:73`;
`tests/unit/design-system-contract.test.ts:14`;
`docs/phase-reports/P19-design-system-map-shell.md` (all read-only except
the CSS file, which was not changed)
**Severity:** medium — genuine doc/code drift, but touches CINCO-adjacent
scaffolding I was told not to start
**Evidence:** `.sb-map-shell { position: relative; isolation: isolate; }`
has zero references in any `.tsx`/`.ts` file in the whole repo (checked
beyond just `src/components`). `docs/phase-reports/P19-design-system-map-shell.md`
states: *"Added `sb-map-shell` to the persistent AppShell"* — but
`git log -S "sb-map-shell" -- src/components/shell/AppShell.tsx` returns no
commits. `AppShell.tsx` has used `data-map-shell="true"` (a data attribute,
not this class) since its very first commit. `tests/unit/design-system-contract.test.ts`
only asserts the literal string `.sb-map-shell` appears in the CSS file's
text — it never checks anything actually consumes it, so this drift is
invisible to CI. This is new; not in `CSS-DEAD-RULES.md` (scoped to
`responsive.css` only, one day before `design-system.css` was even created).
**Question:** is `.sb-map-shell` (a) dead CSS from a P19 implementation
change (attribute instead of class) that should be deleted along with
correcting the misleading test/report language, or (b) an intentionally
pre-declared seam for CINCO Phase 2's "responsive shell" work (explicitly
out of scope for this sweep per the brief)?
**My recommended default:** leave the rule in place untouched (it's inert,
zero runtime cost) and hand this off rather than act unilaterally — either
to whoever picks up CINCO Phase 2, or to the "App shell & routes" sweep area
(`src/components/shell/AppShell.tsx` is their path, not mine). Not fixed by
me: the only real fix is a `.tsx` edit outside `src/app/styles/`, and it
sits directly next to Phase 2 scope I was explicitly told not to start.

### [Styles] Flagged, not fixed — `.route-overlap` near-miss (same shape as the already-documented `.library-error` case)
**File:** `src/app/styles/route-comparison.css:265`; referenced (read-only)
`src/components/planner/RouteComparison.tsx:228-229`
**Severity:** low
**Evidence:** `.route-overlap` (absolute-positioned, 7px uppercase caption)
has zero references in any `.tsx` file. The feature it styles is still
alive: `RouteComparison.tsx:229` renders `{Math.round(100 -
route.overlapPercent)}% different`, but inside a bare `<span>` with no
className, so it displays as plain inline text instead of the small
corner caption the CSS describes.
**Fix:** Not fixed — following the exact discipline `CSS-DEAD-RULES.md`
already established for `.library-error`: a near-miss where the underlying
UI is alive gets flagged for a human look, not auto-deleted, because the
right fix is "reconnect," not "delete." The one-line fix
(`className="route-overlap"` on that span) lives in
`src/components/planner/`, which is the *Planner domain* area of this same
parallel sweep, not `src/app/styles/` — flagging for that area/owner rather
than editing outside my assigned path.

### [Styles] Still open, previously documented — 10 unstyled JSX elements from `ORPHANED-CLASSES.md`
**File:** various — see `docs/quality/ORPHANED-CLASSES.md`'s "Genuine
unstyled elements... Lower severity" list: `route-fact-list`,
`route-rating-bike`, `ride-continue-cue`, `ride-reroute-error`,
`planner-stage-chip`, `layer-confidence`, `layer-legend`,
`map-road-lock-experimental-note`, `download-mode-corridor-option-input`,
`gps-retry-button`
**Severity:** low (per the original doc's own ranking)
**Evidence:** Re-checked all 10 class names against every file in
`src/app/styles/` today (`grep -rn` across the whole directory) — none have
gained a matching CSS rule since the 2026-08-15 audit. Still genuinely
unstyled.
**Fix:** Not fixed — this is "still not fixed," not a new discovery, per
the brief's own framing. `ORPHANED-CLASSES.md` already deferred these
explicitly to "Phase 7 (screen-by-screen polish)." Listed here only to
close the loop on that doc's status (see Archival below), not as new work.

## Verification

- `npm run verify` (lint `--max-warnings=0`, typecheck, unit tests, build):
  passed clean after all fixes above.
- Re-ran `node scripts/qa/find-dead-css-rules.mjs` after the fixes: the six
  fixed locations no longer appear in the `DEAD`/`PARTIAL` output; only the
  two flagged-not-fixed items (`.sb-map-shell`, `.route-overlap`) and the
  already-documented interpolation/third-party false-positive categories
  remain (`gps-${state}`, `is-${layerState}`, `style-${style}`,
  `notice-${kind}`, `waypoint-node-${id}`, and every `.maplibregl-ctrl-*`
  rule — each individually re-confirmed alive by reading the relevant
  component, not just carried over from the old doc).
- The Playwright visual suite (`tests/e2e/visual/`, `--project=visual`) was
  **not** re-run in this pass due to host memory constraints flagged during
  the session. Risk is judged low: every deletion/rename above was verified
  against actual render logic (enum/switch values, literal className reads)
  rather than grep-absence alone, `npm run verify`'s production build
  compiled all touched stylesheets without error, and the changes are
  narrowly scoped (a class rename, and removal of rules with zero live
  consumers). Recommend running `npx playwright test --project=visual`
  before merge as a final check, focused on: Library drawer (empty/error
  states), Map layers menu, Region suite picker, Profile panel (Reset
  learning button should now render red), and the ride status dot.

## Rollup

- **Total findings:** 10 (0 blocker, 0 high, 3 medium, 7 low)
- **Fixed:** 7 (2 medium — tooling script, `.danger` naming drift; 5 low —
  `.library-error`/`role="alert"`, `.overlay-options label.is-unavailable`,
  `.region-suite-option-input`, `.status-ready`/`.status-offline`,
  `.profile-grid`/`.profile-storage-entry`)
- **Flagged:** 3 (1 medium — `.sb-map-shell`, NEEDS YOUR DECISION; 2 low —
  `.route-overlap` near-miss, and the 10 still-open `ORPHANED-CLASSES.md`
  items reported as a single still-not-fixed group)

### Does this close out `CSS-DEAD-RULES.md`?

**Yes — recommend archiving it.** Every concrete item in it is now
resolved:
- Its 2 confirmed-`DEAD` rules (`.engine-status`, `.omnibox-helper`) were
  deleted in TASK-2.2 (`f07ea57`), before this sweep.
- Its target file, `responsive.css`, was fully split and deleted in TASK-2.3
  (`d58b5ce`), before this sweep — the specific 512/11/5 tally it recorded
  no longer corresponds to any file that exists.
- Its one explicitly-deferred item, `.library-error` ("flag for a human
  look... rather than auto-delete"), is fixed as of this report.
- Its false-positive taxonomy (interpolated template classes, third-party
  `maplibregl-*` classes) remains accurate methodology — every current
  false positive the regenerated whole-directory script produces still
  falls into one of those two documented categories, re-verified by hand.

The doc's *methodology* section is still worth keeping as reference (it's
what this pass reused), but its *findings* are fully closed. Suggest moving
it to an archive location or adding a one-line "resolved 2026-08-24" banner
rather than deleting it outright, since the write-up on why coverage-based
detection failed here is reusable guidance for future CSS audits.

### Does this close out `ORPHANED-CLASSES.md`?

**No — partially resolved, not archivable.** Its higher-severity follow-ups
(TASK-1.4a/1.4b: `.region-wifi-confirm`, `DiagnosticsPanel` styling) shipped
already. Its 10 lower-severity "genuine unstyled elements" are still open
and still explicitly deferred to Phase 7 in the doc itself — confirmed still
true today (see the finding above). Leave this doc as-is; it accurately
describes current state and its own deferral is still valid.
