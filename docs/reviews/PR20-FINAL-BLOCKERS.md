# PR #20 — final release blocker ledger

Reviewed SHA: `8a9f7e65eed6e04a6e04c416b7584e145e172869` (branch `feature/route-poster-atlas`)
Base: `main` @ `6b78d7e5c5d088c13d5db1d60013a265ef02bdbc`
Date: 2026-08-29

Four narrow read-only reviewers (core rider flows / mobile-PWA-visual-a11y / GPX-Atlas-data /
deployment-security-runtime) reviewed the frozen SHA. This file is the consolidated ledger only.
P3 findings are deferred by policy and are not recorded here.

CI on the frozen SHA: Quality workflow all green (lint, typecheck, vitest, build, critical-e2e,
pwa, real-router, road-lock, visual). **`WebKit and Chromium mobile QA` is RED** — 4 failures,
99 passed, 7 skipped.

Local gates re-run on the frozen SHA by the coordinator: `lint` PASS, `typecheck` PASS,
`vitest` PASS (255 files / 1564 tests), `git diff --check` clean.

---

## Ledger

### B1 — `.planner-sheet-handle` never renders on landscape phones (CI RED)
Claimed: **P0**. Reviewer B. Evidence: CI artifacts from run 33243513572.

`webkit-standard-landscape` (844x390) fails `mobile.layout.spec.ts:60` with a 120 s `locator.tap`
timeout on `getByRole('button', { name: 'Expand planner sheet' })`. The CI accessibility snapshot at
failure shows the desktop-style side-deck with **no expand/collapse handle in the DOM at all**.

`src/components/planner/workspace/ContextSheet.tsx:104-124` renders `.planner-sheet-handle`;
`src/app/styles/planner-deck.css:48` sets it `display:none`, re-enabled only inside
`@media (max-width: 760px)` (`planner-deck.css:166-183`). A *separate* breakpoint,
`@media (orientation: landscape) and (max-height: 520px)`
(`src/app/styles/switchback-v1.css:697-703`, `src/app/styles/design-system.css:270-286`), routes this
same 844x390 viewport into the fixed-height side-deck layout, which has no expand affordance of its
own. The two breakpoints disagree about what counts as "mobile": the width-only 760 px gate misses
phone-landscape entirely.

Failure scenario: rider holds an iPhone in landscape; the planner sheet cannot be expanded or
collapsed by any control.

### B2 — Ride instruction card occludes the recenter button on small phones (CI RED)
Claimed: **P0**. Reviewer B. Evidence: CI failure screenshot.

`webkit-small` fails `mobile.layout.spec.ts:169` via `expectInteractiveElementsUnclipped`
(`tests/e2e/mobile-qa/assertions.ts:102` -> `:39`) with
`"Recenter map on current location is obscured at its center"`.

`.ride-instruction` (`src/app/styles/ride-hud.css:381-391`, inside `@media (max-width:760px)`) is
bottom-anchored at `bottom:140px` with only `min-height:118px`, so it grows **upward, unbounded**, as
turn text wraps at narrow widths. `.ride-map-recenter` is independently anchored at a fixed
`bottom: max(266px, ...)` (`src/app/styles/ride-hud.css:293-299`, duplicated verbatim in
`src/app/styles/planner-shell.css:744-751`) that assumes the instruction card stays short.

Failure scenario: rider on a 320 px-wide phone with a long street name in the active turn card cannot
tap "Recenter map on current location" while navigating. Deterministic geometry, not timing.

### B3 — Layout suite reports scroll-fold overflow as clipping (CI RED)
Claimed by Reviewer B as "dock occlusion, element unidentified". **Two targeted repros disproved that**
— a different assertion, a different element, and ultimately a different kind of defect. The evidence
is recorded here in place of the original claim.

Repro: the full `mobile.layout.spec.ts` suite re-run on the `docker-stable` offload runner
(`scripts/qa/offload-mobile-qa.sh`, run `20260829T092625Z-ddaa8383f352`) against the frozen SHA.

Actual failure, `webkit-small` (320x568), `mobile.layout.spec.ts:49`:

```
Error: visible interactive elements must be unclipped and unobscured
+   "Update the route start to my current location is clipped by div",
    at expectInteractiveElementsUnclipped (tests/e2e/mobile-qa/assertions.ts:102)
```

So it is `expectInteractiveElementsUnclipped`, not `expectDockClearance`, and the element is a real
rider-facing control, not MapLibre attribution.

A second, sharper repro settled the cause. The assertion's message only said "clipped by div", which
was not enough to tell a horizontal overflow from a scroll fold, so the message was first widened to
name the offending edge and the overflow in pixels. Re-run, it reported:

