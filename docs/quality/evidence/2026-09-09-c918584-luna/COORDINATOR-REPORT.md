# Luna beta evidence — candidate `c918584`

Date: 2026-09-09 (America/New_York)
Target: https://ride.henning.rodeo
Build: `build-TfctsWXpff2fKS`
Candidate SHA: `c91858479c176119ba633580cfc0902c6863ba8c`

## Verdict

**HOLD — not ready for physical rider testing.** This is one immutable,
attested deployment, but black-box evidence found two independent beta blockers
and one high-confidence trust defect. No code was changed during discovery or
triage, so all findings remain tied to the candidate SHA above. Physical-device
evidence is explicitly not claimed.

## Automated gates

The required Quality run for this exact SHA was `34368327230`. Attempt 1 had a
runner/infrastructure timeout while installing the Playwright system package;
the app suites did not run. Attempt 2 reran only the failed jobs on the same
SHA and passed `verify`, `typecheck`, `lint`, `vitest`, `build`, `rider-
journeys`, `critical-e2e`, `pwa-smoke`, `pwa`, `real-router`, `road-lock`, and
`visual`. The separate exact-head Mobile Core run `34368327247` also passed.
Branch protection's nine required contexts are green on attempt 2. This is
reported with the infrastructure timeout rather than silently treating a
rerun as the first result.

## Mission coverage

All missions used fresh isolated browser sessions against the public URL, not
localhost or source inspection. Viewports are recorded in each worker report.

Worker reports: [Mission 1](mission-1-first-time/worker-report.md),
[Mission 2](mission-2-change-mind/worker-report.md),
[Mission 3](mission-3-adv-draw/worker-report.md),
[Mission 4](mission-4-phone/worker-report.md),
[Mission 5](mission-5-recovery/worker-report.md),
[Mission 6](mission-6-advisor/worker-report.md),
[Mission 7](mission-7-library-gpx/worker-report.md), and
[Mission 8](mission-8-free-ride/worker-report.md).

Representative captures are retained with the reports, including the
[Lancaster result](mission-2-change-mind/screenshots/issue-destination-result.png),
[New Hope phone result](mission-4-phone/screenshots/issue-001-step-1-route-ready-2.png),
[recording state](mission-8-free-ride/screenshots/08-recording-active.png),
[Advisor status](mission-6-advisor/screenshots/11-advisor-after-plan-change.png),
and [offline recovery](mission-5-recovery/screenshots/11-offline-reload.png).

| Mission | Viewport/device emulation | Coverage | Result |
|---|---|---|---|
| 1 First-time rider | Chromium 1440x900 | first launch, normal scenic plan, route details, Prepare Ride, weather | route/prepare worked; alternatives stuck; hourly control was confusing/unconfirmed |
| 2 Change my mind | Chromium 1366x768 | route alternatives, Quick/Twisty, Undo/Redo, duration, Adventure, toll/highway preferences | destination integrity blocker; long replanning states; comparison labels confusing |
| 3 ADV/drawing | Chromium 1440x900 | draw, undo drawing, shape-stop edit, map add/cancel, Adventure profile | drawing/cancel worked; bike-profile Undo failed twice |
| 4 Phone-first rider | Chromium iPhone 14 emulation, 390x844, 844x390, 667x375 | portrait/landscape, route edit, details, responsive containment | destination integrity blocker; short-landscape clipping; details result was an accessibility-target artifact pending pointer replay |
| 5 Recovery/PWA | Chromium 1366x768 | refresh, offline reload, online recovery, invalid input attempt | route recovered; request text and offline status were confusing; invalid input unassessed under host memory pressure |
| 6 Advisor | Chromium 1440x900 | Advisor prompt/retry, plan suggestion, details, weather, route change | timeout had clear retry; impossible transient `240% unpaved` status; surface terminology confusing |
| 7 Library/GPX | Chromium 1440x900 | save/open, synthetic GPX import/reload/delete, route details/export affordance | import/delete worked; save failure not reproduced by visible-button recheck; imported card/count mismatch remains |
| 8 Free Ride continuity | Chromium mobile 390x844 with emulated setup | recording, Free Ride entry/exit, constraints, suggestion/Head Home attempt | recording control-loss blocker; recovery reset constraints; GPS-dependent suggestion/Head Home not proven in denied browser |

