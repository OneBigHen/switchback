# OpenGravel Adaptive Ride Instrument Strip

**Status:** implementation-ready specification  
**Target:** OpenGravel vNext / SwitchBack repository  
**Primary surfaces:** guided Ride HUD, Record ride HUD, Free Ride Live  
**Product intent:** a three-slot motorcycle instrument surface that stays simple to glance at while exposing genuinely useful route, ride, terrain, and optional motion intelligence.

---

## 0. Decision summary

This feature is intentionally constrained.

- **Exactly three primary metric slots** are visible on phone, tablet, and desktop.
- Each slot is independently configurable from a **curated metric registry**.
- A rider may choose **Smart** as one of the three slots. Smart changes its own content based on trustworthy ride context; it **never rearranges the other two slots**.
- Existing `RiderSettings.uiPreferences.rideMetrics` and `recordingMetrics` remain the preference authority. **Do not create a second localStorage preference store.**
- The visual treatment is **smoked TFT / instrument glass**, not translucent glassmorphism. OpenGravel's Design Contract remains authoritative.
- Route-ahead claims such as "gravel in 1.6 mi" or "curves ahead" require **segment-indexed evidence**. Aggregate `surfaceMix` / `twistiness` are insufficient and may not be used to fabricate location-specific claims.
- Lean/tilt is **device-relative beta telemetry** until a native or bike-mounted sensor source proves a better reference frame.
- Safety-critical weather, reroute, GPS, closure, or maneuver UI remains in its existing dedicated surfaces. Smart is contextual information, **not an alert replacement**.
- No new backend, provider framework, microservice, routing engine, or commercial API is required.
- No live speed/lean gamification, leaderboards, "best corner" prompts, or attention-seeking animation while moving.

The end result should feel like a premium motorcycle TFT sitting over the map:

```
  47 mph   │   812 ft   │  CURVES 2.1 mi
  SPEED    │ ELEVATION  │  SMART
```

while still supporting a completely static setup:

```
  47 mph   │   18.2 mi  │   26 min
  SPEED    │ DIST LEFT  │ TIME LEFT
```

---

## 1. Existing code reality

Do not rebuild capabilities OpenGravel already has.

### Existing preference ownership

`src/lib/settings/rider-settings.ts` already defines:

- `uiPreferences.rideMetrics`
- `uiPreferences.recordingMetrics`
- validation that caps both lists at **three** entries
- one versioned `switchback:rider-settings` storage record

That is the correct persistence boundary.

### Existing live/recorded telemetry

`recordingTelemetry()` already derives:

- recorded distance
- elapsed active recording time
- average speed
- max speed
- current speed
- current altitude
- ascent / descent
- heading
- GPS accuracy

`NavigationFrame` already carries:

- current matched route segment
- matched distance along route
- remaining distance
- remaining duration
- current speed
- heading
- route progress
- GPS accuracy / route confidence state
- current / next maneuver

### Existing routing evidence

GraphHopper already requests route path details for:

- road class
- surface
- track type
- max speed
- toll
- road environment
- urban density
- curvature

Today the GraphHopper adapter aggregates much of this into route-level percentages and discards the useful interval position. For road-ahead intelligence, preserve the relevant interval evidence in a provider-neutral route structure.

Valhalla's elevation service already supports `range: true`, which returns cumulative distance plus elevation. The current adapter throws away the cumulative distance and keeps only aggregate ascent/descent. Preserve a bounded profile when elevation enrichment is available.

### Existing context systems

OpenGravel already has:

- Free Ride workload / cooldown suppression
- NWS route weather and alert handling
- bike fuel-range settings
- route progress matching
- route data-quality provenance

The new strip must consume those systems where appropriate, not duplicate them.

---

## 2. UX contract

### 2.1 One fixed shell, configurable contents

Create one reusable `RideMetricStrip` with exactly three equal conceptual slots.

Baseline defaults:

**Guided Ride — Navigate preset**
```
SPEED | DISTANCE LEFT | TIME LEFT
```

**Record**
```
SPEED | ELEVATION | REC TIME
```

**Free Ride**
```
SPEED | ELEVATION | REC TIME
```

Smart is available immediately as a selectable metric and in the Explore preset, but **do not make dynamic Smart the default for guided riding until its deterministic release gates pass on real-device QA**.

