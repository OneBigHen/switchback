# ADR 0027 — Native iOS companion architecture

- Status: Proposed
- Date: 2026-09-25
- Owners: OpenGravel
- Scope: iPhone/iPad packaging, active-ride device integration, web/app continuity, map rendering, future CarPlay seam
- Supersedes: the "native iOS/Android apps" portion of the temporary rejection in `AGENTS.md` if this ADR is accepted
- Does not supersede: ADR 0001 routing authority, ADR 0003 offline routing packs, ADR 0006 PWA progressive enhancement, ADR 0007 location privacy, ADR 0015 Mapbox primary renderer, ADR 0016 Google 3D cinematic, ADR 0025 Recon renderer

## Context

OpenGravel now has enough browser capability that an iOS app should not become a second product or a rewrite. The current repository already contains the expensive domain work:

- deterministic TypeScript navigation and map matching in `src/lib/client/navigation-engine.ts`;
- a high-frequency camera controller that deliberately lives outside React;
- a `RideEnvironment` seam around GPS and screen wake in `src/lib/client/ride-session.ts`;
- route recovery, automatic reroute, voice guidance, ride recording, offline routing packs, route sharing, passkeys, and encrypted sync;
- a map abstraction with Mapbox GL JS as the primary online renderer and MapLibre as rollback;
- 3D presentation contracts in ADR 0015, Google 3D preview boundaries in ADR 0016, and Recon replay/cinematic rules in ADR 0025.

The PWA remains valuable, but browser lifecycle rules are the wrong authority for a motorcycle navigation session. iOS can provide continuous location delivery during an explicitly started ride, an application idle-timer override, first-class audio-session behavior, associated-domain links/passkeys, Keychain storage, and later a native CarPlay scene.

The goal is therefore not "make the website an app." The goal is one OpenGravel product with one route/navigation brain and platform-specific adapters where the operating system owns the capability.

## Decision

### 1. Keep one OpenGravel domain and routing authority

The existing TypeScript routing, scoring, navigation, reroute semantics, road locks, route eligibility, offline-routing rules, and rider data contracts remain authoritative.

The native app MUST NOT introduce:

- Mapbox Directions or Mapbox Navigation as a second route authority;
- Apple Maps directions as a second route authority;
- a second route matcher with different off-route or arrival semantics;
- a second saved-route model;
- native-only scoring or road-quality rules.

The server remains the provider boundary for GraphHopper, Valhalla, TomTom evidence, place search, weather, and other server-side capabilities.

### 2. Use Capacitor 8 as the native host, with bundled app-owned web assets

The iOS application will use Capacitor 8 and target iOS 15+.

Production builds MUST package the OpenGravel client assets in the application bundle. `server.url`, broad `allowNavigation`, or another configuration that turns the application into a remote website wrapper are development-only and MUST NOT ship.

The existing Next.js server remains deployed at the OpenGravel HTTPS origin. The mobile client talks to that server through an explicit API transport.

The whole current Next application MUST NOT be flipped to `output: "export"`. It contains dynamic Route Handlers and server behavior that are intentionally not static-exportable. The implementation will add a small iOS client build entry that consumes client-safe React/domain modules while the Next application continues to own the web and server runtime.

The preferred implementation is a bounded `apps/ios-client` client build using Vite/React plus Capacitor. This is a packaging boundary, not a second UI product. Before implementation expands, a portability spike must prove that the current planner/ride component graph can be consumed without pulling Node/server modules into the bundle.

### 3. Introduce four explicit platform boundaries before native feature work

Browser globals are not allowed to spread further through ride orchestration. Create typed platform interfaces for:

1. **Ride location** — foreground/background location updates and authorization state.
2. **Display/audio/lifecycle** — screen awake, guidance speech/audio session, foreground/background/resume.
3. **API transport** — relative web requests versus native HTTPS transport and authorization.
4. **Link/auth/secure storage** — universal links, passkeys, Keychain-backed session material.

The web adapters preserve current behavior. The iOS adapters are exposed through small Capacitor Swift plugins.

`navigation-engine.ts` and reroute policy consume normalized domain inputs and do not know which platform produced them.

### 4. Native location owns active-ride acquisition; TypeScript still owns navigation

The first native ride service uses Core Location, started only after the rider starts Ride or Free Ride.

Baseline policy:

- request **When In Use** location first;
- enable the iOS Location Updates background mode for an active ride;
- enable continuous background delivery only while the ride is active;
- do not request Always authorization unless a later capability demonstrably requires relaunch while the app is not running;
- use an activity type appropriate to the ride: road-oriented guidance uses `automotiveNavigation`; Adventure/off-road guidance may use `otherNavigation`;
- stop high-accuracy/background delivery promptly when the ride ends;
- expose accuracy, course/heading, speed, timestamp and authorization/diagnostic state through the bridge;
- buffer a bounded set of fixes natively while JavaScript is temporarily unavailable, then replay them in order on resume.

