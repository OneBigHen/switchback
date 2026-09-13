# OpenGravel rename compatibility ledger

This file tracks legacy `Switchback` / `switchback` identifiers during the compatibility-first public rebrand.

## Class 1 — safe to rename in PR A

- Rider-facing product name and current marketing copy.
- Browser metadata and PWA manifest display strings.
- Shell logo/wordmark treatment and accessible labels.
- Current README/product guardrail/design-contract prose where the name denotes the current product rather than history.
- Private implementation comments and local-only helper names when changing them does not create noisy conflicts.

## Class 2 — rename with compatibility alias

These are candidates for later canonical `OPENGRAVEL_*` names that must continue accepting the legacy variable during a deprecation window:

- `SWITCHBACK_GEOCODER_BBOX`
- `SWITCHBACK_GEOCODER_REGION`
- `SWITCHBACK_SESSION_SECRET`
- `SWITCHBACK_WEBAUTHN_RP_ID`
- `SWITCHBACK_WEBAUTHN_ORIGIN`
- `SWITCHBACK_WEBAUTHN_RP_NAME`
- `NEXT_PUBLIC_SWITCHBACK_PREMIUM_MAPBOX`
- QA/test mode environment variables such as `SWITCHBACK_E2E_MODE`

Alias rule when implemented: OpenGravel name wins when both are set; legacy-only deployments must keep working. Each alias requires focused runtime coverage before it lands.

## Class 3 — explicit migration required

- Dexie route-library database name `switchback`.
- Any `localStorage`, `sessionStorage`, Cache Storage, IndexedDB, cookie, SQLite, or filesystem key/path containing `switchback` that persists state across versions.

The current route-library database name must remain `switchback` in PR A. Renaming it directly would create a new empty database and make existing saved rides appear missing. A later migration must be idempotent, preserve route identity/timestamps, detect partial target state, and keep the old database until copy verification succeeds.

## Class 4 — defer until infrastructure cutover

- Production hostname and DNS/TLS configuration.
- WebAuthn RP ID/origin values coupled to the current hostname.
- GitHub repository slug `OneBigHen/switchback`.
- Deployment URLs, callbacks, badges, and external references that must remain operational until the replacement domain exists.

## PR A policy

Normal rider-facing branding becomes OpenGravel now. Legacy identifiers may remain only when they are historical truth, compatibility-sensitive, persistence-sensitive, or infrastructure-coupled. Every remaining technical legacy identifier must fit one of the classes above before this PR is marked ready.
