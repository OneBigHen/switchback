export interface TelemetryIdentityProperties {
  beta_cohort?: string
  first_seen_app_release?: string
  installed_pwa?: boolean
  device_class?: "mobile" | "tablet" | "desktop" | "unknown"
  tester_role?: "owner" | "invited_tester" | "anonymous"
}

interface IdentitySdk {
  identify(identityId: string, properties?: Record<string, unknown>): void
  reset(): void
  opt_in_capturing?(): void
}

const OPAQUE_IDENTITY = /^rider-[A-Za-z0-9-]{20,}$/

export function isOpaqueTelemetryIdentity(value: string): boolean {
  return OPAQUE_IDENTITY.test(value)
}

export function identifyTelemetry(
  sdk: IdentitySdk,
  identityId: string,
  properties: TelemetryIdentityProperties = {}
): boolean {
  if (!isOpaqueTelemetryIdentity(identityId)) return false
  const allowed: Record<string, unknown> = {}
  if (typeof properties.beta_cohort === "string") allowed.beta_cohort = properties.beta_cohort
  if (typeof properties.first_seen_app_release === "string") allowed.first_seen_app_release = properties.first_seen_app_release
  if (typeof properties.installed_pwa === "boolean") allowed.installed_pwa = properties.installed_pwa
  if (properties.device_class) allowed.device_class = properties.device_class
  if (properties.tester_role) allowed.tester_role = properties.tester_role
  sdk.identify(identityId, allowed)
  return true
}

export function resetTelemetryIdentity(sdk: IdentitySdk): void {
  sdk.reset()
  // PostHog clears its consent marker during reset when it was initialized
  // with opt_out_capturing_by_default. The app-level acknowledgement remains
  // valid, so the next anonymous browser identity must opt back in.
  sdk.opt_in_capturing?.()
}
