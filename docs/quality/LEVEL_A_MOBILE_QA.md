# Level A mobile QA

Level A is the routine, reproducible Linux gate for mobile layout and mobile
interaction. It is a browser-emulation gate: WebKit with the iPhone 14 device
profile is the primary signal and Chromium with the Pixel 5 profile is a
comparison signal. It does not claim that an iPhone ran the build.

## Run the gate

Install the two browser binaries once on a new runner, then run the core gate:

```bash
npx playwright install chromium webkit
npm run test:e2e:mobile-qa
```

### Capped docker-stable offload

When local I/O or browser resources are constrained, the reusable offload
runner snapshots only the approved source paths into an isolated, capped
Playwright container on `docker-stable` (CT109). It never uses production
containers, networks, volumes, or host ports:

```bash
scripts/qa/offload-mobile-qa.sh sync
scripts/qa/offload-mobile-qa.sh run <run-id> -- 'npx playwright test --config=playwright.mobile.config.ts --project=webkit-standard --list'
```

The `sync` command prints the retained remote scratch path and writes unique
evidence under `artifacts/mobile-qa/offload/<run-id>/`. A successful `--list`
or unit/typecheck/lint baseline is preparation evidence only; it does not
claim that browser tests are green or that a real iPhone ran the build.
The container is capped at 2 CPUs, 4 GiB RAM, and `--memory-swap=4g`
(therefore no additional container swap), with a 1 GiB shared-memory mount.
The offload preflight requires at least 6 GiB available host memory and 6 GiB
free in `/var/tmp`. This reserve addresses the observed 3,221,266,432-byte
WebKit local-approximation peak/OOM under the former 3 GiB cap; it is not real
iOS-device evidence.
The `run` form accepts only a locally recorded successful run with its exact
ownership token and source-manifest hash; it cannot attach to arbitrary scratch
resources.

The fast/core command uses `playwright.mobile.config.ts` and runs the standard
portrait projects:

- `webkit-standard` — WebKit/iPhone approximation, 390x844, touch enabled;
- `chromium-standard` — Chromium comparison, 390x844, touch enabled.

The FAST command is an exact 50-test inventory across the five core spec files.
It runs four sequential Playwright invocations: `webkit-core` (the four core
files other than Ride), `webkit-free-ride-suggestion` (the single suggestion
acceptance test), `webkit-ride` (the remaining six Ride tests), and
`chromium-core` (all five files). The three WebKit invocations deliberately
recycle the browser process around the resource-heavy Free Ride flow while
keeping the same `webkit-standard` project and iPhone 14 profile. This is a
Linux resource-isolation approximation; it is not proof of iOS Safari or a
physical device.

Each invocation selects exactly one expected project, uses one worker and zero
retries, and independent invocations continue after a failure so that the
aggregate evidence is complete. The command exits nonzero if any invocation
fails, selects zero tests, selects duplicate tests, or misses any of the 50
tests. `--list` validates the same FAST50/5-file inventory without running
tests; `--dry-run` performs no writes and prints the no-browser discovery
command plus the three chunk commands (four plan lines). With `--list`, all
four plan lines are inventory-only and explicitly `NOT RUN`. PREPARE and FULL
remain separate single-command gates.

Coverage is based on Playwright's machine-readable filtered root suite and
`TestCase.id` values. FAST performs one no-browser discovery over both
standard projects, then records discovery for each chunk and compares the
executed IDs against those sets. Human-readable list output is retained for
logs only and is not coverage authority.

The fast gate covers all critical workflows, expected failure states, and the
honest online/offline boundary, and produces the critical screenshots.
Playwright trace and video retention is failure-only; the fixture's final
screenshots are retained for capture review. Chunk reports and HTML reports
are kept under the run-specific `artifacts/mobile-qa/runs/<run>/orchestration/`
and `artifacts/mobile-qa/runs/<run>/playwright-report/<chunk>/` directories;
the aggregate report is written only after all chunks finish. The top-level
`artifacts/mobile-qa/MOBILE-QA-REPORT.md` is an atomic pointer to the latest
completed run and never contains mixed chunk data.

