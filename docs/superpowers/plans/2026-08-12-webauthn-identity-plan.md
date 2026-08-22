# WebAuthn Identity Ceremony Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace the injected passkey verifier boundary with a real, reviewed WebAuthn registration/authentication ceremony and protect cookie-authenticated community/sync mutations with CSRF.

**Architecture:** Keep the existing `CommunityRepository` as the only credential store and the existing signed session as the only identity session. Add a small SimpleWebAuthn adapter, a bounded process-local challenge context, four dynamic Next API handlers, and one browser adapter; do not account-gate local planning or riding.

**Tech Stack:** Next.js 16 Node runtime, TypeScript 6, Node 24, SQLite via the existing repository, `@simplewebauthn/server@13.3.0`, `@simplewebauthn/browser@13.3.0`, Vitest, and Playwright.

## Global Constraints

- The server stores credential id, public key, counter, and pseudonymous identity id only; never a private key.
- Registration and authentication verify the exact configured HTTPS origin and RP id; production configuration fails closed.
- Challenges are one-time, short-lived, and bounded; failed verification requires a new challenge.
- Local rider planning, saving, GPX import/export, and offline use remain account-free.
- Cookie-authenticated mutations require a matching CSRF header and non-HttpOnly CSRF cookie; bearer sessions remain available for non-browser clients.
- Use the existing `CommunityStore`, request-id/error contract, bounded JSON reader, and rate limiter; do not create a second database or auth session format.
- Follow red-green-refactor: each production behavior starts with a failing focused test.
- Preserve the dirty worktree; stage only files belonging to this slice for any commit.

---

### Task 1: Install the reviewed WebAuthn adapters and configuration seam

**Files:**
- Modify: `package.json` and `package-lock.json`
- Modify: `.env.example`
- Create: `src/lib/identity/webauthn.ts`
- Test: `tests/unit/webauthn-config.test.ts`

**Interfaces:**
- `getWebAuthnConfig(): { rpName: string; rpID: string; expectedOrigin: string }`
- `WebAuthnConfigError` is thrown when production lacks `SWITCHBACK_WEBAUTHN_RP_ID` or `SWITCHBACK_WEBAUTHN_ORIGIN`.
- Non-production defaults are `rpID: "localhost"`, `expectedOrigin: "http://localhost:3000"`, and `rpName: "Switchback"` unless explicit variables are set.

- [ ] **Step 1: Write the failing configuration test**

  Cover explicit values, localhost defaults, and production missing-variable failure. The test must set and restore `NODE_ENV`, `SWITCHBACK_WEBAUTHN_RP_ID`, and `SWITCHBACK_WEBAUTHN_ORIGIN` around each case.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run:

  ```bash
  npm test -- tests/unit/webauthn-config.test.ts
  ```

  Expected: module/function-not-found failure because the configuration seam does not exist.

- [ ] **Step 3: Add dependencies and the minimal configuration module**

  Install the pinned reviewed packages with npm. `getWebAuthnConfig()` must not derive origin or RP id from a request `Host` header. Production must throw if either value is absent; development/test may use only the documented localhost default.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run the same command and confirm all configuration cases pass.

- [ ] **Step 5: Commit only this task**

  ```bash
  git add package.json package-lock.json .env.example src/lib/identity/webauthn.ts tests/unit/webauthn-config.test.ts
  git commit -m "feat: add WebAuthn configuration boundary"
  ```

### Task 2: Make the challenge and session boundary ceremony-ready

**Files:**
- Modify: `src/lib/identity/passkey.ts`
- Create: `src/lib/identity/csrf.ts`
- Create: `src/app/api/identity/context.ts`
- Test: `tests/unit/passkey-identity.test.ts`

**Interfaces:**
- `PasskeyChallengeStore.issue(kind, identityId?, now?): PasskeyChallenge`
- `PasskeyChallengeStore.consume(id, kind, now?): PasskeyChallenge | null`
- `getIdentityStore(): CommunityStore`, `getPasskeyChallenges(): PasskeyChallengeStore`, and `getWebAuthnVerifier()` live in the identity API context.
- `createIdentitySessionResponse(identityId): Response` sets `switchback_session` and `switchback_csrf` cookies.
- `requireMutationIdentity(request): string` accepts a valid bearer session or a valid cookie session with matching `x-switchback-csrf`.

- [ ] **Step 1: Write failing challenge/CSRF tests**

  Add tests for registration-vs-authentication challenge kind matching, one-time consumption, expired challenge rejection, bounded challenge count, secure session cookie attributes, CSRF mismatch rejection, and constant-time matching acceptance.

- [ ] **Step 2: Run the focused tests to verify they fail**

  ```bash
  npm test -- tests/unit/passkey-identity.test.ts
  ```

  Expected: missing ceremony-kind/CSRF exports and no session response helper.

