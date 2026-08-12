# Native decision record

**Date:** 2026-08-12
**Status:** unmeasured — do not choose native from architecture preference

| Field measurement | Result | Release implication |
|---|---|---|
| GPS continuity with screen/app state changes | Not run | Required before native decision |
| Background voice/media coexistence | Not run | Required before native decision |
| Wake-lock and mounted multi-hour ride | Not run | Required before native decision |
| PWA termination/recovery rate | Not run | Required before native decision |
| Offline pack retention/eviction | Not run | Required before native decision |
| Bluetooth/media/navigation coexistence | Not run | Required before native decision |
| Battery versus reference navigation app | Not run | Required before native decision |
| CarPlay requirement | Not a current product goal | No native trigger from CarPlay |

## Decision

PWA-first remains the implementation default until the target iPhone field
protocol is executed. If a release-blocking criterion persists after tuning,
build a thin wrapper for the failing platform capability only; keep routing,
RIG, storage contracts, and domain logic shared.
