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

  test("lead-field id and name attributes stay paired (labels ↔ FormData keys)", () => {
    // label[for] targets id; FormData uses name. Splitting them leaves accessible
    // labels while mailto/Netlify receive blank or wrong keys.
    for (const id of ["name", "email", "phone", "service", "message"]) {
      const control = contactHtml.match(
        new RegExp(`<(?:input|select|textarea)\\b[^>]*\\bid="${id}"[^>]*>`, "i")
      );
      expect(control).toBeTruthy();
      expect(control[0]).toMatch(new RegExp(`\\bname="${id}"`, "i"));
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

  test("name field stays type=text (not email/tel/hidden) for HTML5 name entry", () => {
    // Wrong type breaks autocomplete=name and mobile keyboards; type=hidden
    // would drop the lead name from visible validation entirely.
    expect(contactHtml).toMatch(/<input\b[^>]*type="text"[^>]*id="name"/i);
  });

  test("Netlify form-name field stays type=hidden so it is not editable chrome", () => {
    // A visible form-name input confuses visitors and risks renaming the Netlify
    // form away from name="contact" / form-name value pairing.
    expect(contactHtml).toMatch(
      /<input\b[^>]*(?:type="hidden"[^>]*name="form-name"|name="form-name"[^>]*type="hidden")/i
    );
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

  test("active-nav and scroll-reveal keep the README selector + observer contracts", () => {
    // README documents these exact selectors/options. Softening them (e.g. observing
    // all sections, or dropping rootMargin) silently changes highlighting and reveal timing.
    const mainJs = fs.readFileSync(path.join(root, "js/main.js"), "utf8");
    expect(mainJs).toMatch(/querySelectorAll\(\s*["']main section\[id\]["']\s*\)/);
    expect(mainJs).toMatch(
      /querySelectorAll\(\s*["']\.nav-links a\[href\^='#']["']\s*\)/
    );
    expect(mainJs).toMatch(/threshold:\s*0\.12/);
    expect(mainJs).toMatch(/rootMargin:\s*["']0px 0px -60px 0px["']/);
    expect(mainJs).toMatch(/rootMargin:\s*["']-45% 0px -50% 0px["']/);
  });

  test("mobile nav closes on every primary-nav anchor (not only .nav-links)", () => {
    // Quote CTA + tel: live under .nav-cta inside .primary-nav. Wiring only
    // `.nav-links a` would leave the overlay open after those clicks on mobile.
    const mainJs = fs.readFileSync(path.join(root, "js/main.js"), "utf8");
    const mobileNav = mainJs.match(/function initMobileNav\(\)\s*\{[\s\S]*?\n  \}\n/);
    expect(mobileNav).toBeTruthy();
    expect(mobileNav[0]).toMatch(/primaryNav\.querySelectorAll\(\s*["']a["']\s*\)/);
    expect(mobileNav[0]).not.toMatch(/querySelectorAll\(\s*["']\.nav-links a["']/);
  });

  test("active-nav sets aria-current to the token true (not page/location)", () => {
    // Integration tests assert the attribute appears; locking the source token
    // prevents a "cleanup" to aria-current="page" that would desync AT announcements
    // from the documented README contract without failing selector checks.
    const mainJs = fs.readFileSync(path.join(root, "js/main.js"), "utf8");
    expect(mainJs).toMatch(/setAttribute\(\s*["']aria-current["']\s*,\s*["']true["']\s*\)/);
    expect(mainJs).toMatch(/removeAttribute\(\s*["']aria-current["']\s*\)/);
  });

  test("active-nav keeps observing sections (does not unobserve after first hit)", () => {
    // Scroll-reveal unobserves once visible. Active-nav must keep observing so
    // scrolling back to a prior section still updates aria-current.
    const mainJs = fs.readFileSync(path.join(root, "js/main.js"), "utf8");
    const activeNav = mainJs.match(
      /function initActiveNavHighlight\(\)\s*\{[\s\S]*?\n  \}\n/
    );
    expect(activeNav).toBeTruthy();
    expect(activeNav[0]).not.toMatch(/\.unobserve\s*\(/);
    expect(mainJs).toMatch(/observer\.unobserve\s*\(\s*entry\.target\s*\)/);
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

  test("nav toggle starts collapsed with aria-expanded=false on both pages", () => {
    // initMobileNav toggles this attribute; a wrong initial value lies to AT users
    // before the first click and can desync the open/closed state.
    for (const html of [indexHtml, contactHtml]) {
      expect(html).toMatch(
        /<button\b[^>]*\bclass="[^"]*\bnav-toggle\b[^"]*"[^>]*\baria-expanded="false"/s
      );
    }
  });

  test("data-form-status element keeps form-status class and role=status", () => {
    const statusEl = contactHtml.match(/<[^>]*\bdata-form-status\b[^>]*>/);
    expect(statusEl).toBeTruthy();
    expect(statusEl[0]).toMatch(/\bclass="[^"]*\bform-status\b/);
    expect(statusEl[0]).toMatch(/\brole="status"/);
  });

  test("marks lead-capture cards with data-reveal (contact info + quote form)", () => {
    // Both cards use scroll-reveal. CSS currently hides [data-reveal] until
    // .is-visible — a blocked/missing main.js leaves the quote form invisible.
    // Locking the hooks documents that dependency so reveal CSS changes stay deliberate.
    expect(contactHtml).toMatch(/contact-info-card"[^>]*data-reveal/);
    expect(contactHtml).toMatch(/contact-form-card"[^>]*data-reveal/);
  });

  test("contact form keeps native HTML5 validation (no novalidate)", () => {
    // e2e and lead quality rely on required/email/tel constraints. novalidate
    // would let empty submissions reach mailto/Netlify without browser checks.
    const formOpen = contactHtml.match(/<form\b[^>]*data-contact-form[^>]*>/i);
    expect(formOpen).toBeTruthy();
    expect(formOpen[0]).not.toMatch(/\bnovalidate\b/i);
  });

  test("main.js script tags are not deferred or async (init runs after body hooks)", () => {
    // async/defer can race ahead of DOM parsing or reorder after body hooks.
    // Combined with end-of-body placement, a plain sync script is required.
    for (const html of [indexHtml, contactHtml]) {
      const scriptTag = html.match(/<script\b[^>]*\bsrc="js\/main\.js"[^>]*>/i);
      expect(scriptTag).toBeTruthy();
      expect(scriptTag[0]).not.toMatch(/\bdefer\b/i);
      expect(scriptTag[0]).not.toMatch(/\basync\b/i);
    }
  });
});