Requirements:

- exactly three primary slots;
- no fourth slot on desktop just because there is room;
- equal reading rhythm, not necessarily mathematically equal widths if a compact unit needs optical correction;
- tabular lining numerals;
- values update without causing width/layout jitter;
- one-line labels;
- unavailable values render `—`, never `0` unless zero is a truthful value;
- no horizontal scrolling;
- safe-area aware;
- 44 px minimum touch target; target 52 px in moving-mode composition where space permits;
- current map remains the visual field.

### 2.2 Changing a metric

Each slot is a real button.

**Pre-ride, paused, or confidently stopped:**

1. tap a slot;
2. open a compact metric picker;
3. show curated presets first, then individual metrics grouped by category;
4. selecting a metric updates only that slot;
5. close automatically;
6. save through `RiderSettings`.

**Moving:**

- do not open a sheet/popover;
- do not cycle metrics;
- do not accept swipe gestures;
- leave the strip stable;
- a tap may produce a short passive response such as `Customize when stopped`.

Initial moving lock:

- moving if a fresh speed reading is > 5 mph;
- if speed is stale/unavailable, customization is allowed only when guidance/recording is paused or before ride start;
- never use an old speed reading to decide the rider is stopped.

### 2.3 Presets

Presets are **templates over the existing three IDs**, not a second persisted object.

If the current three IDs exactly match a preset, the UI may display that preset name. Changing one slot simply produces a custom arrangement.

Recommended presets:

| Preset | Slot 1 | Slot 2 | Slot 3 |
|---|---|---|---|
| Navigate | Speed | Distance left | Time left |
| Explore | Speed | Elevation | Smart |
| Tour | Speed | Moving time | Daylight |
| Off-road | Speed | Grade | Smart |
| Instrument | Speed | Lean β | Heading |
| Record | Speed | Elevation | Rec time |

Hide or disable a preset when the current mode cannot support its required metrics.

### 2.4 Visual direction: smoked TFT, not glassmorphism

The Design Contract explicitly rejects translucent-glass-template styling as product identity.

Interpret "glass" as **smoked motorcycle instrument glass**:

- Ink / Deep Spruce base;
- high effective opacity;
- subtle local backdrop diffusion only if it materially improves map readability;
- 1 px tonal border;
- restrained highlight/shadow;
- Paper numeric text;
- Ember only for selected/commit meaning;
- Signal Blue only for GPS/navigation meaning;
- no neon outline;
- no animated gradient;
- no floating frosted-card collection;
- no giant rounded rectangles;
- no separate global override stylesheet.

Use scoped CSS modules for the new component and reuse existing ride tokens.

---

## 3. Metric registry

Use one canonical metric ID union. Mode support belongs to registry metadata, not parallel ad-hoc switch statements.

### 3.1 Core metrics

| ID | Rider label | Source | Initial state |
|---|---|---|---|
| `speed.current` | Speed | GPS/navigation | build |
| `speed.average` | Avg speed | filtered recording samples | build |
| `speed.max` | Max speed | filtered recording samples | build |
| `distance.recorded` | Distance | recorded geometry | build |
| `time.recorded` | Rec time | active recording clock | build |
| `time.moving` | Moving time | deterministic movement classifier | build |
| `time.sinceStop` | Since stop | movement classifier | build |
| `elevation.current` | Elevation | filtered GPS altitude / route evidence | build |
| `elevation.gain` | Gain | filtered elevation profile | build |
| `elevation.loss` | Loss | filtered elevation profile | build |
| `heading` | Heading | GPS/navigation heading | build |
| `gps.accuracy` | GPS | location accuracy | build, diagnostic priority |

### 3.2 Guided route metrics

