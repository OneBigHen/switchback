import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const libraryDrawerStyles = readFileSync(resolve(process.cwd(), "src/app/styles/library-drawer.css"), "utf8")

describe("Library drawer CSS contract", () => {
  it("keeps every project variant selector at the shared touch target", () => {
    const variantRule = libraryDrawerStyles.match(/\.library-project-row \.library-variant-select\s*\{[^}]*}/s)?.[0] ?? ""

    expect(variantRule).toContain("min-height: var(--sb-touch-target)")
  })

  it("keeps the compact import-lock control inside its mobile target", () => {
    const mobileRules = libraryDrawerStyles.match(/@media \(max-width: 430px\) \{[\s\S]*$/)?.[0] ?? ""

    expect(mobileRules).toContain(".library-drawer .import-lock-wrap .import-lock-button")
    expect(mobileRules).toContain("width: var(--sb-touch-target)")
    expect(mobileRules).toContain("min-width: var(--sb-touch-target)")
  })

  it("does not let hidden file controls intercept adjacent drawer actions", () => {
    const inputRule = libraryDrawerStyles.match(/\.import-route-button input\s*\{[^}]*}/s)?.[0] ?? ""

    expect(inputRule).toContain("pointer-events: none")
  })

  it("keeps the drawer inside its safe-area box throughout entry animation", () => {
    const drawerRule = libraryDrawerStyles.match(/\.library-drawer\s*\{[^}]*}/s)?.[0] ?? ""

    expect(drawerRule).toContain("animation: library-drawer-in")
    expect(libraryDrawerStyles).toMatch(/@keyframes library-drawer-in\s*\{\s*from\s*\{\s*opacity: 0;\s*}\s*to\s*\{\s*opacity: 1;\s*}\s*}/)
  })

  it("uses every mobile safe-area edge for the drawer inset", () => {
    const mobileRules = libraryDrawerStyles.match(/@media \(max-width: 760px\) \{[\s\S]*?\.library-drawer\s*\{([\s\S]*?)\n\s*}/g)?.at(-1) ?? ""

    expect(mobileRules).toContain("top: max(8px, env(safe-area-inset-top))")
    expect(mobileRules).toContain("right: max(8px, env(safe-area-inset-right))")
    expect(mobileRules).toContain("bottom: max(8px, env(safe-area-inset-bottom))")
    expect(mobileRules).toContain("left: max(8px, env(safe-area-inset-left))")
  })
})
