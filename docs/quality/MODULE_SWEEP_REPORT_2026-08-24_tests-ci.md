# Module sweep: tests and CI

Date: 2026-08-24
Branch: `quality-sweep/tests-ci`
Scope: unit/integration/e2e coverage, browser and router fixtures, PWA checks,
workflow trust boundaries, failure policy, secrets, artifacts, and resource use.

## Findings

### TCI-001: visual regressions were explicitly allowed to pass

Severity: high
Status: fixed

The `visual` job in `.github/workflows/quality.yml` still had
`continue-on-error: true`, even though commit `47eab5d` pinned the app clock and
browser timezone in the visual fixtures. A failed screenshot or state assertion
could therefore leave the pull request green while the job displayed a failure.

The job now fails normally. `docs/CI-ARCHITECTURE.md` now records visual as a
deterministic public merge gate and keeps live-provider and homelab checks
outside public PR gating.

The protected `main` branch required-status list was updated during this sweep
to include `visual`; a red visual job can no longer be bypassed by the other
public checks passing.

## Coverage audit

- Unit and integration tests are run by `npm test`; fixture tools are installed
  in CI where the tests need them. The integration route smoke is explicitly
  environment-gated and skips when no router/app endpoint is configured, rather
  than claiming live coverage.
- Critical browser coverage runs Chromium and WebKit. Separate projects cover
  PWA/offline behavior, road-lock interaction, a pinned local GraphHopper
  fixture, and visual states. The real-router workflow downloads a pinned JAR,
  verifies its SHA-256, starts it locally, and runs the browser checks against
  `127.0.0.1`; it does not depend on private homelab infrastructure.
- Visual coverage exercises desktop, phone, and tablet planner/library/record/
  profile/ride/free-ride/error states. The fixture pins `America/New_York`, the
  application clock, geolocation, and map settle timing. Assertions include
  visibility, bounds, text, and screenshot comparisons, not snapshots alone.
- PWA tests verify service-worker registration, that API responses are not
  incorrectly served from cache while offline, shell reload survival, and
  IndexedDB saved-route availability.
- Identity E2E uses Chromium virtual WebAuthn. The browser-name skip is
  deliberate and documented because Playwright's virtual credential API is the
  tested capability; it is not a broad test skip.
- No `.only`, `describe.skip`, `fixme`, or unexplained browser skips were found.
  One planner TODO records a missing engine-status indicator and remains a
  product backlog item, not a silently passing assertion.

## CI and trust boundaries

- Public pull requests use hosted runners, `pull_request`, read-only contents,
  no private endpoints, and no secrets. The quality workflow has separate
  typecheck, lint, Vitest, clean build, critical E2E, PWA, road-lock,
  real-router, and visual jobs. Repeated `npm ci` and builds are intentional
  job isolation; Playwright runs with one worker in the project configuration
  to limit memory pressure.
- Trusted live validation runs only on `main` or by dispatch and requires
  `SWITCHBACK_LIVE_BASE_URL`. Its preflight identifies absence as
  `BLOCKED — SECRET NOT CONFIGURED`; the result job exits zero so an absent
  deployment does not become a false failure, but this is explicitly not live
  verification.
- Homelab smoke is manual, main-ref guarded, and self-hosted. It is not a PR
  gate and does not make public-fork checks depend on private infrastructure.
- The Claude workflow is event-scoped and does not checkout or execute the
  pull request source. No workflow in this sweep prints credentials or embeds
  endpoint URLs in artifacts.
- Failure artifacts are uploaded only on failure and retained for seven days.
  No duplicate quality workflow or obsolete test job was found.

## Remaining boundaries

The public suite cannot prove a real deployment's session secret, live provider
health, physical two-device behavior, or a real passkey authenticator. Those
remain trusted-live/manual gates. Missing secrets must stay visibly blocked and
must not be reported as a successful live smoke.

## Rollup

| Found | Fixed | Flagged for later |
|---:|---:|---:|
| 1 | 1 | 4 boundaries above |

## Verification

Final verification: sequential `npm run verify` passed on this branch:

- ESLint passed with `--max-warnings=0`.
- TypeScript passed with `tsc --noEmit`.
- Vitest passed: 227 files, 1,394 tests.
- Next.js 16.3.0 production build passed, including page generation and route
  collection.
