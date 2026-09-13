# Luna Human QA

This is OpenGravel's exploratory rider-testing layer for Luna/coworker agents.

It complements the deterministic suite. It does **not** replace Vitest, Playwright, visual snapshots, mobile QA, PWA, real-router, live-provider, or physical-device validation.

## The job

Test OpenGravel like a person trying to get somewhere useful, not like a script proving selectors exist.

A deterministic test asks:

> Did this known contract still behave exactly as expected?

A Luna exploratory session asks:

> Could a rider understand, trust, change, recover, and finish this task without already knowing how OpenGravel is built?

Both are required.

## Before a session

Record:

- target URL/environment;
- exact application SHA/build identifier if exposed or otherwise resolvable;
- whether the target is local, preview, staging, or production;
- browser and viewport;
- whether this is emulation or physical hardware;
- optional capabilities that are actually enabled (Advisor, provider keys, etc.).

Do not assume repository `main` equals the deployed application.

## Black-box first

For the exploratory portion:

1. Do not inspect source, tests, implementation docs, or existing issue details that would teach you the intended click path.
2. Use the product from the mission and visible UI alone.
3. Change your mind naturally. Back out. Retry. Explore likely controls. Let your own confusion count as evidence.
4. Capture useful screenshots when hierarchy, occlusion, wording, or state is the issue.
5. Only after the mission is complete may you inspect source/tests to improve diagnosis or propose regression ownership.

Do not deliberately sabotage the app unless your assigned mission calls for recovery/failure behavior.

## Human-centered standard

OpenGravel should feel calm, direct, forgiving, and purpose-built.

Evaluate:

- **Clarity:** Is the next useful action obvious without a tutorial?
- **Hierarchy:** Does the map/ride remain visually primary? Does one action dominate when one should?
- **Directness:** Can the rider act on the object they are looking at instead of hunting through panels?
- **Feedback:** Does every meaningful action visibly acknowledge what happened?
- **Predictability:** Does the result match the wording and location of the control?
- **Recovery:** Can a rider safely undo, cancel, edit, retry, or escape?
- **Restraint:** Are controls/details hidden until useful rather than competing for attention?
- **Continuity:** Do reloads, recalculation, panel changes, and route changes preserve the rider's mental model?
- **Trust:** Does OpenGravel distinguish what it knows, assumes, cannot verify, or failed to calculate?
- **Mobile ergonomics:** Are important controls reachable, legible, safe-area aware, and map-conscious?
- **Rider language:** Does copy speak in useful riding concepts instead of internal provider/engineering concepts?

"I eventually found it" is not evidence of good discoverability.

"It technically works" is not enough if completing the task requires unnecessary thought.

Apple-like quality here means clarity, restraint, direct manipulation, strong hierarchy, responsive feedback, predictable behavior, and forgiving recovery. Do not imitate Apple styling or remove useful motorcycle-specific capability merely to appear simple.

## Things worth noticing

Especially report:

- unclear or competing next actions;
- dead ends without an exit or recovery path;
- ambiguous selected/current route state;
- a map object that looks editable but is not directly actionable;
- text or drawn work that disappears;
- stale results replacing newer choices;
- Cancel/Undo/Retry doing something different from what the rider expects;
- loading that looks frozen;
- controls moving or changing names unexpectedly;
- panels obscuring the geography being edited;
- a small task requiring several panel transitions;
- duplicated controls for the same concept;
- technical/provider terminology exposed to ordinary riders;
- errors that explain the implementation but do not help the rider continue;
- important state that is visible only in color;
- tiny targets, clipping, keyboard/safe-area problems, or landscape failures;
- optional capability UI leaking into environments where that capability is absent;
- fast-human timing problems that deterministic automation may miss.

## Finding classes

### Bug

Behavior contradicts an existing product/interaction contract, loses state, corrupts state, reports false information, or produces a clearly wrong action/result.

### UX friction

The task can be completed, but there is avoidable confusion, poor hierarchy, weak discoverability, unnecessary cognitive load, or needless work.

### Product question

Two or more coherent behaviors are plausible. Record the tension and evidence; do not silently choose a new product contract.

## Severity

- **Blocker:** rider cannot complete the mission, loses important state, or is dangerously/m materially misled.
- **High:** major workaround, trust break, map/mobile interaction failure, or confusion likely to stop a normal rider.
- **Medium:** meaningful cognitive load, terminology, hierarchy, discoverability, feedback, or recovery problem.
- **Polish:** visual/detail issue that does not impede the journey.

Severity is about rider impact, not code complexity.

## Evidence minimum

A useful finding includes:

1. rider goal;
2. tested URL + application SHA/build when available;
3. environment/viewport;
4. concise reproduction steps;
5. expected behavior in rider terms;
6. actual behavior;
7. screenshot/evidence if visual or state-related;
8. severity + finding class;
9. confidence (`high`, `medium`, `low`);
10. reproduced? (`yes`, `no`, `intermittent`);
11. candidate deterministic regression test, if one is obvious.

A strong report also says what the rider tried before discovering the workaround.

## What not to do

- Do not turn every preference into an issue.
- Do not create ten issues for one underlying hierarchy problem.
- Do not reward feature density.
- Do not prescribe a new control if removing, renaming, relocating, or revealing an existing one solves the problem.
- Do not read source first and then pretend the UI was intuitive.
- Do not call emulated mobile testing a physical-iPhone test.
- Do not fabricate sunlight, glove, moving-motorcycle, background-GPS, degraded-network, or offline evidence.
- Do not change application code during the discovery pass.
- Do not mass-create GitHub issues automatically.
- Do not reopen archived/closed UX campaigns just because an old ledger contains similar observations.

## Coordinator synthesis

The coordinator combines worker results and:

1. groups duplicate/root-cause-related findings;
2. ranks by rider impact;
3. notes findings independently hit by multiple personas;
4. separates confirmed bugs from UX friction and product questions;
5. identifies what already has deterministic coverage;
6. proposes the smallest appropriate regression test for confirmed repeatable bugs;
7. writes one session report using `EXPLORATORY-SESSION-TEMPLATE.md`;
8. recommends which findings deserve GitHub issues.

Only actionable, evidence-backed findings should become issues.

## Durable loop

```text
exploratory rider mission
        ↓
session evidence
        ↓
coordinator dedupe
        ↓
confirmed finding
        ↓
GitHub issue / product decision
        ↓
fix
        ↓
Vitest / Playwright / visual regression
```

Exploratory testing discovers unknown problems. Deterministic testing makes known problems stay fixed. Human beta riders still decide whether the product is genuinely useful and trustworthy on real roads and real devices.
