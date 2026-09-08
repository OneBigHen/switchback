# Switchback pre-beta agentic rider audit — 2026-09-06

## 1. Executive verdict

**HOLD**

The exact candidate is deterministic-testable, but it is not beta-safe. The audit reproduced a wrong-region route from ordinary rider language, a 90-minute request presented as a ready 10-minute ride, an invisible mobile drawing escape path, and overlapping 390px ride-mode status layers. The public deployment additionally exposed contradictory recovery state, Gravel Goblin/planner disagreement, and a destructive route-details path; its deployed build SHA could not be proven, so production cannot be treated as the candidate.

There are no findings labelled formal `BLOCKER`, but the confirmed `HIGH` issues are sufficient to hold the first rider cohort. The passing critical, PWA, real-router, visual, unit, lint, typecheck, and build gates do not offset the failed full E2E matrix, failed Mobile QA orchestrator, failed memory-soak entry, or the rider-visible trust and mobile failures.

## 2. Exact tested candidate

- Audit branch: `qa/prebeta-agentic-audit`
- Repository SHA: `372995dfdcfd6e0ed2276bdbc9bb190f4514cf40`
- Candidate application SHA: `372995dfdcfd6e0ed2276bdbc9bb190f4514cf40`
- `origin/main` observed: `372995dfdcfd6e0ed2276bdbc9bb190f4514cf40`
- Candidate/main difference: none at freeze; `git rev-list --left-right --count 372995df...origin/main` returned `0 0`.
- Production deployed SHA: **unresolved**. `https://ride.henning.rodeo` exposed no commit/build header or page metadata that mapped it to GitHub. Production rendered the OpenFreeMap/OpenMapTiles map path, but that is not a build identity.
- Candidate freeze observed: `2026-09-06`; final evidence timestamp: `2026-09-06T14:52:02-04:00`.
- Node: `v24.15.0`.
- npm: `11.13.0` in the final shell; `npm ci` completed successfully.
- Playwright: `1.61.1`.
- Playwright browser downloads: Chromium `149.0.7827.55`, WebKit `26.5`.
- Interactive browser: `agent-browser 0.27.0`; isolated Chromium sessions. Physical device: none.
- Local candidate server: `http://127.0.0.1:3120`, fixture GraphHopper on `127.0.0.1:8998`, no commercial Advisor key.
- Public target: `https://ride.henning.rodeo`; `/api/health` returned HTTP 200 with app, identity, GraphHopper, and Valhalla healthy during the final probe.

### Freeze/preflight evidence

The required freeze commands were run before substantive testing:

```text
git fetch --all --prune                         exit 0
git switch qa/prebeta-agentic-audit             exit 0
git status --short                               clean at freeze
git rev-parse HEAD                               372995dfdcfd6e0ed2276bdbc9bb190f4514cf40
git rev-parse origin/main                        372995dfdcfd6e0ed2276bdbc9bb190f4514cf40
git log --oneline --decorate -15                 candidate starts at merged PR #67
```

The repository was clean at freeze. Test tooling later rewrote tracked generated screenshots and `next-env.d.ts`; those generated changes are being restored and are not application changes. No application source, test, baseline, deployment, or main branch was modified.

## 3. Automated gate matrix

Results below are exact local invocations against the candidate SHA. A pass means the command passed; it does not mean the human journey was good.

