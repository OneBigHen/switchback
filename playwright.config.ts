import { defineConfig, devices } from "@playwright/test"

const externalBaseUrl = process.env.SWITCHBACK_E2E_URL

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:3100",
    geolocation: { latitude: 40.2732, longitude: -76.8867 },
    permissions: ["geolocation"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
    {
      name: "mobile-landscape-wide",
      use: {
        ...devices["iPhone 14 landscape"],
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 }
      }
    },
    { name: "mobile-landscape-narrow", use: { ...devices["iPhone SE landscape"] } }
  ],
  webServer: externalBaseUrl ? undefined : {
    command: "npx next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 120000
  }
})
