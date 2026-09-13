# UX Comparison

## Journey A: "I have 90 minutes. Give me a fun ride."

| Competitor | Actions | Confusing moments | Defaults | Trust cues |
|-----------|---------|-------------------|----------|------------|
| Calimoto | 1. Open app 2. Tap "Round Trip" 3. Set distance 4. Set "Twisty" 5. Generate 6. Review 7. Navigate | "Twisty" is undefined — what does the algorithm optimize? | Distance: 50mi, Duration: 2hr | Community routes shown |
| Kurviger | 1. Open app 2. Tap "Round Trip" 3. Set distance 4. Set direction 5. Generate 6. Review 7. Navigate | No surface filter. "Twisty" is the only parameter. | Distance: 50km | Kurviger Cloud branding |
| Switchback | 1. Open app 2. Tap "Free Ride" 3. Set time 4. Generate 5. Review 6. Navigate | AI build is opaque — "why this route?" | Time: 60min | AI branding |
| OpenGravel | 1. Open app 2. Tap "Free Ride" 3. Set time + surface + bike + weather 4. Generate 5. Review (with explanation) 6. Navigate | — | Time: 90min, surface: mixed | Explanation-based |

## Journey B: "Take me from home to a destination using interesting roads"

| Competitor | Actions | Confusing moments | Defaults | Trust cues |
|-----------|---------|-------------------|----------|------------|
| Calimoto | 1. Set origin 2. Set destination 3. Select "Curvy" mode 4. Generate 5. Review 6. Navigate | No surface control | Mode: Curvy | Community routes |
| Kurviger | 1. Set origin 2. Set destination 3. Add via points 4. Select preference 5. Generate 6. Review 7. Navigate | Preferences are unclear | Preference: "Recommended" | Kurviger brand |
| Scenic | 1. Set origin 2. Set destination 3. Select routing mode 4. Generate 5. Review 6. Navigate | Mode selection is vague | Mode: "Scenic" | Scenic brand |
| OpenGravel | 1. Set origin 2. Set destination 3. Set surface preference 4. Generate 5. Review (with explanation) 6. Navigate | — | Surface: prefer backroads | Explanation-based |

## Journey C: "Find gravel nearby"

| Competitor | Actions | Confusing moments | Defaults |
|-----------|---------|-------------------|----------|
| Calimoto | No capability — binary paved/unpaved filter only | "Avoid unpaved" is the closest option | — |
| onX | 1. Open app 2. Set filters (trail type, vehicle) 3. Search 4. Review | Not motorcycle-specific | Trail difficulty |
| GoraAdv | 1. Set origin 2. Set destination 3. T1–T5 selection 4. Generate | No "nearby" — requires destination | T1–T5 default |
| Offroad Pilot | 1. Set origin 2. Set destination 3. Generate | No surface filter — always unpaved-first | Unpaved priority |
| OpenGravel | 1. Set origin 2. Set radius 3. Set surface filter (T1–T5 or confidence) 4. Generate 5. Review | — | Radius: 25mi |

## Journey D: "Find gravel suitable for a 500-lb ADV motorcycle"

| Competitor | Actions | Confusing moments | Defaults |
|-----------|---------|-------------------|----------|
| All | No competitor supports bike-profile-specific surface filtering | — | — |
| OpenGravel (target) | 1. Set origin 2. Set bike profile (ADV 500lb) 3. Set surface confidence threshold 4. Generate 5. Review | Bike profile setup is one-time | Bike: adventure |

## Journey E: "Import this GPX and ride it"

| Competitor | Actions | Confusing moments | Defaults |
|-----------|---------|-------------------|----------|
| Calimoto | Import GPX → plan → edit → navigate | GPX treated as track, not route | — |
| Kurviger | Import GPX → convert → edit → navigate | Conversion sometimes loses waypoints | — |
| Scenic | Import GPX → edit → navigate | Good support for multiple formats | — |
| DMD² | Import GPX → show/hide/invert → navigate → turn-by-turn from track | Track-to-route conversion required | — |
| OpenGravel | Import GPX → intelligence panel → edit → navigate | — | Clean GPX workflow |

## Journey F: "I deliberately left the route. Recover gracefully."

| Competitor | Actions | Confusing moments | Defaults |
|-----------|---------|-------------------|----------|
| Calimoto | Reroutes automatically — may rebuild from start | Cannot disable auto-reroute easily | Auto-reroute: on |
| Kurviger | Manual reroute required if auto-reroute off | "Automatic rerouting" setting is confusing | Auto-reroute: on |
| Scenic | Reroutes — can edit mid-ride | Editing mid-ride sometimes clears route | Auto-reroute: on |
| OpenGravel (target) | "Resume from here" with route-lock → rebuilds forward only | — | Route-lock: must-use locked points |

## Journey G: "I need gas within 35 miles"

| Competitor | Actions | Confusing moments | Defaults |
|-----------|---------|-------------------|----------|
| Calimoto | POI search → fuel → add to route | POI may be stale | — |
| Scenic | POI search → fuel → navigate | Basic | — |
| Garmin | POI search → fuel → navigate | Hardware-dependent | — |
| OpenGravel (target) | Fuel range indicator → nearest fuel without destroying route → add as waypoint | — | Range based on bike profile + fuel tank |

## Journey H: "I want to ride this with three friends"

| Competitor | Actions | Confusing moments | Defaults |
|-----------|---------|-------------------|----------|
| REVER | Share ride → friends join → live tracking | Requires REVER account | — |
| Cardo | PackRide → live location → social feed | Hardware ecosystem required | — |
| Calimoto | Share route → friends copy | No live tracking | — |
| OpenGravel (target) | Share route link → friends follow (no account required) | — | — |

## Journey I: "I have no service."

| Competitor | Actions | Confusing moments | Defaults |
|-----------|---------|-------------------|----------|
| Calimoto | Offline maps + navigation (premium) | Offline routing requires premium | — |
| Scenic | Offline maps + navigation | Download region first | — |
| DMD² | Full offline — maps + routing + nav | Topo maps are large downloads | — |
| OpenGravel (target) | Offline routing worker + cached geometry + maneuvers | Coverage map shows what's available | — |

## Journey J: "I want something I have never ridden before."

| Competitor | Actions | Confusing moments | Defaults |
|-----------|---------|-------------------|----------|
| Calimoto | Round trip → "Twisty" mode | No novelty filter | — |
| Switchback | AI route build | Opaque scoring | — |
| Free Ride (OpenGravel) | Time + surface + bike + weather + novelty → generate | — | Free Ride mode |
| OpenGravel (target) | "Never ridden" filter + surface + bike + weather + time → generate with explanation | — | Novelty weight: high |
