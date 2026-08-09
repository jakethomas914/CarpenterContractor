"use strict";

const { test, expect } = require("@playwright/test");

test.describe("Homepage", () => {
  test("loads with the expected title and hero content", async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    const response = await page.goto("/index.html");
    expect(response.status()).toBe(200);

    await expect(page).toHaveTitle(/Southwest Florida Carpenter/);
    await expect(page.locator("h1")).toContainText("Custom Carpentry");

    expect(consoleErrors).toEqual([]);
  });

  test("has no more than one h1 and a sane heading hierarchy", async ({ page }) => {
    await page.goto("/index.html");
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBe(1);

    const h2Count = await page.locator("h2").count();
    expect(h2Count).toBeGreaterThan(0);
  });

  test("every image and inline svg icon has appropriate alt/aria handling", async ({ page }) => {
    await page.goto("/index.html");

    const imgs = page.locator("img");
    const imgCount = await imgs.count();
    for (let i = 0; i < imgCount; i++) {
      await expect(imgs.nth(i)).toHaveAttribute("alt", /.*/);
    }

    // Decorative inline icons should be hidden from the accessibility tree.
    const decorativeSvgCount = await page.locator("svg[aria-hidden='true']").count();
    expect(decorativeSvgCount).toBeGreaterThan(0);
  });

  test("primary nav anchor links scroll to the matching section", async ({ page }) => {
    // The nav links are hidden inside the collapsed mobile menu below the
    // header's responsive breakpoint, so this test always runs at a
    // desktop viewport regardless of the Playwright project's default.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/index.html");

    await page.locator(".nav-links a[href='#services']").click();
    await expect(page.locator("#services")).toBeInViewport();

    await page.locator(".nav-links a[href='#about']").click();
    await expect(page.locator("#about")).toBeInViewport();
  });

  test("call-to-action buttons point to tel: and the contact page", async ({ page }) => {
    await page.goto("/index.html");

    await expect(page.locator('.hero-actions a[href="contact.html"]')).toHaveText(/Request a Free Quote/);
    await expect(page.locator('.hero-actions a[href="tel:+12394402416"]')).toHaveCount(1);
  });

  test("service cards render all six expected services", async ({ page }) => {
    await page.goto("/index.html");
    const cards = page.locator(".service-card");
    await expect(cards).toHaveCount(6);
  });

  test("gallery and testimonials are clearly marked as placeholder content", async ({ page }) => {
    await page.goto("/index.html");

    await expect(page.locator(".placeholder-note")).toContainText(/placeholder/i);
    const sampleBadges = page.locator(".sample-badge");
    expect(await sampleBadges.count()).toBeGreaterThan(0);
  });

  test("footer year is the current year and license/placeholder text is present", async ({ page }) => {
    await page.goto("/index.html");
    const year = new Date().getFullYear().toString();
    await expect(page.locator("[data-current-year]")).toHaveText(year);
    await expect(page.locator(".footer-bottom")).toContainText("[Business Name]");
  });

  test("internal links resolve without 404s", async ({ page, request }) => {
    await page.goto("/index.html");
    const hrefs = await page.locator("a[href]").evaluateAll((links) =>
      links
        .map((a) => a.getAttribute("href"))
        .filter((href) => href && !href.startsWith("#") && !href.startsWith("tel:") && !href.startsWith("mailto:"))
    );

    const uniqueHrefs = [...new Set(hrefs)];
    for (const href of uniqueHrefs) {
      const response = await request.get(new URL(href, "http://127.0.0.1:4173/index.html").toString());
      expect.soft(response.status(), `expected ${href} to resolve`).toBeLessThan(400);
    }
  });

  test("mobile menu opens and closes on a small viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/index.html");

    const nav = page.locator(".primary-nav");
    const toggle = page.locator(".nav-toggle");

    await expect(nav).not.toHaveClass(/is-open/);
    await toggle.click();
    await expect(nav).toHaveClass(/is-open/);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.locator(".nav-links a", { hasText: "Services" }).click();
    await expect(nav).not.toHaveClass(/is-open/);
  });

  test("does not trigger any Content-Security-Policy violations", async ({ page }) => {
    const cspViolations = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) {
        cspViolations.push(msg.text());
      }
    });

    await page.goto("/index.html");
    await page.waitForLoadState("networkidle");

    expect(cspViolations).toEqual([]);
  });
});
