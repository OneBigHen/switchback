# W3 — RIDE: Record, Free Ride, Guidance & Recovery

## Outcome
At-speed surfaces are calmer, safer and easier to glance at than planning surfaces. Visual polish must reduce cognitive load.

## 1. Record

### Idle
- compact `Record a ride` title;
- quiet local/private trust note;
- readiness state;
- breadcrumb/map area;
- three aligned telemetry metrics;
- Start recording dominant.

### Active
- breadcrumb grows in visual priority;
- distance/duration/speed aligned;
- Pause primary;
- Finish visible and distinct.

### Paused
- Resume primary;
- Finish secondary but obvious;
- discard remains protected.

Do not change recording persistence/finalization.

## 2. Free Ride idle

Top priority:
1. GPS confidence;
2. speed;
3. heading;
4. `Ride your way` current state;
5. restrained ride telemetry;
6. Pause/Finish/Exit or current supported controls.

Keep dark Ride Focus chrome and `Experimental` label.

Do not turn Free Ride into a destination planner or route recording substitute.

## 3. Free Ride suggestion

One suggestion only.

Card grammar:
- `EXPERIMENTAL ROAD IDEA` warning/state;
- road/suggestion title;
- max 3 concise reasons;
- score small/supporting;
- Accept primary;
- Ignore and Less like this secondary;
- Head Home remains available if existing state supports it.

Do not create a recommendation carousel, oversized score gauge or “verified/safe” language.

Preserve workload-aware suppression/cooldown/GPS semantics.

## 4. Ride HUD

### Live guidance
Topbar is quiet context/utility. Maneuver deck owns attention:
- maneuver icon;
- distance to instruction;
- road/instruction text;
- speed;
- remaining time/distance/progress;
- map remains dominant.

Voice/pause/record utilities keep 44px hit targets without competing with maneuver.

### Preview/no GPS
Clearly distinguish preview from live guidance.

### Track-only
Explicitly say track guidance. Never synthesize turn-by-turn UI that data does not support.

### GPS uncertain/error
Guidance uncertainty must be explicit. Do not quietly continue presenting confident instructions.

### Arrival
Calm completion state. Preserve recording/finalization path.

## 5. Off-route recovery

Must be visually stronger than normal guidance:
- semantic warning icon/color + text;
- direct `Off route`/recovery headline;
- original-route preservation wording where current policy supports it;
- clear recovery options;
- no implication that a reroute happened automatically if policy requires rider choice.

Recovery actions must remain reachable at phone and short-landscape sizes.

## 6. Ride recording HUD

Bring it into the same instrument grammar. Recording state and destructive discard confirmation remain explicit.

## 7. Motion

At speed:
- no decorative transition;
- no parallax;
- no auto-moving cards;
- no animated gradient;
- state changes should be immediate or restrained;
- one recording pulse allowed only where it communicates recording.

Reduced motion removes non-essential movement.

## 8. Performance

Ride HUD changes cannot cause map stutter.
- avoid layout-thrashing animation;
- keep telemetry updates bounded;
- avoid decorative effects over large map areas;
- no new map/3D/renderer work;
- no unnecessary rerender of map when text/telemetry changes.

## 9. Tests/visuals

Use deterministic fixtures for:
- Record idle/active/paused if supported;
- Free Ride idle;
- Free Ride suggestion;
- Ride live/preview;
- off-route recovery;
- track-only;
- GPS uncertain;
- arrival if supported.

Assert:
- critical telemetry fully inside viewport;
- primary safety/recovery action reachable;
- controls >=44px;
- state labels present;
- track-only/uncertain semantics explicit;
- discard/recovery callbacks unchanged.

Run representative Ride/Free Ride visual states in Chromium and WebKit.

## 10. Completion gate

Run focused ride tests and:
```bash
npm run qa:pr
```

Manually inspect at least:
- 390×844 Record;
- 390×844 Free Ride idle/suggestion;
- 390×844 Ride live/off-route;
- 844×390 Ride/off-route;
- one dark representative state (Ride Focus is already dark by contract);
- reduced-motion behavior.

Update `STATE.md`; W4 becomes ready only when W3 is behaviorally and visually green.