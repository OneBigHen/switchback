# ADR 0007: Local-first location privacy

## Decision

Precise route and ride histories remain local unless the rider explicitly
exports or enables future sync. Home/work privacy zones, automatic start/end
redaction, private ride mode, complete export, and complete deletion are
product requirements. Provider calls receive only the location needed for the
requested operation.

## Consequences

Feature design must distinguish locally stored history from data sent to route,
search, weather, or enrichment providers.
