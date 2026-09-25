# OpenGravel iOS native implementation dispatch

Use this only after ADR 0027 is accepted.

## Mission

Build the OpenGravel iOS application from the current `main` state using:

- `docs/adr/0027-ios-native-companion-architecture.md`
- `docs/research/IOS-NATIVE-ARCHITECTURE-RESEARCH-2026-09-25.md`
- `docs/plans/IOS-NATIVE-IMPLEMENTATION-RUNBOOK.md`
- `docs/quality/IOS-NATIVE-RELEASE-GATE.md`
- the current `AGENTS.md`, Astra design system and existing ADRs.

Do not stop at another architecture document. Execute the implementation in bounded PRs, beginning with the P0 spikes.

## Non-negotiable product authority

There is one OpenGravel product.

Preserve these existing authorities:

- GraphHopper/Valhalla/OpenGravel remain routing authorities.
- Existing TypeScript route eligibility/scoring remains selection authority.
- `navigation-engine.ts` remains navigation/map-matching authority.
- Existing reroute/road-lock semantics remain authoritative.
- Existing route/settings data models remain authoritative.
- Existing encrypted sync remains the sync protocol.
- Mapbox is a renderer, not a route provider.
- Google 3D remains preview only.
- Recon remains post-ride.
- Web/PWA remains first-class and must not regress.

Do not introduce Mapbox Navigation SDK, Mapbox Directions, Apple Directions, Firebase/Auth0/Supabase, a second route library, or a second native scoring model.

## Execution order

### Packet 0 — prove assumptions first

Create an implementation branch from latest main and complete all P0 spikes from the runbook.

Required outputs:

1. local packaged React client proof;
2. real-iPhone Mapbox GL JS 3D/performance evidence;
3. native Mapbox `MapScene` fixture proof;
4. native Core Location background buffer proof;
5. passkey-origin proof;
6. universal-link/fragment proof;
7. `docs/quality/IOS-P0-SPIKE-RESULTS.md`.

Do not claim a physical test you did not run. Simulator results must say simulator.

If no physical iPhone is available in the environment, finish every automatable portion, produce the TestFlight/device build and exact owner test instructions, and mark the physical rows NOT RUN. Do not invent them.

### Packet A — platform boundaries

Refactor browser APIs behind typed adapters while preserving web behavior.

The first review should be able to answer:

- Where does location enter the domain?
- Where does screen-awake live?
- Where are guidance cues generated versus spoken?
- Where does API origin/auth live?
- Where are app links parsed?
- Where is secure native session material stored?
- What code is shared between web and iOS?

Add regression tests before behavior-changing native work.

### Packet B — Capacitor/local client

Add Capacitor 8 and the bounded local client build.

Production invariants:

- bundled assets;
- no `server.url`;
- no broad `allowNavigation`;
- iOS 15+;
- Xcode/Swift project reproducible;
- no committed secret token;
- backend URL explicit;
- startup has a useful offline/degraded state.

### Packet C — native ride services

Implement the Swift platform bridge:

- Core Location active ride session;
- background update enable/disable;
- bounded ordered fix buffering;
- native display awake;
- AVSpeechSynthesizer/audio session;
- lifecycle events;
- Keychain session storage;
- universal-link routing.

Keep route matching/reroute decision logic in TypeScript.

### Packet D — continuity/security

Implement:

- associated domains;
- strict universal links;
- web → app portable route handoff;
- passkey native session flow;
- Keychain bearer injection through the native API transport;
- encrypted sync-root QR import/linking;
- two-device sync drill.

Never put session bearer or sync root in telemetry/logs.

### Packet E — renderer decision

Use the P0 evidence.

If web Mapbox passes:
- keep it for first phone release;
- retain the native `MapScene` fixture path;
- do not expand duplicate renderer code.

If it fails a release-blocking gate:
- implement native Mapbox active Ride using Mapbox Maps SDK through Swift Package Manager;
- consume the same `MapScene`;
- do not rewrite planner/routing;
- explicitly destroy/suspend the web map while native Ride owns the screen.

Either way preserve:
- Standard Road/Terrain/Satellite;
- terrain and lighting;
- route/evidence slots;
- one expensive renderer at a time;
- Google 3D preview-only;
- Recon post-ride-only.

### Packet F — TestFlight qualification

Run the complete native release gate.

Do not ask the owner to inspect giant logs. Produce a concise result:

```text
IOS READY FOR TESTFLIGHT
IOS BLOCKED — <specific defect>
OWNER DEVICE ACTION REQUIRED — <exact physical check>
```

Attach precise evidence paths and the exact SHA.

## Engineering rules

- Prefer one thin Swift plugin with internally separated services over an ecosystem of third-party native plugins.
- Do not use the generic Capacitor Geolocation plugin as the active-ride background location authority; its current documentation says it does not directly support background geolocation.
- Prefer Apple's public APIs.
- Use Swift Package Manager for Mapbox; Mapbox is sunsetting CocoaPods distribution in December 2026.
- Do not weaken CSP, WebAuthn origin checks, token scope, CSRF or associated-domain validation to make the native build work.
- Do not make the website Mapbox token less restricted for the app. Use a separate client token/configuration.
- Do not change the entire Next app to static export.
- Do not duplicate `PlannerShell` UX for native.
- Do not hide failures behind retries, snapshot rebaselines or mock native success.
- Every confirmed bug gets a regression at the earliest useful layer.

## Design rules

The iOS application should look like OpenGravel, not like an Ionic demo.

Reuse the current design language:

- map-first;
- restrained chrome;
- route geometry is the visual hero;
- 3D terrain when useful, not as decoration;
- calm hierarchy;
- opaque/high-contrast active maneuver card;
- large controls at speed;
- safe-area-correct portrait and landscape;
- no planning density in Ride;
- no generic native tab scaffold if the existing OpenGravel shell already solves the task better.

Native system UI is appropriate for:

- permission prompts;
- passkeys;
- share sheet;
- camera/QR scanning;
- system errors/settings;
- CarPlay later.

Do not rewrite ordinary OpenGravel surfaces into SwiftUI just because the app now contains Swift.

## Stop/decision conditions

Stop and report rather than inventing a new authority if any of these occur:

- client-safe React cannot be packaged without pulling server code;
- passkey native origin cannot be verified without weakening security;
- WebGL map fails physical performance gates and native map integration requires a new UX authority;
- background guidance would require duplicating navigation semantics;
- Mapbox licensing/token/offline constraints conflict with the intended product;
- App Store policy requires a product-level behavior change;
- CarPlay entitlement becomes a blocker.

For the renderer case, the accepted fallback is already defined: native Mapbox Ride consuming `MapScene`.

## First response after dispatch

Do not return a generic plan. Start by:

1. fetching latest main;
2. identifying current open map/routing branches that could conflict;
3. creating the implementation branch/worktree;
4. building the P0 client portability spike;
5. running existing quality gates;
6. reporting the first concrete result and any blocker.

Proceed autonomously through the automatable work. Ask the owner only for operations that genuinely require their Apple account, physical device, credential, entitlement or secret.
