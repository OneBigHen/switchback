# OpenGravel public rebrand design

Status: approved for implementation
Baseline: `main@c649214e4729c76649b38300422d1c8a4758ba4c`
Branch: `rebrand/opengravel-public-transition`

## Goal

Rebrand the rider-facing product from **Switchback** to **OpenGravel** now, without breaking saved rider data, deployment configuration, WebAuthn, CI, active pull requests, or existing hostnames. The current hostname and repository slug remain unchanged until a later infrastructure cutover.

This is a compatibility-first transition, not a search-and-replace.

## Product position

OpenGravel remains a motorcycle trip decision engine built around real road geometry, route quality, open/self-hosted routing, surface evidence, trip preparation, and ride-focused interaction. The rebrand broadens the identity around gravel, backroads, and open routing without turning the product into a generic outdoor lifestyle app.

Primary product name: **OpenGravel**
Primary line: **Open routes. A wilder tomorrow.**
Secondary brand line where a shorter functional line is required: **Find routes worth riding.**

The product may still describe itself as motorcycle-first where functional accuracy requires it.

## Visual quality bar

The implementation must look intentional, restrained, and production-designed.

It should feel like a premium cartographic field instrument for riders, informed by topographic maps, trail notebooks, motorcycle instrumentation, durable outdoor equipment, and well-designed navigation products.

It must not look like:

- an AI-generated SaaS dashboard;
- a generic DTC outdoor landing page;
- a collage of decorative cards;
- a glassmorphism/gradient/sparkle template;
- a one-off mockup pasted on top of the existing system;
- an indiscriminate "rustic" skin that hurts readability.

The map remains the atmospheric surface; chrome remains controlled and functional. Brand motifs are used selectively, not repeated behind every component.

## Brand system

The current V2 design contract is already close to the desired OpenGravel direction and should evolve rather than be discarded.

Canonical visual direction:

- deep charcoal/ink surfaces;
- warm off-white canvas/paper;
- gravel tan and sandstone neutrals;
- restrained earthy copper/ember accent;
- muted sage/stone support colors;
- signal blue retained for live location/navigation semantics;
- topo contour motif used only on brand/public/empty/offline artwork surfaces;
- Inter for body/control/numeric UI;
- compact condensed display face only where the current design contract already calls for one.

Accessibility semantics outrank brand purity. Danger, GPS, warning, and focus states must remain semantically distinct and WCAG-compliant.

## Scope: PR A — public OpenGravel transition

### 1. Canonical brand identity

Introduce a single product-brand authority for rider-facing strings and metadata. Avoid scattering ad-hoc literals across the app.

Canonical values should cover at minimum:

- product name;
- short product name;
- primary tagline;
- functional short description;
- long product description where reusable;
- public-facing support copy used by metadata/manifest/about surfaces.

The brand authority must not become a generic configuration framework.

### 2. Rider-facing product rename

Replace user-visible Switchback references with OpenGravel where the reference is branding rather than historical, compatibility, or technical terminology.

Expected surfaces include:

- document/page metadata;
- PWA manifest;
- app install name;
- shell/logo treatment;
- onboarding, empty, about, help, share, export, and public-facing text;
- share/social metadata if present;
- README and current product-facing documentation;
- accessible names and logo alt text.

Do not rewrite functional motorcycle terminology merely to make the product sound broader.

### 3. Logo and icon system

Replace the current Switchback app icon/mark with an OpenGravel identity that follows the approved circular mountain/gravel-road/navigation concept and current design language.

Implementation requirements:

- clean vector-first asset(s);
- legible at favicon/PWA sizes;
- no photorealistic or generated raster dependence for core identity;
- one primary mark plus a deliberately simplified small-size variant if needed;
- asset naming should be OpenGravel-oriented where safe;
- current paths may be retained temporarily when path changes would create unnecessary churn, but visible/accessible identity must be OpenGravel.

The production icon should be redrawn/simplified from the approved direction rather than embedding an image-generation mockup.

### 4. Design contract update

Update the active design contract from Switchback to OpenGravel while preserving the interaction and accessibility rules already proven in production.

Brand-token names that are purely documentation labels may become OpenGravel-oriented. CSS custom properties with established `--sb-*` names are compatibility-sensitive and should remain for PR A unless changing them is proven low-risk and materially useful.

### 5. Public documentation

Update the README and current authoritative docs so a new contributor sees OpenGravel as the product name.

Historical archives, old PR evidence, ADR rationale, and migration history should not be rewritten merely to erase the previous name. Historical truth stays historical truth.

### 6. Package identity

