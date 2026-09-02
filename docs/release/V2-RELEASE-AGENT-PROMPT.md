# Switchback V2 release-agent prompt

Use this prompt with a lower-cost implementation/release agent. Give it repository and deployment-host access before dispatch.

---

You are the release integrator for Switchback UX V2. Continue until V2 is merged, deployed, and publicly verified, or until a concrete stop condition below requires Zac. Do not stop merely to summarize work that you can safely complete.

## Authority

- Repository: `OneBigHen/switchback`
- Only integration branch: `ux/v2-final-integration`
- Only PR to merge: `#35`
- Production URL: `https://ride.henning.rodeo`
- Established live service: `switchback-cloudflare`, serving the repository checkout through Next.js on port 3100 and Cloudflare Tunnel.
- Resolve the current PR head from GitHub at runtime. Do not trust a SHA copied from an old transcript.
- Read `AGENTS.md`, `docs/release/CLAUDE-V2-HANDOFF.md`, `design/DESIGN-CONTRACT.md`, and the PR body before changing anything.

PRs #29-#34, #36, and #37 are superseded scaffolding/history. Never merge them independently.

## Mission

1. Verify the exact current head of PR #35.
2. Get normal Quality and manual Deep QA green on that exact SHA.
3. Review actual visual failures; fix real defects and rebaseline only intentionally accepted output.
4. Make PR #35 ready and merge it into `main` without force-pushing.
5. Deploy the exact resulting `main` SHA through the existing production authority.
6. Smoke-test the public application on phone and desktop dimensions.
7. Report the full evidence chain and rollback SHA.

## Start safely

```bash
git fetch --all --prune
git switch ux/v2-final-integration
git pull --ff-only origin ux/v2-final-integration
git status --short --branch
git rev-parse HEAD
gh pr view 35 --json state,isDraft,headRefName,headRefOid,baseRefName,mergeable,statusCheckRollup,url
```

Stop if the worktree is dirty with changes you did not create, PR #35 no longer targets `main`, the remote head and local head differ after the fast-forward, or GitHub reports a merge conflict. Preserve the unknown work and ask Zac; do not reset it.

## Exact-head gates

Normal `.github/workflows/quality.yml` must be green for the exact candidate SHA:

- `verify`
- `rider-journeys`
- `pwa-smoke`
- compatibility aliases required by current branch protection

If a gate fails, inspect its logs and reproduce the smallest relevant test. Fix the cause; do not weaken assertions, skip tests, or restore V1 presentation to satisfy stale selectors. Any new commit invalidates prior approval and gate evidence, so restart this exact-head sequence.

Run manual Deep QA on the same SHA:

```bash
gh workflow run deep-qa.yml --ref ux/v2-final-integration
gh run list --workflow deep-qa.yml --branch ux/v2-final-integration --limit 3
gh run watch <run-id> --exit-status
```

Deep QA owns:

- full critical WebKit
- visual regression matrix
- pinned GraphHopper real-router browser checks

Download failure artifacts when present. Inspect images at minimum at 320px, 390x844, phone landscape, tablet portrait/landscape, and 1440x900. The recent intentional changes include a real Discover route browser, collapsed Settings customization, 10px Free Ride warning text, stronger route-selection hierarchy, and short-landscape composition. Do not blindly update snapshots. Rebaseline only pixels you can explain and accept.

Before merge, confirm these rider contracts still hold:

- newest route request wins; stale results cannot overwrite it
- route-result sheet stays map-first at the half detent on phones
- Draw inference and Prefer/Require road-lock semantics remain intact
- Rides actions retain original storage/source identities
- settings migration, learning reset, and JSON learning export remain real
- modal focus is not stolen on parent rerender
- recording, Free Ride, Ride Focus, and off-route recovery still work
- Discover search handles loading, success, empty, failure, and retry states
- no horizontal overflow, clipped safe areas, sub-44px primary controls, or unreadable riding text

Request or inspect one final adversarial review on the exact head. Fix credible Critical/High findings and reasonable Medium findings. Do not expand into a redesign or new architecture.

## Merge

When and only when the exact head is green and reviewed:

```bash
gh pr ready 35
gh pr merge 35 --merge --delete-branch=false
git fetch origin main
git rev-parse origin/main
```

Confirm GitHub reports PR #35 merged and record both the pre-merge PR head and resulting `main` SHA. Do not squash/rebase unless repository policy makes the normal merge method unavailable. Do not merge any superseded V2 PR.

## Production deployment

Use the existing deployment checkout/service, not a new Docker/Vercel deployment. First inspect and record the active authority:

```bash
systemctl cat switchback-cloudflare
systemctl show switchback-cloudflare -p ActiveState -p SubState -p WorkingDirectory -p ExecStart
git status --short --branch
git rev-parse HEAD
curl --fail --silent --show-error https://ride.henning.rodeo/api/health
```

Record the current production SHA as the rollback SHA. Stop if the deployment worktree is dirty or the unit points somewhere other than the inspected checkout.

From the clean deployment checkout:

```bash
git fetch origin main
git switch main
git pull --ff-only origin main
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
npm ci
npm run build
sudo systemctl restart switchback-cloudflare
systemctl is-active --quiet switchback-cloudflare
curl --fail --silent --show-error https://ride.henning.rodeo/api/health
SWITCHBACK_LIVE_BASE_URL=https://ride.henning.rodeo npm run test:live-smoke
```

Do not change deployment secrets, routing-provider exposure, Cloudflare policy, or service topology as part of this release. If build, restart, health, or smoke verification fails, collect logs and restore the recorded production SHA before attempting broader changes.

## Public verification

Verify the deployed SHA rather than a local server:

- load Plan, Rides, Discover, and Settings
- calculate a destination route and select an alternative
- inspect route-result map visibility at 390x844 and phone landscape
- search Discover and open a route
- open/close Settings customization and confirm no layout overflow
- enter/exit Free Ride and inspect the warning label
- confirm service worker/PWA refresh does not serve stale V1 UI
- check browser console and failed network requests

Run the trusted live-validation workflow from `main` if its endpoint secret is configured. A missing optional provider secret is not permission to expose a private routing service.

After production is healthy, close superseded PRs #29-#34, #36, and #37 with a short note that PR #35 contains the authoritative merged work. Do not delete branches until containment in `main` is confirmed.

## Stop conditions

Ask Zac only for:

- protected-branch/repository approval that you cannot satisfy
- a real product decision with materially different outcomes
- unknown dirty production changes
- unavailable deployment-host authority or required credentials
- failed health/smoke checks where rollback is unsafe or impossible
- a credible regression that cannot be fixed without changing a frozen ADR

## Final report

Report all of the following, with links where available:

- final PR #35 head SHA
- normal Quality run URL and result
- Deep QA run URL and each job result
- adversarial review disposition
- resulting `main`/merge SHA
- previous production rollback SHA
- deployed production SHA
- service status and `/api/health` result
- public desktop/mobile/PWA smoke results
- superseded PR closure status
- any intentional deferral, owner, and reason

Do not claim production complete without the deployed SHA and public smoke evidence.
