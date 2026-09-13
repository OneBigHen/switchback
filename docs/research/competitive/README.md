# Competitive Intelligence Research

Full competitive intelligence and OpenGravel strategy for OneBigHen/switchback.

## Competitors examined

Motorcycle: Switchback Moto, Calimoto, Kurviger, REVER, Scenic, Detecht, Cardo Ride, MyRoute-app
ADV/Off-road: DMD², onX Offroad, Trails Offroad, GoraAdv, Offroad Pilot, Gaia GPS, OsmAnd
Mainstream: Google Maps, Apple Maps, Waze, Garmin Zumo ecosystem

## Sources examined

10 competitor websites, 6 app store listings, 3 third-party reviews, Reddit/forum discussions, OpenStreetMap, USFS MVUM, NOAA, OSM. See sources.md for complete list.

## Major rider pain points

1. Surface data is unreliable everywhere — universal complaint
2. Closure data is stale — recurring across products
3. Blank map = no ride — most common "I wish" statement
4. Missed-waypoint recovery is terrible — high-frequency
5. Mixed-surface intent cannot be expressed — fundamental routing gap

## Major strategic discoveries

1. **No competitor offers surface confidence.** Every app treats surface as binary (paved/unpaved). This is OpenGravel's clearest differentiation.
2. **DMD² treats navigation as a cockpit.** Remote controllers, OBD, TPMS, LoRa — at-speed interaction model OpenGravel doesn't account for.
3. **Trails Offroad's guide model** for road-condition layers is more valuable than another routing algorithm.
4. **GoraAdv's T1–T5 surface hierarchy** proves mixed-surface intent works. OpenGravel can extend this with confidence scoring.
5. **Switchback's road-entity concept** is excellent but locked to PA/NJ and AI-opaque.

## OpenGravel SWOT

See open-gravel-swot.md.

Critical weakness: No community, no historical ride data, PWA constraints, incomplete offline.
Critical advantage: Open routing stack, OSM freedom, deterministic explainable routing, self-hostable.

## Top opportunities

P0: Surface confidence model, mixed-surface intent, Free Ride 2.0, route explainability, road entity model
P1: GPX intelligence, offline transparency, bike-profile filtering, weather along route, surface alerts
P2: Road condition cards, ride comparison, seasonal access, safety scoring, bailout routes

## Five recommended investments

1. **Surface Confidence Model** — universal rider pain, no competitor addresses it
2. **Free Ride 2.0** — constrained discovery with surface/bike/weather/novelty
3. **Road Entity Model** — roads as persistent entities with rider data
4. **Route Explainability** — deterministic, transparent routing explanations
5. **Mixed-Surface Routing Intent** — T1–T5 adapted for motorcycles

## Biggest ideas rejected

- Social feed (requires critical mass we don't have)
- Generic maintenance tracker (dedicated apps exist)
- AI-generated route descriptions (deterministic is better)
- CarPlay/Android Auto (PWA constraint, premature)
- Hardware integration (not a hardware company)

## Detailed research files

- [competitor-matrix.md](competitor-matrix.md) — capability comparison scores
- [competitor-swot.md](competitor-swot.md) — SWOT for 15 competitors
- [open-gravel-swot.md](open-gravel-swot.md) — OpenGravel SWOT (ruthless)
- [rider-pain-inventory.md](rider-pain-inventory.md) — 12 pain points with sources
- [routing-intelligence.md](routing-intelligence.md) — route quality model proposal
- [gravel-intelligence.md](gravel-intelligence.md) — surface taxonomy + confidence model
- [how-open-gravel-wins.md](how-open-gravel-wins.md) — per-competitor wedges
- [battlefield-map.md](battlefield-map.md) — competitive territory mapping
- [ux-comparison.md](ux-comparison.md) — 10 journey comparisons
- [pricing-comparison.md](pricing-comparison.md) — competitor pricing analysis
- [open-data-opportunities.md](open-data-opportunities.md) — public datasets
- [open-source-opportunities.md](open-source-opportunities.md) — GitHub repos
- [rejected-ideas.md](rejected-ideas.md) — 15 things we should not build
- [opportunity-map.md](opportunity-map.md) — 15 compound/10X features + top 25 ranked
- [research-log.md](research-log.md) — source log
