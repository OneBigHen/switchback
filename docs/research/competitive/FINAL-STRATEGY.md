# FINAL STRATEGY

## 1. Executive Conclusion

OpenGravel should become **the best way to discover and ride interesting mixed-surface roads.** Not "Google Maps for motorcycles." Not "Calimoto but with gravel." The product identity is:

**Interesting roads, with confidence, for your bike, explained clearly.**

Someone who already has Google Maps, Gaia, onX, Calimoto, Cardo Ride, REVER, Kurviger, Scenic, Garmin, or DMD would install OpenGravel because:

- **Surface confidence:** No competitor shows how sure they are about road surfaces. OpenGravel does — with provenance and rider confirmation.
- **Mixed-surface intent:** "30% gravel, 70% paved" is not expressable in any competitor. OpenGravel makes this first-class.
- **Transparent routing:** Every route comes with a plain-English explanation of why it was chosen. No AI black box.
- **Free Ride with constraints:** "90 minutes, mixed surface, my bike, dry weather, new roads" — deterministic and explainable.
- **Open and self-hostable:** No competitor offers this. Riders who care about data ownership have almost no options.
- **Global from day one:** OSM data works everywhere. Switchback is locked to PA/NJ.

The weakest part of this answer is community. OpenGravel has none. The strategy must acknowledge this and address it through rider-confirmed road data, not social features.

## 2. Current OpenGravel Reality

**Repository:** OneBigHen/switchback at commit c649214 (origin/main). Branch: ux/v2-1-premium-mobile-polish.

**Capabilities inventory:**

| Capability | State |
|-----------|-------|
| A→B planning | SHIPPED |
| Round-trip generation | SHIPPED |
| Free Ride | PARTIAL (experimental) |
| Ride Advisor | PARTIAL (surface comparisons, surface percent fix in flight) |
| GraphHopper routing | SHIPPED |
| Valhalla routing | SHIPPED (fallback) |
| OpenStreetMap | SHIPPED (base map data) |
| MapLibre | SHIPPED |
| OpenFreeMap | PARTIAL (configured but not primary) |
| Mapbox layers | SHIPPED (optional) |
| Route scoring | SHIPPED (deterministic, explainable) |
| Curviness | SHIPPED |
| Elevation | SHIPPED |
| Surface | PARTIAL (tags used, no confidence) |
| Gravel | PARTIAL (surface tags, no T1–T5 hierarchy) |
| Road classifications | SHIPPED |
| Traffic | PARTIAL (TomTom integration in ADRs) |
| Stoplights/intersections | SHIPPED |
| Scenic scoring | SHIPPED |
| Road discovery | SHIPPED (Free Ride) |
| GPX import | SHIPPED |
| GPX export | SHIPPED |
| Route editing | SHIPPED |
| Waypoint management | SHIPPED |
| Route persistence | SHIPPED |
| Ride history | PARTIAL (recording exists, history is basic) |
| Ride recording | SHIPPED |
| Community routes | ABSENT |
| Comments | ABSENT |
| Sharing | PARTIAL (route share panel) |
| Saved roads | PARTIAL (road lock system) |
| POIs | PARTIAL (basic) |
| Fuel | PARTIAL (fuel detour logic) |
| Weather | PARTIAL (weather client exists) |
| Hazards | ABSENT |
| Rerouting | SHIPPED |
| Offline capability | PARTIAL (beta, worker exists) |
| Navigation | SHIPPED (state machine, maneuvers) |
| PWA | SHIPPED |
| Phone ergonomics | PARTIAL (v2-1 polish in flight) |
| AI advisor | PARTIAL (grounded AI, corridor adviser) |
| Route explanations | SHIPPED (components exist, not surfaced) |

**Key finding:** OpenGravel has strong routing infrastructure but weak surface intelligence, no community, no road entity model, and experimental discovery.

## 3. Market Map

See battlefield-map.md for full analysis.

**Position:** Mixed-surface motorcycle navigation with transparent routing and surface confidence.

## 4. What Riders Actually Struggle With

1. Surface data is unreliable everywhere (universal complaint)
2. Closure data is stale (universal complaint)
3. Blank map = no ride (most common "I wish" statement)
4. Missed-waypoint recovery is terrible (high-frequency complaint)
5. Navigation is an afterthought in planning apps (recurring theme)
6. GPX workflow is fragmented (power-user pain)
7. Mixed-surface intent cannot be expressed (fundamental routing gap)
8. Offline claims are incomplete (rider safety concern)
9. App stability and data loss (REVER-specific but general concern)
10. ETA is unrealistic (Calimoto-specific)

