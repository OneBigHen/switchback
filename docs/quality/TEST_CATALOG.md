# Test catalog

## Critical browser journeys

`tests/e2e/critical/planner-journeys.spec.ts` contains the focused fixture-backed
journeys. Every successful route assertion checks a request, loading
completion, selected geometry, visible summary, positive distance and
duration, and absence of the route-unavailable state.

| Journey | Coverage |
|---|---|
| 1-hour loop suggestion | Built-in timeboxed suggestion and loop request |
| Twisties suggestion | Built-in twisty suggestion |
| Scenic suggestion | Built-in scenic suggestion |
| Pine Creek Gorge prompt | Destination prompt interpretation |
| New Hope prompt | Scenic destination prompt with stop language |
| Destination planning | Selected start and finish reach a route |
| Fixed-start loop | Native round-trip request and closed geometry |
| Location denial | Honest approximate Harrisburg fallback |
| Provider failure | Typed error, loading ends, retry remains enabled |
| Stale request | Newer planning lifecycle wins |
| Alternatives | Alternative selection updates the visible route |
| Save/reload | IndexedDB route survives reload and appears in Library |
| GPX import | Valid imported route appears in Library |
| Free Ride acceptance | Suggestion transitions to guided Ride |
| Responsive layout | Desktop and iPhone-sized viewport fit |

Projects:

- `critical-chromium`
- `critical-webkit`
- `real-router`
- `pwa`

The existing broad matrix remains available through `npm run test:e2e` and is
kept separate from the critical fixture suite.

## Level A mobile QA

The routine Linux mobile gate is described in [LEVEL_A_MOBILE_QA.md](LEVEL_A_MOBILE_QA.md).
It uses WebKit/iPhone emulation as the primary signal, with touch enabled at
the named portrait sizes and meaningful standard landscape surface; Chromium
is a standard-portrait comparison only.
The stable scenario IDs are:

| Scenario ID | Coverage |
|---|---|
| `core-state` | Core planner/ride state and interaction journey |
| `layout-containment` | Viewport containment, overflow, clipping, and reachable controls |
| `visual-state` | Deterministic state screenshots for visual review |

Fast/core command (standard modern iPhone WebKit plus standard Chromium,
portrait by default):

```bash
npm run test:e2e:mobile-qa
```

Full/expanded command (all configured sizes and selective meaningful
orientations):

```bash
npm run test:e2e:mobile-qa:prepare
npm run test:e2e:mobile-qa:expanded
```

FAST and PREPARE provide representative light/dark, online/offline
transition-and-recovery, and fresh/persisted journeys. FULL adds selective
WebKit portrait sizes and the meaningful landscape surface; this is not a
cross-product of every state. Offline assertions are limited to shell/local
saved data and API-failure handling; this catalog does not treat them as proof
of offline rerouting.

## Real-router checks

`tests/e2e/real-router/real-router.spec.ts` runs through the browser/app API
boundary against the tiny GraphHopper 11 fixture:

- normal point-to-point route with live geometry and toll detail;
- a closed twisty loop using the supported 20-minute sparse-fixture timebox;
- private, `motorcycle=no`, and disconnected destinations rejected with typed
  errors.

The fixture contains a two-way main road, scenic curve, gravel cut, one-way
spur, private branch, motorcycle-closed branch, toll road, roundabout, signal,
stop sign, dead end, and disconnected component.

## PWA/offline checks

`tests/e2e/pwa/offline.spec.ts` runs against a production build with service
workers enabled. It verifies the shell, controller takeover, IndexedDB route
persistence, offline Library access, and that an API failure is not converted
into a cached fake route success.
