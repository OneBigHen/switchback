# OpenGravel native iOS architecture research

Date: 2026-09-25  
Status: research complete enough to dispatch implementation only after ADR 0027 is accepted  
Repository baseline: `main@06785c00e2ad9b51d12b1a4bb6c655ebb0f606c7`

## Executive conclusion

OpenGravel should become an iOS application by adding a **bundled Capacitor 8 client plus narrow native Swift services**, not by rewriting the product and not by pointing a production WebView at the hosted site.

The current codebase is already unusually close to the right architecture:

- `navigation-engine.ts` is pure TypeScript and independent of React/native UI.
- `NavigationCameraController` already isolates high-frequency map work from React rendering.
- `ride-session.ts` already abstracts GPS and Wake Lock behind `RideEnvironment`.
- `useNavigationSessionController.ts` owns the session/reroute/recovery workflow and exposes the remaining browser-specific seams clearly.
- `RideHud` is mostly presentation on top of that controller.
- offline routing, route share, encrypted sync and passkey identity already have explicit contracts.
- Mapbox/MapLibre/Google 3D/Recon each already have documented ownership boundaries.

The architecture work is therefore primarily **platform separation**, **packaging**, **identity/handoff**, **renderer contracts**, and **physical-device qualification**.

## Research method

This assessment used three evidence classes.

### A. Current repository evidence

Inspected the current implementation and relevant ADRs:

- `package.json`
- `README.md`
- `AGENTS.md`
- `next.config.ts`
- `src/components/planner/PlannerShell.tsx`
- `src/components/planner/MapStage.tsx`
- `src/components/planner/RideHud.tsx`
- `src/components/planner/useNavigationSessionController.ts`
- `src/components/planner/useRideCheckpoint.ts`
- `src/lib/client/navigation-engine.ts`
- `src/lib/client/navigation-camera-controller.ts`
- `src/lib/client/ride-session.ts`
- `src/lib/client/planner-location.ts`
- `src/lib/client/passkey.ts`
- `src/lib/client/sync-controller.ts`
- `src/lib/identity/webauthn.ts`
- `src/lib/identity/passkey.ts`
- `src/lib/identity/csrf.ts`
- `src/lib/sync/encrypted-sync.ts`
- `src/lib/sync/client-store.ts`
- `src/lib/sync/recovery-kit.ts`
- `src/lib/share/route-share.ts`
- `public/sw.js`
- ADRs 0003, 0006, 0007, 0015, 0016 and 0025
- Astra architecture, design-system and release-gate documents
- recent map/mobile/navigation PRs, especially #28, #35, #82, #119, #127, #139 and #148.

### B. Current platform documentation

Primary sources were preferred. Links were checked on 2026-09-25:

**Capacitor**
- https://capacitorjs.com/docs
- https://capacitorjs.com/docs/config
- https://capacitorjs.com/docs/ios
- https://capacitorjs.com/docs/apis/geolocation

**Apple**
- https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background
- https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates
- https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services
- https://developer.apple.com/documentation/corelocation/clactivitytype
- https://developer.apple.com/documentation/uikit/uiapplication/isidletimerdisabled
- https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/duckothers
- https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/interruptspokenaudioandmixwithothers
- https://developer.apple.com/documentation/xcode/supporting-associated-domains
- https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app
- https://developer.apple.com/documentation/authenticationservices/supporting-passkeys
- https://developer.apple.com/documentation/carplay/cpmaptemplate
- https://developer.apple.com/documentation/carplay/integrating-carplay-with-your-navigation-app
- https://developer.apple.com/app-store/review/guidelines/

**Mapbox**
- https://docs.mapbox.com/ios/maps/guides/
- https://docs.mapbox.com/ios/maps/guides/styles/set-a-style/
- https://docs.mapbox.com/ios/maps/guides/styles/work-with-layers/
- https://docs.mapbox.com/ios/maps/guides/offline/
- https://docs.mapbox.com/ios/maps/guides/offline/concepts/
- https://docs.mapbox.com/accounts/guides/tokens/
- https://docs.mapbox.com/help/dive-deeper/how-to-use-mapbox-securely/
- https://github.com/mapbox/mapbox-maps-ios