| ID | Rider label | Source | Initial state |
|---|---|---|---|
| `route.distanceRemaining` | Distance left | NavigationFrame | build |
| `route.timeRemaining` | Time left | NavigationFrame | build |
| `route.eta` | ETA | now + remaining duration | build |
| `route.progress` | Progress | NavigationFrame | build |
| `route.speedLimit` | Speed limit | current instruction/evidence | build |
| `terrain.grade` | Grade | bounded route elevation profile | build after profile preservation |
| `terrain.climbRemaining` | Climb left | route elevation profile ahead | build after profile preservation |
| `road.surfaceAhead` | Surface ahead | segment-indexed route evidence | build after evidence preservation |
| `road.gravelAhead` | Gravel ahead | segment-indexed surface evidence | build after evidence preservation |
| `road.gravelRemaining` | Gravel left | remaining segment-indexed surface evidence | build after evidence preservation |
| `road.curvesAhead` | Curves ahead | segment-indexed curvature evidence | build after evidence preservation |
| `context.daylightRemaining` | Daylight | local solar calculation | build |
| `context.smart` | Smart | deterministic context resolver | build after route-ahead foundation |

### 3.3 Experimental motion metrics

| ID | Rider label | Source | Initial state |
|---|---|---|---|
| `motion.lean` | Lean β | calibrated device orientation | beta |
| `motion.tilt` | Tilt β | calibrated device orientation | beta |
| `motion.lateralG` | Lateral G β | motion sensor | defer until signal-quality evidence |

Do not ship a metric merely because a browser API returns a number. It must survive a truthfulness and stability gate.

---

## 4. Metric data contract

Suggested canonical contract:

```ts
export type RideMetricMode = "guided" | "recording" | "free-ride"

export type RideMetricState =
  | "ready"
  | "waiting"
  | "stale"
  | "unsupported"

export type RideMetricQuality = "high" | "medium" | "low"

export interface RideMetricReading {
  id: RideMetricId
  label: string
  displayValue: string
  unit: string | null
  rawValue: number | string | null
  state: RideMetricState
  quality: RideMetricQuality | null
  sampledAt: number | null
  expiresAt: number | null
  source:
    | "navigation"
    | "recording"
    | "route-evidence"
    | "weather"
    | "astronomy"
    | "device-motion"
    | "derived"
  accessibleDetail?: string
}

export interface RideMetricDefinition {
  id: RideMetricId
  label: string
  modes: readonly RideMetricMode[]
  category: "ride" | "route" | "terrain" | "context" | "motion" | "diagnostic"
  resolve(context: RideMetricContext): RideMetricReading
}
```

Rules:

- all formatting goes through the registry/resolver, not JSX;
- one unit formatter honors `RiderSettings.units`;
- no component reaches directly into GraphHopper, Valhalla, NWS, or browser sensors;
- `unsupported` means the mode/device/source cannot provide the metric;
- `waiting` means it can provide it but has not yet received enough data;
- `stale` means the last credible value aged beyond its normal live window;
- stale values may be briefly held, then expire to `—`;
- the accessible label includes degraded/stale context without visually shouting at the rider.

### 4.1 Freshness behavior

Recommended starting policy:

- GPS/navigation speed/heading/progress: stale after ~5 s, expire after ~15 s;
- device motion: stale after ~750 ms, expire after ~2 s;
- recording aggregates: remain valid as long as the session state is valid;
- static route evidence: valid for the selected route revision;
- daylight: recompute at coarse cadence, e.g. once/minute;
- weather: use the existing route-weather cache semantics; never poll per render.

Keep these values centralized and testable.

---

## 5. Settings migration: use the existing authority

### 5.1 Required change

Bump:

```ts
RIDER_SETTINGS_VERSION = 2
```

to version 3 and expand the existing metric IDs.

Do **not** add:

- `switchback:ride-metric-slots:v1`
- a second preference repository
- component-local permanent metric choices

Continue storing the chosen IDs in:

- `uiPreferences.rideMetrics`
- `uiPreferences.recordingMetrics`

Free Ride may initially reuse `recordingMetrics`. Add a third persistent array only if user testing proves Record and Free Ride genuinely need independent layouts; do not preemptively multiply settings.

### 5.2 V2 -> V3 ID migration

Preserve every valid rider choice.

Map legacy values:

| Legacy | Canonical |
|---|---|
| `eta` | `route.eta` |
| `remaining-distance` | `route.distanceRemaining` |
| `speed` | `speed.current` |
| `elevation` | `elevation.current` |
| `elapsed` | `time.recorded` |
| recording `distance` | `distance.recorded` |

Validation must:

