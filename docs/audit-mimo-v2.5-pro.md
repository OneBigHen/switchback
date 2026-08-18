# Switchback Repository Audit

Audited by: mimo-v2.5-pro (opencode)
Date: 2026-08-17
Scope: Security, Correctness, Quality, Dependencies

---

## FINDINGS

### SECURITY

**S-1 | Medium | `src/app/api/community/context.ts:17`, `src/lib/identity/csrf.ts:17,37`**
`SWITCHBACK_SESSION_SECRET` falls back to `""`. `readIdentitySession` silently returns `null` for secrets < 32 chars, making all community API reads effectively unauthenticated. Mutations fail with AUTH_REQUIRED (safe), but the fallback pattern is fragile — if the env var is ever set to a short value by mistake, sessions become forgeable.
**Fix:** Throw at startup if `SWITCHBACK_SESSION_SECRET` is missing or < 32 chars instead of falling back to `""`.

**S-2 | Medium | `next.config.ts:21`**
CSP allows `'unsafe-inline'` for `script-src`. Acknowledged in comments as required for Next.js RSC bootstrap, but this weakens XSS mitigation — any inline injection bypasses CSP.
**Fix:** Migrate to nonce-based CSP (`'nonce-{random}'`) when Next.js supports it natively. Low urgency given the strict `connect-src` and `object-src 'none'` directives.

**S-3 | Low | No `middleware.ts` exists**
No Next.js middleware for auth enforcement. All authentication/authorization is done per-handler via `requireMutationIdentity()` / `requireOperatorIdentity()`. This is correct but fragile — a new API route that forgets to call these functions would be unprotected.
**Fix:** Consider a middleware that sets an `x-identity-id` header for authenticated requests, or at minimum a lint rule that flags unprotected POST/DELETE/PATCH handlers.

**S-4 | Low | `deployment/graphhopper.Dockerfile` — no `USER` directive**
The GraphHopper container runs as root. The JAR is verified via SHA256 (good), but root execution increases blast radius if the process is compromised.
**Fix:** Add `RUN useradd -r graphhopper` and `USER graphhopper` before ENTRYPOINT.

**S-5 | Low | `src/lib/server/rate-limiter.ts` — in-memory, single-process**
Rate limiting is keyed by IP in a `Map`. Works for the self-hosted single-process deployment, but is bypassable by distributed requests and resets on restart.
**Fix:** Document as intentional for current scale. If horizontal scaling is planned, swap to Redis/Cloudflare rate limiting.

**S-6 | Info | `src/app/api/geocode/handler.ts:15` — query param reflected in response**
The geocode handler reads `q` from URL params and passes it to the Photon geocoder, returning results. The query itself is not reflected in the response body (only results are), so no XSS vector. Coordinate validation is thorough (`lat`/`lon` bounds-checked).

**S-7 | Positive | No SSRF vectors found**
All upstream URLs (GraphHopper, Valhalla, Photon, Google Places, OpenRouter, You.com) are read from environment variables server-side. No user input flows into URL construction. The `baseUrl` in `GraphHopperOptions`/`ValhallaOptions` is always from `process.env`. The geocode handler passes user queries as search params to a hardcoded Photon URL.

**S-8 | Positive | No hardcoded secrets in tracked files**
`.env.local` is properly gitignored (`.gitignore:11`). No API keys, tokens, or passwords found in tracked source. Git history search for secret patterns returned nothing. All external API keys are server-side only (no `NEXT_PUBLIC_` prefixes on secrets).

**S-9 | Positive | Strong auth primitives**
WebAuthn counter validation (`passkey.ts:86-92`), timing-safe CSRF comparison (`csrf.ts:33`), HMAC-signed sessions with expiry (`passkey.ts:94-104`), and strict identity ID format validation are all correctly implemented.

---

### CORRECTNESS

**C-1 | Low | `src/lib/routing/valhalla.ts:291` — elevation null-coalescing**
`fetchRouteElevations` returns `{ ascentMeters: null, descentMeters: null }` on any network/parsing error. This is intentionally graceful degradation, but callers (like `enrichWithElevations`) silently merge `null` over existing values. If a route already had elevation from the provider, enrichment could overwrite it with `null`.
**Fix:** In `enrichWithElevations`, only merge if the fetched value is non-null: `elevations.ascentMeters !== null ? elevations : {}`.

**C-2 | Low | `src/lib/routing/valhalla.ts:196-234` — polyline6 decoder trusts encoded content**
The polyline decoder doesn't validate that decoded coordinates are within [-90,90]/[-180,180]. A malformed Valhalla response could produce out-of-bounds coordinates that propagate downstream.
**Fix:** Add bounds checking in the decoder output, or clamp after decode.

**C-3 | Info | `src/lib/routing/scoring.ts:73-75` — twistiness formula**
`twistiness = Math.min(100, directionalChangePerKilometer * 1.9 + turnDensity * 9)`. The constants (1.9, 9) are tuning parameters, not bugs, but they're magic numbers without documentation of how they were derived. The Phase 4 `smoothedRouteMetrics` uses a different formula (`curvedShare * 60 + turnsPerMile * 40`), creating two parallel twistiness calculations that could diverge.
**Fix:** Document the provenance of both formulas and when each is used.

