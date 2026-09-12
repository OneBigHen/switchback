# Top 25 Opportunities

Each opportunity: problem, evidence, competitor example, current state, proposal, why better, required data, implementation fit, difficulty, risk, differentiation, usage frequency, priority.

---

## P0-1: Surface confidence model

**Opportunity:** Confidence-scored surface data with provenance.

**Rider problem:** Wrong surface can be dangerous or impossible.

**Evidence:** Scenic forum, Calimoto Facebook group, Reddit — universal complaint across all competitors.

**Competitor example:** All competitors treat surface as binary (paved/unpaved). None show confidence.

**Current OpenGravel state:** OSM surface tags in routing but no confidence score surfaced to riders.

**Proposal:** Surface taxonomy + confidence score + provenance display + rider confirmation system.

**Why better:** No competitor does this. It's structurally harder than binary surface.

**Required data:** OSM surface, rider reports, satellite imagery (optional)

**Implementation fit:** High — fits existing routing stack and ADR architecture.

**Difficulty:** Medium

**Risk:** Medium — requires rider adoption of confirmation system.

**Differentiation:** Maximum — unique in market.

**Usage frequency:** High — every route.

**Priority:** P0

---

## P0-2: Mixed-surface routing intent

**Opportunity:** Express routing intent as surface mix, not binary avoid/unpaved.

**Rider problem:** "I want 30% gravel, 70% paved" cannot be expressed in any competitor.

**Evidence:** Calimoto Facebook group, Reddit — repeated complaints about unwanted gravel or missed gravel.

**Competitor example:** GoraAdv has T1–T5 but no motorcycle context, no confidence.

**Current OpenGravel state:** Routing can mix surfaces but UI doesn't express intent.

**Proposal:** GoraAdv-style T1–T5 adapted for motorcycles with bike profile and confidence.

**Why better:** GoraAdv is web-only, no motorcycle context, no confidence. OpenGravel adds all three.

**Required data:** Surface taxonomy, bike profile, routing weights

**Implementation fit:** High — routing engine already supports surface filtering.

**Difficulty:** Medium

**Risk:** Low — surface filtering already works in Valhalla/GraphHopper.

**Differentiation:** High — only product with mixed-surface motorcycle intent.

**Usage frequency:** High — every route.

**Priority:** P0

---

## P0-3: Free Ride 2.0 with constraints

**Opportunity:** "Surprise me" with surface, bike, weather, novelty constraints.

**Rider problem:** "I have 90 minutes, give me a fun ride" — current Free Ride is basic.

**Evidence:** Reddit — "I have no destination" is one of the most common rider requests.

**Competitor example:** Calimoto round-trip is location+distance only. No surface, no bike, no weather.

**Current OpenGravel state:** Free Ride exists but is experimental (ADR 0020).

**Proposal:** Free Ride 2.0 with surface constraints, bike profile, weather check, novelty weight, time budget.

**Why better:** Calimoto and Kurviger have no discovery at all. Switchback's AI build is opaque. OpenGravel's Free Ride is deterministic and explainable.

**Required data:** Free Ride engine, surface taxonomy, weather API, ride history

**Implementation fit:** Medium — Free Ride exists, needs constraint expansion.

**Difficulty:** Medium-High

**Risk:** Medium — needs real-world testing.

**Differentiation:** High — only product with constrained discovery.

**Usage frequency:** Very high — primary use case.

**Priority:** P0

---

## P0-4: Route explainability

**Opportunity:** Every route comes with a plain-English explanation of why it was chosen.

**Rider problem:** "Why is this the best route?" — opaque routing erodes trust.

**Evidence:** Switchback Moto's AI build is criticized for opacity. Calimoto users question routing choices.

**Competitor example:** Switchback's AI route build is a black box. Calimoto's algorithm is proprietary.

**Current OpenGravel state:** Route quality components exist (P24) but not surfaced as explanations.

**Proposal:** Deterministic explanation strings: "31 mi great curves, 18 mi uninterrupted back roads, 4 traffic lights, 96% paved."

**Why better:** Only product with fully transparent, deterministic routing explanations.

**Required data:** Route quality components (already in codebase)

**Implementation fit:** High — scoring components exist, need explanation generator.

**Difficulty:** Low-Medium

