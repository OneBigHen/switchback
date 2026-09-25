# OpenGravel iOS implementation runbook

Status: proposed execution sequence after ADR 0027 is accepted  
Research baseline: 2026-09-25  
Rule: implementation evidence beats architecture assumptions

## Objective

Ship an iPhone application that feels like OpenGravel, not a browser wrapper:

- same planner, routes, scoring, road intelligence and saved-route semantics as web;
- reliable active-ride GPS and recovery;
- screen stays awake while foreground guidance is active;
- native guidance audio behaves correctly with other audio/Bluetooth;
- desktop/web routes can be opened in the app without re-planning;
- passkey identity and encrypted sync continue to work;
- Mapbox 3D remains visually strong and performant;
- no second routing authority;
- no fake offline/navigation claims;
- a future CarPlay implementation does not require another architecture rewrite.

Do not start with broad repo restructuring. Each phase must leave the web application green.

## Branch strategy

Implementation should be a sequence of reviewable PRs, not one giant native dump.

Recommended stack:

```text
main
 └─ PR A platform boundaries
     └─ PR B client packaging + Capacitor bootstrap
         └─ PR C native ride services
             └─ PR D continuity/auth/sync
                 └─ PR E renderer qualification / native renderer only if triggered
                     └─ PR F TestFlight hardening
```

Each PR must rebase/merge current main first and preserve newer map/routing work.

## Phase 0 — prove the risky assumptions

No product feature implementation before these spikes produce written results.

### P0.1 Client portability build

Goal: prove the existing client UI can be built as bundled application assets without a remote page.

Build a minimal disposable `apps/ios-client` entry that imports only enough real OpenGravel code to render:

- application shell;
- planner;
- one fixture route;
- map stage;
- Ride HUD.

Use Vite/React as the initial client-only bundler unless a smaller current-repo-compatible method is demonstrated.

Record:

- all imports that drag in Next server/Node-only code;
- CSS/font/public asset behavior;
- worker paths for Mapbox/MapLibre;
- dynamic import behavior;
- bundle size;
- any `window.location.origin` / relative API assumptions.

Pass condition: client bundle runs from local assets without loading application JavaScript from the production site.

### P0.2 Mapbox WKWebView/3D benchmark

On physical iPhone hardware, render a representative OpenGravel route using the existing Mapbox GL JS stage from the local app bundle.

Test:

- Road / Terrain / Satellite;
- Standard 3D objects;
- terrain;
- day/night light preset changes;
- route ribbon + alternatives;
- unpaved/curvature overlays;
- follow camera at realistic replayed GPS rates;
- rotation portrait ↔ landscape;
- Plan → Ride → Plan repeatedly;
- background 30 seconds → foreground;
- airplane mode with only already cached content.

Capture:

- FPS/frame times;
- memory;
- thermal state;
- renderer errors;
- missing tiles/styles/glyphs;
- time to useful map after resume;
- token/referrer behavior.

Do the same route on Safari/PWA as a comparison point.

Decision:
- if high-severity renderer gates pass, web Mapbox remains the first iPhone renderer;
- if not, schedule native Mapbox Ride before App Store qualification.

### P0.3 Native Mapbox parity spike

Even if the WebGL result is good, build a small native Mapbox Maps SDK view in the Xcode target as an architectural proof.

It must render from one serialized fixture `MapScene`:

- selected route;
- one alternative;
- current rider marker;
- one surface/evidence overlay;
- terrain;
- matching light preset;
- matching Standard slot placement.

Do not integrate it into production UI yet.

Pass condition: the same scene fixture can be rendered by web and native implementations without route/domain changes.

### P0.4 Background-location spike

Create only the minimum Swift service necessary to:

1. request When In Use authorization;
2. start an explicit ride session in foreground;
3. enable background location delivery;
4. write received fixes to an in-memory/native bounded buffer;
5. background/lock the phone;
6. return and inspect ordered fixes.

Test road and Adventure activity types.

Record whether OS termination/relaunch behavior is sufficient with When In Use. Do not request Always merely to make the spike easier.