**Next.js**
- https://nextjs.org/docs/app/guides/static-exports
- https://nextjs.org/docs/app/guides/backend-for-frontend

### C. Failure-mode analysis

The proposal was tested against these failure questions:

- Does the app still navigate if the phone is locked/backgrounded?
- Who owns location when the WebView is throttled?
- Can the same route be opened from desktop web, Safari/PWA and the installed app?
- Does a native client accidentally create a second route authority?
- Does it require a second saved-route model?
- What happens to passkeys when the web origin and app container differ?
- What happens to the encrypted sync root on a new device?
- Can Mapbox GL JS keep the current 3D appearance inside WKWebView?
- What is the escape hatch if WebGL thermal/memory performance is poor?
- Can that escape hatch serve CarPlay later?
- Can the app work without downloading executable product code after App Review?
- Can offline map display be confused with offline routing?
- Can an old installed binary still talk safely to a newer backend?
- Do Google 3D, Recon and the navigation renderer fight for GPU memory?
- Does a route continue after interruption, process suspension, poor GPS, network loss or rotation?

## Current-code findings

### 1. The navigation engine is not the problem

`src/lib/client/navigation-engine.ts` has no dependency on the DOM, Mapbox, React or browser geolocation. It accepts normalized fixes and returns normalized frames. That is exactly the boundary a native client needs.

It already owns:

- continuity-aware route matching;
- heading trust;
- uncertainty;
- weak-signal state;
- off-route hysteresis;
- progress;
- maneuver selection;
- arrival;
- remaining route points for reroute.

Reimplementing this in Swift before there is a concrete background/CarPlay requirement would add risk without adding product value.

### 2. The current ride environment is already a native-adapter seam

`src/lib/client/ride-session.ts` defines:

```ts
interface RideEnvironment {
  watchPosition(...)
  clearWatch(...)
  requestWakeLock?()
}
```

The browser implementation wires this to `navigator.geolocation` and Screen Wake Lock. The native architecture should expand this seam rather than bypass it.

### 3. Browser assumptions still leak into the orchestration layer

`useNavigationSessionController.ts` still directly owns:

- `window.speechSynthesis`;
- `AudioContext`;
- `navigator.onLine`;
- browser lifecycle assumptions.

`PlannerShell.tsx` directly owns:

- service-worker registration;
- `navigator.geolocation`;
- `window.location`;
- browser history.

`sync-controller.ts` directly uses relative `/api/*` URLs, browser cookies/CSRF and `window.location.origin`.

These are the first refactor targets. Native code should not be added while these remain implicit platform authorities.

### 4. Next.js cannot simply become the Capacitor web directory

The repository is a combined Next application and server boundary. It contains dynamic POST Route Handlers, cookies, security headers and Node-backed provider/storage code.

Next.js static export supports static client output, but server features and non-GET dynamic Route Handlers are explicitly unsupported. Converting the whole application to `output: "export"` would break the current architecture rather than package it.

Therefore mobile needs a **client-only build entry** that consumes the same client-safe source.

### 5. Existing storage is intentionally browser-local

Saved data is built around IndexedDB/Dexie. An installed application's WKWebView has its own container. Safari, the installed PWA and Capacitor must be treated as separate devices.

This is not a blocker because encrypted sync already exists. It is a product-flow problem:

- passkey = rider identity;
- sync root = ability to decrypt a namespace;
- recovery kit = current root-transfer mechanism;
- sync server = opaque encrypted envelope store.

Those roles should remain separate.

### 6. Native authentication is closer than it looks

The server's `readIdentitySession()` already accepts either:

- the existing session cookie; or
- `Authorization: Bearer <signed session>`.

The mutation CSRF layer also treats bearer authorization as the non-cookie path. This means the server does not need a new identity model.

What is missing is a native session issuance/secure-storage flow. The current verify endpoint sets cookies and returns only `identityId`.

The correct native path is:

1. associated-domain passkey ceremony;
2. server verifies against the same rider credential store;
3. a signed session is issued to the native client;
4. Swift stores it in Keychain;
5. native API transport attaches it;
6. JavaScript never persists the token in IndexedDB/localStorage.

A P0 device spike must record WebAuthn/passkey origin behavior from the real Capacitor WKWebView/native flow before changing the server's exact-origin policy.