```
"Update the route start to my current location is clipped by div.planner-scroll
 (overflows bottom by 20px)"
```

The overflow is **vertical**, into `div.planner-scroll` — the planner sheet's own scroll region. The
button is not clipped at all: it sits 20 px below the fold of a container the rider can scroll, and
`expectNoNestedScrollTrap` already proves that region reaches its extent.

This is a **test-contract defect**. `expectInteractiveElementsUnclipped`
(`tests/e2e/mobile-qa/assertions.ts:86-93`) treated any ancestor whose `overflow` matches
`hidden|clip|scroll|auto` as a clipping box and flagged an element whose rect left that box on any
edge. For a scroll container that is wrong by construction: content past the fold is reachable. The
existing `scrollOwner` guard above it only exempted elements whose *centre* was already out of view,
so anything straddling the fold was reported as clipped.

Failure scenario for the product: none. Failure scenario for the gate: any control that happens to
sit near the sheet's fold at a given viewport fails the layout suite, which is why this is red at
320x568 and not at 390x844.

Separately, and not the cause of this failure: `.ride-location-button`
(`src/components/planner/PlannerDeck.tsx:359-369`, `src/app/styles/ride-omnibox.css:266`) is a flex
row whose label carries the chosen start (`Starting from <label>`). It sets no `max-width`, and the
label `<span>` keeps its automatic `min-width`, so flex text cannot shrink below its content width.
With a long start label the button really would overflow horizontally and be clipped by the sheet —
a latent instance of the class of bug B3 was first thought to be. The fixture's short label never
triggered it. Fixed while here.

### B4 — The app's own corridor endpoint rate-limits the test suite (CI RED)
Claimed by Reviewer B as a 429 from the live public tile host `tiles.openfreemap.org`.
**The CI trace disproves that**, and the corrected finding is recorded here.

`webkit-standard` `tests/e2e/mobile-qa/core/ride.core.spec.ts:42` fails `expectNoConsoleErrors`
(`assertions.ts:361`) on `"Failed to load resource: the server responded with a status of 429"`.

Evidence: the Playwright trace attached to that CI failure
(`trace.zip` -> `0-trace.network`) contains exactly two external-looking requests, and the only
non-200 in the whole run is:

```
200 GET  https://tiles.openfreemap.org/styles/positron    (mocked fixture style — fine)
429 POST http://localhost:3112/api/ride-corridors          Too Many Requests
```

There is no tile-host 429 at all. The 429 is **Switchback's own** corridor-adviser endpoint
rejecting **Switchback's own** background client. `/api/ride-corridors` is deliberately capped at
6 requests/minute per client key (`src/app/api/ride-corridors/route.ts:13`) because each call costs a
geocode plus a model call. `installPlannerServices`
(`tests/e2e/helpers/planner-fixtures.ts:91`) fulfils every other service the planner touches —
`/api/health`, `/api/curvature`, `/api/map-features`, `/api/route-weather`,
`/api/pa-unpaved-roads`, `/api/gpx-library`, `/api/geocode` — but **not** `/api/ride-corridors`.

The suite therefore hits the real endpoint. The limiter keys on client IP, so every spec in the run
shares one budget: a handful of specs in, the budget is gone and every later plan earns a 429.
`refreshCorridorHints` already ignores the response (it only warms a cache), so nothing is
functionally broken — but WebKit logs a failed resource load as a console error where Chromium does
not (the asymmetry the suite documents at `assertions.ts:335-346`), which is why only the WebKit
project fails.

This is a test-infrastructure gap in code this PR ships, not an app defect.

### B5 — `.ride-map-recenter` positioning duplicated across two stylesheets
Claimed: **P2**. Reviewer B.

Identical `@media (max-width:760px)` rule with identical values in
`src/app/styles/ride-hud.css:292-299` and `src/app/styles/planner-shell.css:744-751`. Harmless today;
directly adjacent to B2, and a future one-sided edit silently reintroduces that class of bug.

### D1 — Public Atlas pages re-parse ~4 MB of JSON per request, uncached and unrate-limited
Claimed: **P1**. Reviewer D, corroborated by Reviewer C and by coordinator measurement.

`src/app/gpx-library/page.tsx` and `src/app/gpx-library/[routeId]/page.tsx` are
`export const dynamic = "force-dynamic"` server components with no auth and no rate limiting
(`src/proxy.ts` only does an HTTP->HTTPS host redirect; there is no global limiter).

