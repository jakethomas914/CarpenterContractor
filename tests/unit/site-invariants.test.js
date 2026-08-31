"use strict";

/**
 * Cross-file business invariants that silently break lead capture or discovery
 * when placeholders drift between pages/config (documented in README runbooks).
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "../..");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const contactHtml = fs.readFileSync(path.join(root, "contact.html"), "utf8");
const robotsTxt = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
const sitemapXml = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const stylesCss = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");

function collectMatches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1] ?? match[0]);
}

function decodeBasicEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractFooterBottom(html) {
  const match = html.match(/<div class="footer-bottom">([\s\S]*?)<\/div>/);
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

function extractNavCtaBlock(html) {
  const match = html.match(/<div class="nav-cta">([\s\S]*?)<\/div>/);
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

describe("lead-capture contact identity consistency", () => {
  test("form data-recipient matches every mailto: address on both pages", () => {
    const recipientMatch = contactHtml.match(/data-recipient="([^"]+)"/);
    expect(recipientMatch).toBeTruthy();
    const recipient = recipientMatch[1];

    const mailtoAddresses = [
      ...collectMatches(indexHtml, /href="mailto:([^"]+)"/g),
      ...collectMatches(contactHtml, /href="mailto:([^"]+)"/g),
    ];
    expect(mailtoAddresses.length).toBeGreaterThan(0);
    for (const address of mailtoAddresses) {
      expect(address).toBe(recipient);
    }
  });

  test("JSON-LD email matches the contact form recipient", () => {
    const recipient = contactHtml.match(/data-recipient="([^"]+)"/)[1];
    const jsonLd = indexHtml.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );
    expect(jsonLd).toBeTruthy();
    const data = JSON.parse(jsonLd[1]);
    expect(data.email).toBe(recipient);
  });

  test("every tel: link uses the same business phone number", () => {
    const tels = [
      ...collectMatches(indexHtml, /href="(tel:[^"]+)"/g),
      ...collectMatches(contactHtml, /href="(tel:[^"]+)"/g),
    ];
    expect(tels.length).toBeGreaterThan(0);
    const unique = [...new Set(tels)];
    expect(unique).toEqual(["tel:+12394402416"]);
  });

  test("JSON-LD telephone matches the shared tel: href digits", () => {
    const jsonLd = indexHtml.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );
    const data = JSON.parse(jsonLd[1]);
    expect(data.telephone.replace(/\D/g, "")).toBe("12394402416");
  });
});

describe("discovery / SEO file consistency", () => {
  const siteOrigin = "https://www.example.com";

  test("robots.txt allows crawling and points at sitemap.xml", () => {
    expect(robotsTxt).toMatch(/User-agent:\s*\*/i);
    expect(robotsTxt).toMatch(/Allow:\s*\//i);
    expect(robotsTxt).toMatch(/Sitemap:\s*https:\/\/www\.example\.com\/sitemap\.xml/i);
  });

  test("sitemap.xml lists the homepage and contact page", () => {
    expect(sitemapXml).toContain(`${siteOrigin}/`);
    expect(sitemapXml).toContain(`${siteOrigin}/contact.html`);
  });

  test("sitemap keeps homepage priority above the contact page", () => {
    // Soft signal for crawlers; accidental inversion after content edits is
    // easy and never caught by loc↔disk checks alone.
    const urls = [
      ...sitemapXml.matchAll(
        /<url>\s*<loc>\s*([^<]+?)\s*<\/loc>[\s\S]*?<priority>\s*([^<]+?)\s*<\/priority>/g
      ),
    ].map((match) => ({ loc: match[1].trim(), priority: Number(match[2].trim()) }));
    const home = urls.find((u) => u.loc === `${siteOrigin}/` || u.loc === `${siteOrigin}`);
    const contact = urls.find((u) => u.loc === `${siteOrigin}/contact.html`);
    expect(home).toBeTruthy();
    expect(contact).toBeTruthy();
    expect(home.priority).toBeGreaterThan(contact.priority);
  });

  test("sitemap locks exact priority and changefreq tokens for listed URLs", () => {
    // Comparative priority alone still passes if both drop to 0.1 or changefreq
    // becomes "never" — crawler soft signals the README launch checklist expects.
    const urls = [
      ...sitemapXml.matchAll(
        /<url>\s*<loc>\s*([^<]+?)\s*<\/loc>\s*<changefreq>\s*([^<]+?)\s*<\/changefreq>\s*<priority>\s*([^<]+?)\s*<\/priority>/g
      ),
    ].map((match) => ({
      loc: match[1].trim(),
      changefreq: match[2].trim(),
      priority: match[3].trim(),
    }));
    const home = urls.find((u) => u.loc === `${siteOrigin}/` || u.loc === `${siteOrigin}`);
    const contact = urls.find((u) => u.loc === `${siteOrigin}/contact.html`);
    expect(home).toEqual({
      loc: `${siteOrigin}/`,
      changefreq: "monthly",
      priority: "1.0",
    });
    expect(contact).toEqual({
      loc: `${siteOrigin}/contact.html`,
      changefreq: "monthly",
      priority: "0.8",
    });
  });

  test("robots.txt does not disallow the whole site", () => {
    // Allow:/ plus a Sitemap line can coexist with Disallow:/ which blocks
    // indexing entirely — a common "secure the staging site" leftover.
    expect(robotsTxt).not.toMatch(/^\s*Disallow:\s*\/\s*$/im);
  });

  test("canonical URLs on each page match the sitemap locs", () => {
    expect(indexHtml).toMatch(/rel="canonical" href="https:\/\/www\.example\.com\/"/);
    expect(contactHtml).toMatch(
      /rel="canonical" href="https:\/\/www\.example\.com\/contact\.html"/
    );
  });

  test("Open Graph URL and JSON-LD url share the same site origin as discovery files", () => {
    const jsonLd = indexHtml.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );
    const data = JSON.parse(jsonLd[1]);
    const ogUrl = indexHtml.match(/property="og:url"\s+content="([^"]+)"/);

    expect(ogUrl).toBeTruthy();
    expect(ogUrl[1]).toBe(`${siteOrigin}/`);
    expect(data.url).toBe(`${siteOrigin}/`);
    expect(robotsTxt).toContain(`${siteOrigin}/sitemap.xml`);
  });

  test("robots Sitemap URL origin matches the homepage canonical origin", () => {
    // Hardcoded example.com checks can drift independently of the live canonical.
    // Crawlers that follow robots to a different host miss the real sitemap.
    const canonical = indexHtml.match(/rel="canonical"\s+href="([^"]+)"/)?.[1];
    expect(canonical).toBeTruthy();
    const canonicalOrigin = new URL(canonical).origin;
    const sitemapLine = robotsTxt.match(/Sitemap:\s*(\S+)/i)?.[1];
    expect(sitemapLine).toBeTruthy();
    expect(new URL(sitemapLine).origin).toBe(canonicalOrigin);
    expect(sitemapLine).toBe(`${canonicalOrigin}/sitemap.xml`);
  });

  test("Open Graph title stays aligned with the homepage document title", () => {
    const title = indexHtml.match(/<title>([^<]+)<\/title>/)[1];
    const ogTitle = indexHtml.match(/property="og:title"\s+content="([^"]+)"/)[1];
    expect(decodeBasicEntities(ogTitle)).toBe(decodeBasicEntities(title));
  });
});