- keep order;
- dedupe;
- cap at exactly/at most three per current setting contract;
- repair individual bad IDs without resetting the rest of rider settings;
- fill missing slots from mode defaults;
- remain safe when localStorage is unavailable.

---

## 6. Telemetry hardening before premium presentation

### 6.1 Speed

Current recording telemetry accepts every positive GPS speed sample.

Before exposing Max Speed prominently:

- reject non-finite / negative values;
- reject samples with obviously unusable accuracy;
- use timestamp delta plus position delta to detect impossible one-sample jumps;
- do not replace a valid GPS speed with a derived value unless the derivation quality is better;
- keep filtering deterministic;
- preserve raw recorded points for backward compatibility;
- compute display aggregates from the filtered view.

Do not add a Kalman-filter framework in this feature.

### 6.2 Average speed

Define the product meaning.

Use **moving average speed**, not arithmetic mean of non-zero GPS samples:

```
moving average speed = accepted distance / moving time
```

If a separate whole-trip average is desired later, give it a separate ID. Do not silently mix definitions.

### 6.3 Moving time and stop detection

Use a conservative state machine with hysteresis, not one threshold per sample.

Suggested baseline:

- enter moving after multiple credible samples around > 3 mph;
- enter stopped after a sustained low-speed window;
- ignore very short stoplight jitter;
- GPS uncertainty must not count as motion by itself.

Keep constants centralized and test with traces.

### 6.4 Elevation

Raw phone altitude is noisy.

For live/recorded gain/loss:

- smooth altitude;
- ignore tiny changes inside a deadband;
- reject impossible vertical jumps;
- do not bridge long missing-altitude gaps;
- preserve raw points;
- compute display ascent/descent from the filtered profile.

### 6.5 Grade

Do **not** compute a rider-facing grade from one GPS altitude delta.

Preferred order:

1. route elevation profile ahead/behind the matched route point;
2. a sufficiently long filtered recorded elevation window;
3. unavailable.

Use a minimum horizontal window (roughly 150–300 m; tune with fixtures) so `+7%` means something.

---

## 7. Route-ahead evidence model

This is the key enabling architecture for Smart.

### 7.1 Preserve positional path details

GraphHopper returns detail intervals keyed to route geometry indices. Preserve useful intervals instead of reducing all evidence to aggregate mixes.

Suggested provider-neutral shape:

```ts
export interface RouteDetailSpan<T> {
  startIndex: number
  endIndex: number
  value: T
  source: "graphhopper" | "valhalla" | "import"
}

export interface RouteAheadEvidence {
  surface?: RouteDetailSpan<string>[]
  roadClass?: RouteDetailSpan<string>[]
  curvature?: RouteDetailSpan<number>[]
  maxSpeedKmh?: RouteDetailSpan<number | null>[]
  trackType?: RouteDetailSpan<string>[]
}
```

Attach it optionally to `PlannedRoute`.

GraphHopper can populate this immediately from the path details it already receives.

Valhalla/imported routes may legitimately have less evidence. Missing evidence is `unsupported` / unknown, never a clean value invented from another route-level statistic.

### 7.2 Bounded elevation profile

Extend the existing elevation enrichment result to optionally preserve a bounded profile:

```ts
export interface RouteElevationPoint {
  distanceMeters: number
  elevationMeters: number
}

elevationProfile?: RouteElevationPoint[]
```

Valhalla `/height` with `range: true` already returns cumulative range + height. Normalize that at the adapter boundary.

Keep the profile bounded:

- adaptive resample distance based on route length;
- target approximately <= 400–512 profile points;
- minimum sensible spacing around 50 m;
- maximum spacing around 500 m;
- missing DEM coverage remains explicit.

Do not attach thousands of raw provider samples to every candidate.

### 7.3 Ahead evaluator

Build a small route-ahead index once per selected route.

Input:

- route evidence;
- elevation profile;
- `NavigationFrame.segmentIndex`;
- `NavigationFrame.matchedDistanceMeters`.

Output examples:

- next surface transition + distance;
- next meaningful gravel span + distance/length;
- remaining gravel distance;
- next high-curvature span + distance/length;
- current/next sustained grade;
- climb/descent remaining.

Do not rescan the entire route on every React render.

---

## 8. Smart metric

Smart is **one metric ID**, not an autonomous dashboard and not an LLM.

