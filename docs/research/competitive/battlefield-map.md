# Battlefield Map

Mapping the competitive landscape along strategic axes.

## Axis 1: Street ←→ Off-road

```
STREET                                                    OFF-ROAD
|                                                         |
|  Calimoto  Kurviger  Scenic  REVER  Switchback          |
|                                                         |
|  OpenGravel (gap — mixed-surface)                       |
|                                                         |
|  Garmin Zumo  DMD²  onX  Trails  Gaia  OsmAnd          |
|                                                         |
```

**Observation:** The street apps don't do off-road well. The off-road apps don't do motorcycle routing well. OpenGravel's mixed-surface positioning sits in the whitespace between — but only if it executes.

**Problem with "mixed-surface" as a position:** It's a feature, not a position. "Mixed-surface motorcycle navigation" describes what the product does, not why a rider chooses it. The position needs to be about the rider's job, not the product's capability.

## Axis 2: Navigation ←→ Discovery

```
NAVIGATION                                            DISCOVERY
|                                                     |
|  Garmin  DMD  Scenic  Calimoto  Kurviger  REVER     |
|                                                     |
|  OpenGravel (gap — can be both)                     |
|                                                     |
|  Gaia  onX  Trails  OsmAnd  Komoot  Ride w/ GPS    |
|                                                     |
```

**Observation:** Navigation apps are bad at discovery. Discovery apps are bad at navigation. OpenGravel's Free Ride + surface-aware routing could occupy the "discovery-first navigation" position.

**Opportunity:** "Give me a ride" is the primary job for many riders. Most apps optimize for "take me somewhere." OpenGravel can optimize for "find me something great."

## Axis 3: Simple ←→ Expert

```
SIMPLE                                              EXPERT
|                                                   |
|  Calimoto  Scenic  REVER  Kurviger               |
|                                                   |
|  OpenGravel (gap — can be either)                 |
|                                                   |
|  Gaia  onX  DMD  Garmin  OsmAnd                  |
|                                                   |
```

**Observation:** Simple apps lack technical depth. Expert apps are complex. OpenGravel can be "simple by default, expert on demand" — surface confidence, routing explanations, and adjustable complexity.

## Axis 4: Closed Ecosystem ←→ Open Ecosystem

```
CLOSED                                              OPEN
|                                                   |
|  Calimoto  Kurviger  REVER  Scenic  Garmin       |
|                                                   |
|  OpenGravel (strongest position)                  |
|                                                   |
|  Gaia  OsmAnd  Komoot  onX  DMD                  |
|                                                   |
```

**Observation:** OpenGravel's open routing stack + OSM data + self-hostability positions it at the "open" end. This is a real differentiator — riders who care about data ownership and transparency have almost no options.

## Strategic whitespace analysis

**Genuinely empty quadrants:**
1. Mixed-surface motorcycle navigation with confidence scoring — nobody does this well.
2. Phone-first motorcycle navigation with transparent routing — everyone else is native or hardware.
3. Open/self-hosted motorcycle navigation — no competitor offers this.

**Crowded quadrants:**
1. Street motorcycle navigation (Calimoto, Kurviger, REVER, Scenic) — crowded but differentiated by routing algorithm.
2. Off-road navigation (onX, Trails, DMD, Gaia) — crowded but motorcycle-specific is thin.

**Dangerous empty quadrants (do not enter):**
1. "Best everything" — incoherent mess.
2. Social/network features without critical mass — waste of time.
3. Hardware — OpenGravel is not a hardware company.

## Position hypothesis

**"OpenGravel is the best way to discover and ride interesting mixed-surface roads."**

Test against the five jobs:

1. "Find me somewhere great to ride" → Free Ride with surface constraints ✓
2. "Get me to this destination using roads I will enjoy" → Surface-aware routing ✓
3. "Give me a loop for roughly this much time" → Free Ride Discovery ✓
4. "Show me alternatives and why they are different" → Transparent scoring ✓
5. "Tell me whether surface conditions matter" → Surface confidence layer ✓

**Position passes the five-job test.** The differentiator is not "navigation" or "discovery" alone — it's "mixed-surface road intelligence with transparent routing."
