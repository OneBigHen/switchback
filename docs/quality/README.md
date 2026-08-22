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