The user-requested follow-up replay batch was interrupted by the Luna model
quota. Those sessions are recorded as environment/test limitations, not as
passes or failures. The coordinator rechecks above cover the most consequential
save and recording observations without changing the candidate.

## Consolidated triage

### BETA BLOCKER — silent wrong-place resolution

**Reproduced independently in Missions 2 and 4.** `Lancaster, PA` was shown
as the city request but resolved to `Lancaster Street` in Swatara Township near
Harrisburg (5.0 mi / 12 min). `New Hope, PA to Lambertville, NJ` resolved its
start to `New Hope Brethren in Christ` in Lower Paxton Township, roughly 120
miles from New Hope town (129.7 mi / 185 min). Both journeys selected the
visible place suggestion and received no mismatch warning. Explicit full-state
names recovered the route.

This violates the route-selection contract: a rider can commit to a materially
different trip while the heading still claims the requested town. The likely
smallest remediation is to carry the selected autocomplete place identity and
coordinates through intent submission, or require an explicit confirmation
when submit-time resolution differs from the selected place. Add a RED test at
that seam; do not paper over it with another provider or a broad geocoding
rewrite.

### BETA BLOCKER — GPS denial leaves recording map-only

**Reproduced by Mission 8 and the coordinator at 390x844.** Starting a
recording with geolocation denied closes the recording surface and leaves only
the map. There is no pause, finish, or recovery control. Reloading restores a
HUD, but a rider cannot operate the active session without the workaround.

This violates the recording continuity contract. The smallest remediation is a
denied/error transition that returns to the Record surface with the existing
permission explanation and retry/recovery controls, backed by a RED component
or browser test for the denied path. The successful-GPS path is not evidence
for this failure path.

### IMPORTANT — transient impossible Advisor status

Mission 6 displayed `Weighing 240% unpaved against a 100/100 curve score…`
before the completed answer corrected the value to 2%. A percentage over 100
is impossible and damages trust during route choice. Classify as a high-
confidence serious rider problem, not a cosmetic copy request. Add a bounded
format/denominator RED test or suppress the status until the route context is
valid. Existing working-state coverage did not catch this route-context case.

### Important/medium findings

- Alternatives remained in `Adding alternatives…` for 45–80+ seconds in
  Missions 1–3. Cancellation recovered the editor and no deterministic
  provider error was observed, so this is an important bounded-latency issue to
  replay with provider timing before changing code.
- Bike-profile Undo failed twice in Mission 3: Adventure remained active and
  Redo stayed disabled. This is a real medium-severity history defect, not a
  feature request, but it is below the two blockers for this qualification.
- Imported GPX cards were labeled `PLANNED` while the `Planned` counter stayed
  0 and `Imported` increased. This is a medium data-consistency issue.
- Mission 4's 667x375 landscape planner clipped lower controls. This is
  important responsive evidence and must be checked on the real iPhone; it is
  not a physical pass/fail from emulation.
- Refresh/offline recovery preserved the route but hid the original request and
  simultaneously showed `Ride restored` and `Route unavailable`. This is
  confusing recovery UX, not route loss.
- Route-card Details, hourly weather, and the first Save route observation
  included stale/hidden accessibility targets. The visible Save control was
  verified successfully by the coordinator; Details/hourly still need a valid
  pointer replay before filing as defects.

### Triage matrix