`package.json` currently uses `switchback-moto`. The package is private, but changing it can affect lockfile/workflow assumptions. Audit before changing. If the package rename is mechanically safe, use an OpenGravel-oriented private package name in PR A; otherwise document it for PR B.

### 7. Validation

PR A must satisfy the repository's normal protected gates for its exact head. In addition:

- deterministic test for canonical brand values;
- manifest/metadata assertions updated to OpenGravel;
- a repository audit that distinguishes intentional legacy `switchback` references from accidental rider-facing leftovers;
- no saved-route storage loss;
- no WebAuthn contract change;
- no deployment hostname requirement;
- no visual-baseline acceptance without inspecting the actual changes.

## Compatibility audit: PR B preparation

Every remaining `switchback` identifier must be assigned one of four classes.

### Class 1 — safe to rename

Pure internal identifiers with no persisted/external consumer and no meaningful branch-conflict cost.

Examples may include comments, local helper names, dead documentation labels, and non-exported constants.

Rename these in PR A when it improves clarity without creating noisy diffs.

### Class 2 — rename with compatibility alias

External or deployment-facing identifiers that can safely gain a new canonical OpenGravel name while temporarily accepting the old one.

Likely candidates:

- `SWITCHBACK_GEOCODER_BBOX`;
- `SWITCHBACK_GEOCODER_REGION`;
- `SWITCHBACK_SESSION_SECRET`;
- `SWITCHBACK_WEBAUTHN_*`;
- `NEXT_PUBLIC_SWITCHBACK_PREMIUM_MAPBOX`;
- test/QA mode environment names.

Preferred future behavior:

1. read `OPENGRAVEL_*` first;
2. fall back to the corresponding `SWITCHBACK_*` name;
3. document old names as deprecated compatibility aliases;
4. never make an existing deployment fail because only the old variable is set.

Aliases should be introduced only where the runtime read path can be covered with focused tests.

### Class 3 — explicit migration required

Identifiers tied to persisted browser/server state must not be renamed without migration logic and rollback proof.

Confirmed example:

- Dexie route library database default name: `switchback`.

A direct rename would create a fresh database and make existing saved routes appear missing. PR A must preserve the existing database namespace. PR B must design a copy/upgrade strategy that is idempotent, detects source/target state, preserves route identity and timestamps, and does not delete the old database until migration success is proven.

Audit localStorage/sessionStorage/cache names and server-side SQLite filenames for the same risk.

### Class 4 — defer until infrastructure cutover

Identifiers coupled to deployment or repository location should remain stable until the user owns the replacement domain and the deployment move is scheduled.

Includes:

- production hostname;
- WebAuthn RP ID/origin values tied to the hostname;
- GitHub repository slug;
- deployment URLs, callback URLs, badges, and docs that must remain operational;
- DNS/TLS/redirect configuration.

The later cutover should include redirect/rollback instructions and a deliberate WebAuthn decision rather than silently changing relying-party identity.

## Active-branch safety

At design time, substantial active PRs include #109, #119, #122, #123, and #124. The rebrand must avoid broad mechanical churn in routing/domain files that those branches are actively changing.

Prefer changes at brand/metadata/shell/documentation boundaries. When a visible Switchback literal exists inside a heavily active subsystem, change the smallest possible surface rather than renaming surrounding implementation concepts.

## Implementation sequence

1. Add canonical brand authority and focused tests.
2. Replace metadata/PWA identity and core visible brand surfaces.
3. Add production-quality OpenGravel vector mark/icon assets.
4. Update shell/public/about/share branding without redesigning functional interaction.
5. Update README and active design/product docs.
6. Add a compatibility audit document listing every intentional legacy identifier and migration class.
7. Introduce only low-risk OpenGravel env aliases that have direct tests; otherwise defer them with exact rationale.
8. Run protected quality gates and inspect visual diffs.
9. Open as a draft PR until exact-head CI and visual review are green.

## Non-goals for PR A

- no domain migration;
- no GitHub repository rename;
- no destructive storage/database rename;
- no WebAuthn RP-ID/origin cutover;
- no routing-engine behavior changes;
- no product-information architecture redesign;
- no broad component rewrite;
- no fake social/community expansion;
- no replacement of proven accessibility semantics with brand colors.

## Completion criteria

PR A is complete when:

- a rider cannot encounter the old brand in normal product use except where compatibility/history makes it intentional;
- installed PWA/browser metadata says OpenGravel;
- the app uses a credible OpenGravel mark/icon suitable for production, not a generated mockup artifact;
- the existing product interaction model remains stable;
- saved local routes remain visible;
- current deployment configuration continues to work;
- the B audit makes every remaining legacy identifier intentional and gives it an explicit migration path;
- exact-head required CI is green and visual changes are reviewed rather than blindly rebaselined.
