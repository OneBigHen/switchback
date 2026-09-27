# OpenGravel Ride Telemetry Glass Strip

**Status:** implementation-ready specification  
**Target:** OpenGravel vNext / SwitchBack repository  
**Primary surfaces:** guided Ride HUD, Record ride HUD, Free Ride Live  
**Product intent:** show the rider three glanceable live metrics without turning the map into a dashboard.

## 1. Problem

OpenGravel already captures or derives useful ride data, but it is spread across multiple HUDs and presented differently by mode:

- `RideHud` exposes remaining distance, remaining duration, current speed, speed limit, and route progress.
- `RideRecordingHud` exposes current speed, altitude, ascent/descent, distance, average speed, max speed, heading, GPS accuracy, and elapsed recording time.
- `FreeRideHud` uses the same recording session but has its own presentation.

The rider should get one consistent, compact instrument strip that reads like:

```
  47 mph   │   812 ft   │   00:38
  SPEED    │ ELEVATION  │ REC TIME
```

Exactly three primary slots are visible on a phone. Each slot is independently configurable from a curated metric catalog.

This is not a dashboard builder. The product contract remains: the map and ride session are the center, and every visible element must earn its space.

## 2. UX contract

### 2.1 Primary strip

Add a reusable `RideMetricStrip` rendered as a three-column instrument surface.

Default layouts:

**Recording / Free Ride**
```
CURRENT SPEED | ELEVATION | REC TIME
```

**Guided ride**
```
CURRENT SPEED | DISTANCE LEFT | TIME LEFT
```

If guided ride recording is active, the user's saved guided preset remains authoritative; do not silently swap metrics mid-ride.

Requirements:

- exactly 3 visible slots on phone;
- three equal-width columns separated by restrained vertical dividers;
- tabular numerals to prevent layout jitter;
- primary value large, unit/label secondary;
- one-line labels; no wrapping;
- values update without reflowing the strip;
- unavailable values render `—`, never fabricated zeros;
- the strip remains legible over Standard, Terrain, Satellite, and dark map states;
- safe-area aware;
- no horizontal scrolling.

### 2.2 Customization interaction

Each metric slot is a button with a minimum 44x44 px hit area.

When the rider taps a slot while stationary or paused:

1. open a compact bottom sheet / popover anchored to that slot;
2. show the current metric selected;
3. present the curated metric catalog;
4. selecting a metric updates that slot immediately;
5. close the sheet automatically;
6. persist the three-slot layout locally.

While moving above the safety threshold, do **not** open a large picker. Keep the strip glanceable and show a short non-blocking response such as "Customize when stopped." Existing ride/navigation actions remain usable.

Suggested initial safety threshold: current speed > 5 mph. Do not infer motion from stale data; if speed confidence is unavailable, allow customization only when guidance/recording is paused.

Desktop/tablet may use a small anchored glass popover instead of a full bottom sheet, but the same data model and selection behavior must be shared.

### 2.3 Instrument-glass visual language

The requested effect is premium "glass", but riding surfaces must not become low-contrast transparent chrome.

Use **smoked instrument glass**, not clear decorative glass:

- dark neutral surface at roughly 88–94% effective opacity;
- subtle backdrop blur only where supported;
- thin high-contrast border;
- restrained highlight/shadow;
- no glowing neon edges;
- no animated gradients;
- no excessive translucency over Satellite;
- preserve WCAG 2.2 AA text contrast;
- honor `prefers-reduced-motion`;
- use existing OpenGravel ride tokens before adding new tokens.

The strip should visually feel like a motorcycle TFT instrument laid over the map, not an iOS control center clone.

### 2.4 Picker sheet

Suggested structure:

```
┌──────────────────────────────────┐
│ Metric 2                         │
│                                  │
│ Ride                             │
│ [Current speed] [Average speed]  │
│ [Max speed]     [Distance]       │
│ [Rec time]      [Moving time]    │
│                                  │
│ Terrain                          │
│ [Elevation]     [Elevation gain] │
│ [Elevation loss]                 │
│                                  │
│ Motion / direction               │
│ [Heading]       [Lean / tilt β]  │
│                                  │
│ Navigation                       │
│ [Distance left] [Time left]      │
│ [Progress]      [Speed limit]    │
└──────────────────────────────────┘
```