Measured on the production host: `data/gpx-library/manifest.json` is 439 KB, `atlas.json` is 3.8 MB,
across 537 routes. Every request to `/gpx-library` reads and JSON-parses **both**, then re-validates
every entry (`readAtlasArt`, `src/lib/gpx/atlas.ts:138-149`). Every request to
`/gpx-library/[routeId]` re-reads the same 3.8 MB `atlas.json` to pull one route's art — and does the
whole load **twice**, because `generateMetadata` calls `loadRouteDetail` independently of the page
body (`src/app/gpx-library/[routeId]/page.tsx`).

The sibling API serving the same data *is* capped at 60 req/min
(`src/app/api/gpx-library/route.ts:9,16` via `withRateLimit`); these pages bypass it.

Failure scenario: a scraper enumerating the 537 public route IDs causes ~7.6 MB of JSON parsing per
request on a single-instance production box that also hosts GraphHopper — CPU/GC exhaustion, no
backpressure.

### D2 — Public route-detail API leaks host filesystem paths, contradicting its own contract
Claimed: **P2**. Reviewer D. **Independently confirmed by the coordinator.**

`src/app/api/gpx-library/handler.ts:115-119` builds the detail response as `{ ...route, story, poster }`
— spreading the entire stored record. The listing path is careful to allow-list
(`publicAtlasRoute`, lines 34-50) and the file's own doc comment (line 28) states that `sourceFile`
/`sources` "must not be visible to anonymous visitors."

Confirmed on disk: a stored route record's top-level keys include `sourceFiles`, `sourceContentSha256`,
`ingest`, `mapMatch`, `duplicateFamilyId`. Example real value:
`sourceFiles: ["rideplanner/output/gpx/imported-gpx-8a77bc9d-gaia_high_detail.gpx"]`.

Pre-existing at the base commit (`json(route)` unfiltered), but this PR rewrote this function
extensively and threaded the same fields through unchanged. Endpoint is public, rate-limited only.

### D3 — `SWITCHBACK_SESSION_SECRET` unset in production; identity/community surface is inert
Claimed: **P2 / ops config.** Reviewer D. **Confirmed by the coordinator** against the live host.

`src/lib/identity/passkey.ts:139` (`readIdentitySession`) returns `null` when the secret is under 32
chars, so `requireIdentity` (`src/app/api/community/context.ts:16-23`) fails closed to
"unauthenticated" — safe. But `src/lib/identity/passkey.ts:100` **throws** when *creating* a session,
so registration/login attempts 500.

Production config confirmed: `/etc/switchback/switchback.env` defines only `GOOGLE_MAPS_API_KEY`,
`YOU_API_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_REDIRECT_URI`, `SPOTIFY_SESSION_SECRET`,
`GRAPHHOPPER_URL`; `.env.local` (loaded by Next from the working directory) supplies the routing and
provider config. Neither defines `SWITCHBACK_SESSION_SECRET`. `SPOTIFY_SESSION_SECRET` is a different
variable and is referenced nowhere in `src/`.

Not touched by this PR (no diff under `src/lib/identity/`). This is a deployment-configuration item,
not a code defect.

### C1 — Import backup directories accumulate without pruning
Claimed: **P2**. Reviewer C.

`scripts/import-project-gpx.ts:396-409` performs a correct crash-safe atomic swap: write to
`.pending-<pid>-<ts>`, rename the live tree to `.previous-<ts>`, then rename staging into place, with
restore-on-failure. But `.previous-<ts>` is never pruned. Repeated `npm run gpx:import-projects` runs
grow unboundedly on the deployment host (the live `data/gpx-library/` is already 288 MB).
Gitignored, so it cannot leak into commits.

### C2 — `atlas:build` is not chained after `gpx:import-projects`
Claimed: **P2**. Reviewer C.

`npm run atlas:build` (`scripts/build-route-atlas.mjs`) must be run manually after
`npm run gpx:import-projects`; nothing in `package.json` chains them. An operator who runs only the
importer gets an Atlas where every card falls back to "Poster preview unavailable"
(`readAtlasArt` returns `{}`). Degrades gracefully, but the empty-state hint only appears when the
manifest is *also* missing — a stale/absent `atlas.json` is silent.

---

## Verified good (no action)

**Core rider flows (Reviewer A).** Every path that merges a second route into an in-progress ride
(`onReroute` `PlannerShell.tsx:1578`, actual-vs-planned replay `:988-993`) re-asserts `selectRoute()`
so an active ride HUD cannot be yanked out from under a rider by a late alternatives merge.
Reload/URL-to-surface sync is correct and cannot clobber restored ride state. `confirmRecordingDiscard`
centralises the unsaved-recording guard; no silent data-loss path found. `RouteComparison` was updated
in lockstep with the removal of the `routes[0]` selection fallback, so there is no blank-panel crash.
The `normalizedShare()` change to surface-mix facts matches the pre-existing convention in
`route-data-quality.ts`. New `rider-units.ts` and `ProviderHealthNotice.tsx` are correctly guarded.
Reviewer A filed **no P0 and no P1**.

