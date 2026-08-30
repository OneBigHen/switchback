import { expect, test } from "@playwright/test"

test("authenticated browser can publish a sanitized route, link sync, and unpublish", async ({ browser, browserName }, testInfo) => {
  test.skip(browserName !== "chromium", "Playwright virtual WebAuthn coverage runs in Chromium")
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
  await context.credentials.install()
  const page = await context.newPage()
  await page.goto("/")
  const settingsButton = page.getByRole("button", { name: "Settings", exact: true })
  const settingsBox = await settingsButton.boundingBox()
  expect(settingsBox).not.toBeNull()
  await settingsButton.click({ position: { x: (settingsBox?.width ?? 1) - 8, y: (settingsBox?.height ?? 1) / 2 } })
  const createButton = page.getByRole("button", { name: "Create Switchback ID" })
  await createButton.evaluate((element) => (element as HTMLButtonElement).click())
  await expect(page.locator(".profile-notice")).toContainText(/Switchback ID ready/)

  const result = await page.evaluate(async () => {
    const csrf = document.cookie.match(/(?:^|;\s*)switchback_csrf=([^;]+)/)?.[1] ?? ""
    const headers = { "content-type": "application/json", "x-switchback-csrf": csrf }
    const publication = await fetch("/api/community/routes", {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify({
        title: "Browser preview",
        description: "Authenticated browser smoke",
        routeFingerprint: "a".repeat(64),
        stats: { distanceMiles: 2, durationMinutes: 12 },
        provenanceClass: "rider-recorded",
        visibility: "unlisted",
        preview: {
          geometry: [[[-76.9, 40.2], [-76.8, 40.3]]],
          distanceMiles: 2,
          durationMinutes: 12,
          exactPreviewRequired: true
        }
      })
    })
    const publicationBody = await publication.json() as { routeId?: string }
    const link = await fetch("/api/sync/link", {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify({ namespaceId: `ns-${crypto.randomUUID()}` })
    })
    const unpublish = publicationBody.routeId
      ? await fetch(`/api/community/routes/${publicationBody.routeId}`, { method: "DELETE", credentials: "same-origin", headers })
      : null
    return { publicationStatus: publication.status, routeId: publicationBody.routeId, linkStatus: link.status, unpublishStatus: unpublish?.status ?? 0 }
  })

  expect(result.publicationStatus).toBe(201)
  expect(result.routeId).toMatch(/^route-/)
  expect(result.linkStatus).toBe(200)
  expect(result.unpublishStatus).toBe(200)
  await context.close()
})
