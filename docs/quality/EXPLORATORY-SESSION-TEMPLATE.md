# Exploratory QA Session — YYYY-MM-DD

## Target

- URL:
- Deployed application SHA/build: `unresolved`
- Repository main HEAD observed:
- Environment: production / staging / preview / local
- Session started:
- Browser(s):
- Viewport(s):
- Physical hardware used: none / describe
- Optional capabilities enabled:
- Known environment limitations:

## Beta verdict

**GO / GO WITH KNOWN ISSUES / HOLD**

Reason in 2–4 sentences:

## Mission coverage

| Mission | Outcome | Environment | Findings |
|---|---|---|---:|
| First-time rider |  |  |  |
| Change-my-mind rider |  |  |  |
| ADV/gravel rider |  |  |  |
| Phone-first rider |  |  |  |
| Failure/recovery rider |  |  |  |
| Advisor/Gravel Goblin rider |  |  |  |

## Top rider-impact findings

Only Blocker/High findings here.

### HQ-001 — Short title

- Class: bug / UX friction / product question
- Severity: blocker / high
- Confidence: high / medium / low
- Reproduced: yes / no / intermittent
- Personas affected:
- Rider goal:
- Expected:
- Actual:
- Rider impact:
- Repro:
  1.
  2.
  3.
- Evidence:
- Existing deterministic coverage:
- Candidate regression:
- Recommended action:

## Cross-persona themes

List only themes independently encountered by multiple missions or clearly sharing one root cause.

1.
2.
3.

## Deduplicated findings

### HQ-002 — Short title

- Class:
- Severity:
- Confidence:
- Reproduced:
- Personas affected:
- Rider goal:
- Expected:
- Actual:
- Rider impact:
- Repro:
- Evidence:
- Candidate deterministic regression:
- Issue recommended: yes / no / group with HQ-___

Repeat as needed. Do not create one finding per cosmetic symptom when one root cause explains them.

## Works, but required too much thought

Capture successful interactions that exposed meaningful discoverability, terminology, hierarchy, or mental-model friction but do not deserve separate defect entries.

- 

## Product questions requiring owner judgment

Do not resolve these by agent preference.

### PQ-001 — Question

- Triggering evidence:
- Coherent option A:
- Coherent option B:
- Rider tradeoff:
- Recommendation, if evidence supports one:

## Recommended deterministic regressions

| Finding | Test layer | Smallest useful contract |
|---|---|---|
| HQ-___ | Vitest / Playwright / visual / other |  |

Exploratory discovery is not durable regression coverage. Repeatable correctness bugs should gain a deterministic contract when fixed.

## Recommended GitHub issues

Do not create automatically unless explicitly authorized after synthesis.

1. `[exploratory QA] <title>` — finding(s) HQ-___; why this is actionable.
2.

## Physical-device / human evidence still required

Explicitly list what this agent session could not honestly establish, for example:

- physical iPhone safe-area/keyboard behavior;
- actual background GPS/resume behavior;
- sunlight/glove glanceability;
- degraded cellular behavior;
- real motorcycle route usefulness/surface trust;
- real rider comprehension without agent reasoning advantages.

## Session conclusion

- Total deduplicated findings:
- Blocker:
- High:
- Medium:
- Polish:
- Product questions:
- Issues recommended:
- Deterministic regressions recommended:
- Next human beta action:
