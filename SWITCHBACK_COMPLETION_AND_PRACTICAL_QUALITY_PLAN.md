# Switchback Completion and Practical Quality Execution Plan

**Repository:** `OneBigHen/switchback`  
**Required baseline:** commit `90977e1ff0b582149b7b621d280a55a5f09ff441`  
**Baseline title:** `feat: ship first-class routing and free ride`  
**Purpose:** Finish the first-class routing/Free Ride release and install a practical, maintainable quality system  
**Operating model:** AI-assisted solo development, GitHub-hosted CI first, no unnecessary infrastructure  
**Status:** Ready to execute

---

## 1. Mission

Continue from commit:

```text
90977e1ff0b582149b7b621d280a55a5f09ff441
feat: ship first-class routing and free ride
```

Do not rebuild completed routing and Free Ride work from scratch.

The baseline already contains:

- Provider-neutral route and road-feature contracts
- Explainable deterministic route scoring
- Eight route profiles
- Plan, Ride, Record, Library, Profile, and Free Ride surfaces
- Free Ride / Neural Map v1
- Local rider preference learning
- Offline corridor recovery
- PWA shell and service worker
- Responsive HUD work
- ADRs and architecture documentation
- 1,147 passing Vitest tests at handoff
- Build, lint, and typecheck passing at handoff
- A focused Free Ride Playwright matrix

The remaining work has two connected goals:

1. Finish and qualify the first-class routing/Free Ride release.
2. Install the smallest practical quality system that prevents similar gaps from escaping again.

Do not stop after producing another plan. Inspect the current repository, execute the work, test it, repair failures, commit it on an agent-managed branch, open a pull request, and leave a plain-English owner summary.

---

## 2. Owner constraints

The owner is a solo developer using coding agents and should not need to:

- Create branches manually
- Remember branch names
- Rebase
- Inspect raw diffs
- Read stack traces
- Interpret CI internals
- Find Playwright traces
- Decide whether a failure is a product or test issue
- Run long manual checklists

The agent must handle:

- Branch creation
- Commits
- Pushes
- Pull-request creation
- CI inspection
- Failure classification
- Repairs
- Regression tests
- Plain-English summaries

Only use these owner-facing states:

```text
AGENT WORKING
NEEDS YOUR DECISION
READY TO MERGE
```

Ask the owner only when a genuine product decision cannot safely be inferred. Ask one specific question and recommend a default.

---

## 3. Scope control

### Implement now

- Preserve and improve the existing Vitest suite
- Add approximately 12–15 critical Playwright journeys
- Add a tiny real GraphHopper fixture and real-router CI checks
- Put checks in one practical GitHub Actions workflow
- Upload useful artifacts on failure
- Add simple owner-facing quality summaries
- Finish release follow-ups explicitly left incomplete in `90977e1`
- Complete requirement-by-requirement evidence
- Run live provider checks where the environment permits
- Create clear physical-device instructions for checks an agent cannot perform
- Convert every discovered defect into permanent regression coverage

### Do not implement now

- Cypress
- A second E2E framework
- Dedicated homelab runner
- Separate CI-control repository
- Kubernetes
- Massive nightly simulation platform
- Mutation testing
- Schemathesis
- k6
- Large autonomous AI test fleet
- Thousands of full-region scenarios
- Complex release governance
- Multiple overlapping AI instruction documents

These remain future options only when evidence proves they are needed.

---

## 4. Completed baseline work to preserve

Treat the following as completed unless inspection proves otherwise:

### Architecture

- GraphHopper remains primary.
- Valhalla remains optional.
- Provider output is normalized before UI use.
- Missing traffic/temporal data is explicitly degraded.
- Offline packs remain versioned and validated.
- Route scoring remains explainable and deterministic.
- Rider learning remains local.
- Free Ride suggestions remain workload-aware and safety-gated.
- Precise history remains local by default.

### Product

- Plan
- Ride
- Record
- Library
- Profile
- Free Ride
- Eight profiles
- Candidate scoring and explanations
- Local preferences
- Offline corridor recovery
- PWA shell
- Mobile/landscape HUD

### Existing checks

