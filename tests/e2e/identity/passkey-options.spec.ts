import { expect, test } from "@playwright/test"

test("passkey options are bounded and unauthenticated mutations fail closed", async ({ page, request }) => {
  await page.goto("/")
  await expect(page.getByRole("form", { name: "Ride request" })).toBeVisible()
  const browserSupport = await page.evaluate(() => typeof PublicKeyCredential !== "undefined")
  expect(browserSupport).toBe(true)
  const settingsButton = page.getByRole("button", { name: "Settings", exact: true })
  const settingsBox = await settingsButton.boundingBox()
  expect(settingsBox).not.toBeNull()
  await settingsButton.click({ position: { x: (settingsBox?.width ?? 1) - 8, y: (settingsBox?.height ?? 1) / 2 } })
  await expect(page.getByRole("button", { name: "Create Switchback ID" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Use existing passkey" })).toBeVisible()

  const options = await request.post("/api/identity/authenticate/options", { data: {} })
  expect(options.status()).toBe(200)
  const optionsBody = await options.json() as { challengeId: string; options: { challenge: string; rpId?: string } }
  expect(optionsBody.challengeId).toMatch(/^challenge-/)
  expect(optionsBody.options.challenge).toMatch(/^[A-Za-z0-9_-]{32,}$/)
  expect(optionsBody.options.rpId).toBe("localhost")

  const communityMutation = await request.post("/api/community/routes", { data: {} })
  expect(communityMutation.status()).toBe(401)
  expect((await communityMutation.json()).error.code).toBe("AUTH_REQUIRED")

  const syncMutation = await request.post("/api/sync", { data: {} })
  expect(syncMutation.status()).toBe(401)
  expect((await syncMutation.json()).error.code).toBe("AUTH_REQUIRED")
})
