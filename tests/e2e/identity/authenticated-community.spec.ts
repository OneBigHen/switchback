import { expect, test } from "@playwright/test"

test("authenticated browser can publish a sanitized route, link sync, and unpublish", async ({ browser, browserName }, testInfo) => {
  test.skip(browserName !== "chromium", "Playwright virtual WebAuthn coverage runs in Chromium")
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
  await context.credentials.install()
  const page = await context.newPage()
  await page.goto("/")
  // OpenGravel ID sits behind Settings' single advanced entry point. The old
  // click into the far corner of the nav button opened the panel directly in
  // V1; in V2 it just lands on the Settings destination, so walk the route a
  // rider actually walks.
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByRole("button", { name: "Account, sync & data" }).click()
  const createButton = page.getByRole("button", { name: "Create OpenGravel ID" })
  await createButton.click()
  // The outcome the rider is told about, not the retired V1 `.profile-notice`
  // hook: the panel reports registration through a live status region.
  // Registration is two round trips (passkey attestation, then session link),
  // so hold it to the same budget the rest of the suite gives network-backed
  // waits rather than the 5s default this assertion inherited.
  await expect(page.getByRole("dialog", { name: "Account, sync & rider data" }).getByRole("status"))
    .toContainText(/OpenGravel ID ready/, { timeout: 15_000 })

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
