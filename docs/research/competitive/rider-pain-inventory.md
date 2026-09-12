# Rider Pain Inventory

Compiled from app reviews, Reddit, forums, and competitor documentation. September 2026.

## Pain point inventory

### 1. Surface data is unreliable everywhere

- **Complaint:** Apps route onto gravel roads when rider wants paved, or vice versa. Surface type is often wrong or missing entirely.
- **Source:** Scenic forum (gravel-road thread), Calimoto Facebook group, multiple Reddit threads
- **Competitors affected:** All — Calimoto, Scenic, Kurviger, REVER, Garmin, Switchback Moto
- **Frequency signal:** High — appears in nearly every competitive discussion
- **Severity:** Critical — wrong surface can be dangerous or impossible for certain bikes
- **OpenGravel suffers?** Partially — routing respects surface tags but confidence is not surfaced to riders
- **Opportunity:** A confidence-scored surface layer with rider confirmation and recency tracking

### 2. Closure data is stale

- **Complaint:** Apps route onto closed roads — construction, seasonal closures, gated roads. Rerouting around closures adds huge detours.
- **Source:** Calimoto App Store reviews (multiple), user reports
- **Competitors affected:** Calimoto (explicitly called out), Scenic, others
- **Frequency signal:** High — recurring complaint across products
- **Severity:** High — wasted time, dangerous gate confusion
- **OpenGravel suffers?** Partially — Valhalla/GraphHopper know closures from OSM but freshness is OSM-dependent
- **Opportunity:** Rider-reported closure confirmation + source/age disclosure on every route

### 3. "Give me a ride now" — blank map is a product failure

- **Complaint:** Most apps require a destination. Riders who just want to ride struggle with "where should I go?"
- **Source:** Reddit r/motorcycles, multiple forum threads
- **Competitors affected:** Calimoto (round-trip helps but is location+distance only), Kurviger, Garmin, Google Maps
- **Frequency signal:** Very high — one of the most common "I wish this app could" statements
- **Severity:** High — the primary use case for many riders is "I have 90 minutes, surprise me"
- **OpenGravel suffers?** Partially — Free Ride exists but is experimental
- **Opportunity:** Free Ride 2.0 with surface, bike-profile, weather, and novelty constraints

### 4. Missed-waypoint / rerouting recovery is terrible

- **Complaint:** Taking a wrong turn or stopping for gas causes the app to reroute back to already-completed segments, or the route becomes impossible to resume.
- **Source:** Reddit r/motorcycles, Kurviger App Store reviews, Scenic reviews
- **Competitors affected:** Calimoto, Kurviger, Scenic, Garmin, REVER
- **Frequency signal:** High — appears across multiple products
- **Severity:** High — breaks trust, causes frustration at speed
- **OpenGravel suffers?** Partially — ride recovery and rerouting exist but are not battle-tested
- **Opportunity:** Explicit "resume from here" with route-lock that prevents backward rerouting

### 5. Navigation is an afterthought in planning apps

- **Complaint:** Route planners have great planning but when you actually ride, the navigation is clunky — small text, too much info, poor at-speed visibility.
- **Source:** Multiple App Store reviews, forum discussions
- **Competitors affected:** Calimoto (navigation improved but still criticized), REVER, Kurviger
- **Frequency signal:** High
- **Severity:** Medium — planning apps are used more for planning than navigation
- **OpenGravel suffers?** Partially — PWA limits background GPS and at-speed interaction
- **Opportunity:** PWA is a constraint, but instrument-cluster HUD design is achievable

### 6. GPX workflow is fragmented

- **Complaint:** Import GPX, edit it, re-export — every app handles this differently. Tracks vs routes vs waypoints confusion.
- **Source:** MyRoute-app reviews, Reddit discussions, forum threads
- **Competitors affected:** All — each handles GPX slightly differently
- **Frequency signal:** Medium — affects serious riders who plan on desktop
- **Severity:** Medium — power-user pain
- **OpenGravel suffers?** No — GPX import/export is strong in the codebase (P28 documented)
- **Opportunity:** Market OpenGravel's clean GPX workflow as a differentiator

### 7. Mixed-surface intent cannot be expressed

- **Complaint:** Riders want "some gravel" but apps offer "avoid unpaved" or "all unpaved" — no middle ground.
- **Source:** Calimoto Facebook group, Reddit, Scenic forum
- **Competitors affected:** All motorcycle apps, all offroad apps
- **Frequency signal:** Very high — fundamental routing abstraction problem
- **Severity:** Critical — the majority of interesting motorcycle roads are mixed surface
- **OpenGravel suffers?** Partially — routing can mix surfaces but the UI doesn't express intent clearly
- **Opportunity:** GoraAdv's T1–T5 model adapted for motorcycle use with confidence scoring

### 8. Offline claims are incomplete

- **Complaint:** "Offline" means map tiles, not routing. No rerouting, no search, no POIs when offline.
- **Source:** Multiple reviews, forum threads
- **Competitors affected:** Calimoto, Scenic, most apps
- **Frequency signal:** High
- **Severity:** High — riders go to areas without signal
- **OpenGravel suffers?** Partially — offline routing is in development (ADR 0003, P29)
- **Opportunity:** Honest offline — expose what works and what doesn't

### 9. App stability and data loss

- **Complaint:** App crashes, ride data lost, background tracking stops.
- **Source:** REVER App Store reviews (multiple), forum posts
- **Competitors affected:** REVER (explicitly), others implied
- **Frequency signal:** Medium — concentrated in REVER but a general concern
- **Severity:** High — destroys trust
- **OpenGravel suffers?** Not yet reported — PWA may actually be more stable than native in some respects
- **Opportunity:** Reliability as a marketing point

### 10. ETA is unrealistic

- **Complaint:** Apps estimate arrival assuming speed-limit speed. Real motorcycle speeds are lower, especially on curvy roads.
- **Source:** Calimoto App Store reviews
- **Competitors affected:** Calimoto (explicitly called out)
- **Frequency signal:** Medium
- **Severity:** Low-Medium — annoying but not dangerous
- **OpenGravel suffers?** Partially — ETA exists but no motorcycle-speed adjustment
- **Opportunity:** Bike-profile-adjusted ETA

### 11. No "ride with friends" coordination

- **Complaint:** Group riding requires multiple apps — one for nav, one for tracking, one for chat.
- **Source:** Reddit, forum discussions
- **Competitors affected:** All except REVER and Cardo Ride
- **Frequency signal:** Medium
- **Severity:** Low — not every ride is group
- **OpenGravel suffers?** Not applicable — no social features planned
- **Opportunity:** Stay out of this — network effects require critical mass

### 12. Price fatigue

- **Complaint:** Apps cost $5–10/month or $50–100/year for features that should be basic.
- **Source:** Multiple App Store reviews, Reddit
- **Competitors affected:** Calimoto ($60/yr), Scenic ($60/yr), REVER ($40/yr), MyRoute-app ($60–140/yr)
- **Frequency signal:** High
- **Severity:** Medium — limits adoption
- **OpenGravel suffers?** No — OpenGravel is free/PWA
- **Opportunity:** Free + open routing as a value proposition