The native plugin produces the same conceptual `NavigationFix` consumed today. The TypeScript navigation engine remains the source of truth for progress, ambiguity, off-route state and arrival.

Background *recording/recovery* is required. Background spoken turn-by-turn guidance is not claimed until a physical-device gate proves the WebView/session can execute the required navigation work reliably. If it cannot, a later ADR must choose between a tiny bundled headless navigation-core runtime or a parity-tested native projection; it must not silently fork routing semantics.

### 5. Native screen-awake and guidance audio replace browser best-effort APIs on iOS

While active Ride is foregrounded, iOS owns the idle-timer override. It must be reset on ride exit and lifecycle cleanup.

Guidance audio uses `AVSpeechSynthesizer` and a short-lived `AVAudioSession` appropriate for occasional turn-by-turn prompts. It should duck ordinary audio and avoid unintelligible overlap with other spoken audio. Audio-session activation must be bounded to guidance needs and correctly deactivated afterward.

The browser implementations remain `Screen Wake Lock` and `speechSynthesis`.

### 6. Keep the existing web renderer first, but create a renderer-neutral scene contract now

The first iPhone build SHOULD reuse the existing Mapbox GL JS/MapLibre map stage inside the bundled client because it preserves visual behavior and avoids a premature second map implementation.

Before that decision is treated as final, a physical iPhone renderer spike must measure:

- Mapbox Standard 3D terrain/buildings/lighting;
- active ride camera animation;
- route and evidence overlays;
- portrait/landscape rotation;
- memory across Plan ↔ Ride ↔ Replay transitions;
- thermal/battery behavior;
- background/foreground recovery;
- token/referrer behavior from the Capacitor local origin.

At the same time, create a renderer-neutral **Map Scene Contract** so native rendering does not require rewriting planner semantics later. The contract must describe semantic data, not Mapbox-specific implementation details:

```ts
interface MapScene {
  base: "road" | "terrain" | "satellite"
  light: "dawn" | "day" | "dusk" | "night"
  terrain: { enabled: boolean; exaggeration: number }
  camera: MapCameraDirective
  routes: RouteSceneLine[]
  rider: RiderSceneState | null
  layers: SceneOverlay[]
}

interface SceneOverlay {
  id: string
  role: "surface" | "curvature" | "access" | "conditions" | "stops" | "evidence"
  slot: "bottom" | "middle" | "top" | "above"
  data: GeoJSON.FeatureCollection
  presentation: SceneOverlayPresentation
}
```

Web Mapbox GL JS and a future native Mapbox Maps SDK renderer consume the same semantic scene.

### 7. 3D rendering has one active owner at a time

The iOS architecture preserves the existing rendering boundaries:

- **Plan / Ride:** Mapbox Standard / Standard Satellite is the premium primary presentation. Standard's 3D terrain/buildings/lighting remain the intended high-quality experience.
- **MapLibre:** remains the rollback/fallback path while ADR 0015 permits it.
- **Google 3D:** remains selected-route cinematic preview only. It never becomes navigation or route authority.
- **Recon Replay/Cinematic:** remains the existing post-ride MapLibre/deck.gl experience initially.
- **No concurrent expensive canvases:** Mapbox, Google 3D and Recon must not stay simultaneously active behind one another.

If the physical renderer gate shows WebGL/WKWebView cannot meet the ride performance/thermal budget, the **active Ride map** becomes a native Mapbox Maps SDK v11 renderer. That renderer is allowed because the scene contract prevents it from becoming a second product authority. The native renderer uses Mapbox Standard slots for equivalent custom layers and Metal-backed rendering.

CarPlay, if later approved, uses the native renderer regardless of the phone renderer decision.

### 8. Separate offline routing readiness from offline map-display readiness

There are two independent offline products:

- **OpenGravel routing packs** determine whether the application can calculate/recover a route offline. ADR 0003 remains authoritative.
- **Map display packs/caches** determine whether a basemap can render offline.

A native Mapbox style pack/tile region MUST NOT be presented as "offline routing." The Prepare UI can show both statuses independently.

If native Mapbox offline maps are added, route-corridor geometries should be preferred over large bounding boxes where practical to limit storage. Native Mapbox offline data remains subject to Mapbox's current tile-pack limits and terms.

### 9. Explicit API transport replaces origin assumptions

Client code must stop assuming `window.location.origin` or relative `/api/*` always means the OpenGravel backend.

Define one API authority:

```ts
interface ApiTransport {
  request<T>(request: ApiRequest): Promise<ApiResponse<T>>
}
```

- Web implementation: same-origin fetch.
- iOS implementation: HTTPS to the configured OpenGravel backend through native transport or another explicitly validated transport.
- Server secrets remain server-only.
- Protocol/schema compatibility must be versioned so the web server can evolve without remotely replacing code in an installed binary.