**Clean-clone data contract (Reviewer C).** Empirically verified in an isolated `git archive` copy of
the frozen SHA with no `data/` directory: `npm run build` succeeds; `/gpx-library` returns 200 with an
honest empty state; `/api/gpx-library` returns a 503 error envelope; `/gpx-library/<id>` returns 404.
No build-time filesystem dependency (`force-dynamic`, no `generateStaticParams`, no top-level `fs`
reads). `summariseAtlas` has no divide-by-zero path. The multi-ride GPX split
(`src/lib/gpx/corpus-ingest.ts`) scales its break threshold to each file's own median point spacing,
floors sub-mile debris, and rejects catalogue-like files rather than emitting hundreds of near
duplicates. Split rides are correctly marked `unmatched` rather than inheriting the whole-file map-match
result. The import swap is crash-safe with rollback.

**Deployment / security (Reviewer D).** Production build of the frozen SHA compiles and type-checks
cleanly in isolation. Every routing endpoint fallback in the tree resolves to loopback
(`http://127.0.0.1:8989` at `src/app/api/health/route.ts:11`, `src/app/api/routes/route.ts:102`,
`src/app/api/road-matching/route.ts:10`, `src/app/api/free-ride/suggestions/route.ts:58`);
`VALHALLA_URL` has no fallback at all and is simply omitted when unset rather than defaulting to a
stale address. **No LAN literals anywhere in `src/`.** `/api/health` does real live probes with a 4 s
timeout and reports actual results. `.github/workflows/mobile-qa.yml` is `pull_request` (not
`pull_request_target`), `permissions: contents: read`, no secrets, pinned actions. The React Doctor
workflow was added and removed within this PR — net zero. Both new Atlas pages are plain server
components with no `"use client"` and no `NEXT_PUBLIC_` additions. Route IDs are validated
`/^[A-Za-z0-9._-]+$/` with a length cap before any filesystem access, in both the API handler and the
detail page — no path traversal. No new disk-write surface. `.env.local` is gitignored and untracked.

**Mobile / PWA (Reviewer B).** No service-worker or manifest changes in this diff. The only PWA test
change swaps a literal health body for the shared `CANONICAL_HEALTH_RESPONSE` fixture.

### One more finding, surfaced by the B1 fix

Scoping the landscape sheet assertion (B1) let `mobile.layout.spec.ts:49` run to completion on
`webkit-standard-landscape` for the first time — in CI it had always timed out at the drag-handle tap
on line 60, so everything after that line had never executed on that project. The rest of the test
then failed:

```
Error: 1-hour loop center should be reachable, but nothing is on top
```

`elementFromPoint` returned `null`, which happens for coordinates outside the visual viewport — so
the quick-intent row was not occluded, it simply starts below the fold of a 390 px-tall viewport. The
check measured button centres without first scrolling the row into view, so it was reporting scroll
position rather than tappability. Fixed by scrolling `.ride-quick-intents` into view before measuring,
which tests what the assertion was actually for.

`mobile.layout.spec.ts:164` (Free Ride escape) also fails on `webkit-standard-landscape` on the
offload runner, at 4.0 min against a 120 s test timeout. It is **not** a defect in this PR: the same
test passes in GitHub CI on both projects, and `webkit-small` needs 2.0 min for it on the offload
runner — already close to the timeout. The offload container is 2 CPU / 4 GiB and roughly five times
slower than the CI runner. GitHub CI is the authoritative gate for this test.

---

## Adjudication and resolution

A fresh reviewer adjudicated the ledger against the implicated code only (no new audit). Where a
targeted repro was required it was run on the `docker-stable` offload runner; the two findings whose
diagnosis the repro disproved (B3, B4) are rewritten above to match the evidence.

| Item | Verdict | Resolution |
|---|---|---|
| B1 | Test-scope defect, not an app defect | Fixed in the test |
| B2 | Confirmed blocker | Fixed |
| B3 | Confirmed blocker — but a test-contract defect, not an app defect (repro overturned the claim twice) | Fixed |
| B4 | Confirmed blocker (test-infra gap; diagnosis corrected) | Fixed |
| B5 | Deferrable, but folded into the B2 fix | Fixed |
| D1 | Confirmed blocker | Fixed |
| D2 | Confirmed blocker | Fixed |
| D3 | P3 / defer — deployment config, untouched by this PR | Deferred |
| C1 | P3 / defer — operator housekeeping | Deferred |
| C2 | P3 / defer — operator runbook | Deferred |

