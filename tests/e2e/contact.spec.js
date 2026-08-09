"use strict";

const { test, expect } = require("@playwright/test");

test.describe("Contact page", () => {
  test("loads with the expected title and heading", async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    const response = await page.goto("/contact.html");
    expect(response.status()).toBe(200);

    await expect(page).toHaveTitle(/Contact Us/);
    await expect(page.locator("h1")).toHaveText("Get in Touch");

    expect(consoleErrors).toEqual([]);
  });

  test("all form fields are present, labeled, and fillable", async ({ page }) => {
    await page.goto("/contact.html");

    const name = page.locator("#name");
    const phone = page.locator("#phone");
    const email = page.locator("#email");
    const service = page.locator("#service");
    const message = page.locator("#message");

    await expect(page.locator('label[for="name"]')).toHaveText("Full Name");
    await expect(page.locator('label[for="phone"]')).toHaveText("Phone Number");
    await expect(page.locator('label[for="email"]')).toHaveText("Email Address");
    await expect(page.locator('label[for="message"]')).toHaveText("Tell Us About Your Project");

    await name.fill("Jane Doe");
    await phone.fill("239-555-0100");
    await email.fill("jane@example.com");
    await service.selectOption({ label: "Kitchen & Bath Remodel" });
    await message.fill("I'd like a quote for a kitchen remodel.");

    await expect(name).toHaveValue("Jane Doe");
    await expect(phone).toHaveValue("239-555-0100");
    await expect(email).toHaveValue("jane@example.com");
    await expect(message).toHaveValue("I'd like a quote for a kitchen remodel.");
  });

  test("required fields block submission when empty (native HTML5 validation)", async ({ page }) => {
    await page.goto("/contact.html");

    await page.locator("button[type='submit']").click();

    const isNameInvalid = await page.locator("#name").evaluate((el) => !el.checkValidity());
    expect(isNameInvalid).toBe(true);
  });

  test("submitting a valid form shows a confirmation status message", async ({ page }) => {
    // The exact mailto: URL construction is covered by unit tests
    // (tests/unit/main.test.js). This end-to-end test verifies the
    // user-visible outcome: the form doesn't error out and the status
    // message appears after a successful submission attempt.
    await page.goto("/contact.html");

    await page.fill("#name", "Jane Doe");
    await page.fill("#phone", "239-555-0100");
    await page.fill("#email", "jane@example.com");
    await page.fill("#message", "I'd like a quote for a kitchen remodel.");

    await page.locator("button[type='submit']").click();

    await expect(page.locator("[data-form-status]")).toHaveClass(/is-visible/);
    await expect(page.locator("[data-form-status]")).not.toBeEmpty();

    // Submitting a mailto: form should never navigate the tab itself away
    // from the contact page.
    expect(page.url()).toContain("contact.html");
  });

  test("phone and email contact links use tel:/mailto: schemes", async ({ page }) => {
    await page.goto("/contact.html");

    await expect(page.locator(".contact-info-list a[href^='tel:']").first()).toHaveAttribute(
      "href",
      "tel:+12394402416"
    );
    await expect(page.locator(".contact-info-list a[href^='mailto:']").first()).toHaveAttribute(
      "href",
      "mailto:info@example.com"
    );
  });

  test("mobile viewport renders the contact form usably", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/contact.html");

    await expect(page.locator(".contact-form-card")).toBeVisible();
    await expect(page.locator("#name")).toBeVisible();
  });
});