| Command | Exit | Result |
|---|---:|---|
| `npm ci` | 0 | 658 packages added; 1 low-severity npm advisory; deprecated `prebuild-install@7.1.3` warning. No audit fix run. |
| `npm run lint` | 0 | Pass. |
| `npm run typecheck` | 0 | Pass. |
| `npm test -- --reporter=dot` | 0 | Vitest: 325 test files / 2,070 tests passed / 0 skipped / 0 failed. IndexedDB connection-delete warnings appeared on stderr. |
| `npm run build` | 0 | Next.js `16.3.3` Turbopack production build; 537 manifest routes; 157 poster-art entries. |
| `npm run test:e2e:critical` — first attempt | 1 | 21/21 could not launch because Playwright browsers were not installed. This was an environment prerequisite failure, not summarized as a product failure. |
| `npx playwright install chromium webkit` | 0 | Installed the pinned browser binaries. |
| `npm run test:e2e:critical` — rerun | 0 | 21 passed across critical Chromium and critical WebKit. |
| `npm run test:e2e:pwa` | 0 | 2 passed: offline shell reload and saved-route IndexedDB persistence. |
| `npm run test:e2e:real-router` — detached-router attempt | 1 | 5/5 received route-service 503 because the helper router process died with the detached tool process. |
| `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router` — foreground fixture router | 0 | 5 passed in 37.4s. |
| `npm run test:e2e` | 1 | 96 total: 70 passed, 23 failed, 3 skipped; 58.1 minutes. Failures concentrated in desktop authenticated community setup, `prepare-layout.spec.ts` across four projects, Mobile Safari Advisor/planner flows, and narrow-landscape planner/recovery reachability. |
| `npm run test:e2e:mobile-qa` | 1 | Orchestrator report: 48/50 discovered tests in 5/5 files; WebKit core 17 passed, WebKit Free Ride 1 passed, WebKit ride 6 total with 1 failure, Chromium core 24 passed. WebKit failure: recording starts/updates/stops timed out. Real iOS is not inferred. |
| `npm run test:e2e:memory-soak` | 1 | Did not measure memory. Cycle 1/10 stopped after 300s waiting for stale selector `Loop ride`; current UI exposes `Loop`. |
| `npx playwright test --project=visual` | 0 | 60 passed without `--update-snapshots`. No baselines were changed. |

### Important automated failures

- The full E2E matrix is not green. It cannot be summarized as “all tests pass.”
- The Mobile QA orchestrator is not green. Its report explicitly says mobile responsive emulation and WebKit approximation failed; real iOS and installed PWA behavior were not run.
- The memory-soak command is unproven, not a pass: it failed before the first route-clear cycle due to a stale locator.
- The visual matrix passed locally, but this is a narrow screenshot contract. It did not catch the candidate's 390px draw toolbar occlusion or denied-GPS HUD overlap.
- A browser console warning appeared during otherwise passing journeys: `Map cannot fit within canvas with the given bounds, padding, and/or offset` at `src/components/planner/map-stage-navigation.ts`.

### Public runtime/performance probe

Final public probes:

- `/api/health`: HTTP 200; `ok: true`, `degraded: false`, GraphHopper and Valhalla healthy; `routeRunningJobs: 0`, `routeQueuedJobs: 0`.
- Public page vitals from `agent-browser vitals`: TTFB 93.3ms, FCP 1,220ms, LCP 2,912ms, CLS 0.04. This is one emulated browser sample, not a field-performance claim.
- Public page and manifest had no meaningful build/commit/SHA metadata.
- Public route planning visibly spent about 15–30 seconds with only `Cancel ride change` before route results. The candidate local replay showed the same lack of rider-readable phase progress.
- Current local candidate Node process RSS was approximately 579MB during the dev session; this is not a production memory benchmark.
- Public console/errors were empty at the final idle probe. Earlier journey sessions observed a MapLibre fit warning and a WebServer `ECONNRESET` during a cancelled/aborted flow.

## 4. Agent mission matrix

All eight exploratory workers used isolated browser contexts/profiles and received only their mission and rider goal before black-box exploration. They did not read source, tests, prior issues, or other reports before completing the mission. Source-informed diagnosis happened afterward.

