# How OpenGravel Beats Each Competitor

For every major competitor: why riders use them, their strongest advantage, their weakness, what we should NOT compete on, where we can beat them, and the concrete wedge.

---

## Calimoto

**Why riders use it:** Fast generation of enjoyable paved motorcycle routes. Large community route database. Mature UI. Round-trip generator.

**Strongest advantage:** Twisty-road routing algorithm — the best in class for paved curves.

**Weakness:** Surface intelligence is binary (paved/unpaved). Closure data is stale. No mixed-surface intent. ETA assumes speed-limit speed. Opaque AI scoring.

**Do NOT attack:** Mature native navigation solely by duplicating every feature. Calimoto's routing algorithm took years to build — do not try to out-curve them at their own game.

**Where OpenGravel can beat them:** Surface intelligence + mixed pavement/gravel + route transparency.

**Wedge:** "Give me 2 hours of quiet twisty pavement with 20–40% maintained gravel, no interstate, and get me home before sunset." Calimoto cannot express mixed-surface intent. OpenGravel can.

**Why this matters:** Calimoto's central abstraction is "enjoyable road riding" (paved curves). OpenGravel makes mixed-surface intent first-class. Riders who want gravel segments are underserved by Calimoto — and this is a growing segment.

---

## Kurviger

**Why riders use it:** Precise route shaping via points. Excellent Europe coverage. Clean planning UX. Motorcycle POIs.

**Strongest advantage:** Route shaping UX — click-to-add via points is the most precise in class.

**Weakness:** Weak outside Europe. No mixed-surface intent. No discovery/generation. Navigation requires paid tier.

**Do NOT attack:** Route shaping UX — Kurviger is genuinely good at this.

**Where OpenGravel can beat them:** Global coverage + surface-aware routing + discovery.

**Wedge:** "Plan a loop anywhere in the world with mixed surface — no other app does this outside Europe." Kurviger's geographic limitation is structural (routing data quality outside Europe).

**Why this matters:** Kurviger is Europe-only in effective routing quality. OpenGravel's OSM-based routing works globally. The "plan anywhere" + "mixed surface" combination is unique.

---

## REVER

**Why riders use it:** Social/community features. Butler Maps overlay (US). Crash detection (CRASHLIGHT). Multi-waypoint planning.

**Strongest advantage:** Social network — live tracking, groups, challenges, leaderboards.

**Weakness:** Routing quality is middling. App stability problems (crashes, lost data). Social features dilute navigation focus. Dirt/gravel on sportbike routes.

**Do NOT attack:** Social features — REVER's community is its moat and OpenGravel cannot replicate it without years of accumulation.

**Where OpenGravel can beat them:** Routing quality + reliability + surface intelligence.

**Wedge:** "Reliable navigation that doesn't crash and doesn't lose your ride data." REVER's stability problems are documented and recurring. OpenGravel can win on trust.

**Why this matters:** Riders who prioritize navigation quality over social features will leave REVER for reliability. This is a sizable segment.

---

## Scenic

**Why riders use it:** Best iOS navigation UX. Offline maps. Detour controls. Stop management.

**Strongest advantage:** iOS-first navigation UX — glove-friendly, clean, reliable offline.

**Weakness:** iOS only. No mixed-surface intent. No discovery/generation. No traffic. Surface data no better than OSM.

**Do NOT attack:** iOS navigation UX — Scenic is genuinely excellent on iPhone.

**Where OpenGravel can beat them:** Android support + surface intelligence + discovery.

**Wedge:** "Same quality navigation on Android, plus gravel routing and route discovery." Scenic's iOS exclusivity is self-inflicted whitespace.

**Why this matters:** Android riders are underserved by Scenic. OpenGravel as PWA works on both platforms. Surface-aware routing + Free Ride discovery is Scenic's largest gap.

---

## Switchback Moto

**Why riders use it:** Roads as content entities (Atlas). Badge/trophy system. AI route builds. SEO-friendly road guides.

**Strongest advantage:** Road-as-entity concept — every road has persistent content attached.

**Weakness:** PWA-only (no offline, no background GPS). AI scoring is opaque. US-only (PA/NJ). Free tier is severely limited.

**Do NOT attack:** Road-as-entity concept — Switchback pioneered this and it works.

**Where OpenGravel can beat them:** Transparent deterministic scoring + global coverage + mixed-surface routing.

**Wedge:** "The same road-entity concept but with explainable routing that works everywhere, not just PA/NJ." Switchback's geographic limitation is a structural weakness OpenGravel can exploit.

**Why this matters:** Switchback's road-entity model is excellent but locked to the US East Coast. OpenGravel can do the same thing globally with open data.

---

## DMD²

**Why riders use it:** Cockpit integration — remote controllers, OBD, TPMS, LoRa. 300+ offline topo maps. Free core app. 250K+ devices.

