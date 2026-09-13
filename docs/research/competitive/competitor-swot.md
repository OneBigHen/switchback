# Competitor SWOTs

## Switchback Moto

**Strength:**
- Roads as persistent content entities — every road in the Atlas has a score, badges, rider photos, and community knowledge attached. No other product does this at scale.
- Trophy Case / badge system gives riders a reason to ride specific roads and return to the app.
- AI route builds (1/day free, 10/day Pro) reduce the "give me a ride now" friction.
- Strong SEO via road guide blog content (Field Notes).

**Weakness:**
- PWA-first means no native offline, no background GPS, no CarPlay/Android Auto.
- "AI route build" is opaque — no explainable routing logic visible to the rider.
- Social features (ride buddies, leaderboards) require an account and feel bolted on.
- Only US-focused (PA/NJ routing policy documented in codebase).
- Free tier severely limited (1 AI build/day).

**Opportunity for OpenGravel:**
- OpenGravel can offer the same "road as entity" concept with fully transparent, deterministic scoring that Switchback cannot because its scoring is AI-driven.
- OpenGravel can go global from day one — Switchback is locked to PA/NJ.
- OpenGravel's surface-aware routing directly attacks Switchback's weak mixed-surface handling.

**Threat from Switchback:**
- Their badge/trophy ecosystem creates engagement moat that is hard to replicate without years of content.
- First-mover advantage in "turn roads into content."

## Calimoto

**Strength:**
- Market leader — 1M+ users, strong brand recognition.
- Best-in-class twisty-road routing algorithm.
- Round-trip generator is fast and useful.
- Android Auto support added 2026.
- Large community route database (200K+ rides).

**Weakness:**
- Surface intelligence is binary: paved vs unpaved, no confidence, no granular surface types.
- Closure data is stale — riders repeatedly report routing onto closed roads.
- Speed limit data is frequently wrong (user-reported).
- No mixed-surface intent — cannot express "20% gravel, 80% paved."
- ETA assumes speed-limit speed — unrealistic.
- No CarPlay (added Android Auto only in 2026).
- Subscription model is expensive (~$60/yr) for what it delivers.

**Opportunity for OpenGravel:**
- Surface confidence model is OpenGravel's clearest differentiation vs Calimoto.
- Mixed-surface intent ("give me a loop with 30% gravel") is Calimoto's largest product gap.
- OpenGravel can offer transparent scoring with explanation — Calimoto's AI is a black box.

**Threat from Calimoto:**
- Network effects: 1M+ users means their community data compounds.
- Brand is synonymous with "motorcycle routing" in many markets.

## Kurviger

**Strength:**
- Best route-shaping UX — click-to-add via points is precise.
- Strong Europe coverage, curvy routing is excellent.
- POI database is motorcycle-specific (viewpoints, biker hangouts, parking).
- Cloud sync across devices.
- Kurviger Tourer+ adds offline navigation.

**Weakness:**
- Coverage outside Europe is weak — North America, Asia, Africa suffer.
- No mixed-surface routing intent.
- Free tier is limited; Tourer+ is required for navigation.
- No community route discovery comparable to Calimoto.
- UI is utilitarian, not polished.

**Opportunity for OpenGravel:**
- Global coverage from day one with OSM data.
- Surface-aware routing fills Kurviger's largest gap.

**Threat from Kurviger:**
- Strong planning UX is hard to match.
- European user base is loyal.

## REVER

**Strength:**
- Best social/community features of any motorcycle app — live tracking, groups, challenges.
- Butler Maps overlay is excellent for US riders.
- Route planning is solid multi-waypoint.
- CRASHLIGHT crash detection is unique.

**Weakness:**
- Routing quality is middling — riders report dirt/gravel on sportbike routes.
- App stability problems — crashes, lost ride data (multiple user reports).
- The product tries to be planner + navigator + social + tracker + fitness, which dilutes the navigation experience.
- "Follow route" behavior is unreliable per user reports.

**Opportunity for OpenGravel:**
- A focused navigation + discovery product without social bloat could attract REVER users who want better routing.
- Surface intelligence + reliable navigation would directly address REVER's weaknesses.

**Threat from REVER:**
- Social network effects are strong — riders go where their friends are.
- Butler Maps is a compelling US-specific overlay.

## Scenic

**Strength:**
- Best-in-class iOS navigation UX — glove-friendly, clean interface.
- Offline maps work reliably.
- Detour controls are granular and useful.
- Route folders, GPX import/export, stop management are mature.
- Strong iPhone-specific optimization.

**Weakness:**
- iOS only — no Android.
- No mixed-surface intent — same binary paved/dirt problem.
- No traffic awareness.
- Discovery is weak — no "surprise me" or blank-map generation.
- Surface data is no better than OSM provides — no confidence model.
- Relatively expensive (~$60/yr).

**Opportunity for OpenGravel:**
- Scenic's iOS exclusivity leaves Android riders underserved.
- OpenGravel's surface-aware routing and discovery are Scenic's largest gaps.

**Threat from Scenic:**
- iOS riders who love Scenic are a loyal, high-ARPU segment.
- Scenic's offline UX is best-in-class — hard to beat.

## DMD²

**Strength:**
- Treats navigation as a motorcycle cockpit, not a phone app — remote controllers, OBD, TPMS, LoRa.
- 300+ offline topo maps, worldwide.
- Free core app with offline routing — unusual value proposition.
- 250K+ devices deployed.
- Roadbook, group ride, fire alerts, weather layers.
- Hardware-integrated — BMW Sync Box, handlebar remotes.