| Mission | Outcome | Environment | Goal outcome / key observations |
|---|---|---|---|
| First-time rider | completed | Public app, isolated Chromium, desktop with responsive spot checks | Could find Plan and eventually route, but did not understand the silent wait, route choice rationale, or how to recover from “Too many route requests / Map region ends here.” “Near Austin” produced a Harrisburg/Pennsylvania route. |
| Indecisive rider | completed | Public app, isolated Chromium, desktop and phone edit state | Repeated route/destination/style edits. Undo/Redo mostly worked, but cancellation left new text with old route, and refresh/edit could restore a route with an empty request/history. |
| ADV/gravel rider | completed | Public app, isolated Chromium, desktop | Gravel/Adventure intent was difficult to trust. Repeated Plan route attempts could sit without feedback; explicit Gravel could revert to Scenic; Adventure + Gravel surfaced a profile mismatch despite the profile promising maintained gravel. |
| Phone-first rider | partial | Public app, 390x844 primary emulation; no physical iPhone | Found route controls and Prepare, but ride-mode status layers overlapped at 390px. A 20-minute request produced a 90-minute card/CTA in the public build. Reloading an imported route returned a generic planner/Route unavailable state. |
| Failure/recovery rider | completed | Public app, isolated Chromium, desktop plus offline/two-tab/reload emulation | Tested provider interruption, offline replan, reload, Undo/new edit/Redo, and two tabs. Two-tab conflict protection existed, but route, style, and CTA could disagree and newer replan work could be lost on reload. |
| Advisor / Gravel Goblin rider | completed | Public app, isolated Chromium, desktop and phone spot checks | Goblin disclosed important unknowns well, but it could claim an active route was absent, promise gravel then apply pavement, and leave populated controls after an out-of-coverage proposal. |
| Accessibility/interaction specialist | completed | Candidate/public Chromium, keyboard, 200% CSS zoom, reduced motion, desktop and 390px draw state | Reduced motion and zoom were present, but draw mode had no Escape exit or keyboard point-placement equivalent. Tab order was long and map-heavy with no efficient skip to the ride request. |
| Product stress / beta-breaker | completed | Public app, desktop, 390x844, resize, rapid action/reload/two-tab | Route Details could clear the active route and leave a blank ride; Draw controls could overlap/cancel through visible navigation; rapid route/resize interactions hid or changed available controls. |

### Journey coverage status

| Rider journey | Evidence status |
|---|---|
| Initial launch, Plan, destination, loop, Free Ride, alternatives, time targets, road character, surface/bike settings | Exercised in public black-box missions and candidate automated fixtures; time/surface semantics failed trust review. |
| Vias, route drawing, route sculpting, road locks, avoid areas | Automated/component coverage exists; drawing was manually exercised; mobile draw and keyboard recovery failed; road-lock/avoid-area human coverage was partial. |
| Undo/Redo, Cancel, Retry, route failure/recovery, reload recovery, two tabs | Exercised by indecisive/failure/stress missions; contradictory visible state and reload continuity are high risk. |
| Saved rides, recorded rides, GPX import/export, PWA | Deterministic coverage exists; WebKit recording failed; public phone import/reload continuity was not trustworthy. KML/KMZ was not independently human-replayed in this campaign. |
| Discover, Settings, Advisor, Prepare, ride transition | Exercised by public workers and browser suites; Advisor and Prepare continuity remain high risk. |
| Map layers, light/dark, desktop/tablet/phone/landscape, keyboard | Visual/mobile suites cover many states; human review found 390px draw/HUD overlap and long keyboard path. |

## 5. Beta blockers, ordered by rider impact

There were zero formal `BLOCKER` labels. The following `HIGH` findings are beta-blocking because they can route a rider somewhere unintended, start a materially different ride, trap a rider in an interaction mode, or make ride-mode recovery unreadable.

### HQ-001 / issue #69 — silent wrong-region origin

The candidate reproduced `90-minute scenic loop near Austin` as a Harrisburg-area ride without explaining that Austin was ignored. This is a direct failure of route-selection intent, not a minor parser edge case. Fix and add parser/waypoint/browser coverage before any rider cohort.

### HQ-002 / issue #70 — 90-minute request shown as a ready 10-minute ride

The candidate returned a 10-minute route for a 90-minute request, showed a normal Start CTA, and placed the explanation in a dismissible notice. The rider can commit to the wrong time envelope. Make large misses a first-class, non-ambiguous decision state.

### HQ-003 / issue #71 — route/intent/CTA divergence during recovery

The indecisive and failure/recovery missions independently found stale route labels, old geometry, new editor values, wrong style CTAs, and reload loss. The candidate's architecture has fencing and intent-only checkpoint decisions, but the rider-facing invariant is not proven. Fix the visible-state contract, not just the request race.

### HQ-004 / issue #72 — draw mode is trapped on 390px

On the exact candidate, the sketch toolbar box occupied y=770–824 while bottom navigation occupied y=768–836. A sighted rider cannot see the Finish/Cancel controls. PR #68 addresses part of this but is not in the candidate and must not be silently assumed merged.

### HQ-006 / issue #74 — ride HUD overlap at 390px

