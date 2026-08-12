# Switchback WebAuthn Identity Ceremony

## Context

Switchback already has the correct storage shape for a pseudonymous identity:
the community SQLite repository stores only a credential id, public key, and
signature counter, while the session module signs short claims with the
instance secret. The missing production boundary is the actual WebAuthn
ceremony. Until it exists, community and encrypted-sync mutations cannot be
authenticated by a browser without an injected verifier.

The local rider path remains account-free. This slice only enables the
optional Level 1 identity used for publishing, comments, reports, and private
sync.

## Decision

Use `@simplewebauthn/server` and `@simplewebauthn/browser` v13.3.0 rather than
implementing CBOR, COSE, authenticator-data, and signature verification in
Switchback. The server is the trust boundary; the browser package only turns
the browser credential into the library's JSON shape.

Configuration is explicit in production:

- `SWITCHBACK_WEBAUTHN_RP_ID` is the HTTPS hostname used by the relying party.
- `SWITCHBACK_WEBAUTHN_ORIGIN` is the exact HTTPS origin accepted in
  `clientDataJSON.origin`.
- Missing production configuration fails closed. Tests and localhost may use
  explicit test values.

## Data flow

1. `POST /api/identity/register/options` rate-limits the caller, creates a
   pseudonymous identity, issues a bounded one-time registration challenge,
   and returns SimpleWebAuthn creation options plus an opaque challenge id.
2. The browser calls `startRegistration()` and posts the serialized response
   and challenge id to `/api/identity/register/verify`.
3. The server consumes the challenge before verification, checks the expected
   challenge, origin, RP id, user presence, and user verification, then stores
   only the credential id, public key, and counter. It issues the session
   cookie only after verification succeeds.
4. `POST /api/identity/authenticate/options` issues an authentication challenge
   without an account requirement, allowing discoverable passkeys.
5. `/api/identity/authenticate/verify` looks up the credential by the
   authenticator response id, consumes the one-time challenge, verifies the
   assertion against the stored public key and expected origin/RP id, advances
   the counter, and issues the same session cookie.

The challenge store is process-local, bounded, and short-lived, matching the
existing single-origin Next deployment. A failed verification requires a new
challenge; a replay cannot reuse the consumed challenge.

## Session and CSRF boundary

Successful verification sets an HttpOnly, Secure, SameSite=Lax
`switchback_session` cookie. It also sets a non-HttpOnly random
`switchback_csrf` cookie. Cookie-authenticated mutations must echo that value
in `x-switchback-csrf`; bearer-authenticated requests remain available for
non-browser clients and do not use the cookie CSRF path.

The existing community and sync mutation handlers will use a mutation-aware
identity helper. Public browse endpoints remain anonymous, and no core rider
operation checks identity.

## Failure behavior

- Bad/missing WebAuthn configuration: explicit server configuration error;
  never accept an arbitrary request origin.
- Expired, unknown, or reused challenge: 400, no credential or session write.
- Invalid origin/RP id/signature/counter: 400, no session write.
- Duplicate credential id: 409-style invalid identity response, no overwrite.
- Missing or mismatched CSRF token on a cookie mutation: 403.
- Rate limit: 429 with request id and retry-after.

Error bodies use the existing request-id/API error contract and never include
credential public-key bytes or authenticator response material.

## Verification

Test the public seams in vertical slices:

- challenge issue/consume is one-time and bounded;
- configuration rejects absent production origin/RP id;
- registration and authentication route handlers reject replay, wrong origin,
  wrong RP id, invalid response, and counter rollback through the reviewed
  verifier adapter;
- successful verification persists only public credential material and sets
  session plus CSRF cookies;
- cookie mutation without CSRF is rejected and a matching token is accepted;
- the browser adapter uses native passkey capability and sends no private key;
- existing community/sync and the full Megaplex acceptance suites remain green.

No claim of physical passkey behavior, iOS platform UI, external riders, or
production edge configuration is made by these tests.

## Explicitly deferred

QR pairing, recovery phrases, account recovery, moderation UI, and native
wrapper behavior remain separate work. The encrypted-sync recovery-kit slice
will consume the authenticated session but will not add a second identity
system.
