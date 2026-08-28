# Live UX Testing Findings — 2026-08-24

Source: owner's own hands-on pass through active navigation, route details, and
route publishing on a real device. These are raw field notes, not a code
audit — treat each item as "go verify against the real component" rather than
a pre-confirmed root cause. Written for a future long-horizon agent to pick up
and work through.

## How to use this doc

Each item lists: what the owner saw, why it matters, and a best guess at
which part of the codebase owns it (based on the module-sweep area map in
`docs/quality/MODULE_SWEEP_BRIEF.md` where applicable). Guesses are not
verified — confirm the actual component before fixing.

---

## 1. Navigation exit is confusing / feels stuck

**Symptom:** Once turn-by-turn navigation starts, it isn't clear how to get
out of it. The close/"X" control feels stuck or unresponsive, and exiting an
active route in general is confusing.

**Why it matters:** This is a hard blocker for real usage — a rider who
can't confidently exit navigation will distrust the whole app mid-ride.

**Likely area:** Shell/route navigation chrome (`app-shell-routes` or
`planner-domain`, whichever owns the active-navigation view).

---

## 2. No obvious way to just start a Free Ride

**Symptom:** There's no easily discoverable entry point to "just jump in and
free ride" — Free Ride mode isn't surfaced as an obvious option.

**Why it matters:** Free Ride is a named core feature (per the module-sweep
brief's explicit "protect Free-Ride core logic" guardrail) but if its entry
point isn't discoverable, the feature might as well not exist for most users.

**Likely area:** App shell / primary navigation entry points
(`app-shell-routes`).

---

## 3. Distances shown in meters instead of feet

**Symptom:** Turn-by-turn directions show metric units (meters) instead of
imperial (feet), inconsistent with the rest of the app's US/PA-focused
content.

**Why it matters:** Wrong units in turn-by-turn instructions is a usability
and safety issue, not cosmetic — a rider misjudging "200m" vs "200ft" to a
turn matters at speed.

**Likely area:** Routing/navigation UI formatting layer (`routing-providers`
or wherever turn-by-turn instruction strings are rendered).

---

## 4. "Switchback ID" doesn't seem to work

**Symptom:** The Switchback ID / identity feature does not appear to
function.

**Why it matters:** This may be the same root cause already flagged
independently by two of the module-sweep PRs:
- PR #12 (community-sharing): flagged that `SWITCHBACK_SESSION_SECRET` may be
  unset in production, which would break passkey auth and thus publish/report.
- PR #15 (sync-identity): flagged the same env var as a `NEEDS YOUR DECISION`
  item, plus a separate finding that passkey registration persists an
  identity before verification completes.

**Recommendation:** Check production env config for `SWITCHBACK_SESSION_SECRET`
first — this is a strong, specific, already-suspected lead, not a fresh
investigation.

**Likely area:** Identity/sync (`sync-identity`), production environment
config (owner-only, not code).

---

## 5. Route details show "0" for road information

**Symptom:** On the route details view, a road-information stat displays 0.

**Why it matters:** Looks broken/untrustworthy even if it's a real "no data"
state — needs either real data or an honest empty state, not a bare 0.

**Likely area:** Route details view — need to identify the specific stat
field and trace it back to its data source (`routing-providers` or
`external-data` depending on which stat).

---

## 6. Route detail imagery is fake/generic, not relevant to the actual route

**Symptom:** Opening route details shows generated stock-looking imagery
(e.g. generic mountains) instead of anything relevant to the specific roads
or places along that route.

**Why it matters:** Undermines trust in the whole route-quality story — a
generic "mountain" photo on a flat route reads as fake/AI slop rather than
a considered recommendation.

**Likely area:** Route details view, possibly `external-data` (wherever
imagery/place data is sourced) or a placeholder that was never wired to real
data.

---

## 7. Recommended stops aren't rider-relevant

**Symptom:** Suggested stops along a route aren't good motorcycle-rider
picks — the ask is specifically for things like a good bakery, coffee shop,
or bar, not whatever generic POIs are currently suggested.

**Why it matters:** This is a core value proposition of a ride planner —
irrelevant stop suggestions make the feature feel like a checkbox rather
than a considered recommendation engine.

**Likely area:** Place/stop suggestion logic — likely `external-data`
(`src/lib/ai/ride-intent.ts`, `src/lib/geocoding/`, or wherever POI
categories are selected/ranked).

---

## 8. "Why this route" shows raw internal/debug strings instead of user copy

**Symptom:** The "Why this route" explanation surfaces text like:

> Road segment scenic-1-9t484x:aggregate has unknown legal access.
> Road segment scenic-1-9t484x:aggregate has unknown current closure status.
> Scenic road character measures 86/100.

This reads as raw internal segment IDs and analysis output, not a
human-readable explanation — it doesn't make sense to a normal user.

**Why it matters:** This is a direct user-facing copy bug — internal
identifiers and "unknown" boilerplate leaking into production UI text.

**Likely area:** Route-quality / scenic-scoring explanation copy
(`routing-providers`, likely `route-quality.ts` or wherever the "why this
route" narrative is generated from segment metadata).

---

## 9. Publish/share "sanitized copy" flow is confusing

**Symptom:** Publishing produces something described as a "sanitized copy"
of the route, but it's unclear whether this is meant to be an overlay on top
of a more generic route, or a separate thing. As described, it doesn't read
as something anyone would actually use.

**Why it matters:** Confusing mental model for a core sharing feature —
directly relevant to the `community-sharing` PR (#12), which already found
that comments/RIG-contributions/revisions are implemented server-side but
have no reachable UI. This may be another instance of a feature whose
explanation doesn't match what's actually shown.

**Likely area:** `community-sharing` (`RouteSharePanel.tsx` /
`CommunityPublishPanel`) — worth a fresh look at the copy/mental model, not
just the mechanics PR #12 already checked.

---

## 10. Inconsistent button theming (white buttons on a black UI)

**Symptom:** "Save route," "GPX Format," and "Export GPX" buttons render
white while the rest of the UI is dark-themed — visibly inconsistent. Owner
describes the overall polish as having "lots of small gaps."

**Why it matters:** Visual inconsistency reads as low production quality even
when the underlying feature works.

**Likely area:** `styles` sweep area — likely a component using a default/
unthemed button style instead of the app's dark design tokens. Cross-check
against `docs/quality/MODULE_SWEEP_REPORT_2026-08-24_styles.md` (PR #16) —
this may not have been in that agent's assigned file set.

---

## Cross-cutting theme

Several of these (imagery, stops, "why this route" copy, the sanitized-share
model) point at the same underlying pattern already named in
`docs/quality/MODULE_SWEEP_BRIEF.md`'s model example: **a feature that looks
wired up but is either fed placeholder/generic data, or whose explanation to
the user doesn't match what it actually does.** Worth treating as one
investigation thread — "what in the ride-detail/why-this-route/stops
pipeline is real vs. generic filler" — rather than nine unrelated bugs.