### What changed

**B1 — landscape sheet assertion** (`tests/e2e/mobile-qa/layout/mobile.layout.spec.ts`).
Not an app defect. `.planner-sheet-handle` is `display:none` by default and enabled only under
`@media (max-width: 760px)` (`planner-deck.css:48,168`); phone landscape (844x390) is routed by a
*different* breakpoint (`design-system.css:275`) to a fixed-height side deck whose `half` and `full`
detents render identically (`max-height: none`), and which ships the header's
Minimize/Expand pair as its state control instead. The test hard-coded the drag handle for every
project. It now asserts whichever affordance the layout actually ships — the handle round-trip on the
bottom-sheet projects, the Minimize/Expand round-trip on the side deck — so coverage is preserved
rather than skipped.

**B2 + B5 — instruction card vs recenter pill** (`planner-shell.css`, `ride-hud.css`).
The recenter pill's offset was defined three times across two stylesheets; it is now one token,
`--ride-recenter-bottom`, defined once per breakpoint on `:root`. `.ride-instruction` derives its
`max-height` from that same token, so the bottom-anchored card cannot grow up into the pill, and its
`h2`/`p` are line-clamped at the 760 px breakpoint exactly as the landscape rule already did. The two
offsets can no longer drift apart, which is what B5 warned about.

**B3 — scroll-fold false positive** (`tests/e2e/mobile-qa/assertions.ts`).
`expectInteractiveElementsUnclipped` no longer reports an overflow along an axis its ancestor can
actually scroll; genuine `hidden`/`clip` containment, and overflow on an axis the container cannot
scroll, are still caught. Its message now names the offending edge and the overflow in pixels — the
thin "clipped by div" wording is what sent two passes of this review to the wrong element.
Separately, `.ride-location-button` (`ride-omnibox.css`) gains `max-width: 100%` and its label span
gains `min-width: 0` plus ellipsis, closing the latent *horizontal* overflow that B3 was originally
believed to be.

**B4 — corridor endpoint** (`tests/e2e/helpers/planner-fixtures.ts`). `/api/ride-corridors` is now
fulfilled in `installPlannerServices` alongside every other service the planner calls. No app change:
the endpoint's 6/min cap is a deliberate cost control and the client already ignores the response.

**D1 — Atlas page cost** (`src/lib/gpx/catalog-cache.ts`, `atlas.ts`, both Atlas pages,
`api/gpx-library/handler.ts`, `src/lib/gpx/atlas-page-guard.ts`).
Two parts:
- A shared parsed-JSON cache keyed on each file's size + mtime, which also memoises the expensive
  per-route validation. The manifest/atlas parse now happens once per catalog regeneration instead of
  once per request, and a regenerated catalog is still picked up without a restart. The detail page
  additionally wraps its loader in React `cache()` so `generateMetadata` and the page body share one
  load instead of two.
- The same 60/min cap the sibling catalog API already applies, now applied to both pages; over budget
  they render a short "try again in a moment" notice instead of the full collection.

Both pages deliberately stay `force-dynamic`. Prerendering them would bake whatever generated data
happened to exist on the build machine into the deploy — the exact hidden dependency the deployment
contract has to avoid.

**D2 — detail payload** (`api/gpx-library/handler.ts`). The response is now built from an explicit
`PUBLIC_DETAIL_FIELDS` allow-list instead of spreading the stored record, so `sourceFiles`,
`sourceContentSha256`, `ingest` and `mapMatch` stay server-side and a field added to the stored record
cannot leak by default.

### Regression coverage added
- `tests/unit/gpx-catalog-cache.test.ts` — cache reuse, mtime invalidation, independent derivations,
  and that a missing file still propagates so callers fall back to the empty state.
- `tests/unit/gpx-catalog-api.test.ts` — the public detail payload keeps the rider-facing contract and
  drops every import-bookkeeping field, including a literal check that no host path survives.

### Deferred, with reasons
- **D3** `SWITCHBACK_SESSION_SECRET` is unset in production, so registration/login 500s and everything
  else behaves as logged-out. Zero diff under `src/lib/identity/` in this PR; it is a deployment
  configuration task, tracked in `docs/release/CURRENT-STATE.md`.
- **C1** `.previous-<ts>` import backups are never pruned. Gitignored, grows only on manual
  `gpx:import-projects` runs.
- **C2** `atlas:build` is not chained after `gpx:import-projects`. Degrades to
  "Poster preview unavailable" rather than breaking; an operator-runbook gap.
