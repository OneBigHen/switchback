import type { ReleaseContext } from "./release"

export type TelemetryPropertyScalar = string | number | boolean | null
export type TelemetryPropertyValue = TelemetryPropertyScalar | readonly TelemetryPropertyScalar[]
export type TelemetryPropertyMap = Readonly<Record<string, TelemetryPropertyValue>>

/** Add the exact deployment context required for every OpenGravel event. */
export function withReleaseContext<T extends object>(
  releaseContext: ReleaseContext,
  properties: T
): ReleaseContext & T {
  return { ...releaseContext, ...properties }
}