**Risk:** Low — explanation is derived from measured values, not ML.

**Differentiation:** High — trust through transparency.

**Usage frequency:** High — every route review.

**Priority:** P0

---

## P0-5: Road entity model

**Opportunity:** Roads as persistent entities with surface, condition, hazard, photo, confirmation data.

**Rider problem:** "What is this road actually like?" — no structured road intelligence exists.

**Evidence:** Switchback's Atlas is closest concept but AI-generated and US-only.

**Competitor example:** Switchback has road entities but AI-generated, not rider-confirmed.

**Current OpenGravel state:** Road entity concept exists in architecture (docs/adr) but no implementation.

**Proposal:** Road entity with geometry, aliases, region, surface, confidence, difficulty, curviness, elevation, scenery, traffic, closures, seasonal info, rider confirmations, hazards, fuel, photos, history.

**Why better:** Switchback's road entities are AI-generated and US-only. OpenGravel's can be rider-confirmed and global.

**Required data:** OSM, rider reports, USFS MVUM, satellite

**Implementation fit:** Medium — requires new data model and storage.

**Difficulty:** High

**Risk:** Medium — data model complexity.

**Differentiation:** High — road entities power discovery, search, planner, SEO, community.

**Usage frequency:** Medium — per road lookup.

**Priority:** P0

---

## P1-1: GPX intelligence panel

**Opportunity:** Import GPX → surface analysis per segment → edit → surface-annotated export.

**Rider problem:** "I imported a GPX but don't know the surface quality."

**Evidence:** GPX import exists but lacks surface intelligence.

**Competitor example:** Gaia GPS has layers but no surface intelligence on imported GPX.

**Current OpenGravel state:** GPX import/export exists (P27–P28). GpxIntelligencePanel component exists.

**Proposal:** Enhance GpxIntelligencePanel with per-segment surface classification, confidence, and condition.

**Why better:** Only product that annotates imported GPX with surface intelligence.

**Required data:** Surface taxonomy, OSM surface tags

**Implementation fit:** High — component already exists, needs surface enrichment.

**Difficulty:** Low-Medium

**Risk:** Low — builds on existing component.

**Differentiation:** Medium-High — useful power-user feature.

**Usage frequency:** Medium — per GPX import.

**Priority:** P1

---

## P1-2: Offline coverage transparency

**Opportunity:** Show riders exactly what's covered offline before they go offline.

**Rider problem:** "Will I have navigation where I'm going?" — current apps claim offline but don't show gaps.

**Evidence:** Multiple reviews complain about "offline" that doesn't include routing.

**Competitor example:** DMD has offline maps but no coverage transparency. Calimoto offline requires premium.

**Current OpenGravel state:** Offline routing worker exists (P29). Region downloads exist. No coverage map.

**Proposal:** Coverage map showing offline routing availability per region. Gap detection on route planning.

**Why better:** Honest offline — expose what works and what doesn't. No competitor does this.

**Required data:** Region catalog, coverage metadata, route corridor extraction

**Implementation fit:** Medium — builds on existing offline infrastructure.

**Difficulty:** Medium

**Risk:** Low — informational only, no safety risk.

**Differentiation:** Medium — transparency is a trust signal.

**Usage frequency:** Medium — pre-trip planning.

**Priority:** P1

---

## P1-3: Bike profile-specific surface filtering

**Opportunity:** "My bike can't handle rough roads" → automatic surface filtering.

**Rider problem:** Sport bikes on gravel, heavy ADV on single-track.

**Evidence:** REVER reviews report gravel on sportbike routes. No competitor filters by bike type.

**Competitor example:** None — all bikes get the same routing.

**Current OpenGravel state:** Bike profile picker exists (BikeProfilePicker component). No surface filtering by bike.

**Proposal:** Bike profile (weight, tire, suspension) → surface suitability matrix → automatic surface filtering.

**Why better:** No competitor does bike-profile-specific routing.

**Required data:** Bike profile, surface suitability matrix

**Implementation fit:** Medium — bike profile exists, needs suitability matrix.

**Difficulty:** Medium

**Risk:** Low — filtering is conservative (prefer paved when uncertain).

**Differentiation:** High — unique capability.

**Usage frequency:** High — every route.

**Priority:** P1

---

## P1-4: Weather along route