- [ ] **Step 3: Implement the minimal boundary**

  Extend the existing challenge record with `kind: "registration" | "authentication"`; consume only when the requested kind matches. Keep the existing max-entry and TTL bounds. Generate a random CSRF token, set `HttpOnly; Secure; SameSite=Lax; Path=/` on the session cookie and `Secure; SameSite=Lax; Path=/` on the CSRF cookie, and validate the header/cookie pair only for cookie-authenticated mutations. Never log token material.

- [ ] **Step 4: Run focused tests to verify green**

  ```bash
  npm test -- tests/unit/passkey-identity.test.ts tests/unit/passkey-privacy.test.ts
  ```

- [ ] **Step 5: Commit only this task**

  ```bash
  git add src/lib/identity/passkey.ts src/lib/identity/csrf.ts src/app/api/identity/context.ts tests/unit/passkey-identity.test.ts
  git commit -m "feat: bound passkey challenges and cookie CSRF"
  ```

### Task 3: Add the real server verifier adapter and registration ceremony

**Files:**
- Modify: `src/lib/identity/webauthn.ts`
- Create: `src/app/api/identity/register/options/route.ts`
- Create: `src/app/api/identity/register/verify/route.ts`
- Test: `tests/unit/identity-registration-api.test.ts`

**Interfaces:**
- `WebAuthnVerifier.generateRegistrationOptions(input)` delegates to SimpleWebAuthn `generateRegistrationOptions`.
- `WebAuthnVerifier.verifyRegistrationResponse(input)` delegates to `verifyRegistrationResponse` and returns its verified registration info.
- `POST /api/identity/register/options` returns `{ challengeId, options }`.
- `POST /api/identity/register/verify` accepts `{ challengeId, response }` and returns `{ identityId }` only after setting session/CSRF cookies.

- [ ] **Step 1: Write a failing registration route test**

  Inject a deterministic verifier into the identity context. Assert that options issue a registration challenge, invalid/expired/replayed challenge returns an API error with no credential write, and a verified response persists the returned credential id/public key/counter and sets both cookies. Include a duplicate credential case that cannot overwrite an existing credential.

- [ ] **Step 2: Run the test to verify it fails**

  ```bash
  npm test -- tests/unit/identity-registration-api.test.ts
  ```

- [ ] **Step 3: Implement the server adapter and handlers**

  Use `attestationType: "none"`, `userVerification: "required"`, bounded display-name input, a random binary WebAuthn user id, and the challenge store's exact challenge. On verification pass `expectedChallenge`, `expectedOrigin`, `expectedRPID`, `requireUserPresence: true`, and `requireUserVerification: true`. Consume the challenge before verification and never return credential bytes in an error body.

- [ ] **Step 4: Run registration tests to verify green**

  ```bash
  npm test -- tests/unit/identity-registration-api.test.ts tests/unit/passkey-identity.test.ts
  ```

- [ ] **Step 5: Commit only this task**

  ```bash
  git add src/lib/identity/webauthn.ts src/app/api/identity/register tests/unit/identity-registration-api.test.ts
  git commit -m "feat: add WebAuthn registration ceremony"
  ```

### Task 4: Add discoverable authentication and counter enforcement

**Files:**
- Create: `src/app/api/identity/authenticate/options/route.ts`
- Create: `src/app/api/identity/authenticate/verify/route.ts`
- Modify: `src/lib/community/repository.ts`
- Test: `tests/unit/identity-authentication-api.test.ts`

**Interfaces:**
- `POST /api/identity/authenticate/options` returns `{ challengeId, options }` with no `allowCredentials` list.
- `POST /api/identity/authenticate/verify` accepts `{ challengeId, response }` and returns `{ identityId }` only after assertion verification.
- `CommunityStore.updatePasskeyCounter()` remains the only persistence path for the new counter.

- [ ] **Step 1: Write failing authentication tests**

  Inject a stored credential and verifier. Assert discoverable options, unknown credential rejection, wrong-origin/replayed-challenge rejection, successful session issuance, counter advancement, and counter rollback rejection through `nextPasskeyCounter`.

- [ ] **Step 2: Run the tests to verify they fail**

  ```bash
  npm test -- tests/unit/identity-authentication-api.test.ts
  ```

- [ ] **Step 3: Implement the authentication handlers**

  Generate an authentication challenge with `userVerification: "required"`; look up the submitted credential id in the existing repository; pass `{ id, publicKey, counter }` into SimpleWebAuthn verification; apply `nextPasskeyCounter`; update the stored counter and `last_used_at`; then set the session/CSRF cookies. Consume every challenge exactly once, including failed credential lookups.

- [ ] **Step 4: Run authentication and existing identity tests**

  ```bash
  npm test -- tests/unit/identity-authentication-api.test.ts tests/unit/passkey-identity.test.ts tests/unit/community-backend.test.ts tests/unit/encrypted-sync.test.ts
  ```

- [ ] **Step 5: Commit only this task**

  ```bash
  git add src/app/api/identity/authenticate src/lib/community/repository.ts tests/unit/identity-authentication-api.test.ts
  git commit -m "feat: add WebAuthn authentication ceremony"
  ```