describe("shared chrome parity (header/footer drift)", () => {
  test("nav CTA phone + quote links stay identical across both pages", () => {
    expect(extractNavCtaBlock(indexHtml)).toBe(extractNavCtaBlock(contactHtml));
  });

  test("footer bottom license/copyright placeholders stay identical across both pages", () => {
    expect(extractFooterBottom(indexHtml)).toBe(extractFooterBottom(contactHtml));
  });

  test("contact-page nav hash targets match homepage section ids", () => {
    const sectionIds = collectMatches(indexHtml, /<section[^>]*\bid="([^"]+)"/g);
    const contactNavBlock = collectMatches(
      contactHtml,
      /class="nav-links"[\s\S]*?<\/ul>/g
    )[0];
    expect(contactNavBlock).toBeTruthy();
    const hashes = collectMatches(contactNavBlock, /href="index\.html#([^"]+)"/g);

    expect(hashes.length).toBeGreaterThan(0);
    for (const hash of hashes) {
      expect(sectionIds).toContain(hash);
    }
  });

  test("JSON-LD business name appears in brand chrome on both pages", () => {
    const jsonLd = indexHtml.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );
    const businessName = JSON.parse(jsonLd[1]).name;
    expect(businessName).toBeTruthy();

    for (const html of [indexHtml, contactHtml]) {
      expect(html).toContain(`aria-label="${businessName} — Home"`);
      expect(html).toContain(`${businessName}. All rights reserved.`);
    }
  });
});

describe("service catalog ↔ lead form parity", () => {
  test("every homepage service card is selectable in the contact form", () => {
    const cardTitles = collectMatches(
      indexHtml,
      /<article class="service-card"[\s\S]*?<h3>([\s\S]*?)<\/h3>/g
    ).map((title) => decodeBasicEntities(title.replace(/\s+/g, " ").trim()));

    const optionLabels = collectMatches(
      contactHtml,
      /<option\b[^>]*>([\s\S]*?)<\/option>/g
    ).map((label) => decodeBasicEntities(label.replace(/\s+/g, " ").trim()));

    expect(cardTitles.length).toBe(6);
    for (const title of cardTitles) {
      expect(optionLabels).toContain(title);
    }
    expect(optionLabels).toContain("Not sure yet");
  });

  test("JSON-LD areaServed matches homepage service-area chips", () => {
    const jsonLd = indexHtml.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );
    const data = JSON.parse(jsonLd[1]);
    const chips = collectMatches(
      indexHtml,
      /class="area-chip"[^>]*>[\s\S]*?<\/svg>([^<]+)/g
    ).map((city) => city.trim());

    expect(chips.length).toBeGreaterThan(0);
    expect(data.areaServed).toEqual(chips);
  });
});

describe("security + Netlify form posture", () => {
  test("HTML has no inline styles or DOM event-handler attributes", () => {
    for (const html of [indexHtml, contactHtml]) {
      expect(html).not.toMatch(/\sstyle\s*=/);
      expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    }
  });

  test("main.js never uses innerHTML, eval, or document.write", () => {
    const mainJs = fs.readFileSync(path.join(root, "js/main.js"), "utf8");
    expect(mainJs).not.toMatch(/\.innerHTML\b/);
    expect(mainJs).not.toMatch(/\beval\s*\(/);
    expect(mainJs).not.toMatch(/document\.write\s*\(/);
  });

  test("contact form keeps Netlify POST + matching form-name contract", () => {
    expect(contactHtml).toMatch(
      /<form\b[^>]*\bmethod="POST"[^>]*\bname="contact"|<form\b[^>]*\bname="contact"[^>]*\bmethod="POST"/
    );
    expect(contactHtml).toMatch(/name="form-name"[^>]*value="contact"/);
  });

  test("honeypot stays in visually-hidden (not display:none) so Netlify can still read it", () => {
    expect(contactHtml).toMatch(
      /class="visually-hidden"[\s\S]*?name="bot-field"/
    );
    expect(stylesCss).toMatch(/\.visually-hidden\s*\{[^}]*clip-path:/s);
    // clip-path alone without absolute positioning can leave a layout hole or
    // fail to remove the honeypot from the visual flow on some engines.
    expect(stylesCss).toMatch(/\.visually-hidden\s*\{[^}]*position:\s*absolute/s);
    expect(stylesCss).not.toMatch(/\.visually-hidden\s*\{[^}]*display\s*:\s*none/s);
  });

  test("HTML referrer meta matches host Referrer-Policy", () => {
    const headers = fs.readFileSync(path.join(root, "_headers"), "utf8");
    expect(headers).toMatch(/Referrer-Policy:\s*strict-origin-when-cross-origin/);
    for (const html of [indexHtml, contactHtml]) {
      expect(html).toMatch(
        /name="referrer"\s+content="strict-origin-when-cross-origin"/
      );
    }
  });
});

describe("accessibility motion contract (CSS)", () => {
  test("prefers-reduced-motion force-shows [data-reveal] without waiting for JS", () => {
    // Accessibility e2e relies on this so axe measures final contrast.
    expect(stylesCss).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    expect(stylesCss).toMatch(/\[data-reveal\]\s*\{[^}]*opacity:\s*1/s);
    // Without transform:none, reduced-motion users still see a permanent
    // translateY offset even when opacity is forced to 1.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)[\s\S]*?\[data-reveal\]\s*\{[^}]*transform:\s*none/s
    );
  });

  test("prefers-reduced-motion disables [data-reveal] transition animation", () => {
    // Opacity/transform restores alone still animate under reduce if transition
    // remains — axe e2e and WCAG reduced-motion posture expect transition:none.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)[\s\S]*?\[data-reveal\]\s*\{[^}]*transition:\s*none/s
    );
  });

  test("both pages expose a skip link to #main-content", () => {
    for (const html of [indexHtml, contactHtml]) {
      expect(html).toMatch(/class="skip-link"[^>]*href="#main-content"/);
      expect(html).toMatch(/id="main-content"/);
    }
  });
});

describe("brand + contact identity launch placeholders", () => {
  test("JSON-LD business name matches header brand-text and footer brand labels", () => {
    const businessName = JSON.parse(
      indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    ).name;
    expect(businessName).toBeTruthy();

    for (const html of [indexHtml, contactHtml]) {
      const headerBrands = collectMatches(
        html,
        /class="brand-text">\s*([\s\S]*?)<span class="placeholder-tag"/g
      ).map((text) => decodeBasicEntities(text.replace(/\s+/g, " ").trim()));

      expect(headerBrands.length).toBeGreaterThan(0);
      for (const text of headerBrands) {
        expect(text).toBe(businessName);
      }

      const footerBrand = collectMatches(
        html,
        /class="footer-brand"[\s\S]*?<a href="index\.html" class="brand">[\s\S]*?<\/svg>\s*([^<]+)/g
      ).map((text) => decodeBasicEntities(text.replace(/\s+/g, " ").trim()));

      expect(footerBrand).toEqual([businessName]);
    }
  });

  test("document titles and OG title include the JSON-LD business name", () => {
    const businessName = JSON.parse(
      indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    ).name;
    const indexTitle = decodeBasicEntities(indexHtml.match(/<title>([^<]+)<\/title>/)[1]);
    const contactTitle = decodeBasicEntities(contactHtml.match(/<title>([^<]+)<\/title>/)[1]);
    const ogTitle = decodeBasicEntities(
      indexHtml.match(/property="og:title"\s+content="([^"]+)"/)[1]
    );

    expect(indexTitle).toContain(businessName);
    expect(contactTitle).toContain(businessName);
    expect(ogTitle).toContain(businessName);
  });

  test("visible phone link text digits match every tel: href", () => {
    const stripDigits = (value) => String(value).replace(/\D/g, "");
    const pages = [indexHtml, contactHtml];

    for (const html of pages) {
      const telHrefs = collectMatches(html, /href="(tel:[^"]+)"/g);
      expect(telHrefs.length).toBeGreaterThan(0);

      const expectedDigits = stripDigits(telHrefs[0]);
      expect(expectedDigits.length).toBeGreaterThanOrEqual(10);

      for (const href of telHrefs) {
        expect(stripDigits(href)).toBe(expectedDigits);
      }

      // Visible link text may use &#8209; non-breaking hyphens; digits must still match.
      const phoneTexts = collectMatches(
        html,
        /href="tel:[^"]+"[^>]*>([\s\S]*?)<\/a>/g
      ).map((text) => decodeBasicEntities(text.replace(/<[^>]+>/g, "")));

      expect(phoneTexts.length).toBeGreaterThan(0);
      for (const text of phoneTexts) {
        const visibleDigits = stripDigits(text);
        // Visible copy may omit the leading country code present in tel:+1...
        expect(visibleDigits.length).toBeGreaterThanOrEqual(10);
        expect(
          expectedDigits === visibleDigits || expectedDigits.endsWith(visibleDigits)
        ).toBe(true);
      }
    }
  });
});