Run the full/expanded viewport and orientation matrix when a mobile layout
changes significantly, before a release candidate, or when the fast gate
identifies a viewport-sensitive failure:

```bash
npm run test:e2e:mobile-qa:prepare
npm run test:e2e:mobile-qa:expanded
```

Prepare is a separate WebKit-primary seven-state gate (375 collapsed/expanded,
390 collapsed/expanded/selected peek, 768 prepare, and 1280 prepare). It uses
one project and is not multiplied across engines or viewports. The full command
then covers WebKit small/standard/large portrait, the meaningful standard
landscape surface, and one Chromium standard comparison. It keeps full captures
for visual review. Set
`SWITCHBACK_E2E_PORT` when port 3112 is occupied, or set `SWITCHBACK_E2E_URL`
to test an already-running deployment. The local config starts a Next
development server when no external URL is supplied.

## Device and state matrix

All Level A projects use `isMobile: true` and `hasTouch: true`. WebKit is
primary at every named size; Chromium is only a useful standard-portrait
comparison.

| Project | Engine/profile | Viewport | Orientation | Scope |
|---|---|---:|---|---|
| `webkit-small` | WebKit / iPhone 14 | 320x568 | portrait | expanded |
| `webkit-standard` | WebKit / iPhone 14 | 390x844 | portrait | core |
| `webkit-large` | WebKit / iPhone 14 profile, Pro Max-size viewport | 430x932 | portrait | expanded |
| `webkit-standard-landscape` | WebKit / iPhone 14 | 844x390 | landscape | expanded |
| `chromium-standard` | Chromium / Pixel 5 | 390x844 | portrait | core |
| `webkit-prepare` | WebKit / iPhone 14 | state-specific | mixed | Prepare gate only |

Scenarios are identified independently of the browser and are reused by the
Level B real-device path:

| Scenario ID | Required boundary |
|---|---|
| `core-state` | Core planner/ride state and interaction journey |
| `layout-containment` | No overflow, clipping, or unreachable fixed/sticky controls |
| `visual-state` | Deterministic state captures for visual inspection |

FAST deliberately uses representative light and dark captures, online and
offline transition/recovery scenarios, and fresh plus persisted storage
journeys. FULL adds representative WebKit portrait sizes and the meaningful
landscape surface. These are selective scenario assignments, not every
light/dark x online/offline x fresh/persisted cross-product; omitted
combinations remain outside the gate rather than being implied as passing.

The Level A offline state is deliberately narrow. It can prove the app shell,
locally saved data, and clear handling of an API failure. It does **not** prove
offline rerouting, offline basemap/place search, or a complete installed-region
route graph. Those claims require a separate, proven implementation and gate.

## Deterministic evidence

Tests must pin the visual clock, disable animations for deterministic captures,
use fixture-backed service responses, wait for
the state marker, and allow the map settle window before taking a screenshot.
Use the state construction and markers in the [UX state contract](../cinco/UX_STATE_CONTRACT.md).
The goal is a repeatable screenshot of a named state, not a screenshot that
happened to load successfully.

The 44px touch-target audit applies to app-owned controls. Required map-provider
attribution links are audited separately: each visible link must retain at least
24px of width and 12px of height, remain inside its clipping ancestors and the
visual viewport, and be reachable at its center.

The mobile config retains Playwright failure evidence. The mobile fixture
writes generic full-page captures only for unexpected failures or when
`MOBILE_QA_FULL_EVIDENCE=1`; named critical-state captures remain explicit in
the scenarios. Paths are rooted at the
run-specific `artifacts/mobile-qa/runs/<run>/` directory:

```text
MOBILE-QA-REPORT.md
MOBILE-QA-FAST-SUMMARY.md          # aggregate FAST status and coverage
MOBILE-QA-FAST-RUN.json            # run/chunk metadata, counts, and TestCase IDs
orchestration/<chunk>.md           # per-chunk report
orchestration/<chunk>.json         # per-chunk machine-readable counts/IDs
playwright-report/<chunk>/         # per-chunk HTML report
test-results/                      # Playwright output directory
screenshots/<project>/*-final.png  # unexpected/full-evidence captures
failures/<project>/*.png           # additional failed-state captures
traces/<project>/*.zip             # retained Playwright traces
videos/<project>/*.webm            # retained failure videos
```