| Finding | Reproducible? | Disposition | Rider impact / contract | Existing coverage and smallest next step |
|---|---|---|---|---|
| Named town resolves to distant street/POI | Yes, independent Missions 2 and 4 | **Beta blocker** | Wrong trip can be committed while the heading still names the requested town; violates route-selection truth | No test preserves an accepted place identity through submit; add a RED autocomplete-coordinate/ID regression, then carry that identity or require mismatch confirmation |
| GPS denial leaves recording map-only | Yes, Mission 8 plus coordinator recheck | **Beta blocker** | Active recording has no pause/finish/retry controls; violates recording continuity and permission recovery | Success-path tests exist, denied path does not; add RED denied/error surface-recovery test and return to Record with retry |
| Advisor shows `240% unpaved` | Yes, one route-context refresh | **Important / S2** | Impossible intermediate fact damages route-trust decisions | Working-state format tests missed this denominator/context; add bounded-value RED coverage or suppress status until facts are valid |
| Alternatives loading for 45–80+ seconds | Repeated observation; provider timing not isolated | **Important, not yet blocker** | Rider cannot compare Best/Fastest/twisty confidently | Lifecycle tests cover completion but not slow-provider fallback; replay with controlled timing and verify bounded retry/fallback before code |
| Bike-profile Undo does not undo Adventure | Yes, twice in Mission 3 | **Important / medium** | Exposed Undo lies about rider intent; violates history contract | Generic history tests exist, no profile-specific assertion; add RED profile undo/redo test at the store seam |
| Imported card says PLANNED while Planned count is 0 | Yes, import/reload | **Medium / polish** | Library filter and card state disagree; undermines saved-ride trust | No imported-row/filter consistency assertion found; align card label and filter/count semantics, then add coverage |
| 667x375 landscape clips lower planner controls | Yes in emulation; physical unrun | **Medium / physical follow-up** | Short landscape can hide actions and recovery | Broader responsive coverage exists but not this shortest viewport; verify on iPhone and add a focused visual/mobile check if it survives |
| Refresh/offline hides request and says restored/unavailable together | Yes in Mission 5 | **Medium / confusing UX** | Route survives, but recovery state is contradictory | Route recovery tests cover persistence, not copy hierarchy; define one truthful state and add a regression |
| Details/hourly route control misroute | Not confirmed by valid pointer replay | **Test/environment issue** | Hidden accessibility target produced unrelated action; no product claim yet | Replay with visible-pointer semantics before filing; no code change now |
| Save route appeared ineffective | Not reproducible by visible-button recheck | **Test/environment issue** | Worker activated hidden/stale target; actual save showed toast and Planned 1 | No product defect; retain recheck as evidence and avoid changing save flow |

### Environment limitations and non-findings

- Browser geolocation was denied/unavailable. Free Ride suggestion → accept →
  Head Home, real GPS continuity, and permission recovery therefore remain
  unproven; no product defect is inferred from the missing signal.
- Invalid Atlantis/Moon submission was unassessed after host memory pressure.
- The second focused Luna replay batch could not run because the model quota was
  exhausted. No quota-interrupted result is represented as evidence of quality.
- No feature requests were promoted to defects; no architecture or UX wave was
  opened.

## Fixes and candidate identity

No product fixes were made. The confirmed blockers require RED evidence and a
new exact-head deployment before any physical evidence can be reused. The
candidate after triage is therefore still exactly
`c91858479c176119ba633580cfc0902c6863ba8c`.

## Physical gate

**NOT RUN.** The exact candidate checklist is
[PHYSICAL_IPHONE_BETA_CHECKLIST_2026-09-09.md](../../PHYSICAL_IPHONE_BETA_CHECKLIST_2026-09-09.md).
It covers installed PWA, portrait/landscape/short-landscape, safe areas,
touch targets, permission denial/recovery, foreground/background GPS, screen
lock, weak/no network, route recovery/reroute, Free Ride → suggestion → Head
Home while recording, rider constraints, daylight/glanceability,
accessibility, and interruption/resume. No step is marked passed.

## Recommended next action

Implement and RED-test the two blocker remediations (selected-place identity
preservation and recording permission-denial recovery), then deploy and
re-qualify a new exact SHA from scratch. Do not begin the physical checklist or
another architecture wave until that replacement candidate has fresh automated
and black-box evidence.
