# Product North Star

## Product identity

Switchback is a motorcycle-first route planning, navigation, discovery, and riding intelligence product.

It should **not** become:
- a generic trip planner,
- a generic social network,
- a clone of Google Maps,
- a prettier GPX viewer,
- a stack of cards on top of a map,
- a chatbot with maps attached.

Its durable advantage is the combination of:
- road character,
- motorcycle-specific route choice,
- explainable alternatives,
- route continuity / flow,
- curvature and scenic quality,
- surface awareness,
- rider preference learning,
- route locking / road intent,
- Free Ride discovery,
- online and offline ambitions,
- rider-focused navigation.

## Primary user jobs

### Before a ride
1. “Find me somewhere great to ride.”
2. “Get me to this destination using roads I will enjoy.”
3. “Give me a loop for roughly this much time.”
4. “Preserve this road / GPX intent.”
5. “Show me alternatives and why they are different.”
6. “Tell me whether weather, closures, fuel, or surface conditions matter.”

### During a ride
1. “Tell me where to go with almost no interaction.”
2. “Keep me on the good route I chose.”
3. “Recover intelligently if I miss something.”
4. “Show only high-value hazards and route changes.”
5. “Let me add a stop without rebuilding my trip from scratch.”
6. “If I am in Free Ride, quietly find good roads ahead.”

### After a ride
1. “Save what I actually rode.”
2. “Show useful ride statistics and route quality.”
3. “Help the system learn what I like.”
4. “Let me reuse, share, or compare the ride.”

## Design principles

### 1. Map first
The map occupies the visual foundation. Controls and data sit *over* or *beside* it only when necessary.

### 2. Progressive disclosure
At a glance:
- destination / route identity,
- time,
- distance,
- arrival,
- route character,
- critical warnings.

One interaction deeper:
- elevation,
- surface,
- curve density,
- traffic controls,
- towns,
- weather,
- fuel,
- alternatives,
- road details,
- live incidents.

A further detail view may expose:
- scoring breakdown,
- confidence,
- provenance,
- raw road-character metrics,
- debug/diagnostic data.

### 3. Information density is contextual
**Stopped/planning:** high density is good.  
**Moving/navigating:** density is dangerous and counterproductive.

### 4. Explain rider value, not generic scores
Bad:
- “Score 86/100.”

Good:
- “31 mi great curves”
- “18 mi uninterrupted back roads”
- “4 traffic lights”
- “96% paved”
- “Low town traffic”
- “+11 min vs fastest”
- “More flowing than Twisty”

Scores can exist in expanded details, not as the primary product language.

### 5. Premium but instrument-like
Visual character:
- dark-friendly,
- high contrast,
- confident typography,
- deliberate elevation,
- restrained color,
- smooth animation,
- topographic / terrain depth,
- minimal chrome,
- road lines and route state more important than decorative cards.

### 6. Riding state is a separate interaction regime
The ride HUD must not simply be the planner with fewer controls.
It should behave like an instrument cluster:
- maneuver,
- next maneuver,
- route,
- speed / limit,
- ETA / remaining,
- warnings only when relevant.

### 7. 3D must explain terrain
3D terrain is valuable because riders care about:
- mountains,
- valleys,
- ridges,
- road elevation,
- road geometry through terrain.

Do not use camera pitch or animation merely to look impressive.

## Product signature

### Route planning signature
“Switchback shows *why* this road is worth your time.”

### Free Ride signature
> “Turn it on, ride, and Switchback quietly finds the roads you would have wished you knew about.”

## Success metrics to instrument later

Do not block implementation on analytics, but design around:
- time to first viable route,
- number of interactions before “Go,”
- alternative route selection rate,
- expanded-detail usage,
- Free Ride prompts per hour,
- Free Ride accept/pass rate,
- off-route recovery success,
- route replan abandonment,
- map rendering failure rate,
- frame pacing / interaction latency,
- route-start-to-navigation success.