The GitHub `Mobile QA Level A` workflow gives FAST, PREPARE, and FULL separate
run roots, so a later gate cannot erase earlier evidence. It uploads the
complete `artifacts/mobile-qa/` directory and retains that artifact for 14
days. Keep
the local directory until the review is complete; do not replace a failed
capture with a later passing capture. The general critical-browser policy in
[FAILURE_POLICY.md](FAILURE_POLICY.md) still applies to its separate seven-day
evidence stream.

Inspect evidence before declaring the gate useful:

```bash
npm run report:mobile-qa
npx playwright show-trace artifacts/mobile-qa/runs/<run>/traces/<project>/<test>.zip
```

Open the PNGs in `screenshots/` and `failures/`, read
`MOBILE-QA-REPORT.md`, and inspect the HTML report’s assertion, console, trace,
and video attachments. After a significant UI change, a passing command alone
is insufficient: inspect the relevant WebKit portrait and landscape captures,
the Chromium comparison, and any failure trace/video. Record the inspected
paths with the release evidence. A baseline or screenshot may be updated only
for an intentional, reviewed visual change.

## What this gate does not prove

Playwright WebKit is a useful mobile-browser approximation, not iOS Safari. It
does not prove iOS Safari rendering, iOS browser policy, WebKit-on-device
performance, add-to-home-screen behavior, service-worker behavior in an
installed app, or PWA installation. In particular, a Level A `PASS` must never
be described as a real-iPhone or installed-iOS-PWA pass.

## Level B: infrequent real iOS Safari / BrowserStack

Run Level B for a release candidate, a browser-specific regression, or a
significant navigation/PWA change. Use the same `core-state`,
`layout-containment`, and `visual-state` scenario IDs and record the actual
device/iOS/Safari version, URL revision, network state, storage state, and
evidence paths. BrowserStack can provide real iOS Safari browser coverage; it
does not by itself prove an installed home-screen PWA.

This checkout has no BrowserStack credentials or SDK. Until an owner supplies
that access through the approved secret mechanism, the Level B status is
`NOT RUN`. Do not add credentials, SDK configuration, or copied secrets to the
repository. For installed PWA and airplane-mode proof, use the
[physical-device drill](PHYSICAL_DEVICE_DRILL.md) and report it separately.

## Level C: optional targeted simulator

A macOS/Xcode VM may be used for a targeted iOS simulator investigation when a
specific iOS-only question warrants it. It is optional, requires explicit
target and environment evidence, and is never part of the normal Linux loop.
This checkout currently has no macOS/Xcode VM or simulator SDK provisioned.

## Release confidence lines

Every release summary must print these four separate lines, with no merging of
boundaries:

```text
Mobile responsive emulation: PASS/FAIL
WebKit mobile approximation: PASS/FAIL
Real iOS Safari: PASS/FAIL/NOT RUN
Installed iOS PWA behavior: PASS/FAIL/NOT RUN
```

`PASS` means the named boundary actually ran and its required assertions and
evidence were reviewed. `FAIL` means a required assertion or evidence review
failed. `NOT RUN` means the boundary was not exercised (including missing
real-device credentials or hardware); it is not a pass and must remain
visible. With no real iPhone run, Switchback makes no real-iPhone claim.

## Final release loop

After a significant mobile UI change, close the loop in this order:

1. Run the fast gate and confirm the critical workflow, failure, and offline
   assertions completed.
2. Inspect the WebKit standard portrait captures and Chromium comparison;
   inspect every failure screenshot, trace, and video rather than relying on
   the exit code.
3. Run the full matrix for changed layout surfaces and inspect its WebKit
   small/standard/Pro Max portrait and meaningful landscape captures.
4. Check the likely escape boundaries explicitly: touch reachability, both
   color schemes, fresh and persisted storage, online and API-failure/offline
   behavior, and no accidental offline-rerouting claim.
5. Publish the four release-confidence lines exactly as written above. Keep
   real iOS Safari and installed iOS PWA as `NOT RUN` unless their own evidence
   exists; never promote a Linux result into either boundary.
