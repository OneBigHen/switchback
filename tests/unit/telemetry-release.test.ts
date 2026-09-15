import { describe, expect, it } from "vitest"
import { resolveTelemetryConfig } from "@/lib/telemetry/config"
import { createReleaseContext } from "@/lib/telemetry/release"

describe("telemetry release context", () => {
  it("derives broad device and PWA context without location data", () => {
    const context = createReleaseContext(
      resolveTelemetryConfig({
        TELEMETRY_ENABLED: "true",
        NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_test",
        NEXT_PUBLIC_OPENGRAVEL_RELEASE: "beta-2026-09-14",
        NEXT_PUBLIC_OPENGRAVEL_BUILD_SHA: "abc123",
        NEXT_PUBLIC_OPENGRAVEL_DEPLOYMENT_ID: "deploy-7",
        NODE_ENV: "production"
      }),
      {
        innerWidth: 390,
        matchMedia: () => ({ matches: true }),
        navigator: { standalone: true }
      }
    )

    expect(context).toEqual({
      app_release: "beta-2026-09-14",
      build_sha: "abc123",
      deployment_id: "deploy-7",
      telemetry_schema_version: "1",
      environment: "production",
      hosted_or_self_hosted: "hosted-beta",
      pwa_mode: "standalone",
      device_class: "mobile"
    })
  })
})
