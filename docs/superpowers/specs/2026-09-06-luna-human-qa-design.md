# Luna Human Exploratory QA Design

Status: approved implementation design  
Introduced against: `main@e0c691062573fdf9c122ed481d3a74019bb159bd`

## Goal

Add a lightweight exploratory QA layer for Luna/coworker agents that behaves like a first-time rider, discovers human/product failures deterministic tests were not written to anticipate, and turns repeatable findings into durable GitHub issues and regression tests.

This complements Vitest, Playwright, visual, mobile, PWA, real-router, live-provider, and physical-device validation. It does not replace any of them.

## Why this exists

Wave 1 demonstrated the gap directly. A bootstrap `inert` gate could eat a rider's first typed words even though ordinary CI stayed green; the fix explicitly noted that a browser regression test could pass on a warm machine because recovery settled too quickly to reproduce the human timing failure. The product needs a layer that asks whether a rider can understand and trust the experience, not only whether known assertions pass.

## Product target

Exploratory agents judge Switchback against the existing product and design authorities:

- motorcycle trip decision engine, not a layer dashboard;
- map and rider session at the center;
- one dominant next action with a clear recovery/exit path;
- progressive disclosure instead of separate simple/advanced products;
- direct, recoverable map-object manipulation;
- 44px ordinary touch targets, visible focus, safe-area awareness, honest loading/error/offline states;
- concise, rider-literate language and truthful uncertainty.

"Apple-like" means clarity, restraint, predictable behavior, strong hierarchy, direct manipulation, responsive feedback, forgiving recovery, and confidence. It does not mean copying Apple visuals or hiding useful motorcycle-specific power.

## Architecture

One coordinator session delegates six bounded black-box missions:

1. first-time rider;
2. indecisive/change-my-mind rider;
3. ADV/gravel rider;
4. phone-first rider;
5. failure/recovery rider;
6. Advisor/Gravel Goblin rider.

Workers receive goals, not click scripts. They explore the rendered product before reading source or tests. They return a small evidence packet. The coordinator deduplicates, ranks rider impact, distinguishes bugs from UX friction and product questions, then writes one session report.

The coordinator does not redesign the app, mass-create issues, or fix code during the discovery pass.

## Evidence contract

Every session records:

- tested URL/environment;
- exact tested application SHA/build identifier when available;
- date/time and viewport/device emulation;
- mission attempted;
- what the rider expected;
- what actually happened;
- concise reproduction steps;
- screenshot or other evidence when useful;
- severity and confidence;
- whether the finding reproduced;
- candidate deterministic regression test.

Do not claim physical iPhone, sunlight, glove, real-road, GPS-background, or airplane-mode evidence unless it actually occurred on physical hardware. Emulation is labeled as emulation.

## Finding classes

- **Bug** — behavior contradicts an existing product/interaction contract or loses/corrupts state.
- **UX friction** — the task works, but creates avoidable confusion, cognitive load, poor discoverability, weak hierarchy, or needless work.
- **Product question** — more than one coherent behavior is possible; requires owner judgment rather than an agent silently choosing one.

Severity is deliberately simple:

- **Blocker** — cannot complete the rider goal, data/state loss, or dangerous/misleading behavior.
- **High** — major workaround/confusion, mobile/map interaction failure, or trust-breaking behavior.
- **Medium** — meaningful cognitive load, hierarchy, terminology, discoverability, or feedback problem.
- **Polish** — visual/detail issue that does not impede the journey.

## Human-centered heuristics

Agents look especially for:

- unclear next action;
- controls that reveal implementation/provider language;
- map occlusion or unnecessary chrome;
- ambiguous selected/current state;
- actions that do not feel reversible;
- hidden state changes;
- stale results replacing newer choices;
- loading that reads as frozen;
- loss of typed/drawn work;
- inconsistent control placement or vocabulary;
- workflows that require remembering state from another panel;
- repeated confirmations or panels that do not earn their space;
- failure states that explain the system instead of helping the rider continue;
- success that technically works but takes too much thought.

"I eventually found it" is evidence of friction, not proof of discoverability.

## GitHub lifecycle

`exploratory mission -> session report -> coordinator dedupe -> confirmed finding -> GitHub issue/product decision -> fix -> Vitest/Playwright regression`

A finding becomes an issue only when it is actionable and supported. Related cosmetic observations should be grouped rather than sprayed into separate issues. Repeatable correctness bugs should gain deterministic regression coverage when fixed.

## Safety and scope

- No new runtime dependency, agent scheduler, database, scoring service, or CI gate.
- No automatic mass issue creation.
- No secrets in reports/screenshots.
- Prefer synthetic/general locations for public evidence unless a real location is necessary and approved.
- Do not run pull-request code on the homelab runner; existing homelab security boundaries remain authoritative.
- Closed historical QA ledgers are evidence, not worklists.
- Exploratory agents may inspect source/tests only after their black-box mission to diagnose or suggest regression ownership.

## Success criteria

The framework is successful when one max Luna/coworker session can delegate the six missions, produce a concise deduplicated report tied to an exact tested build, identify human-facing failures not already encoded in deterministic tests, and hand confirmed repeatable bugs to the existing test stack without creating a second QA platform.