Re-run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Do not assume handoff results remain current.

---

## 5. Explicit unfinished baseline work

### 5.1 Plan visual and behavior matrix

Complete important states:

- Empty planner
- Start selected
- Destination selected
- Loop mode
- Loading primary route
- Loading alternatives
- Route ready
- Route comparison
- Provider degraded
- Provider unavailable
- Search failure
- Location denied
- Sparse-loop fallback
- Route warning
- Mobile portrait
- Mobile landscape
- iPad/tablet
- Desktop

Screenshots are evidence attached to behavioral tests, not substitutes for assertions.

### 5.2 Ride real-device and degraded-state checks

Automate where browser tooling permits and document physical steps for:

- Location granted
- Location denied
- Permission later granted
- Wake Lock available/unavailable
- Voice available/unavailable
- Browser suspension/resume
- Network loss
- Provider loss
- Offline corridor recovery
- GPS uncertainty
- Off-route
- Reroute
- Rejoin
- iPhone PWA
- Rotation
- Active-session recovery

Never claim a physical iPhone result without an actual run.

### 5.3 Live provider smoke checks

Where configured, verify:

- App health
- GraphHopper health
- Point-to-point route
- Loop route
- Custom model acceptance
- Geocoding
- Optional Valhalla
- Optional elevation
- Curvature data
- Weather
- PA unpaved enrichment
- Offline pack availability
- Search fallback

An absent optional provider should be recorded as `NOT CONFIGURED`, not automatically failed.

### 5.4 Airplane-mode/offline qualification

Automate:

- Service-worker shell
- Saved-route availability
- IndexedDB persistence
- Saved-corridor recovery
- Explicit rejection outside coverage
- Reconnection

Create this physical iPhone drill:

```text
1. Install/open Switchback as a PWA.
2. Save a known route and corridor pack.
3. Confirm the route opens online.
4. Enable airplane mode.
5. Reopen Switchback.
6. Confirm shell loads.
7. Confirm saved route opens.
8. Trigger supported recovery inside the saved corridor.
9. Confirm unsupported reroute outside coverage is clearly rejected.
10. Disable airplane mode.
11. Confirm reconnection without losing the active route.
```

Store results in:

```text
docs/quality/PHYSICAL_DEVICE_RESULTS.md
```

### 5.5 Release evidence

Create a focused evidence table mapping important capabilities to:

- Source
- Unit test
- Browser test
- Real-router test
- Live smoke
- Screenshot
- Physical result
- Known limitation

Do not create a giant compliance spreadsheet.

### 5.6 Deferred items

Do not block release on:

- Paid traffic provider selection
- Traffic credentials
- Learned pairwise ranker

Keep deterministic ranking and explicit capability states.

---

## 6. Practical quality architecture

Use one repository and GitHub-hosted runners:

```text
Agent-managed branch and PR
        |
        v
GitHub Actions
  - lint
  - typecheck
  - Vitest
  - build
  - critical Playwright
  - tiny real GraphHopper
  - PWA/offline
        |
        v
Plain-English summary
        |
        v
Owner presses Merge only when READY TO MERGE
```

Do not add a homelab runner during this implementation.

---

## 7. Repository additions

Add or normalize:

```text
.github/
  pull_request_template.md
  workflows/
    quality.yml

docs/
  quality/
    README.md
    OWNER_WORKFLOW.md
    TEST_CATALOG.md
    RELEASE_EVIDENCE.md
    LIVE_PROVIDER_RESULTS.md
    PHYSICAL_DEVICE_DRILL.md
    PHYSICAL_DEVICE_RESULTS.md
    FAILURE_POLICY.md
    IMPLEMENTATION_STATUS.md

tests/
  e2e/
    critical/
    real-router/
    pwa/
  fixtures/
    api/
    osm/
    routes/
  helpers/

scripts/
  qa/
    quick.mjs
    summarize-results.mjs
    start-test-router.sh
    stop-test-router.sh
    wait-for-service.sh
    run-live-smoke.mjs
```

Do not reorganize unrelated existing tests for cosmetic reasons.

---

## 8. Package scripts

Preserve existing commands and add:

```json
{
  "scripts": {
    "qa": "npm run qa:quick",
    "qa:quick": "node scripts/qa/quick.mjs",
    "qa:pr": "npm run lint && npm run typecheck && npm test && npm run test:e2e:critical && npm run build",
    "test:e2e:critical": "playwright test --project=critical-chromium --project=critical-webkit",
    "test:e2e:real-router": "playwright test --project=real-router",
    "test:e2e:pwa": "playwright test --project=pwa",
    "test:live-smoke": "node scripts/qa/run-live-smoke.mjs",
    "quality:summary": "node scripts/qa/summarize-results.mjs"
  }
}
```

Adapt names to the final Playwright configuration.

`npm run qa` should save detail under `artifacts/quality/latest/` and print only a concise result.

---

## 9. Critical Playwright journeys

Build approximately 12–15 focused tests.

### Suggestions

1. Click `Twisties` and display a route.
2. Click `Scenic` and display a route.
3. Click `Adventure` and display a route.
4. Click a time-based loop and display a route.
5. Click `Surprise me` or equivalent and reach a route or clear typed result.

### Planning

6. Enter a destination and display a route.
7. Plan a loop from a fixed start.
8. Deny location and get a usable fallback or clear action.
9. Start a second plan before the first completes; the first cannot overwrite the second.
10. Simulate provider failure; loading ends and a clear error appears.

### Route use

11. Select an alternative and update map and summary.
12. Save and reload a route.
13. Import valid GPX and display it.

### Modes/layouts

14. Enter Free Ride, accept a suggestion, and transition to guided Ride.
15. Load the planner and controls on iPhone-sized WebKit.

A successful route journey must assert:

```text
Request sent
Loading ends
Selected route exists
Geometry has at least two points
Summary visible
Distance > 0
Duration > 0
No route-unavailable error remains
```

Do not count a button or handler assertion as sufficient.

Use accessible selectors first. Add stable test IDs only where necessary.

---

## 10. Real GraphHopper fixture

Add:

```text
tests/fixtures/osm/switchback-test.osm
```

Include:

- Normal two-way road
- One-way road
- Curved road
- Rural/scenic segment
- Gravel
- Private road
- `motorcycle=no`
- Toll where supported
- Roundabout
- Signal
- Stop sign
- Dead end
- Disconnected component
- Sparse region
- Impossible destination

Test the complete boundary:

```text
Browser -> Next API -> Switchback request -> real GraphHopper -> UI
```

Required cases:

1. Normal point-to-point.
2. Twisty loop.
3. Sparse long loop fallback or typed failure.
4. Private road excluded.
5. `motorcycle=no` excluded.
6. Impossible route exits loading with typed failure.
7. Optional provider failure preserves valid primary route.
8. Invalid provider geometry is rejected.

Reuse existing GraphHopper scripts and configuration.

---

## 11. PWA/offline project

Create a Playwright project that allows service workers.

Test:

- App shell after first online visit
- Saved route available offline
- Route library persistence
- Offline state visible
- Corridor recovery inside coverage
- Rejection outside coverage
- API requests not cached as fake success
- Reconnection restores provider state
- App update does not corrupt stored data

This does not replace the physical iPhone drill.

---

## 12. GitHub Actions

Use one workflow:

```text
.github/workflows/quality.yml
```

Triggers:

```yaml
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
```

Use concurrency cancellation.

Jobs:

### `code-quality`

- Node 24
- `npm ci`
- Required system packages
- Lint
- Typecheck
- Vitest
- Build

### `critical-browser`

- Install Playwright
- Start app
- Run Chromium and WebKit critical projects
- Upload artifacts only on failure

### `real-router`

- Install Java
- Obtain pinned GraphHopper
- Import tiny fixture
- Start GraphHopper and app
- Run real-router project
- Upload app/router logs on failure

### `pwa`

- Run production-like service-worker/offline tests
- Upload failure artifacts

### `quality-summary`

Always run and produce:

```text
READY TO MERGE
AGENT WORKING
NEEDS YOUR DECISION
```

Include user impact and next action, not giant logs.

---

## 13. Failure artifacts

On Playwright failure preserve:

- Screenshot
- Trace
- Video
- Browser console
- Failed requests
- App log
- GraphHopper log
- Test/scenario ID

Upload only on failure with about seven-day retention.

The agent inspects them. The owner should not need to.

---

## 14. Visual evidence

Keep one canonical image per meaningful state:

- Plan desktop ready
- Plan iPhone portrait ready
- Plan landscape ready
- Route comparison
- Provider error
- Ride active
- Ride degraded/offline
- Free Ride idle
- Free Ride suggestion
- Free Ride accepted
- Library saved route
- Profile learning controls

Failure screenshots remain CI artifacts.

Index evidence in:

```text
docs/quality/RELEASE_EVIDENCE.md
```

---

## 15. Live provider smoke script

Create a bounded script that:

- Detects configured providers
- Tests only configured capabilities
- Uses `PASS`, `DEGRADED`, `NOT CONFIGURED`, or `FAIL`
- Avoids expensive repeated calls
- Produces JSON and Markdown
- Redacts credentials and private locations

Outputs:

```text
artifacts/quality/live-provider-results.json
docs/quality/LIVE_PROVIDER_RESULTS.md
```

---

## 16. Requirement evidence

Create:

```text
docs/quality/RELEASE_EVIDENCE.md
```

Use a table such as:

```markdown
| Capability | Implementation | Unit | Browser | Real router | Live/device | Status |
|---|---|---|---|---|---|---|
| Twisties suggestion | file | test | test | test | smoke | Verified |
| Offline recovery | file | test | test | N/A | Physical pending | Partial |
```

Prioritize:

- Suggestions
- Profiles
- Loops
- Alternatives
- Access safety
- Free Ride
- Ride guidance
- Offline recovery
- Local preferences
- PWA
- Privacy
- Provider degradation

---

## 17. Bug-to-regression rule

Every confirmed bug becomes a permanent regression at the earliest useful layer.

Example:

```text
Bug:
Clicking Twisties returned Route unavailable.

Regressions:
- Parser unit test
- Request-builder test
- Browser click test
- Real GraphHopper fixture test
```

Do not close a bug after manual confirmation only.

---

## 18. Flake policy

- One Playwright retry
- Preserve first-failure trace
- No infinite retries
- No silent skips for critical journeys
- No arbitrary sleeps
- Prefer explicit readiness state
- A flaky required test remains a defect
- Never weaken assertions solely to turn CI green

---

## 19. Pull-request template

Use:

```markdown
## Status

AGENT WORKING

## What changed

Plain-English explanation.

## What the owner will notice

- Visible behavior

## What was tested

- Unit
- Browser
- Real GraphHopper
- PWA/offline
- Live provider where configured

## Remaining physical checks

- None
or
- iPhone airplane-mode drill pending

## Risk

Low / Medium / High

Reason:

## Evidence

- Screenshot
- Quality summary
- Provider report

## Owner action

None while AGENT WORKING.
```

Change to `READY TO MERGE` only when required automated gates pass and physical-only checks are honestly stated.

---

## 20. Repository rules

After jobs have run successfully:

- Require pull requests for `main`
- Require `code-quality`
- Require `critical-browser`
- Require `real-router`
- Require `pwa`
- Block force pushes
- Use squash merge
- Auto-delete merged branches

Do not require another human reviewer for normal solo work.

---

## 21. Execution phases

### Phase A — audit current state

1. Confirm current HEAD includes or descends from `90977e1`.
2. Preserve valid later work.
3. Re-run all existing checks.
4. Verify baseline docs match code.
5. Update `IMPLEMENTATION_STATUS.md`.
6. Record actual test counts and failures.

### Phase B — owner workflow

1. Add PR template.
2. Add owner workflow.
3. Add `npm run qa`.
4. Add concise quality summary.
5. Document agent-managed branches and PRs.

### Phase C — critical journeys

1. Inventory existing Playwright.
2. Add missing fixture-backed journeys.
3. Cover every built-in suggestion.
4. Cover Free Ride accept-to-Ride.
5. Cover stale requests and provider failure.
6. Add desktop and WebKit projects.
7. Complete focused visual evidence.