The exact candidate's denied-GPS ride preview overlaps `GPS fix required`, guidance state, map attribution, data quality, and telemetry. This is a safety-adjacent readability failure; physical-device testing remains required after the fix.

### HQ-005 / issue #73 — drawing has no keyboard/escape recovery

Draw is pointer-only, Escape leaves it active, and keyboard interaction cannot create a finishable sketch. This is an accessibility exclusion in a core editing capability.

### HQ-007 / issue #75 — Advisor is not trusted as an integrated product surface

The public app let Gravel Goblin promise exact gravel settings and apply pavement, report no active route while a route was active, and leave a failed out-of-coverage proposal looking populated. Do not expand Advisor beta exposure until the canonical planner handoff and current-state context are browser-proven.

### HQ-008 / issue #76 — unexplained route-calculation silence

The candidate and public app can spend 15–30 seconds showing little more than a disabled planner and `Cancel ride change`. This creates duplicate submissions, abandonment, and rate-limit pressure. It blocks a calm first-use experience even when routing eventually succeeds.

### HQ-009 / issue #77 — public Route Details appears destructive

The public build cleared the route twice when opening Twisty details. Local candidate replay did not reproduce this, so it is a confirmed public risk but not yet mapped to the candidate. Resolve deployed SHA/build identity before declaring the candidate safe.

## 6. High-impact UX problems

These are the moments where the software technically did something, but a normal rider would reasonably think it failed or misunderstood them:

- **The app goes quiet at the most important moment.** After Find ride options, the rider sees no clear phase (“reading”, “finding start”, “building options”) for a long wait. The eventual answer does not repair the anxiety caused by the silence.
- **The product repeats the rider's words without proving it used them.** `Planned “near Austin”` sits next to a Harrisburg map. The prompt transcript creates false confidence instead of showing the resolved start.
- **A warning is not a substitute for a decision.** A 10-minute route can remain startable under a 90-minute target. A dismissible toast is too weak for a commitment mismatch.
- **The route editor and route answer are two different stories.** Public recovery states showed one style in controls, another in the route card, and another in the Start CTA. Riders should never need to infer which object is authoritative.
- **Direct manipulation disappears.** Draw mode offers visible controls in the DOM but hides them behind navigation at the exact width where touch users need them.
- **Power features dominate before the basic mental model is stable.** Road locks, avoid areas, alternatives, profile mismatch, route quality, and Goblin are all individually useful, but the first-use journey does not always make “what is this route and why should I take it?” obvious.
- **Route comparison is not consistently safe.** A details action that clears a route on the public deployment makes a non-destructive inspection feel like a destructive command.

## 7. Cross-persona themes

1. **Canonical intent and visible answer can diverge.** First-time, indecisive, failure/recovery, phone-first, and Advisor riders encountered a prompt, editor, route card, or CTA that did not describe the same ride.
2. **Mobile layout is tested as geometry but not as a human instrument.** Phone-first, stress, accessibility, and candidate local replay all found overlays, hidden controls, or excessive map/UI competition even while many layout assertions and visual snapshots passed.
3. **Trust depends on uncertainty being adjacent to commitment.** Duration miss, map coverage, surface evidence, profile mismatch, Advisor proposals, and route-details behavior all put important caveats away from the action that commits the rider.
4. **Recovery is treated as an implementation state rather than a rider decision.** Abort, retry, cancel, reload, offline, undo, redo, and two-tab conflict each exist, but the product does not always explain “what you asked for”, “what route is still usable”, and “what will Start do now”.
5. **The app is more powerful than its first-use hierarchy.** The motorcycle-specific map instrument is promising, but a beta rider has to learn internal vocabulary (`route intent`, `road locks`, `sculpt`, `time-shaped`, `profile mismatch`) before the basic loop becomes calm.

## 8. Confirmed correctness bugs