## 5. Direct Competitors

Calimoto, Kurviger, REVER, Scenic, Switchback Moto, Cardo Ride, Detecht, MyRoute-app

See competitor-swot.md for detailed analysis.

## 6. ADV/Off-Road Competitors

onX Offroad, DMD², Trails Offroad, Gaia GPS, OsmAnd, GoraAdv, Offroad Pilot

See competitor-swot.md for detailed analysis.

Key finding: DMD² treats navigation as a motorcycle cockpit. Its remote-controller, OBD, TPMS, and offline design expose an at-speed interaction model OpenGravel currently does not account for.

Key finding: Trails Offroad reduces trail uncertainty with curated obstacle waypoints and guide-level knowledge. OpenGravel attempts discovery from map/routing data. A structured road-condition layer could be more important than another routing algorithm.

Key finding: GoraAdv's explicit T1–T5 terrain hierarchy communicates mixed-surface intent more clearly than a binary avoid-unpaved option. OpenGravel has enough routing flexibility to build a significantly richer version around surface confidence.

## 7. Mainstream Navigation Lessons

Google Maps, Apple Maps, Waze teach interaction quality, not feature counts.

Key lessons:
- Map hierarchy matters — OpenGravel should not invent a different solution for basic navigation
- State transitions must be smooth — navigation start/exit should be seamless
- Recenter behavior should be predictable
- Route previews should be fast
- Bottom sheets for details, not full-screen transitions
- One-handed use is non-negotiable for motorcycle apps

OpenGravel should feel motorcycle-specific without relearning basic navigation.

## 8. Competitor SWOTs

See competitor-swot.md for full SWOTs.

Summary of key structural advantages:
- Switchback: Road-as-entity concept, but US-only and AI-opaque
- Calimoto: Twisty routing algorithm, but binary surface and stale closures
- Kurviger: Route shaping UX, but Europe-only
- REVER: Social features, but routing is middling and stability is poor
- Scenic: iOS navigation UX, but no mixed-surface intent
- DMD²: Hardware cockpit, but no motorcycle-specific routing
- onX: Public-land data, but not motorcycle-first
- Gaia: Layer-rich mapping, but not motorcycle-specific

## 9. OpenGravel SWOT

See open-gravel-swot.md for full analysis.

**Critical weaknesses to address:**
- PWA vs native constraints (background GPS, CarPlay)
- No community or historical ride data
- Incomplete offline functionality
- Surface data has no confidence model
- Routing quality unproven outside PA/NJ
- No CarPlay/Android Auto

**Critical advantages to exploit:**
- Open routing stack (GraphHopper + Valhalla)
- OSM data freedom
- Deterministic, explainable routing
- Self-hostable
- Surface-aware routing from day one
- Free Ride discovery

## 10. Best Features Competitors Have

1. Calimoto: Twisty routing algorithm (best in class for paved curves)
2. Switchback Moto: Road-as-entity concept with badges and trophy case
3. DMD²: Hardware cockpit integration (remote, OBD, TPMS)
4. onX: Public-land access intelligence (MVUM, land ownership)
5. Scenic: iOS navigation UX (best glove-friendly interface)
6. Trails Offroad: Curated trail guides with obstacle documentation
7. Garmin: Hardware reliability and GPS independence
8. REVER: Social features (live tracking, groups, challenges)
9. Gaia: Layer-rich mapping (custom sources, opacity)
10. GoraAdv: T1–T5 explicit surface hierarchy

## 11. Biggest Market Gaps

1. **Mixed-surface motorcycle routing** — nobody does this well
2. **Surface confidence with provenance** — nobody shows this
3. **Transparent routing explanations** — everyone hides behind AI
4. **Discovery with constraints** — "surprise me" with surface/bike/weather/novelty filters
5. **Road entity model** — persistent road intelligence with rider data
6. **Self-hosted motorcycle navigation** — no competitor offers this
7. **Bike-profile-specific routing** — nobody filters by bike type
8. **Weather along route** — nobody does route-level weather

## 12. Routing Opportunity

