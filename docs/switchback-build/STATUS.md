# Switchback build status

Updated: 2026-08-04

## Current phase

Implementation handoff. The requested routing/intelligence slice is in the
working tree and ready to ship; final quality hardening and live/device gates
remain intentionally visible for the next pass.

## Shipped in this slice

- Read and retained all three supplied build specifications under
  `docs/switchback-build/`.
- Added provider-neutral domain contracts for route requests, normalized road
  features, route scores, temporal context, rider events, suggestions, and
  offline packs.
- Added deterministic route scoring with legal/access/closure/confidence,
  safety, detour, and privacy gates plus rider-facing explanations.
- Promoted all eight product profiles: Quick, Balanced, Twisty, Scenic,
  Adventure, Gravel, Avoid Highways, and Neural. Existing GraphHopper and
  Valhalla adapters remain the provider boundary.
- Added first-class Free Ride / Neural Map flow: bounded curvature candidates,
  workload/GPS/cooldown suppression, one suggestion, accept/ignore/less-like,
  accepted-suggestion navigation, and private local event learning.
- Added local rider preference ranking, reset/export/delete controls, and an
  explicit local-only privacy explanation in Profile.
- Added offline saved-corridor recovery for provider failure/offline reroutes;
  it rejects missing, expired, corrupt, and out-of-coverage packs instead of
  drawing a straight-line substitute.
- Added Free Ride component coverage and browser evidence for mobile Safari,
  desktop Chromium, and narrow/wide mobile landscape:
  `artifacts/screenshots/e2e-free-ride-*.png`.
- Added ADRs 0001–0008 and refreshed architecture, execution, and traceability
  documentation.

## Verification snapshot

- Focused routing/profile/navigation/live-gate checks: 40/40 passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test -- --reporter=dot` — 168 files / 1,147 tests passed.
- `npm run build` — passed; Next.js emitted the new Free Ride API route.
- Free Ride Playwright E2E — 4/4 passed: desktop Chromium, mobile Safari,
  wide mobile landscape, and narrow mobile landscape.
- The live golden route remains environment-gated and is expected to skip
  unless GraphHopper and the app health endpoint are running. A real iPhone
  airplane-mode drill has not been performed here.

## Known environment gates

- Live GraphHopper/Valhalla, curvature, GPX catalog, geocoder, and external
  research services are not guaranteed in this checkout. Provider success is
  not claimed without runtime evidence.
- iOS Safari background execution, airplane-mode continuation, and install/PWA
  behavior still need a physical-device check.
- Temporal traffic/incident adapters are represented as capability-aware
  contracts; no commercial live feed is required or falsely labeled as live.

## Handoff

The next pass should perform live-provider and iPhone checks where services or
hardware are available, then extend the quality matrix. The implementation is
on the current `main` line so it can be continued directly.