**Opportunity:** Weather forecast along the route, not just at origin.

**Rider problem:** "It's sunny here but going to rain at mile 40."

**Evidence:** No competitor provides route-level weather. Weather is an afterthought everywhere.

**Competitor example:** None do route-level weather.

**Current OpenGravel state:** Weather client exists (weather-client.ts). No route-level integration.

**Proposal:** Weather API along route corridor. Elevation-adjusted forecast. Weather alerts at waypoints.

**Why better:** No competitor does route-level weather.

**Required data:** Weather API (Open-Meteo), route corridor, elevation data

**Implementation fit:** Medium — weather client exists, needs route integration.

**Difficulty:** Medium

**Risk:** Low — weather data is informational.

**Differentiation:** High — unique capability.

**Usage frequency:** Medium — pre-trip planning.

**Priority:** P1

---

## P1-5: Surface change alert

**Opportunity:** Alert rider when surface changes ahead (paved → gravel).

**Rider problem:** Surprise surface changes are dangerous or unpleasant.

**Evidence:** Rider reports of unexpected gravel on "paved" routes.

**Competitor example:** None alert for surface changes.

**Current OpenGravel state:** Surface data exists per segment. No change detection.

**Proposal:** Surface change detection along route. Alert before change. Suggest alternative if desired.

**Why better:** Proactive safety feature no competitor has.

**Required data:** Surface taxonomy, route geometry

**Implementation fit:** Medium — builds on surface classification.

**Difficulty:** Medium

**Risk:** Low — alert only, no automatic reroute.

**Differentiation:** High — proactive safety.

**Usage frequency:** Medium — per navigation session.

**Priority:** P1

---

## P2-1: Road condition cards (community)

**Opportunity:** Community-reported road conditions with photos and confidence.

**Rider problem:** "Is this road in good shape right now?"

**Evidence:** Rider reports are the best source of road condition. No competitor has structured road condition reporting.

**Competitor example:** onX has trail reports but not road-specific.

**Current OpenGravel state:** Community components exist (CommunityReportForm) but not for road conditions.

**Proposal:** Road condition reporting: surface, condition, photo, hazard, confidence. Integrated into road entity.

**Why better:** Structured road condition data vs onX's unstructured trail reports.

**Required data:** Community reporting, photo storage, condition taxonomy

**Implementation fit:** Medium — community infrastructure exists.

**Difficulty:** Medium

**Risk:** Medium — requires moderation and quality control.

**Differentiation:** High — community-powered road intelligence.

**Usage frequency:** Medium — per road.

**Priority:** P2

---

## P2-2: Ride comparison

**Opportunity:** Compare rides — surface, elevation, curvature, speed.

**Rider problem:** "How does today's ride compare to last time?"

**Evidence:** Ride recording exists in most apps but comparison is rare.

**Competitor example:** Scenic has ride stats but no comparison.

**Current OpenGravel state:** Ride recording exists. No comparison feature.

**Proposal:** Ride comparison card: same route different days, or different routes similar profiles.

**Why better:** Ride history + comparison = learning loop for rider preferences.

**Required data:** Ride history, surface analysis, elevation, curvature

**Implementation fit:** Medium — ride history exists, needs comparison engine.

**Difficulty:** Medium

**Risk:** Low — informational only.

**Differentiation:** Medium — useful but not unique.

**Usage frequency:** Low-Medium — post-ride.

**Priority:** P2

---

## P2-3: Seasonal access scoring

**Opportunity:** "Is this road open this time of year?"

**Rider problem:** Forest roads closed seasonally. Riders get routed onto closed roads.

**Evidence:** Calimoto users report routing onto closed roads. USFS MVUM has seasonal data.

**Competitor example:** onX has trail status but not seasonal road intelligence.

**Current OpenGravel state:** No seasonal road data in routing.

**Proposal:** Integrate USFS MVUM seasonal data. Surface seasonal access score per road segment.

**Why better:** Seasonal access is critical for ADV riding. No competitor does this for motorcycles.

**Required data:** USFS MVUM, state DOT seasonal data

**Implementation fit:** Medium — requires data ingestion pipeline.

**Difficulty:** Medium-High

**Risk:** Medium — data freshness is critical.

**Differentiation:** High — USFS integration is unique.