Do not show a metric if the current ride mode cannot ever supply it. Metrics that are temporarily unavailable but supported by the mode may stay selectable and display `—` until data arrives.

## 3. Metric catalog

Use stable string IDs so persisted slot choices survive refactors.

### Core ride metrics

| ID | Label | Value source | Notes |
|---|---|---|---|
| `speed.current` | Speed | GPS/navigation current speed | mph/km/h via rider units |
| `speed.average` | Avg speed | recording samples | use filtered valid samples |
| `speed.max` | Max speed | recording samples | do not use impossible GPS spikes |
| `distance.recorded` | Distance | recorded GPS geometry | ride distance |
| `time.recorded` | Rec time | active recording clock | excludes paused time |
| `time.moving` | Moving time | derived from valid motion samples | new metric |
| `heading` | Heading | GPS heading | compass label + degrees where space permits |
| `gps.accuracy` | GPS | geolocation accuracy | diagnostic; lower priority |

### Terrain metrics

| ID | Label | Value source | Notes |
|---|---|---|---|
| `elevation.current` | Elevation | latest altitude | apply sane smoothing |
| `elevation.gain` | Gain | recorded altitude profile | filter GPS altitude noise |
| `elevation.loss` | Loss | recorded altitude profile | filter GPS altitude noise |

### Guided-navigation metrics

| ID | Label | Value source | Notes |
|---|---|---|---|
| `route.distanceRemaining` | Distance left | navigation frame | only guided/track ride |
| `route.timeRemaining` | Time left | navigation frame | only guided/track ride |
| `route.progress` | Progress | navigation frame | percent |
| `route.speedLimit` | Speed limit | current instruction/road data | show `—` when unknown |

### Experimental motion metrics

| ID | Label | Value source | Notes |
|---|---|---|---|
| `motion.lean` | Lean | device motion/orientation | **beta; device-relative, not guaranteed motorcycle lean** |
| `motion.tilt` | Tilt | device motion/orientation | beta |
| `motion.lateralG` | Lateral G | accelerometer | optional follow-up if signal quality is proven |

Do not ship a metric merely because an API returns a number. It must be stable enough to be rider-useful.

## 4. Lean / tilt truthfulness contract

A phone can report device orientation; it cannot automatically know true motorcycle lean angle unless mount orientation, reference frame, and sensor fusion are credible.

Therefore:

- label the first implementation "Lean β" or "Device lean" in the picker/details;
- require one-time calibration when the phone is mounted upright/neutral;
- store the calibration transform locally;
- use DeviceMotion/DeviceOrientation only after explicit browser permission where required;
- smooth the value and reject obviously invalid spikes;
- if motion permission is denied or unavailable, return an unavailable state;
- do not pretend GPS heading alone can produce lean;
- do not persist high-frequency raw motion streams unless a later ADR explicitly calls for it;
- native iOS can later replace the provider behind the same metric contract without changing the HUD.

A simple provider interface is enough. Do not build a generic sensor plugin framework.

Suggested contract:

```ts
type RideMotionSample = {
  leanDegrees: number | null
  tiltDegrees: number | null
  lateralG: number | null
  quality: "good" | "degraded" | "unavailable"
  sampledAt: number
}
```

## 5. Data architecture

Do not duplicate the existing recording/navigation telemetry implementations.

Introduce a small normalized view-model layer:

```ts
type RideMetricId =
  | "speed.current"
  | "speed.average"
  | "speed.max"
  | "distance.recorded"
  | "time.recorded"
  | "time.moving"
  | "heading"
  | "gps.accuracy"
  | "elevation.current"
  | "elevation.gain"
  | "elevation.loss"
  | "route.distanceRemaining"
  | "route.timeRemaining"
  | "route.progress"
  | "route.speedLimit"
  | "motion.lean"
  | "motion.tilt"

type RideMetricReading = {
  id: RideMetricId
  value: number | string | null
  displayValue: string
  unit: string | null
  label: string
  availability: "ready" | "waiting" | "unsupported"
  quality?: "good" | "degraded"
}
```

