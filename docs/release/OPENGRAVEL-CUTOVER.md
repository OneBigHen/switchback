# OpenGravel public-brand cutover

This document is the authority for the Switchback -> OpenGravel public-brand transition.
It supplements `docs/COMPATIBILITY.md`; it does not replace the persisted-data migration register.

## Rule

Do **not** globally replace `Switchback`, `switchback`, `SB`, or `sb`.

OpenGravel is the canonical rider-facing product name. Existing storage, authentication,
protocol, deployment, test-harness, and internal implementation identifiers remain stable
unless a separately tested migration explicitly changes them.

When a legacy-looking identifier is not classified below, stop and classify it before editing.

## Classification

| Identifier / surface | Class | Cutover action | Why |
|---|---|---|---|
| Rider-visible product name, headings, dialogs, share copy, install/PWA metadata, app icons | **Public now** | Use `OpenGravel` / `PRODUCT_BRAND` | This is the visible rebrand |
| WebAuthn RP **display name** (`rpName`) | **Public now** | Default to `OpenGravel`; explicit operator override remains supported | Display label is branding, not trust identity |
| `SWITCHBACK_WEBAUTHN_RP_ID` value and configured production RP ID | **Preserve** | Do not change during rebrand | Changing RP ID can strand existing passkeys |
| `SWITCHBACK_WEBAUTHN_ORIGIN` value and configured production origin | **Preserve** | Do not change during rebrand unless deployment/domain migration is separately planned and proven | Origin participates in WebAuthn verification |
| `SWITCHBACK_WEBAUTHN_RP_ID`, `SWITCHBACK_WEBAUTHN_ORIGIN`, `SWITCHBACK_WEBAUTHN_RP_NAME` env var names | **Preserve** | Keep names; new aliases require an explicit compatibility plan | Operator/deployment API |
| `SWITCHBACK_SESSION_SECRET` env var name | **Preserve** | Keep | Operator/deployment API; rotating/renaming is unrelated to public branding |
| `switchback_session` cookie name | **Preserve** | Keep | Existing authenticated sessions depend on it |
| Route-library IndexedDB default `switchback` | **Preserve** | Keep | Renaming without a data migration creates a new empty DB and hides saved routes |
| Sync IndexedDB default `switchback-sync` | **Preserve** | Keep | Existing sync root/outbox/inbox live under this DB |
| Recovery format `switchback-sync-recovery`, URI prefix `switchback-sync:`, seed marker `SB1` | **Preserve** | Keep | Durable recovery-kit wire format; old kits must continue restoring |
| Existing persisted schema versions and migration hooks | **Preserve** | Keep | Installed PWAs can carry old local data indefinitely |
| `--sb-*` CSS custom properties | **Preserve** | Keep for this cutover | Internal design-system API; rename has no rider value and broad blast radius |
| `SWITCHBACK_E2E_MODE` and other test/deployment harness variables | **Preserve** | Keep for this cutover | Internal automation API |
| npm package name `switchback-moto` | **Preserve** | Keep for this cutover | Internal build identity; no rider-facing value in changing it now |
| Internal class/type/file names such as `SwitchbackDatabase` | **Preserve** | Do not churn merely for spelling | Internal-only naming; rename later only as focused cleanup |
| Existing public legacy URLs/deep links, if any | **Alias** | Keep old route working and point it at the canonical OpenGravel surface | Links may already exist outside the app |
| A persisted identifier that must eventually use OpenGravel | **Migrate** | Add dual-read/one-write or explicit migration, regression tests, rollback story, and deletion condition before changing | Never strand local rider data |

## Authentication invariant

A brand change may change only the human-visible WebAuthn RP name. It must not silently
change the production RP ID, expected origin, credential IDs, session token format, or cookie
name. Existing credentials and sessions must remain readable.

## Storage invariant

A rider upgrading from a Switchback-branded build to an OpenGravel-branded build must see the
same saved routes, sync state, offline packs, settings, and recoverable in-progress rides. A
new brand name is not a data-migration event.

## Recovery invariant

Recovery seeds created before the public rebrand must remain importable after the rebrand.
Do not rewrite `SB1`, `switchback-sync-recovery`, or `switchback-sync:` as cosmetic cleanup.

## Cheap-agent work boundary

A lower-cost agent may mechanically remove remaining **rider-facing** Switchback copy and old
public asset references after checking each match against this table. It must not change a
**Preserve** item, invent a migration for a **Migrate** item, or remove an **Alias** without
proof that the legacy public address has never shipped.

For every remaining match, report one of: `PUBLIC_RENAME`, `PRESERVE`, `ALIAS`, `MIGRATE`, or
`FALSE_POSITIVE` (for ordinary English uses such as a road switchback). Unknowns are blockers,
not permission to guess.

## Verification gates

Before PR #126 can leave draft:

1. Brand/unit characterization tests pass.
2. `npm run lint` passes.
3. `npm run typecheck` passes.
4. `npm test` passes.
5. `npm run build` passes.
6. `npm run test:e2e:pwa` passes.
7. `npm run test:e2e:real-router` passes.
8. Required visual regression/rider-flow checks pass at the exact final head.
9. A final legacy-string inventory has no unclassified match.

Do not merge from this document or from an agent handoff alone; merge readiness requires the
exact-head verification evidence above.
