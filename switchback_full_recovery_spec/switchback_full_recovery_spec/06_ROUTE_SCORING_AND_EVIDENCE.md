# Route Scoring and Evidence

## Goal

A route score is useful only when inputs are measured and comparable. Eliminate synthetic evidence from production scoring.

## Evidence provenance

Every metric carries:

```ts
interface MetricEvidence {
  source: string
  observedAt?: string
  graphVersion?: string
  confidence: number
  status: "measured" | "estimated" | "unavailable"
}
```

Examples: curvature database, OSM/GraphHopper surface and access, provider elevation, live traffic or clearly labeled road-class proxy, scenic proxy datasets, and novelty from local history.

## Missing data

Do not assign optimistic defaults. Use `null`, lower confidence, neutral profile treatment, and a warning when the missing input materially affects the decision.

## Score structure

```ts
interface RouteScore {
  total: number
  dimensions: {
    pace?: number
    twistiness?: number
    scenic?: number
    elevation?: number
    surfaceFit?: number
    traffic?: number
    simplicity?: number
    novelty?: number
    confidence: number
  }
  explanation: RouteExplanation[]
}
```

Do not create a generic safety score without validated safety data. Legal access and closures are eligibility.

## Personalization

Personalization ranks only eligible candidates. Display base score, fit, confidence, and top evidence-backed reasons.

## Calibration

Build a local evaluation dataset from explicit choices, ratings, edits, completed rides, and Free Ride feedback. Add a script comparing predicted ranking with actual choice. Keep the model simple until calibration is measured.

## Allowed explanations

- “27% mapped unpaved surface.”
- “18 minutes longer than Quick.”
- “Uses more secondary roads.”
- “Matches your high-rated Twisty rides.”

Not allowed without evidence:

- “Safer.”
- “Verified road.”
- “Low traffic” from a fixed placeholder.
- “Scenic” from a generic constant.
