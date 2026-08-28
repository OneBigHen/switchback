import { test as base, expect, type BrowserContext, type Page } from "@playwright/test"
import { MOBILE_QA_DEVICES } from "./devices"
import { captureMobileQaArtifacts } from "./artifacts"
import { installRuntimeIssueCollector, type MobileQaRuntimeIssues } from "./assertions"

export type MobileQaColorScheme = "light" | "dark"
export type MobileQaNetwork = "online" | "offline"
export type MobileQaStorageMode = "fresh" | "persisted"

export interface MobileQaStorageSeed {
  readonly localStorage?: Readonly<Record<string, string>>
}

export interface MobileQaSession {
  readonly page: Page
  readonly context: BrowserContext
  readonly projectName: string
  readonly engine: "webkit" | "chromium"
  readonly hasTouch: boolean
  readonly colorScheme: MobileQaColorScheme
  readonly network: MobileQaNetwork
  readonly storage: MobileQaStorageMode
  readonly runtimeIssues: MobileQaRuntimeIssues
  readonly setColorScheme: (colorScheme: MobileQaColorScheme) => Promise<void>
  readonly setNetwork: (network: MobileQaNetwork) => Promise<void>
}

export interface MobileQaFixtures {
  readonly mobileQa: MobileQaSession
}

export interface MobileQaOptions {
  readonly mobileQaColorScheme: MobileQaColorScheme | undefined
  readonly mobileQaNetwork: MobileQaNetwork
  readonly mobileQaStorage: MobileQaStorageMode
  readonly mobileQaStorageSeed: MobileQaStorageSeed
}

export async function waitForMobileQaNetworkState(page: Page, online: boolean): Promise<void> {
  await page.evaluate((expectedOnline) => {
    if (navigator.onLine === expectedOnline) return
    return new Promise<void>((resolve) => {
      const eventName = expectedOnline ? "online" : "offline"
      window.addEventListener(eventName, () => resolve(), { once: true })
    })
  }, online)
  await page.waitForFunction((expectedOnline) => navigator.onLine === expectedOnline, online)
}

const DEFAULT_STORAGE_SEED: MobileQaStorageSeed = { localStorage: {} }

function deviceForProject(projectName: string) {
  return MOBILE_QA_DEVICES.find((device) => device.id === projectName) ?? (projectName === "webkit-prepare"
    ? { engine: "webkit" as const, hasTouch: true }
    : undefined)
}

export const mobileQaTest = base.extend<MobileQaFixtures & MobileQaOptions>({
  mobileQaColorScheme: [undefined, { option: true }],
  mobileQaNetwork: ["online", { option: true }],
  mobileQaStorage: ["fresh", { option: true }],
  mobileQaStorageSeed: [DEFAULT_STORAGE_SEED, { option: true }],
  mobileQa: async ({ page, context, colorScheme, mobileQaColorScheme, mobileQaNetwork, mobileQaStorage, mobileQaStorageSeed }, provide, testInfo) => {
    const effectiveColorScheme = mobileQaColorScheme ?? (colorScheme === "dark" ? "dark" : "light")
    const seed = mobileQaStorageSeed.localStorage ?? {}
    await context.addInitScript(({ mode, values }) => {
      if (mode === "fresh") localStorage.clear()
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value)
    }, { mode: mobileQaStorage, values: seed })
    await page.emulateMedia({ colorScheme: effectiveColorScheme })
    await context.setOffline(mobileQaNetwork === "offline")
    const runtimeIssues = installRuntimeIssueCollector(page)
    const device = deviceForProject(testInfo.project.name)
    const session: MobileQaSession = {
      page,
      context,
      projectName: testInfo.project.name,
      engine: device?.engine ?? "webkit",
      hasTouch: device?.hasTouch ?? false,
      colorScheme: effectiveColorScheme,
      network: mobileQaNetwork,
      storage: mobileQaStorage,
      runtimeIssues,
      setColorScheme: async (nextColorScheme) => {
        await page.emulateMedia({ colorScheme: nextColorScheme })
      },
      setNetwork: async (nextNetwork) => {
        await context.setOffline(nextNetwork === "offline")
        await waitForMobileQaNetworkState(page, nextNetwork === "online")
      },
    }
    await provide(session)
    runtimeIssues.dispose()
    await captureMobileQaArtifacts(page, testInfo)
  },
})

export const test = mobileQaTest
export { expect }

export interface MobileAppReadyExpectation {
  readonly tab?: "library" | "profile" | "plan"
  readonly heading?: string
}

export async function expectMobileAppReady(page: Page, expected: MobileAppReadyExpectation = {}): Promise<void> {
  const navigation = page.getByRole("navigation", { name: "Primary" })
  const dialog = page.getByRole("dialog").first()
  await expect.poll(async () => (await navigation.isVisible().catch(() => false)) || (await dialog.isVisible().catch(() => false)), {
    timeout: 15_000,
    message: "mobile app must expose navigation or its restored modal surface after reload"
  }).toBe(true)
  if (expected.tab) await expect(page).toHaveURL(new RegExp(`[?&]tab=${expected.tab}(?:&|$)`))
  if (expected.heading) await expect(page.getByRole("heading", { name: expected.heading })).toBeVisible()
}

export {
  FIXTURE_START,
  FIXTURE_FINISH,
  expectRouteOutcome,
  installPlannerServices,
  installRouteApi,
  makeRoute,
  openPlannerEditor,
  ensureFixtureStart,
  fillFixtureFinish,
  tapAutocompleteOption,
  expandPhonePlanner,
  tripPlan,
} from "../helpers/planner-fixtures"
export { captureEvidence, pinVisualClock, settleMapDelay, uxState } from "../helpers/ux-state-fixtures"
