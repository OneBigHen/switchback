# ADR 0005: Local interpretable rider preference model

## Decision

Store rider preference signals locally by default and update an interpretable
profile from selected, accepted, rejected, skipped, completed, and explicitly
rated routes. Keep profile reset/export/deletion controls and do not infer or
reward speed or illegal behavior.

## Consequences

Personalization works without an account or cloud sync. A later pairwise ranker
must remain subordinate to deterministic safety and legal gates.