describe("service-area copy parity (contact sidebar ↔ homepage chips)", () => {
  test("contact-page service-area list matches JSON-LD areaServed order", () => {
    const areaServed = JSON.parse(
      indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    ).areaServed;
    expect(Array.isArray(areaServed)).toBe(true);
    expect(areaServed.length).toBeGreaterThan(0);

    const contactAreaMatch = contactHtml.match(
      /Southwest Florida<\/span>\s*<small>([^<]+)<\/small>/
    );
    expect(contactAreaMatch).toBeTruthy();
    const listedCities = contactAreaMatch[1]
      .split(",")
      .map((city) => city.trim())
      .filter(Boolean);

    expect(listedCities).toEqual(areaServed);
  });
});

describe("primary nav label parity across pages", () => {
  function extractPrimaryNavLabels(html) {
    const block = collectMatches(html, /class="nav-links"[\s\S]*?<\/ul>/g)[0];
    expect(block).toBeTruthy();
    return collectMatches(block, /<a\b[^>]*>([\s\S]*?)<\/a>/g).map((label) =>
      decodeBasicEntities(label.replace(/\s+/g, " ").trim())
    );
  }

  test("homepage and contact primary nav keep the same labels in the same order", () => {
    expect(extractPrimaryNavLabels(indexHtml)).toEqual(extractPrimaryNavLabels(contactHtml));
  });
});

describe("static asset + font loading contract", () => {
  test("local stylesheet, script, and favicon hrefs resolve on disk", () => {
    const localRefs = [
      ...collectMatches(indexHtml, /(?:href|src)="((?:assets|css|js)\/[^"]+)"/g),
      ...collectMatches(contactHtml, /(?:href|src)="((?:assets|css|js)\/[^"]+)"/g),
    ];
    expect(localRefs.length).toBeGreaterThan(0);

    for (const ref of [...new Set(localRefs)]) {
      expect(fs.existsSync(path.join(root, ref))).toBe(true);
    }
  });

  test("Google Fonts stylesheet hosts used in HTML stay inside the CSP allowlists", () => {
    const hostCsp = fs
      .readFileSync(path.join(root, "_headers"), "utf8")
      .match(/Content-Security-Policy:\s*(.+)/)[1];
    const styleSrc = hostCsp.match(/style-src\s+([^;]+)/)[1];
    const fontSrc = hostCsp.match(/font-src\s+([^;]+)/)[1];

    for (const html of [indexHtml, contactHtml]) {
      const fontStylesheet = html.match(
        /href="(https:\/\/fonts\.googleapis\.com\/[^"]+)"/
      );
      expect(fontStylesheet).toBeTruthy();
      expect(styleSrc).toContain("https://fonts.googleapis.com");
      expect(fontSrc).toContain("https://fonts.gstatic.com");
      expect(html).toContain('href="https://fonts.gstatic.com"');
    }
  });

  test("theme-color stays identical across both pages", () => {
    const indexTheme = indexHtml.match(/name="theme-color"\s+content="([^"]+)"/)[1];
    const contactTheme = contactHtml.match(/name="theme-color"\s+content="([^"]+)"/)[1];
    expect(indexTheme).toBeTruthy();
    expect(contactTheme).toBe(indexTheme);
  });
});

describe("inline-script vs CSP unsafe-inline split", () => {
  test("homepage keeps a single inline JSON-LD script (requires CSP unsafe-inline)", () => {
    const inlineScripts = collectMatches(
      indexHtml,
      /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi
    );
    expect(inlineScripts).toHaveLength(1);
    expect(() => JSON.parse(inlineScripts[0])).not.toThrow();
    expect(indexHtml).toMatch(
      /Content-Security-Policy"[^>]*script-src[^;]*'unsafe-inline'/
    );
  });

  test("contact page has no inline scripts and omits CSP unsafe-inline", () => {
    const inlineScripts = collectMatches(
      contactHtml,
      /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi
    );
    expect(inlineScripts).toHaveLength(0);
    expect(contactHtml).toMatch(/Content-Security-Policy"[^>]*script-src 'self'/);
    expect(contactHtml).not.toMatch(
      /Content-Security-Policy"[^>]*script-src[^;]*'unsafe-inline'/
    );
  });
});

describe("footer contact + brand blurb parity", () => {
  function extractFooterContactList(html) {
    const match = html.match(/<h4>Contact<\/h4>\s*<ul>([\s\S]*?)<\/ul>/);
    return match ? match[1].replace(/\s+/g, " ").trim() : null;
  }

  function extractFooterBrandBlurb(html) {
    const match = html.match(/class="footer-brand"[\s\S]*?<p>([\s\S]*?)<\/p>/);
    return match ? decodeBasicEntities(match[1].replace(/\s+/g, " ").trim()) : null;
  }

  test("footer Contact column stays identical across both pages", () => {
    expect(extractFooterContactList(indexHtml)).toBe(extractFooterContactList(contactHtml));
  });

  test("footer brand blurb stays identical across both pages", () => {
    expect(extractFooterBrandBlurb(indexHtml)).toBe(extractFooterBrandBlurb(contactHtml));
  });

  test("header placeholder-tag tagline stays identical across both pages", () => {
    const tags = (html) =>
      collectMatches(html, /class="placeholder-tag">([^<]+)/g).map((t) =>
        decodeBasicEntities(t.replace(/\s+/g, " ").trim())
      );

    const indexTags = tags(indexHtml);
    const contactTags = tags(contactHtml);
    expect(indexTags.length).toBeGreaterThan(0);
    expect(contactTags).toEqual(indexTags);
  });
});

describe("owner / founder identity consistency", () => {
  test("JSON-LD founder matches the about heading and both meta descriptions", () => {
    const founder = JSON.parse(
      indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    ).founder;
    expect(founder).toBeTruthy();

    expect(indexHtml).toMatch(new RegExp(`<h2>\\s*Meet\\s+${founder}\\s*</h2>`));

    for (const html of [indexHtml, contactHtml]) {
      const description = html.match(/name="description"\s+content="([^"]+)"/)[1];
      expect(decodeBasicEntities(description)).toContain(founder);
    }
  });
});

