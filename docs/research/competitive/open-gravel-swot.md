# OpenGravel SWOT

**Warning: not charitable. Based on actual codebase inspection, not aspirations.**

## Strengths

1. **Open routing stack** — GraphHopper + Valhalla + hybrid planner. Providers are swappable. No vendor lock-in on routing decisions. Competitors use proprietary or single-provider routing.

2. **Surface-aware routing** — OSM surface tags are first-class in the routing graph (earth, mud, gravel, paved, etc.). Valhalla's surface filtering is more capable than competitors' binary paved/unpaved.

3. **Route explainability** — Every route comes with measurable explanations (curve distance, uninterrupted backroad miles, traffic light count, surface mix). Deterministic, testable, transparent. Competitors (Calimoto, Switchback) use opaque AI scoring.

4. **Free Ride discovery** — Graph-backed candidate discovery with directed forward opportunities, GPS-confidence gating, and workload-aware suggestion. Unique among motorcycle apps — no competitor has this.

5. **GPX workflow** — Import, edit, intelligence panel, join, export. Clean and well-tested (P27–P28 phase reports document this).

6. **Road lock system** — Riders can lock roads as must-use/prefer/avoid with graph-matched enforcement. Directly addresses "preserve route intent" rider pain.

7. **Self-hostable** — Open routing stack + OSM data = can run without dependency on any company's servers. Privacy advantage.

8. **Provider flexibility** — If GraphHopper degrades, Valhalla falls back. If both fail, offline routing kicks in. No single-provider dependency.

9. **Experimentation speed** — Small codebase, TypeScript/Next.js, no hardware dependency. Can iterate routing models fast.

10. **Rider preference learning** — Neural ranking (SB-033) can re-rank eligible candidates based on ride history. Not deployed yet but architected.

## Weaknesses

1. **PWA vs native** — No background GPS, no CarPlay/Android Auto, no widget, no push notifications, limited offline. At-speed navigation is constrained by browser sandbox.

2. **Network dependence** — PWA requires service worker for offline. Live routing requires internet. The offline routing worker exists but is experimental (beta banner in UI).

3. **No community** — Zero user-generated content. No routes, no comments, no photos, no road reports. Competitors have years of community accumulation.

4. **No historical ride data** — No ride recording, no ride history, no "roads I've ridden" database. Free Ride cannot yet optimize for novelty.

5. **Small user base** — No network effects, no social proof, no word-of-mouth distribution.

6. **Routing quality is unproven at scale** — GraphHopper + Valhalla are good engines but motorcycle-specific tuning is early. PA_NJ_ROUTE_POLICY_V2 is region-locked.

7. **Unknown roads** — OSM coverage varies globally. Rural areas, forest roads, seasonal roads have gaps. No rider-reporting layer to fill them.

8. **Surface truth** — OSM surface tags are volunteer-entered and inconsistent. No confidence model. No recency tracking. No rider confirmation system.

9. **Navigation maturity** — Navigation state machine exists (P24) but is not battle-tested on real rides. Maneuver guidance, rerouting, recovery need real-world validation.

10. **No CarPlay/Android Auto** — Riders mounting phones expect投屏到car displays. OpenGravel cannot do this as a PWA.

11. **Incomplete workflows** — Some features are stubbed or partial: weather integration, fuel planning, hazard reporting, POI discovery, rider profiles.

12. **No hardware integration** — Cannot leverage handlebar remotes, Bluetooth controllers, OBD, TPMS, action cameras.

## Opportunities

1. **Surface confidence model** — No competitor offers confidence-scored surface data. This is OpenGravel's clearest differentiation.

2. **Mixed-surface intent** — GoraAdv proved T1–T5 hierarchy works. OpenGravel can extend this with bike profile, weather, season, and confidence filters.

3. **Transparent routing** — Every routing decision can be explained with measured data. Competitors hide behind AI. OpenGravel can show "why this route."

4. **Free Ride 2.0** — Current Free Ride is basic. With surface, weather, bike-profile, and novelty constraints, it could be the best "surprise me" experience.

5. **Open-data integration** — USFS MVUM, BLM, state DOT, NOAA data can power public-land, weather, closure, and seasonal-access layers.

6. **Self-hosted positioning** — Riders who distrust cloud apps (privacy, data ownership) have almost no options. OpenGravel can own this segment.

7. **Road entities** — Treating important roads as persistent entities with surface, condition, hazard, and rider-report data can power discovery, search, and recommendations.

8. **Gravel-first routing** — The gravel cycling/riding community is growing. OpenGravel can be the best gravel motorcycle app by combining surface intelligence with routing.

## Threats

1. **Google Maps** — Everyone already has it. Habit is powerful.
2. **Calimoto brand** — Synonymous with motorcycle routing in many markets.
3. **Garmin hardware** — Purpose-built GPS with independence from phones.
4. **DMD hardware ecosystem** — 250K+ devices, cockpit integration.
5. **Network effects** — Community features require critical mass. OpenGravel has none.
6. **PWA limitations** — Apple restricts PWA capabilities on iOS. Background GPS, offline routing, and at-speed interactions are constrained.
7. **Map data quality** — OSM is good but not motorcycle-specific. Wrong surface data is worse than no surface data.
8. **Routing liability** — If OpenGravel routes someone onto a closed or private road, legal exposure exists.