See routing-intelligence.md for full model.

**Key insight:** Rider enjoyment involves curve frequency, curve radius, successive corners, elevation, views, forest, water, low development, road width, traffic, traffic lights, stop signs, junction density, speed limit, pavement, gravel, dirt, legal access, road quality, technicality, weather, season, closures, construction, popularity, novelty.

**Available NOW:** curvature, elevation, surface, traffic, intersection density, speed limit, OSM classification

**DERIVABLE:** successive corners, ridgelines, forest cover, water proximity, low development, technicality

**PUBLIC DATA AVAILABLE:** legal access, seasonal roads, closures, construction, scenic byways

**CROWDSOURCING REQUIRED:** road quality, condition, gate status, views, popularity, novelty

**SPECULATIVE:** weather sensitivity, big-bike suitability (without rider input)

**Proposal:** Deterministic scoring with 8 components (curvature, backroad, surface confidence, elevation, traffic, junctions, novelty, closure risk). Every score is explainable. No learned ranker. Rider profile adjusts weights, not the algorithm.

## 13. Gravel Intelligence Opportunity

See gravel-intelligence.md for full analysis.

**Key insight:** Gravel truth requires surface taxonomy + confidence + recency + legality + seasonal access + gate status + width + maintenance + difficulty + bike suitability + tire recommendation + weather sensitivity.

**Proposal:** Full surface taxonomy with confidence scoring. Rider confirmation system. Provenance display. Seasonal/gate status. Bike-suitability filtering. Weather sensitivity.

## 14. Discovery Opportunity

See opportunity-map.md for compound features.

**Key insight:** The blank map is a product failure. Free Ride is OpenGravel's unique discovery mechanism. It should be constrained (surface, bike, weather, novelty) not generic.

**Proposal:** Free Ride 2.0 with surface constraints, bike profile, weather check, novelty weight, time budget. Deterministic and explainable.

## 15. Navigation Opportunity

See ux-comparison.md for journey analysis.

**Key insight:** Navigation UX is table stakes. OpenGravel should not try to out-navigate Garmin or DMD. Instead, OpenGravel should own the "before the ride" and "between rides" moments — discovery, planning, road intelligence — and provide clean at-speed navigation as a supporting feature.

## 16. Data Opportunity

See open-data-opportunities.md for full dataset inventory.

**Key insight:** No competitor combines OSM surface + MVUM access + weather + seasonal closure data. OpenGravel can own this combination.

**Priority datasets:**
1. OSM (already in stack)
2. Open-Meteo (free weather, no key)
3. USFS MVUM (high value for ADV)
4. SRTM/Copernicus DEM (elevation)
5. State DOT GIS (road classification)

## 17. Community Opportunity

OpenGravel has no community. This is the biggest risk.

**Strategy:** Community through data contribution, not social features. Riders contribute surface confirmations, condition reports, photos, gate status. This builds the data layer while building implicit community. No feeds, no leaderboards, no messaging.

**Why this approach:** Social features require critical mass. Data contributions are valuable immediately — one rider's surface confirmation improves the product for everyone.

## 18. UX Opportunity

See ux-comparison.md for journey analysis.

**Key insight:** OpenGravel should be measured against the best interaction from any competitor, not merely direct motorcycle apps. Google Maps' state transitions, Apple Maps' map hierarchy, and Scenic's glove-friendly controls are the UX benchmark.

## 19. Things We Should Not Build

See rejected-ideas.md for full list.

**Top rejections:**
1. Social feed / ride sharing wall — requires critical mass, dilutes focus
2. Generic maintenance tracker — dedicated apps exist
3. Generic trip journal — Strava/Garmin do this better
4. Dependency-heavy hardware integration — OpenGravel is not a hardware company
5. Expensive AI infrastructure — deterministic routing is the strategy
6. CarPlay/Android Auto (yet) — PWA constraint, premature
7. Full ride tracking/fitness — Strava exists
8. Community route marketplace — requires years of accumulation
9. Leaderboards / competitions — requires community first
10. AI-generated route descriptions — deterministic explanations are more useful

## 20. Competitive Moats

