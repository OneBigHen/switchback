# Release gates

These are proposed objective gates for the refactor. Current completion status is in [ASTRA-STATE](ASTRA-STATE.md). This document does not claim they have passed. Resolve any conflict with older advisory-gate wording in wave 0 and update the actual CI/branch-protection policy; prose cannot make a gate mandatory by itself.

## 1. Exact candidate and reproducibility

Record source SHA, branch/PR, clean or explicitly enumerated dirty state, Node/browser versions, renderer/capabilities, provider graph/policy versions, test configuration, build identifier, and evidence paths. Never include credentials. A production release must expose an attested source/build ID so browser evidence can be tied to what was deployed.

Use a separate checkout/build/data root for verification. No build, dependency cleanup, or test fixture may overwrite the active production `.next` or production databases. Tests must label mocked services, real handlers, real providers, and physical-device evidence separately.

## 2. Code and contract gates

Required on each implementation candidate:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:critical
```

Use the repository's required Node version (currently `>=24`) and pinned dependencies. The audit's focused run used Node 22.21.0 and a locally available Chrome executable; it is diagnostic evidence, not the prescribed release environment.

Zero unexplained failing/skipped critical tests. Tests that fail on stale accessible names must be repaired to assert the actual product contract; they cannot be counted as successful coverage. No `.only`, broad failure suppression, fabricated provider health, or screenshot refresh as a substitute for fixing a defect.

Mandatory contract tests cover intent-wide undo; revision-safe primary/alternatives/AI results; duplicate Apply; controller abort and provider queue cancellation; full constraint propagation; atomic recovery; client-to-real-handler AI null/absent context; Home resolution; unknown evidence; import original/derivative boundaries; migration and rollback.

## 3. Critical browser workflows

Chromium and WebKit must each complete the core plan→choose→edit→prepare→save→reload→ride flow. At least one flow uses real route handlers/providers rather than interception. Additional deterministic cases:

1. Denied geolocation → explicit start → destination and 90-minute loop.
2. Route selection remains stable while alternatives arrive; selected route and map agree.
3. Add/remove/reorder/drag stop; change surface/highway/time; undo/redo restores all fields.
4. New drawing without endpoints; loop, messy stroke, double-back, crossing, extend, replace, undo, clear, cancel, failed routing with sketch retained.
5. Multiple avoid areas: create, select earlier area, edit, move, remove, undo, reload; endpoint conflict.
6. Keep/avoid directed road span; reroute respects it or explains a conflict.
7. Delay/fail/empty/malformed routing response; rapid edits; cancel; network drop; stale alternatives cannot repaint.
8. AI proposal→preview→Apply→undo; route changed while model responds; twelve rider-intent cases and no-key controls.
9. Free Ride→suggestion→guided segment→Free Ride→Head Home, one recording/session and persistent constraints.
10. GPS denied/lost/recovered; heading unknown; sustained off-route; remaining stops; track-only mode.
11. GPX/KML/KMZ import/cancel/error/limit cases; save/export/reimport; source/segment/privacy fidelity.
12. Refresh and Back/Forward during planning/Free Ride; offline reload and route-specific fallback; no unintended activity start.

Store trace, screenshot, request/result summaries, and exact test outcome. A helper failing before the intended assertion leaves that behavior unverified.

## 4. Visual and accessibility gate

Required sizes: **320×568, 390×844, 430×932, 768×1024, 1440×900, 2560×1080, 844×390**. Add 1024×768 tablet landscape and 667×375 short landscape before broad release. Test safe areas and keyboard-open phone state separately.

At each primary size review idle, choosing, selected, editing, loading, failure, and active riding. Capture drawing, AI, import, preparation, and offline states at phone and desktop minimum. No clipped primary action, inaccessible carousel option, invisible selection, overlapping labels that prevent comparison, or critical route hidden under an automatically opened panel.

Require actual human visual review of complete screens in addition to image regression. WCAG 2.2 AA target: 4.5:1 ordinary text, 3:1 large text/meaningful graphics, semantic names, focus order/return, keyboard equivalents for map actions, reduced motion, 200% text without loss of task completion. Product hit areas: ≥44px planning and ≥56px primary riding actions. Verify composited contrast against both light/dark basemaps, particularly Free Ride.

Screen-reader review must cover status announcements, selected route, error recovery, stops/constraints, and AI proposal changes. No essential meaning is encoded only by color, animation, hover, or geographic dragging.

## 5. Routing quality and truth gate

Use a versioned PA/NJ real-router corpus including urban departure, rural backroads, river crossings, parallel roads, unpaved segments, private/motorcycle-excluded roads, one-way restrictions, a loop, an out-of-coverage request, and conflicting exclusions/kept roads. Record graph and policy versions.

Every route satisfies hard eligibility and active exclusions or is explicitly rejected. No fabricated connecting lines. Alternatives must meet the declared diversity threshold and role envelope; unavailable diversity means fewer choices. Time deltas compare the fastest eligible candidate under the same constraints. A duration miss is labeled and offers correction.

Surface, difficulty, access, POI, weather, traffic, and daylight claims carry relevant source/coverage/freshness. A lack of mapped gravel does not imply pavement. A failed/empty search does not prove no stops exist. AI never supplies a safety fact or selects Home by guesswork.

At least two experienced motorcycle riders review the corpus's recommended routes and explanations; record disagreement and supporting evidence. A curve score alone cannot certify enjoyable, suitable, or safe riding.

## 6. Performance and resource budgets

The following are initial targets, not audit measurements. Wave 0 records a reproducible device/network baseline; change a target only with measured evidence and a documented decision, never after a failing run merely to pass it.

| Operation | Target and method |
|---|---|
| Ordinary control feedback | p95 ≤100ms from input to visible response on representative phone |
| Drawing/dragging | p95 frame interval ≤33ms during a 10-second stroke; no network call per pointer move |
| Route selection | Highlight matching geometry ≤100ms when geometry is already loaded |
| Initial usable workspace | ≤3s warm navigation on defined mobile test network; measure cold separately |
| Primary local route | p95 ≤5s over at least 30 representative corpus requests; cold/outlier budgets separately recorded |
| Cancellation | Visible settled state ≤250ms; no late mutation after any canceled lifecycle |
| AI | Immediate working state; bounded timeout; route-only target p95 ≤8s and tool-assisted ≤20s; core remains interactive |
| Resource retention | One map; no leaked GPS/audio/timer/worker after repeated activity switches; 20-cycle post-GC retained heap growth ≤10% after warmup |
| Large import | UI remains cancellable, with no main-thread task >200ms caused by parsing at supported limit |

Measure production builds for performance. The webpack audit startup delay, shared host load, and software-rendered browser are not product latency benchmarks. A resource-count unit test does not establish a two-hour physical riding plateau.

## 7. Persistence, offline, privacy, and migration

Draft and active session survive reload with mode, constraints, selected route revision, remaining stops, and recording identity. Corrupt/partial/quota failures preserve the last valid checkpoint and explain what is missing. Existing user libraries, original GPX, identity credentials, and offline data remain intact after upgrade and rollback. Cross-tab changes cannot silently overwrite a ride.

Prove offline shell reload separately from saved-route display, map coverage, track following, and offline rerouting. Test wrong-region, missing-tile, stale, corrupt, and interrupted downloads. No generic readiness badge may imply coverage outside the installed graph.

Sharing must preserve exact privacy-trim semantics and derivative attribution. Audit data should contain only deliberate fixture/public route coordinates; redact credentials and unrelated location/session data before publication. New AI context fields require explicit data-minimization review.

## 8. Physical and deployment gates

A real iPhone Safari/PWA drill is required before advertising dependable ride execution: precise location permissions, motion/GPS loss, background/foreground, wake/speech, glare/touch, session resume, airplane mode, and battery/resource behavior. Conduct riding tests with a safe observer/recording setup; do not ask a moving rider to perform complex editing. Browser simulation cannot close this gate.

Deploy only an approved exact build with reversible rollback. Check app/provider health, edge access, actual public route planning/selection, and artifact identity. A health endpoint returning 200 is not public workflow proof. There must be **zero known S1 defects in the advertised release scope**, no untriaged critical test failures, and no hidden dependency on an optional provider.

If a feature is deferred, remove its promise/entry point or state the honest supported capability. Do not label the full refactor complete while essential planning/recovery/riding gates remain open.
