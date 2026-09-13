import { expect, test } from "@playwright/test";

// Recon critical coverage: the Labs explorer opens, a route preview loads
// into the HUD, the focused deep link resolves the same ride, and neither
// surface leaks console errors or horizontal overflow.
//
// Recorded rides live in the browser's own ride journal (IndexedDB), which a
// fresh Playwright profile does not populate; the catalog Route Library
// fixture (`GPX_LIBRARY_PATH=tests/fixtures/route-library`) is the trusted
// server-side data source for these specs.

function collectConsoleErrors(page: import("@playwright/test").Page): {
  consoleErrors: string[];
  pageErrors: string[];
} {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });
  return { consoleErrors, pageErrors };
}

async function expectNoOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("recon explorer opens with map, picker sections, no overflow and no console errors", async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = collectConsoleErrors(page);

  await page.goto("/labs/recon");
  const canvas = page.locator("canvas.maplibregl-canvas").first();
  await expect(canvas).toBeVisible({ timeout: 60_000 });

  await expect(page.getByText("Recorded rides", { exact: true })).toBeVisible();
  await expect(page.getByText("Route previews", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recon" })).toBeVisible();

  await expectNoOverflow(page);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("a route preview loads from the picker into the HUD", async ({
  page,
  request,
}) => {
  const { consoleErrors, pageErrors } = collectConsoleErrors(page);

  const response = await request.get("/api/gpx-library");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    routes?: { id: string; name: string }[];
  };
  const route = body.routes?.[0];
  expect(route).toBeDefined();

  await page.goto("/labs/recon");
  const canvas = page.locator("canvas.maplibregl-canvas").first();
  await expect(canvas).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: route!.name }).first().click();
  await expect(page.getByRole("heading", { name: route!.name })).toBeVisible({
    timeout: 60_000,
  });
  // Previews show distance in miles and never a clock.
  await expect(page.locator(".recon-hud-meta")).toContainText("mi", {
    timeout: 30_000,
  });
  await expect(page.locator(".recon-hud-eyebrow")).toHaveText("Route preview");

  // The Explorer is dimensional by contract: the fitted camera holds the
  // 55–65° pitch band, read through the planner-style debug seam.
  await expect
    .poll(() => page.evaluate(() => window.__reconMapDebug?.getPitch() ?? 0), {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(45);

  await expectNoOverflow(page);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("the focused ride view deep-links to the same route", async ({
  page,
  request,
}) => {
  const { consoleErrors, pageErrors } = collectConsoleErrors(page);

  const response = await request.get("/api/gpx-library");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    routes?: { id: string; name: string }[];
  };
  const route = body.routes?.[0];
  expect(route).toBeDefined();

  await page.goto(`/labs/recon/replay/${encodeURIComponent(route!.id)}`);
  const canvas = page.locator("canvas.maplibregl-canvas").first();
  await expect(canvas).toBeVisible({ timeout: 60_000 });

  await expect(page.getByRole("heading", { name: route!.name })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("link", { name: "← All rides" })).toBeVisible();

  await expectNoOverflow(page);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