**Weakness:**
- Software is Android-only, no iOS.
- UI is dashboard-oriented, not rider-experience-oriented — designed for the cockpit, not the handlebar.
- Route quality/scoring is basic — no curvature, scenic, or fun scoring.
- Discovery is weak — no "find me a ride" generator.
- Community is hardware-driven, not software-driven.

**Opportunity for OpenGravel:**
- DMD²'s hardware focus means it will never be a great phone app for casual riders — OpenGravel can own that segment.
- DMD²'s surface data is better than most (offroad profiles) but still lacks confidence modeling.

**Threat from DMD²:**
- 250K+ devices means real installation base.
- Hardware integration is a moat that software-only cannot match.

## onX Offroad

**Strength:**
- Best public-land/access intelligence — MVUM, land ownership, trail status.
- Trail difficulty, vehicle suitability filters.
- 3D planning, offline layers, folders.
- Curated trail guides with photos.

**Weakness:**
- Not motorcycle-first — designed for UTV/ATV/overland.
- No motorcycle-specific routing (curves, scenic, twisty).
- GPX imported as track, not editable route.
- No navigation — planning only.
- Pricing is $35–100/yr for what is essentially an offroad map.

**Opportunity for OpenGravel:**
- onX's land-access data is complementary — OpenGravel could integrate MVUM/public-land overlays without building from scratch.
- Motorcycle-specific routing on top of onX's access data would be powerful.

**Threat from onX:**
- Public-land data is a moat that requires licensing/partnerships.
- Strong brand in the offroad community.

## Gaia GPS

**Strength:**
- Layer-rich mapping — custom sources, order, opacity.
- Offline Map Packs, offline routing.
- Folders, sync, global coverage.
- Strong hiker/biker/overland community.

**Weakness:**
- Not motorcycle-first — designed for outdoor recreation broadly.
- No motorcycle routing (curves, scenic, twisty).
- UI is complex — layer management becomes workflow friction.
- No community route discovery.
- Navigation is basic.

**Opportunity for OpenGravel:**
- Gaia's layer system proves riders want customizable map overlays — OpenGravel can do this motorcycle-first.
- OpenGravel can provide motorcycle-specific layers (curvature, surface, traffic) that Gaia doesn't.

**Threat from Gaia:**
- Gaia is the layer benchmark — any map product is compared against it.
- Strong brand in outdoor community.

## GoraAdv

**Strength:**
- T1–T5 explicit surface hierarchy — communicates mixed-surface intent better than any competitor.
- Free, no account required.
- 72 countries covered.
- GPX export.

**Weakness:**
- No navigation — planning only.
- No mobile app (web only).
- No community, no discovery, no social.
- No elevation/scenic scoring.
- No offline capability.
- No advanced filtering (bike profile, weather, etc.).

**Opportunity for OpenGravel:**
- GoraAdv proves riders want explicit surface hierarchy — OpenGravel should adopt and extend this model with confidence scoring.
- GoraAdv's T1–T5 model can become a first-class routing dimension in OpenGravel.

**Threat from GoraAdv:**
- Simple, clean interface — easy to understand.
- Free with no account barrier.

## Trails Offroad

**Strength:**
- Curated trail guides with obstacle documentation, photos, difficulty ratings.
- Trail scouts — expert knowledge embedded in guides.
- Public-land overlays, MVUM/forest roads.
- Statewide offline downloads.
- Follow Mode for guided trail riding.

**Weakness:**
- Not motorcycle-first — designed for offroad vehicles.
- No motorcycle routing (curves, scenic).
- No navigation, no GPX-based route following.
- Limited to US (mostly).
- Discovery is guide-based, not map-based.

**Opportunity for OpenGravel:**
- Trails Offroad's guide model is exactly what OpenGravel needs for road-condition layers — structured obstacle/condition documentation.
- OpenGravel could build a "road scout" model similar to trail scouts.

**Threat from Trails Offroad:**
- Expert-curated content is a moat that takes years to build.
- Strong community trust in trail guides.

## Garmin Zumo Ecosystem

**Strength:**
- Purpose-built motorcycle GPS — sunlight readable, waterproof, glove-friendly.
- Adventurous Routing (avoid highways, prefer curves).
- GPX import, Tread app integration.
- No phone dependency — works anywhere.
- Hardware reliability is unmatched.

**Weakness:**
- Routing quality is basic — no curvature scoring, no scenic, no surface intelligence.
- No community, no discovery, no dynamic rerouting based on traffic/closures.
- Expensive hardware ($400–700).
- No mixed-surface intent.
- Updates require Wi-Fi on the device.

**Opportunity for OpenGravel:**
- Garmin riders with a Zumo XT2 often carry a phone anyway — OpenGravel can complement Garmin with surface-aware routing and discovery.
- Garmin's weak routing is OpenGravel's opportunity.

**Threat from Garmin:**
- Hardware + GPS independence is a moat for remote/offroad riders.
- Brand trust in motorcycle-specific hardware.

## Google Maps

**Strength:**
- Universal brand, universal coverage.
- Best traffic data, rerouting, ETA accuracy.
- Everyone already has it.
- Street View provides ground-truth imagery.

**Weakness:**
- Not motorcycle-specific — no curve scoring, no surface awareness.
- No motorcycle routing preferences.
- No GPX workflow for riders.
- No off-road capability.
- Car-centric design.

**Opportunity for OpenGravel:**
- Google Maps is the "I need to get there" app — OpenGravel is the "I want to enjoy the ride" app. Different jobs.

**Threat from Google Maps:**
- Default app for most riders — habit is hard to break.
- Traffic data is best-in-class.