### Task 5: Wire the browser adapter and CSRF into authenticated mutations

**Files:**
- Create: `src/lib/client/passkey.ts`
- Modify: `src/app/api/community/context.ts`
- Modify: `src/app/api/community/routes/route.ts`
- Modify: `src/app/api/community/routes/[routeId]/comments/route.ts`
- Modify: `src/app/api/community/routes/[routeId]/revisions/route.ts`
- Modify: `src/app/api/community/routes/[routeId]/artifacts/route.ts`
- Modify: `src/app/api/community/routes/[routeId]/rig-contributions/route.ts`
- Modify: `src/app/api/community/reports/route.ts`
- Modify: `src/app/api/sync/route.ts`
- Test: `tests/unit/identity-csrf-mutations.test.ts`
- Test: `tests/unit/passkey-client.test.ts`

**Interfaces:**
- `registerPasskey(displayName?): Promise<{ identityId: string }>` calls registration options, `startRegistration`, then registration verify.
- `authenticatePasskey(): Promise<{ identityId: string }>` calls authentication options, `startAuthentication`, then authentication verify.
- `requireMutationIdentity(request)` replaces `requireIdentity(request)` in authenticated POST handlers.

- [ ] **Step 1: Write failing mutation/client tests**

  Assert cookie-authenticated community and sync POST requests without `x-switchback-csrf` receive 403, matching token succeeds, bearer requests retain their existing behavior, and the browser adapter calls the four ceremony endpoints without exposing private credential material.

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  npm test -- tests/unit/identity-csrf-mutations.test.ts tests/unit/passkey-client.test.ts
  ```

- [ ] **Step 3: Implement the smallest wiring**

  Keep GET browse routes anonymous. Use the existing `readBoundedJsonBody`, rate limiter, request id, and API error helpers. The browser adapter reads only the CSRF cookie to send its header on later mutations; it never stores or sends private keys.

- [ ] **Step 4: Run focused identity/community/sync tests**

  ```bash
  npm test -- tests/unit/identity-csrf-mutations.test.ts tests/unit/passkey-client.test.ts tests/unit/community-backend.test.ts tests/unit/encrypted-sync.test.ts
  ```

- [ ] **Step 5: Commit only this task**

  ```bash
  git add src/lib/client/passkey.ts src/app/api/community src/app/api/sync/route.ts tests/unit/identity-csrf-mutations.test.ts tests/unit/passkey-client.test.ts
  git commit -m "feat: protect browser identity mutations with CSRF"
  ```

### Task 6: Validate, document, and reconcile the phase gate

**Files:**
- Modify: `.env.example`
- Modify: `docs/phase-reports/P32-passkey-privacy.md`
- Modify: `docs/current-architecture.md`
- Modify: `docs/recovery/TRACEABILITY.md`
- Modify: `docs/recovery/WORKLOG.md`
- Test: `tests/e2e/identity/passkey-options.spec.ts`

- [ ] **Step 1: Add the narrow browser/API acceptance test**

  Start the production test server with explicit WebAuthn localhost config and assert the options endpoints return bounded JSON, the browser context can detect WebAuthn capability, and unauthenticated community/sync mutations fail closed. Do not fake a physical authenticator or claim passkey UX from an options-only test.

- [ ] **Step 2: Run the new acceptance test and focused tests**

  ```bash
  npm test -- tests/unit/identity-*.test.ts tests/unit/passkey-*.test.ts
  npx playwright test tests/e2e/identity/passkey-options.spec.ts --project=critical-chromium
  ```

- [ ] **Step 3: Run repository gates**

  ```bash
  npm run lint
  npm run typecheck
  npm test
  npm run build
  ```

  Then sync the source to the validation host and rerun the direct Node 24 Vitest suite, critical browser suite, and the previously established PWA, memory, and real-router gates.

- [ ] **Step 4: Update phase evidence without overstating it**

  Record exact counts and command outputs. Mark real WebAuthn platform UI, physical passkey behavior, authenticated external riders, production edge policy, field rides, and recovery-kit restore as still open unless separately exercised.

- [ ] **Step 5: Commit documentation and the final implementation slice**

  ```bash
  git add .env.example docs/phase-reports/P32-passkey-privacy.md docs/current-architecture.md docs/recovery/TRACEABILITY.md docs/recovery/WORKLOG.md tests/e2e/identity/passkey-options.spec.ts
  git commit -m "docs: record WebAuthn acceptance boundary"
  ```

## Self-review checklist

- The design uses exactly one identity store, one session format, and one reviewed WebAuthn verifier.
- Every new behavior has a named red-green test step before production code.
- Production origin/RP configuration, challenge replay, counter rollback, CSRF, rate limiting, and credential secrecy are covered.
- Core local functionality remains account-free.
- No QR pairing, recovery phrase, moderation UI, native wrapper, or provider work is smuggled into this slice.
