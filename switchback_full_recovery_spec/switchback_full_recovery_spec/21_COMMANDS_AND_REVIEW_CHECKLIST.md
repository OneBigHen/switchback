# Commands and Review Checklist

Reconcile with live scripts.

## Baseline

```bash
git status --short
git log --oneline -10
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:critical
npm run test:e2e:real-router
npm run test:e2e:pwa
npm run test:live-smoke
```

## Recommended additions

```bash
npm run test:semantic
npm run test:migrations
npm run test:offline-regions
npm run deadcode
npm run boundaries
npm run quality:release
```

## Review

### Domain
Eligibility, evidence, normalized constraints, explicit provider differences, React-independent testing.

### State
Clear ownership, explicit transition, stale-work rejection, cancellation, versioned persistence.

### UI
Mobile appropriateness, desktop discoverability, factual copy, confirmations, operational controls, explained disabled states.

### Offline
Reload behavior, honest failures, preserved old data, bounded storage, integrity.

### Privacy
Sanitized coordinates/instructions/names/logs, server-only secrets, intentional export.

### Tests
Semantic invariant, real provider where needed, original regression.