Create one resolver that receives the existing navigation frame, `recordingTelemetry()`, rider units, and optional motion sample. UI components consume only normalized readings.

Suggested files:

- `src/lib/client/ride-metrics.ts`
- `src/lib/client/ride-metric-preferences.ts`
- `src/lib/client/ride-motion.ts`
- `src/components/shell/RideMetricStrip.tsx`
- `src/components/shell/RideMetricPicker.tsx`
- `src/app/styles/ride-metrics.css`

Exact placement may be adjusted to match current ownership, but avoid putting metric math directly in JSX.

## 6. Persistence

Persist slot choices locally and keep them account-optional.

Suggested v1 shape:

```ts
type RideMetricPreset = {
  version: 1
  guided: [RideMetricId, RideMetricId, RideMetricId]
  recording: [RideMetricId, RideMetricId, RideMetricId]
}
```

Use a compatibility-safe localStorage key consistent with the current codebase naming convention, for example:

`switchback:ride-metric-slots:v1`

Rules:

- validate every persisted ID;
- dedupe repeated IDs if the UI disallows duplicates;
- fall back to defaults on malformed storage;
- do not block ride startup on storage errors;
- no account is required;
- sync can be added later through existing settings/sync infrastructure, not in this PR.

## 7. Telemetry quality improvements

Before exposing the numbers as premium instrumentation, harden the underlying calculations.

### Speed

Current `recordingTelemetry` already calculates current, average, and max speed.

Add basic spike rejection so a bad GPS fix cannot produce a bogus "143 mph" max:

- ignore non-finite/negative values;
- consider accuracy and time delta;
- reject physically implausible single-sample jumps;
- keep the filtering deterministic and covered by tests.

Do not overfit a complex Kalman filter in this PR.

### Elevation

Raw phone GPS altitude is noisy. For gain/loss:

- smooth altitude before summing;
- ignore tiny changes inside a deadband;
- do not count missing-altitude segments;
- preserve raw recorded points for compatibility;
- compute the display aggregate from the filtered view.

### Moving time

Derive moving time from recorded samples with a conservative threshold and hysteresis so stoplights do not rapidly flap state. Keep the exact rule documented and deterministic.

## 8. Integration by ride surface

### Guided `RideHud`

Replace the fixed telemetry footer's primary stat row with `RideMetricStrip`.

Preserve existing speed-limit sign and route progress bar as mode-specific navigation affordances where appropriate. Do not force every current footer element into a configurable slot.

Navigation alerting, maneuver card, recovery UI, voice, pause, Record, and Exit must not change behavior.

### `RideRecordingHud`

Use the same `RideMetricStrip` with recording defaults.

The large central speed/elevation treatment currently duplicates the footer. Reduce duplication after the new strip lands: the map should gain breathing room rather than displaying the same speed twice.

The elevation sparkline may remain as a secondary stationary/portrait detail if it still earns the space; hide it in constrained landscape.

### `FreeRideHud`

Use the recording preset and the same strip. Free Ride's "one quiet suggestion" contract remains authoritative; metric customization must not compete visually with an active road suggestion.

## 9. Responsive behavior

### Phone portrait

- three slots across;
- target strip height ~72–92 px plus safe area;
- value text approximately 24–34 px depending on content;
- label 10–12 px;
- bottom sheet picker;
- no fourth slot.

### Short phone landscape

- three compact slots in the telemetry lane;
- value remains legible at a glance;
- if the existing instruction/suggestion state needs the right lane, metrics may compress but must not overlap controls;
- picker opens only when stopped/paused.

### Tablet / desktop

- same three primary slots;
- optional anchored picker;
- do not expand to a six- or eight-card dashboard just because space exists.

## 10. Accessibility

