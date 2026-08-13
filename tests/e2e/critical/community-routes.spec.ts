import { expect, test } from "@playwright/test"

function rgb(value: string): [number, number, number] {
  const values = value.match(/[\d.]+/g)?.map(Number)
  if (!values || values.length < 3) throw new Error(`Unsupported color: ${value}`)
  return [values[0]!, values[1]!, values[2]!]
}

function luminance(value: string): number {
  return rgb(value).map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0)
}

function contrast(foreground: string, background: string): number {
  const foregroundLum = luminance(foreground)
  const backgroundLum = luminance(background)
  return (Math.max(foregroundLum, backgroundLum) + 0.05) / (Math.min(foregroundLum, backgroundLum) + 0.05)
}

test("anonymous community browse is available without identity and rejects invalid detail ids", async ({ page, request }) => {
  const response = await request.get("/api/community/routes")
  expect(response.status()).toBe(200)
  const payload = await response.json() as { routes?: unknown }
  expect(Array.isArray(payload.routes)).toBe(true)

  await page.goto("/routes")
  await expect(page.getByRole("heading", { name: "Find a better road." })).toBeVisible()

  const invalid = await request.get("/api/community/routes/not-a-route")
  expect(invalid.status()).toBe(404)
  expect((await invalid.json()).error.code).toBe("INVALID_COMMUNITY_ROUTE")

  await page.keyboard.press("Tab")
  const focus = await page.evaluate(() => {
    const element = document.activeElement
    const style = element ? getComputedStyle(element) : null
    return { tagName: element?.tagName, outlineStyle: style?.outlineStyle, outlineWidth: style?.outlineWidth }
  })
  expect(focus.tagName).toBe("A")
  expect(focus.outlineStyle).toBe("solid")
  expect(Number.parseFloat(focus.outlineWidth ?? "0")).toBeGreaterThanOrEqual(3)

  const contrastSamples = await page.evaluate(() => {
    const scan = () => {
      const backgroundFor = (element: Element): string => {
        let current: Element | null = element
        while (current) {
          const color = getComputedStyle(current).backgroundColor
          if (!color.endsWith(", 0)") && color !== "transparent") return color
          current = current.parentElement
        }
        return getComputedStyle(document.documentElement).backgroundColor
      }
      return ["h1", ".community-page-header > p:last-child", ".community-eyebrow", ".community-back-link"].map((selector) => {
        const element = document.querySelector(selector)
        if (!element) throw new Error(`Missing contrast sample: ${selector}`)
        return { selector, foreground: getComputedStyle(element).color, background: backgroundFor(element) }
      })
    }
    const light = scan()
    document.documentElement.dataset.theme = "dark"
    const dark = scan()
    document.documentElement.removeAttribute("data-theme")
    return { light, dark }
  })
  for (const sample of [...contrastSamples.light, ...contrastSamples.dark]) {
    expect(contrast(sample.foreground, sample.background), `${sample.selector} ${sample.foreground} on ${sample.background}`).toBeGreaterThanOrEqual(4.5)
  }
})