| ID | Reproduction | Actual correctness failure | Smallest useful regression |
|---|---|---|---|
| HQ-001 | Natural-language loop with `near Austin` and no saved location | Explicit place is ignored; Harrisburg fallback is routed | Vitest parse + resolver test and browser map/start assertion |
| HQ-002 | Candidate 90-minute loop on sparse fixture | 10-minute route remains a normal startable answer | Timebox fixture browser contract with out-of-coverage acceptance state |
| HQ-003 | Cancel/offline/reload/undo during replan | Route, intent, and CTA can refer to different revisions | Delayed/failing API Playwright state-invariant matrix |
| HQ-004 | Candidate Draw at 390x844 | Sketch controls are geometrically behind bottom navigation | Viewport containment test for toolbar/nav/attribution |
| HQ-005 | Candidate Draw + Escape/keyboard | Escape does not cancel; no keyboard sketch path | Keyboard Playwright/component contract |
| HQ-006 | Candidate ride preview at 390x844 with GPS denied | Status/recovery/attribution/telemetry overlap | Denied-GPS geometry assertions at 320/390/430 |
| HQ-007 | Public Goblin proposal and current-state turns | Applied proposal and assistant statements disagree with planner | Mocked advisor-to-planner handoff E2E |
| HQ-009 | Public route options → Details | Details clears active route; candidate local replay did not | Route identity remains stable across Details open/back/start |

The source review also found a real maintainability correctness risk: `BikeProfilePicker.tsx` and `PlannerDeck.tsx` carry separate bike/routing-profile mismatch predicates. The visible picker treats Adventure as compatible with `adventure`/`scenic`, while the deck-side logic has a different branch. This was recorded as a MEDIUM trust/product finding, not promoted to a separate issue because the public behavior is intertwined with surface-evidence and provider data.

## 9. Human-centered design findings

| Dimension | Assessment |
|---|---|
| Hierarchy | The map-first identity is strong, but the planner can show too many competing status/control layers. The primary action is not always obvious during loading or failure. |
| Clarity | Rider language is best when it says “Start ride”, “Find ride options”, or “Map region ends here”. Internal-style labels and silent fallbacks reduce clarity. |
| Discoverability | Plan, Loop, Draw, Free Ride, and route options are findable after exploration. Details, sculpting, preserved roads, and Advisor behavior require more product knowledge than a first-time rider has. |
| Restraint | The visual system is restrained and rugged, but dense route evidence and action docks can become a dashboard instead of a decision surface. |
| Feedback | Loading/failure feedback is the largest weakness: long unexplained waits and contradictory post-failure states make technically completed work feel broken. |
| Continuity | The exact candidate preserves authored intent in its checkpoint design, but the rider-facing answer/intent continuity is not yet reliable enough. Public reload and two-tab flows were especially confusing. |
| Direct manipulation | Drawing and map shaping are the right interaction model, but hidden/overlapping controls and pointer-only input break the promise. |
| Recovery | Retry/Cancel/Undo/Redo exist and sometimes work well. Their boundaries are not consistently legible when a request is active or has failed. |
| Mobile ergonomics | 390px is not safe: draw actions can be covered, ride status can overlap, landscape flows have reachability failures, and the tab path is long. |
| Confidence/trust | Surface/access/closure uncertainty is often honestly disclosed. That strength is undermined when the route region, duration, profile, or Advisor proposal is wrong or unexplained. |

The motorcycle-specific identity should remain map-first and rugged. The priority is not to remove power; it is to make power appear after the rider understands the current ride and can recover from a wrong choice.

## 10. Accessibility findings

- **High:** route drawing has no Escape cancellation and no keyboard-equivalent point-placement/finish path. This is a material exclusion, not a checklist gap.
- **High:** the 390px draw toolbar is present to accessibility inspection but visually occluded. DOM presence is not usable touch accessibility.
- **Medium:** keyboard focus reaches the map, zoom/location, attribution, layers, navigation, and many controls before the ride request. No efficient skip path was found.
- **Medium:** long labels and dense route evidence increase scanning cost on narrow widths; icon-only breakpoints need explicit accessible names and visual discoverability checks.
- **Positive:** reduced-motion media behavior was observed; focus styles and many semantic names/status roles exist; 200% CSS zoom did not immediately collapse the main desktop surface.
- **Not proven:** screen-reader output quality on VoiceOver/NVDA, real assistive-technology map alternatives, and physical touch target feel.

## 11. Performance/reliability findings

