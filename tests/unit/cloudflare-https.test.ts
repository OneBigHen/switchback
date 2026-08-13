import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { shouldUpgradeCloudflareHttp } from "@/lib/http/cloudflare-https"
import { proxy } from "@/proxy"

describe("Cloudflare HTTPS enforcement", () => {
  it("upgrades plain HTTP visitors for the public Switchback hostname", () => {
    expect(shouldUpgradeCloudflareHttp(
      new Headers({ "cf-visitor": '{"scheme":"http"}' }),
      "ride.henning.rodeo"
    )).toBe(true)
  })

  it("does not redirect HTTPS visitors, direct LAN traffic, or other hosts", () => {
    expect(shouldUpgradeCloudflareHttp(
      new Headers({ "cf-visitor": '{"scheme":"https"}' }),
      "ride.henning.rodeo"
    )).toBe(false)
    expect(shouldUpgradeCloudflareHttp(new Headers(), "ride.henning.rodeo")).toBe(false)
    expect(shouldUpgradeCloudflareHttp(
      new Headers({ "cf-visitor": '{"scheme":"http"}' }),
      "switchback.home.arpa"
    )).toBe(false)
  })

  it("redirects only the HTTP public request to its HTTPS equivalent", () => {
    const response = proxy(new NextRequest("http://ride.henning.rodeo/api/health?probe=1", {
      headers: { "cf-visitor": '{"scheme":"http"}' }
    }))

    expect(response.status).toBe(308)
    expect(response.headers.get("location")).toBe(
      "https://ride.henning.rodeo/api/health?probe=1"
    )
  })

  it("uses the reverse proxy's forwarded hostname for the public upgrade", () => {
    const response = proxy(new NextRequest("http://0.0.0.0/api/health?probe=1", {
      headers: {
        "cf-visitor": '{"scheme":"http"}',
        "x-forwarded-host": "ride.henning.rodeo"
      }
    }))

    expect(response.status).toBe(308)
    expect(response.headers.get("location")).toBe(
      "https://ride.henning.rodeo/api/health?probe=1"
    )
  })
})