### P0.5 Passkey-origin spike

With `webcredentials` associated-domain configuration in a development environment:

- test current SimpleWebAuthn in WKWebView;
- test native AuthenticationServices if needed;
- capture the actual verified origin/RP behavior;
- prove registration and assertion against the current server verifier;
- do not loosen expected-origin validation to `*` or an unchecked list.

The outcome chooses the smallest trusted implementation.

### P0.6 Universal-link and fragment spike

Configure an `applinks` development associated domain.

Test:

- normal route URL;
- portable route payload in fragment;
- recovery-root payload in fragment;
- malformed payload;
- link while app is closed;
- link while app is foreground;
- link from Safari while browsing OpenGravel.

If same-domain browser behavior is confusing, validate the dedicated `open.ride.henning.rodeo` host.

### P0 exit report

Create:

`docs/quality/IOS-P0-SPIKE-RESULTS.md`

It must state PASS / FAIL / NOT RUN per spike with device model, iOS version, commit SHA and evidence. No simulated evidence may be labeled physical.

---

## Phase A — make web code platform-clean

This phase should have no native behavior change.

### A1. Create platform types

Suggested location:

```text
src/platform/
  types.ts
  web/
    ride-location.ts
    display-audio.ts
    lifecycle.ts
    api-transport.ts
    link-router.ts
    auth-session.ts
```

Core interface shape:

```ts
export interface PlatformRuntime {
  kind: "web" | "ios"
  rideLocation: RideLocationAdapter
  display: DisplayAdapter
  guidanceAudio: GuidanceAudioAdapter
  lifecycle: LifecycleAdapter
  api: ApiTransport
  links: LinkRouter
  auth: AuthSessionAdapter
}
```

Do not create a generic service locator used everywhere. Inject at the existing orchestration boundaries.

### A2. Expand RideEnvironment rather than replace it

Refactor `ride-session.ts` so the existing web implementation remains behaviorally identical.

Add explicit events/state for:

- permission;
- accuracy authorization where available;
- foreground/background;
- buffered fixes after resume.

Keep normalized fixes in the existing domain form.

### A3. Extract speech/audio

Move cue composition into a platform-neutral function.

```text
NavigationFrame
  → guidance cue decision
  → GuidanceCue { text, priority, stage }
  → web speech adapter OR iOS speech adapter
```

Tests should prove identical cue text/staging before and after refactor.

### A4. Extract network authority

Inventory direct application `fetch("/api/...")` and `new URL("/api/...", window.location.origin)`.

Create a typed API client that can use:

- web same-origin transport;
- iOS native transport.

Do not rewrite server endpoints.

### A5. Guard web-only subsystems

Service-worker registration must execute only on the web/PWA runtime.

Browser history and URL state should be behind a link/navigation adapter where native links need different entry behavior.

### A6. Map scene model

Create the semantic scene types and pure translators from existing planner state.

Initial renderers:

- `WebMapSceneAdapter` → current Mapbox/MapLibre stage.

Native renderer remains fixture-only until Phase E.

### A verification

Required:
- lint;
- typecheck;
- full Vitest;
- critical browser;
- PWA;
- visual regression with no unexplained rebaseline;
- real-router gate.

This phase is not complete if web behavior visibly changes.

---

## Phase B — add the packaged iOS client

### B1. Add bounded client app

Preferred tree:

```text
apps/
  ios-client/
    index.html
    src/
      main.tsx
      runtime.ts
    vite.config.ts

ios/
  App/
    ...
```

Do not move all existing `src/` code into packages first. Alias/import the proven client-safe modules. Extract shared packages later only where the boundary earns it.

### B2. Add Capacitor 8

Production config:

- packaged `webDir`;
- no production `server.url`;
- no broad production `allowNavigation`;
- logging not production-verbose;
- safe-area behavior verified;
- explicit application identifier/name.

### B3. Establish native build secrets

Never commit:

- Mapbox secret download token;
- session secret;
- provider secrets.

