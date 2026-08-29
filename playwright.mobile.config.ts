import { defineConfig } from "@playwright/test"
import path from "node:path"
import { validateMobileQaPort } from "./scripts/qa/mobile-qa-port"
import { mobileQaProjects } from "./tests/e2e/mobile-qa/devices"

const externalBaseUrl = process.env.SWITCHBACK_E2E_URL
const testPort = validateMobileQaPort(process.env.SWITCHBACK_E2E_PORT)
const artifactRoot = process.env.MOBILE_QA_ARTIFACT_ROOT ?? "artifacts/mobile-qa"
const inventoryMode = process.env.MOBILE_QA_INVENTORY === "1"
const localBaseUrl = `http://localhost:${testPort}`
const localSessionSecret = "switchback-playwright-local-session-secret"

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: path.join(artifactRoot, inventoryMode ? "inventory-results-not-run" : "test-results"),
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ["list"],
    ...inventoryMode ? [] : [["html", { outputFolder: process.env.MOBILE_QA_HTML_REPORT_DIR ?? path.join(artifactRoot, "playwright-report"), open: "never" }] as const],
    ["./tests/e2e/mobile-qa/reporter.ts"],
  ],
  use: {
    baseURL: externalBaseUrl ?? localBaseUrl,
    geolocation: { latitude: 40.2732, longitude: -76.8867 },
    permissions: ["geolocation"],
    timezoneId: "America/New_York",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: mobileQaProjects(),
  webServer: externalBaseUrl ? undefined : {
    command: `SWITCHBACK_SESSION_SECRET=${localSessionSecret} SWITCHBACK_WEBAUTHN_RP_ID=localhost SWITCHBACK_WEBAUTHN_ORIGIN=${localBaseUrl} npx next dev --hostname 127.0.0.1 --port ${testPort}`,
    url: localBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