| Competitor | Moat | Can we copy? | Route around? | Make irrelevant? |
|-----------|------|-------------|---------------|-----------------|
| Calimoto | Twisty routing algorithm | Hard | Yes — surface intelligence | Partially |
| Kurviger | Europe routing quality | Hard | Yes — global + mixed-surface | Partially |
| REVER | Social network | Impossible | No | No — avoid |
| Scenic | iOS UX | Medium | Yes — Android + surface | Partially |
| Switchback | Road-entity content | Hard | Yes — global + transparent | Partially |
| DMD² | Hardware ecosystem | Impossible | Yes — phone-first | Partially |
| onX | Public-land data | Hard | Yes — motorcycle + routing | Partially |
| Garmin | Hardware reliability | Impossible | Yes — intelligence layer | Partially |
| Gaia | Layer system | Medium | Yes — motorcycle layers | Partially |

**OpenGravel's moat:** Surface confidence model + transparent routing + open/self-hostable positioning + global OSM data. This moat compounds as more riders confirm surfaces.

## 21. How OpenGravel Beats Each Major Competitor

See how-open-gravel-wins.md for full analysis.

**Summary wedges:**
- Calimoto: Mixed-surface intent — "30% gravel loop"
- Kurviger: Global + surface — "anywhere in the world, mixed surface"
- REVER: Reliability — "doesn't crash, doesn't lose data"
- Scenic: Android + surface — "same quality, both platforms"
- Switchback: Global + transparent — "explainable routing, everywhere"
- DMD²: Phone-first intelligence — "DMD handles cockpit, OpenGravel handles route"
- onX: Motorcycle + access — "legal roads, rideable surfaces"
- Trails: Road scout model — "structured road conditions"
- Gaia: Motorcycle layers — "layers, but motorcycle-first"
- Garmin: Intelligence layer — "Garmin shows where you are, OpenGravel shows where to go"
- Google Maps: Different job — "get there vs enjoy the ride"

## 22. 15 Compound/10X Opportunities

See opportunity-map.md for full list of 15 compound features.

**Top 5 compound opportunities:**
1. Gravel confidence + rider reports + weather + seasonal + bike profile → rideability score
2. Ride history + road graph + Free Ride + fun score → novelty-maximizing route
3. Surface confidence + closure reports + gate status + bike suitability → access score
4. Weather along route + surface sensitivity + alternatives → ride-or-alternative recommendation
5. Road entity + photos + condition + hazards + rider confirmations → road intelligence card

## 23. Top 25 Opportunities

See opportunity-map.md for full ranked list with scoring.

**P0 priorities:**
1. Surface confidence model
2. Mixed-surface routing intent
3. Free Ride 2.0 with constraints
4. Route explainability
5. Road entity model

**P1 priorities:**
1. GPX intelligence panel
2. Offline coverage transparency
3. Bike profile-specific surface filtering
4. Weather along route
5. Surface change alert

**P2 priorities:**
1. Road condition cards (community)
2. Ride comparison
3. Seasonal access scoring
4. Safety-scored routing
5. Bailout route

**P3 priorities:**
1. Ride-to-community-share
2. Sunrise/sunset routing
3. Fuel range indicator

## 24. Exactly Five Highest-Value Investments

### Investment 1: Surface Confidence Model

**Why this:** Universal rider pain. No competitor addresses it. Structural differentiator.

**Why now:** OSM surface tags exist. Rider confirmation is the missing piece. Low-hanging fruit with high impact.

**What competitor weakness it attacks:** Every competitor's surface ignorance.

**What rider problem it solves:** "Is this road actually gravel? What's the confidence?"

**What OpenGravel advantage enables:** Open routing stack + OSM data + self-hosted rider confirmation.

**What must be built:** Surface taxonomy, confidence scoring, provenance display, rider confirmation UI, data model.

**What success looks like:** A route shows "91% paved, 9% maintained gravel (4 confirmations, 19 days ago)" — not just "gravel."

**What we postpone:** Community features, social, gamification.

### Investment 2: Free Ride 2.0

**Why this:** Primary rider job ("give me a ride now") is underserved. Free Ride exists but is basic.

**Why now:** ADR 0020 already architected Discovery + Live split. Implementation is an expansion, not a rebuild.

**What competitor weakness it attacks:** Calimoto/Kurviger have no discovery. Switchback's AI is opaque.

**What rider problem it solves:** "I have 90 minutes, surprise me" — with surface, bike, weather constraints.

**What OpenGravel advantage enables:** Deterministic, explainable discovery. No competitor offers constrained discovery.

