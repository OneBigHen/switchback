# Phase 1 targeted review — dispositions and evidence

Written 2026-09-13 in response to the targeted reviewer repair (two P1 findings).
Everything below is verifiable from the run branch commits and the files in this
folder.

## P1-1 — Recon critical e2e was not in the verification log

**Disposition: executed; evidence committed.**

`tests/e2e/critical/recon.spec.ts` is named in `criticalMainMatch`
(playwright.config.ts) and has been run repeatedly during the phase, but the
runner's verification log showed only the four package gate commands. To close
the gap durably, the gate was executed against the phase commit and the full
runner output is committed here:

- `verification-recon-e2e.txt` — passing run: **3 passed** (explorer opens,
  route preview loads into the HUD, focused deep-link resolves the same ride),
  including the no-console-error, no-horizontal-overflow, and pitched-camera
  assertions.
- `verification-recon-e2e.flake-run1.txt` — the immediately preceding run is
  preserved for transparency: tests 1–2 passed and test 3 failed with
  `page.goto: Target page, context or browser has been closed` — a browser
  process crash in the headless environment, not an application failure. The
  re-run above passed 3/3 with no code change in between.

## P1-2 — src/lib/gpx/corpus-ingest.ts appears far outside the phase paths

**Disposition: justified, not reverted — this change IS the operator-mandated
R5 fix; reversion would reintroduce the defect.**

Facts:

1. The operator review remediation (R5) ordered: "reuse the existing
   computation" instead of copying the private `elevationMetrics` logic from
   `src/lib/gpx/corpus-ingest.ts`. The implementation does exactly that: the
   one shared computation now lives in `sumElevationChanges`
   (`src/lib/client/geo-math.ts`), and corpus-ingest's private `elevationMetrics`
   delegates to it, so GPX ingest and Recon cannot drift apart.
2. The **semantic** footprint in corpus-ingest.ts is 21 changed lines
   (commit `3fbde885`: one import line plus the `elevationMetrics` body
   delegating to the shared helper; no other logic touched). Verify with
   `git show 3fbde885 -- src/lib/gpx/corpus-ingest.ts`.
3. The remaining ~500 diff lines against `origin/main` are the control plane's
   own biome normalization (commit `218e478c` — semicolon/width style, 502
   lines in this file), not phase logic.
4. Behavior neutrality is proven by the full unit suite: 408 files, 2677
   passed (1 skipped), identical before and after the change — corpus-ingest's
   own coverage included.
5. Separability: exactly two files outside `src/features/recon/**` carry
   phase-linked changes — `src/lib/client/geo-math.ts` (additive: the shared
   helper) and `src/lib/gpx/corpus-ingest.ts` (the 21-line delegation). If
   Recon were ever dropped, reverting those two files plus the feature root
   restores `origin/main` exactly.

If the owner still prefers a zero-diff GPX module, the alternative is a
two-file revert (`corpus-ingest.ts` back to its private loop) — but that
leaves two implementations of the same elevation convention in the codebase
and reintroduces the R5 fork the operator ordered fixed. The justification
path above was chosen deliberately.