### Phase D — real-router CI

1. Add tiny OSM fixture.
2. Import/start GraphHopper.
3. Add real-router project.
4. Verify access restrictions.
5. Verify sparse/impossible cases.
6. Add logs and artifacts.

### Phase E — PWA/offline

1. Add service-worker project.
2. Test shell, storage, recovery, rejection, reconnect.
3. Create physical iPhone drill.
4. Record only actual physical results.

### Phase F — live providers

1. Add smoke script.
2. Run configured providers.
3. Record honest capability states.
4. Repair product failures.
5. Do not fail for intentionally absent optional providers.

### Phase G — release evidence and review

1. Complete evidence table.
2. Run all automated gates.
3. Run independent AI review in a separate context/model.
4. Fix findings.
5. Commit and push.
6. Open/update PR.
7. Produce owner summary.

---

## 22. Definition of done

Complete when:

- Work is based on `90977e1` or a valid descendant
- First-class routing and Free Ride remain intact
- Lint passes
- Typecheck passes
- Vitest passes
- Build passes
- Critical Playwright passes
- Every built-in suggestion has final-outcome coverage
- Free Ride acceptance reaches guided Ride
- Tiny real GraphHopper suite passes
- Private and `motorcycle=no` restrictions are verified
- Sparse and impossible cases terminate correctly
- PWA/offline automated suite passes
- Live configured providers are honestly recorded
- Important visual states have evidence
- Ride degraded browser checks are complete
- Physical iPhone result is not fabricated
- Release evidence maps critical capabilities
- GitHub Actions runs required checks
- Failure artifacts upload automatically
- PR is understandable without reading a diff
- No homelab runner or second framework was added
- Every discovered defect gained a regression

---

## 23. Agent execution prompt

```text
Finish Switchback from the current main state using
SWITCHBACK_COMPLETION_AND_PRACTICAL_QUALITY_PLAN.md.

Required baseline:
90977e1ff0b582149b7b621d280a55a5f09ff441
feat: ship first-class routing and free ride

Do not rebuild completed routing and Free Ride work.
Do not stop after writing a plan.

Execute all phases:

A. Audit the current repository and confirm it includes or descends from
   90977e1. Preserve later valid work.
B. Install the simple owner workflow and npm run qa.
C. Build approximately 12–15 critical Playwright journeys, including every
   built-in route suggestion and Free Ride accept-to-Ride.
D. Add a tiny real GraphHopper OSM fixture and run real-router browser tests
   in GitHub Actions.
E. Add service-worker-enabled PWA/offline browser tests.
F. Run and document bounded live-provider smoke checks for configured
   providers only.
G. Complete the Plan visual matrix, Ride degraded-state checks, release
   evidence, and honest physical iPhone drill documentation.
H. Run an independent final review, fix findings, commit, push, and open or
   update a pull request.

Constraints:
- Keep one repository.
- Use GitHub-hosted runners.
- Do not add Cypress.
- Do not add a homelab runner.
- Do not add a separate CI-control repository.
- Do not add mutation testing, load testing, Schemathesis, or a large AI
  testing platform.
- Preserve existing Vitest and Playwright work.
- Handle branch creation, commits, push, PR, CI inspection, and repairs.
- Do not ask the owner to read diffs or raw logs.
- Use AGENT WORKING, NEEDS YOUR DECISION, or READY TO MERGE.
- Never claim a physical iPhone or live-provider test passed unless it ran.
- Treat optional unconfigured providers as NOT CONFIGURED.
- Convert every discovered bug into a permanent regression test.
- Update docs/quality/IMPLEMENTATION_STATUS.md continuously.
- Do not declare READY TO MERGE until required automated gates pass and
  physical-only checks are explicitly and honestly stated.

Final required verification:
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:critical
npm run test:e2e:real-router
npm run test:e2e:pwa
npm run test:live-smoke when a live environment is configured
```

---

## 24. Final principle

The objective is not maximum test count.

The objective is:

```text
The owner asks for a feature.
An agent builds it.
GitHub tests the actual user journey and real router.
The agent repairs failures.
The owner receives one honest summary.
The owner presses Merge.
```