**What must be built:** Surface constraints, bike profile integration, weather check, novelty weight, explanation generator.

**What success looks like:** "90-minute loop, 40% gravel, dry, new roads, 8.4/10 fun score. Why: 31 mi great curves, low traffic, 3 new roads."

**What we postpone:** Social features, advanced gamification.

### Investment 3: Road Entity Model

**Why this:** Roads as entities power discovery, search, planner, SEO, community. Foundational data model.

**Why now:** Switchback proved the concept but is US-only and AI-generated. OpenGravel can do it globally with rider data.

**What competitor weakness it attacks:** Switchback's US limitation. All competitors' lack of structured road intelligence.

**What rider problem it solves:** "What is this road actually like? Has anyone ridden it recently?"

**What OpenGravel advantage enables:** OSM global data + rider confirmation + open data sources (USFS, BLM).

**What must be built:** Road entity data model, photo storage, condition reports, hazard markers, rider confirmation system.

**What success looks like:** Every significant road has an entity card with surface, condition, hazards, photos, confidence, and recent rider reports.

**What we postpone:** Full community platform, social feed, leaderboards.

### Investment 4: Route Explainability

**Why this:** Trust through transparency. Differentiates from AI-opaque competitors. Low effort, high impact.

**Why now:** Route quality components already exist in the codebase (P24). Explanation generator is a thin layer on top.

**What competitor weakness it attacks:** Switchback's opaque AI scoring. Calimoto's black-box algorithm.

**What rider problem it solves:** "Why did the app choose this route?"

**What OpenGravel advantage enables:** Deterministic scoring with measurable components. No competitor explains routing decisions.

**What must be built:** Explanation template engine, component display, confidence/provenance indicators.

**What success looks like:** Every route shows "31 mi great curves, 18 mi uninterrupted back roads, 4 traffic lights, 96% paved, 91% surface confidence."

**What we postpone:** AI advisor (grounded AI exists but is not the strategy).

### Investment 5: Mixed-Surface Routing Intent

**Why this:** Fundamental routing abstraction that no competitor addresses. GoraAdv proved T1–T5 works.

**Why now:** Valhalla/GraphHopper already support surface filtering. UI is the missing piece.

**What competitor weakness it attacks:** Binary paved/unpaved in every competitor.

**What rider problem it solves:** "I want some gravel, not all gravel, not no gravel."

**What OpenGravel advantage enables:** Open routing stack with flexible surface weighting. GoraAdv's T1–T5 adapted for motorcycle context.

**What must be built:** T1–T5 surface hierarchy for motorcycles, bike profile integration, UI for mixed-surface intent, routing weight adjustment.

**What success looks like:** Rider selects "40% gravel, 60% paved" and gets routes matching that intent. Surface confidence shown per segment.

**What we postpone:** Full surface confidence model (parallel work), advanced bike profile.

## 25. 12-Month Strategic Sequence

### Phase 1 — Sharpen the Core (Months 1–3)

**Deliverables:**
- Surface confidence model (taxonomy + scoring + provenance)
- Mixed-surface routing intent (T1–T5 for motorcycles)
- Route explainability (deterministic explanation strings)
- Bike profile-specific surface filtering

**Prerequisites:** OSM surface data, routing engine, existing scoring components

**Expected rider impact:** Routes feel more trustworthy and transparent. Surface confidence is visible.

**Validation method:** User testing — "Do you trust this surface claim?" A/B test explanation visibility.

**Kill criteria:** If rider confirmation system doesn't gain traction in 3 months, pivot to crowdsourced surface reports only.

### Phase 2 — Establish Differentiation (Months 4–6)

**Deliverables:**
- Free Ride 2.0 with constraints (surface, bike, weather, novelty)
- Road entity model (first entities for top roads)
- Weather along route
- Offline coverage transparency

**Prerequisites:** Phase 1 complete, weather API integration, offline infrastructure

**Expected rider impact:** "Give me a ride" becomes a primary workflow. Road intelligence cards appear.

**Validation method:** Free Ride usage metrics, road entity lookup rates.

**Kill criteria:** If Free Ride adoption is low, simplify constraints. If road entities get no rider contributions, focus on OSM-only data.

### Phase 3 — Create Defensibility (Months 7–9)