Use Xcode build settings / xcconfig / CI secrets for native configuration.

Mapbox iOS gets a separate least-privilege public runtime token from the website token.

### B4. Build identity

Add the application bundle ID and required associated domains to the AASA file. Do not guess the production Apple Team ID in committed source until known; use a documented config placeholder in development templates.

### B5. Client/server capability handshake

Add a lightweight endpoint/response that tells an installed client:

- API contract version;
- minimum supported client contract;
- available providers/features;
- maintenance/degraded state where relevant.

Old clients must get a typed upgrade/degraded message rather than parsing an incompatible response.

---

## Phase C — native ride services

Implement one focused Capacitor plugin, preferably split into small Swift services internally rather than many unrelated plugins.

Suggested shape:

```text
OpenGravelPlatformPlugin
  LocationService
  DisplayAwakeService
  GuidanceAudioService
  LifecycleService
  SecureSessionStore
  UniversalLinkRouter
```

### C1. LocationService

Responsibilities:

- authorization state;
- high-accuracy active ride updates;
- activity type;
- background enable/disable;
- bounded native fix buffer;
- lifecycle diagnostics;
- explicit stop.

Non-responsibilities:

- route matching;
- off-route logic;
- reroute decisions;
- route scoring;
- selecting maneuvers.

Bridge payload example:

```json
{
  "coordinate": [-75.123, 40.234],
  "accuracyMeters": 7.2,
  "headingDegrees": 128,
  "speedMetersPerSecond": 14.1,
  "timestamp": 1790366400000,
  "sourceSequence": 381
}
```

The monotonic `sourceSequence` makes buffered/replayed fixes idempotent.

### C2. DisplayAwakeService

Expose:

- `setRideDisplayAwake(true|false)`.

Native code must always restore the default on:

- ride exit;
- plugin reset;
- unrecoverable session stop.

Do not hold the idle timer disabled just because the app is open.

### C3. GuidanceAudioService

Expose semantic cue requests, not arbitrary native speech knobs.

Suggested API:

```ts
speak(cue: {
  text: string
  stage: "prepare" | "soon" | "now" | "warning"
  interrupt: boolean
}): Promise<void>
cancel(): Promise<void>
```

Swift owns the audio session, ducking and restoration.

### C4. LifecycleService

Publish:

- foreground;
- inactive/interrupted;
- background;
- memory warning;
- native buffered-fix availability.

On resume, restore in this order:

1. reconcile active ride ID;
2. drain native fixes;
3. update navigation model;
4. refresh navigation store;
5. restore renderer/camera;
6. resume speech eligibility.

### C5. Ride checkpoint bridge

Continue writing existing ride recovery data. Add only enough native metadata to reconcile a native location session to a route/ride ID.

Do not build a second native route journal in C.

---

## Phase D — web/app continuity, identity and encrypted sync

### D1. Universal-link router

One strict parser handles:

- route import;
- shared route;
- sync/recovery link;
- ordinary app navigation.

Unknown versions fail closed with a readable message.

### D2. Anonymous route transfer

Wire **Open in OpenGravel** on web to the existing redacted portable route encoding.

Requirements:

- no unredacted precise route history in a public URL;
- no automatic save;
- import preview before replacing an active route;
- duplicate/import conflict behavior defined.

### D3. Native passkey session

After P0 establishes the ceremony:

- server verifies with existing identity store;
- native receives signed session token;
- token stored Keychain only;
- native API transport injects bearer;
- logout deletes Keychain token;
- no token logging/telemetry.

### D4. Sync-root bootstrap

Support scanning/importing the current recovery QR/seed from web.

Flow:

```text
web device
  Show recovery QR
      ↓
iPhone scans
      ↓
validate checksum/version
      ↓
show namespace/link confirmation
      ↓
store root securely
      ↓
passkey authenticate
      ↓
link namespace
      ↓
sync encrypted routes/settings
```

Never send the clear sync root to the sync server.

### D5. Background sync scope

Do not add silent background cloud syncing in the first native release unless there is a rider problem it solves. Explicit/on-resume sync is easier to reason about and preserves the current privacy model.