The production app must never download executable JavaScript to change its core functionality.

### 10. Associated domains are the continuity boundary

OpenGravel iOS uses Apple Associated Domains for:

- `applinks` — route/share/device-link handoff;
- `webcredentials` — passkey support for the same relying-party domain.

Use a dedicated app-opening host such as `open.ride.henning.rodeo` for explicit **Open in OpenGravel** actions. Same-domain links tapped while browsing the site can legitimately remain in Safari; a dedicated associated subdomain makes handoff intent unambiguous.

All inbound link payloads are parsed through strict versioned validators. No universal link performs destructive actions.

### 11. Native authentication uses existing identity authority but keeps tokens out of IndexedDB

The existing server already accepts a signed OpenGravel session through an `Authorization: Bearer` header as well as a cookie. That is the correct native seam.

The implementation must:

- use Apple passkey APIs / associated-domain WebAuthn behavior;
- add a native session issuance path without weakening the existing verification rules;
- store the native bearer session in Keychain;
- have the native API transport attach the bearer;
- avoid exposing the bearer to IndexedDB/localStorage or ordinary React state;
- empirically record the native/WKWebView WebAuthn origin during the P0 spike before changing `expectedOrigin` policy.

Passkeys identify a rider; they do **not** derive or replace the encrypted-sync root.

### 12. Reuse the existing encrypted sync root and recovery-kit design

Web/PWA IndexedDB and an installed app's WKWebView are separate storage containers. They must never be assumed to share data.

The existing encrypted sync protocol remains authoritative. For first device linking:

- use the current 32-byte sync root / namespace recovery material;
- support QR or deep-link transfer with explicit rider confirmation;
- keep the recovery secret in the URL fragment or other client-only envelope so the transfer host cannot read it;
- store the installed native copy in protected storage where practical;
- sync routes/settings using the existing encrypted envelopes.

The existing portable route-share format is also the starting point for anonymous web → app route handoff.

### 13. CarPlay is architected now but not implemented in the first iOS wave

The app may request Apple's navigation CarPlay entitlement only after the phone navigation experience is physically qualified.

A future CarPlay implementation uses:

- a native CarPlay navigation scene and `CPMapTemplate`;
- a native base map view only;
- CarPlay templates for controls/maneuvers;
- OpenGravel route and navigation contracts, not Mapbox Directions.

The map-scene and navigation-frame wire contracts created for iOS v1 are mandatory seams so CarPlay does not force a product rewrite.

### 14. Safety and rider glanceability remain product constraints

The native shell does not justify adding dense controls while moving.

During active navigation:

- one primary instruction;
- persistent route identity and status;
- large touch targets;
- no route editing workflow while riding;
- recovery choices only when needed;
- complex planning stays in Plan;
- background location and screen-awake behavior are explicitly visible to the rider.

## Rejected alternatives

### Remote hosted WebView as the production app

Rejected. It keeps browser lifecycle dependence, weakens offline ownership, risks becoming a repackaged website, and conflicts with a self-contained binary/update model.

### Full SwiftUI rewrite

Rejected. It duplicates a mature planner/navigation domain, creates two implementations of route semantics, and dramatically expands regression surface.

### React Native rewrite

Rejected for the same product-authority reason. The problem to solve is native OS capability, not React DOM.

### Mapbox Navigation SDK / Apple Directions as navigation authority

Rejected. OpenGravel's differentiator is its own GraphHopper/Valhalla candidate generation, road evidence and deterministic selection.

### Native Mapbox for every surface on day one

Rejected as an unconditional requirement. A native renderer remains a first-class prepared path, but duplicating every planner/replay map before measuring WKWebView performance would be architecture by assumption rather than evidence.

## Consequences

### Positive

- one routing/navigation brain;
- maximum reuse of the current UI and test suite;
- real iOS background location, screen-awake, audio and associated-domain behavior;
- App Store experience materially beyond a website wrapper;
- a clean future CarPlay path;
- 3D quality can move to native Metal without a product rewrite if measurements demand it.

### Costs

- an additional client build entry and Xcode project;
- native Swift bridge code and physical-device QA;
- API transport cleanup across browser-only fetch assumptions;
- explicit storage/link/auth bridging because native and Safari containers are separate;
- native Mapbox is a possible second renderer implementation, although not a second map/product authority.

## Required proof before implementation is considered shippable

See:

- `docs/research/IOS-NATIVE-ARCHITECTURE-RESEARCH-2026-09-25.md`
- `docs/plans/IOS-NATIVE-IMPLEMENTATION-RUNBOOK.md`
- `docs/quality/IOS-NATIVE-RELEASE-GATE.md`

No agent may claim background guidance, universal-link handoff, passkey continuity, 3D parity, offline behavior, or CarPlay readiness from simulator/browser evidence alone.