### 8.1 Contract

`context.smart` chooses one concise context insight and renders it inside its slot.

Examples:

```
GRAVEL 1.6 MI
CURVES 2.1 MI
CLIMB +6%
DAYLIGHT 58 MIN
RAIN AHEAD
BREAK 1H 42M
```

The Smart slot may change its content. The other two slots stay fixed.

### 8.2 Insight shape

```ts
export type RideContextInsightKind =
  | "surface-transition"
  | "gravel"
  | "curves"
  | "climb"
  | "descent"
  | "daylight"
  | "weather"
  | "break"
  | "fallback"

export interface RideContextInsight {
  kind: RideContextInsightKind
  displayValue: string
  label: string
  priority: number
  quality: "high" | "medium" | "low"
  validUntil: number
  distanceAheadMeters?: number
}
```

### 8.3 Deterministic selection

No model call.

Start with a small explicit priority resolver:

1. meaningful imminent surface transition;
2. meaningful gravel span ahead;
3. meaningful sustained climb/descent;
4. meaningful curvy-road span;
5. daylight threshold;
6. ETA-aligned weather context;
7. break-duration context;
8. stable fallback.

The exact thresholds belong in one tested config file.

### 8.4 Anti-flicker rules

Smart must feel calm.

- minimum hold time around 10–15 seconds;
- no automatic content change more often than the hold window unless a materially higher-priority insight arrives;
- do not bounce between two equal-priority insights;
- once an insight is passed, apply a cooldown so it does not reappear because of GPS jitter;
- freeze/suppress context changes during high rider workload.

### 8.5 Workload suppression

Do not compete with more important riding tasks.

Freeze or fall back when:

- a maneuver is imminent;
- rerouting/recovery is active;
- GPS match is uncertain;
- an existing ride alert is active;
- Free Ride has an actionable suggestion on screen;
- Free Ride workload is high;
- the rider is interacting with another ride control.

Smart may remain visible, but it must stop behaving like another notification system.

### 8.6 Stable fallback

When no context insight earns the slot:

- guided: show route progress or ETA;
- recording/free ride: show moving time.

Do not flash `ALL CLEAR`, novelty copy, or empty animated states.

---

## 9. Motorcycle-specific contextual metrics

### 9.1 Curves ahead

Use segment-indexed curvature evidence.

Do not use whole-route `twistiness` to claim the next miles are curvy.

A valid insight requires:

- a contiguous/near-contiguous upcoming span;
- minimum length;
- minimum curvature threshold;
- an ahead distance that is useful rather than immediate noise.

Prefer simple wording:

`CURVES 2.1 MI`

rather than fake precision such as `17 corners ahead` unless the underlying segmentation genuinely supports a reproducible count.

### 9.2 Gravel / surface ahead

Use segment-indexed surface evidence.

Examples:

- `GRAVEL 1.6 MI`
- `GRAVEL 4.2 MI` for upcoming span length when already at transition context
- `DIRT AHEAD`

Unknown surfaces stay unknown.

### 9.3 Daylight

Daylight remaining can be calculated locally from:

- current coordinate;
- current date/time.

No network API is required.

Implement a small tested astronomical utility or reuse an already-installed suitable dependency. Do not add a large dependency solely for one number.

Smart threshold examples:

- do not surface daylight all afternoon;
- surface when sunset is close enough to affect the ride decision, e.g. < 90 minutes;
- distinguish sunset from civil-darkness only if the UI explains which value it uses.

### 9.4 Weather

Current route weather is intentionally sparse (up to a few route samples). Therefore the first Smart version may say:

`RAIN AHEAD`

only when a route weather sample and estimated arrival window support that claim.

Do **not** initially say:

`RAIN IN 18 MIN`

unless the weather-to-route timing model has enough temporal/spatial confidence to defend that precision.

NWS warnings remain in the dedicated alert tray and outrank Smart.

### 9.5 Fuel

**Cut fuel-remaining from this initial metric catalog.**

The bike profile knows nominal range/reserve, but OpenGravel does not know:

- whether the rider started with a full tank;
- current fuel level;
- the last refuel point.

Showing `24 mi fuel left` from nominal range alone would be false precision.

