import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { A11Y_TOKENS } from "@/app/styles/a11y-tokens"

/**
 * Colour the mobile redesign introduced, checked against the same AA floor the
 * design contract enforces elsewhere.
 *
 * "Estimated" is the reason this exists: Golden Hour is a fill colour, and
 * using it as small text put an evidence label at ~2.6:1 on cream — a label
 * whose entire job is to be read.
 */

const tokens = readFileSync(join(process.cwd(), "src/app/styles/tokens.css"), "utf8")

function hexFromTokens(name: string, scope: "light" | "dark"): string {
  const block = scope === "light"
    ? tokens.slice(tokens.indexOf(":root {"), tokens.indexOf(':root[data-theme="dark"]'))
    : tokens.slice(tokens.indexOf(':root[data-theme="dark"]'))
  const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block)
  if (!match) throw new Error(`${name} is not defined for the ${scope} theme`)
  return match[1]!
}

function channel(value: number): number {
  const normalized = value / 255
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe("mobile redesign colour", () => {
  it("keeps the Estimated label readable on every planning surface", () => {
    const warning = hexFromTokens("--sb-warning-text", "light")
    for (const surface of ["#FBF9F4", "#EFE9DE", "#F4F0E7"]) {
      expect(contrast(warning, surface)).toBeGreaterThanOrEqual(A11Y_TOKENS.contrast.normalTextAA)
    }
  })

  it("keeps the Estimated label readable in the dark theme", () => {
    const warning = hexFromTokens("--sb-warning-text", "dark")
    for (const surface of ["#161D1C", "#1C2825", "#243A35"]) {
      expect(contrast(warning, surface)).toBeGreaterThanOrEqual(A11Y_TOKENS.contrast.normalTextAA)
    }
  })

  it("keeps curvature band labels legible as text, not just as fills", () => {
    for (const band of ["--sb-band-calm", "--sb-band-mellow", "--sb-band-twisty", "--sb-band-hairpin"]) {
      // Band chips are uppercase 10px labels, so they are held to the normal
      // text floor rather than the large-text one.
      expect(contrast(hexFromTokens(band, "light"), "#FBF9F4"))
        .toBeGreaterThanOrEqual(A11Y_TOKENS.contrast.largeTextAA)
    }
  })
})
