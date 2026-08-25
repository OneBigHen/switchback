# Switchback CI architecture

Switchback uses GitHub-hosted runners for normal public repository validation.
Every pull request runs on a fresh `ubuntu-latest` machine with read-only
`GITHUB_TOKEN` permissions and no repository secrets.

## Public pull-request gates

`.github/workflows/quality.yml` runs these deterministic, credential-free jobs:

- `typecheck`
- `lint`
- `vitest`
- `build` (removes `.next` before `npm run build`)
- `critical-e2e`
- `pwa`
- `road-lock`
- `real-router` (a pinned local GraphHopper fixture)

The `visual` job also runs for visibility. Its snapshots are not updated in CI;
environmental pixel drift is reported as a visual failure, and the job is
explicitly `continue-on-error` until the baseline is independent of the app's
time-based automatic theme selection. It is not a deterministic merge gate.

No public fork PR uses a persistent runner or receives secrets. The workflow
uses `pull_request`, not `pull_request_target`, for untrusted code.

## Trusted live-provider validation

`.github/workflows/live-validation.yml` runs only on pushes to `main` and manual
`workflow_dispatch`. It requires exactly one repository secret:

- `SWITCHBACK_LIVE_BASE_URL` — the public app origin (`https://ride.henning.rodeo`).

`GRAPHHOPPER_URL`, `VALHALLA_URL`, `VALHALLA_ELEVATION_URL`, and `PHOTON_URL`
are optional direct-engine secrets, deliberately not required: per this
project's own `deployment/README.md`, GraphHopper and Valhalla must stay
private to the compose network and are never meant to be internet-facing.
Requiring a direct secret for them would have meant either leaving the gate
permanently unsatisfiable or exposing an internal-only engine to satisfy CI —
neither is right. Instead, `scripts/qa/run-live-smoke.mjs` validates those
engines *indirectly*, through the already-public app's own `/api/health` and
`/api/routes`, which proxy to them server-side. Direct-engine checks stay
available as an opt-in extra for an operator who does choose to expose one
behind their own access policy; when unset they report `NOT CONFIGURED`
(informational, non-blocking), not a failure.

Values are never printed. If the required secret is absent, the workflow
reports `SKIPPED — SECRET NOT CONFIGURED` and its result job passes without
running the live-provider checks — a skip, not a verification of live
behavior. (Before 2026-08-24 a missing secret was a hard failure, and
`GRAPHHOPPER_URL` was required too; changed the same day once
`SWITCHBACK_LIVE_BASE_URL` was actually configured and the direct-GraphHopper
requirement was found to conflict with the private-engine policy above. Revert
the `result` job's missing-secret branch to `exit 1` if `SWITCHBACK_LIVE_BASE_URL`
is ever removed, so that regression is caught again.)

## Homelab runner

The `homelab-ci` label belongs to the disposable Proxmox LXC used for trusted
manual smoke tests and future heavy/soak workloads. It is not a PR runner.

`.github/workflows/homelab-ci-smoke.yml` is `workflow_dispatch` only and checks
Node, Docker, Compose, Chromium, and WebKit. Use it for controlled diagnostics,
not for arbitrary fork code. A serious runner compromise means rebuilding the
guest; Docker access is intentionally confined to that disposable appliance.

## Cirun

Cirun is optional. No Cirun workflow or `.cirun.yml` is required because public
GitHub-hosted runners are free. Cirun normally provisions machines in an
account-owned cloud and must not be enabled without an explicitly approved
zero-cost backend. No cloud resource is created by this repository.

## Rules and debugging

Require the deterministic public jobs above in the `main` branch ruleset after
the first public workflow run. Do not require visual, live-provider, Cirun, or
homelab jobs as merge gates.

Useful commands:

```bash
npm ci
npm run typecheck
npm run lint
npm test -- --reporter=dot
rm -rf .next && npm run build
npx playwright test --project=road-lock
npm run test:e2e:critical
npm run test:e2e:pwa
npm run test:e2e:real-router
gh run list --repo OneBigHen/switchback
gh run watch --repo OneBigHen/switchback
gh workflow run homelab-ci-smoke.yml --repo OneBigHen/switchback --ref main
gh workflow run live-validation.yml --repo OneBigHen/switchback --ref main
```

The live-provider report deliberately contains statuses and HTTP result details,
not endpoint URLs or credentials.
