# OpenGravel iOS native release gate

Status: required evidence for any claim that the iOS app is ready to ship  
Applies to: native shell, ride services, native renderer if enabled, TestFlight/App Store builds

## Evidence rule

Simulator, Playwright WebKit and browser emulation remain useful regression tools. They are **not** proof of iOS background GPS, screen wake, Bluetooth audio, passkeys, universal links, Mapbox thermal behavior or CarPlay.

Every physical result must record:

- exact Git SHA;
- app build/version;
- device model;
- iOS version;
- renderer kind;
- online/offline state;
- test route/fixture ID;
- PASS / FAIL / NOT RUN;
- evidence location.

## Gate 1 — packaging and self-contained client

Required:

- application launches with the executable React client bundled in the binary;
- production Capacitor configuration has no remote `server.url`;
- production configuration does not broadly permit arbitrary in-WebView navigation;
- app reaches a useful local UI with backend temporarily unreachable;
- remote backend returns data only;
- a backend deployment cannot silently replace executable client code in an installed binary;
- service worker is not relied upon inside the native client.

Failure is release-blocking.

## Gate 2 — parity with web domain behavior

Use shared fixtures to prove identical behavior for:

- route selection IDs;
- route profile/options;
- road-lock semantics;
- navigation statuses;
- maneuver index;
- remaining-distance progression;
- off-route hysteresis;
- automatic reroute trigger conditions;
- arrival;
- route recovery checkpoint.

Native platform code may change acquisition/presentation, not these semantics.

## Gate 3 — location and lifecycle

Physical tests:

| Scenario | Required result |
|---|---|
| Permission not determined | Prompt occurs before riding; denial leaves planner usable |
| Precise When In Use allowed | Live Ride reaches ready state |
| Approximate/reduced accuracy | Explicit degraded state, no false precision |
| Foreground ride | Continuous normalized fixes |
| Home-screen background | Native location continues only for active ride |
| Screen lock | Active ride location behavior matches documented capability |
| Foreground resume | Buffered fixes drain once, ordered and deduplicated |
| 20s+ GPS outage | Weak/stale signal shown; no invented progress |
| Tunnel/urban canyon replay | No catastrophic segment jump |
| Off-route | Current 3-fix/8-second recovery semantics preserved |
| Ride stop | Background location shuts down |
| App relaunched after interruption | Checkpoint recovery honest and deterministic |

Do not require Always authorization unless a separate accepted requirement needs system relaunch while not running.

## Gate 4 — screen awake

Physical tests:

- entering active foreground Ride prevents idle display sleep;
- pausing guidance does not accidentally leak the idle-timer state;
- backgrounding does not keep a meaningless foreground display assertion;
- leaving Ride restores normal auto-lock;
- error/unmount path restores normal auto-lock;
- repeated Plan ↔ Ride transitions do not leak the assertion.

## Gate 5 — guidance audio

Physical matrix:

- phone speaker;
- Bluetooth earbuds;
- motorcycle helmet/intercom when available;
- Apple Music playing;
- podcast/audiobook playing;
- Siri interruption;
- phone/FaceTime interruption where practical;
- mute/unmute;
- rapid reroute invalidating an old cue.

Required:

- cues are intelligible;
- ordinary media is ducked rather than permanently interrupted;
- spoken media does not overlap unintelligibly;
- audio resumes after cue/session deactivation;
- stale instructions are cancelable;
- no audio session remains active after Ride exits.

Background spoken guidance is marked NOT VERIFIED until a screen-locked/background physical ride proves it.

## Gate 6 — map and 3D

### Fixture matrix

Run:

1. dense urban route with 3D buildings;
2. twisty rural route with terrain;
3. Adventure route with unpaved/evidence overlays;
4. Satellite route;
5. post-ride Recon replay.

### Functional

Required:

- correct selected/alternative route;
- route line remains legible over Standard 3D;
- rider marker never hidden by HUD;
- camera follows at expected low-in-frame target;
- pan/pinch/rotate suspends following;
- Recenter restores it;
- terrain and lighting switch without blank map;
- portrait/landscape safe areas are correct;
- Plan → Ride → Plan preserves route identity;
- renderer crash/failure reaches explicit degraded behavior.

### Performance

Measure on at least one current high-end and one older supported iPhone.

Hard failures:

- crash;
- blank map after ordinary lifecycle transition;
- unbounded memory growth;
- sustained unusable camera animation;
- serious/critical thermal condition attributable to normal route guidance;
- repeated WebGL context loss;
- route display materially lagging GPS in ordinary conditions.

Target budgets:

- active-map animation should normally sustain at least 30 FPS;
- preferred target is 60 FPS on current hardware;
- p95 frame time should remain <= 33 ms during the representative ride replay;
- after repeated Plan ↔ Ride ↔ Replay transitions, memory should return close to baseline and must stay inside the existing <10% growth-after-repeated-cycle budget where measurement is comparable;
- control response should preserve the existing <100 ms interaction target when no network is required.

If web Mapbox in WKWebView fails a release-blocking rendering/performance gate, native Mapbox Ride becomes required. Do not lower visual/guidance correctness merely to keep the web renderer.

## Gate 7 — renderer ownership

At all times:

- exactly one main interactive map owns the screen;
- Google 3D is never alive under active Ride;
- Recon cinematic is not burning GPU behind another surface;
- if native Ride map owns the surface, the web map is explicitly suspended/disposed;
- renderer switches preserve route and navigation identity.

Use runtime diagnostics to count active maps/WebGL/native map views.

## Gate 8 — offline truth

Test airplane mode after explicit preparation.

Report independently:

- app client assets;
- saved route;
- routing graph/corridor pack;
- basemap/style pack;
- weather;
- traffic/evidence requiring network.

Required:

- shell/client launches;
- saved route opens;
- in-coverage offline reroute succeeds only when a validated OpenGravel routing pack supports it;
- out-of-coverage reroute is explicitly rejected;
- cached/native Mapbox visuals never imply offline routing availability;
- reconnect restores providers without losing the active route.

## Gate 9 — web → iOS continuity

Physical universal-link tests:

- app installed / not running;
- app installed / foreground;
- Safari on unrelated site;
- Safari currently on OpenGravel;
- malformed import URL;
- unsupported version;
- duplicate route;
- active ride already in progress.

Required:

- valid route import reaches a preview/explicit action;
- malformed payload cannot mutate state;
- no destructive action occurs automatically;
- no secret appears in server request logs when fragment-based transfer is used;
- fallback web page remains useful when app is not installed.

## Gate 10 — passkey and secure session

Required:

- associated-domain file valid for `webcredentials`;
- existing passkey can authenticate;
- new passkey can register if native registration is supported;
- server validates exact trusted origin/RP behavior observed in P0;
- native bearer is stored in Keychain;
- bearer is absent from localStorage, IndexedDB, URL, logs and telemetry;
- logout removes native session;
- revoked/expired session returns typed signed-out state;
- web cookie flow still works.

No wildcard expected-origin policy.

## Gate 11 — encrypted sync

Use two-device drill:

1. create/save route on web;
2. export/display recovery QR;
3. import root on iOS;
4. passkey authenticate/link;
5. sync;
6. verify route/settings;
7. modify on each side;
8. sync;
9. verify conflict semantics;
10. delete route and verify tombstone behavior.

Required:

- server never receives clear sync root;
- native and web decrypt the same envelopes;
- route conflict-copy semantics remain unchanged;
- a wrong root fails authentication/decryption rather than showing corrupted data.

## Gate 12 — interruptions and adverse conditions

Physical tests:

- incoming notification;
- phone call;
- Siri;
- Control Center;
- orientation change;
- Low Power Mode;
- network transition Wi-Fi ↔ cellular;
- airplane mode;
- temporary backend 500/timeout;
- temporary Mapbox failure;
- memory warning if reproducible;
- app background >5 minutes;
- force quit/relaunch (document expected limitations honestly).

No failure may silently discard the authored route.

## Gate 13 — privacy and App Store readiness

Required:

- location purpose string is concrete;
- background use is clearly explained;
- location starts only after rider action;
- telemetry contains no raw GPS/GPX/precise route history;
- App Store privacy answers match code;
- required privacy manifest exists;
- public Mapbox token is separate/minimal and no secret Mapbox token ships;
- review notes explain native/background functionality;
- no beta/debug surfaces exposed as normal product;
- all backend services necessary for review are reachable.

## Gate 14 — two-hour ride soak

On physical hardware:

- active route for >=2 hours or a deterministic GPS replay of equivalent duration plus a shorter real-world ride;
- screen-awake lifecycle;
- voice cues;
- at least one reroute;
- one background/resume;
- route checkpointing;
- map camera;
- recording if enabled.

Capture:

- crash count;
- memory start/end;
- thermal observations;
- battery delta;
- GPS gap distribution;
- reroute count/result;
- stale/weak state count;
- renderer errors;
- final checkpoint/replay integrity.

There is no fixed battery percentage promise in this gate because device health, brightness, radio conditions and temperature materially affect it. Compare candidate builds on the same hardware/settings and investigate regressions.

## Gate 15 — CarPlay (future, separate release gate)

Do not mark CarPlay ready merely because the architecture has a seam.

When implemented, require:

- Apple navigation entitlement approved;
- real CarPlay or Apple-supported simulator test;
- `CPMapTemplate` root;
- map-only base window;
- all interactive chrome through CarPlay templates;
- maneuver mapping;
- route preview/start/cancel;
- phone/CarPlay session handoff;
- screen-lock/background navigation;
- no dependency on an actively interactive phone WebView.

Until then: **CARPLAY NOT IMPLEMENTED**, not "CarPlay ready."

## Release evidence format

Create/update:

`docs/quality/IOS-NATIVE-DEVICE-RESULTS.md`

Use:

```markdown
## Build
- Git SHA:
- App build:
- Device:
- iOS:
- Renderer:
- Date:

| Gate | Scenario | Result | Evidence | Notes |
|---|---|---|---|---|
| Location | background 5 min | PASS | xctrace/... | ... |
```

## Ship rule

A candidate may be called **iOS release ready** only when Gates 1–14 have no unresolved Critical/High finding and every physical-only claim is backed by actual hardware evidence.

A failed 3D renderer gate selects the already-defined native renderer path; it is not permission to ship a degraded map.
