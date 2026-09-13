# Rejected Ideas

Features and approaches we should refuse to build, with explanations.

## 1. Social feed / ride sharing wall

**Why reject:** REVER tried this and it dilutes navigation focus. Network effects require critical mass we don't have. Social features that don't drive rides are decoration.

**Evidence:** REVER user reports of app crashes tied to social features. MotoVault notes community is still growing.

## 2. Gamification badges beyond road completion

**Why reject:** Switchback Moto's badge system works because they have curated roads. OpenGravel doesn't have the content base yet. Generic badges (first ride, 10 rides) are meaningless.

**Evidence:** Switchback's badge system requires 455 badges across 9 categories — years of content work.

## 3. Generic maintenance tracker

**Why reject:** Riders have dedicated apps for this (MotoVault, Drivvo). OpenGravel is a navigation product — maintenance tracking is a distraction.

**Evidence:** MotoVault exists specifically for this.

## 4. Generic trip journal

**Why reject:** Strava, Garmin Connect, and Apple Health already do this well. Ride recording is enough — journaling is a different product.

**Evidence:** Strava has 100M+ users. Ride recording in OpenGravel is functional but not a journal.

## 5. Redundant weather dashboard

**Why reject:** Weather apps exist. What matters is "will this road be rideable in 2 hours?" not a full dashboard.

**Evidence:** No competitor's weather feature is praised. All are afterthoughts.

## 6. Messaging/chat between riders

**Why reject:** Requires network effects. REVER's social features are its weakest point per user reviews. Group coordination works better with existing tools (WhatsApp, GroupMe).

**Evidence:** REVER social reviews are mixed at best.

## 7. Dependency-heavy toys

**Why reject:** Anything requiring external hardware (action cameras, OBD dongles, TPMS sensors) turns OpenGravel into a hardware company.

**Evidence:** DMD's hardware integration is impressive but requires massive hardware R&D budget.

## 8. Expensive infrastructure

**Why reject:** Self-hosted routing is good. Full fleet of servers for AI model training is not.

**Evidence:** ADR 0004 explicitly rejects neural ranker as primary engine. Deterministic routing is the strategy.

## 9. Fake AI features

**Why reject:** "AI-powered this" and "AI-powered that" without genuine ML value is marketing fluff that erodes trust.

**Evidence:** Switchback Moto's "AI route build" is opaque — riders don't know why the route was chosen. OpenGravel's deterministic scoring is the counter.

## 10. CarPlay/Android Auto (yet)

**Why reject:** PWA cannot deliver CarPlay/Android Auto. Native apps can. Building native for this alone is premature.

**Evidence:** Scenic added Android Auto in 2026 after being iOS-only for years. Calimoto added Android Auto in 2026. This is a natural evolution, not a differentiator.

**Exception:** If PWA reaches maturity and the user base demands it, this becomes worth revisiting.

## 11. Full ride tracking/fitness

**Why reject:** Strava, Garmin Connect, Apple Watch already do this. OpenGravel should track rides for learning, not for fitness metrics.

**Evidence:** Every motorcycle app has ride tracking. It's table stakes, not differentiation.

## 12. Community route marketplace

**Why reject:** Requires critical mass of user-generated routes. Without community, a marketplace is an empty directory.

**Evidence:** Calimoto has 200K+ community routes — built over years. OpenGravel has zero.

## 13. Leaderboards / competitions

**Why reject:** Switchback Moto has this. It works for their audience but requires content and community. Not relevant to OpenGravel's phase 1.

**Evidence:** Leaderboards need participants. OpenGravel has none.

## 14. Weather-based automatic rerouting

**Why reject:** Over-engineering. Riders want to know "is this road rideable today?" not "reroute me because rain is coming."

**Evidence:** No competitor does this well. Weather alerts are sufficient.

## 15. AI-generated route descriptions

**Why reject:** "Scenic coastal ride with stunning views" is marketing copy, not routing intelligence. Deterministic explanations ("31 mi great curves, 4 traffic lights") are more useful.

**Evidence:** ADR 0004 explicitly favors deterministic explanations over AI descriptions.