**Usage frequency:** Medium — pre-trip planning for forest roads.

**Priority:** P2

---

## P2-4: Safety-scored routing

**Opportunity:** Route scoring that includes traffic, road width, curve sharpness.

**Rider problem:** "I want fun roads but not dangerous ones."

**Evidence:** Safety is a rider concern but no product scores for it.

**Competitor example:** None.

**Current OpenGravel state:** Route quality scoring exists (P24) but no safety dimension.

**Proposal:** Add safety component to route scoring: traffic density, road width, curve severity.

**Why better:** Safety scoring is a differentiator that also appeals to riders' partners ("is this safe?").

**Required data:** Traffic API, OSM width, curvature

**Implementation fit:** Medium — scoring engine exists, needs safety component.

**Difficulty:** Medium

**Risk:** Low — safety is additive, not replacement.

**Differentiation:** Medium — safety scoring is rare.

**Usage frequency:** Medium — route review.

**Priority:** P2

---

## P2-5: Bailout route

**Opportunity:** Emergency exit route when conditions change.

**Rider problem:** "This road is getting worse — what's the nearest paved exit?"

**Evidence:** Rider-reported road deterioration is common.

**Competitor example:** None provide bailout routes.

**Current OpenGravel state:** Rerouting exists but no "bailout to paved" logic.

**Proposal:** Bailout route calculation: nearest paved road from current position, preserving progress.

**Why better:** Safety-critical feature no competitor has.

**Required data:** Surface classification, rerouting engine

**Implementation fit:** Medium — builds on rerouting and surface data.

**Difficulty:** Medium-High

**Risk:** Low — bailout is conservative (to paved, not home).

**Differentiation:** High — safety feature.

**Usage frequency:** Low but critical — emergency only.

**Priority:** P2

---

## P3-1: Ride-to-community-share

**Opportunity:** Share a ride as a public road entity.

**Rider problem:** "I found a great road — share it."

**Evidence:** Community route sharing drives discovery in Calimoto and REVER.

**Competitor example:** Calimoto has 200K+ community routes.

**Current OpenGravel state:** Community publish panel exists but no ride-to-entity flow.

**Proposal:** Share completed ride as a road entity with surface, condition, and photo data.

**Why better:** Rides become road intelligence, not just social posts.

**Required data:** Ride recording, road entity model, community publishing

**Implementation fit:** Medium — community infrastructure exists.

**Difficulty:** Medium

**Risk:** Low — sharing is opt-in.

**Differentiation:** Medium — rides as data contributions.

**Usage frequency:** Low-Medium — post-ride.

**Priority:** P3

---

## P3-2: Sunrise/sunset routing

**Opportunity:** Plan rides around golden hour.

**Rider problem:** Riders want scenic rides at sunrise/sunset.

**Evidence:** Scenic photography is a rider motivation.

**Competitor example:** None offer sunrise/sunset routing.

**Current OpenGravel state:** No time-of-day routing.

**Proposal:** Sunrise/sunset times along route. Route scoring bonus for scenic segments at golden hour.

**Why better:** Niche but memorable feature.

**Required data:** Sunrise/sunset API, scenic scoring

**Implementation fit:** Low — informational only.

**Difficulty:** Low

**Risk:** Low — no safety implications.

**Differentiation:** Low — nice-to-have.

**Usage frequency:** Low — specific riding style.

**Priority:** P3

---

## P3-3: Fuel range indicator

**Opportunity:** "How far can I go on this tank?"

**Rider problem:** Fuel range anxiety on long rides.

**Evidence:** Fuel planning is a common rider concern.

**Competitor example:** Scenic has fuel POI search but no range indicator.

**Current OpenGravel state:** Fuel detour logic exists (useRideFuelDetour). No range indicator.

**Proposal:** Fuel range indicator based on bike profile + tank size + current fuel. Nearest fuel without destroying route.

**Why better:** Proactive fuel planning vs reactive POI search.

**Required data:** Bike profile, fuel tank size, fuel stations

**Implementation fit:** Medium — fuel logic exists, needs range calc.

**Difficulty:** Low-Medium

**Risk:** Low — informational only.

**Differentiation:** Medium — useful utility.

**Usage frequency:** Medium — pre-trip and mid-ride.

**Priority:** P3
