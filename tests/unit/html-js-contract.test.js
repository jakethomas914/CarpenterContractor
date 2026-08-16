"use strict";

/**
 * Guards the JS ↔ HTML contract documented in README.md.
 * Renaming these hooks without updating js/main.js silently disables features.
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "../..");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const contactHtml = fs.readFileSync(path.join(root, "contact.html"), "utf8");

describe("JS ↔ HTML contract (index.html)", () => {
  test("exposes mobile nav toggle hooks", () => {
    expect(indexHtml).toMatch(/class="[^"]*\bnav-toggle\b/);
    expect(indexHtml).toMatch(/class="[^"]*\bprimary-nav\b/);
    expect(indexHtml).toMatch(/aria-expanded=/);
  });

  test("exposes footer year and scroll-reveal hooks", () => {
    expect(indexHtml).toMatch(/data-current-year/);
    expect(indexHtml).toMatch(/data-reveal/);
  });

  test("exposes in-page sections and hash nav links for active highlighting", () => {
    for (const id of ["services", "about", "gallery", "testimonials", "service-area"]) {
      expect(indexHtml).toContain(`id="${id}"`);
      expect(indexHtml).toContain(`href="#${id}"`);
    }
  });
});

describe("JS ↔ HTML contract (contact.html)", () => {
  test("exposes the contact form hooks required by initContactForm", () => {
    expect(contactHtml).toMatch(/data-contact-form/);
    expect(contactHtml).toMatch(/data-recipient=/);
    expect(contactHtml).toMatch(/data-form-status/);
  });

  test("includes the named fields buildMailtoUrl reads from FormData", () => {
    for (const name of ["name", "email", "phone", "service", "message"]) {
      expect(contactHtml).toMatch(new RegExp(`name="${name}"`));
    }
  });

  test("marks lead fields required and email as type=email for HTML5 validation", () => {
    for (const id of ["name", "phone", "email", "message"]) {
      expect(contactHtml).toMatch(
        new RegExp(`<(input|textarea)\\b[^>]*id="${id}"[^>]*\\brequired\\b`, "i")
      );
    }
    expect(contactHtml).toMatch(/<input\b[^>]*type="email"[^>]*id="email"/i);
  });

  test("pairs every lead-field label[for] with a matching control id", () => {
    for (const id of ["name", "phone", "email", "service", "message"]) {
      expect(contactHtml).toMatch(new RegExp(`<label\\b[^>]*\\bfor="${id}"`, "i"));
      expect(contactHtml).toMatch(
        new RegExp(`<(input|select|textarea)\\b[^>]*\\bid="${id}"`, "i")
      );
    }
  });

  test("keeps Netlify Forms attributes that the mailto path must ignore", () => {
    expect(contactHtml).toMatch(/data-netlify="true"/);
    expect(contactHtml).toMatch(/netlify-honeypot="bot-field"/);
    expect(contactHtml).toMatch(/name="form-name"/);
    expect(contactHtml).toMatch(/name="bot-field"/);
  });

  test("shares mobile nav and footer year hooks with the homepage", () => {
    expect(contactHtml).toMatch(/class="[^"]*\bnav-toggle\b/);
    expect(contactHtml).toMatch(/class="[^"]*\bprimary-nav\b/);
    expect(contactHtml).toMatch(/data-current-year/);
  });
});

describe("JS ↔ HTML contract (shared wiring)", () => {
  test("both pages load js/main.js", () => {
    expect(indexHtml).toMatch(/<script\s+src="js\/main\.js"><\/script>/);
    expect(contactHtml).toMatch(/<script\s+src="js\/main\.js"><\/script>/);
  });

  test("nav toggle is wired to primary-nav via aria-controls and id", () => {
    for (const html of [indexHtml, contactHtml]) {
      expect(html).toMatch(/class="[^"]*\bnav-toggle\b[^"]*"[^>]*aria-controls="primary-nav"/s);
      expect(html).toMatch(/class="[^"]*\bprimary-nav\b[^"]*"[^>]*\bid="primary-nav"/s);
    }
  });
});
