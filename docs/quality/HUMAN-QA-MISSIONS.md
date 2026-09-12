# Human QA Missions

Use these as bounded worker assignments. Give each worker one mission, the target URL/environment, and the evidence contract from `LUNA-HUMAN-QA.md`.

Workers test black-box first. They are not trying to achieve coverage percentages. They are trying to notice where a normal rider's mental model and the product diverge.

## Mission 1 — First-time rider

### Situation

You ride motorcycles but have never used OpenGravel. You have about 30 minutes before leaving.

### Goal

Create a roughly 90-minute ride you would plausibly choose, understand why the suggested route is worth riding, adjust anything you dislike, and get to a point where you feel ready to ride it.

### Behavior

Use only what the UI teaches you. Do not hunt through every feature. Follow what looks like the natural path. If you hesitate, choose what you think a normal rider would try.

### Watch for

- unclear starting point;
- uncertain selected route;
- unclear distinction between planning, choosing, preparing, and riding;
- controls that require product knowledge;
- panels/details that compete with the map;
- missing feedback after a meaningful action;
- moments where a tutorial seems necessary.

## Mission 2 — Change-my-mind rider

### Situation

You know roughly what you want but keep changing your mind while planning.

### Goal

Create a ride, then deliberately revise duration, road character, destination/vias, route choice, and at least one map-level preference. Undo something, redo or make a different choice, cancel/retry a recalculation when possible, and confirm you still understand what ride the visible route represents.

### Behavior

Act impatiently but plausibly. Make one change while another is still settling if the UI allows it. Use Back/close controls where natural. Refresh once after meaningful work.

### Watch for

- stale route results;
- lost edits;
- confusing Undo/Redo scope;
- Cancel restoring the wrong thing;
- failure destroying a previously usable route;
- selected route changing unexpectedly;
- route and controls disagreeing about current intent;
- reload/recovery breaking continuity.

## Mission 3 — ADV / gravel rider

### Situation

You ride an ADV/dual-sport bike and care about interesting roads and mixed surfaces more than the absolute fastest route.

### Goal

Plan a mixed-surface ride, inspect what OpenGravel actually knows about surface/access, keep a road/segment you like, avoid an area/section you dislike, and reshape the ride until it looks worth riding.

### Behavior

Treat uncertain surface/access claims skeptically. Use map objects directly where they appear actionable. Try to reverse or remove one map edit.

### Watch for

- surface certainty presented too strongly;
- road-lock/keep/avoid terminology that is unclear;
- drawing/sculpting mode without a clear exit/cancel;
- avoid areas that cannot be selected, adjusted, or deleted;
- freehand route drawing that behaves unlike what the gesture suggests;
- map overlays that obscure rather than explain;
- ADV controls that expose routing-engine jargon.

## Mission 4 — Phone-first rider

### Situation

You are planning from a phone, one-handed at times, and want the map to stay useful while you make quick changes.

### Goal

Complete the ordinary plan → choose → prepare flow on a phone-sized viewport. Open and dismiss details, edit the route, recover from one mistake, and rotate to landscape for part of the session if supported.

### Behavior

Do not use desktop-only shortcuts. Assume normal mobile impatience. Bring up the keyboard. Scroll sheets naturally rather than carefully preserving the layout.

### Watch for

- map becoming irrelevant behind sheets;
- controls hidden under safe areas/navigation/keyboard;
- tiny or crowded targets;
- clipped content;
- strange sheet heights;
- attribution or map chrome floating halfway up the screen;
- orientation changes leaving stale layout measurements;
- primary actions moving unpredictably;
- text density that is acceptable on desktop but exhausting on phone.

Emulation is useful evidence but must be labeled as emulation, not a physical-iPhone result.

## Mission 5 — Failure and recovery rider

### Situation

Things go wrong: a route request fails, network is slow/intermittent, a page reload happens, or a calculation is cancelled.

### Goal

Start with a usable ride, trigger or encounter recoverable failure states available in the test environment, continue planning without losing your mental model, reload, and verify you can tell what was preserved and what must be recalculated.

### Behavior

Use supported test controls/network tooling only. Do not corrupt storage manually unless the coordinator explicitly assigns that probe.

### Watch for

- errors that strand the rider;
- old usable route disappearing unnecessarily;
- retry operating on a different ride than expected;
- loading/failure state with no clear continuation;
- recovery overwriting newer work;
- cross-tab/reload states that look like silent data loss;
- stale error banners after the rider has moved on;
- false claims that an offline/degraded capability is available.

## Mission 6 — Advisor / Gravel Goblin rider

### Situation

You want help shaping a ride conversationally, but you expect the planner—not the AI—to remain authoritative.

### Goal

Ask the Advisor/Gravel Goblin for a ride idea or meaningful modification, apply/reject suggestions, make a manual planner change afterward, and verify you always understand what changed and that normal planner controls still own route selection.

If Advisor capability is unavailable on the target, test the unavailable/key-free experience instead and do not treat absence as a defect by itself.

### Behavior

Use natural, occasionally ambiguous language. Ask for one change that could be interpreted multiple ways. Do not deliberately prompt-inject or security-test unless separately assigned.

### Watch for

- AI silently changing selected route;
- proposal vs applied state being unclear;
- a suggestion overwriting manual work;
- unsupported confidence about road/surface/access;
- chat taking over map/planner hierarchy;
- vague smart/AI copy instead of rider-useful language;
- optional capability UI leaking into key-free environments;
- failure/retry duplicating or losing a conversation turn.

## Worker return contract

Return only:

1. mission outcome: completed / partially completed / blocked;
2. the top three evidence-backed findings (fewer if fewer matter);
3. any "works, but I had to think too hard" observation worth preserving;
4. exact tested environment/SHA/build when available;
5. screenshots/evidence references;
6. for each finding: class, severity, confidence, reproduction status, expected vs actual, concise repro, and candidate deterministic regression if obvious.

Do not submit a feature wishlist. Do not rewrite the product. Do not create GitHub issues yourself unless the coordinator explicitly asks after synthesis.
