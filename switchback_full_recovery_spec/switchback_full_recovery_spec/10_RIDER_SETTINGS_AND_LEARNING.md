# Rider Settings and Preference Learning

## One settings source

```ts
interface RiderSettings {
  version: number
  riderName: string
  activeBikeId: string
  bikes: RiderBike[]
  defaultProfile: CoreRouteProfile
  defaultAvoidHighways: boolean
  units: "imperial" | "metric"
  voiceGuidance: boolean
  theme: "auto" | "light" | "dark"
  mapStyle: MapStyleId
  learningEnabled: boolean
}
```

## Stable bike identity

```ts
interface RiderBike {
  id: string
  name: string
  category: "street" | "touring" | "adventure" | "dual-sport"
  fuelRangeMiles: number
  reserveMiles: number
  maintainedGravel: boolean
  roughTracks: boolean
  unknownSurfacePolicy: "allow" | "warn" | "avoid"
}
```

All signals use `bike.id`, never display name.

## Every visible setting is operational

Default profile initializes planner. Fuel range powers readiness. Gravel and unknown-surface policies enter route constraints. Units affect all values. Voice, theme, map style, and learning immediately alter behavior. Delete unsupported fields.

## Learning model

Do not average disliked routes into preference.

```ts
interface PreferenceModel {
  bikeId: string
  profile: CoreRouteProfile
  positive: FeatureCentroid
  negative: FeatureCentroid
  sampleCount: number
  confidence: number
}
```

Signal weights:

- 5 stars +2
- 4 stars +1
- 3 stars 0
- 2 stars -1
- 1 star -2
- accepted +1
- less-like-this -2
- ignored -0.5
- manual edit toward road +1
- completed ride weak positive only with confirmation/rating

## Ranking

Only eligible routes. Track `selectionSource`. Never change a user selection when alternatives arrive.

## Explainability

Show learned preferences, sample counts, confidence, recent signals, reset, export, and import. Raw trails are not required.

## Migration

Migrate string-keyed motorcycle data into stable bike records and preserve export/reset.