## Packaging decision analysis

| Option | Reuse | Native capability | Offline/app review | Rendering | Risk | Decision |
|---|---:|---:|---:|---:|---:|---|
| Keep PWA only | Excellent | Weak | Existing | Existing | Browser lifecycle | keep as web product, not iOS answer |
| Production remote WKWebView | Excellent | Medium | Poorer | Existing | wrapper/network/update model | reject |
| Capacitor + bundled client | Excellent | Excellent | Strong | Existing + native escape hatch | Moderate | **choose** |
| React Native rewrite | Medium | Excellent | Strong | Native | two UI/domain implementations | reject |
| SwiftUI rewrite | Low | Excellent | Strong | Native | maximum rewrite/regression | reject |

Capacitor's own v8 documentation says it can be added to an existing modern JavaScript project and exposes custom Swift plugins. Its configuration documentation says `server.url` is intended for live reload and is not intended for production.

Capacitor v8 currently supports iOS 15+ and requires Xcode 26+.

## Location and lifecycle research

Apple explicitly treats real-time navigation and precise activity-path recording as valid reasons for background location updates.

A practical OpenGravel policy is:

```text
Plan / browse
  location: one-shot / foreground only
  background: off
  screen awake: off

Ride starts
  location: high accuracy
  background delivery: on
  screen awake: on while foreground
  checkpointing: active

App backgrounds during active ride
  location: continues
  native fix buffer: active
  screen awake: irrelevant/off
  JS delivery: best effort; never the only recovery path

App resumes
  native buffered fixes → ordered handoff
  updateNavigation()
  restore checkpoint
  re-establish camera/audio state

Ride ends
  background delivery: off
  high accuracy: off
  audio session: inactive
  idle timer: normal
```

Apple recommends When In Use where sufficient. Continuous background location can continue after being started in the foreground when the background Location Updates capability is enabled. Always access should therefore not be requested by default.

For road-heavy motorcycle rides, `automotiveNavigation` is semantically correct. Apple documents `otherNavigation` for activities that may not adhere to roads, including off-road vehicles; Adventure mode is the likely use.

## Screen-awake research

The browser currently uses the Screen Wake Lock API on a best-effort basis.

Native iOS can use `UIApplication.isIdleTimerDisabled`. Apple's own documentation names mapping apps as an appropriate case and specifically says the value should return to `false` when no longer needed.

This should be tied to **foreground active Ride**, not application launch.

## Voice/audio research

Browser `speechSynthesis` is acceptable as the web adapter.

Native iOS should use `AVSpeechSynthesizer` with a temporary audio session. Apple explicitly calls occasional turn-by-turn navigation an example for `interruptSpokenAudioAndMixWithOthers`, normally combined with `duckOthers`.

The audio lifecycle must survive:

- music playing;
- podcasts/audiobooks;
- Bluetooth helmet/headset;
- Siri/phone interruption;
- route cue cancellation;
- app background/foreground.

No claim of reliable background spoken guidance should be made until this is driven on hardware.

## 3D rendering research and decision

### What the web already has

OpenGravel's premium map work is built around Mapbox Standard / Standard Satellite. The current ADR intentionally uses:

- terrain;
- buildings/objects;
- lighting/light presets;
- semantic layers;
- stable style slots;
- one active map rather than multiple stacked maps.

Google 3D is explicitly preview-only. Recon uses a separate MapLibre/deck.gl post-ride renderer.

### What native Mapbox adds

As of this research, Mapbox Maps SDK for iOS is v11.31.0. It supports Standard and Standard Satellite, 3D terrain, runtime style configuration, custom data/layers, offline style/tile packs, and the same Standard slot model (`bottom`, `middle`, `top`). Its renderer is native/Metal.

This gives OpenGravel a credible native renderer without adopting Mapbox Directions or Navigation.

### Why not commit to native map everywhere immediately?

A native map buried under a web HUD introduces view ownership and gesture/layout complexity. A full native planner map also duplicates a large amount of existing code.

The correct sequence is:

1. make the map **semantically portable** through `MapScene`;
2. run the current Mapbox GL JS ride renderer inside the bundled app;
3. profile a real iPhone;
4. promote only the surface that benefits materially from native rendering.