A later feature may add an explicit rider action such as **Tank full / Reset fuel trip**, then expose estimated range margin. Keep that contract separate.

---

## 10. Lean / tilt beta

### 10.1 Truthfulness

A mounted phone can report its own orientation. It does not automatically know true motorcycle chassis lean.

Use:

- picker label: `Lean β`;
- accessible detail: `Calibrated device lean estimate`;
- settings/detail copy explaining that it is device-relative.

### 10.2 Calibration

Require explicit calibration from a user gesture while stopped.

Record:

- neutral orientation;
- current screen orientation;
- mount reference;
- timestamp/version.

Recalibrate when:

- requested by rider;
- mount orientation changes;
- screen orientation changes in a way the transform cannot safely normalize.

### 10.3 Sensor provider

Keep one small provider interface:

```ts
export interface RideMotionSample {
  leanDegrees: number | null
  tiltDegrees: number | null
  lateralG: number | null
  quality: "high" | "medium" | "low" | "unavailable"
  sampledAt: number
}
```

Provider order:

1. browser/device orientation with explicit permission where required;
2. device motion fallback only if its gravity/orientation estimate is validated;
3. unavailable.

Future native iOS/Core Motion or a bike-mounted BLE IMU can replace the provider behind this contract without changing metric UI.

### 10.4 Runtime behavior

- request motion permission only from a deliberate user gesture;
- subscribe to motion events only when a motion metric is selected or calibration is open;
- tear down listeners immediately when unused;
- sensor sampling may be high-rate, but **React/UI updates must be throttled** to a glanceable cadence;
- target <= 5–10 visual updates/sec;
- smooth vibration noise;
- reject non-finite spikes;
- do not persist raw high-frequency motion streams in this feature.

### 10.5 Post-ride motion

Do not add "max lean trophies", badges, records, or competitive prompts in this work.

A later ride-review feature may store **bounded derived summaries** only after physical-device validation proves the measurement has enough integrity. No raw 60 Hz stream is required.

---

## 11. Live vs post-ride boundary

The live screen answers:

> What three things are useful to know right now?

The ride-review screen can answer:

> What was this ride like?

Do not overload the live strip with review analytics.

Good future post-ride neutral summaries:

- moving time;
- stopped time;
- filtered average/max speed;
- elevation gain/loss;
- longest climb;
- miles of known gravel;
- miles of high-curvature road;
- a "ride fingerprint" describing **the route**, not scoring the rider.

Avoid:

- performance leaderboards;
- speed/lean achievements;
- competitive corner scoring;
- prompts encouraging the rider to beat prior max values.

---

## 12. Shared component architecture

Recommended ownership:

```
src/
  components/
    ride/
      RideMetricStrip.tsx
      RideMetricStrip.module.css
      RideMetricPicker.tsx
      RideMetricPicker.module.css
  lib/
    client/
      ride-metrics.ts
      ride-context-insights.ts
      ride-motion.ts
    routing/
      route-ahead-evidence.ts
```

Update existing:

- `src/lib/settings/rider-settings.ts`
- `src/lib/client/recording-session.ts`
- `src/lib/routing/types.ts`
- `src/lib/routing/graphhopper-response.ts`
- elevation enrichment in `src/lib/routing/valhalla.ts`
- `src/components/planner/RideHud.tsx`
- `src/components/shell/RideRecordingHud.tsx`
- `src/components/shell/FreeRideHud.tsx`

Exact names may move if current ownership suggests a better adjacent home, but retain the boundaries:

1. source acquisition;
2. filtering/normalization;
3. metric registry;
4. context selection;
5. presentation.

No provider logic in UI components.

---

## 13. Integration by surface

### 13.1 Guided `RideHud`

Replace the fixed primary stat row with the shared strip.

Preserve as separate navigation affordances when they are useful:

- speed-limit sign;
- route progress track;
- maneuver card;
- reroute/recovery state;
- alerts;
- voice/pause/record/exit controls.

Do not convert every navigation element into a configurable metric.

### 13.2 `RideRecordingHud`

Use the same strip.

The existing central speed/elevation treatment currently duplicates footer information. After the strip lands:

- remove duplicated primary numbers;
- preserve an elevation sparkline only if it still earns space;
- hide secondary graph detail in constrained landscape;
- give the map more breathing room.

