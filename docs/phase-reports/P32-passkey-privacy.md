# P32 — Passkey identity and privacy

**Status:** implemented at the server/browser-adapter boundary; physical
authenticator and authenticated-browser acceptance remain open

## Result

- Added real `@simplewebauthn/server` registration and discoverable
  authentication ceremonies plus the matching browser adapter. The server
  verifies the exact configured origin/RP ID, user presence, user verification,
  and signature counter before issuing a session.
- Added one-time bounded passkey challenges, public-key/counter-only credential
  records, counter monotonicity checks, and HMAC-signed expiring pseudonymous
  sessions. No private key is accepted or stored.
- Cookie-authenticated community and sync mutations require the random CSRF
  cookie echoed in `x-switchback-csrf`; bearer sessions retain their API path.
- Added exact publish-preview redaction: trim controls, private-zone geometry
  removal, instruction/street-name removal for redacted intervals, and metric
  rebasing. The caller must show the returned geometry before upload.

## Verification

- Focused identity tests: 10 files / 30 tests passed on Megaplex with Node 24.
- Full Vitest on Megaplex: 201 files / 1,282 passed / 1 skipped.
- Browser/API acceptance: 32/32 standard desktop/mobile profiles, 30/30
  critical Chromium/WebKit, PWA 2/2, memory soak 10/10 cycles, and real
  GraphHopper fixture 5/5. The real-router gate was run with its fixture
  lifecycle and `GRAPHHOPPER_URL=http://127.0.0.1:8998`.
- Lint, typecheck, and production build passed. `npm audit --omit=dev` still
  reports four high-severity dependency advisories in the existing Next/
  PostCSS/sharp/nanoid tree; no forced upgrade was applied.

## Boundary

The preview is local and deterministic. The server ceremony and CSRF boundary
are implemented and tested. A real platform authenticator ceremony, an
authenticated browser session against the deployed app, external riders,
physical passkey behavior, and production edge configuration remain
deployment/manual gates.