- each slot is a real button;
- accessible name includes metric and current value, e.g. "Elevation, 812 feet. Change metric.";
- sheet uses a labelled dialog pattern;
- keyboard and screen-reader usable;
- visible focus;
- minimum 44 px target;
- no meaning by color alone;
- no live-region announcement on every GPS update;
- announce only user-triggered metric changes and meaningful unavailable/error state changes;
- tabular numerals;
- reduced motion respected.

## 11. Instrumentation

This feature is rider UI, not product analytics telemetry.

Allowed semantic events through the existing telemetry client:

- `ride_metric_picker_opened`
- `ride_metric_changed`
- `ride_metric_motion_permission_result`

Properties should be coarse:

- ride mode;
- slot index;
- previous metric ID;
- next metric ID;
- supported/unavailable state.

Do **not** send live speed, coordinates, elevation, lean values, raw sensor samples, or ride geometry to PostHog as part of these events.

## 12. Tests / release gates

### Unit

Add coverage for:

- default presets by ride mode;
- persisted preset validation and migration;
- value formatting for imperial/metric;
- unavailable values use `—`;
- average/max speed filtering;
- moving-time derivation;
- elevation smoothing/deadband;
- motion permission unavailable/denied/granted;
- lean calibration transform;
- moving-state picker lockout.

### Component

Add coverage for:

- exactly three slots;
- each slot can select another supported metric;
- selection persists;
- duplicate policy;
- unsupported metrics are not offered;
- temporarily unavailable selected metric remains selected and displays `—`;
- accessible button/dialog labels;
- guided, recording, and Free Ride presets.

### E2E / visual

Update deterministic ride states and snapshots for:

- phone portrait guided ride;
- phone portrait recording;
- Free Ride idle;
- Free Ride suggestion active;
- short landscape;
- tablet portrait/landscape;
- desktop;
- Satellite basemap contrast;
- reduced motion.

Physical-device evidence remains required for iPhone motion permission, orientation changes, safe areas, sunlight/glove usability, and real GPS behavior.

## 13. Acceptance criteria

This feature is complete when:

1. Every live riding mode shows the same three-slot telemetry component.
2. Recording/Free Ride defaults to **Speed | Elevation | Rec time**.
3. Guided ride defaults to **Speed | Distance left | Time left**.
4. Each slot can be changed independently when stopped/paused.
5. Choices survive reload/recovery.
6. Avg speed, max speed, distance, recording time, moving time, elevation, gain/loss, heading, GPS accuracy, route progress, remaining distance/time, and speed limit are available where their source exists.
7. Lean/tilt is honest about capability and never fabricated.
8. Sensor denial/degradation does not break riding, recording, or navigation.
9. No new provider/service/API is required.
10. No backend or microservice is introduced.
11. Existing navigation, recording recovery, Free Ride suggestion, offline, and map contracts remain intact.
12. Mobile screenshots show no overlap at 390x844 and constrained landscape.
13. The UI looks like one premium instrument surface, not a collection of stat cards.

## 14. Explicit non-goals

- arbitrary dashboard builder;
- more than three primary metrics on phone;
- cloud persistence in v1;
- social/leaderboard speed stats;
- speed scoring or gamification;
- claiming true motorcycle lean from uncalibrated phone orientation;
- high-frequency sensor analytics upload;
- Mapbox Navigation SDK / Directions integration;
- renderer changes;
- new routing logic.

## 15. Suggested implementation sequence

1. Extract normalized metric catalog/resolver over existing navigation + recording data.
2. Add preset persistence/validation.
3. Build the reusable three-slot strip.
4. Build stopped-state glass picker.
5. Integrate recording and Free Ride first.
6. Integrate guided ride without disturbing maneuver/recovery behavior.
7. Harden speed/elevation/moving-time calculations.
8. Add optional motion provider + calibration behind the same metric contract.
9. Run unit/component/mobile/visual gates.
10. Perform real-iPhone motion/GPS acceptance before calling Lean β production-ready.

## 16. Design decision

The key constraint is intentional: **three metrics, always.**

OpenGravel should let the rider choose what those three numbers mean, not make the rider manage a miniature cockpit layout. The combination of a fixed shell + configurable contents gives personalization without sacrificing glanceability.
