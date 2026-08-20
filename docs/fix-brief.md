# Switchback — Audit Fix Implementation Task

You are working in /root/Vibe/switchback on branch `audit-fixes/deepseek-v4-pro`. You already audited this repo; your findings are in `docs/audit-deepseek-v4-pro.md`. Your previous audit report found the exact issues — that report is the source of truth for WHAT to fix.

## Task
Fix EVERY issue YOU called out in `docs/audit-deepseek-v4-pro.md` — all HIGH findings, all numbered findings, and the full "TOP 10 PRIORITIES" list. Apply the fixes you recommended in that report. Do not stop at the top 10 — work through every numbered finding in the report.

Additionally, incorporate these fixes from the sibling audit (docs/audit-mimo-v2.5-pro.md):
- Enforce SWITCHBACK_SESSION_SECRET at startup (fail fast if missing or <32 chars) instead of silently degrading to unauthenticated mode.
- Run GraphHopper container as non-root (USER directive in deployment/graphhopper.Dockerfile).
- Guard elevation enrichment against null overwrite (valhalla.ts).
- Add auth lint rule or middleware ensuring new API routes cannot accidentally omit authentication.
- Bounds-checking in decodePolyline6.
- Plan/document nonce-based CSP (do not break existing CSP, just document + keep safe).
- Document rate-limiter single-process limitation.
- Use npm ci in CI instead of npm install.

## Rules
1. Work incrementally: fix one issue, commit it with a clear message (`fix: <area> — <issue>`), then move to the next. Multiple commits are expected.
2. For every logic fix, add or update a unit test that would have caught the bug.
3. NEVER weaken security or auth. When adding auth enforcement, make sure legit flows still work (the free-ride → registered-user flow, community publish, offline mode).
4. Do NOT rewrite the whole app. Surgical, minimal, correct changes only. Preserve existing behavior except where the fix requires otherwise.
5. Do NOT touch: docs/spec markdown (except .env.example if needed), zip archives in repo root, node_modules, data/.
6. After fixing, run `npm run verify` and `npx tsc --noEmit` and `npm test` — everything must pass. If verify initially fails, fix until green.
7. Also check for any OTHER instance of each bug class you found (e.g., if route-cache key is wrong, check cache usage in all route endpoints), and fix all occurrences.
8. When done, do NOT commit docs/audit-*.md changes if any — only code, config, tests, and .env.example changes.

## Output
At the end, leave the working tree committed and clean. Print a summary of each fix you made (issue → file(s) changed → test added). If any finding was intentionally not fixable/misdiagnosed, say so explicitly instead of silently skipping.