import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(
  resolve(process.cwd(), "src/components/spotify/SpotifyPlayerDock.module.css"),
  "utf8"
)

describe("Spotify ride-safe layout", () => {
  it("defines distinct desktop, portrait, and short-landscape ride rails", () => {
    expect(css).toMatch(/\.player\.rideMode[\s\S]*?top:\s*max\(172px[\s\S]*?bottom:\s*auto/)
    expect(css).toContain("@media (max-width: 760px) and (orientation: portrait)")
    expect(css).toMatch(/@media \(max-width: 760px\) and \(orientation: portrait\)[\s\S]*?bottom:\s*max\(266px/)
    expect(css).toContain("@media (orientation: landscape) and (max-height: 520px)")
    expect(css).toMatch(/@media \(orientation: landscape\) and \(max-height: 520px\)[\s\S]*?top:\s*max\(148px/)
    expect(css).toMatch(/@media \(orientation: landscape\) and \(max-height: 380px\)[\s\S]*?display:\s*none/)
  })

  it("keeps the phone planner player above its primary bottom action dock", () => {
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.player:not\(\.rideMode\)[\s\S]*?top:\s*max\(12px[\s\S]*?bottom:\s*auto/)
    expect(css).toMatch(/\.player:not\(\.rideMode\) \.detail[\s\S]*?display:\s*none/)
    expect(css).toMatch(/\.prompt:not\(\.rideMode\)[\s\S]*?top:\s*max\(12px[\s\S]*?bottom:\s*auto/)
  })

  it("keeps the planner connect card clear of the phone location control and desktop map rail", () => {
    expect(css).toMatch(/@media \(min-width: 761px\)[\s\S]*?\.prompt[\s\S]*?right:\s*max\(84px/)
    expect(css).toMatch(/@media \(max-width: 760px\) and \(orientation: portrait\)[\s\S]*?\.prompt:not\(\.rideMode\)[\s\S]*?top:\s*max\(64px/)
    expect(css).toMatch(/\.prompt:not\(\.rideMode\) \.promptCopy\s*\{\s*display:\s*block/)
  })

  it("moves the landscape planner prompt out of the bottom action lane", () => {
    expect(css).toMatch(/@media \(orientation: landscape\) and \(max-height: 520px\)[\s\S]*?\.prompt:not\(\.rideMode\)[\s\S]*?top:\s*max\(104px[\s\S]*?bottom:\s*auto/)
  })
})
