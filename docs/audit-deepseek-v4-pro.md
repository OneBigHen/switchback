Audited by: deepseek-v4-pro

# Switchback Repository Audit

Scope: security, correctness, quality, and dependency posture of the
motorcycle route-planning Next.js app at `ride.henning.rodeo`. Line-level
review of `src/`, `infra/`, `deployment/`, and package manifest. `tsc --noEmit`
and `eslint --max-warnings=0` both pass clean; no hardcoded secrets were found
in tracked files or in any commit/tag in git history.

## Findings (ranked by severity)

### HIGH

1. **Route cache key omits routing-affecting fields → silently serves a wrong route**
   `src/lib/server/route-cache.ts:73` (`routeCacheKey`) and the live cache wired
   at `src/app/api/routes/route.ts:26`.
   The key hashes `roadLocks` by `lock.id` only (dropping `mode`, `edgeIds`,
   `geometry`, `orderedAnchors`, `fallbackToleranceMeters`), `avoidAreas` by
   `area.id` only (dropping the polygon geometry), and omits `bikeProfile`
   entirely. `bikeProfile` drives GraphHopper surface/smoothness/tracktype
   rules (`src/lib/routing/graphhopper.ts:317`, `buildBikeProfileRules`), and
   lock geometry/mode drives `custom_model` areas and ordered via-waypoints.
   Two requests within the 10-minute TTL that share profile + rounded points
   but differ in bike profile, a moved/retagged road lock, or a dragged avoid
   polygon collide on one key and the second caller receives the first
   request's cached `TripPlan` — a wrong route with no warning.
   The existing test (`tests/unit/route-cache.test.ts`) only asserts
   `profile`/`avoidHighways`/`tollPolicy` isolation; the missing dimensions are
   untested.
   *Fix*: include `bikeProfile`, and for locks/areas hash the full
   routing-relevant payload (mode, edgeIds, geometry, anchors, polygon) rather
   than the id; add tests for bike-profile and lock-geometry divergence.

