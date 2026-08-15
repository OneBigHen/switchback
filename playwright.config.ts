import { defineConfig, devices } from "@playwright/test"

const externalBaseUrl = process.env.SWITCHBACK_E2E_URL
const testMode = process.env.SWITCHBACK_E2E_MODE ?? "existing"
const testPort = process.env.SWITCHBACK_E2E_PORT ?? (testMode === "pwa" ? "3111" : "3110")
const localBaseUrl = `http://localhost:${testPort}`
const localSessionSecret = "switchback-playwright-local-session-secret"
const qualitySuites = /\/(critical|real-router|pwa|visual)\//
const memorySoakSpec = /\/memory-soak\.spec\.ts$/
const criticalMatch = /\/critical\/.*\.spec\.ts$/
const realRouterMatch = /\/real-router\/.*\.spec\.ts$/
const pwaMatch = /\/pwa\/.*\.spec\.ts$/
const visualMatch = /\/visual\/.*\.spec\.ts$/

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI
    ? [["line"], ["json", { outputFile: "artifacts/quality/playwright-results.json" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: externalBaseUrl ?? localBaseUrl,
    geolocation: { latitude: 40.2732, longitude: -76.8867 },
    permissions: ["geolocation"],
    // Production registers the offline PWA worker. Requests handled by a
    // service worker bypass page.route(), so API fixtures become order- and
    // viewport-dependent unless the worker is disabled for this matrix.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "desktop-chromium",
      testIgnore: [qualitySuites, memorySoakSpec],
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile-safari",
      testIgnore: [qualitySuites, memorySoakSpec],
      use: { ...devices["iPhone 14"] }
    },
    {
      name: "mobile-landscape-wide",
      testIgnore: [qualitySuites, memorySoakSpec],
      use: {
        ...devices["iPhone 14 landscape"],
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 }
      }
    },
    {
      name: "mobile-landscape-narrow",
      testIgnore: [qualitySuites, memorySoakSpec],
      use: { ...devices["iPhone SE landscape"] }
    },
    {
      name: "memory-soak",
      testMatch: memorySoakSpec,
      use: { ...devices["Desktop Chrome"], serviceWorkers: "block" }
    },
    {
      name: "critical-chromium",
      testMatch: criticalMatch,
      use: { ...devices["Desktop Chrome"], serviceWorkers: "block" }
    },
    {
      name: "critical-webkit",
      testMatch: criticalMatch,
      use: { ...devices["iPhone 14"], serviceWorkers: "block" }
    },
    {
      name: "real-router",
      testMatch: realRouterMatch,
      use: { ...devices["Desktop Chrome"], serviceWorkers: "block" }
    },
    {
      name: "pwa",
      testMatch: pwaMatch,
      use: { ...devices["Desktop Chrome"], serviceWorkers: "allow" }
    },
    {
      name: "visual",
      testMatch: visualMatch,
      use: { ...devices["Desktop Chrome"], serviceWorkers: "block" }
    }
  ],
  webServer: externalBaseUrl ? undefined : {
    command: `SWITCHBACK_SESSION_SECRET=${localSessionSecret} SWITCHBACK_WEBAUTHN_RP_ID=localhost SWITCHBACK_WEBAUTHN_ORIGIN=${localBaseUrl} ${testMode === "pwa"
      ? `npx next start --hostname 127.0.0.1 --port ${testPort}`
      : `npx next dev --hostname 127.0.0.1 --port ${testPort}`}`,
    url: localBaseUrl,
    // A dedicated port plus no reuse prevents a stale production process from
    // turning an HTTP WebKit run into an HTTPS asset-loading failure.
    reuseExistingServer: false,
    timeout: 120000
  }
})