describe("visible mailto text ↔ href parity", () => {
  test("every mailto: link's visible text matches its href address", () => {
    for (const html of [indexHtml, contactHtml]) {
      const matches = [...html.matchAll(/href="mailto:([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
      expect(matches.length).toBeGreaterThan(0);
      for (const match of matches) {
        const hrefAddress = match[1];
        const visible = decodeBasicEntities(match[2].replace(/<[^>]+>/g, "")).trim();
        expect(visible).toBe(hrefAddress);
      }
    }
  });
});

describe("lead-form option values + autocomplete hardening", () => {
  test("every service option has a unique non-empty value (feeds mailto body)", () => {
    const values = collectMatches(
      contactHtml,
      /<option\b[^>]*\bvalue="([^"]*)"/g
    );
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(values).size).toBe(values.length);
  });

  test("locks service option value↔label pairs (mailto body uses value, UI shows label)", () => {
    // Catalog parity asserts labels match homepage cards, but buildMailtoUrl
    // reads <option value>. Decks intentionally abbreviates the value — either
    // side drifting corrupts lead triage without failing label-only checks.
    const select = contactHtml.match(
      /<select\b[^>]*\bid="service"[^>]*>([\s\S]*?)<\/select>/i
    )?.[1];
    expect(select).toBeTruthy();
    const pairs = [...select.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map(
      (match) => ({
        value: (match[1].match(/\bvalue="([^"]*)"/i) || [])[1] || "",
        label: decodeBasicEntities(match[2].replace(/\s+/g, " ").trim()),
      })
    );
    expect(pairs).toEqual([
      {
        value: "Custom Trim & Millwork",
        label: "Custom Trim & Millwork",
      },
      {
        value: "Custom Cabinetry & Built-Ins",
        label: "Custom Cabinetry & Built-Ins",
      },
      {
        value: "Doors & Entryways",
        label: "Doors & Entryways",
      },
      {
        value: "Decks & Outdoor Structures",
        label: "Decks, Framing & Outdoor Structures",
      },
      {
        value: "Kitchen & Bath Remodels",
        label: "Kitchen & Bath Remodels",
      },
      {
        value: "Repairs & Small Renovations",
        label: "Repairs & Small Renovations",
      },
      {
        value: "Not sure yet",
        label: "Not sure yet",
      },
    ]);
  });

  test("lead fields keep autocomplete hints and honeypot stays out of autofill", () => {
    expect(contactHtml).toMatch(/id="name"[^>]*autocomplete="name"/);
    expect(contactHtml).toMatch(/id="phone"[^>]*autocomplete="tel"/);
    expect(contactHtml).toMatch(/id="email"[^>]*autocomplete="email"/);
    expect(contactHtml).toMatch(
      /name="bot-field"[^>]*(?:autocomplete="off"[^>]*tabindex="-1"|tabindex="-1"[^>]*autocomplete="off")/
    );
  });
});

describe("discovery file → on-disk page mapping", () => {
  test("every sitemap <loc> resolves to an existing local HTML page", () => {
    const locs = collectMatches(sitemapXml, /<loc>\s*([^<]+?)\s*<\/loc>/g);
    expect(locs.length).toBeGreaterThan(0);

    for (const loc of locs) {
      const pathname = new URL(loc).pathname.replace(/\/$/, "") || "/";
      const relative =
        pathname === "/" || pathname === "/index.html" ? "index.html" : pathname.replace(/^\//, "");
      expect(fs.existsSync(path.join(root, relative))).toBe(true);
    }
  });

  test("every on-disk HTML page is listed in sitemap.xml (bidirectional discovery)", () => {
    // Sitemap → disk is covered above. The reverse catches a new page that never
    // gets added to the sitemap (silent discovery / SEO gap).
    const htmlPages = fs
      .readdirSync(root)
      .filter((name) => name.endsWith(".html"))
      .sort();
    expect(htmlPages.length).toBeGreaterThan(0);

    const locs = collectMatches(sitemapXml, /<loc>\s*([^<]+?)\s*<\/loc>/g);
    const sitemapFiles = locs.map((loc) => {
      const pathname = new URL(loc).pathname.replace(/\/$/, "") || "/";
      return pathname === "/" || pathname === "/index.html"
        ? "index.html"
        : pathname.replace(/^\//, "");
    });

    for (const page of htmlPages) {
      expect(sitemapFiles).toContain(page);
    }
  });
});

describe("JSON-LD GeneralContractor required identity fields", () => {
  test("keeps the schema fields lead-gen and local SEO depend on", () => {
    const data = JSON.parse(
      indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    );

    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("GeneralContractor");
    for (const key of ["name", "founder", "telephone", "email", "url", "description"]) {
      expect(typeof data[key]).toBe("string");
      expect(data[key].trim().length).toBeGreaterThan(0);
    }
    expect(Array.isArray(data.areaServed)).toBe(true);
    expect(data.areaServed.length).toBeGreaterThan(0);
    expect(data.address).toEqual(
      expect.objectContaining({
        "@type": "PostalAddress",
        addressRegion: "FL",
        addressCountry: "US",
      })
    );
  });

  test("telephone stays a +1 NANP-shaped string for click-to-call parity", () => {
    // Digit-only equality with tel: can pass while JSON-LD becomes a bare
    // local number or drops the country code — rich results and dialer links diverge.
    const data = JSON.parse(
      indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    );
    expect(data.telephone).toMatch(/^\+1-\d{3}-\d{3}-\d{4}$/);
  });
});

describe("footer Explore link contract", () => {
  function extractExploreLinks(html) {
    const block = html.match(/<h4>Explore<\/h4>\s*<ul>([\s\S]*?)<\/ul>/);
    expect(block).toBeTruthy();
    return [...block[1].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(
      (match) => ({
        href: match[1],
        label: decodeBasicEntities(match[2].replace(/\s+/g, " ").trim()),
      })
    );
  }

  test("Explore labels stay identical across pages", () => {
    const indexLinks = extractExploreLinks(indexHtml);
    const contactLinks = extractExploreLinks(contactHtml);
    expect(indexLinks.map((l) => l.label)).toEqual(contactLinks.map((l) => l.label));
  });

  test("homepage Explore uses bare section hashes plus contact.html", () => {
    const sectionIds = collectMatches(indexHtml, /<section[^>]*\bid="([^"]+)"/g);
    const links = extractExploreLinks(indexHtml);
    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      if (link.label === "Contact") {
        expect(link.href).toBe("contact.html");
        continue;
      }
      expect(link.href.startsWith("#")).toBe(true);
      expect(sectionIds).toContain(link.href.slice(1));
    }
  });

  test("contact Explore uses index.html# section targets plus contact.html", () => {
    const sectionIds = collectMatches(indexHtml, /<section[^>]*\bid="([^"]+)"/g);
    const links = extractExploreLinks(contactHtml);
    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      if (link.label === "Contact") {
        expect(link.href).toBe("contact.html");
        continue;
      }
      expect(link.href.startsWith("index.html#")).toBe(true);
      expect(sectionIds).toContain(link.href.slice("index.html#".length));
    }
  });
});

describe("quote CTA destinations", () => {
  test("header nav-cta quote button points at contact.html on both pages", () => {
    for (const html of [indexHtml, contactHtml]) {
      const navCta = html.match(/<div class="nav-cta">([\s\S]*?)<\/div>/);
      expect(navCta).toBeTruthy();
      expect(navCta[1]).toMatch(/href="contact\.html"/);
    }
  });

  test("homepage primary quote CTAs point at the local contact page", () => {
    // Keep the match inside a single text node so we do not span across anchors.
    const quoteHrefs = [
      ...indexHtml.matchAll(
        /<a\b[^>]*\bhref="([^"]+)"[^>]*>\s*(?:Get a Free Quote|Request a Free Quote)\s*<\/a>/gi
      ),
    ].map((match) => match[1]);
    expect(quoteHrefs.length).toBeGreaterThan(0);
    for (const href of quoteHrefs) {
      expect(href).toBe("contact.html");
    }
  });
});

describe("transport + font loading hardening", () => {
  test("absolute href/src/content URLs in HTML stay on https", () => {
    for (const html of [indexHtml, contactHtml]) {
      const urls = collectMatches(html, /(?:href|src|content)="(https?:\/\/[^"]+)"/g);
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url.startsWith("https://")).toBe(true);
      }
    }
  });

  test("Google Fonts stylesheet URL stays identical across both pages", () => {
    const fontHref = (html) =>
      html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/)?.[1];
    expect(fontHref(indexHtml)).toBeTruthy();
    expect(fontHref(contactHtml)).toBe(fontHref(indexHtml));
  });

  test("fonts.gstatic.com preconnect keeps crossorigin (required for font CORS)", () => {
    for (const html of [indexHtml, contactHtml]) {
      expect(html).toMatch(
        /rel="preconnect"\s+href="https:\/\/fonts\.gstatic\.com"\s+crossorigin|href="https:\/\/fonts\.gstatic\.com"\s+rel="preconnect"\s+crossorigin/
      );
    }
  });

  test("viewport meta stays identical across both pages", () => {
    const viewport = (html) => html.match(/name="viewport"\s+content="([^"]+)"/)?.[1];
    expect(viewport(indexHtml)).toBeTruthy();
    expect(viewport(contactHtml)).toBe(viewport(indexHtml));
  });

  test("viewport meta keeps width=device-width and initial-scale=1.0", () => {
    // Parity alone passes if both pages drop initial-scale or pin a desktop
    // width — mobile lead capture and e2e small-viewport checks then degrade.
    for (const html of [indexHtml, contactHtml]) {
      const content = html.match(/name="viewport"\s+content="([^"]+)"/)?.[1];
      expect(content).toBe("width=device-width, initial-scale=1.0");
    }
  });
});

