# W4 — HARDENING: Responsive, Dark, A11y, Performance & Release Proof

## Outcome
Turn good primary screenshots into a finished product across all critical states and viewports, then produce exact-head release evidence.

## 1. Responsive sweep

Inspect every primary screen/state at relevant sizes:
- 320×700
- 390×844
- 430×932
- 844×390
- 768×1024
- 1024×768
- 1440×900
- 1920×1080 where useful

Classify defects:
- clipping;
- overlap;
- unreachable controls;
- giant empty space;
- unreadable truncation;
- map-control collision;
- bad detent;
- safe-area failure;
- iOS input zoom risk;
- stretched-phone desktop composition.

Fix at the owning component/style, not by broad global override.

## 2. Dark sweep

Inspect:
- Plan idle;
- route alternatives/prepare;
- Rides;
- Discover;
- Settings;
- Advanced;
- errors/warnings;
- Record/Free Ride/Ride.

Check:
- surface aliases;
- muted text contrast;
- borders;
- Ember small-text contrast;
- Signal focus/link contrast;
- map control compatibility.

## 3. Accessibility

Keyboard/focus pass:
- nav;
- planner omnibox/modes/options;
- alternatives;
- Rides row/manage/import;
- Discover search/cards;
- Settings/Advanced;
- modals/overlays.

Verify:
- 44px hit targets;
- focus visible;
- visual order matches tab order;
- `aria-current`, `aria-pressed`, `aria-expanded` correct;
- icon buttons named;
- modal focus trap/Escape retained;
- selected states not color-only;
- map errors/warnings have text equivalents.

## 4. Reduced motion

Set `prefers-reduced-motion: reduce` and verify all states remain understandable. Remove decorative transitions rather than invent alternate animations.

## 5. Content stress

Use deterministic long/missing content:
- very long route name;
- long bike name;
- 100+ mile route;
- 3h+ duration;
- warning;
- missing community distance/duration;
- long tag/description;
- narrow 320px phone.

No microtext or hidden critical content.

## 6. Performance review

### Dependency/build
- compare `package.json`/lockfile for new heavy dependencies;
- compare production build output with base/reference evidence where available;
- remove accidental new library if current CSS/React can do the job.

### Runtime behavior
Inspect Plan sheet, route selection, destination switching, list scrolling and Ride HUD on mobile/WebKit.

Blocker examples:
- map remount on destination change;
- sheet animation visibly janks;
- list scrolling stutters from expensive per-card rendering;
- Ride telemetry update causes map/chrome stutter;
- large blur/filter repaints continuously.

Do not build a new benchmark framework unless a real regression requires instrumentation.

## 7. Visual contact-sheet review

Capture grouped screenshots:
- planning;
- destinations;
- ride;
- dark;
- responsive.

Ask for every image:
- primary task obvious?
- one dominant CTA?
- map/content bigger than chrome?
- first useful content early?
- consistent 4px rhythm?
- Ember restrained?
- warnings semantic?
- metrics aligned?
- empty space intentional?
- same product as adjacent state?
- Ride calmer than planning?

## 8. Snapshot rebaseline

Only accepted screenshots become baselines.

For each group:
1. prove bundled fonts loaded;
2. inspect expected/actual/diff;
3. confirm deterministic fixture/viewport/browser;
4. update only intended files;
5. keep thresholds/masks unchanged;
6. record files/reason in `STATE.md` or commit body.

## 9. Adversarial review

Review branch specifically for:
- duplicate state/store;
- PlannerShell behavior drift;
- Free Ride treated as PlanMode;
- Record made a destination;
- Rides source-ID bypass;
- fabricated route/community metadata;
- hidden GPS/off-route/recording state;
- <44px controls / <16px phone inputs;
- modal focus regression;
- responsive clipping;
- new jank/heavy dependencies;
- snapshot laundering.

Severity:
- P0 safety/data/architecture/release blocker;
- P1 major UX/responsive blocker;
- P2 quality issue;
- P3 polish.

Resolve all P0/P1 and reasonable P2 findings before release proof.

## 10. Exact-head proof

Freeze candidate:
```bash
git status --short
git rev-parse HEAD
```

Then run:
```bash
npm run qa:pr
npm run test:e2e
npm run test:e2e:critical
npm run test:e2e:real-router
npm run test:e2e:pwa
npm run test:e2e:mobile-qa:prepare
npm run test:e2e:mobile-qa:expanded
npm run build
```
Run required visual/road-lock workflow commands exactly as the repo defines them.

All required CI evidence must target the exact candidate SHA. If a substantive fix lands, restart exact-head proof.

## 11. Final STATE entry

Record:
- exact head SHA;
- all commands/results;
- CI workflow/run IDs;
- screenshots reviewed;
- snapshot files intentionally changed;
- performance observations;
- adversarial review outcome;
- deferred P2/P3 issues and reason.

Keep PR #41 draft. Do not merge or mark ready. Release/merge is the next human-controlled boundary.