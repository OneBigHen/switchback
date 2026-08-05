# Product Decisions

## Product definition

Switchback is a personal motorcycle routing and ride companion for a single-rider or household deployment. It is not a general mapping platform and does not need every Google Maps feature.

Its differentiated value is:

- finding more enjoyable legal motorcycle roads;
- adapting routes to the actual motorcycle;
- making route tradeoffs explainable;
- preserving local privacy;
- continuing when providers or connectivity degrade;
- supporting quick mobile planning and precise desktop shaping.

## Core supported journeys

### Quick destination ride
Use current location, choose a destination or ride intent, compare two or three valid routes, and start guidance.

### Timeboxed loop
Choose duration and route character, receive an honest loop, prepare it offline, and ride.

### Desktop route creation
Build A-to-B or loop routes, add/reorder shaping points, adjust leg character, add avoid areas or a properly matched required road, compare candidates, and save/export.

### Offline prepared ride
Download regional data and a route pack, confirm readiness, lose connectivity, reload the installed PWA, and continue with supported recovery.

### Free Ride
Record an unplanned ride and optionally receive one graph-backed suggestion ahead.

## Keep and harden

- GraphHopper-primary routing.
- Optional Valhalla fallback/enrichment where semantics match.
- Deterministic natural-language fallback.
- Destination, loop, and timeboxed planning.
- Route comparison.
- GPX import/export.
- Local route and ride libraries.
- Recording and replay.
- Weather and route evidence.
- Offline route packs and regional data.
- PWA installation.
- Bike-specific constraints.
- Mobile ride HUD.
- Desktop route editing.
- Explicit local preference learning.

## Rewrite

- Road locks/requirements.
- Free Ride recommendation generation.
- Preference learning.
- Rider settings and bike identity.
- Planner orchestration.
- Offline region management and readiness.
- Privacy-zone sharing.
- Timeboxed eligibility and fallback.
- Segmented request propagation.
- Service-worker cache policy.

## Experimental until qualified

- Free Ride suggestions.
- Image-derived road requirements.
- Personalized/neural ranking.
- Route research/corridor adviser.
- Any traffic or incident intelligence not backed by a live source.

Experimental features require a label, kill switch, independent degradation, and no safety claims.

## Remove or defer

Remove controls that do not alter behavior, unsupported “safe/exact/verified/live/legal” claims, duplicate settings, generic route imagery presented as route-specific, and no-op suite/rebuild/highlight controls.

Defer accounts, cloud sync, collaboration, community ratings, social features, subscriptions, public route backend, national-scale optimization, and additional route profiles.

## Route profile simplification

Primary profiles should be:

- Quick
- Balanced
- Twisty
- Scenic
- Adventure

Treat Gravel as an Adventure surface policy, Avoid Highways as an option, and Neural as personalization over eligible candidates rather than separate engine profiles.
