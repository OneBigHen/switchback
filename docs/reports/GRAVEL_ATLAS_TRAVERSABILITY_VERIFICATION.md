# Gravel Atlas traversability verification

Date: 2026-09-11
Branch: `feat/pa-gravel-atlas-routing`
Activated scope: **NJ only** (`njgin-ng911`)
Graph fingerprint: `cfe8954f2770d1179b2efe8c49cc1ea4c36dea23074c8fa018097b8e47ac08ad`
Source fingerprint: `e5b0555f2a30a773d3f6bdd940b96a67eb34e9fc2cfbe6cf5e3ff138847f1c62`

## Why this step exists

The canonical exporter proves corridor membership **per OSM segment**: each retained
canonical segment is checked against the hard motorcycle access and one-way rules used
for the GraphHopper import. That is not the same question as "can a rider ride this
corridor end to end in the built graph", where snapping, subnetwork handling and
profile weighting act on the whole chain rather than on individual segments.

Probing the live router with the retained NJ corridors showed the difference is real.
Every corridor snapped and routed, but five corridors were returned a route that does
not follow the corridor:

| Corridor | Longest continuous | Route follows | Endpoint snaps |
| --- | --- | --- | --- |
| Georgia Okeefe Way | 702 m | 16.67 % | 6 m / 1 m |
| Paige Hoagland Alley | 190 m | 55.56 % | within tolerance |
| Unnamed segment | 248 m | 36.36 % | within tolerance |
| Unnamed segment | 247 m | 36.36 % | within tolerance |
| Unnamed segment | 240 m | 45.45 % | within tolerance |

Georgia Okeefe Way is the clearest case. Its only OSM way is
`highway=track, motor_vehicle=yes, tracktype=grade5` with no barrier node, and each
sampled point along the corridor snaps to a routable edge within 1–6 m — the road is
present and legally open. Routing from one end to the other nevertheless returns
3597 m, i.e. 5.1x the corridor, so the built graph does not carry the corridor as a
through-route. Verification that only inspects segments could not see this.

## What the verification does

`npm run gravel-atlas:verify-routability` (`scripts/verify-gravel-atlas-routability.ts`)
asks the running GraphHopper service to ride each reconciled corridor from end to end
and measures, with an implementation independent of the application's evidence code,
how much of the corridor the returned route follows. A corridor is published as
`routable` only when all of the following hold:

- GraphHopper returns a non-degenerate route between the corridor endpoints,
- both corridor endpoints snap to the routable network within 60 m,
- the returned route follows at least 60 % of the corridor within the shared 40 m
  match radius.

Corridors that fail are quarantined with their measured reason and metrics and stay out
of the runtime database. The thresholds live in
`src/lib/roads/gravel-atlas/traversability.ts`; `gravel-atlas:refresh:nj` runs the step
between reconciliation and the runtime build, and fails closed if the router is
unreachable rather than publishing unverified corridors.

## Measured result (NJ activation, 2026-09-11)

- 43 reconciled corridors checked against graph `cfe8954f…` (profile `motorcycle_adventure`)
- 38 corridors rideable end to end and published
- 5 corridors refused by traversability (`route-diverges`) and quarantined with evidence
- 0 corridors unrouted; 0 corridors with an endpoint off the network
- Corridor coverage by the returned route: median 100 %, mean 91.01 %
- Endpoint snapping: worst observed 53 m (Burr Street Extension), inside the 60 m tolerance

Quarantine inventory for this activation: 316 reconciliation quarantine
(133 `no-routable-graph-match`, 94 `ambiguous-graph-match`, 89
`insufficient-contiguous-match`) plus 5 traversability quarantine.

The independent probe used for the table above is the same measurement the step
performs; it was also run standalone against all 43 corridors before the gate existed,
which is how the five refusals were found.

## Reproducing

```bash
npm run routing:fingerprint                     # active graph must equal cfe8954f…
npm run gravel-atlas:refresh:nj                 # sources -> graph -> reconcile -> traversability -> runtime
npm run gravel-atlas:verify-routability -- --input=data/gravel-atlas-verified.json \
  --out=data/gravel-atlas-verified-traversable.json \
  --report=data/gravel-atlas-traversability.json
```