describe("CI safety-net contract", () => {
  test("workflow still runs lint, Jest, Playwright, and high-severity audit on Node 22", () => {
    const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/node-version:\s*22/);
    expect(ci).toMatch(/npm run lint/);
    expect(ci).toMatch(/npm run test:unit/);
    expect(ci).toMatch(/npm run test:e2e/);
    expect(ci).toMatch(/npm audit --audit-level=high/);
    expect(ci).toMatch(/playwright install --with-deps chromium webkit/);
  });
});

describe("Netlify form name ↔ form-name value", () => {
  test("form name attribute matches the hidden form-name field Netlify posts", () => {
    // Netlify Forms keys submissions by form-name. Drift between the form's
    // name= and the hidden field silently drops leads into the wrong bucket.
    const formOpen = contactHtml.match(/<form\b[^>]*data-contact-form[^>]*>/i)[0];
    const formName = formOpen.match(/\bname="([^"]+)"/i)?.[1];
    const hiddenName = contactHtml.match(/name="form-name"[^>]*value="([^"]+)"/)?.[1];
    expect(formName).toBeTruthy();
    expect(hiddenName).toBe(formName);
  });
});

describe("Open Graph identity ↔ JSON-LD founder", () => {
  test("og:description includes the JSON-LD founder and og:type stays website", () => {
    const founder = JSON.parse(
      indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    ).founder;
    const ogDescription = decodeBasicEntities(
      indexHtml.match(/property="og:description"\s+content="([^"]+)"/)[1]
    );
    const ogType = indexHtml.match(/property="og:type"\s+content="([^"]+)"/)[1];

    expect(founder).toBeTruthy();
    expect(ogDescription).toContain(founder);
    expect(ogType).toBe("website");
  });
});

describe("brand home link + favicon chrome", () => {
  test("every brand anchor points at index.html on both pages", () => {
    for (const html of [indexHtml, contactHtml]) {
      const brandHrefs = collectMatches(
        html,
        /<a\b[^>]*\bclass="[^"]*\bbrand\b[^"]*"[^>]*\bhref="([^"]+)"/g
      );
      // Also catch href-before-class order.
      const brandHrefsAlt = collectMatches(
        html,
        /<a\b[^>]*\bhref="([^"]+)"[^>]*\bclass="[^"]*\bbrand\b[^"]*"/g
      );
      const hrefs = [...new Set([...brandHrefs, ...brandHrefsAlt])];
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(href).toBe("index.html");
      }
    }
  });

  test("favicon link stays identical on both pages", () => {
    const favicon = (html) =>
      html.match(/<link\b[^>]*\brel="icon"[^>]*>/i)?.[0]?.replace(/\s+/g, " ").trim();
    expect(favicon(indexHtml)).toBeTruthy();
    expect(favicon(contactHtml)).toBe(favicon(indexHtml));
    expect(favicon(indexHtml)).toMatch(/href="assets\/favicon\.svg"/);
  });

  test("favicon declares image/svg+xml so browsers treat the asset as SVG", () => {
    // Href parity alone still passes if type drifts to image/png while the file
    // remains SVG — some browsers then refuse or mis-render the icon.
    for (const html of [indexHtml, contactHtml]) {
      const tag = html.match(/<link\b[^>]*\brel="icon"[^>]*>/i)?.[0];
      expect(tag).toBeTruthy();
      expect(tag).toMatch(/\btype="image\/svg\+xml"/i);
      expect(tag).toMatch(/\bhref="assets\/favicon\.svg"/i);
    }
  });
});

describe("document encoding + language parity", () => {
  test("both pages declare UTF-8 charset and lang=en", () => {
    for (const html of [indexHtml, contactHtml]) {
      expect(html).toMatch(/<html\b[^>]*\blang="en"/i);
      expect(html).toMatch(/<meta\b[^>]*\bcharset="UTF-8"/i);
    }
  });
});

describe("in-site relative link integrity", () => {
  test("every relative .html href target exists on disk", () => {
    for (const html of [indexHtml, contactHtml]) {
      const hrefs = collectMatches(html, /\bhref="([^"]+)"/g);
      for (const href of hrefs) {
        if (href.startsWith("#") || /^(mailto:|tel:|https?:)/i.test(href)) {
          continue;
        }
        const filePart = href.split("#")[0];
        if (!filePart || !filePart.endsWith(".html")) {
          continue;
        }
        expect(fs.existsSync(path.join(root, filePart))).toBe(true);
      }
    }
  });
});

describe("contact availability block", () => {
  test("contact page keeps a structured Availability hours section", () => {
    // README launch checklist calls out confirming hours — deleting the block
    // would remove visitor expectations without failing other chrome checks.
    expect(contactHtml).toMatch(/<h4>\s*Availability\s*<\/h4>/);
    const hoursRows = [
      ...contactHtml.matchAll(
        /class="hours-row"[^>]*>\s*<span>([\s\S]*?)<\/span>\s*<span>([\s\S]*?)<\/span>/g
      ),
    ].map((match) => ({
      day: decodeBasicEntities(match[1].replace(/\s+/g, " ").trim()),
      hours: decodeBasicEntities(match[2].replace(/\s+/g, " ").trim()),
    }));

    expect(hoursRows.length).toBeGreaterThanOrEqual(3);
    expect(hoursRows.some((row) => /Monday/i.test(row.day))).toBe(true);
    expect(hoursRows.some((row) => /Saturday/i.test(row.day))).toBe(true);
    expect(hoursRows.some((row) => /Sunday/i.test(row.day))).toBe(true);
    for (const row of hoursRows) {
      expect(row.hours.length).toBeGreaterThan(0);
    }
  });
});

describe("Google Fonts preconnect parity", () => {
  test("both pages preconnect to fonts.googleapis.com (pairs with gstatic CORS preconnect)", () => {
    for (const html of [indexHtml, contactHtml]) {
      expect(html).toMatch(
        /rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"|href="https:\/\/fonts\.googleapis\.com"\s+rel="preconnect"/
      );
    }
  });
});

