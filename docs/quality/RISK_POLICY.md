# Change risk policy

`node scripts/qa/classify-change.mjs <changed-path> ...` produces the
deterministic baseline used to select QA. It uses changed paths, file count,
and diff size; a reviewer may raise the class when the change is uncertain.

The classifier uses this precedence:

1. `docs` — every changed file is documentation.
2. `security` — auth, secrets, permissions, deployment, workflow, or exposure changes.
3. `architecture` — dependency/config/schema changes, more than 20 files, or more than 300 changed lines.
4. `offline` — service worker, PWA, cache, IndexedDB, or offline behavior.
5. `routing` — router, GraphHopper, Valhalla, GPX/KMZ, navigation, or road behavior.
6. `ui` — app/components, JSX/TSX, or styling changes.
7. `low` — at most 10 changed lines across at most two ordinary files.
8. `standard` — the remaining code changes.

## Gates

| Class | Required evidence |
| --- | --- |
| docs | relevant lint/format and policy check |
| low | lint, typecheck, targeted unit tests |
| standard | low plus relevant integration tests and critical browser checks |
| ui | standard plus changed-flow browser checks, screenshots/traces, and one evidence-backed exploratory review |
| routing | standard plus deterministic route tests and the existing real-router fixture |
| offline | standard plus the existing PWA/offline suite |
| security / architecture | domain gates plus independent strong-model review; never automatic merge |

The existing `.github/workflows/quality.yml` remains the authoritative PR
check set. The local CI appliance runs the fast loop; the PR checks run the
complete evidence set already defined by that workflow. No second result
database or duplicate CI scheduler is introduced.
