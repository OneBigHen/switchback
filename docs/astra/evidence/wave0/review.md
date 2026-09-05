# Wave 0 checkpoint review

Base `f10d196228599ac6626bcc07ba7ce22540011228`; uncommitted partial implementation, 2026-09-05. Independent reviews scoped to null-context, error recovery, evidence truth, and roadmap reconciliation. Not full-wave or release approval.

## Standards

- Failed request retained in conversation and draft, duplicating it on retry: root correction and retry-payload E2E pending.
- Invalid-input test title claimed unavailable-provider distinction without testing it: title corrected; separate 503 test added.
- No additional documented-standard violation reported.

## Spec

- Valid long/multibyte transcript exceeds 24KiB and retry repeats failure: Luna implementing bounded UTF-8 transport history.
- Unsupported-action taxonomy remains incomplete: remains Wave 0/4 work with explicit Home boundary.
- Duplicate failed-turn finding: same correction tracked above.
- Tiny-phone/short-landscape evidence and phone recovery layout remain open; no visual acceptance claimed.
- Production source/build/provider baseline incomplete: runtime-baseline.json now records available health/build-file/GraphHopper identifiers and explicitly unattested boundaries.

Standards: two findings. Spec: five findings. Neither axis approves the entire wave or release.