describe("JS ↔ CSS toggle-class contract", () => {
  test("CSS still styles the classes main.js toggles for nav, reveal, and form status", () => {
    // JS only flips class names; removing these selectors leaves features "working"
    // in tests while the UI stays invisible (display:none / opacity:0 / visibility:hidden).
    expect(stylesCss).toMatch(/\.primary-nav\.is-open\s*\{/);
    expect(stylesCss).toMatch(/\[data-reveal\]\.is-visible\s*\{/);
    expect(stylesCss).toMatch(/\.form-status\.is-visible\s*\{/);
    expect(stylesCss).toMatch(/\.form-status\s*\{[^}]*display:\s*none/s);
    expect(stylesCss).toMatch(/\.form-status\.is-visible\s*\{[^}]*display:\s*block/s);
  });

  test("data-form-status keeps the form-status class CSS needs to reveal feedback", () => {
    // initContactForm adds .is-visible; styles only show .form-status.is-visible.
    // Dropping class="form-status" keeps the JS path green while status stays hidden.
    const statusEl = contactHtml.match(/<[^>]*\bdata-form-status\b[^>]*>/);
    expect(statusEl).toBeTruthy();
    expect(statusEl[0]).toMatch(/\bclass="[^"]*\bform-status\b[^"]*"/);
    expect(statusEl[0]).toMatch(/\brole="status"/);
  });

  test("skip-link:focus styles keep the skip target reachable for keyboard users", () => {
    expect(stylesCss).toMatch(/\.skip-link:focus\s*\{/);
  });
});

describe("Netlify honeypot attribute ↔ field name pairing", () => {
  test("netlify-honeypot value matches the honeypot input name", () => {
    // Netlify only treats the named field as a honeypot when the attribute matches.
    // Renaming one without the other silently disables spam filtering.
    const honeypotAttr = contactHtml.match(/\bnetlify-honeypot="([^"]+)"/)?.[1];
    const honeypotName = contactHtml.match(
      /<input\b[^>]*\bname="([^"]+)"[^>]*(?:tabindex="-1"|autocomplete="off")/i
    )?.[1];
    expect(honeypotAttr).toBeTruthy();
    expect(honeypotName).toBe(honeypotAttr);
    expect(contactHtml).toMatch(new RegExp(`\\bname="${honeypotAttr}"`));
  });
});

describe("lead-form submit control", () => {
  test("contact form keeps an explicit type=submit primary button", () => {
    // type="button" (or a non-button control) would break Enter-key submit and
    // Netlify's native POST path once mailto interception is removed.
    const form = contactHtml.match(/<form\b[^>]*data-contact-form[\s\S]*?<\/form>/i)?.[0];
    expect(form).toBeTruthy();
    expect(form).toMatch(/<button\b[^>]*\btype="submit"[^>]*>/i);
  });
});

describe("script load order (DOM-ready init)", () => {
  test("both pages load main.js immediately before </body> so init() finds hooks", () => {
    // Script is not deferred/async. Moving it into <head> runs init() before the
    // DOM exists and silently disables nav, reveal, footer year, and the form.
    for (const html of [indexHtml, contactHtml]) {
      expect(html).toMatch(/<script\s+src="js\/main\.js"><\/script>\s*<\/body>/i);
    }
  });
});

describe("Open Graph URL ↔ canonical exact match", () => {
  test("homepage og:url equals the canonical href (not just the same origin)", () => {
    const canonical = indexHtml.match(/rel="canonical"\s+href="([^"]+)"/)?.[1];
    const ogUrl = indexHtml.match(/property="og:url"\s+content="([^"]+)"/)?.[1];
    expect(canonical).toBeTruthy();
    expect(ogUrl).toBe(canonical);
  });

  test("homepage keeps the required Open Graph property set for link previews", () => {
    for (const property of ["og:type", "og:title", "og:description", "og:url"]) {
      expect(indexHtml).toMatch(
        new RegExp(`property="${property}"\\s+content="[^"]+"`)
      );
    }
  });

  test("contact page intentionally omits Open Graph tags (meta description is the share fallback)", () => {
    // Homepage owns social preview chrome today. Accidental half-added OG on
    // contact (title without url/description) produces worse share cards than
    // falling back to <title> + meta description.
    expect(contactHtml).not.toMatch(/property="og:/);
  });
});

describe("font display swap contract", () => {
  test("Google Fonts stylesheet requests keep display=swap (avoids invisible text)", () => {
    for (const html of [indexHtml, contactHtml]) {
      const fontHref = html.match(
        /href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/
      )?.[1];
      expect(fontHref).toBeTruthy();
      expect(fontHref).toMatch(/display=swap/);
    }
  });
});

describe("brand accessible name ↔ JSON-LD identity", () => {
  test("brand aria-label on both pages includes the JSON-LD business name", () => {
    const name = JSON.parse(
      indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    ).name;
    for (const html of [indexHtml, contactHtml]) {
      const labels = [
        ...html.matchAll(/<a\b[^>]*\bclass="[^"]*\bbrand\b[^"]*"[^>]*\baria-label="([^"]+)"/g),
        ...html.matchAll(/<a\b[^>]*\baria-label="([^"]+)"[^>]*\bclass="[^"]*\bbrand\b[^"]*"/g),
      ].map((match) => decodeBasicEntities(match[1]));
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        expect(label).toContain(name);
      }
    }
  });
});

describe("shared stylesheet contract", () => {
  test("both pages load the local css/styles.css stylesheet", () => {
    // Chrome parity and reveal/form-status CSS assume one shared sheet. A CDN
    // swap or path typo on one page silently splits design and JS↔CSS contracts.
    for (const html of [indexHtml, contactHtml]) {
      expect(html).toMatch(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="css\/styles\.css"/i);
    }
  });
});

describe("JSON-LD url ↔ homepage canonical", () => {
  test("JSON-LD url matches the homepage canonical href", () => {
    // Structured data and the canonical tag are launch placeholders that must
    // stay in lockstep; drift sends search engines competing homepage URLs.
    const data = JSON.parse(
      indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    );
    const canonical = indexHtml.match(/rel="canonical"\s+href="([^"]+)"/)?.[1];
    expect(canonical).toBeTruthy();
    expect(data.url).toBe(canonical);
  });
});

describe("service select lead-quality defaults", () => {
  test("service select has no blank placeholder option (first choice is a real service)", () => {
    // An empty first <option value=""> without required would submit blank
    // service lines into mailto/Netlify and weaken lead triage.
    const select = contactHtml.match(/<select\b[^>]*\bid="service"[^>]*>([\s\S]*?)<\/select>/i)?.[1];
    expect(select).toBeTruthy();
    const firstOption = select.match(/<option\b[^>]*>/i)?.[0];
    expect(firstOption).toBeTruthy();
    const value = firstOption.match(/\bvalue="([^"]*)"/i)?.[1];
    expect(value).toBeTruthy();
    expect(value.trim().length).toBeGreaterThan(0);
    expect(firstOption).not.toMatch(/\bdisabled\b/i);
    expect(firstOption).not.toMatch(/\bhidden\b/i);
  });
});

describe("mobile nav CSS visibility contract", () => {
  test("at max-width 920px, closed primary-nav stays hidden until .is-open", () => {
    // initMobileNav only toggles .is-open. If the closed rule loses opacity/visibility
    // hiding — or .is-open loses the reveal — mobile menus "work" in Jest while
    // remaining invisible (or permanently visible) in real browsers.
    expect(stylesCss).toMatch(/@media\s*\(\s*max-width:\s*920px\s*\)/);
    expect(stylesCss).toMatch(
      /\.primary-nav\s*\{[^}]*opacity:\s*0[^}]*visibility:\s*hidden/s
    );
    expect(stylesCss).toMatch(
      /\.primary-nav\.is-open\s*\{[^}]*opacity:\s*1[^}]*visibility:\s*visible/s
    );
  });

  test("nav-toggle is hidden on desktop and shown inside the mobile breakpoint", () => {
    // Without display:none by default, desktop gets a duplicate hamburger.
    // Without display:inline-flex in the mobile media query, the toggle never appears.
    expect(stylesCss).toMatch(/\.nav-toggle\s*\{[^}]*display:\s*none/s);
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*920px\s*\)[\s\S]*?\.nav-toggle\s*\{[^}]*display:\s*inline-flex/s
    );
  });
});

