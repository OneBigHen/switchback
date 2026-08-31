import { defineConfig } from "@playwright/test"

const port = process.env.SWITCHBACK_AUDIT_PORT ?? "3119"
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: "./tests/audit",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "artifacts/audit/test-results",
  use: {
    baseURL,
    geolocation: { latitude: 40.2732, longitude: -76.8867 },
    permissions: ["geolocation"],
    timezoneId: "America/New_York",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    screenshot: "off",
  },
  webServer: {
    command: `SWITCHBACK_SESSION_SECRET=switchback-audit-secret SWITCHBACK_WEBAUTHN_RP_ID=localhost SWITCHBACK_WEBAUTHN_ORIGIN=${baseURL} npx next dev --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