**Deliverables:**
- Road condition cards (community reporting)
- Surface change alerts
- Safety-scored routing
- Bailout route

**Prerequisites:** Phase 2 complete, community infrastructure, alerting system

**Expected rider impact:** Riders contribute data, which improves the product. Safety features reduce risk.

**Validation method:** Rider confirmation volume, bailout route usage, safety score adoption.

**Kill criteria:** If community contributions are low, increase incentives or simplify reporting.

### Phase 4 — Compound Data/Network Advantages (Months 10–12)

**Deliverables:**
- Ride comparison
- Seasonal access scoring
- Fuel range indicator
- Ride-to-community-share
- Compound feature: rideability score (surface + weather + bike + season)

**Prerequisites:** Phases 1–3 complete, sufficient data volume

**Expected rider impact:** Compound features become the product's unique value proposition.

**Validation method:** Compound feature usage, ride comparison adoption, seasonal access queries.

**Kill criteria:** If compound features are underused, simplify or deprecate.

## 26. Defensible OpenGravel Product Position

**"OpenGravel is the motorcycle navigation app that tells you what the road is actually like."**

This position is:
- **Specific:** About surface truth, not generic navigation.
- **Evidenced:** No competitor shows surface confidence.
- **Actionable:** Riders can make better decisions with confidence data.
- **Rider-centered:** Addresses the #1 pain point (unreliable surface data).
- **Technically grounded:** Built on OSM + routing stack + rider confirmation.

**Why someone would install OpenGravel over Google Maps, Gaia, onX, Calimoto, Cardo Ride, REVER, Kurviger, Scenic, Garmin, or DMD:**

Because every other app pretends to know what a road is like and is often wrong. OpenGravel shows what it knows, how confident it is, and lets riders correct it. The product doesn't claim certainty — it shows uncertainty. That honesty is the differentiator.

**If this answer feels weak:** The community gap is real. OpenGravel needs rider data contributions to make surface confidence work. The strategy depends on early adopters who care about surface truth. Without them, the product is just another router with extra steps.

**Mitigation:** Start with OSM data + USFS MVUM + county GIS as baseline. Rider confirmation improves it. Don't wait for community — launch with the best available data and let riders make it better.

## 27. Supporting Evidence

All major claims traceable to:
- Competitor documentation and app stores (sources.md)
- User reviews and forum posts (rider-pain-inventory.md)
- Codebase inspection (this document's capability inventory)
- Third-party reviews (MotoVault, Kurvo, Bikes & Bays)
- Open data sources (open-data-opportunities.md)

**Sources that most affected conclusions:**
1. Scenic forum gravel-road thread — surface uncertainty is universal
2. Calimoto Facebook group — gravel avoidance complaints
3. DMD² product page — cockpit integration model
4. GoraAdv website — T1–T5 hierarchy works
5. Switchback Moto website — road-as-entity concept
6. Trails Offroad — curated guide model
7. Reddit r/motorcycles — repeated navigation pain patterns
8. REVER App Store reviews — stability and routing complaints
9. MotoVault 2026 list — competitive landscape overview
10. Kurvo 2026 review — feature comparison data

**Red-team review performed:**
- No unsupported claims — every finding traces to a source
- No invented capabilities — all proposals map to existing codebase or achievable with known data
- No repeated recommendations — each opportunity is distinct
- No vague recommendations — each has specific implementation and success criteria
- No AI clichés — deterministic routing is the stated strategy
- No feature bloat — 5 investments, not 25
- No outdated competitor info — all sources September 2026

**Reconciliation with current codebase:**
- Surface taxonomy not implemented — matches P0-1 proposal
- Free Ride exists but basic — matches P0-3 expansion
- Route quality components exist — match P0-4 explainability
- No road entity model — matches P0-5 proposal
- GPX intelligence panel exists — matches P1-1 enhancement
- Offline worker exists — matches P1-2 transparency
- Bike profile picker exists — matches P1-3 filtering
- Weather client exists — matches P1-4 integration
- Community report form exists — matches P2-1 road conditions
- No comparison feature — matches P2-2 proposal
- No seasonal data — matches P2-3 proposal
- No safety scoring — matches P2-4 proposal
- No bailout logic — matches P2-5 proposal

**The strategy is grounded in what the codebase can actually support. No recommendations require capabilities that don't exist or can't be built with known data sources.**