describe("theme-color ↔ CSS background parity", () => {
  test("theme-color matches the --color-bg custom property on both pages", () => {
    // Browser chrome / PWA toolbar color should track the page background.
    // Diverging these leaves a jarring flash of the wrong color on load.
    const bg = stylesCss.match(/--color-bg:\s*(#[0-9a-fA-F]+)/)?.[1];
    expect(bg).toBeTruthy();
    for (const html of [indexHtml, contactHtml]) {
      const theme = html.match(/name="theme-color"\s+content="([^"]+)"/)?.[1];
      expect(theme).toBeTruthy();
      expect(theme.toLowerCase()).toBe(bg.toLowerCase());
    }
  });
});

describe("loaded font families ↔ CSS stacks", () => {
  test("Google Fonts request includes Fraunces and Inter used by CSS variables", () => {
    // Swapping the stylesheet families without updating --font-heading/--font-body
    // (or the reverse) silently falls back to Georgia/system fonts.
    expect(stylesCss).toMatch(/--font-heading:\s*"Fraunces"/);
    expect(stylesCss).toMatch(/--font-body:\s*"Inter"/);
    for (const html of [indexHtml, contactHtml]) {
      const fontHref = html.match(
        /href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/
      )?.[1];
      expect(fontHref).toBeTruthy();
      expect(fontHref).toMatch(/family=Fraunces/);
      expect(fontHref).toMatch(/family=Inter/);
    }
  });
});

describe("skip-link landmark target", () => {
  test("both pages put id=main-content on the <main> landmark", () => {
    // Skip links that land on a non-main wrapper still "pass" href checks but
    // fail the intended landmark jump for keyboard / AT users.
    for (const html of [indexHtml, contactHtml]) {
      expect(html).toMatch(/<main\b[^>]*\bid="main-content"/i);
    }
  });
});

describe("external link hardening", () => {
  test("any target=_blank link keeps rel with noopener", () => {
    // Without noopener, a new tab can reach window.opener (tabnabbing risk).
    for (const html of [indexHtml, contactHtml]) {
      const blankAnchors = [...html.matchAll(/<a\b[^>]*\btarget="_blank"[^>]*>/gi)];
      for (const match of blankAnchors) {
        expect(match[0]).toMatch(/\brel="/i);
        expect(match[0]).toMatch(/\bnoopener\b/i);
      }
    }
  });
});

describe("script sourcing posture", () => {
  test("every script src is a local js/ path (no third-party script hosts)", () => {
    // A CDN or analytics script would also need CSP script-src expansion; catching
    // the HTML side first prevents silent CSP breakage or unexpected supply-chain deps.
    for (const html of [indexHtml, contactHtml]) {
      const srcs = collectMatches(html, /<script\b[^>]*\bsrc="([^"]+)"/gi);
      expect(srcs.length).toBeGreaterThan(0);
      for (const src of srcs) {
        expect(src.startsWith("js/")).toBe(true);
        expect(src).not.toMatch(/^https?:/i);
      }
    }
  });
});

describe("primary CTA button CSS contract", () => {
  test("btn-primary and btn-block rules exist for quote CTAs and the submit control", () => {
    // Quote links and the contact submit button rely on these classes for visible
    // affordance. Dropping the CSS leaves functional but invisible/unstyled CTAs.
    expect(stylesCss).toMatch(/\.btn-primary\s*\{/);
    expect(stylesCss).toMatch(/\.btn-block\s*\{/);
    expect(contactHtml).toMatch(
      /<button\b[^>]*\btype="submit"[^>]*\bclass="[^"]*\bbtn\b[^"]*\bbtn-primary\b[^"]*\bbtn-block\b/i
    );
  });
});

describe("meta description identity on both pages", () => {
  test("both meta descriptions include the JSON-LD business name", () => {
    // Founder is already locked; business-name drift in descriptions breaks
    // search-snippet identity after the launch rename from [Business Name].
    const businessName = JSON.parse(
      indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    ).name;
    expect(businessName).toBeTruthy();
    for (const html of [indexHtml, contactHtml]) {
      const description = decodeBasicEntities(
        html.match(/name="description"\s+content="([^"]+)"/)[1]
      );
      expect(description).toContain(businessName);
    }
  });
});

describe("contact form recipient shape", () => {
  test("data-recipient is a non-empty email-shaped address", () => {
    // Empty or non-email recipients produce mailto:? / broken clients while every
    // other identity check can still pass against a shared bad placeholder.
    const recipient = contactHtml.match(/data-recipient="([^"]*)"/)?.[1];
    expect(recipient).toBeTruthy();
    expect(recipient.trim().length).toBeGreaterThan(0);
    expect(recipient).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });
});

describe("Netlify lead fields stay inside the contact form", () => {
  test("honeypot and form-name fields are nested under data-contact-form", () => {
    // Fields outside the <form> are ignored by Netlify POST and by FormData, so
    // spam filtering / form routing silently disappear while attribute checks pass.
    const form = contactHtml.match(/<form\b[^>]*data-contact-form[\s\S]*?<\/form>/i)?.[0];
    expect(form).toBeTruthy();
    expect(form).toMatch(/\bname="form-name"/i);
    expect(form).toMatch(/\bname="bot-field"/i);
  });
});

describe("Jest export surface for pure helpers + DOM entry points", () => {
  test("main.js still exports the documented test seams", () => {
    // Accidental removal of navigation / init* exports breaks the integration suite
    // in opaque ways; keep the README export contract explicit.
    jest.resetModules();
    document.body.innerHTML = "";
    const main = require("../../js/main.js");
    expect(Object.keys(main).sort()).toEqual(
      [
        "sanitizeForHeader",
        "buildMailtoUrl",
        "getYear",
        "navigation",
        "initMobileNav",
        "initFooterYear",
        "initScrollReveal",
        "initContactForm",
        "initActiveNavHighlight",
        "init",
      ].sort()
    );
    expect(typeof main.navigation.redirect).toBe("function");
  });
});

describe("primary nav section-target parity", () => {
  function extractPrimaryNavSectionIds(html, { bareHashes }) {
    const block = collectMatches(html, /class="nav-links"[\s\S]*?<\/ul>/g)[0];
    expect(block).toBeTruthy();
    const pattern = bareHashes
      ? /href="#([^"]+)"/g
      : /href="index\.html#([^"]+)"/g;
    return collectMatches(block, pattern);
  }

  test("homepage and contact primary nav target the same section ids in order", () => {
    // Label parity alone misses href drift (e.g. "About" pointing at #services).
    // Active-nav + cross-page jumps depend on identical destination ids.
    expect(extractPrimaryNavSectionIds(indexHtml, { bareHashes: true })).toEqual(
      extractPrimaryNavSectionIds(contactHtml, { bareHashes: false })
    );
  });

  test("homepage primary nav hashes are bidirectional with main section ids", () => {
    // Dead hash links and orphan sections both break in-page nav / aria-current.
    const sectionIds = collectMatches(indexHtml, /<section[^>]*\bid="([^"]+)"/g);
    const navIds = extractPrimaryNavSectionIds(indexHtml, { bareHashes: true });
    expect(navIds.length).toBeGreaterThan(0);
    expect(navIds).toEqual(sectionIds);
  });
});

