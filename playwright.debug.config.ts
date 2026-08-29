import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3125",
    geolocation: { latitude: 40.2732, longitude: -76.8867 },
    permissions: ["geolocation"],
    timezoneId: "America/New_York",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  },
  projects: [{ name: "webkit", testMatch: /_debug-geometry\.spec\.ts$/, use: { ...devices["iPhone 14"], browserName: "webkit", viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
})