---

## Phase E — renderer qualification

### E1. Web renderer remains default only if evidence supports it

Run the release gate on at least:

- one current high-end iPhone;
- one supported older/slower iPhone.

Use a representative urban route, twisty rural route and Adventure route.

### E2. Native Ride renderer, only if trigger is hit

If required, implement `NativeMapSceneRenderer` in Swift using Mapbox Maps SDK via Swift Package Manager.

It consumes only `MapScene`.

Implement parity in this order:

1. Standard Road/Terrain/Satellite;
2. selected route and alternatives;
3. rider puck/matched position;
4. camera directives;
5. evidence layers/slots;
6. terrain/lighting;
7. manual gesture → suspend follow;
8. Recenter;
9. offline style/tile-region support if needed for v1.

The native renderer does not call routing providers.

### E3. Camera parity

Before adding two camera algorithms, extract the pure decision portion of the existing camera controller into a serializable `MapCameraDirective`.

Web:
`NavigationFrame → camera policy → MapCameraDirective → map.easeTo`

Native:
`NavigationFrame → camera policy → MapCameraDirective → Mapbox native camera`

If the native view cannot receive directives reliably in a background/CarPlay scenario, that is a future navigation-runtime problem, not permission to invent different camera/route logic silently.

### E4. 3D presets

Preserve product intent, not pixel-identical engines:

- Road: restrained pitch, labels first;
- Terrain: relief on, useful horizon, no gimmick camera;
- Satellite: Standard Satellite with appropriate overlay contrast;
- Replay/Cinematic: post-ride only;
- Google 3D: preview only.

At ride speed, readability wins over maximum 3D drama.

---

## Phase F — App Store/TestFlight hardening

### F1. Privacy

Prepare:

- `NSLocationWhenInUseUsageDescription`;
- background location capability;
- privacy manifest entries required by included SDKs/APIs;
- App Store privacy labels;
- privacy policy wording matching actual telemetry/location behavior.

No Always-location prompt unless implementation has a documented requirement.

### F2. Review mode

App Review must be able to exercise the application.

Provide either:

- a fully useful no-account path with fixture/demo route; and
- review notes explaining background location, offline packs, passkeys and optional providers.

The app must not require private homelab access.

### F3. Binary/update discipline

- executable client assets shipped with binary;
- backend can return data/configuration, not executable feature code;
- versioned API contracts;
- migration tests across at least previous release → candidate.

### F4. Observability

Native diagnostics may record:

- app build;
- iOS version/device class;
- renderer kind;
- location permission state;
- background mode state;
- memory warning count;
- renderer errors;
- lifecycle transitions;
- route/reroute outcome bands.

Do not record raw GPS coordinates, full GPX, precise route geometry or sync-root/session secrets in telemetry.

---

## Explicit non-goals for first iOS release

- CarPlay implementation;
- Android;
- Mapbox Navigation SDK;
- new routing engine;
- native rewrite of Planner;
- native rewrite of route library;
- social/community expansion;
- automatic Always-location permission;
- background cloud sync;
- Google 3D as navigation;
- replacing Recon with native;
- replacing the current encrypted sync protocol.

## Definition of done

The first iOS release is technically ready only when:

- local bundled client starts with no hosted-web-code dependency;
- web/PWA remains green;
- same route produces the same route/nav semantics on web and iOS;
- native location works through foreground/background/resume;
- ride screen awake behavior starts/stops correctly;
- guidance audio survives tested interruptions;
- universal link imports a web-created route;
- passkey identity works with strict origin/RP validation;
- bearer stays in Keychain;
- encrypted route/settings sync works after secure root bootstrap;
- offline UI separately reports routing and basemap readiness;
- one active renderer rule holds;
- Mapbox 3D meets physical device gate or native Ride renderer is used;
- TestFlight physical matrix passes;
- known limitations are documented rather than hidden.

See `docs/quality/IOS-NATIVE-RELEASE-GATE.md` for the evidence matrix.