**Strongest advantage:** Hardware integration + offline topo mapping — the motorcycle cockpit approach.

**Weakness:** Software is Android-only. No motorcycle-specific routing (curves, scenic). UI is dashboard-oriented, not rider-experience-oriented. No discovery/generation. Community is hardware-driven.

**Do NOT attack:** Hardware integration — DMD's hardware moat is real and OpenGravel cannot compete here.

**Where OpenGravel can beat them:** Phone-first experience + motorcycle-specific routing + discovery + surface intelligence.

**Wedge:** "Best motorcycle routing on your phone — DMD handles the cockpit, OpenGravel handles the route." DMD and OpenGravel are complementary for riders who want both.

**Why this matters:** DMD riders often carry a phone anyway. OpenGravel can be the routing layer on top of DMD's hardware ecosystem without trying to replace it.

---

## onX Offroad

**Why riders use it:** Best public-land/access intelligence. Trail status, land ownership, MVUM. Curated trail guides.

**Strongest advantage:** Land-access data — MVUM, ownership, trail status.

**Weakness:** Not motorcycle-first. No motorcycle routing. GPX imported as track, not editable route. No navigation.

**Do NOT attack:** Public-land data — onX built this over years and OpenGravel cannot replicate it.

**Where OpenGravel can beat them:** Motorcycle routing on top of public-land overlays.

**Wedge:** "Motorcycle routing that knows which roads are legal, accessible, and rideable." Integrate MVUM data as a layer, then add motorcycle routing on top.

**Why this matters:** ADV riders need both access intelligence and routing. onX has access; OpenGravel can have routing. The combination is the product.

---

## Trails Offroad

**Why riders use it:** Curated trail guides with obstacle documentation, photos, difficulty ratings. Expert trail scouts.

**Strongest advantage:** Curated expert trail content — guide-level knowledge.

**Weakness:** Not motorcycle-first. No navigation. No motorcycle routing. Limited to US.

**Do NOT attack:** Trail guide content — this takes years to build.

**Where OpenGravel can beat them:** "Road scout" model — structured road-condition documentation.

**Wedge:** "Curated road conditions, not just trail difficulty." Adopt Trails' guide model for roads — surface confidence, gate status, recent rider reports, bike suitability.

**Why this matters:** ADV riders need condition information, not just routing. A structured road-condition layer is more valuable than another routing algorithm.

---

## Gaia GPS

**Why riders use it:** Layer-rich mapping. Custom sources, opacity, Map Packs. Offline layered maps.

**Strongest advantage:** Map layer flexibility — the layer benchmark.

**Weakness:** Not motorcycle-specific. No motorcycle routing. No community route discovery. Complex UI.

**Do NOT attack:** Layer system — Gaia's strength is breadth of sources, not motorcycle intelligence.

**Where OpenGravel can beat them:** Motorcycle-specific layers (curvature, surface, traffic) + discovery.

**Wedge:** "The layer-rich map, but motorcycle-first." Gaia proves riders want customizable layers — OpenGravel can provide motorcycle-specific layers that Gaia doesn't.

**Why this matters:** Gaia is the "I need a good map" app. OpenGravel is the "I need a good ride" app. Different jobs, but Gaia users who want motorcycle routing are underserved.

---

## Garmin Zumo

**Why riders use it:** Purpose-built GPS. Sunlight readable. Waterproof. Glove-friendly. No phone dependency.

**Strongest advantage:** Hardware reliability + GPS independence.

**Weakness:** Basic routing (no curvature scoring, no scenic, no surface intelligence). No community. No discovery. Expensive hardware.

**Do NOT attack:** Hardware reliability — Garmin's hardware moat is real.

**Where OpenGravel can beat them:** Routing intelligence + discovery + surface awareness.

**Wedge:** "Garmin handles where you are, OpenGravel handles where to go." Complementary, not competitive.

**Why this matters:** Garmin Zumo riders often carry a phone. OpenGravel can be the "brain" while Garmin is the "display" for riders who want both.

---

## Google Maps

**Why riders use it:** Universal. Best traffic data. ETA accuracy. Everyone already has it.

**Strongest advantage:** Default app + traffic data + habit.

**Weakness:** Not motorcycle-specific. No curve scoring. No surface awareness. No GPX workflow. No off-road.

**Do NOT attack:** Google Maps at its own game — you cannot beat Google at traffic and coverage.

**Where OpenGravel can beat them:** Motorcycle-specific routing + discovery + surface intelligence.

**Wedge:** "Google Maps gets you there. OpenGravel makes the ride enjoyable." Different job entirely.

**Why this matters:** Google Maps is the "I need to get somewhere" app. OpenGravel is the "I want to enjoy the ride" app. Riders who care about the journey, not just the destination, are OpenGravel's market.
