# TEST & RELEASE CONTRACT — Switchback V2.1

Use the repository’s existing test and CI surface. Do not replace it with a V2.1-specific framework.

## Fast checks
```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## PR/behavior gates
```bash
npm run qa:pr
npm run test:e2e
npm run test:e2e:critical
npm run test:e2e:real-router
npm run test:e2e:pwa
npm run test:e2e:mobile-qa:prepare
npm run test:e2e:mobile-qa:expanded
```

Also run visual/road-lock commands exactly as repository workflows define them.

Observed protected-main required contexts at handoff base:
- typecheck
- lint
- vitest
- build
- critical-e2e
- pwa
- road-lock
- real-router
- visual

Routine CI may expose compatibility aliases. Do not remove those as part of V2.1.

## Test strategy by change type

### Geometry changes
Add assertions before changing layout when regression risk is real:
- panel/nav overlap;
- sheet containment;
- route CTA visibility;
- 44px controls;
- 16px iOS input;
- telemetry on-canvas;
- modal footer reachable.

### State/composition changes
Assert semantics:
- `aria-expanded`/`aria-pressed`/`aria-current`;
- primary action name;
- warning present when fixture requires it;
- correct callback/source ID;
- modal focus/escape;
- map/workspace remains available.

### Visual changes
Run focused Playwright state first, then broader matrix at wave milestone.

## Deterministic visual fixture coverage expected by completion

Planning:
- idle 320/390/430;
- options;
- draw toolbar;
- loading;
- provider error;
- alternatives;
- selected/prepare;
- route detail;
- route edit;
- offline modal.

Destinations:
- Rides populated with saved/recorded/trip/imported items;
- Rides management;
- import;
- no-results/empty;
- Discover populated/loading/error/no-results;
- Settings light/dark;
- Advanced;
- region downloads.

Ride:
- Record idle/active/paused where fixture permits;
- Free Ride idle/suggestion;
- Ride live/preview;
- off-route recovery;
- track-only;
- GPS uncertain;
- arrival if deterministic.

Global:
- 844×390 nav containment;
- tablet portrait/landscape;
- 1440×900 desktop;
- dark representative states.

## Snapshot integrity protocol

Never run broad `--update-snapshots` as a first response.

For each intended baseline update:
1. run the exact screen/state;
2. save expected/actual/diff;
3. confirm viewport/browser/project;
4. await `document.fonts.ready`;
5. confirm computed bundled Oswald/Inter families;
6. confirm fixture clock/map/data are deterministic;
7. inspect the image, especially geometry and spacing;
8. update only the intended baseline files;
9. keep diff thresholds and masks unchanged;
10. list changed baselines in commit body/state report.

A browser/runner/font change is an investigation trigger, not permission to rebaseline.

## Wave gates

### W1
Focused Plan semantics/visuals after each meaningful commit; `npm run qa:pr` before W2.

### W2
Focused destination tests/visuals; no need for full expensive Deep QA if W1/W2 code has not touched route-runtime behavior beyond presentation.

### W3
Focused Ride/Free Ride tests in Chromium and WebKit; `npm run qa:pr` before W4.

### W4
Full responsive/dark/a11y/performance review and exact-head release evidence.

## Exact-head rule

When release proof starts, record:
```bash
git rev-parse HEAD
```
Every required status/evidence must correspond to that SHA. Any substantive fix creates a new candidate and invalidates old exact-head evidence.

## Release blockers

Block release for:
- rider-facing broken path;
- route/storage/import/source-ID semantic regression;
- accessibility/reachability failure;
- clipped critical UI;
- off-route/GPS/recording safety ambiguity;
- unexplained visual diff;
- meaningful required CI failure;
- obvious new map/sheet/list interaction jank;
- deployment mismatch if/when release proceeds.

Do not block merely because a V1 screenshot/selector no longer matches accepted V2.1 presentation.

## PR state

PR #41 remains draft throughout implementation and hardening. The implementation agent must not merge or mark it ready. Final readiness/merge is a separate human/release decision after exact-head proof.