### 13.3 `FreeRideHud`

Use the same strip and recording telemetry.

If a Free Ride suggestion is active:

- the suggestion owns attention;
- Smart stops changing;
- do not render a second competing "curves/gravel ahead" prompt in the Smart slot.

Free Ride's existing one-quiet-suggestion contract remains authoritative.

---

## 14. Performance / battery constraints

This feature runs while a phone screen, GPS, map renderer, and possibly navigation are already active.

Budgets:

- no new network request per metric update;
- no route-wide O(n) scan on every GPS fix;
- pre-index route-ahead evidence once per route revision;
- keep elevation profile bounded to roughly <= 512 points;
- motion listeners exist only when needed;
- throttle motion presentation to <= 5–10 Hz;
- GPS-driven display updates should generally follow the GPS fix cadence;
- Smart resolver should be pure and cheap after evidence indexing;
- do not put high-rate values into a global Zustand store unless necessary;
- avoid React rerendering the entire HUD for motion-only updates.

If a metric cannot meet these constraints, it does not belong in the live strip.

---

## 15. Accessibility

- each slot is a real button;
- accessible name includes value + metric + action, e.g. `Elevation, 812 feet. Change metric.`;
- no live-region update for every sensor tick;
- announce user-triggered metric changes;
- announce a selected metric becoming unavailable only when useful;
- picker has a labelled dialog/sheet pattern;
- keyboard equivalent on desktop;
- visible focus;
- no meaning by color alone;
- minimum 44 px targets;
- reduced motion respected;
- numeric layout uses tabular figures;
- `Lean β` accessible detail explains device-relative status.

---

## 16. Privacy / product analytics

These are rider telemetry values, not PostHog payloads.

Allowed semantic analytics:

- `ride_metric_picker_opened`
- `ride_metric_preset_selected`
- `ride_metric_changed`
- `ride_metric_motion_permission_result`
- `ride_metric_smart_enabled`

Allowed properties:

- ride mode;
- slot index;
- metric ID;
- previous/next metric ID;
- capability state.

Never send through product analytics:

- current/average/max speed values;
- coordinates;
- elevation values;
- heading;
- route geometry;
- lean/tilt;
- acceleration;
- raw sensor samples;
- Smart insight exact location.

---

## 17. Testing contract

### 17.1 Settings / migration

Test:

- V2 -> V3 migration for every legacy metric ID;
- order preservation;
- dedupe;
- unknown IDs;
- partial corruption;
- missing slots repaired without resetting unrelated settings;
- storage unavailable;
- preset matching is derived, not separately persisted.

### 17.2 Metric resolver

Test every metric for:

- imperial/metric formatting;
- ready/waiting/stale/unsupported;
- zero vs unavailable;
- expiry;
- accessible detail;
- mode support.

### 17.3 Recording quality

Trace fixtures for:

- normal highway ride;
- stop-and-go;
- long stop;
- GPS jump;
- poor accuracy;
- missing altitude;
- altitude stair-step/noise;
- resume after pause.

Assert:

- no impossible max-speed spike;
- moving time is stable;
- average speed definition is consistent;
- gain/loss deadband works.

### 17.4 Route-ahead evidence

Test:

- GraphHopper detail interval normalization;
- current segment inside a span;
- next span distance;
- passed span;
- repeated gravel sections;
- unknown surface gaps;
- curvature span threshold;
- no claim from aggregate-only evidence;
- Valhalla/import route with no path details degrades honestly.

### 17.5 Elevation / grade

Test:

- bounded elevation profile;
- distance monotonicity;
- missing heights;
- short noisy hills;
- sustained climb;
- grade window;
- climb remaining;
- no instantaneous-GPS grade.

### 17.6 Smart resolver

Table-driven tests for:

- priority;
- hold/hysteresis;
- cooldown after passing an insight;
- equal-priority stability;
- high workload freeze;
- maneuver-imminent freeze;
- active alert suppression;
- active Free Ride suggestion suppression;
- fallback behavior;
- stale source rejection.

### 17.7 Motion

Test with mocked sensor providers:

- API absent;
- permission required;
- denied;
- granted;
- calibration;
- portrait/landscape transform;
- stale sample expiry;
- spike rejection;
- listener attaches only while needed;
- listener cleanup;
- reduced UI update rate.