### Required Map Scene Contract

At minimum the scene must carry:

- base presentation: road/terrain/satellite;
- lighting: dawn/day/dusk/night;
- terrain enabled/exaggeration;
- camera center/bearing/pitch/zoom/padding and transition intent;
- selected route;
- alternatives and visual role;
- current rider/matched point;
- route-ahead;
- curvature/unpaved/access/conditions/stops/evidence overlays;
- Standard slot;
- visibility/opacity semantics;
- selection/hit-test IDs.

It must not carry renderer-owned Mapbox object instances.

### Native promotion trigger

Native Mapbox becomes required for active Ride before App Store release if real-device WebGL fails any high-severity acceptance gate for:

- sustained animation/frame pacing;
- thermal behavior;
- memory growth;
- foreground/background renderer recovery;
- 3D style stability;
- map token/referrer configuration.

This makes native rendering an evidence-based fallback already paid for architecturally rather than a late rewrite.

### Mapbox token consequence

The current browser token is intended to be URL-restricted. Mapbox documents that URL restrictions rely on web request/referrer behavior and do not apply to native Maps SDK clients; Mapbox recommends separate tokens per client implementation.

Therefore iOS must use a **distinct least-privilege public token**. It must never reuse a secret token. If GL JS runs in the local app container, its referrer/restriction behavior must be proven; do not weaken the website token to make the app work.

### GPU ownership

Exactly one expensive interactive map renderer should be alive for the main surface.

Transitions must explicitly dispose/suspend:

- web Mapbox before Google 3D;
- Google 3D before returning to Plan;
- ride map before high-cost Replay/Cinematic when practical;
- web map if native Ride map takes ownership.

This is especially important in a WKWebView where multiple WebGL contexts compete with the rest of the application.

## Offline architecture

OpenGravel must keep **routing offline** and **display offline** as separate capabilities.

### Routing offline

Current OpenGravel region/corridor packs decide whether a route can be calculated or recovered without network. Preserve ADR 0003.

### Display offline

Mapbox native supports style packs and tile regions. Its current docs state that style packs include style resources including 3D models and tile regions manage the geographic tiles needed to render offline. Current docs also state a cumulative 750 unique tile-pack limit.

Use route/corridor geometries where possible rather than giant bounding boxes. Show size and progress before download.

The product UI should say, for example:

```text
Offline ride
Routing graph       Ready
Road/terrain map    Ready
Weather             Requires network
Traffic             Requires network
```

Never show a single green "offline ready" state if routing and map presentation disagree.

## Web ↔ app continuity

### Universal links

Associated domains provide one web/app URL namespace. All inbound links must be versioned and strictly parsed.

Use:

- normal `ride.henning.rodeo` URLs for general web identity;
- a dedicated host such as `open.ride.henning.rodeo` for explicit app handoff.

The dedicated host also avoids relying on browser heuristics when someone taps a same-domain link while already browsing OpenGravel.

### Anonymous route handoff

The current portable share already:

- strips private geometry;
- validates a versioned payload;
- fits in a bounded URL fragment;
- restores into a local route.

Reuse it for **Open in OpenGravel**.

Preferred first implementation:

```text
web route
  → redact/encode existing portable payload
  → https://open.ride.henning.rodeo/import#route=...
  → universal link
  → native strict parser
  → local imported route
```

Because the payload stays in the fragment, it is not sent to the handoff web server in the normal HTTP request.

A one-time encrypted server token is fallback only if real-device universal-link tests show the fragment path is unsuitable.

### Signed-in sync

Encrypted sync currently includes routes and settings. Do not expand its scope just because iOS exists.

Use the existing passkey identity and sync namespace. Device linking still requires transfer of the sync root because the server cannot decrypt it.

### Recovery-root transfer

The current recovery seed is already QR-capable. The first native device-link UX can scan the QR shown by web OpenGravel, import the namespace/root, authenticate with the rider's passkey, and link that namespace.

That is stronger and simpler than inventing a cloud-readable migration format.

## API and compatibility architecture

Installed apps live longer than a web deployment.

Add explicit client protocol metadata:

