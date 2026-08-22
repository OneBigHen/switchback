# Switchback Repo Audit Task

Audit the switchback repository at /path/to/switchback (a motorcycle route-planning Next.js app). Work from that directory. Do a deep, line-level audit — do NOT skim.

## Scope
1. SECURITY — hardcoded secrets (API keys, GraphHopper/Valhalla keys, DB passwords) in tracked files; .env handling; auth on the ride.henning.rodeo deployment; injection/SSRF in any proxy to GraphHopper/Valhalla; anything sensitive in git history or tags.
2. CORRECTNESS — routing/scoring logic errors in the free-ride/A→B paths; GPX import/export bugs; offline graph fallback bugs; race conditions in navigation/session controller; anything that could produce a wrong route.
3. QUALITY — dead code, half-finished TODOs, broken imports, stale docs vs. actual behavior, missing tests for critical paths, leftover debug code.
4. DEPENDENCIES — scan package.json; flag anything known-vulnerable or abandoned.

## Output
Write your findings to /path/to/switchback/docs/audit-REPORT.md (replace REPORT with your model name) as a ranked findings list: severity (Critical/High/Medium/Low), file:line, one-line description, suggested fix. End with a "TOP 10 PRIORITIES" numbered list. Keep total report under 4000 words. Include a line at the top: "Audited by: <model>".