describe("unique element ids", () => {
  test("each page keeps unique non-empty id attributes", () => {
    // Duplicate ids break label[for], skip-link targets, aria-controls, and
    // active-nav querySelector matches (first-only).
    for (const html of [indexHtml, contactHtml]) {
      const ids = collectMatches(html, /\bid="([^"]*)"/g);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(id.trim().length).toBeGreaterThan(0);
      }
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test("homepage section ids stay CSS-selector-safe for active-nav querySelector", () => {
    // initActiveNavHighlight builds '.nav-links a[href="#' + id + '"]'.
    // Ids with spaces, quotes, or CSS specials silently fail to match.
    const ids = collectMatches(indexHtml, /<section\b[^>]*\bid="([^"]+)"/gi);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});

describe("contact document title identity", () => {
  test("contact <title> includes the JSON-LD business name", () => {
    // Meta descriptions already lock business name; title drift still breaks
    // tab/share identity after the launch rename from [Business Name].
    const businessName = JSON.parse(
      indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    ).name;
    const title = decodeBasicEntities(contactHtml.match(/<title>([^<]+)<\/title>/)[1]);
    expect(businessName).toBeTruthy();
    expect(title).toContain(businessName);
  });
});

describe("contact Availability hours copy", () => {
  test("locks the published weekday / weekend availability rows", () => {
    // Structured presence is already checked; exact hours are what visitors
    // and the README launch checklist treat as the business commitment.
    const hoursRows = [
      ...contactHtml.matchAll(
        /class="hours-row"[^>]*>\s*<span>([\s\S]*?)<\/span>\s*<span>([\s\S]*?)<\/span>/g
      ),
    ].map((match) => ({
      day: decodeBasicEntities(match[1].replace(/\s+/g, " ").trim()),
      hours: decodeBasicEntities(match[2].replace(/\s+/g, " ").trim()),
    }));

    expect(hoursRows).toEqual([
      { day: "Monday – Friday", hours: "7:00 AM – 5:00 PM" },
      { day: "Saturday", hours: "By appointment" },
      { day: "Sunday", hours: "Closed" },
    ]);
  });
});

describe("sticky header chrome contract", () => {
  test("site-header stays position:sticky so mobile nav overlays content", () => {
    // initMobileNav assumes a persistent header. Losing sticky positioning
    // scrolls the toggle away and makes the open menu harder to dismiss.
    expect(stylesCss).toMatch(/\.site-header\s*\{[^}]*position:\s*sticky/s);
  });

  test("site-header keeps top:0 and a stacking z-index above page content", () => {
    // Sticky without top:0 is unreliable across browsers. Without z-index, the
    // absolute mobile .primary-nav paints under following sections so the open
    // menu looks broken even though .is-open toggles correctly in Jest.
    expect(stylesCss).toMatch(/\.site-header\s*\{[^}]*top:\s*0/s);
    const z = stylesCss.match(/\.site-header\s*\{[^}]*z-index:\s*(\d+)/s);
    expect(z).toBeTruthy();
    expect(Number(z[1])).toBeGreaterThanOrEqual(1);
  });
});

describe("mobile nav overlay positioning", () => {
  test("at max-width 920px, primary-nav is absolutely positioned under the sticky header", () => {
    // Sticky header + absolute dropdown is the overlay contract. Switching the
    // open menu to static/relative flow pushes page content down instead of
    // covering it, and loses the top:100% anchor under .site-header.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*920px\s*\)[\s\S]*?\.primary-nav\s*\{[^}]*position:\s*absolute[^}]*top:\s*100%/s
    );
  });
});

describe("skip-link focus visibility contract", () => {
  test("skip-link stays off-screen until :focus moves it into view", () => {
    // A skip link that is only opacity/visually styled but never repositioned
    // on :focus remains unreachable for keyboard users despite the href contract.
    expect(stylesCss).toMatch(/\.skip-link\s*\{[^}]*top:\s*-\d+px/s);
    expect(stylesCss).toMatch(/\.skip-link:focus\s*\{[^}]*top:\s*\d+px/s);
  });

  test("skip-link z-index stays above the sticky site-header", () => {
    // If skip-link stacks under the header, :focus brings it on-screen but it
    // remains covered — keyboard users never see or activate it.
    const skipZ = stylesCss.match(/\.skip-link\s*\{[^}]*z-index:\s*(\d+)/s);
    const headerZ = stylesCss.match(/\.site-header\s*\{[^}]*z-index:\s*(\d+)/s);
    expect(skipZ).toBeTruthy();
    expect(headerZ).toBeTruthy();
    expect(Number(skipZ[1])).toBeGreaterThan(Number(headerZ[1]));
  });
});

describe("scroll motion + reduced-motion contract", () => {
  test("smooth scrolling is enabled by default and disabled under prefers-reduced-motion", () => {
    // In-page nav hashes rely on smooth scrolling for UX, but reduced-motion
    // users must get instant jumps (WCAG / axe e2e posture).
    expect(stylesCss).toMatch(/html\s*\{[^}]*scroll-behavior:\s*smooth/s);
    expect(stylesCss).toMatch(
      /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)[\s\S]*?html\s*\{[^}]*scroll-behavior:\s*auto/s
    );
  });
});

describe("scroll-reveal visible-state CSS contract", () => {
  test("[data-reveal].is-visible restores opacity so IO-driven reveals actually show", () => {
    // initScrollReveal only adds .is-visible. If that rule loses opacity:1,
    // observed elements stay at the default opacity:0 forever — including the
    // contact quote form — while observer tests still pass.
    expect(stylesCss).toMatch(
      /\[data-reveal\]\.is-visible\s*\{[^}]*opacity:\s*1/s
    );
  });

  test("[data-reveal].is-visible clears the entry translate so revealed content is not offset", () => {
    // Default [data-reveal] uses translateY. Opacity-only .is-visible leaves
    // lead cards visually shifted (and potentially clipped under sticky chrome).
    expect(stylesCss).toMatch(
      /\[data-reveal\]\s*\{[^}]*transform:\s*translateY\(/s
    );
    expect(stylesCss).toMatch(
      /\[data-reveal\]\.is-visible\s*\{[^}]*transform:\s*translateY\(0\)/s
    );
  });
});

describe("primary nav landmark label parity", () => {
  test("both pages keep aria-label=Primary on the primary-nav landmark", () => {
    // Screen readers announce this landmark name; drift between pages makes
    // nav discovery inconsistent after chrome copy edits.
    for (const html of [indexHtml, contactHtml]) {
      expect(html).toMatch(
        /<nav\b[^>]*\bclass="[^"]*\bprimary-nav\b[^"]*"[^>]*\baria-label="Primary"/i
      );
    }
  });
});

describe("Netlify honeypot input type", () => {
  test("honeypot field stays type=text so it remains a fillable spam trap", () => {
    // type=hidden removes the field from bot autofill heuristics Netlify
    // relies on; README called out restoring type=text during lint hardening.
    const honeypotName = contactHtml.match(/\bnetlify-honeypot="([^"]+)"/)?.[1];
    expect(honeypotName).toBeTruthy();
    expect(contactHtml).toMatch(
      new RegExp(
        `<input\\b[^>]*\\btype="text"[^>]*\\bname="${honeypotName}"|<input\\b[^>]*\\bname="${honeypotName}"[^>]*\\btype="text"`,
        "i"
      )
    );
  });
});

describe("lead form keyboard focus visibility", () => {
  test("form controls keep a visible focus ring after outline:none", () => {
    // outline:none without a compensatory ring fails WCAG focus visibility on
    // the quote form — visitors tabbing through lead fields see no caret cue.
    expect(stylesCss).toMatch(
      /\.form-field\s+(?:input|select|textarea):focus[\s\S]*?outline:\s*none/s
    );
    expect(stylesCss).toMatch(
      /\.form-field\s+(?:input|select|textarea):focus[\s\S]*?box-shadow:\s*0\s+0\s+0\s+3px/s
    );
    expect(stylesCss).toMatch(
      /\.form-field\s+(?:input|select|textarea):focus[\s\S]*?border-color:\s*var\(--color-accent\)/s
    );
  });
});

describe("primary nav keyboard focus affordance", () => {
  test("nav links keep a :focus-visible color change for keyboard users", () => {
    // Hover-only styling leaves keyboard users without a current-link cue while
    // aria-current remains attribute-only (no visual CSS yet).
    expect(stylesCss).toMatch(/\.nav-links a:focus-visible\s*[,{]/);
    expect(stylesCss).toMatch(
      /\.nav-links a:focus-visible\s*[^{]*\{[^}]*color:\s*var\(--color-wood\)/s
    );
  });
});

describe("nav toggle aria-controls ↔ primary-nav id pairing", () => {
  test("aria-controls value matches the primary-nav id on both pages", () => {
    // Hardcoding both sides to "primary-nav" still passes if they diverge to
    // different shared typos; extract and compare so AT wiring stays linked.
    for (const html of [indexHtml, contactHtml]) {
      const controls = html.match(
        /<button\b[^>]*\bclass="[^"]*\bnav-toggle\b[^"]*"[^>]*\baria-controls="([^"]+)"/s
      )?.[1];
      const navId = html.match(
        /<(?:nav|div)\b[^>]*\bclass="[^"]*\bprimary-nav\b[^"]*"[^>]*\bid="([^"]+)"/s
      )?.[1];
      expect(controls).toBeTruthy();
      expect(navId).toBeTruthy();
      expect(controls).toBe(navId);
    }
  });
});
