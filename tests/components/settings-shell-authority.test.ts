import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const shellSource = readFileSync("src/components/planner/PlannerShell.tsx", "utf8")
const navigationSource = readFileSync("src/lib/client/app-navigation.ts", "utf8")
const appNavigationSource = readFileSync("src/components/shell/AppNavigation.tsx", "utf8")
const overlayBlock = navigationSource.slice(
  navigationSource.indexOf("export type AppOverlay"),
  navigationSource.indexOf("export type ThemePreference")
)

describe("Settings destination authority", () => {
  it("mounts SettingsDestination from the shell instead of opening a Settings overlay", () => {
    expect(shellSource).toContain('navigation.destination === "settings"')
    expect(shellSource).toContain("<SettingsDestination")
    expect(shellSource).toContain('overlay: "advanced-settings"')
    expect(shellSource).not.toContain('navigation.overlays.includes("settings")')
    expect(shellSource).not.toContain("onOpenSettings=")
  })

  it("keeps advanced account/data tools semantically separate from the Settings destination", () => {
    expect(overlayBlock).toContain('| "advanced-settings"')
    expect(overlayBlock).not.toContain('| "settings"')
    expect(appNavigationSource).not.toContain("onOpenSettings")
  })
})