- Initial public LCP was 2.912s in one emulated sample, with FCP 1.220s and CLS 0.04. This is acceptable as a probe, not a release guarantee.
- Route request perceived latency was 15–30 seconds in repeated public/local observations without useful phase feedback. This is a serious perceived-quality problem even when provider health is green.
- The candidate's memory-soak command never reached a measurement cycle because the selector was stale. No memory-growth claim is made.
- Repeated route edits and aborted requests triggered stale/contradictory UI observations in human missions; the source contains `AbortController`, request gates, and identity fencing, but end-to-end visible-state invariants are missing.
- The full E2E matrix had mobile Safari detachment/timeouts, narrow-landscape reachability failures, and Prepare waits. These need triage into stale test contracts versus product failures before using that matrix as a release signal.
- Console/network noise included a map-fit warning and an aborted request/server `ECONNRESET` during cancellation. Aborts may be expected, but the UI must distinguish an intentional abort from a failed route.
- Public `/api/health` was healthy at the final probe. Health is not route-quality proof and does not prove mobile, GPS, Advisor, or recovery behavior.

## 12. Branch/PR disposition

### Candidate/main state

At freeze, `HEAD`, `origin/main`, and the audit branch were identical at `372995d`. No rebase or mid-campaign candidate change was performed.

### Unexpected branch/PR change after handoff

PR #68 appeared after the audit handoff began:

- Title: `fix(planner): keep route sketch controls in the usable map viewport`
- Branch: `fix/sketch-usable-map-viewport`
- Head: `83aa99176a86ef69607a23a27bf166ca8f1616ca`
- Base: `main@372995dfdcfd6e0ed2276bdbc9bb190f4514cf40`
- State: open, non-draft, unmerged
- Changes: 5 files, +67/-6
- Behavior: reserves mobile sketch clearance, moves the toolbar above navigation, improves short-landscape placement, and renames Done to Plan route.
- Disposition: **active future work / potentially important beta fix; not part of the candidate; not merged or cherry-picked.** It addresses HQ-004's geometry symptom but not HQ-005's keyboard/Escape contract or HQ-003/HQ-002.

### PR #66

- Title: `feat(rides): geometry-first route library intelligence`
- Branch/head: `feat/recorded-rides-route-intelligence@2cf482d06614959c18253cabc7a7df4767a675c5`
- State: open, draft, unmerged; intentionally excluded.
- Behavior: route-geometry-aware Rides/GPX library cards, region/search intelligence, and saved-route Gravel Goblin library search.
- Hosted run evidence for the PR merge ref `1814a4ee7ac51c967036ca1d9ab1d9673492a9cc`: verify, rider journeys, PWA, real-router, and Mobile Core were successful; the visual job failed with 4 Rides-screen snapshot mismatches (mobile, phone landscape, tablet portrait, tablet landscape) and 56 visual tests passed.
- Disposition: **keep out of beta.** It is not required to plan/choose/prepare/start a core ride, and its visual gate is red. It may improve future library value, but merging it now would add surface area and unresolved visual drift while the core rider contract is not stable.

### Branch inventory

Old branch names were not treated as authority and were not blindly tested.

| Branch | Classification |
|---|---|
| `origin/main`, `origin/qa/prebeta-agentic-audit`, `origin/qa/luna-human-exploratory` | merged/historical; ancestor of candidate/main |
| `origin/feat/recorded-rides-route-intelligence` | active future work; PR #66; explicitly excluded |
| `origin/fix/sketch-usable-map-viewport` | active future work; PR #68; explicitly excluded |
| `origin/docs/ai-advisor-design` | active future design/docs; not beta baseline |
| `origin/docs/astra-full-refactor-spec` | future design/spec evidence; not beta baseline |
| `origin/fix/mobile-prepare-contracts` | unmerged potential beta fix; owner attention required before assuming Prepare is complete |
| `origin/fix/rider-glanceability-audit` | unmerged potential beta fix; owner attention required before assuming ride HUD is complete |
| `origin/fix/v2-ux-followups` | unmerged future follow-up; not tested as candidate |
| `origin/chore/v2-visual-probe` | unmerged test/probe work; not candidate |
| `origin/ux/v2-phase-2-plan-composer`, `phase-3-map-geometry`, `phase-4-route-decision` | accumulated unmerged implementation history; superseded/needs owner disposition, not tested |

The user-described closed/superseded PR #57 and Astra proposal #62 were not reopened. PRs #64/#65/#67 are represented in the candidate history.

## 13. Created GitHub issues

All issues use the exploratory-QA format and include the exact candidate SHA, tested environment, repro, expected/actual behavior, rider impact, evidence, candidate regression, and solution direction.