**C-4 | Positive | Routing logic is correct**
- Haversine implementation (`scoring.ts:18-27`) is standard and correct.
- Bearing calculation (`scoring.ts:31-39`) uses the standard formula.
- Douglas-Peucker simplification (`scoring.ts:254-280`) correctly handles the recursive case with protected points.
- Route scoring (`route-score.ts:303-422`) has proper guards for empty segments, zero division, and NaN propagation (`clamp` with `Number.isFinite` checks).
- GraphHopper request construction (`graphhopper.ts:265-395`) correctly handles round trips, multi-waypoint routes, and road-lock corridor injection.
- GPX import (`gpx-import.ts:58-221`) validates coordinates, limits point counts, handles disconnected segments, and escapes XML properly in export.

**C-5 | Positive | Free-ride recommendation logic is robust**
Directionality filtering (`free-ride.ts:215-220`), GPS confidence gating (`free-ride.ts:264-265`), workload suppression (`free-ride.ts:267-269`), cooldown management (`free-ride.ts:396-487`), and heading-delta U-turn prevention are all correctly implemented.

---

### QUALITY

**Q-1 | Low | Zero `console.log`/`console.debug` in source**
Grep found zero debug logging statements in `src/`. Clean production code.

**Q-2 | Low | Zero TODO/FIXME/HACK comments in source**
The codebase has no outstanding TODO markers. All referenced tasks are tracked externally.

**Q-3 | Low | Large files**
Several files exceed 400 lines: `graphhopper.ts` (705), `route-score.ts` (423), `gpx-import.ts` (422), `valhalla.ts` (624), `planner.ts` (953). These are complex domain files, not bloat, but could benefit from extraction of sub-concerns.
**Fix:** Consider extracting polyline decoding, elevation fetching, and costing options into separate modules.

**Q-4 | Info | Test coverage is extensive**
21,350+ lines across 100+ unit test files covering routing, scoring, GPX import/export, identity/CSRF, community API, free-ride recommendations, offline graph, navigation, and more. E2E tests via Playwright cover critical paths. No obvious gaps in critical-path coverage.

**Q-5 | Info | Documentation is minimal but accurate**
README.md, AGENTS.md, and docs/ exist. The code is well-commented with JSDoc on public functions. No stale documentation found — comments match actual behavior.

**Q-6 | Positive | Input validation is thorough**
The `src/lib/validate.ts` module provides a custom schema validator used across all API handlers. Route requests validate waypoint coordinates, profile enums, array bounds, and string lengths. GPX imports validate XML structure, coordinate ranges, and file size limits (5 MB).

---

### DEPENDENCIES

**D-1 | Info | `npm audit` reports 0 vulnerabilities**
677 total dependencies (143 prod, 496 dev). No known CVEs.

**D-2 | Info | All dependencies are current**
- Next.js 16.3.0, React 19.2.7, TypeScript 6.0.3 — latest major versions.
- MapLibre GL 5.24.0, Vitest 4.1.10, Playwright 1.61.1 — current.
- `better-sqlite3` 12.11.1 — actively maintained.
- `dexie` 4.4.4 (IndexedDB wrapper) — actively maintained.
- `@simplewebauthn/*` 13.3.0 — current WebAuthn library.

**D-3 | Positive | GraphHopper JAR verified via SHA256**
`deployment/graphhopper.Dockerfile:15` verifies the downloaded JAR against a pinned SHA256 hash. The JAR URL and version are pinned.

**D-4 | Positive | Docker base images are reasonable**
- `caddy:2.10-alpine` — official, minimal.
- `eclipse-temurin:21-jre-jammy` — official Java runtime, Ubuntu-based.
- Next.js app image is built from the repo's own Dockerfile (not shown but referenced as `ghcr.io/onebighen/switchback`).

---

## TOP 10 PRIORITIES

1. **S-1 | Enforce `SWITCHBACK_SESSION_SECRET` at startup** — Fail fast if missing or < 32 chars instead of silently degrading to unauthenticated mode. Prevents accidental unprotected deployments.

2. **S-4 | Run GraphHopper container as non-root** — Add a `USER` directive to the Dockerfile. Minimal effort, meaningful blast-radius reduction.

3. **C-1 | Guard elevation enrichment against null overwrite** — In `enrichWithElevations`, skip merging when the fetched value is `null` to preserve provider-supplied elevation data.

4. **S-2 | Plan nonce-based CSP migration** — Track Next.js CSP nonce support. Replace `'unsafe-inline'` with `'nonce-{random}'` when feasible to close the XSS gap.

5. **S-3 | Add auth lint rule or middleware** — Ensure new API routes cannot accidentally omit authentication. A lint rule requiring `requireMutationIdentity` on POST/DELETE handlers would catch this.

6. **C-2 | Validate polyline6 decoded coordinates** — Add bounds checking in `decodePolyline6` to prevent out-of-bounds coordinates from malformed provider responses.

7. **Q-3 | Extract sub-modules from large files** — `planner.ts` (953 lines), `graphhopper.ts` (705 lines), and `valhalla.ts` (624 lines) would benefit from extracting polyline handling, elevation logic, and costing options.

8. **C-3 | Document dual twistiness formulas** — The `analyzeGeometry` and `smoothedRouteMetrics` twistiness calculations use different formulas. Document when each applies and why.

9. **S-5 | Document rate-limiter single-process limitation** — Add a comment or doc noting that the in-memory rate limiter is intentionally single-process and will need Redis if scaling horizontally.

10. **D-2 | Pin transitive dependency versions** — The lockfile handles this, but consider `npm ci` in CI/CD to ensure reproducible builds from the lockfile rather than `npm install`.