2. **Free-ride endpoint is unauthenticated, unrate-limited, and bypasses the provider job limiter**
   `src/app/api/free-ride/suggestions/route.ts:57` (`POST` has no
   `withRateLimit`) and `requestFreeRideRoute` (`route.ts:34`) call
   `requestGraphHopperRoutes` directly instead of through
   `createRouteJobLimiter`/`providerLimiter` used by `/api/routes`
   (`src/app/api/routes/route.ts:25`). Each request loops over up to 3 RIG
   opportunities and issues 2 GraphHopper calls each (baseline + detour) in
   `buildGraphBackedFreeRideCandidates`
   (`src/lib/recommendation/free-ride.ts:121`), i.e. up to ~6 uncapped router
   calls per request. This contradicts `SECURITY.md`'s "Every public endpoint
   is rate-limited per caller IP" and provides a CPU-amplification DoS against
   the self-hosted GraphHopper engine. (Edge rate-limiting via Caddy/Cloudflare
   partially mitigates in production, but the origin is directly reachable at
   `0.0.0.0:3100` per the README's `switchback-cloudflare` topology.)
   *Fix*: wrap the POST in `createRateLimiter` and route provider calls through
   the shared `providerLimiter` with a request-scoped signal.

### MEDIUM

3. **`.env.local` points GraphHopper at a LAN address, not loopback**
   `.env.local:2` sets `GRAPHHOPPER_URL` to a LAN address, while the
   file's own comment and the README (`README.md:148`, "Do not expose
   GraphHopper or Valhalla directly to the LAN") mandate loopback. The file is
   gitignored (not a leak), but the running deployment exposes the router to
   the LAN, widening the surface from finding #2. *Fix*: use
   `127.0.0.1:8989` (or bind GraphHopper's connector to loopback) and remove the
   hardcoded LAN IP.

4. **Free-ride handler reads the body unbounded before checking size**
   `src/app/api/free-ride/suggestions/handler.ts:40` (`readBody`) calls
   `request.text()` and only afterwards rejects `text.length > 8*1024`, unlike
   the streaming cap in `src/lib/server/http-body.ts` and the pattern used by
   `/api/routes` (`src/app/api/routes/handler.ts:169`). A large POST is fully
   buffered before rejection. *Fix*: reuse `readBoundedJsonBody` or check
   `content-length`/stream-cancel before accumulating.

5. **Registration creates an identity before the passkey is verified**
   `src/app/api/identity/register/options/route.ts:25` calls
   `runtime.store.createIdentity(...)` in the options step, then the identity
   id rides the in-memory challenge until `verify`. Abandoned registrations
   leave orphaned `public_identity` rows with no expiry/cleanup, and an
   attacker can mint identities (rate-limited to 5/min) that never gain a
   credential. *Fix*: create the identity only on successful verification, or
   add a GC pass over credential-less identities.

### LOW

6. **Committed binary archives / stale recovery artifacts in the repo root**
   `SWITCHBACK_COMPLETION_AND_PRACTICAL_QUALITY_PLAN.zip`,
   `SWITCHBACK_ROUTING_BUILD_PACKAGE.zip`,
   `switchback_full_recovery_spec.zip` (and its extracted directory), and
   `switchback-production-master-spec-2026-08-10.zip` are tracked in git. The
   spec zip contains `deployment/.env.example` (no secrets), but these blobs
   only bloat history and drift from the live code. *Fix*: delete from tracking
   and keep under `artifacts/`/Git LFS or gitignored.

7. **Valhalla routes carry empty `roadMix`/`surfaceMix`**
   `src/lib/routing/valhalla.ts:519-520` sets both distributions to `{}`.
   Downstream unpaved-share scoring (`src/lib/routing/planner.ts:136`) and
   PASDA adventure enrichment then see a featureless route, so a Valhalla
   fallback can silently skip unpaved evidence other profiles use. This is a
   documented engine limitation, but it should be flagged rather than passed
   through as "clean". *Fix*: emit a warning when a Valhalla-sourced route is
   selected without surface/road detail.

8. **Fragile lowercase coupling in the score fallback**
   `src/lib/routing/planner.ts:152` reads `route.roadMix.motorway` / `.trunk`
   (lowercase) while `unpavedShare` re-lowercases surfaces; the fallback is
   only reached for pre-`routeScore` cached routes. Not a live bug, but a
   brittle implicit contract. *Fix*: normalize mix keys at parse time.

9. **Orphan passkey challenges live in memory only**
   `PasskeyChallengeStore` (`src/lib/identity/passkey.ts:33`) is a module-level
   in-memory map; a restart silently invalidates in-flight registrations and
   any multi-instance deployment would not share challenges. Acceptable for the
   self-hosted single-instance model, but worth documenting. *Fix*: note the
   single-instance constraint; consider persisting or signing challenges.

## Positive observations (no action)

- No hardcoded API keys, DB passwords, or tokens in tracked files; `.env*` is
  gitignored; `git rev-list --all` secret-pattern scan is clean.
- `src/proxy.ts` + `shouldUpgradeCloudflareHttp` only redirect HTTP→HTTPS for
  the single pinned public host; no user-controlled SSRF target. Provider base
  URLs come from env (`GRAPHHOPPER_URL`/`VALHALLA_URL`/`PHOTON_URL`), not
  request input; coordinates are schema-validated
  (`src/app/api/routes/handler.ts:15`).
- WebAuthn/identity is well-formed: challenge single-use + TTL, signature
  counter replay check (`nextPasskeyCounter`), session secret fails closed
  (min 32 chars), CSRF double-submit on mutations, operator gating on
  moderation (`requireOperatorMutationIdentity`).
- Security headers (CSP without `unsafe-inline` scripts in prod, frame-ancestors
  'none', nosniff), and the Caddy example strips client-supplied IP headers
  before rewriting `X-Forwarded-For`/`X-Real-IP`.
- Sync crypto is correct: per-object HKDF-derived AES-GCM keys, fresh random
  nonce per write, metadata bound as additionalData, checksummed base32
  recovery kit.
- GPX streaming parser and offline v2 router are thoroughly bounded (byte,
  point, segment, state limits) and reject malformed/mismatched input.
- Navigation session controller uses refs, version counters, and AbortController
  to avoid stale-closure and reroute race conditions.

## TOP 10 PRIORITIES

1. Fix `routeCacheKey` to include `bikeProfile` and full lock/area geometry +
   mode (prevents wrong-route cache hits). (HIGH #1)
2. Rate-limit and job-limit `/api/free-ride/suggestions`; put its GraphHopper
   calls behind `providerLimiter`. (HIGH #2)
3. Move GraphHopper back to loopback; drop the LAN IP from `.env.local`.
   (MEDIUM #3)
4. Replace free-ride `readBody` with the bounded stream reader. (MEDIUM #4)
5. Defer `createIdentity` to the registration verify step (or add orphan GC).
   (MEDIUM #5)
6. Stop tracking the repo-root zip/spec archives; archive or delete them.
   (LOW #6)
7. Emit a warning when a Valhalla-sourced route lacks surface/road detail.
   (LOW #7)
8. Add unit tests covering bike-profile and road-lock/avoid-area geometry
   divergence in `route-cache.test.ts`.
9. Document the single-instance in-memory challenge-store constraint (or
   persist challenges). (LOW #9)
10. Normalize `roadMix`/`surfaceMix` keys once at parse time to remove the
    lowercase coupling in the score fallback. (LOW #8)
