# OpenGravel CI architecture

OpenGravel uses GitHub-hosted runners for normal public repository validation.
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
- `visual` (pinned clock/timezone and responsive visual states)

The visual job is a deterministic merge gate. Its snapshots are not updated in
CI; environmental pixel drift is reported as a failure. The suite pins the
browser timezone and the app clock before capturing the required desktop,
phone, and tablet states, so a visual failure is actionable rather than an
unbounded time-of-day comparison.

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

Two workflows use that runner, and they answer different questions:

- `homelab-ci-smoke.yml` — is the *appliance* healthy? Node, Docker, Compose,
  Chromium, WebKit. `workflow_dispatch` only.
- `homelab-integration.yml` — is the *routing stack* healthy on the LAN?
  `workflow_dispatch` plus pushes to `main`.

`homelab-integration.yml` exists because the trusted live validation above can
only see the public origin. When `ride.henning.rodeo` returns 502 that job says
the site is down but not which hop broke — and it reports the engines
`NOT CONFIGURED`, because they are private by policy. The homelab runner sits on
the same LAN, so it can reach them directly and split the question up:

| Hop | Checked by | Address |
|---|---|---|
| Cloudflare tunnel → origin | `live-validation` (GitHub-hosted) | public origin |
| Origin app, direct | `homelab-integration` | app host, port 3100 |
| GraphHopper, direct | `homelab-integration` | `switchback-router` LXC, port 8989 |
| Valhalla + elevation | `homelab-integration`, via app health | loopback on the app host |
| Photon | both | the configured Photon endpoint |

Addresses live in `HOMELAB_*` repository secrets rather than in the workflow —
they are not sensitive, but this repository is public and masking keeps LAN
topology out of run logs. Both workflows reuse `scripts/qa/run-live-smoke.mjs`,
so there is one definition of what a healthy provider means.

Valhalla is bound to loopback on the app host (`127.0.0.1:8002` in its compose
file) and so is unreachable from the LAN by design. Rather than widen that
binding for CI, `homelab-integration.yml` asserts the app's own
`/api/health` provider block, which is a real liveness check of the running
Valhalla via the only process that can reach it. Set `HOMELAB_VALHALLA_URL` if a
direct endpoint is ever exposed; until then it reports `NOT CONFIGURED`.

Two properties of that workflow are deliberate and should survive edits:

- **No `pull_request` trigger, ever.** This repository is public. A fork PR
  would run contributor code on a real machine on a home network. GitHub's
  "require approval for first-time contributors" does not cover this: it stops
  only an account's first PR. A GitHub-hosted `guard` job decides the ref before
  anything reaches the runner, and refuses anything but `main`.
- **No `npm ci`.** `run-live-smoke.mjs` uses Node built-ins only, so the job
  installs nothing and no third-party lifecycle script runs inside the homelab.

Neither homelab workflow is a merge gate; the required checks stay on
GitHub-hosted runners.

## Cirun

Cirun is optional. No Cirun workflow or `.cirun.yml` is required because public
GitHub-hosted runners are free. Cirun normally provisions machines in an
account-owned cloud and must not be enabled without an explicitly approved
zero-cost backend. No cloud resource is created by this repository.

## Rules and debugging

Require the deterministic public jobs above in the `main` branch ruleset after
the first public workflow run. Do not require live-provider, Cirun, or homelab
jobs as merge gates. Live-provider remains a trusted, separately configured
deployment check; when its endpoint secret is absent, its summary must remain
`BLOCKED — SECRET NOT CONFIGURED` and must not be read as live verification.

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