### 17.8 Component / E2E / visual

Cover:

- exactly three visible slots;
- picker only while stopped/paused;
- preset selection;
- manual custom selection;
- persistence after reload/recovery;
- guided / record / Free Ride;
- Smart stable/fallback states;
- phone 390x844;
- constrained phone landscape;
- tablet portrait/landscape;
- desktop;
- Standard / Terrain / Satellite;
- reduced motion;
- high contrast and 44 px targets.

Physical iPhone acceptance is required for:

- motion permission;
- calibration;
- orientation changes;
- safe area;
- screen wake/navigation coexistence;
- real GPS degradation;
- outdoor readability;
- accidental-tap resistance.

Do not call Lean β production-ready from simulator tests.

---

## 18. Implementation slices

Implement in this order. Keep each slice green and usable.

### Slice A — shared static instrument strip

- bump RiderSettings to V3;
- migrate existing IDs;
- build canonical metric registry;
- build `RideMetricStrip`;
- build stopped-state picker/presets;
- integrate guided, Record, Free Ride;
- use only already-credible metrics;
- remove duplicated numbers where safe.

**Gate:** existing navigation/recording behavior unchanged; all three surfaces use one renderer.

### Slice B — telemetry quality

- speed filtering;
- moving/stopped state machine;
- moving average speed;
- elevation smoothing/deadband;
- freshness/stale handling.

**Gate:** deterministic trace tests green; no bogus spikes in fixtures.

### Slice C — route-ahead evidence + Smart

- preserve GraphHopper detail spans;
- preserve bounded elevation profile;
- build ahead index;
- add grade/gravel/curves/daylight metrics;
- implement deterministic Smart resolver;
- integrate existing workload suppression.

**Gate:** no location-specific wording without positional evidence; Smart anti-flicker tests green.

### Slice D — Lean β

- browser sensor capability;
- explicit permission;
- calibration;
- mount/screen transform;
- throttled display;
- quality/staleness.

**Gate:** physical iPhone evidence. If the signal is not credible, leave the metric behind a beta/experimental flag rather than lowering the truthfulness bar.

---

## 19. Explicit cuts / non-goals

Do **not** build in this work:

- arbitrary dashboard builder;
- draggable/resizable tiles;
- >3 primary live metrics;
- swiping while riding to cycle stats;
- LLM-driven Smart selection;
- Smart auto-rearranging the three slots;
- separate metric preference localStorage;
- new microservice/provider framework;
- fuel-remaining estimate without explicit tank state;
- exact "rain in N minutes" from sparse weather evidence;
- max-lean or max-speed gamification;
- high-frequency motion persistence;
- leaderboards/social performance;
- Mapbox Navigation SDK / Directions;
- renderer rewrite;
- a generic sensor plugin ecosystem;
- a Kalman-filter project unless later evidence proves the simple filters insufficient.

---

## 20. Definition of done

The feature is ready to ship when:

1. Guided, Record, and Free Ride render the same three-slot component.
2. Existing RiderSettings remains the sole preference authority.
3. Legacy metric preferences migrate without loss.
4. Exactly three metrics are visible at a glance.
5. Presets and per-slot customization work while stopped/paused.
6. The moving state cannot open a distracting picker.
7. Static metrics are filtered and truthful.
8. Avg speed means accepted distance / moving time.
9. Route-specific ahead claims are backed by positional evidence.
10. Smart is deterministic, stable, workload-aware, and never replaces safety alerts.
11. Daylight works without a network API.
12. Fuel is absent until OpenGravel has explicit tank state.
13. Lean β is calibrated, capability-aware, and honest about being device-relative.
14. Missing providers/evidence degrade to `—` / unsupported without breaking the ride.
15. No raw ride/sensor values are sent to PostHog.
16. No metric path adds per-tick network traffic.
17. Visuals obey the active Design Contract and do not become glassmorphism.
18. Phone portrait and short landscape have no overlap.
19. Real-device GPS/motion acceptance is recorded before experimental motion is promoted.
20. The live UI still answers one simple question: **what three things are useful to know right now?**

The core product decision remains: **fixed shell, configurable meaning, intelligence underneath.**