```text
client platform: ios | web
client build
api contract version
minimum server capability set
```

The server should expose a small compatibility/capability response. The native app must fail into a useful degraded state, not a blank screen, if the server is too old/new.

The app binary contains the executable client code. Remote services return data/configuration, not new executable product logic.

## App Store and policy considerations

Apple currently requires apps to be more than repackaged websites. OpenGravel's native background ride tracking, OS-integrated screen wake, guidance audio, passkeys/Keychain, universal links, offline resources and eventual CarPlay make the native application materially app-like.

Apple also requires background services to be used for their intended purposes. OpenGravel should enable location background mode only for an explicitly active ride.

Location prompts and App Store privacy disclosures must state why precise location is used. Precise ride history remains local unless the rider explicitly saves/shares/syncs it, consistent with ADR 0007.

Production binaries should package their executable UI. Remote code must not be downloaded to introduce/change application functionality.

## Safety architecture

Motorcycle navigation is an at-speed interaction problem.

The existing Astra rules remain correct:

- persistent orientation;
- one dominant next instruction;
- route identity/status always visible;
- minimum 56×56 driving touch targets;
- route recovery is explicit;
- editing belongs in Plan;
- no social/community density while riding.

Native iOS should add:

- haptics only for low-frequency meaningful events, not every maneuver;
- audio cues that do not force visual attention;
- no modal permission prompt after the rider has already begun moving;
- no hidden background tracking outside a rider-started session.

## CarPlay architecture

CarPlay is not part of the first implementation wave, but it changes what seams must exist now.

Apple navigation apps use `CPMapTemplate`; the application draws the map in the CarPlay navigation window while CarPlay templates own interactive overlays. A navigation entitlement is required.

That means a future CarPlay surface cannot simply mirror the current DOM HUD.

Prepare now by defining:

- `NavigationFrame` serialization;
- `MapScene` serialization;
- a maneuver presentation mapping independent of React;
- route-choice identity that survives renderer changes;
- lifecycle ownership independent of a single browser tab.

Then CarPlay can consume the same route/session truth later.

## Decision register

| Question | Decision |
|---|---|
| Rewrite in SwiftUI? | No |
| React Native? | No |
| Capacitor? | Yes, v8 baseline |
| Production remote `server.url`? | No |
| Bundle local app assets? | Yes |
| Convert entire Next app to static export? | No |
| Separate client build entry? | Yes |
| Existing TypeScript navigation authority? | Preserve |
| Core Location for active ride? | Yes |
| Default permission | When In Use |
| Background location during active ride | Yes |
| Always location permission | No, unless later proven necessary |
| Browser Wake Lock on iOS app | Replace with native idle timer |
| Browser speech on iOS app | Replace with native speech/audio |
| Native map everywhere immediately | No |
| Renderer-neutral MapScene | Yes, before renderer duplication |
| Mapbox native renderer | Prepared/gated, required for CarPlay |
| Google 3D navigation | No |
| Mapbox Navigation/Directions | No |
| Existing offline routing packs | Preserve |
| Mapbox offline tiles imply routing | Never |
| Associated domains | Yes: applinks + webcredentials |
| Native bearer storage | Keychain |
| Sync root derived from passkey | No |
| Existing recovery kit/QR | Reuse |
| CarPlay in first wave | No |
| CarPlay seam in first wave | Yes |

## Unknowns that must be answered by spikes, not assumptions

1. **Client portability:** exact set of client modules that fail when bundled outside Next.
2. **Mapbox GL JS token/referrer:** whether a properly restricted token can be used safely from the Capacitor local origin.
3. **WebGL/3D device performance:** frame pacing, memory, thermal and recovery on representative iPhones.
4. **Passkey origin:** exact client data/origin behavior from the chosen native/WKWebView ceremony.
5. **Background JS:** how much navigation JavaScript executes while iOS keeps Core Location active in background.
6. **Universal-link fragment:** exact delivery behavior of the existing portable route/recovery fragment.
7. **Bluetooth audio:** guidance cue routing/ducking with common helmet/headset profiles.
8. **Termination recovery:** which active-ride conditions can resume after OS termination under When In Use versus requiring explicit relaunch.

These are the first work packet. None should be hidden behind implementation optimism.
