"use strict";

const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

test.describe("Accessibility (axe-core)", () => {
  for (const url of ["/index.html", "/contact.html"]) {
    test(`${url} has no critical or serious automated accessibility violations`, async ({ page }) => {
      // Disable the scroll-reveal opacity transition (respecting
      // prefers-reduced-motion, same as real users who set this OS
      // preference) so axe measures final rendered colors rather than an
      // in-flight fade frame, which otherwise produces false-positive
      // color-contrast violations.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(url);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      const seriousOrCritical = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));

      if (seriousOrCritical.length) {
        console.log(JSON.stringify(seriousOrCritical, null, 2));
      }

      expect(seriousOrCritical).toEqual([]);
    });
  }
});
