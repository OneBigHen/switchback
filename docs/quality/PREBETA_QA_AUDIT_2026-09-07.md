# Switchback pre-beta adversarial QA audit — 2026-09-07

## Verdict

**HOLD — not ready for adversarial beta QA certification.**

The audited product journeys did not expose a reproducible P0 or P1 product
defect after the visual shaping pass. The branch is nevertheless not release
ready: the full unit/E2E matrix is not green, the memory-soak contract is
retired/stale, Mobile Core has a WebKit actionability/teardown failure, and the
real-router gate was not run. Those are release-certification blockers even
where the evidence points to a test or harness defect rather than rider-facing
logic.

## Exact identity

| Item | Value |
| --- | --- |
| Mode | `QA_AUDIT` |
| Branch | `fix/prebeta-hold-20260906` |
| PR | [OneBigHen/switchback#79](https://github.com/OneBigHen/switchback/pull/79) |
| Audited base HEAD | `eb8764c4aeacb52924ce4ca1abf1562907c2a1da` |
| Base verification | `git rev-parse HEAD` matched the expected SHA before the shaping/report commit |
| Scope | PR #79 plus the explicitly authorized visual shaping pass |

The report records the immutable audited base SHA. The branch may advance with
the report/evidence commit; that does not change the tested base identity.

## Required release gates

Results below are from fresh runs on the exact audited checkout, with the
final CSS-only token correction reverified by lint, typecheck, build, visual,
and geometry checks.

| Gate | Result | Evidence / classification |
| --- | --- | --- |
| `npm ci` | PASS | 652 packages installed; npm reported one low-severity advisory. |
| `npm run lint` | PASS | Clean final run. |
| `npm run typecheck` | PASS | Clean final run. |
| `npm test -- --reporter=dot` | **FAIL** | 331/332 files and 2093/2094 tests passed. The only failure expects retired V1 `Clear route`; current V2 exposes `Undo ride change`, `Redo ride change`, `Replan`, `Offline pack`, and route-specific Start controls. See [planner-deck.test.tsx](../../tests/components/planner-deck.test.tsx). |
| `npm run build` | PASS | Next.js build and route atlas completed; 537 manifest routes verified. |
| `npm run test:e2e:critical` | PASS | 21 passed. |
| Advisor desktop | PASS | `npx playwright test tests/e2e/advisor.spec.ts --project=desktop-chromium`: 8 passed. |
| Critical WebKit smoke | PASS | `npx playwright test --project=critical-webkit-smoke`: 2 passed. |
| Road lock | PASS | `npx playwright test --project=road-lock`: 1 passed. Current V2 combobox contract exercised. |
| `npm run test:e2e:pwa` | **PASS, but not deterministic evidence** | Latest exact run: 2 passed. An earlier exact run failed in the saved-route helper while the valid recovered route was visible (`Offline saved route`, `Edit route`, `Start`); a focused repeat later passed twice. Re-run until the helper/state transition is deterministic. |
| `npm run test:e2e` | **FAIL** | 100 passed, 22 failed, 6 skipped / 128. Failures cluster around retired V1 labels/flows, mobile auto-replan behavior, and old planner/map-layer selectors; see test-defect section. |
| CI visual command | PASS | Exact workflow command `npx playwright test --project=visual`: 60/60 passed with no update flag. |
| Existing memory/soak test | **FAIL** | `npm run test:e2e:memory-soak` stops on old `Loop ride` label. Existing `artifacts/quality/memory-soak.json` is stale green evidence generated 2026-08-11 and is not accepted as current proof. |
| Mobile Core exact workflow | **FAIL** | Workflow command produced 47 passed / 1 failed / 16m. WebKit `.tap()` on Finish recording timed out after the app had visibly saved/exited; ordinary `.click()` reproduced the intended success. See [WebKit error context](evidence/2026-09-07-prebeta/mobile-core-webkit-error-context.md). |
| Real-router protected gate | **UNPROVEN** | The pinned GraphHopper setup and `npm run test:e2e:real-router` were not run in this audit. |
| Remote PR CI | **INCOMPLETE** | PR #79 was open/draft; GitGuardian passed and CodeRabbit reported review skipped for draft. No complete remote Quality result was available as audit evidence. |

## Adversarial rider-flow result

The following were exercised through the rendered application and current V2
controls, not by force-clicking or weakening selectors:

- **Location/geocoding:** qualified `Austin, Texas` from Pennsylvania, bare
  `Austin`, nearby ambiguous names, city/state, country-qualified locations,
  denied/unavailable GPS, saved/approximate origins, origin changes followed by
  destination search. Explicit locations were not overwritten by a Harrisburg
  fallback.
- **Concurrent planning:** two genuinely overlapping requests were submitted;
  the newer request remained authoritative, stale success/error responses did
  not paint, loading settled, and route/details/Start/current intent stayed
  aligned.
- **Route identity/recovery:** edit, failed replan, Cancel, Undo, Redo, offline
  pack, failed provider response, and alternative arrival were exercised. A
  prior route could remain recovery context, but Start/Offline were fenced when
  unapplied changes made it stale. Cancel restored committed intent and route
  identity together.
- **Drawing:** valid draw, out-of-coverage, 500/503, network failure, Retry,
  Clear, Cancel, Escape, redraw, first-ever sketch, and sketch over an existing
  route were exercised. The raw stroke survived failure, Retry reused it, no
  failure produced a success toast, and Cancel/Escape did not leave hidden
  sketch waypoints.
- **Advisor:** opening did not spend a model turn; route-only deterministic
  questions, keyboard operation, capability absence, offline honesty, and stale
  response fencing were exercised. Narrow Advisor overflow was corrected in the
  shaping pass.
- **Road locks:** Prefer, Must use, matched edge IDs, failed matching, remove,
  Must-to-Prefer conversion, replan, wider retry, and previous-route recovery
  were exercised. The exact V2 lock payload reached routing.
- **Route Details:** repeated open/close preserved selected route ID, geometry,
  Start availability, and URL/navigation state.
- **Persistence/PWA/GPX:** save/reload, Library, PWA route recovery, offline
  pack, storage/provider-unavailable paths, recovery checkpoint, and imported
  GPX were exercised. PWA automation still needs deterministic helper behavior.

No reproducible P0 or P1 rider-facing defect was found in these journeys.

## Visual quality and shaping pass

Visual quality is included in this assessment as a first-class beta gate. The
pass addressed concrete geometry and legibility failures found at 320 px,
390 px, 430 px, and short landscape 568x320 px:

1. Added a browser geometry contract in
   [short-landscape-geometry.spec.ts](../../tests/e2e/short-landscape-geometry.spec.ts)
   covering planner, Ride, Draw, Advisor, recording HUD, native controls,
   attribution, and actual pointer hit targets.
2. Gave short-landscape planner and Draw states explicit, non-overlapping
   lanes; moved attribution, map navigation, Layers, sketch tools, and banners
   out of each other's hit regions.
3. Made map-adjacent Ride, Free Ride, recording, Advisor, and error surfaces
   opaque and visually separated so map labels cannot bleed through text or
   controls.
4. Increased/normalized primary touch targets and separated Ride telemetry from
   recording controls; the geometry contract enforces at least 44 px where the
   product contract requires it.
5. Constrained narrow Advisor content with `minmax(0, 1fr)` and minimum-width
   rules so the panel does not create horizontal overflow.
6. Updated visual snapshots only for the intentional shaping changes. The final
   CI-style visual run passed without snapshot-update flags.

### Screenshot evidence

The committed evidence set is indexed in
[evidence/2026-09-07-prebeta/README.md](evidence/2026-09-07-prebeta/README.md).

| Before / failure evidence | Shaped/current evidence |
| --- | --- |
| [Short-landscape recovery before shaping](evidence/2026-09-07-prebeta/before-p1-short-landscape-recovery.png) | [Idle 568x320 after shaping](evidence/2026-09-07-prebeta/shaped-idle-568x320.png) |
| [Short-landscape map-control overlap before shaping](evidence/2026-09-07-prebeta/before-p2-short-landscape-overlap.png) | [Draw 568x320 with explicit lanes](evidence/2026-09-07-prebeta/shaped-draw-568x320.png) |
| [Mobile Safari retired minimize contract](evidence/2026-09-07-prebeta/test-contract-mobile-safari-minimize.png) | [Advisor 568x320 contained](evidence/2026-09-07-prebeta/shaped-advisor-568x320.png) |
| — | [Ride mobile shaped surface](evidence/2026-09-07-prebeta/shaped-ride-mobile.png) |
| — | [Recording HUD evidence](evidence/2026-09-07-prebeta/shaped-recording-hud.png) |

Focused geometry results:

```text
npx playwright test tests/e2e/short-landscape-geometry.spec.ts --project=mobile-safari
7 passed, 1 intentional skip

npx playwright test tests/e2e/short-landscape-geometry.spec.ts --project=mobile-landscape-narrow
8 passed
```

### Structured UX recommendations

These recommendations are deliberately separated from confirmed P0/P1
defects. They are the next improvement queue for making the beta feel designed
and trustworthy across windows/states:

| Priority | Recommendation | Acceptance evidence |
| --- | --- | --- |
| Release-blocking | Rewrite all retired V1 tests around the current V2 accessible/product contract before using them as release gates. Keep semantic labels and route identity assertions; do not merely substitute weaker selectors. | Full unit and E2E suites pass while asserting current rider outcomes. |
| Release-blocking | Repair Mobile Core's WebKit Finish-recording interaction/teardown race. The test must prove the saved Library outcome with a deterministic action, not just wait longer. | Exact Mobile Core workflow passes repeatedly in WebKit and Chromium. |
| Release-blocking | Run and retain the pinned real-router gate, then add a fresh memory-soak artifact generated by the current V2 UI. | Real-router and soak results are green from the audited SHA and attached to the PR. |
| High | Establish one state-to-surface matrix for Planner, Edit, Draw, Ride, Offline, Advisor, and Route Details. Every surface should expose the same committed intent, displayed route identity, and actionable CTA vocabulary. | Matrix-driven browser tests cover route success, stale intent, provider failure, Cancel, and recovery. |
| High | Give route-result and Route Details windows a stronger visual hierarchy: route identity first, route role/added minutes second, safety/lock evidence third, secondary metadata last. Keep destructive/reset commands visually and spatially distinct from Start. | Named-size screenshots show a single primary action and no competing reset action in the same hit lane. |
| High | Continue the responsive pass on every route/editor modal, not only the shaped states. Review short landscape as a first-class composition, with fixed lanes for map controls, attribution, sheet, and action dock. | 320/390/430 portrait plus 568x320 landscape geometry checks are green for every modal/state. |
| Medium | Preserve the current opaque map-adjacent surface treatment as a tokenized pattern. Avoid one-off alpha/offset fixes that reintroduce map-label bleed or create a second viewport-inset authority. | CSS audit finds one inset/token authority and no overlapping grid areas or hidden pointer interceptors. |
| Medium | Make Advisor capability/offline/empty/loading states visually distinct but compact, with keyboard focus retained through open, ask, error, and close. | Keyboard-only test and screenshots cover each capability state without model spend on open. |
| Medium | Add a visual review checkpoint for sunlight-like contrast, long route names, provider failure copy, and localization-length expansion before beta expansion. | Named-size visual review records pass/fail screenshots and does not rely on snapshot diffs alone. |

## P0 issues

None reproduced.

## P1 issues

None reproduced as current rider-facing product defects. The branch is still
**HOLD** because the failed/unproven release gates above prevent a defensible
beta certification.

## P2 issues / remaining product-quality work

No additional P2 behavior defect was isolated during the final shaping run.
The structured UX recommendations above remain real quality work, especially
the cross-window state matrix and full responsive review; the shaping pass
covers the observed high-risk windows but is not a claim that every product
window is finished.

## Test defects and stale contracts

These are tracked separately from product defects so they are not “fixed” by
changing expected rider behavior:

1. `tests/components/planner-deck.test.tsx` asserts V1 `Clear route`; current
   V2 has different accessible commands and a route-specific reset flow.
2. `tests/e2e/prepare-layout.spec.ts` expects `Show route details`; current V2
   renders `Details for <route>`.
3. Advisor mobile/landscape tests manually wait for a Replan after a current V2
   debounced auto-replan; the observed state showed `Profile mismatch`, current
   route controls, and a valid Start state.
4. Planner main tests wait for V1 `Minimize planner`/`Collapse...` controls that
   are not the current V2 mobile sheet contract.
5. Planner loop tests expect the retired `Open map layers` path rather than the
   current progressive-disclosure controls.
6. Mobile Core WebKit's `.tap()` on Finish recording timed out after the save and
   exit had occurred; a normal semantic `.click()` succeeded. The test needs a
   deterministic state/action contract, not a forced click or arbitrary sleep.
7. Memory soak stops on the retired `Loop ride` label. Its checked-in JSON is
   stale green output from 2026-08-11 and must not be used as current evidence.
8. PWA's saved-route helper failed once while a valid recovered route was
   visible, then passed on exact rerun and focused repeat. The helper should
   wait on the current recovery contract and assert the rider outcome.
9. The requested session source
   `docs/quality/sessions/2026-09-06-prebeta-agentic-audit.md` was absent from
   this checkout; the remediation plan was present. This is a documentation
   completeness issue, not evidence that the missing session passed.

## Reproduction commands and evidence

The following commands reproduce the release blockers or their focused
contracts:

```bash
npm test -- --reporter=dot
npm run test:e2e
npm run test:e2e:memory-soak
MOBILE_QA_EXPECTED_PROJECTS=webkit-standard,chromium-standard \
  npx playwright test --config=playwright.mobile.config.ts \
  --project=webkit-standard --project=chromium-standard \
  tests/e2e/mobile-qa/core
npx playwright test --project=visual
npx playwright test tests/e2e/short-landscape-geometry.spec.ts \
  --project=mobile-landscape-narrow
```

The audit captured screenshots, videos, and Playwright traces for the original
short-landscape overlap/recovery and stale-selector failures. Representative
screenshots and the Mobile Core error context are committed under the evidence
directory. The raw `.zip` traces and `.webm` recordings remain in the QA
workspace rather than being committed: they are large browser artifacts and
may contain request/session metadata. They can be attached to PR #79 through
the project’s artifact storage if a reviewer needs the full replay.

## Physical-only gates — UNPROVEN

Automation cannot certify these and they remain explicitly open:

- real iPhone safe-area and keyboard behavior
- installed PWA behavior on a physical iPhone
- real GPS and background/foreground transitions
- degraded cellular connectivity
- mounted motorcycle use
- sunlight readability
- gloves/vibration interaction
- actual road/access/surface truth
- real screen-reader output
- production deployment SHA identity

## Audit handoff

No merge to `main` was performed. The visual shaping sources, intentional
visual baselines, report, and representative evidence are being shared on the
existing PR #79 branch for review. The software verdict remains **HOLD** until
the release-blocking gates and stale contracts are resolved and rerun from a
known SHA.
