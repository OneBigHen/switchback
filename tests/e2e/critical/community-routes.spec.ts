import { expect, test } from "@playwright/test"

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
})
