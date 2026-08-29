# Switchback quality system

This is the owner-facing entry point for the release quality workflow. The
agent owns branch setup, test execution, failure classification, repairs, and
the pull request. The owner receives one concise state and presses Merge only
when the summary says `READY TO MERGE`.

Run the short local gate with:

```bash
npm run qa
```

Run the pull-request gate with:

```bash
npm run qa:pr
npm run test:e2e:real-router   # requires the prepared fixture router
npm run test:e2e:pwa
npx playwright test --project=road-lock
```

Run the routine Level A mobile gate (WebKit/iPhone approximation first,
Chromium comparison second):

```bash
npx playwright install chromium webkit
npm run test:e2e:mobile-qa
```

Use the full/expanded viewport/orientation matrix after significant mobile UI
changes or before a release candidate:

```bash
npm run test:e2e:mobile-qa:prepare
npm run test:e2e:mobile-qa:expanded
```

Prepare is a separate WebKit-primary seven-state gate. The complete selective
device/state matrix, artifact paths, inspection rules, and Level B/C boundaries
are in [Level A mobile QA](LEVEL_A_MOBILE_QA.md).

The GitHub Actions workflow is [.github/workflows/quality.yml](../../.github/workflows/quality.yml).
It runs the deterministic public checks on GitHub-hosted runners and uploads
failure evidence only when a job fails. Trusted live-provider validation is a
separate workflow; see [CI architecture](../CI-ARCHITECTURE.md).

Read next:

- [Owner workflow](OWNER_WORKFLOW.md)
- [Test catalog](TEST_CATALOG.md)
- [Release evidence](RELEASE_EVIDENCE.md)
- [Implementation status](IMPLEMENTATION_STATUS.md)
- [Physical iPhone drill](PHYSICAL_DEVICE_DRILL.md)
- [Failure policy](FAILURE_POLICY.md)
- [Level A mobile QA](LEVEL_A_MOBILE_QA.md)
