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

  test("homepage primary nav uses bare #hashes so initActiveNavHighlight can match them", () => {
    // initActiveNavHighlight selects `.nav-links a[href^='#']`. Prefixed
    // hrefs like `index.html#services` would silently disable highlighting.
    const navBlock = indexHtml.match(/class="nav-links"[\s\S]*?<\/ul>/)[0];
    const hrefs = [...navBlock.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("#")).toBe(true);
      expect(href.includes("index.html")).toBe(false);
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

  test("phone field uses type=tel so mobile browsers offer a dial pad", () => {
    expect(contactHtml).toMatch(/<input\b[^>]*type="tel"[^>]*id="phone"/i);
  });

  test("data-form-status lives inside the contact form (initContactForm scopes to it)", () => {
    const form = contactHtml.match(/<form\b[^>]*data-contact-form[\s\S]*?<\/form>/i);
    expect(form).toBeTruthy();
    expect(form[0]).toMatch(/data-form-status/);
  });

  test("contact form has no absolute action URL (Netlify posts to the page; mailto uses JS)", () => {
    const formOpen = contactHtml.match(/<form\b[^>]*data-contact-form[^>]*>/i);
    expect(formOpen).toBeTruthy();
    expect(formOpen[0]).not.toMatch(/\baction\s*=\s*["']https?:/i);
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

  test("contact primary nav uses index.html# targets (not bare hashes)", () => {
    // Bare #hashes on contact would scroll nowhere useful and would also
    // accidentally activate initActiveNavHighlight without matching sections.
    const navBlock = contactHtml.match(/class="nav-links"[\s\S]*?<\/ul>/)[0];
    const hrefs = [...navBlock.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("index.html#")).toBe(true);
    }
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

  test("init() keeps initContactForm wired (default mailto mode per README runbook)", () => {
    // Removing this call is the documented switch to Netlify Forms. Leaving both
    // active silently breaks Netlify; removing it without intending to breaks mailto.
    const mainJs = fs.readFileSync(path.join(root, "js/main.js"), "utf8");
    const initBody = mainJs.match(/function init\(\)\s*\{([\s\S]*?)\n\s*\}/);
    expect(initBody).toBeTruthy();
    expect(initBody[1]).toMatch(/initContactForm\s*\(\s*\)\s*;/);
  });

  test("init() still wires every DOM feature entry point", () => {
    // Dropping any of these from init() silently disables the feature while leaving
    // the function and HTML hooks intact — a common "safe cleanup" regression.
    const mainJs = fs.readFileSync(path.join(root, "js/main.js"), "utf8");
    const initBody = mainJs.match(/function init\(\)\s*\{([\s\S]*?)\n\s*\}/);
    expect(initBody).toBeTruthy();
    for (const call of [
      "initMobileNav",
      "initFooterYear",
      "initScrollReveal",
      "initContactForm",
      "initActiveNavHighlight",
    ]) {
      expect(initBody[1]).toMatch(new RegExp(`${call}\\s*\\(\\s*\\)\\s*;`));
    }
  });

  test("nav toggle is type=button with an accessible name on both pages", () => {
    // type=submit (the HTML default for button) inside a form would POST; an
    // unlabeled toggle also fails basic a11y checks the e2e suite relies on.
    for (const html of [indexHtml, contactHtml]) {
      expect(html).toMatch(
        /<button\b[^>]*\bclass="[^"]*\bnav-toggle\b[^"]*"[^>]*\btype="button"[^>]*\baria-label="[^"]+"/s
      );
    }
  });
});