| Issue | Severity | Root problem |
|---:|---|---|
| [#69](https://github.com/OneBigHen/switchback/issues/69) | HIGH | Natural-language loop origin silently falls back to Harrisburg. |
| [#70](https://github.com/OneBigHen/switchback/issues/70) | HIGH | Gross timebox mismatch remains a normal startable route. |
| [#71](https://github.com/OneBigHen/switchback/issues/71) | HIGH | Replan/recovery leaves intent, selected route, and CTA out of sync. |
| [#72](https://github.com/OneBigHen/switchback/issues/72) | HIGH | Mobile draw toolbar is covered by bottom navigation. |
| [#73](https://github.com/OneBigHen/switchback/issues/73) | HIGH | Drawing lacks keyboard/Escape recovery. |
| [#74](https://github.com/OneBigHen/switchback/issues/74) | HIGH | Narrow ride HUD status layers overlap. |
| [#75](https://github.com/OneBigHen/switchback/issues/75) | HIGH | Gravel Goblin proposal/current-state context is not grounded end-to-end. |
| [#76](https://github.com/OneBigHen/switchback/issues/76) | HIGH | Route calculation gives unexplained silence. |
| [#77](https://github.com/OneBigHen/switchback/issues/77) | HIGH | Public Route Details can clear the active route; candidate mapping unresolved. |

Existing open [#40](https://github.com/OneBigHen/switchback/issues/40) already covers preserving a drawn sketch and recovering on routing failure, so no duplicate issue was created. HQ-004 is separate: it is the candidate's mobile action occlusion; #40 is the route-failure preservation contract.

## 14. Recommended solution order

Prioritized by rider harm and trust, not implementation convenience:

1. **Data loss, dangerous, or misleading:** fix HQ-001 wrong-region routing, HQ-002 gross duration mismatch, HQ-003 recovery/CTA divergence, and HQ-006 denied-GPS ride HUD overlap.
2. **Cannot complete a core ride:** fix HQ-004 mobile draw reachability, verify/resolve HQ-009 production route-details destruction, and close the existing #40 sketch-failure preservation gap.
3. **State/recovery correctness:** make intent-vs-answer state explicit across cancellation, offline, reload, Undo/Redo, and two-tab conflict. Add browser state invariants, not only store unit tests.
4. **Confusing primary journey:** replace silent loading with phase feedback (HQ-008), expose the resolved start/destination, and make route comparison explain why one route is selected.
5. **Mobile usability:** test/fix 320/390/430 portrait and 844x390 landscape for draw, Prepare, route details, map controls, keyboard, and ride HUD together. Do not rely on isolated visual snapshots.
6. **Trust/explanation:** make timebox, surface evidence, profile compatibility, coverage, and route uncertainty adjacent to Start. Never imply legal access, passability, or gravel quality from incomplete data.
7. **Accessibility:** implement drawing cancellation and a keyboard-equivalent editing path (HQ-005), shorten the focus path, and perform real screen-reader review.
8. **Performance:** add lifecycle progress, measure route latency and memory after the memory-soak selector is repaired, and classify expected aborts versus failures.
9. **Polish:** only after the above, refine dense copy, route-card hierarchy, alternative comparison, spacing, and the Rides visual gate.

## 15. Recommended deterministic regressions

| Finding | Layer | Smallest durable contract |
|---|---|---|
| HQ-001 | Vitest + Playwright | Parse `near X` as loop origin; never submit a silent region default when a place was named. |
| HQ-002 | Vitest + Playwright | Fixture route outside time tolerance must show actual vs requested duration and require explicit acceptance/adjustment before Start. |
| HQ-003 | Playwright | Delay/fail/abort/reload/undo-new-change sequences keep route identity, intent summary, selected style, and Start label aligned. |
| HQ-004 | Playwright geometry + visual | Every sketch action stays within the usable viewport above nav/safe area at 320, 390, 430, and short landscape. |
| HQ-005 | Vitest/component + Playwright | Escape cancels Draw; keyboard users have a documented route-sketch creation/edit alternative; status announces cancellation. |
| HQ-006 | Playwright geometry + visual | Denied-GPS 390px ride state has no overlap between guidance, recovery, telemetry, attribution, and action controls. |
| HQ-007 | Playwright advisor contract | Mocked valid Advisor proposal is reflected in planner intent/profile/surface; current-state question uses canonical intent; out-of-coverage proposal is non-startable. |
| HQ-008 | Playwright | Delayed route lifecycle exposes phase status and prevents duplicate submission while retaining a clear Cancel action. |
| HQ-009 | Playwright | Opening/closing Details cannot clear route identity or change Start behavior. |
| Bike-profile mismatch | Vitest/component | One shared compatibility predicate drives picker and dock; Adventure/Gravel semantics agree. |
| Memory soak | Playwright/runner | Repair the `Loop ride` selector first, then run 10 full edit/clear cycles with heap and listener-growth thresholds. |
| Visual | Visual + human review | Investigate the PR #66 four-screen Rides mismatch; do not rebaseline without intended-behavior approval. |

## 16. Remaining physical-human gates

Agents and browser emulation cannot prove:

- real iPhone safe-area, keyboard, viewport, orientation, and installed-PWA behavior;
- physical GPS permission timing, background/resume, heading drift, and location denial recovery;
- degraded cellular, captive portal, intermittent tunnel, and real airplane-mode recovery;
- sunlight readability, gloves, vibration, one-handed reach, and motorcycle-mounted glanceability;
- actual road quality, surface, legal/public access, closures, seasonal passability, or whether a selected route is genuinely enjoyable to ride;
- real route usefulness and rider confidence without an agent's extra time to inspect DOM/state;
- VoiceOver/NVDA output and screen-reader map alternatives;
- production build identity or whether public behavior corresponds to this candidate;
- production PWA installation/update lifecycle and cache migration;
- real provider latency/traffic/incident evidence over the rider's route.

The first 3–5 riders must be treated as supervised beta participants with a known route corpus and an explicit “do not trust surface/access/closure claims without ground evidence” instruction.

## 17. Beta recommendation

### MUST fix before the first 3–5 riders

- HQ-001 / #69 wrong-region natural-language origin fallback.
- HQ-002 / #70 startable gross timebox mismatch.
- HQ-003 / #71 route/intent/CTA divergence through cancel, failure, reload, and offline recovery.
- HQ-004 / #72 mobile draw toolbar occlusion, plus the existing #40 sketch-failure preservation path.
- HQ-006 / #74 390px ride HUD overlap and GPS recovery readability.
- Resolve HQ-009 / #77 by proving the deployed SHA and either fixing production or proving the public deployment is not the candidate.
- Re-run the full core plan → choose → edit → prepare → save → reload → ride journey on the exact fixed candidate. Do not accept a green focused suite as a substitute.

### SHOULD fix before expanding beyond the first riders

- HQ-005 / #73 keyboard/Escape drawing accessibility.
- HQ-007 / #75 Advisor grounding and proposal handoff.
- HQ-008 / #76 route-calculation progress and status announcements.
- Repair and execute the memory-soak command; triage the 23 full-E2E failures and the WebKit recording failure.
- Complete the 320/390/430/landscape/tablet browser matrix and a real iPhone/PWA drill.

### Can safely wait

- #66 geometry-first Rides/library intelligence and its red visual gate.
- Non-core library copy/poster/route-card polish.
- Deeper route-character explanation, optional Advisor niceties, and broad roadmap/Wave 2 work.
- Cosmetic spacing and terminology refinements that do not affect a rider's route choice, recovery, accessibility, or trust.

## Session conclusion

- Total deduplicated findings: 16 meaningful findings across 9 high-priority root problems, plus medium/polish observations.
- BLOCKER: 0 formal labels.
- HIGH: 9 root findings/issues; 8 mapped to candidate or public behavior, 1 public-only pending build mapping.
- MEDIUM: multiple product/trust/accessibility observations, including route alternative scarcity, Adventure/Gravel profile mismatch, route approximation wording, long keyboard traversal, and imported-route reload continuity.
- POLISH: grouped hierarchy/copy/density notes only; no individual polish issues created.
- GitHub issues created: #69–#77.
- Existing issue reused: #40.
- Application fixes made: none.
- PRs merged: none.
- Deployment performed: none.
- Final recommendation: **HOLD** until the MUST-fix list and exact candidate rerun are complete.
