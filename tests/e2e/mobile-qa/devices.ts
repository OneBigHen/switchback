import { devices } from "@playwright/test"
import type { PlaywrightTestConfig, Project } from "@playwright/test"

export const MOBILE_QA_VIEWPORTS = {
  small: { width: 320, height: 568 },
  standard: { width: 390, height: 844 },
  large: { width: 430, height: 932 },
  "standard-landscape": { width: 844, height: 390 },
} as const

export type MobileQaEngine = "webkit" | "chromium"
export type MobileQaDeviceId = keyof typeof MOBILE_QA_VIEWPORTS
export type MobileQaProjectName =
  | "webkit-small"
  | "webkit-standard"
  | "webkit-large"
  | "webkit-standard-landscape"
  | "chromium-standard"

export const MOBILE_QA_SCENARIO_IDS = {
  core: "core-state",
  layout: "layout-containment",
  visual: "visual-state",
} as const

export type MobileQaScenarioId = typeof MOBILE_QA_SCENARIO_IDS[keyof typeof MOBILE_QA_SCENARIO_IDS]

export interface MobileQaDevice {
  readonly id: MobileQaProjectName
  readonly engine: MobileQaEngine
  readonly viewport: { readonly width: number; readonly height: number }
  readonly isMobile: true
  readonly hasTouch: true
  readonly orientation: "portrait" | "landscape"
  readonly scope: "core" | "layout"
}

const WEBKIT_BASE = devices["iPhone 14"]
const CHROMIUM_BASE = devices["Pixel 5"]

function device(
  id: MobileQaProjectName,
  engine: MobileQaEngine,
  viewport: { readonly width: number; readonly height: number },
  orientation: "portrait" | "landscape",
  scope: "core" | "layout",
): MobileQaDevice {
  return { id, engine, viewport, isMobile: true, hasTouch: true, orientation, scope }
}

export const MOBILE_QA_DEVICES: readonly MobileQaDevice[] = [
  device("webkit-small", "webkit", MOBILE_QA_VIEWPORTS.small, "portrait", "layout"),
  device("webkit-standard", "webkit", MOBILE_QA_VIEWPORTS.standard, "portrait", "core"),
  device("webkit-large", "webkit", MOBILE_QA_VIEWPORTS.large, "portrait", "layout"),
  device("webkit-standard-landscape", "webkit", MOBILE_QA_VIEWPORTS["standard-landscape"], "landscape", "layout"),
  device("chromium-standard", "chromium", MOBILE_QA_VIEWPORTS.standard, "portrait", "core"),
]

const CORE_SPEC = /\/mobile-qa\/core\/.*\.spec\.ts$/
const LAYOUT_OR_VISUAL_SPEC = /\/mobile-qa\/(?:layout\/mobile\.layout|visual\/mobile\.visual)\.spec\.ts$/
const DEBUG_TRACE_SPEC = /\/mobile-qa\/core\/debug-free-ride-trace(?:\.spec)?\.ts$/

function projectUseFor(device: MobileQaDevice): Project["use"] {
  const base = device.engine === "webkit" ? WEBKIT_BASE : CHROMIUM_BASE
  return {
    ...base,
    browserName: device.engine,
    viewport: device.viewport,
    screen: device.viewport,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
  }
}

function projectFor(device: MobileQaDevice): Project {
  const isCore = device.scope === "core"
  return {
    name: device.id,
    testMatch: isCore ? [CORE_SPEC] : [LAYOUT_OR_VISUAL_SPEC],
    testIgnore: [DEBUG_TRACE_SPEC],
    use: projectUseFor(device),
  }
}

export const MOBILE_QA_PROJECTS: readonly Project[] = MOBILE_QA_DEVICES.map(projectFor)

export function coreMobileQaProjectNames(): readonly MobileQaProjectName[] {
  return MOBILE_QA_DEVICES.filter((device) => device.scope === "core").map((device) => device.id)
}

export function layoutMobileQaProjectNames(): readonly MobileQaProjectName[] {
  return MOBILE_QA_DEVICES.filter((device) => device.scope === "layout").map((device) => device.id)
}

export function mobileQaProjects(): NonNullable<PlaywrightTestConfig["projects"]> {
  const standardWebKit = MOBILE_QA_DEVICES.find((device) => device.id === "webkit-standard")
  if (!standardWebKit) throw new Error("webkit-standard mobile QA device is missing")
  return [
    ...MOBILE_QA_PROJECTS,
    {
      name: "webkit-prepare",
      testMatch: [/\/mobile-qa\/visual\/prepare\.visual\.spec\.ts$/],
      testIgnore: [DEBUG_TRACE_SPEC],
      use: projectUseFor(standardWebKit),
    },
  ]
}
