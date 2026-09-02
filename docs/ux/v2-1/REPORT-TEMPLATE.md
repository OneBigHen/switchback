# Implementation Agent Completion Report Template

Use this in `STATE.md` after each wave.

```text
WAVE: W1 / W2 / W3 / W4
STATUS: COMPLETE | BLOCKED
HEAD: <sha>
COMMITS:
- <sha> <message>

TESTS:
- <command> — PASS/FAIL — <key count/result>

VISUAL REVIEW:
- <state> @ <viewport> — accepted / issue

SNAPSHOTS CHANGED INTENTIONALLY:
- <path> — <why>

PERFORMANCE:
- <relevant observation; W4 includes build/dependency/runtime summary>

ADVERSARIAL FINDINGS:
- P0/P1: none | list
- P2 deferred: <issue + rationale>

LIMITATIONS/GAPS:
- none | <truthful missing-data/product gap>

NEXT:
- <one exact next action>
```

Do not paste giant command logs into STATE. Keep enough evidence to reproduce or find the run.