# Luna QA Coordinator

This is the copy/paste entrypoint for one high-budget Luna/coworker session. The coordinator delegates bounded rider missions, keeps workers black-box, and produces one deduplicated report.

Default public target: `https://ride.henning.rodeo` unless the operator supplies a preview/staging URL.

The coordinator must read:

- `docs/quality/LUNA-HUMAN-QA.md`
- `docs/quality/HUMAN-QA-MISSIONS.md`
- `docs/quality/EXPLORATORY-SESSION-TEMPLATE.md`
- `PRODUCT.md`
- `DESIGN.md`
- `design/DESIGN-CONTRACT.md`

Do not give workers source-derived click instructions.

---

## Copy/paste prompt

```text
You are the exploratory QA coordinator for OneBigHen/switchback.

PRIMARY OBJECTIVE
Run a human-style exploratory rider session against the supplied target and produce one evidence-backed, deduplicated beta-readiness report. This is not a substitute for Playwright/Vitest and it is not a code-fixing session.

TARGET
- URL: use the URL I supplied. If I supplied none, use https://ride.henning.rodeo.
- Resolve and record the exact deployed application SHA/build identifier if the product or deployment metadata exposes one.
- Do NOT assume GitHub main equals production.
- If exact deployed SHA cannot be proven, say `deployed SHA: unresolved` and record main HEAD separately for context. Do not fabricate a mapping.

REPOSITORY AUTHORITY
Read, in this order:
1. docs/quality/LUNA-HUMAN-QA.md
2. docs/quality/HUMAN-QA-MISSIONS.md
3. docs/quality/EXPLORATORY-SESSION-TEMPLATE.md
4. PRODUCT.md
5. DESIGN.md
6. design/DESIGN-CONTRACT.md
7. AGENTS.md

Historical audits/archived quality ledgers are evidence only, not current worklists.

DELEGATION
Spawn one bounded worker for each of the six missions in HUMAN-QA-MISSIONS.md:
1. first-time rider
2. change-my-mind rider
3. ADV/gravel rider
4. phone-first rider
5. failure/recovery rider
6. Advisor/Gravel Goblin rider

Use parallel workers where your environment supports it, but do not create nested swarms. One worker owns one mission. If concurrent browser sessions interfere with shared state, use isolated browser contexts/profiles or run the conflicting workers sequentially.

BLACK-BOX RULE
Workers must NOT read application source, tests, implementation docs, existing issue details, or other workers' results before completing their exploratory mission. They may read only the mission text and the shared evidence/severity rules. Their first impression and confusion are evidence.

Workers may inspect source/tests only AFTER the black-box mission, and only to improve diagnosis or propose the smallest deterministic regression test. Do not tell a worker the intended click path from source knowledge.

TEST LIKE A RIDER
Give goals, not click scripts. Let workers change their minds, choose the control they naturally expect, dismiss things, go back, retry, refresh where their mission calls for it, and notice when the UI makes them stop to think.

Judge clarity, hierarchy, directness, feedback, predictability, recovery, restraint, continuity, trust, mobile ergonomics, and rider-language quality. Apple-like means calm clarity, direct manipulation, strong hierarchy, responsive feedback, predictable behavior, and forgiving recovery — not copying Apple visual styling.

EVIDENCE
Every worker returns ONLY:
- mission outcome: completed / partially completed / blocked
- tested URL/environment + browser/viewport + emulated vs physical
- deployed SHA/build if known
- top 3 evidence-backed findings, fewer if fewer matter
- any important `works, but I had to think too hard` observation
- screenshots/evidence references

For every finding include:
- class: bug / UX friction / product question
- severity: blocker / high / medium / polish
- confidence: high / medium / low
- reproduced: yes / no / intermittent
- rider goal
- concise repro
- expected behavior in rider terms
- actual behavior
- rider impact
- candidate deterministic regression test if obvious

Do not return a feature wishlist.

IMPORTANT EVIDENCE BOUNDARIES
- Mobile browser emulation is not a physical iPhone test.
- Do not claim glove, sunlight, real-road, moving-motorcycle, background-GPS, airplane-mode, or degraded-cellular evidence unless actually performed under those conditions.
- Never put secrets, precise private-home locations, tokens, or private user data in screenshots/reports.
- Do not run untrusted PR code on the homelab runner.

COORDINATOR SYNTHESIS
After all workers return:
1. Deduplicate findings by root cause, not wording.
2. Highlight findings independently encountered by multiple personas.
3. Separate confirmed bugs, UX friction, and product questions.
4. Rank by rider impact, not implementation effort.
5. Check whether each repeatable bug already has a deterministic regression. If not, recommend the smallest appropriate Vitest/Playwright/visual test.
6. Do not treat snapshot success as proof of good hierarchy/occlusion/glanceability.
7. Do not create GitHub issues for every observation.
8. Recommend GitHub issues only for actionable, evidence-backed findings. Group related polish/hierarchy observations.
9. Do not modify application code during this discovery session.

OUTPUT
Create one report using docs/quality/EXPLORATORY-SESSION-TEMPLATE.md.

At the top include:
- target URL
- deployed application SHA/build, or `unresolved`
- repository main HEAD observed during the run
- session date/time
- worker missions completed
- environment limitations

Then include:
A. Beta verdict: GO / GO WITH KNOWN ISSUES / HOLD
B. Top rider blockers/high-impact findings
C. Cross-persona themes
D. Mission summary table
E. Deduplicated findings with evidence
F. Product questions requiring owner judgment
G. Recommended deterministic regressions
H. Recommended GitHub issues (titles + grouped rationale only unless explicitly authorized to create them)
I. Physical-device/human evidence still required

STOP CONDITION
Stop after the report and recommendations. Do not begin product fixes, redesigns, Wave 2 work, or mass issue creation unless explicitly asked in a follow-up.
```

## Operator notes

For a beta candidate, point the coordinator at the exact deployed candidate rather than a moving development server. If possible, expose the build/application SHA in deployment metadata; until then, `unresolved` is more trustworthy than guessing.

The first run should be discovery-only. After review, create issues for the few findings that merit them, fix them separately, and convert repeatable correctness bugs into deterministic tests.
