import { expect, test } from "../fixtures"
import { expectRealScrollOwner } from "../assertions"

test("scroll owner contract uses the supported interaction for this engine", async ({ page, mobileQa }) => {
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>#scroll{width:250px;height:120px;overflow:auto}#content{height:900px}</style><div id="scroll"><div id="content">owner</div></div>')
  await expectRealScrollOwner(page, "#scroll")
  const result = await page.locator("#scroll").evaluate((element) => ({ scrollTop: element.scrollTop, maximum: element.scrollHeight - element.clientHeight }))
  expect(mobileQa.engine).toMatch(/^(webkit|chromium)$/)
  expect(result.scrollTop).toBe(result.maximum)
  expect(result.scrollTop).toBeGreaterThan(0)
})
