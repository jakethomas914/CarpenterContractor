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
    // Opacity:1 must live inside the reduce media query — a bare
    // [data-reveal] { opacity:1 } outside reduce would defeat scroll-reveal
    // for everyone, while scoping only transform:none still leaves reduce
    // users staring at opacity:0 lead cards when JS is slow.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)[\s\S]*?\[data-reveal\]\s*\{[^}]*opacity:\s*1/s
    );
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

describe("button keyboard focus posture", () => {
  test("`.btn` does not remove the native focus outline without a compensatory ring", () => {
    // Form fields intentionally set outline:none + box-shadow. Copying that
    // pattern onto `.btn` without a ring (or adding a global button outline:none)
    // silently fails WCAG focus visibility on quote CTAs and the submit control.
    const btnBlock = stylesCss.match(/\.btn\s*\{[^}]*\}/);
    expect(btnBlock).toBeTruthy();
    expect(btnBlock[0]).not.toMatch(/outline\s*:\s*none/);

    expect(stylesCss).not.toMatch(/\.btn:focus(?:-visible)?\s*[^{]*\{[^}]*outline\s*:\s*none/s);
    expect(stylesCss).not.toMatch(
      /(?:^|\n)\s*button:focus(?:-visible)?\s*[^{]*\{[^}]*outline\s*:\s*none/s
    );
  });
});

describe("dark CTA band button contrast contract", () => {
  test("cta-band keeps btn-outline-light for the secondary call CTA", () => {
    // On the dark cta-band, a plain btn-outline inherits ink-colored text and
    // becomes invisible. HTML and CSS must stay paired on the light outline variant.
    expect(indexHtml).toMatch(
      /class="cta-band"[\s\S]*?class="[^"]*\bbtn-outline-light\b[^"]*"[^>]*href="tel:/s
    );
    expect(stylesCss).toMatch(/\.btn-outline-light\s*\{[^}]*color:\s*#fff/s);
    expect(stylesCss).toMatch(/\.btn-outline-light\s*\{[^}]*border-color:/s);
  });
});

describe("sitemap schema identity", () => {
  test("sitemap.xml keeps the 0.9 urlset namespace", () => {
    // Dropping or swapping the xmlns breaks some crawlers even when <loc> rows
    // still look valid to string-based unit checks.
    expect(sitemapXml).toMatch(
      /<urlset\b[^>]*\bxmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/
    );
  });
});

describe("Netlify form name ↔ form-name value pairing", () => {
  test("form name attribute equals the hidden form-name value", () => {
    // Hardcoding both sides to "contact" still passes if they diverge to the
    // same wrong token; extract and compare so Netlify dashboard routing stays linked.
    const formName = contactHtml.match(
      /<form\b[^>]*\bdata-contact-form\b[^>]*\bname="([^"]+)"/i
    )?.[1];
    const hiddenValue = contactHtml.match(
      /<input\b[^>]*\bname="form-name"[^>]*\bvalue="([^"]+)"|<input\b[^>]*\bvalue="([^"]+)"[^>]*\bname="form-name"/i
    );
    expect(formName).toBeTruthy();
    expect(hiddenValue).toBeTruthy();
    expect(formName).toBe(hiddenValue[1] || hiddenValue[2]);
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

describe("primary CTA contrast + full-width submit", () => {
  test("btn-primary keeps accent fill and white text for quote CTAs", () => {
    // Existence of `.btn-primary` still passes if fill drifts to transparent or
    // ink-on-ink — Free Quote / Send Message become invisible on light surfaces.
    expect(stylesCss).toMatch(
      /\.btn-primary\s*\{[^}]*background-color:\s*var\(--color-accent\)/s
    );
    expect(stylesCss).toMatch(/\.btn-primary\s*\{[^}]*color:\s*#fff/s);
    expect(stylesCss).toMatch(
      /\.btn-primary:hover\s*\{[^}]*background-color:\s*var\(--color-accent-dark\)/s
    );
  });

  test("btn-block stays width 100% for the lead-form submit control", () => {
    // Submit uses btn-block on a narrow contact column. Losing width:100% leaves
    // a short right-aligned button that visitors miss on mobile.
    expect(stylesCss).toMatch(/\.btn-block\s*\{[^}]*width:\s*100%/s);
  });
});

describe("sticky header readability", () => {
  test("site-header keeps an opaque-enough background tied to --color-bg", () => {
    // Sticky chrome without a background lets hero/content scroll underneath the
    // nav and phone CTA, crushing contrast. RGB must stay derived from --color-bg.
    const bgHex = stylesCss.match(/--color-bg:\s*(#[0-9a-fA-F]{6})/)?.[1];
    expect(bgHex).toBeTruthy();
    const r = parseInt(bgHex.slice(1, 3), 16);
    const g = parseInt(bgHex.slice(3, 5), 16);
    const b = parseInt(bgHex.slice(5, 7), 16);
    const headerBlock = stylesCss.match(/\.site-header\s*\{[^}]*\}/);
    expect(headerBlock).toBeTruthy();
    expect(headerBlock[0]).toMatch(
      new RegExp(`background-color:\\s*rgb\\(\\s*${r}\\s+${g}\\s+${b}\\s*/`)
    );
    expect(headerBlock[0]).not.toMatch(/background(?:-color)?\s*:\s*transparent/);
  });

  test("site-header keeps 92% cream opacity so sticky chrome stays readable", () => {
    // Channel parity alone still passes if alpha drops (e.g. 40%) — hero/content
    // then shows through the sticky nav and phone CTA while --color-bg locks stay green.
    const bgHex = stylesCss.match(/--color-bg:\s*(#[0-9a-fA-F]{6})/)?.[1];
    expect(bgHex).toBeTruthy();
    const r = parseInt(bgHex.slice(1, 3), 16);
    const g = parseInt(bgHex.slice(3, 5), 16);
    const b = parseInt(bgHex.slice(5, 7), 16);
    const headerBlock = stylesCss.match(/\.site-header\s*\{[^}]*\}/);
    expect(headerBlock).toBeTruthy();
    expect(headerBlock[0]).toMatch(
      new RegExp(
        `background-color:\\s*rgb\\(\\s*${r}\\s+${g}\\s+${b}\\s*/\\s*92%\\s*\\)`
      )
    );
  });
});

describe("skip-link accessible name", () => {
  test("both pages keep the Skip to main content link text", () => {
    // Href-only checks still pass if the visible/AT name becomes "Skip" or is
    // emptied — keyboard users lose the landmark cue axe e2e assumes.
    for (const html of [indexHtml, contactHtml]) {
      expect(html).toMatch(
        /<a\b[^>]*\bclass="[^"]*\bskip-link\b[^"]*"[^>]*>\s*Skip to main content\s*<\/a>/i
      );
    }
  });
});

describe("discovery file cardinality", () => {
  test("sitemap.xml lists exactly the homepage and contact page", () => {
    // Loc presence checks still pass when a staging URL or duplicate contact row
    // is appended — crawlers then index placeholders outside the launch surface.
    const locs = [...sitemapXml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) =>
      m[1].trim()
    );
    expect(locs).toEqual([
      "https://www.example.com/",
      "https://www.example.com/contact.html",
    ]);
  });

  test("robots.txt declares exactly one Sitemap directive", () => {
    // Multiple Sitemap lines (or a second host) split crawlers while the
    // origin-parity check against the first match still appears green.
    const sitemaps = [...robotsTxt.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map(
      (m) => m[1]
    );
    expect(sitemaps).toEqual(["https://www.example.com/sitemap.xml"]);
  });
});

describe("decorative chrome SVGs stay hidden from assistive tech", () => {
  test("header brand and nav-toggle SVGs keep aria-hidden on both pages", () => {
    // Dropping aria-hidden surfaces "image" / path noise beside the brand name
    // and unlabeled toggle, which axe and real AT users both flag.
    for (const html of [indexHtml, contactHtml]) {
      const brandSvg = html.match(
        /<a\b[^>]*\bclass="[^"]*\bbrand\b[^"]*"[^>]*>\s*<svg\b[^>]*>/i
      )?.[0];
      expect(brandSvg).toBeTruthy();
      expect(brandSvg).toMatch(/\baria-hidden="true"/i);

      const toggleSvg = html.match(
        /<button\b[^>]*\bclass="[^"]*\bnav-toggle\b[^"]*"[^>]*>\s*<svg\b[^>]*>/i
      )?.[0];
      expect(toggleSvg).toBeTruthy();
      expect(toggleSvg).toMatch(/\baria-hidden="true"/i);
    }
  });
});

describe("mobile primary-nav overlay opacity contract", () => {
  test("at max-width 920px, open primary-nav keeps an opaque --color-surface fill", () => {
    // Opacity/visibility alone still leave nav labels unreadable when the overlay
    // background is transparent or missing — page content shows through the menu.
    expect(stylesCss).toMatch(/--color-surface:\s*#fff\b/);
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*920px\s*\)[\s\S]*?\.primary-nav\s*\{[^}]*background-color:\s*var\(--color-surface\)/s
    );
    const mobileNavBlock = stylesCss.match(
      /@media\s*\(\s*max-width:\s*920px\s*\)[\s\S]*?\.primary-nav\s*\{[^}]*\}/
    );
    expect(mobileNavBlock).toBeTruthy();
    expect(mobileNavBlock[0]).not.toMatch(/background(?:-color)?\s*:\s*transparent/);
  });
});

describe("dark-surface CTA contrast pairing", () => {
  test("btn-light keeps white fill and ink text for CTAs on dark bands/cards", () => {
    // On cta-band / area-map-card, white-on-white or transparent+white text makes
    // the primary quote/call controls disappear while className checks still pass.
    expect(stylesCss).toMatch(/\.btn-light\s*\{[^}]*background-color:\s*#fff/s);
    expect(stylesCss).toMatch(/\.btn-light\s*\{[^}]*color:\s*var\(--color-ink\)/s);
  });

  test("cta-band primary quote CTA uses btn-light linking to contact.html", () => {
    // Secondary outline-light is already locked. The primary must stay btn-light
    // (not btn-outline / bare text) and keep the lead-capture contact destination.
    expect(indexHtml).toMatch(
      /class="cta-band"[\s\S]*?class="[^"]*\bbtn-light\b[^"]*"[^>]*href="contact\.html"/s
    );
    expect(stylesCss).toMatch(/\.cta-band\s*\{[^}]*color:\s*#fff/s);
    expect(stylesCss).toMatch(
      /\.cta-band\s*\{[^}]*background:\s*linear-gradient\([^;]*var\(--color-wood-dark\)[^;]*var\(--color-ink\)/s
    );
  });

  test("area-map-card call CTA keeps btn-light on the dark accent card", () => {
    // Same light-button-on-dark-surface pairing as cta-band. Swapping to
    // btn-outline (ink) or btn-primary without checking contrast hides the call.
    expect(indexHtml).toMatch(
      /class="area-map-card"[\s\S]*?class="[^"]*\bbtn-light\b[^"]*"[^>]*href="tel:/s
    );
    expect(stylesCss).toMatch(/\.area-map-card\s*\{[^}]*color:\s*#fff/s);
  });

  test("hero primary quote CTA uses btn-primary on the light hero surface", () => {
    // btn-light (#fff) on the cream hero collapses contrast. Hero must keep the
    // accent-filled primary while dark bands keep btn-light.
    expect(indexHtml).toMatch(
      /class="hero-actions"[\s\S]*?class="[^"]*\bbtn-primary\b[^"]*"[^>]*href="contact\.html"/s
    );
  });
});

describe("lead-form status feedback contrast", () => {
  test("form-status keeps accent-dark text on the tinted success panel", () => {
    // display:block/.is-visible checks still pass if color drifts to #fff on the
    // light sage panel — visitors never see the mailto confirmation copy.
    expect(stylesCss).toMatch(
      /\.form-status\s*\{[^}]*color:\s*var\(--color-accent-dark\)/s
    );
  });

  test("form-status keeps a light accent-tinted panel background", () => {
    // Text-color locks alone still pass if the panel fill becomes transparent or
    // white-on-white — confirmation copy loses the sage cue and can vanish on
    // light contact cards. RGB must stay derived from --color-accent at 12%.
    const accentHex = stylesCss.match(/--color-accent:\s*(#[0-9a-fA-F]{6})/)?.[1];
    expect(accentHex).toBeTruthy();
    const r = parseInt(accentHex.slice(1, 3), 16);
    const g = parseInt(accentHex.slice(3, 5), 16);
    const b = parseInt(accentHex.slice(5, 7), 16);
    const statusBlock = stylesCss.match(/\.form-status\s*\{[^}]*\}/);
    expect(statusBlock).toBeTruthy();
    expect(statusBlock[0]).toMatch(
      new RegExp(
        `background-color:\\s*rgb\\(\\s*${r}\\s+${g}\\s+${b}\\s*/\\s*12%\\s*\\)`
      )
    );
  });
});

describe("dark-surface CTA hover + heading contrast", () => {
  test("btn-light hover shifts to --color-bg-alt instead of disappearing", () => {
    // Default/hover fill both #fff (or transparent hover) removes the pressed
    // affordance on dark bands while resting-state contrast tests stay green.
    expect(stylesCss).toMatch(
      /\.btn-light:hover\s*\{[^}]*background-color:\s*var\(--color-bg-alt\)/s
    );
  });

  test("btn-outline-light hover keeps white fill and ink text", () => {
    // Secondary Call CTA on cta-band relies on this invert. Hover that keeps
    // transparent + white text (or ink-on-ink) hides the control mid-interaction.
    expect(stylesCss).toMatch(
      /\.btn-outline-light:hover\s*\{[^}]*background-color:\s*#fff/s
    );
    expect(stylesCss).toMatch(
      /\.btn-outline-light:hover\s*\{[^}]*color:\s*var\(--color-ink\)/s
    );
  });

  test("cta-band and area-map-card headings stay explicitly white", () => {
    // Band/card `color:#fff` inheritance alone still fails when a later global
    // h2/h3 rule (or muted text token) overrides — Request a Quote / service-area
    // titles go dark on dark gradients while button contracts stay green.
    expect(stylesCss).toMatch(/\.cta-band\s+h2\s*\{[^}]*color:\s*#fff/s);
    expect(stylesCss).toMatch(
      /\.area-map-card\s+h3\s*,\s*\.area-map-card\s+p\s*\{[^}]*color:\s*#fff/s
    );
  });
});

describe("dark-surface supporting copy + primary hover elevation", () => {
  test("cta-band supporting paragraph keeps muted white (not ink or full white)", () => {
    // Heading #fff locks still pass when band body copy drifts to --color-text /
    // --color-ink (invisible on wood→ink) or collapses to pure #fff with no
    // hierarchy. The 78% white alpha is the readable supporting-copy contract.
    expect(stylesCss).toMatch(
      /\.cta-band\s+p\s*\{[^}]*color:\s*rgb\(\s*255\s+255\s+255\s*\/\s*78%\s*\)/s
    );
  });

  test("area-map-card supporting paragraph keeps muted white after the shared #fff rule", () => {
    // The combined h3,p { color:#fff } lock still passes if the more-specific
    // `.area-map-card p` override is deleted or retargeted to ink — body copy on
    // the accent card then either loses hierarchy or becomes unreadable.
    expect(stylesCss).toMatch(
      /\.area-map-card\s+p\s*\{[^}]*color:\s*rgb\(\s*255\s+255\s+255\s*\/\s*85%\s*\)/s
    );
  });

  test("area-map-card keeps the accent→accent-dark gradient surface", () => {
    // btn-light contrast on this card assumes a dark sage fill. Swapping the
    // gradient to cream/bg tokens keeps className + #fff text contracts green
    // while the call CTA and muted copy lose readable contrast.
    expect(stylesCss).toMatch(
      /\.area-map-card\s*\{[^}]*background:\s*linear-gradient\([^;]*var\(--color-accent\)[^;]*var\(--color-accent-dark\)/s
    );
  });

  test("btn-primary hover elevates with --shadow-md (fill darkening alone is not enough)", () => {
    // Accent-dark fill is already locked. Dropping the shadow elevation still
    // looks "flat"/inactive on cream surfaces while hover-fill tests stay green.
    expect(stylesCss).toMatch(
      /\.btn-primary:hover\s*\{[^}]*box-shadow:\s*var\(--shadow-md\)/s
    );
  });

  test("btn-outline-light resting border stays translucent white on dark bands", () => {
    // Presence of any border-color still passes if it drifts to ink/wood — the
    // secondary Call CTA outline vanishes on the cta-band gradient.
    expect(stylesCss).toMatch(
      /\.btn-outline-light\s*\{[^}]*border-color:\s*rgb\(\s*255\s+255\s+255\s*\/\s*50%\s*\)/s
    );
  });
});

describe("light-surface secondary CTA + primary resting elevation", () => {
  test("btn-primary resting state keeps --shadow-sm elevation", () => {
    // Hover --shadow-md is already locked. Dropping the resting shadow flattens
    // Free Quote / Send Message on cream surfaces while fill/hover tests stay green.
    expect(stylesCss).toMatch(
      /\.btn-primary\s*\{[^}]*box-shadow:\s*var\(--shadow-sm\)/s
    );
  });

  test("btn-outline hover inverts to ink fill with white text", () => {
    // Hero Call uses btn-outline on the cream surface. Hover that stays transparent
    // + ink (or white-on-white) removes the pressed affordance while resting ink
    // color locks still pass.
    expect(stylesCss).toMatch(
      /\.btn-outline:hover\s*\{[^}]*background-color:\s*var\(--color-ink\)/s
    );
    expect(stylesCss).toMatch(/\.btn-outline:hover\s*\{[^}]*color:\s*#fff/s);
    expect(stylesCss).toMatch(
      /\.btn-outline:hover\s*\{[^}]*border-color:\s*var\(--color-ink\)/s
    );
  });

  test("btn-outline resting state stays transparent with ink text", () => {
    // Without the resting contract, a fill/hover-only invert can leave the hero
    // Call solid-ink at rest (looking selected) or inherit white from a parent.
    expect(stylesCss).toMatch(
      /\.btn-outline\s*\{[^}]*background-color:\s*transparent/s
    );
    expect(stylesCss).toMatch(
      /\.btn-outline\s*\{[^}]*color:\s*var\(--color-ink\)/s
    );
  });

  test("hero secondary Call CTA uses btn-outline (not outline-light) to tel", () => {
    // outline-light (white text/border) on the cream hero collapses contrast.
    // Dark bands already lock btn-outline-light; hero must keep the ink outline.
    // Lookaheads run on the full class string so `btn-outline-light` alone cannot
    // satisfy `\bbtn-outline\b` (hyphen is a word boundary in JS regex).
    expect(indexHtml).toMatch(
      /class="hero-actions"[\s\S]*?<a\b[^>]*\bclass="(?=[^"]*\bbtn-outline\b)(?![^"]*\bbtn-outline-light\b)[^"]*"[^>]*href="tel:/s
    );
  });
});

describe("footer muted white alpha + brand contrast", () => {
  test("site-footer keeps ink background with muted white body copy", () => {
    // Brand/heading #fff locks still pass when footer body drifts to --color-text
    // (near-invisible on ink) or pure #fff (no hierarchy). 75% white is the
    // readable default for Explore/Contact link rows.
    expect(stylesCss).toMatch(
      /\.site-footer\s*\{[^}]*background-color:\s*var\(--color-ink\)/s
    );
    expect(stylesCss).toMatch(
      /\.site-footer\s*\{[^}]*color:\s*rgb\(\s*255\s+255\s+255\s*\/\s*75%\s*\)/s
    );
  });

  test("footer-bottom keeps more-muted white for legal/meta copy", () => {
    // Inheriting the 75% body token (or drifting to ink) either loses the
    // hierarchy under the grid or hides copyright/legal on the ink footer.
    expect(stylesCss).toMatch(
      /\.footer-bottom\s*\{[^}]*color:\s*rgb\(\s*255\s+255\s+255\s*\/\s*50%\s*\)/s
    );
  });

  test("footer-grid separator stays translucent white on ink", () => {
    // A solid ink or cream border either vanishes or screams; the 12% white hairline
    // is the only separator that stays visible without competing with columns.
    expect(stylesCss).toMatch(
      /\.footer-grid\s*\{[^}]*border-bottom:\s*1px\s+solid\s+rgb\(\s*255\s+255\s+255\s*\/\s*12%\s*\)/s
    );
  });

  test("footer brand name and column headings stay explicitly white", () => {
    // site-footer 75% inheritance alone still fails when a global .brand / h4 rule
    // forces wood/ink — the wordmark and Explore/Contact titles go dark on ink.
    expect(stylesCss).toMatch(
      /\.footer-brand\s+\.brand\s*\{[^}]*color:\s*#fff/s
    );
    expect(stylesCss).toMatch(/\.footer-col\s+h4\s*\{[^}]*color:\s*#fff/s);
  });

  test("footer brand-mark keeps wood-light accent on the ink footer", () => {
    // Dropping wood-light (or matching it to #fff) removes the only warm accent in
    // the footer chrome while brand-name #fff locks stay green.
    expect(stylesCss).toMatch(
      /\.footer-brand\s+\.brand-mark\s*\{[^}]*color:\s*var\(--color-wood-light\)/s
    );
  });
});

describe("footer hover affordance + contact icon contrast", () => {
  test("footer-col link hover brightens to white on the ink footer", () => {
    // Explore/Contact rows inherit 75% white. Without an explicit #fff hover,
    // muted body color alone makes links feel inert and harder to scan.
    expect(stylesCss).toMatch(/\.footer-col a:hover\s*\{[^}]*color:\s*#fff/s);
  });

  test("footer-bottom link hover brightens to white over 50% meta copy", () => {
    // Legal/meta starts at 50% white. Hover that stays muted (or drifts to ink)
    // hides Privacy/Terms-style anchors against the ink footer.
    expect(stylesCss).toMatch(
      /\.footer-bottom a:hover\s*\{[^}]*color:\s*#fff/s
    );
  });

  test("footer-contact-item icons keep wood-light on the ink footer", () => {
    // Matching icons to #fff or --color-text collapses the only warm glyph
    // accent beside the brand-mark while phone/email/address rows stay readable.
    expect(stylesCss).toMatch(
      /\.footer-contact-item svg\s*\{[^}]*color:\s*var\(--color-wood-light\)/s
    );
  });

  test("contact-info-list icons use wood (not wood-light) on light cards", () => {
    // Reusing footer wood-light on cream contact cards fails WCAG next to muted
    // labels; the more-specific list rule must keep --color-wood.
    expect(stylesCss).toMatch(
      /\.contact-info-list\s+\.footer-contact-item svg\s*\{[^}]*color:\s*var\(--color-wood\)/s
    );
  });
});

describe("skip-link contrast + header phone affordance", () => {
  test("skip-link keeps ink fill and white text when focused into view", () => {
    // Position locks (off-screen → top:12px) still pass if fill/text drift to
    // cream-on-cream or ink-on-ink — keyboard users then cannot read the target.
    expect(stylesCss).toMatch(
      /\.skip-link\s*\{[^}]*background(?:-color)?:\s*var\(--color-ink\)/s
    );
    expect(stylesCss).toMatch(/\.skip-link\s*\{[^}]*color:\s*#fff/s);
  });

  test("nav-phone keeps wood-dark for the header call affordance", () => {
    // Softening to muted text or wood-light drops the primary click-to-call
    // signal in the sticky header while tel: href contracts stay green.
    expect(stylesCss).toMatch(
      /\.nav-phone\s*\{[^}]*color:\s*var\(--color-wood-dark\)/s
    );
  });
});

describe("header brand chrome contrast on cream surface", () => {
  test("header brand wordmark stays ink on the sticky cream header", () => {
    // Footer overrides `.brand` to #fff. Without an explicit ink rule on the
    // shared header `.brand`, a global footer-first cascade (or a mistaken
    // shared override) can bleach the sticky wordmark against --color-bg.
    expect(stylesCss).toMatch(/\.brand\s*\{[^}]*color:\s*var\(--color-ink\)/s);
  });

  test("header brand-mark keeps wood (not wood-light) on the cream header", () => {
    // Footer intentionally uses wood-light on ink. Reusing that lighter token
    // on the cream sticky header fails the axe contrast gate while footer
    // wood-light and nav-phone wood-dark locks stay green.
    expect(stylesCss).toMatch(
      /\.brand-mark\s*\{[^}]*color:\s*var\(--color-wood\)/s
    );
    expect(stylesCss).not.toMatch(
      /(?:^|\n)\.brand-mark\s*\{[^}]*color:\s*var\(--color-wood-light\)/s
    );
  });

  test("placeholder-tag keeps wood for WCAG contrast on the cream header", () => {
    // CSS comments document wood (not wood-light) for >= 4.5:1 against the
    // header background. Softening the tagline while brand-mark locks pass
    // still fails axe on both pages.
    expect(stylesCss).toMatch(
      /\.brand-text\s+\.placeholder-tag\s*\{[^}]*color:\s*var\(--color-wood\)/s
    );
  });
});

describe("button press affordance + hero trust chrome", () => {
  test("`.btn:active` keeps a translateY press transform", () => {
    // Hover/focus color + shadow contracts can all pass while press feedback
    // disappears — quote/submit CTAs then feel inert on touch/mouse down.
    expect(stylesCss).toMatch(
      /\.btn:active\s*\{[^}]*transform:\s*translateY\(\s*1px\s*\)/s
    );
  });

  test("hero-fact strong values keep wood-dark for trust stats", () => {
    // Softening hero metrics to muted text (or wood-light) collapses the
    // primary numeric hierarchy next to muted labels while CTA contrast
    // locks remain green.
    expect(stylesCss).toMatch(
      /\.hero-fact\s+strong\s*\{[^}]*color:\s*var\(--color-wood-dark\)/s
    );
  });

  test("nav-links hover keeps wood color paired with focus-visible", () => {
    // focus-visible alone can stay green if hover is dropped from the shared
    // rule — pointer users lose the only current-link cue while aria-current
    // remains attribute-only.
    expect(stylesCss).toMatch(/\.nav-links a:hover\s*[,{]/);
    expect(stylesCss).toMatch(
      /\.nav-links a:hover\s*[^{]*\{[^}]*color:\s*var\(--color-wood\)/s
    );
  });
});

describe("hero + service + about wood brand accents", () => {
  test("hero h1 keeps a wood-accented span for the brand phrase", () => {
    // Markup without the inner <span> (or CSS that drops wood) leaves the whole
    // H1 as ink — the only warm brand signal in the first viewport disappears
    // while CTA contrast locks stay green.
    expect(indexHtml).toMatch(
      /<section\b[^>]*\bclass="[^"]*\bhero\b[^"]*"[^>]*>[\s\S]*?<h1\b[^>]*>[\s\S]*?<span\b[^>]*>[\s\S]*?<\/span>[\s\S]*?<\/h1>/i
    );
    expect(stylesCss).toMatch(
      /\.hero\s+h1\s+span\s*\{[^}]*color:\s*var\(--color-wood\)/s
    );
  });

  test("service-icon keeps wood glyphs on a cream bg-alt chip", () => {
    // Softening icons to muted text or matching them to surface white collapses
    // the service-card brand mark while h3/p copy contracts remain green.
    expect(stylesCss).toMatch(
      /\.service-icon\s*\{[^}]*background-color:\s*var\(--color-bg-alt\)/s
    );
    expect(stylesCss).toMatch(
      /\.service-icon\s*\{[^}]*color:\s*var\(--color-wood\)/s
    );
  });

  test("about-portrait keeps wood for the placeholder craftsman mark", () => {
    // Replacing wood with ink or muted text removes the only warm accent in the
    // about media plane while caption/CTA contracts stay green.
    expect(stylesCss).toMatch(
      /\.about-portrait\s*\{[^}]*color:\s*var\(--color-wood\)/s
    );
  });

  test("about-portrait-caption keeps ink overlay and white text", () => {
    // Caption without the dark scrim (or with ink text) fails against the cream
    // portrait gradient — "Photo of Greg Felton" becomes unreadable.
    expect(stylesCss).toMatch(
      /\.about-portrait-caption\s*\{[^}]*background(?:-color)?:\s*rgb\(\s*30\s+26\s+23\s*\/\s*72%\s*\)/s
    );
    expect(stylesCss).toMatch(
      /\.about-portrait-caption\s*\{[^}]*color:\s*#fff/s
    );
  });
});

describe("section eyebrow + hero-eyebrow accent hierarchy", () => {
  test("section eyebrows keep accent-dark for scan hierarchy", () => {
    // Softening `.eyebrow` to muted text flattens What We Do / About / Gallery
    // section labels into body copy while heading size locks stay green.
    expect(stylesCss).toMatch(
      /\.eyebrow\s*\{[^}]*color:\s*var\(--color-accent-dark\)/s
    );
  });

  test("hero-eyebrow keeps accent-dark text on an accent-tinted pill", () => {
    // Matching form-status: text-only locks miss a white-on-cream pill, and a
    // lost 12% tint makes the SWFL location chip blend into the hero surface.
    expect(stylesCss).toMatch(
      /\.hero-eyebrow\s*\{[^}]*color:\s*var\(--color-accent-dark\)/s
    );
    expect(stylesCss).toMatch(
      /\.hero-eyebrow\s*\{[^}]*background-color:\s*rgb\(\s*79\s+109\s+82\s*\/\s*12%\s*\)/s
    );
  });
});

describe("mobile nav-toggle + header brand chrome sizing", () => {
  test("nav-toggle keeps ink color so the hamburger stays visible on cream", () => {
    // Transparent/missing color (or matching --color-bg) hides the only mobile
    // open control while display:none→inline-flex breakpoint locks stay green.
    expect(stylesCss).toMatch(
      /\.nav-toggle\s*\{[^}]*color:\s*var\(--color-ink\)/s
    );
  });

  test("header brand keeps flex gap and display size for sticky chrome", () => {
    // Collapsing gap or shrinking font-size below the wordmark lock makes the
    // sticky header feel empty while ink/wood color contracts remain green.
    expect(stylesCss).toMatch(/\.brand\s*\{[^}]*gap:\s*10px/s);
    expect(stylesCss).toMatch(/\.brand\s*\{[^}]*font-size:\s*1\.3rem/s);
  });
});

describe("hero visual + gallery placeholder brand tokens", () => {
  test("hero-visual keeps the wood-to-wood-dark brand gradient", () => {
    // Replacing the wood gradient with accent/ink (or a flat fill) removes the
    // dominant brand plane beside the hero copy while CTA locks stay green.
    expect(stylesCss).toMatch(
      /\.hero-visual\s*\{[^}]*background:\s*linear-gradient\([^;]*var\(--color-wood\)[^;]*var\(--color-wood-dark\)/s
    );
  });

  test("gallery-tile icons keep wood-light with ink titles on cream tiles", () => {
    // Icons drifting to muted text or titles inheriting muted color erase the
    // gallery placeholder hierarchy while dashed-border layout stays intact.
    expect(stylesCss).toMatch(
      /\.gallery-tile\s+svg\s*\{[^}]*color:\s*var\(--color-wood-light\)/s
    );
    expect(stylesCss).toMatch(
      /\.gallery-tile\s+strong\s*\{[^}]*color:\s*var\(--color-ink\)/s
    );
  });
});

describe("lead form control surface contrast", () => {
  test("form controls keep cream fill and readable text color", () => {
    // White-on-white (surface fill + inherited light text) or border-only
    // regressions hide typed lead data while focus-ring locks stay green.
    expect(stylesCss).toMatch(
      /\.form-field\s+(?:input|select|textarea)\s*\{[^}]*background-color:\s*var\(--color-bg\)/s
    );
    expect(stylesCss).toMatch(
      /\.form-field\s+(?:input|select|textarea)\s*\{[^}]*color:\s*var\(--color-text\)/s
    );
  });
});

describe("section + hero supporting copy muted hierarchy", () => {
  test("section-heading supporting paragraphs stay muted", () => {
    // Softening to inherited ink (or bleaching to surface white) collapses the
    // only supporting sentence under each section H2 into body noise / invisible
    // copy while eyebrow + heading size locks stay green.
    expect(stylesCss).toMatch(
      /\.section-heading\s+p\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
  });

  test("hero-lede stays muted so the first-viewport CTA hierarchy holds", () => {
    // Matching hero H1 ink weight (or dropping color entirely) makes the lede
    // compete with the brand headline while wood span + CTA contrast locks pass.
    expect(stylesCss).toMatch(
      /\.hero-lede\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
  });

  test("hero-fact labels stay muted beside wood-dark values", () => {
    // Value locks on `strong` can pass while label spans inherit wood-dark or
    // ink — trust stats then lose the number/label hierarchy in the hero.
    expect(stylesCss).toMatch(
      /\.hero-fact\s+span\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
  });
});

describe("testimonial sample-badge + lead form label weight", () => {
  test("sample-badge keeps ink fill and white text for SAMPLE chips", () => {
    // Transparent/muted badges (or ink-on-ink text) hide the only disclosure that
    // testimonials are samples while star/markup e2e presence checks stay green.
    expect(stylesCss).toMatch(
      /\.sample-badge\s*\{[^}]*background(?:-color)?:\s*var\(--color-ink\)/s
    );
    expect(stylesCss).toMatch(/\.sample-badge\s*\{[^}]*color:\s*#fff/s);
  });

  test("form-field labels keep semibold weight for lead-field scan", () => {
    // Dropping to normal weight flattens label→control hierarchy on the contact
    // form while id/name pairing and control fill locks remain green.
    expect(stylesCss).toMatch(
      /\.form-field\s+label\s*\{[^}]*font-weight:\s*600/s
    );
  });

  test("contact-hours heading stays muted for availability hierarchy", () => {
    // Matching hours-row ink weight (or bleaching the h4) erases the only
    // Availability label above day/hours pairs while hours-row content locks pass.
    expect(stylesCss).toMatch(
      /\.contact-hours\s+h4\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
  });
});

describe("testimonial stars + body/form muted copy hierarchy", () => {
  test("testimonial-stars keep gold so rating glyphs stay visible on cream", () => {
    // Inheriting muted text or ink flattens the only rating signal beside SAMPLE
    // badges while sample-badge ink/#fff and markup presence locks stay green.
    expect(stylesCss).toMatch(
      /\.testimonial-stars\s*\{[^}]*color:\s*#d9a441/s
    );
  });

  test("service-card body copy stays muted under wood icon chips", () => {
    // Matching service-card h3 ink (or bleaching to surface) collapses the only
    // service description under each card title while icon wood locks pass.
    expect(stylesCss).toMatch(
      /\.service-card\s+p\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
  });

  test("about-copy paragraphs stay muted beside the portrait plane", () => {
    // Softening to inherited ink (or white) makes the founder bio compete with
    // the signature/name lock while about-portrait wood + caption scrim pass.
    expect(stylesCss).toMatch(
      /\.about-copy\s+p\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
  });

  test("contact-form-card intro paragraph stays muted under the form H3", () => {
    // Matching the card h3 ink weight (or dropping color) erases hierarchy above
    // lead fields while form-field label weight + control fill locks stay green.
    expect(stylesCss).toMatch(
      /\.contact-form-card\s*>\s*p\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
  });

  test("form-note stays muted with a bold phone-link for the call fallback", () => {
    // Bleaching the note (or normal-weight phone-link) hides the only tel: CTA
    // under the submit button while form-status tint/contrast locks remain green.
    expect(stylesCss).toMatch(
      /\.form-note\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
    expect(stylesCss).toMatch(
      /\.form-note\s+\.phone-link\s*\{[^}]*font-weight:\s*700/s
    );
  });
});

describe("testimonial quote + author hierarchy", () => {
  test("testimonial-card quotes stay italic in readable body text color", () => {
    // Dropping italic (or inheriting muted/ink from neighboring rules) flattens
    // quote voice into card chrome while gold stars + sample-badge locks pass.
    expect(stylesCss).toMatch(
      /\.testimonial-card\s+p\s*\{[^}]*font-style:\s*italic/s
    );
    expect(stylesCss).toMatch(
      /\.testimonial-card\s+p\s*\{[^}]*color:\s*var\(--color-text\)/s
    );
  });

  test("testimonial-author keeps bold name weight with muted role span", () => {
    // Normal-weight authors (or role spans matching name weight/color) erase the
    // only attribution hierarchy under each quote while SAMPLE disclosure locks
    // stay green.
    expect(stylesCss).toMatch(
      /\.testimonial-author\s*\{[^}]*font-weight:\s*700/s
    );
    expect(stylesCss).toMatch(
      /\.testimonial-author\s+span\s*\{[^}]*font-weight:\s*400/s
    );
    expect(stylesCss).toMatch(
      /\.testimonial-author\s+span\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
  });
});

describe("about signature identity contrast", () => {
  test("about-signature strong keeps ink for the founder name", () => {
    // Softening the name to muted text (or bleaching to surface) hides the only
    // identity lock under the bio while about-copy muted + portrait wood pass.
    expect(stylesCss).toMatch(
      /\.about-signature\s+strong\s*\{[^}]*color:\s*var\(--color-ink\)/s
    );
  });

  test("about-signature role span stays muted beside the ink name", () => {
    // Matching the strong ink weight/color collapses name→title hierarchy while
    // about-copy paragraph muted locks remain green.
    expect(stylesCss).toMatch(
      /\.about-signature\s+span\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
  });
});

describe("lead form focus ring sage tint", () => {
  test("form control focus ring keeps the accent sage at 15% opacity", () => {
    // box-shadow presence + accent border alone still pass if the ring drifts to
    // ink/wood or 100% opaque sage — keyboard users then get a harsh or wrong-
    // brand cue on every lead field while outline:none remains intentional.
    expect(stylesCss).toMatch(
      /\.form-field\s+(?:input|select|textarea):focus[\s\S]*?box-shadow:\s*0\s+0\s+0\s+3px\s+rgb\(\s*79\s+109\s+82\s*\/\s*15%\s*\)/s
    );
  });
});

describe("accent token ↔ hard-coded sage RGB parity", () => {
  function accentRgbChannels() {
    const accentHex = stylesCss.match(/--color-accent:\s*(#[0-9a-fA-F]{6})/)?.[1];
    expect(accentHex).toBe("#4f6d52");
    return {
      r: parseInt(accentHex.slice(1, 3), 16),
      g: parseInt(accentHex.slice(3, 5), 16),
      b: parseInt(accentHex.slice(5, 7), 16),
    };
  }

  test("--color-accent decodes to the sage RGB used across tinted surfaces", () => {
    // Hero atmosphere, eyebrow/form-status pills, and the lead focus ring all
    // hard-code rgb(R G B / α) instead of var(--color-accent). Token-only or
    // literal-only locks still pass when one side drifts — brand sage then
    // splits between CSS variables and the surfaces visitors actually see.
    const { r, g, b } = accentRgbChannels();
    expect([r, g, b]).toEqual([79, 109, 82]);

    const sage12 = new RegExp(
      `rgb\\(\\s*${r}\\s+${g}\\s+${b}\\s*/\\s*12%\\s*\\)`
    );
    const sage15 = new RegExp(
      `rgb\\(\\s*${r}\\s+${g}\\s+${b}\\s*/\\s*15%\\s*\\)`
    );

    expect(stylesCss).toMatch(
      new RegExp(
        `\\.hero\\s*\\{[^}]*radial-gradient\\([^;]*${sage12.source}`
      )
    );
    expect(stylesCss).toMatch(
      new RegExp(`\\.hero-eyebrow\\s*\\{[^}]*background-color:\\s*${sage12.source}`)
    );
    const statusBlock = stylesCss.match(/\.form-status\s*\{[^}]*\}/);
    expect(statusBlock).toBeTruthy();
    expect(statusBlock[0]).toMatch(
      new RegExp(`background-color:\\s*${sage12.source}`)
    );
    expect(stylesCss).toMatch(
      new RegExp(
        `\\.form-field\\s+(?:input|select|textarea):focus[\\s\\S]*?box-shadow:\\s*0\\s+0\\s+0\\s+3px\\s+${sage15.source}`
      )
    );
  });
});

describe("about signature separator + flex layout", () => {
  test("about-signature keeps a top border separator and flex gap", () => {
    // Color locks on strong/span still pass if the signature collapses into the
    // bio (no hairline, no flex gap) — founder name/title then read as another
    // paragraph instead of a distinct identity block under the portrait copy.
    expect(stylesCss).toMatch(
      /\.about-signature\s*\{[^}]*border-top:\s*1px\s+solid\s+var\(--color-border\)/s
    );
    expect(stylesCss).toMatch(/\.about-signature\s*\{[^}]*display:\s*flex/s);
    expect(stylesCss).toMatch(/\.about-signature\s*\{[^}]*gap:\s*16px/s);
  });
});

describe("testimonial author size hierarchy", () => {
  test("testimonial-author keeps compact name size with smaller muted role", () => {
    // Weight/color locks still pass if author type scales to body/quote size —
    // SAMPLE attribution then competes with the italic quote while gold stars
    // and sample-badge contracts remain green.
    expect(stylesCss).toMatch(
      /\.testimonial-author\s*\{[^}]*font-size:\s*0\.92rem/s
    );
    expect(stylesCss).toMatch(
      /\.testimonial-author\s+span\s*\{[^}]*font-size:\s*0\.84rem/s
    );
  });
});

describe("value-list trust signal tokens", () => {
  test("value-list icons keep accent with muted supporting spans", () => {
    // About-page trust bullets lose scan hierarchy if icons inherit muted text
    // (or descriptions match title ink) while portrait/signature locks stay green.
    expect(stylesCss).toMatch(
      /\.value-list\s+svg\s*\{[^}]*color:\s*var\(--color-accent\)/s
    );
    expect(stylesCss).toMatch(
      /\.value-list\s+span\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
  });
});

describe("contact hours-row layout tokens", () => {
  test("hours-row keeps day/hours space-between with a dashed separator", () => {
    // Availability content locks still pass if rows stack or lose the dashed
    // hairline — day labels and hours then collide into a single unreadable
    // line on the contact sidebar while contact-hours h4 muted stays green.
    expect(stylesCss).toMatch(
      /\.hours-row\s*\{[^}]*justify-content:\s*space-between/s
    );
    expect(stylesCss).toMatch(
      /\.hours-row\s*\{[^}]*border-bottom:\s*1px\s+dashed\s+var\(--color-border\)/s
    );
    expect(stylesCss).toMatch(
      /\.hours-row:last-child\s*\{[^}]*border-bottom:\s*none/s
    );
  });

  test("hours-row stays flex at compact body size so day/hours stay on one line", () => {
    // justify-content alone is a no-op without display:flex, and oversized type
    // wraps day labels into the hours column — availability then looks broken
    // while dashed-separator + content-pair locks stay green.
    expect(stylesCss).toMatch(/\.hours-row\s*\{[^}]*display:\s*flex/s);
    expect(stylesCss).toMatch(/\.hours-row\s*\{[^}]*font-size:\s*0\.92rem/s);
  });
});

describe("wood token ↔ hard-coded RGB parity", () => {
  function woodRgbChannels() {
    const woodHex = stylesCss.match(/--color-wood:\s*(#[0-9a-fA-F]{6})/)?.[1];
    expect(woodHex).toBe("#7a4a2b");
    return {
      r: parseInt(woodHex.slice(1, 3), 16),
      g: parseInt(woodHex.slice(3, 5), 16),
      b: parseInt(woodHex.slice(5, 7), 16),
    };
  }

  test("--color-wood decodes to the hero radial wood RGB tint", () => {
    // Hero atmosphere hard-codes rgb(R G B / 10%) while brand marks / nav /
    // service icons use var(--color-wood). Token-only or literal-only locks
    // still pass when one side drifts — visitors then see a split wood brand
    // between the hero wash and every other wood accent on the page.
    const { r, g, b } = woodRgbChannels();
    expect([r, g, b]).toEqual([122, 74, 43]);

    const wood10 = new RegExp(
      `rgb\\(\\s*${r}\\s+${g}\\s+${b}\\s*/\\s*10%\\s*\\)`
    );

    expect(stylesCss).toMatch(
      new RegExp(
        `\\.hero\\s*\\{[^}]*radial-gradient\\([^;]*${wood10.source}`
      )
    );
  });
});

describe("value-list strong title hierarchy", () => {
  test("value-list strong stays block-level at body size above muted spans", () => {
    // Icon accent + muted span locks still pass if strong titles inline into
    // the description (or shrink/grow past body) — trust bullets then lose the
    // only scan hierarchy that separates title from supporting copy.
    expect(stylesCss).toMatch(
      /\.value-list\s+strong\s*\{[^}]*display:\s*block/s
    );
    expect(stylesCss).toMatch(
      /\.value-list\s+strong\s*\{[^}]*font-size:\s*1rem/s
    );
  });

  test("value-list strong keeps a small margin under the title before muted copy", () => {
    // Block + 1rem locks still pass if margin-bottom is dropped — title and
    // description then collide into one dense paragraph while icon/span color
    // contracts remain green.
    expect(stylesCss).toMatch(
      /\.value-list\s+strong\s*\{[^}]*margin-bottom:\s*2px/s
    );
  });
});

describe("about-signature strong typography", () => {
  test("about-signature strong keeps heading font at an elevated size", () => {
    // Ink color + separator locks still pass if the founder name drops to body
    // font/size — signature identity then reads as another muted bio line while
    // role-span muted contracts remain green.
    expect(stylesCss).toMatch(
      /\.about-signature\s+strong\s*\{[^}]*font-family:\s*var\(--font-heading\)/s
    );
    expect(stylesCss).toMatch(
      /\.about-signature\s+strong\s*\{[^}]*font-size:\s*1\.2rem/s
    );
  });

  test("about-signature role span stays compact beside the elevated name", () => {
    // Strong typography alone still passes if the role span scales up to name
    // size — name→title hierarchy collapses while ink/muted color locks stay green.
    expect(stylesCss).toMatch(
      /\.about-signature\s+span\s*\{[^}]*font-size:\s*0\.88rem/s
    );
  });
});

describe("ink token ↔ hard-coded RGB parity", () => {
  function inkRgbChannels() {
    const inkHex = stylesCss.match(/--color-ink:\s*(#[0-9a-fA-F]{6})/)?.[1];
    expect(inkHex).toBe("#1e1a17");
    return {
      r: parseInt(inkHex.slice(1, 3), 16),
      g: parseInt(inkHex.slice(3, 5), 16),
      b: parseInt(inkHex.slice(5, 7), 16),
    };
  }

  test("--color-ink decodes to the RGB used by portrait overlay and elevation shadows", () => {
    // Portrait caption + --shadow-* hard-code rgb(R G B / α) while brand/footer
    // chrome uses var(--color-ink). Token-only or literal-only locks still pass
    // when one side drifts — overlay/elevation then diverge from every other
    // ink surface (footer, buttons, wordmark).
    const { r, g, b } = inkRgbChannels();
    expect([r, g, b]).toEqual([30, 26, 23]);

    const ink72 = new RegExp(
      `rgb\\(\\s*${r}\\s+${g}\\s+${b}\\s*/\\s*72%\\s*\\)`
    );
    const ink8 = new RegExp(
      `rgb\\(\\s*${r}\\s+${g}\\s+${b}\\s*/\\s*8%\\s*\\)`
    );
    const ink10 = new RegExp(
      `rgb\\(\\s*${r}\\s+${g}\\s+${b}\\s*/\\s*10%\\s*\\)`
    );
    const ink16 = new RegExp(
      `rgb\\(\\s*${r}\\s+${g}\\s+${b}\\s*/\\s*16%\\s*\\)`
    );

    expect(stylesCss).toMatch(
      new RegExp(
        `\\.about-portrait-caption\\s*\\{[^}]*background(?:-color)?:\\s*${ink72.source}`
      )
    );
    expect(stylesCss).toMatch(
      new RegExp(`--shadow-sm:\\s*0\\s+1px\\s+3px\\s+${ink8.source}`)
    );
    expect(stylesCss).toMatch(
      new RegExp(`--shadow-md:\\s*0\\s+8px\\s+24px\\s+${ink10.source}`)
    );
    expect(stylesCss).toMatch(
      new RegExp(`--shadow-lg:\\s*0\\s+20px\\s+50px\\s+${ink16.source}`)
    );
  });
});

describe("about-signature strong block layout", () => {
  test("about-signature strong stays display:block so the role spans below the name", () => {
    // Heading font/size + ink color locks still pass if strong stays inline —
    // founder name and muted role then share one line and the signature reads
    // as a single bio fragment while typography contracts remain green.
    expect(stylesCss).toMatch(
      /\.about-signature\s+strong\s*\{[^}]*display:\s*block/s
    );
  });
});

describe("value-list row layout + supporting copy size", () => {
  test("value-list li stays a flex row with icon→copy gap and top alignment", () => {
    // Strong/span hierarchy locks still pass if list items lose display:flex
    // (or the 14px gap / flex-start alignment) — icons then stack above titles
    // or baseline-align into multi-line copy while color contracts stay green.
    expect(stylesCss).toMatch(/\.value-list\s+li\s*\{[^}]*display:\s*flex/s);
    expect(stylesCss).toMatch(/\.value-list\s+li\s*\{[^}]*gap:\s*14px/s);
    expect(stylesCss).toMatch(
      /\.value-list\s+li\s*\{[^}]*align-items:\s*flex-start/s
    );
  });

  test("value-list icons keep a fixed box and flex-shrink so glyphs do not collapse", () => {
    // Flex-row locks still pass if svg width/height or flex-shrink:0 drops —
    // long trust titles then crush the accent mark while color contracts stay
    // green.
    expect(stylesCss).toMatch(/\.value-list\s+svg\s*\{[^}]*width:\s*22px/s);
    expect(stylesCss).toMatch(/\.value-list\s+svg\s*\{[^}]*height:\s*22px/s);
    expect(stylesCss).toMatch(
      /\.value-list\s+svg\s*\{[^}]*flex-shrink:\s*0/s
    );
  });

  test("value-list supporting spans stay compact under strong titles", () => {
    // Muted color + strong 1rem locks still pass if span font-size rises to
    // match the title — trust bullets lose title→description hierarchy while
    // block/margin contracts remain green.
    expect(stylesCss).toMatch(
      /\.value-list\s+span\s*\{[^}]*font-size:\s*0\.93rem/s
    );
  });
});

describe("about-signature block spacing", () => {
  test("about-signature keeps top margin and padding so it separates from bio copy", () => {
    // Border + flex/gap locks still pass if margin-top/padding-top collapse —
    // founder identity then sits flush against the last about paragraph while
    // strong/span typography contracts remain green.
    expect(stylesCss).toMatch(
      /\.about-signature\s*\{[^}]*margin-top:\s*28px/s
    );
    expect(stylesCss).toMatch(
      /\.about-signature\s*\{[^}]*padding-top:\s*24px/s
    );
  });

  test("about-signature vertically centers avatar and name/role columns", () => {
    // display:flex + gap alone still pass if align-items drifts to stretch/start —
    // portrait mark and signature text then misalign while separator contracts
    // stay green.
    expect(stylesCss).toMatch(
      /\.about-signature\s*\{[^}]*align-items:\s*center/s
    );
  });
});

describe("value-list grid spacing", () => {
  test("value-list stays a grid with 16px row gap between trust bullets", () => {
    // Per-li flex metrics still pass if the list loses display:grid or gap:16px —
    // bullets then stack flush (or fall back to sparse default gaps) while icon
    // box / strong hierarchy contracts remain green.
    expect(stylesCss).toMatch(/\.value-list\s*\{[^}]*display:\s*grid/s);
    expect(stylesCss).toMatch(/\.value-list\s*\{[^}]*gap:\s*16px/s);
  });

  test("value-list keeps top margin so trust bullets clear the about copy", () => {
    // Grid gap alone still passes if margin-top drops — trust bullets collide
    // with the last about paragraph while li flex contracts stay green.
    expect(stylesCss).toMatch(/\.value-list\s*\{[^}]*margin-top:\s*28px/s);
  });

  test("value-list icons keep a small top offset to optically align with titles", () => {
    // Fixed 22px box + flex-shrink locks still pass if margin-top:3px is dropped —
    // accent glyphs then sit high relative to strong titles while color contracts
    // remain green.
    expect(stylesCss).toMatch(
      /\.value-list\s+svg\s*\{[^}]*margin-top:\s*3px/s
    );
  });
});

describe("scroll-reveal entry motion tokens", () => {
  test("[data-reveal] starts hidden with the documented 18px entry translate", () => {
    // .is-visible restore locks still pass if the resting state loses opacity:0
    // or the entry offset drifts (e.g. 0 / 40px) — lead cards then either flash
    // fully visible before IO or overshoot under sticky chrome while observer
    // option contracts stay green.
    expect(stylesCss).toMatch(
      /\[data-reveal\]\s*\{[^}]*opacity:\s*0/s
    );
    expect(stylesCss).toMatch(
      /\[data-reveal\]\s*\{[^}]*transform:\s*translateY\(18px\)/s
    );
  });

  test("[data-reveal] keeps a 600ms opacity+transform transition for the reveal", () => {
    // Exact translate/opacity locks still pass if transition is dropped or
    // shortened to instant — scroll reveals then pop without motion (or animate
    // forever if duration balloons) while prefers-reduced-motion:none contracts
    // remain green for users who allow motion.
    expect(stylesCss).toMatch(
      /\[data-reveal\]\s*\{[^}]*transition:\s*opacity\s+600ms\s+ease\s*,\s*transform\s+600ms\s+ease/s
    );
  });
});

describe("contact hours-row vertical rhythm", () => {
  test("hours-row keeps compact vertical padding around day/hours pairs", () => {
    // Flex + dashed separator locks still pass if padding collapses to 0 —
    // Availability rows then feel cramped and harder to scan while content-pair
    // and font-size contracts remain green.
    expect(stylesCss).toMatch(
      /\.hours-row\s*\{[^}]*padding:\s*6px\s+0/s
    );
  });
});

describe("contact lead-card surface + padding", () => {
  test("contact-form-card keeps a white surface, border, and generous padding", () => {
    // Intro muted-copy + field fill locks still pass if the card loses
    // --color-surface / border / padding:40px — the quote form then blends into
    // the cream page or crowds controls while form-field contracts stay green.
    expect(stylesCss).toMatch(
      /\.contact-form-card\s*\{[^}]*background-color:\s*var\(--color-surface\)/s
    );
    expect(stylesCss).toMatch(
      /\.contact-form-card\s*\{[^}]*border:\s*1px\s+solid\s+var\(--color-border\)/s
    );
    expect(stylesCss).toMatch(
      /\.contact-form-card\s*\{[^}]*padding:\s*40px/s
    );
  });

  test("contact-info-card keeps a white surface, border, and sidebar padding", () => {
    // Phone/email wood icon + hours-row locks still pass if the info card loses
    // surface/border/padding:36px — contact details then sit flush on cream
    // (or crowd the Availability block) while content contracts remain green.
    expect(stylesCss).toMatch(
      /\.contact-info-card\s*\{[^}]*background-color:\s*var\(--color-surface\)/s
    );
    expect(stylesCss).toMatch(
      /\.contact-info-card\s*\{[^}]*border:\s*1px\s+solid\s+var\(--color-border\)/s
    );
    expect(stylesCss).toMatch(
      /\.contact-info-card\s*\{[^}]*padding:\s*36px/s
    );
  });

  test("contact-hours keeps a top border separator above Availability rows", () => {
    // hours-row dashed separators alone still pass if contact-hours loses its
    // border-top — day/hours then run into the city list with no section break
    // while muted h4 + row padding contracts stay green.
    expect(stylesCss).toMatch(
      /\.contact-hours\s*\{[^}]*border-top:\s*1px\s+solid\s+var\(--color-border\)/s
    );
    expect(stylesCss).toMatch(
      /\.contact-hours\s*\{[^}]*padding-top:\s*22px/s
    );
  });
});

describe("about-portrait plane geometry", () => {
  test("about-portrait keeps a tall 4/5 plane with overflow clipped for the caption", () => {
    // Wood color + caption scrim locks still pass if aspect-ratio or
    // overflow:hidden drops — the craftsman mark then sits in a squat box and
    // the absolute caption can paint outside the portrait while color contracts
    // remain green.
    expect(stylesCss).toMatch(
      /\.about-portrait\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*5/s
    );
    expect(stylesCss).toMatch(
      /\.about-portrait\s*\{[^}]*overflow:\s*hidden/s
    );
    expect(stylesCss).toMatch(
      /\.about-portrait\s*\{[^}]*position:\s*relative/s
    );
  });

  test("about-portrait centers the placeholder mark with flex", () => {
    // aspect-ratio alone still passes if display:flex / centering drops — the
    // wood SVG then pins to the top-left of the plane while caption overlay
    // contracts stay green.
    expect(stylesCss).toMatch(/\.about-portrait\s*\{[^}]*display:\s*flex/s);
    expect(stylesCss).toMatch(
      /\.about-portrait\s*\{[^}]*align-items:\s*center/s
    );
    expect(stylesCss).toMatch(
      /\.about-portrait\s*\{[^}]*justify-content:\s*center/s
    );
  });

  test("about-portrait-caption stays absolutely pinned to the portrait bottom", () => {
    // Ink 72% scrim + white text locks still pass if position/inset drift —
    // the "Photo of Greg Felton" strip then flows in document order under the
    // plane instead of overlaying it while color contracts remain green.
    expect(stylesCss).toMatch(
      /\.about-portrait-caption\s*\{[^}]*position:\s*absolute/s
    );
    expect(stylesCss).toMatch(
      /\.about-portrait-caption\s*\{[^}]*bottom:\s*0/s
    );
    expect(stylesCss).toMatch(
      /\.about-portrait-caption\s*\{[^}]*left:\s*0/s
    );
    expect(stylesCss).toMatch(
      /\.about-portrait-caption\s*\{[^}]*right:\s*0/s
    );
  });
});

describe("lead form-row responsive columns", () => {
  test("form-row keeps a two-column grid for name/phone on wide contact layouts", () => {
    // Individual form-field fill/focus locks still pass if form-row loses
    // display:grid or 1fr 1fr — name and phone then stack (or stretch unevenly)
    // on desktop while label/control contracts stay green.
    expect(stylesCss).toMatch(/\.form-row\s*\{[^}]*display:\s*grid/s);
    expect(stylesCss).toMatch(
      /\.form-row\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/s
    );
  });

  test("form-row collapses to a single column at max-width 540px", () => {
    // Two-column desktop locks still pass if the 540px stack media query is
    // dropped — narrow phones then squeeze name+phone side-by-side and clip
    // labels while resting field contracts remain green.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*540px\s*\)[\s\S]*?\.form-row\s*\{[^}]*grid-template-columns:\s*1fr/s
    );
  });
});

describe("about-portrait craftsman mark scale", () => {
  test("about-portrait svg keeps a 44% box so the mark stays secondary to the plane", () => {
    // Portrait flex centering + wood color locks still pass if width/height
    // drift to 100% (or shrink to icon size) — the placeholder craftsman mark
    // then dominates or vanishes inside the 4/5 plane while caption overlay
    // contracts stay green.
    expect(stylesCss).toMatch(
      /\.about-portrait\s+svg\s*\{[^}]*width:\s*44%/s
    );
    expect(stylesCss).toMatch(
      /\.about-portrait\s+svg\s*\{[^}]*height:\s*44%/s
    );
  });

  test("about-portrait svg keeps soft opacity so the caption remains primary", () => {
    // Size locks alone still pass if opacity rises to 1 (or drops near 0) —
    // the mark then competes with the "Photo of Greg Felton" strip or
    // disappears while wood color + caption scrim contracts remain green.
    expect(stylesCss).toMatch(
      /\.about-portrait\s+svg\s*\{[^}]*opacity:\s*0\.75/s
    );
  });
});

describe("contact-form-card heading + intro spacing", () => {
  test("contact-form-card h3 keeps a 1.3rem title size above the lead form", () => {
    // Card surface/padding + muted intro color locks still pass if the h3
    // shrinks to body size (or balloons toward section H2) — "Request a Free
    // Quote" then loses hierarchy over fields while form-row contracts stay
    // green.
    expect(stylesCss).toMatch(
      /\.contact-form-card\s+h3\s*\{[^}]*font-size:\s*1\.3rem/s
    );
  });

  test("contact-form-card intro keeps spacing below the title and before fields", () => {
    // Muted intro color alone still passes if h3 margin-bottom or intro
    // margin-bottom:28px drops — title/copy/fields then collide into one
    // dense block while surface padding + form-row contracts remain green.
    expect(stylesCss).toMatch(
      /\.contact-form-card\s+h3\s*\{[^}]*margin-bottom:\s*8px/s
    );
    expect(stylesCss).toMatch(
      /\.contact-form-card\s*>\s*p\s*\{[^}]*margin-bottom:\s*28px/s
    );
  });
});

describe("lead message textarea geometry", () => {
  test("message textarea keeps min-height 130px for multi-line project detail", () => {
    // Shared form-field fill/focus + multi-line mailto body locks still pass if
    // textarea min-height collapses — visitors then get a single-line-tall box
    // for the project message while control color contracts stay green.
    expect(stylesCss).toMatch(
      /\.form-field\s+textarea\s*\{[^}]*min-height:\s*130px/s
    );
  });

  test("message textarea stays vertically resizable (not locked or horizontal-only)", () => {
    // min-height alone still passes if resize becomes none or horizontal —
    // long project descriptions then cannot grow the control while focus-ring
    // and resting fill contracts remain green.
    expect(stylesCss).toMatch(
      /\.form-field\s+textarea\s*\{[^}]*resize:\s*vertical/s
    );
  });
});

describe("hours-row trailing separator", () => {
  test("hours-row:last-child drops the dashed bottom border under Sunday", () => {
    // Per-row dashed border + padding locks still pass if :last-child keeps a
    // bottom rule — Availability then ends with a dangling separator under
    // "Sunday / Closed" while day/hours content contracts stay green.
    expect(stylesCss).toMatch(
      /\.hours-row:last-child\s*\{[^}]*border-bottom:\s*none/s
    );
  });
});

describe("about-portrait-caption type + inset padding", () => {
  test("about-portrait-caption keeps compact type so the strip stays secondary", () => {
    // Absolute pin + ink 72% scrim locks still pass if font-size balloons to
    // body rem — "Photo of Greg Felton" then dominates the 4/5 plane while
    // craftsman-mark opacity and overlay-position contracts remain green.
    expect(stylesCss).toMatch(
      /\.about-portrait-caption\s*\{[^}]*font-size:\s*0\.82rem/s
    );
  });

  test("about-portrait-caption keeps horizontal/vertical inset padding", () => {
    // Color + absolute inset locks still pass if padding collapses — caption
    // text then kisses the portrait edges (or overflows the clipped plane)
    // while ink scrim and white-text contracts stay green.
    expect(stylesCss).toMatch(
      /\.about-portrait-caption\s*\{[^}]*padding:\s*14px\s+18px/s
    );
  });

  test("about-portrait-caption stays centered over the portrait plane", () => {
    // Size/padding alone still pass if text-align drifts left — the photo
    // label then sits off-center under a centered craftsman mark while
    // overlay pin contracts remain green.
    expect(stylesCss).toMatch(
      /\.about-portrait-caption\s*\{[^}]*text-align:\s*center/s
    );
  });
});

describe("lead form-field vertical rhythm", () => {
  test("form-field keeps margin-bottom so stacked controls stay scannable", () => {
    // Label weight + control fill/focus locks still pass if margin-bottom:20px
    // drops — name/email/phone/service/message then collide into one dense
    // stack while form-row columns and textarea min-height remain green.
    expect(stylesCss).toMatch(
      /\.form-field\s*\{[^}]*margin-bottom:\s*20px/s
    );
  });

  test("form-field labels keep readable size and gap above controls", () => {
    // Semibold weight alone still passes if font-size or label margin-bottom
    // collapses — labels then crowd (or dwarf) inputs while id/name pairing
    // and control fill contracts stay green.
    expect(stylesCss).toMatch(
      /\.form-field\s+label\s*\{[^}]*font-size:\s*0\.9rem/s
    );
    expect(stylesCss).toMatch(
      /\.form-field\s+label\s*\{[^}]*margin-bottom:\s*8px/s
    );
  });

  test("form-field labels stay display:block so labels stack above controls", () => {
    // Font-size + margin-bottom locks still pass if display:block drops —
    // inline labels then sit beside (or wrap into) inputs while id/name
    // pairing and shared control geometry contracts remain green.
    expect(stylesCss).toMatch(
      /\.form-field\s+label\s*\{[^}]*display:\s*block/s
    );
  });
});

describe("lead form shared control geometry", () => {
  test("shared form controls keep 13px 14px padding for tap-friendly typing", () => {
    // Cream fill + text color locks still pass if padding shrinks — name/email/
    // phone/service/message then feel cramped (especially on mobile) while
    // focus-ring and textarea min-height contracts remain green.
    expect(stylesCss).toMatch(
      /\.form-field\s+(?:input|select|textarea)\s*\{[^}]*padding:\s*13px\s+14px/s
    );
  });

  test("shared form controls keep a 1.5px border against the cream fill", () => {
    // Background/color alone still pass if border thins to 1px or vanishes —
    // resting fields then blend into --color-bg and only appear on focus while
    // accent focus-ring contracts stay green.
    expect(stylesCss).toMatch(
      /\.form-field\s+(?:input|select|textarea)\s*\{[^}]*border:\s*1\.5px\s+solid\s+var\(--color-border\)/s
    );
  });

  test("shared form controls stretch full width inside the form card", () => {
    // Padding/border locks still pass if width:100% drops — select/textarea
    // then shrink to content width beside labels while form-row grid and
    // field spacing contracts remain green.
    expect(stylesCss).toMatch(
      /\.form-field\s+(?:input|select|textarea)\s*\{[^}]*width:\s*100%/s
    );
  });

  test("shared form controls keep radius-sm corners for brand-matched typing surfaces", () => {
    // Padding/border/width locks still pass if border-radius drifts to 0 or a
    // pill — lead fields then clash with .btn radius-sm while form-row and
    // focus-ring contracts remain green.
    expect(stylesCss).toMatch(
      /\.form-field\s+(?:input|select|textarea)\s*\{[^}]*border-radius:\s*var\(--radius-sm\)/s
    );
  });

  test("shared form controls inherit site typeface at 0.96rem for readable typing", () => {
    // Geometry locks still pass if font-family falls back to UA defaults or
    // font-size shrinks — name/email/phone/service/message then look alien
    // beside Inter body copy while cream fill and focus-ring stay green.
    expect(stylesCss).toMatch(
      /\.form-field\s+(?:input|select|textarea)\s*\{[^}]*font-family:\s*inherit/s
    );
    expect(stylesCss).toMatch(
      /\.form-field\s+(?:input|select|textarea)\s*\{[^}]*font-size:\s*0\.96rem/s
    );
  });
});

describe("lead form-note type + spacing", () => {
  test("form-note keeps compact 0.82rem type under the submit CTA", () => {
    // Muted color + bold phone-link locks still pass if font-size grows to
    // body — the call-fallback note then competes with the submit button while
    // form-status tint/contrast contracts remain green.
    expect(stylesCss).toMatch(
      /\.form-note\s*\{[^}]*font-size:\s*0\.82rem/s
    );
  });

  test("form-note keeps margin-top so it clears the submit button", () => {
    // Color/weight locks still pass if margin-top:14px collapses — the phone
    // fallback then crowds the primary CTA while form-status is-visible and
    // shared control geometry contracts stay green.
    expect(stylesCss).toMatch(
      /\.form-note\s*\{[^}]*margin-top:\s*14px/s
    );
  });
});

describe("lead form-status type + spacing", () => {
  test("form-status keeps margin-top so confirmation clears the call-fallback note", () => {
    // Tint/contrast locks still pass if margin-top:16px collapses — the sage
    // confirmation panel then crowds the form-note phone CTA while is-visible
    // display and accent-dark text contracts remain green.
    expect(stylesCss).toMatch(
      /\.form-status\s*\{[^}]*margin-top:\s*16px/s
    );
  });

  test("form-status keeps 14px 16px padding for readable confirmation copy", () => {
    // Color/background locks still pass if padding shrinks — the mailto status
    // line then looks cramped against the sage fill while font-weight and
    // is-visible display contracts stay green.
    expect(stylesCss).toMatch(
      /\.form-status\s*\{[^}]*padding:\s*14px\s+16px/s
    );
  });

  test("form-status keeps radius-sm corners matching lead controls", () => {
    // Tint/contrast locks still pass if border-radius drifts to 0 or a pill —
    // the confirmation panel then clashes with shared control radius-sm while
    // form-note spacing and accent RGB parity contracts remain green.
    expect(stylesCss).toMatch(
      /\.form-status\s*\{[^}]*border-radius:\s*var\(--radius-sm\)/s
    );
  });

  test("form-status keeps 0.9rem semibold type for the mailto confirmation", () => {
    // Panel fill/text-color locks still pass if font-size shrinks or weight
    // drops to 400 — confirmation copy then reads as muted body text and is
    // easy to miss after submit while is-visible display stays green.
    expect(stylesCss).toMatch(
      /\.form-status\s*\{[^}]*font-size:\s*0\.9rem/s
    );
    expect(stylesCss).toMatch(
      /\.form-status\s*\{[^}]*font-weight:\s*600/s
    );
  });
});

describe("lead form-note phone-link tel parity", () => {
  test("form-note keeps a phone-link tel: CTA inside the contact form", () => {
    // Global tel digit parity still passes if the under-submit call fallback
    // loses its link (or becomes a non-tel href) while nav/footer phones remain
    // correct — visitors who prefer calling after a failed mailto then have no
    // in-form path.
    const formBlock = contactHtml.match(
      /<form\b[^>]*\bdata-contact-form\b[\s\S]*?<\/form>/
    );
    expect(formBlock).toBeTruthy();
    const noteBlock = formBlock[0].match(
      /<p\b[^>]*\bclass="[^"]*\bform-note\b[^"]*"[^>]*>[\s\S]*?<\/p>/
    );
    expect(noteBlock).toBeTruthy();
    const phoneLink = noteBlock[0].match(
      /<a\b[^>]*\bhref="(tel:[^"]+)"[^>]*\bclass="[^"]*\bphone-link\b[^"]*"[^>]*>([\s\S]*?)<\/a>/
    );
    expect(phoneLink).toBeTruthy();

    const stripDigits = (value) => String(value).replace(/\D/g, "");
    const noteTelDigits = stripDigits(phoneLink[1]);
    expect(noteTelDigits.length).toBeGreaterThanOrEqual(10);

    const pageTelDigits = stripDigits(
      collectMatches(contactHtml, /href="(tel:[^"]+)"/g)[0]
    );
    expect(noteTelDigits).toBe(pageTelDigits);

    const visibleDigits = stripDigits(
      decodeBasicEntities(phoneLink[2].replace(/<[^>]+>/g, ""))
    );
    expect(visibleDigits.length).toBeGreaterThanOrEqual(10);
    expect(
      noteTelDigits === visibleDigits || noteTelDigits.endsWith(visibleDigits)
    ).toBe(true);
  });
});

describe("lead form post-submit DOM order", () => {
  test("submit CTA precedes form-note, which precedes form-status", () => {
    // Geometry/tint/tel/is-visible locks still pass if markup reorders these
    // three nodes — confirmation can appear above the Send Message button, or
    // the call-fallback note can push above the primary CTA, while mailto +
    // status text contracts remain green.
    const formBlock = contactHtml.match(
      /<form\b[^>]*\bdata-contact-form\b[\s\S]*?<\/form>/
    );
    expect(formBlock).toBeTruthy();
    const submitIdx = formBlock[0].search(
      /<button\b[^>]*\btype="submit"[^>]*>/i
    );
    const noteIdx = formBlock[0].search(
      /<p\b[^>]*\bclass="[^"]*\bform-note\b/
    );
    const statusIdx = formBlock[0].search(/\bdata-form-status\b/);
    expect(submitIdx).toBeGreaterThanOrEqual(0);
    expect(noteIdx).toBeGreaterThan(submitIdx);
    expect(statusIdx).toBeGreaterThan(noteIdx);
  });
});

describe("lead message placeholder guidance", () => {
  test("project message textarea keeps location/timeline placeholder cues", () => {
    // Required + min-height + resize locks still pass if the placeholder is
    // dropped or rewritten without location/timeline prompts — lead quality
    // then degrades silently while HTML5 validation and mailto body labels
    // stay green.
    const textarea = contactHtml.match(
      /<textarea\b[^>]*\bid="message"[^>]*>/
    );
    expect(textarea).toBeTruthy();
    const placeholder = textarea[0].match(/\bplaceholder="([^"]*)"/);
    expect(placeholder).toBeTruthy();
    const cue = placeholder[1].toLowerCase();
    expect(cue).toMatch(/location/);
    expect(cue).toMatch(/timeline/);
  });
});

describe("contact lead-card corner radius", () => {
  test("contact form and info cards keep radius-lg corners", () => {
    // Surface/border/padding locks still pass if border-radius drops to 0 or
    // radius-sm — the quote + sidebar cards then look flush/sharp against the
    // cream page while field geometry and hours-row contracts stay green.
    expect(stylesCss).toMatch(
      /\.contact-form-card\s*\{[^}]*border-radius:\s*var\(--radius-lg\)/s
    );
    expect(stylesCss).toMatch(
      /\.contact-info-card\s*\{[^}]*border-radius:\s*var\(--radius-lg\)/s
    );
  });
});

describe("sticky header backdrop readability", () => {
  test("site-header keeps a saturated blur behind the translucent cream chrome", () => {
    // Channel↔92% alpha locks still pass if backdrop-filter is removed — sticky
    // nav then sits as a flat translucent cream over busy hero/section content
    // and section titles can show through while opacity parity stays green.
    expect(stylesCss).toMatch(
      /\.site-header\s*\{[^}]*backdrop-filter:\s*saturate\(\s*160%\s*\)\s+blur\(\s*8px\s*\)/s
    );
  });
});

describe("contact-hours Availability heading hierarchy", () => {
  test("contact-hours h4 stays compact uppercase with tracking above day/hours rows", () => {
    // Muted color alone still passes if the h4 loses uppercase/letter-spacing and
    // grows to body size — Availability then reads as another hours-row instead of
    // the section label while day/hours content locks stay green.
    expect(stylesCss).toMatch(
      /\.contact-hours\s+h4\s*\{[^}]*font-size:\s*0\.9rem/s
    );
    expect(stylesCss).toMatch(
      /\.contact-hours\s+h4\s*\{[^}]*text-transform:\s*uppercase/s
    );
    expect(stylesCss).toMatch(
      /\.contact-hours\s+h4\s*\{[^}]*letter-spacing:\s*0\.05em/s
    );
    expect(stylesCss).toMatch(
      /\.contact-hours\s+h4\s*\{[^}]*margin-bottom:\s*12px/s
    );
  });
});

describe("trust-strip contrast on first-viewport chrome", () => {
  test("trust-strip keeps an ink surface with light trust-item copy", () => {
    // Hero gradient locks still pass if trust-strip inherits cream page bg — soft
    // cream trust-item text then vanishes under the hero while icon accent-light
    // and markup presence remain green.
    expect(stylesCss).toMatch(
      /\.trust-strip\s*\{[^}]*background-color:\s*var\(--color-ink\)/s
    );
    expect(stylesCss).toMatch(/\.trust-strip\s*\{[^}]*color:\s*#fff/s);
    expect(stylesCss).toMatch(/\.trust-item\s*\{[^}]*color:\s*#f2ece2/s);
  });

  test("trust-item icons keep accent-light on the dark trust strip", () => {
    // Matching trust-item cream or ink icons flatten the only glyph cue beside
    // each trust claim while strip ink/#fff locks stay green.
    expect(stylesCss).toMatch(
      /\.trust-item\s+svg\s*\{[^}]*color:\s*var\(--color-accent-light\)/s
    );
  });
});

describe("hero-visual quote card readability", () => {
  test("hero-visual keeps explicit white text on the wood gradient", () => {
    // Wood→wood-dark gradient locks still pass if color inherits cream-page ink —
    // the hero quote and Greg Felton signature then go dark-on-dark while
    // gradient contracts remain green.
    expect(stylesCss).toMatch(/\.hero-visual\s*\{[^}]*color:\s*#fff/s);
  });

  test("hero-visual-quote keeps heading type at elevated size for the brand quote", () => {
    // Falling back to body Inter at 1rem flattens the only quote on the wood
    // card while white color and gradient locks stay green.
    expect(stylesCss).toMatch(
      /\.hero-visual-quote\s*\{[^}]*font-family:\s*var\(--font-heading\)/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual-quote\s*\{[^}]*font-size:\s*1\.35rem/s
    );
  });
});

describe("service-area chip surface", () => {
  test("area-chip keeps a bordered white surface for town labels", () => {
    // Losing the surface/border bleaches chips into the cream page — areaServed
    // town labels then disappear while JSON-LD areaServed content locks pass.
    expect(stylesCss).toMatch(
      /\.area-chip\s*\{[^}]*background-color:\s*var\(--color-surface\)/s
    );
    expect(stylesCss).toMatch(
      /\.area-chip\s*\{[^}]*border:\s*1px\s+solid\s+var\(--color-border\)/s
    );
  });

  test("area-chip icons keep accent so town glyphs stay visible", () => {
    // Matching muted text or bleaching icons removes the only pin cue beside
    // each served town while chip surface and areaServed list locks stay green.
    expect(stylesCss).toMatch(
      /\.area-chip\s+svg\s*\{[^}]*color:\s*var\(--color-accent\)/s
    );
  });
});

describe("alternating section surface", () => {
  test("section-alt keeps bg-alt so alternating bands stay distinct from cream page", () => {
    // Matching --color-bg (or bleaching to surface) collapses the only band
    // cue between About/Services while heading hierarchy locks stay green.
    expect(stylesCss).toMatch(
      /\.section-alt\s*\{[^}]*background-color:\s*var\(--color-bg-alt\)/s
    );
  });
});

describe("service-card surface for catalog visibility", () => {
  test("service-card keeps a bordered white surface for service offerings", () => {
    // Icon wood/bg-alt and muted body locks still pass if the card loses its
    // surface/border — six service offerings then bleach into the cream page
    // while catalog↔form option parity stays green.
    expect(stylesCss).toMatch(
      /\.service-card\s*\{[^}]*background-color:\s*var\(--color-surface\)/s
    );
    expect(stylesCss).toMatch(
      /\.service-card\s*\{[^}]*border:\s*1px\s+solid\s+var\(--color-border\)/s
    );
  });
});

describe("gallery-tile placeholder surface", () => {
  test("gallery-tile keeps a dashed bordered surface and 4/3 plane", () => {
    // Icon wood-light + ink title locks still pass if tiles lose surface/border
    // or aspect-ratio — placeholder project categories then collapse into the
    // cream band while gallery markup presence stays green.
    expect(stylesCss).toMatch(
      /\.gallery-tile\s*\{[^}]*background-color:\s*var\(--color-surface\)/s
    );
    expect(stylesCss).toMatch(
      /\.gallery-tile\s*\{[^}]*border:\s*1\.5px\s+dashed\s+var\(--color-border\)/s
    );
    expect(stylesCss).toMatch(
      /\.gallery-tile\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3/s
    );
  });
});

describe("testimonial-card surface + SAMPLE badge anchor", () => {
  test("testimonial-card keeps a bordered white surface for social proof", () => {
    // Quote italic/text and gold stars locks still pass if the card bleaches
    // into cream — sample reviews then disappear while sample-badge ink/#fff
    // and author hierarchy contracts remain green.
    expect(stylesCss).toMatch(
      /\.testimonial-card\s*\{[^}]*background-color:\s*var\(--color-surface\)/s
    );
    expect(stylesCss).toMatch(
      /\.testimonial-card\s*\{[^}]*border:\s*1px\s+solid\s+var\(--color-border\)/s
    );
  });

  test("testimonial-card stays position:relative so SAMPLE badges anchor to the card", () => {
    // Ink/#fff sample-badge locks still pass if the card loses position:relative
    // — absolute SAMPLE chips then float against a distant ancestor while
    // quote/author contracts remain green.
    expect(stylesCss).toMatch(
      /\.testimonial-card\s*\{[^}]*position:\s*relative/s
    );
    expect(stylesCss).toMatch(
      /\.sample-badge\s*\{[^}]*position:\s*absolute/s
    );
  });
});

describe("hero-visual signature + icon on wood card", () => {
  test("hero-visual-icon stays white on the wood gradient", () => {
    // Wood→wood-dark + quote white locks still pass if the craftsman icon
    // inherits dark page ink — the only glyph on the hero quote card then
    // vanishes while signature opacity and quote type contracts stay green.
    expect(stylesCss).toMatch(/\.hero-visual-icon\s*\{[^}]*color:\s*#fff/s);
  });

  test("hero-visual-signature dot stays white beside the owner attribution", () => {
    // Quote heading + card white locks still pass if the signature dot bleaches
    // to wood/transparent — Greg Felton attribution loses its only bullet cue
    // while hero-visual color and quote size contracts remain green.
    expect(stylesCss).toMatch(
      /\.hero-visual-signature\s+\.dot\s*\{[^}]*background-color:\s*#fff/s
    );
  });
});

describe("trust-item row layout on dark strip", () => {
  test("trust-item stays a compact flex row with icon→claim gap and semibold weight", () => {
    // Strip ink/#fff and accent-light icon color locks still pass if trust-item
    // loses display:flex (or the 10px gap / 600 weight) — icons then stack above
    // claims or read as body-weight copy while contrast contracts stay green.
    expect(stylesCss).toMatch(/\.trust-item\s*\{[^}]*display:\s*flex/s);
    expect(stylesCss).toMatch(/\.trust-item\s*\{[^}]*align-items:\s*center/s);
    expect(stylesCss).toMatch(/\.trust-item\s*\{[^}]*gap:\s*10px/s);
    expect(stylesCss).toMatch(/\.trust-item\s*\{[^}]*font-weight:\s*600/s);
  });

  test("trust-item icons keep a fixed box and flex-shrink so glyphs do not crush", () => {
    // Flex-row + accent-light locks still pass if svg width/height or
    // flex-shrink:0 drops — long trust claims then crush the glyph while strip
    // contrast contracts remain green.
    expect(stylesCss).toMatch(/\.trust-item\s+svg\s*\{[^}]*width:\s*20px/s);
    expect(stylesCss).toMatch(/\.trust-item\s+svg\s*\{[^}]*height:\s*20px/s);
    expect(stylesCss).toMatch(
      /\.trust-item\s+svg\s*\{[^}]*flex-shrink:\s*0/s
    );
  });
});

describe("services-grid responsive columns", () => {
  test("services-grid keeps a three-column track for the service catalog on wide layouts", () => {
    // Card surface/border locks still pass if the grid collapses to 1fr — six
    // offerings then stack as a long single column on desktop while catalog↔form
    // option parity stays green.
    expect(stylesCss).toMatch(/\.services-grid\s*\{[^}]*display:\s*grid/s);
    expect(stylesCss).toMatch(
      /\.services-grid\s*\{[^}]*grid-template-columns:\s*repeat\(\s*3\s*,\s*1fr\s*\)/s
    );
  });

  test("services-grid collapses to two columns at max-width 940px then one at 640px", () => {
    // Desktop 3-col locks still pass if the 940/640 media queries are dropped —
    // tablets and phones then keep three squeezed columns and clip card titles
    // while service-card surface contracts remain green.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*940px\s*\)\s*\{\s*\.services-grid\s*\{[^}]*grid-template-columns:\s*repeat\(\s*2\s*,\s*1fr\s*\)/s
    );
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*640px\s*\)\s*\{\s*\.services-grid\s*\{[^}]*grid-template-columns:\s*1fr/s
    );
  });
});

describe("gallery-grid responsive columns", () => {
  test("gallery-grid keeps a three-column track for project placeholders on wide layouts", () => {
    // Tile surface/aspect locks still pass if the grid collapses to 1fr —
    // placeholder categories then stack as a long single column on desktop while
    // dashed-border and 4/3 contracts stay green.
    expect(stylesCss).toMatch(/\.gallery-grid\s*\{[^}]*display:\s*grid/s);
    expect(stylesCss).toMatch(
      /\.gallery-grid\s*\{[^}]*grid-template-columns:\s*repeat\(\s*3\s*,\s*1fr\s*\)/s
    );
  });

  test("gallery-grid collapses to two columns at max-width 940px then one at 600px", () => {
    // Desktop 3-col locks still pass if the 940/600 media queries are dropped —
    // tablets and phones then keep three squeezed tiles and crush captions while
    // gallery-tile surface contracts remain green.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*940px\s*\)\s*\{\s*\.gallery-grid\s*\{[^}]*grid-template-columns:\s*repeat\(\s*2\s*,\s*1fr\s*\)/s
    );
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*600px\s*\)\s*\{\s*\.gallery-grid\s*\{[^}]*grid-template-columns:\s*1fr/s
    );
  });
});

describe("testimonials-grid responsive columns", () => {
  test("testimonials-grid keeps a three-column track for sample reviews on wide layouts", () => {
    // Card surface + SAMPLE badge locks still pass if the grid collapses to 1fr —
    // three sample reviews then stack as a long single column on desktop while
    // quote/author contracts stay green.
    expect(stylesCss).toMatch(
      /\.testimonials-grid\s*\{[^}]*display:\s*grid/s
    );
    expect(stylesCss).toMatch(
      /\.testimonials-grid\s*\{[^}]*grid-template-columns:\s*repeat\(\s*3\s*,\s*1fr\s*\)/s
    );
  });

  test("testimonials-grid collapses to a single column at max-width 940px", () => {
    // Desktop 3-col locks still pass if the 940px stack media query is dropped —
    // tablets then squeeze three review cards side-by-side and clip quote copy
    // while testimonial-card surface contracts remain green.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*940px\s*\)\s*\{\s*\.testimonials-grid\s*\{[^}]*grid-template-columns:\s*1fr/s
    );
  });
});

describe("trust-strip container wrap layout", () => {
  test("trust-strip .container keeps centered flex wrap with row/column gaps", () => {
    // trust-item flex-row locks still pass if the strip container loses
    // flex-wrap / justify-content:center — narrow viewports then overflow or
    // left-align the dark claims band while item contrast contracts stay green.
    expect(stylesCss).toMatch(
      /\.trust-strip\s+\.container\s*\{[^}]*display:\s*flex/s
    );
    expect(stylesCss).toMatch(
      /\.trust-strip\s+\.container\s*\{[^}]*flex-wrap:\s*wrap/s
    );
    expect(stylesCss).toMatch(
      /\.trust-strip\s+\.container\s*\{[^}]*justify-content:\s*center/s
    );
    expect(stylesCss).toMatch(
      /\.trust-strip\s+\.container\s*\{[^}]*gap:\s*18px\s+36px/s
    );
  });
});

describe("service-card hover lift", () => {
  test("service-card:hover lifts with shadow-md and clears the resting border", () => {
    // Card surface/border locks still pass if :hover loses translateY / shadow —
    // catalog cards then feel inert (or keep a hard border on lift) while
    // services-grid column contracts remain green.
    expect(stylesCss).toMatch(
      /\.service-card:hover\s*\{[^}]*transform:\s*translateY\(\s*-4px\s*\)/s
    );
    expect(stylesCss).toMatch(
      /\.service-card:hover\s*\{[^}]*box-shadow:\s*var\(--shadow-md\)/s
    );
    expect(stylesCss).toMatch(
      /\.service-card:hover\s*\{[^}]*border-color:\s*transparent/s
    );
  });
});

describe("hero container responsive columns", () => {
  test("hero .container keeps a two-track grid for copy beside the quote card", () => {
    // Hero CTA pairing locks still pass if the container collapses to 1fr on
    // desktop — copy and wood quote card stack prematurely while btn-primary /
    // btn-outline contracts stay green.
    expect(stylesCss).toMatch(/\.hero\s+\.container\s*\{[^}]*display:\s*grid/s);
    expect(stylesCss).toMatch(
      /\.hero\s+\.container\s*\{[^}]*grid-template-columns:\s*1\.1fr\s+0\.9fr/s
    );
  });

  test("hero .container collapses to a single column at max-width 940px", () => {
    // Desktop two-track locks still pass if the 940px media query is dropped —
    // tablets squeeze copy beside the quote card and clip the lede while hero
    // CTA class contracts remain green. Require the selector immediately after
    // the media `{` so an earlier 940px block cannot falsely bind.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*940px\s*\)\s*\{\s*\.hero\s+\.container\s*\{[^}]*grid-template-columns:\s*1fr/s
    );
  });
});

describe("about-grid responsive columns", () => {
  test("about-grid keeps a two-track layout for portrait beside founder copy", () => {
    // Portrait mark scale locks still pass if about-grid collapses to 1fr on
    // desktop — portrait and value-list stack early while craftsman svg size
    // contracts stay green.
    expect(stylesCss).toMatch(/\.about-grid\s*\{[^}]*display:\s*grid/s);
    expect(stylesCss).toMatch(
      /\.about-grid\s*\{[^}]*grid-template-columns:\s*0\.85fr\s+1\.15fr/s
    );
  });

  test("about-grid collapses to a single column at max-width 940px", () => {
    // Desktop two-track locks still pass if the 940px media query is dropped —
    // tablets squeeze portrait beside copy and crush the value-list while
    // about-portrait geometry contracts remain green.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*940px\s*\)\s*\{\s*\.about-grid\s*\{[^}]*grid-template-columns:\s*1fr/s
    );
  });
});

describe("contact-grid responsive columns", () => {
  test("contact-grid keeps a two-track layout for info beside the lead form", () => {
    // Lead form field/DOM-order locks still pass if contact-grid collapses to
    // 1fr on desktop — Availability and the mailto form stack early while
    // hours-row and form-status contracts stay green.
    expect(stylesCss).toMatch(/\.contact-grid\s*\{[^}]*display:\s*grid/s);
    expect(stylesCss).toMatch(
      /\.contact-grid\s*\{[^}]*grid-template-columns:\s*0\.9fr\s+1\.1fr/s
    );
  });

  test("contact-grid collapses to a single column at max-width 900px", () => {
    // Desktop two-track locks still pass if the 900px media query is dropped —
    // tablets squeeze info + lead form side-by-side and clip submit/status
    // while form DOM-order contracts remain green.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*900px\s*\)\s*\{\s*\.contact-grid\s*\{[^}]*grid-template-columns:\s*1fr/s
    );
  });
});

describe("footer-grid responsive columns", () => {
  test("footer-grid keeps a three-track layout for brand + Explore + Contact", () => {
    // Footer chrome/separator locks still pass if columns collapse to 1fr on
    // desktop — Explore hashes and Contact tel/mailto stack as a long column
    // while footer alpha contracts stay green.
    expect(stylesCss).toMatch(/\.footer-grid\s*\{[^}]*display:\s*grid/s);
    expect(stylesCss).toMatch(
      /\.footer-grid\s*\{[^}]*grid-template-columns:\s*1\.4fr\s+1fr\s+1fr/s
    );
  });

  test("footer-grid collapses to a single column at max-width 780px", () => {
    // Desktop three-track locks still pass if the 780px media query is dropped —
    // phones keep three squeezed footer columns and clip Explore/Contact links
    // while footer-bottom parity contracts remain green.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*780px\s*\)\s*\{\s*\.footer-grid\s*\{[^}]*grid-template-columns:\s*1fr/s
    );
  });
});

describe("area-grid responsive columns", () => {
  test("area-grid keeps a two-track layout for towns beside the map card", () => {
    // area-chip surface locks still pass if area-grid collapses to 1fr on
    // desktop — town chips and the dark map CTA stack early while chip border
    // contracts stay green.
    expect(stylesCss).toMatch(/\.area-grid\s*\{[^}]*display:\s*grid/s);
    expect(stylesCss).toMatch(
      /\.area-grid\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/s
    );
  });

  test("area-grid collapses to a single column at max-width 820px", () => {
    // Desktop two-track locks still pass if the 820px media query is dropped —
    // tablets squeeze chips beside the map card and clip the Call CTA while
    // area-map-card btn-light contracts remain green.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*820px\s*\)\s*\{\s*\.area-grid\s*\{[^}]*grid-template-columns:\s*1fr/s
    );
  });
});

describe("hero-actions CTA row layout", () => {
  test("hero-actions keeps flex wrap with a 16px gap so Quote + Call stay usable", () => {
    // Hero CTA class pairing locks still pass if hero-actions loses flex-wrap /
    // gap — narrow viewports then overflow or crowd the primary Quote beside
    // Call while btn-primary / btn-outline contracts remain green.
    expect(stylesCss).toMatch(/\.hero-actions\s*\{[^}]*display:\s*flex/s);
    expect(stylesCss).toMatch(/\.hero-actions\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(stylesCss).toMatch(/\.hero-actions\s*\{[^}]*gap:\s*16px/s);
  });

  test("hero-actions keeps bottom spacing above the trust-stat grid", () => {
    // Flex wrap/gap locks still pass if margin-bottom is dropped — Quote + Call
    // then sit flush against years/licensed/local stats and the first-viewport
    // CTA hierarchy collapses while btn pairing contracts remain green.
    expect(stylesCss).toMatch(
      /\.hero-actions\s*\{[^}]*margin-bottom:\s*40px/s
    );
  });
});

describe("hero-facts trust-stat grid", () => {
  test("hero-facts keeps a three-column auto grid for first-viewport trust stats", () => {
    // hero-fact color/type locks still pass if the grid collapses to 1fr on
    // desktop — years/licensed/local stats then stack as a tall column under
    // the CTAs while wood-dark strong contracts stay green.
    expect(stylesCss).toMatch(/\.hero-facts\s*\{[^}]*display:\s*grid/s);
    expect(stylesCss).toMatch(
      /\.hero-facts\s*\{[^}]*grid-template-columns:\s*repeat\(\s*3\s*,\s*auto\s*\)/s
    );
  });

  test("hero-facts keeps a 28px desktop gap between trust stats", () => {
    // Column-count locks still pass if gap is zeroed — years/licensed/local
    // values then crowd edge-to-edge under the CTAs while wood-dark strong
    // and 480px collapse contracts remain green.
    expect(stylesCss).toMatch(/\.hero-facts\s*\{[^}]*gap:\s*28px/s);
  });

  test("hero-facts collapses to a single column at max-width 480px", () => {
    // Desktop 3-col locks still pass if the 480px media query is dropped —
    // phones squeeze three trust stats side-by-side and clip labels while
    // hero-fact color contracts remain green.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*480px\s*\)\s*\{\s*\.hero-facts\s*\{[^}]*grid-template-columns:\s*1fr/s
    );
  });

  test("hero-facts keeps a tighter 16px gap when stacked at max-width 480px", () => {
    // 1fr collapse locks still pass if the phone gap stays at desktop 28px or
    // is dropped — stacked trust stats then either waste vertical room above
    // the fold or crowd labels while column-count contracts remain green.
    expect(stylesCss).toMatch(
      /@media\s*\(\s*max-width:\s*480px\s*\)\s*\{\s*\.hero-facts\s*\{[^}]*gap:\s*16px/s
    );
  });

  test("hero-fact strong stays block heading type so values sit above labels", () => {
    // Color locks still pass if strong becomes inline or drops heading size —
    // trust stats then flatten beside muted spans while wood-dark contracts
    // stay green.
    expect(stylesCss).toMatch(
      /\.hero-fact\s+strong\s*\{[^}]*display:\s*block/s
    );
    expect(stylesCss).toMatch(
      /\.hero-fact\s+strong\s*\{[^}]*font-family:\s*var\(--font-heading\)/s
    );
    expect(stylesCss).toMatch(
      /\.hero-fact\s+strong\s*\{[^}]*font-size:\s*1\.5rem/s
    );
  });

  test("hero-fact span stays compact muted so labels stay secondary to values", () => {
    // Strong heading locks still pass if the label span matches strong size or
    // ink weight — "Years Experience" then competes with the numeric value
    // while wood-dark contracts remain green.
    expect(stylesCss).toMatch(
      /\.hero-fact\s+span\s*\{[^}]*font-size:\s*0\.86rem/s
    );
    expect(stylesCss).toMatch(
      /\.hero-fact\s+span\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
  });
});

describe("area-chips town-list wrap layout", () => {
  test("area-chips keeps flex wrap with a 12px gap so town pills reflow", () => {
    // area-chip surface/border locks still pass if the chips container loses
    // flex-wrap / gap — town pills then overflow the area column or crowd
    // edge-to-edge while areaServed content and chip contrast stay green.
    expect(stylesCss).toMatch(/\.area-chips\s*\{[^}]*display:\s*flex/s);
    expect(stylesCss).toMatch(/\.area-chips\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(stylesCss).toMatch(/\.area-chips\s*\{[^}]*gap:\s*12px/s);
  });

  test("area-chip stays inline-flex with pill radius for town labels", () => {
    // Surface/border locks still pass if chips become block rectangles —
    // served towns then read as stacked cards instead of compact pills while
    // area-chips wrap and icon accent contracts remain green.
    expect(stylesCss).toMatch(
      /\.area-chip\s*\{[^}]*display:\s*inline-flex/s
    );
    expect(stylesCss).toMatch(
      /\.area-chip\s*\{[^}]*border-radius:\s*999px/s
    );
  });

  test("area-chip keeps icon/label gap, pill padding, and semibold weight", () => {
    // inline-flex + radius locks still pass if gap/padding/weight are dropped —
    // pin glyphs then collide with town names or pills flatten to hairline
    // chips while areaServed content and surface/border contracts stay green.
    expect(stylesCss).toMatch(/\.area-chip\s*\{[^}]*gap:\s*8px/s);
    expect(stylesCss).toMatch(
      /\.area-chip\s*\{[^}]*padding:\s*10px\s+16px/s
    );
    expect(stylesCss).toMatch(/\.area-chip\s*\{[^}]*font-weight:\s*600/s);
  });

  test("area-chip centers the pin glyph with compact pill type", () => {
    // Gap/padding/weight locks still pass if align-items or font-size drift —
    // pin glyphs then sit off the town-name baseline or pills grow to body
    // size while areaServed content and surface contracts stay green.
    expect(stylesCss).toMatch(
      /\.area-chip\s*\{[^}]*align-items:\s*center/s
    );
    expect(stylesCss).toMatch(
      /\.area-chip\s*\{[^}]*font-size:\s*0\.92rem/s
    );
  });

  test("area-chip svg keeps a 16px pin so town glyphs stay secondary to labels", () => {
    // Accent color locks still pass if the pin scales to 1em/100% — glyphs then
    // dominate each pill or shrink unreadably while surface/border and
    // areaServed content contracts remain green.
    expect(stylesCss).toMatch(/\.area-chip\s+svg\s*\{[^}]*width:\s*16px/s);
    expect(stylesCss).toMatch(/\.area-chip\s+svg\s*\{[^}]*height:\s*16px/s);
  });
});

describe("hero-lede first-viewport measure", () => {
  test("hero-lede keeps a 52ch measure and spacing above the CTA row", () => {
    // Muted-color locks still pass if max-width / margin are dropped — the
    // supporting sentence then stretches edge-to-edge and crowds Quote + Call
    // while hero CTA pairing and wood-span heading contracts remain green.
    expect(stylesCss).toMatch(/\.hero-lede\s*\{[^}]*max-width:\s*52ch/s);
    expect(stylesCss).toMatch(
      /\.hero-lede\s*\{[^}]*margin-bottom:\s*32px/s
    );
  });

  test("hero-lede keeps elevated supporting type under the brand headline", () => {
    // Measure/margin locks still pass if font-size falls to body 1rem — the
    // first-viewport supporting sentence then loses hierarchy under the wood
    // span while max-width and CTA pairing contracts remain green.
    expect(stylesCss).toMatch(
      /\.hero-lede\s*\{[^}]*font-size:\s*1\.15rem/s
    );
  });
});

describe("area-map-card lead CTA plane", () => {
  test("area-map-card keeps padded flex column with min-height for the Call CTA", () => {
    // Gradient + btn-light locks still pass if padding/min-height/flex column
    // are dropped — the served-area Call CTA then collapses into a short
    // gradient strip or stacks without vertical centering while accent
    // surface and white-text contracts stay green.
    expect(stylesCss).toMatch(/\.area-map-card\s*\{[^}]*padding:\s*40px/s);
    expect(stylesCss).toMatch(
      /\.area-map-card\s*\{[^}]*min-height:\s*260px/s
    );
    expect(stylesCss).toMatch(
      /\.area-map-card\s*\{[^}]*display:\s*flex/s
    );
    expect(stylesCss).toMatch(
      /\.area-map-card\s*\{[^}]*flex-direction:\s*column/s
    );
    expect(stylesCss).toMatch(
      /\.area-map-card\s*\{[^}]*justify-content:\s*center/s
    );
  });

  test("area-map-card keeps a 14px stack gap above the Call CTA", () => {
    // Flex column / min-height locks still pass if gap is zeroed — map icon,
    // heading, and supporting copy then collide before the Call button while
    // btn-light and white-text contracts remain green.
    expect(stylesCss).toMatch(/\.area-map-card\s*\{[^}]*gap:\s*14px/s);
  });

  test("area-map-card svg keeps a 40px mark so the map glyph stays secondary", () => {
    // Gradient + white-text locks still pass if the svg scales to 100% / 1em —
    // the map mark then dominates the Call CTA plane or shrinks unreadably
    // while padding and btn-light contracts stay green.
    expect(stylesCss).toMatch(
      /\.area-map-card\s+svg\s*\{[^}]*width:\s*40px/s
    );
    expect(stylesCss).toMatch(
      /\.area-map-card\s+svg\s*\{[^}]*height:\s*40px/s
    );
  });

  test("area-map-card Call button stays content-width with top separation", () => {
    // btn-light class pairing still passes if the card button stretches full
    // width or loses margin-top — Call then either reads as a full-bleed bar
    // or crowds the supporting paragraph while accent gradient contracts
    // remain green.
    expect(stylesCss).toMatch(
      /\.area-map-card\s+\.btn\s*\{[^}]*width:\s*fit-content/s
    );
    expect(stylesCss).toMatch(
      /\.area-map-card\s+\.btn\s*\{[^}]*margin-top:\s*8px/s
    );
  });
});

describe("hero-visual brand plane geometry", () => {
  test("hero-visual keeps padded flex column with min-height for the quote card", () => {
    // Gradient + white-text locks still pass if padding/min-height/flex stack
    // are dropped — the first-viewport wood quote card then collapses into a
    // short strip or crowds icon/quote/signature while color and heading-type
    // contracts remain green.
    expect(stylesCss).toMatch(/\.hero-visual\s*\{[^}]*padding:\s*40px/s);
    expect(stylesCss).toMatch(
      /\.hero-visual\s*\{[^}]*min-height:\s*340px/s
    );
    expect(stylesCss).toMatch(/\.hero-visual\s*\{[^}]*display:\s*flex/s);
    expect(stylesCss).toMatch(
      /\.hero-visual\s*\{[^}]*flex-direction:\s*column/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual\s*\{[^}]*justify-content:\s*space-between/s
    );
  });

  test("hero-visual keeps radius-lg corners and shadow-lg elevation", () => {
    // Wood gradient + white copy locks still pass if radius/shadow are
    // dropped — the brand quote plane then reads as a flat rectangle flush
    // with the cream page while quote size and signature-dot contracts stay
    // green.
    expect(stylesCss).toMatch(
      /\.hero-visual\s*\{[^}]*border-radius:\s*var\(--radius-lg\)/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual\s*\{[^}]*box-shadow:\s*var\(--shadow-lg\)/s
    );
  });
});

describe("hero-visual quote + mark rhythm", () => {
  test("hero-visual-quote keeps line-height and top margin under the craftsman icon", () => {
    // Heading font/size locks still pass if line-height collapses or top
    // margin is zeroed — the brand quote then crowds the icon or packs
    // tightly while white color and 1.35rem size contracts remain green.
    expect(stylesCss).toMatch(
      /\.hero-visual-quote\s*\{[^}]*line-height:\s*1\.4/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual-quote\s*\{[^}]*margin:\s*24px\s+0\s+0/s
    );
  });

  test("hero-visual-icon keeps a fixed 56px mark so the glyph stays secondary", () => {
    // White icon color locks still pass if the svg scales to 100% / 1em —
    // the craftsman mark then dominates the quote plane or shrinks unreadably
    // while gradient and signature-dot contracts stay green.
    expect(stylesCss).toMatch(
      /\.hero-visual-icon\s*\{[^}]*width:\s*56px/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual-icon\s*\{[^}]*height:\s*56px/s
    );
  });

  test("hero-visual-signature stays a flex row with gap and top spacing", () => {
    // White signature-dot locks still pass if flex/gap/margin-top are dropped
    // — Greg Felton attribution then stacks under the quote or collides with
    // it while icon color and quote type contracts remain green.
    expect(stylesCss).toMatch(
      /\.hero-visual-signature\s*\{[^}]*display:\s*flex/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual-signature\s*\{[^}]*align-items:\s*center/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual-signature\s*\{[^}]*gap:\s*12px/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual-signature\s*\{[^}]*margin-top:\s*28px/s
    );
  });
});

describe("area-map-card elevation + corner radius", () => {
  test("area-map-card keeps radius-lg corners and shadow-md elevation", () => {
    // Accent gradient + btn-light / padding locks still pass if radius/shadow
    // are dropped — the served-area Call CTA plane then reads as a flat
    // rectangle flush with the cream page while white-text and min-height
    // contracts remain green.
    expect(stylesCss).toMatch(
      /\.area-map-card\s*\{[^}]*border-radius:\s*var\(--radius-lg\)/s
    );
    expect(stylesCss).toMatch(
      /\.area-map-card\s*\{[^}]*box-shadow:\s*var\(--shadow-md\)/s
    );
  });
});

describe("hero-visual grain overlay", () => {
  test("hero-visual::before keeps a full-bleed grain stripe under the quote", () => {
    // Wood gradient + radius-lg locks still pass if the ::before grain is
    // dropped or loses inset/radius — the first-viewport brand plane then
    // reads as a flat fill while quote type and signature-row contracts stay
    // green.
    expect(stylesCss).toMatch(
      /\.hero-visual::before\s*\{[^}]*content:\s*""/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual::before\s*\{[^}]*position:\s*absolute/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual::before\s*\{[^}]*inset:\s*0/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual::before\s*\{[^}]*border-radius:\s*var\(--radius-lg\)/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual::before\s*\{[^}]*repeating-linear-gradient/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual::before\s*\{[^}]*pointer-events:\s*none/s
    );
  });
});

describe("hero-visual icon + signature hierarchy", () => {
  test("hero-visual-icon keeps soft opacity so the mark stays secondary to the quote", () => {
    // Fixed 56px + white color locks still pass if opacity goes full — the
    // craftsman glyph then competes with the brand quote while size and wood
    // gradient contracts remain green.
    expect(stylesCss).toMatch(
      /\.hero-visual-icon\s*\{[^}]*opacity:\s*0\.92/s
    );
  });

  test("hero-visual-signature keeps compact type and soft opacity under the quote", () => {
    // Flex/gap/margin-top locks still pass if font-size or opacity jump to
    // body/full — Greg Felton attribution then rivals the quote hierarchy
    // while white-dot color and row spacing contracts stay green.
    expect(stylesCss).toMatch(
      /\.hero-visual-signature\s*\{[^}]*font-size:\s*0\.92rem/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual-signature\s*\{[^}]*opacity:\s*0\.9/s
    );
  });

  test("hero-visual-signature dot keeps an 8px circle beside the owner line", () => {
    // White background-color locks still pass if width/height/radius drift —
    // the attribution bullet then becomes a square dash or grows into a
    // blob while flex row and signature opacity contracts remain green.
    expect(stylesCss).toMatch(
      /\.hero-visual-signature\s+\.dot\s*\{[^}]*width:\s*8px/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual-signature\s+\.dot\s*\{[^}]*height:\s*8px/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual-signature\s+\.dot\s*\{[^}]*border-radius:\s*50%/s
    );
  });
});

describe("hero-visual grain stripe geometry", () => {
  test("hero-visual::before keeps the 115deg soft-white stripe stops", () => {
    // Presence of repeating-linear-gradient alone still passes if angle, alpha,
    // or 2px/14px stops drift — the wood quote card then gains harsh chalk
    // bands or loses texture while inset/radius/pointer-events contracts stay
    // green.
    expect(stylesCss).toMatch(
      /\.hero-visual::before\s*\{[^}]*repeating-linear-gradient\(\s*115deg/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual::before\s*\{[^}]*rgb\(\s*255\s+255\s+255\s*\/\s*4\.5%\s*\)/s
    );
    expect(stylesCss).toMatch(
      /\.hero-visual::before\s*\{[^}]*transparent\s+2px\s*,\s*transparent\s+14px/s
    );
  });
});

describe("hero-visual quote stacking above grain", () => {
  test("hero-visual-quote stays position:relative so type paints above ::before", () => {
    // Quote size/type locks still pass if position:relative is dropped — the
    // grain overlay then paints over the brand quote while ::before inset and
    // pointer-events contracts remain green.
    expect(stylesCss).toMatch(
      /\.hero-visual-quote\s*\{[^}]*position:\s*relative/s
    );
  });
});

describe("about-portrait surface tokens", () => {
  test("about-portrait keeps radius-lg corners and a bordered plane", () => {
    // Aspect-ratio / flex centering locks still pass if radius or border drop —
    // the founder photo plane then reads as a sharp unframed block while wood
    // mark and caption-scrim contracts stay green.
    expect(stylesCss).toMatch(
      /\.about-portrait\s*\{[^}]*border-radius:\s*var\(--radius-lg\)/s
    );
    expect(stylesCss).toMatch(
      /\.about-portrait\s*\{[^}]*border:\s*1px\s+solid\s+var\(--color-border\)/s
    );
  });

  test("about-portrait keeps the cream-to-border placeholder gradient", () => {
    // Wood color + caption overlay locks still pass if the plane fill flattens
    // to page cream or solid border — the craftsman mark then loses its media
    // card while geometry and opacity contracts remain green.
    expect(stylesCss).toMatch(
      /\.about-portrait\s*\{[^}]*background:\s*linear-gradient\([^;]*var\(--color-bg-alt\)[^;]*var\(--color-border\)/s
    );
  });
});

describe("service-icon catalog chip metrics", () => {
  test("service-icon keeps a fixed 52px chip so glyphs stay secondary to titles", () => {
    // Wood/bg-alt color locks still pass if the chip grows to fill the card —
    // service marks then dominate h3 titles while catalog↔option parity stays
    // green.
    expect(stylesCss).toMatch(
      /\.service-icon\s*\{[^}]*width:\s*52px/s
    );
    expect(stylesCss).toMatch(
      /\.service-icon\s*\{[^}]*height:\s*52px/s
    );
  });

  test("service-icon svg keeps a 28px glyph inside the cream chip", () => {
    // Chip box locks still pass if the SVG stretches to 100% — glyphs then
    // crush the padded chip edge while wood color and card surface contracts
    // remain green.
    expect(stylesCss).toMatch(
      /\.service-icon\s+svg\s*\{[^}]*width:\s*28px/s
    );
    expect(stylesCss).toMatch(
      /\.service-icon\s+svg\s*\{[^}]*height:\s*28px/s
    );
  });
});

describe("gallery-tile placeholder mark hierarchy", () => {
  test("gallery-tile svg keeps a compact wood-light mark above titles", () => {
    // Dashed surface + aspect-ratio locks still pass if the placeholder glyph
    // bleaches to muted text or grows oversized — category tiles then lose the
    // only warm cue while ink title contracts stay green.
    expect(stylesCss).toMatch(
      /\.gallery-tile\s+svg\s*\{[^}]*width:\s*34px/s
    );
    expect(stylesCss).toMatch(
      /\.gallery-tile\s+svg\s*\{[^}]*height:\s*34px/s
    );
    expect(stylesCss).toMatch(
      /\.gallery-tile\s+svg\s*\{[^}]*color:\s*var\(--color-wood-light\)/s
    );
  });

  test("gallery-tile strong stays ink so project labels remain primary", () => {
    // Surface/dashed border locks still pass if titles inherit muted tile text —
    // placeholder categories then flatten beside captions while wood-light
    // glyph contracts remain green.
    expect(stylesCss).toMatch(
      /\.gallery-tile\s+strong\s*\{[^}]*color:\s*var\(--color-ink\)/s
    );
  });
});

describe("service-icon chip layout + spacing", () => {
  test("service-icon centers glyphs with flex so marks stay inside the cream chip", () => {
    // Fixed 52px + wood/bg-alt locks still pass if display:flex or centering drop —
    // SVG glyphs then hug the chip corner while catalog size and color contracts
    // remain green.
    expect(stylesCss).toMatch(
      /\.service-icon\s*\{[^}]*display:\s*flex/s
    );
    expect(stylesCss).toMatch(
      /\.service-icon\s*\{[^}]*align-items:\s*center/s
    );
    expect(stylesCss).toMatch(
      /\.service-icon\s*\{[^}]*justify-content:\s*center/s
    );
  });

  test("service-icon keeps radius-sm corners matching shared CTA controls", () => {
    // Chip box + color locks still pass if radius softens to pill or goes square —
    // service marks then clash with .btn / form radius-sm while wood/bg-alt
    // contracts stay green.
    expect(stylesCss).toMatch(
      /\.service-icon\s*\{[^}]*border-radius:\s*var\(--radius-sm\)/s
    );
  });

  test("service-icon keeps 20px bottom margin so glyphs stay secondary to titles", () => {
    // Size/centering locks still pass if margin-bottom collapses — wood chips
    // then crowd h3 titles while 52px metrics and catalog↔option parity remain
    // green.
    expect(stylesCss).toMatch(
      /\.service-icon\s*\{[^}]*margin-bottom:\s*20px/s
    );
  });
});

describe("gallery-tile stack layout + muted plane", () => {
  test("gallery-tile stacks mark above label with a flex column and gap", () => {
    // Aspect-ratio / dashed surface locks still pass if flex-direction or gap
    // drift — icon + title then sit side-by-side or crush together while
    // wood-light glyph and ink strong contracts remain green.
    expect(stylesCss).toMatch(
      /\.gallery-tile\s*\{[^}]*display:\s*flex/s
    );
    expect(stylesCss).toMatch(
      /\.gallery-tile\s*\{[^}]*flex-direction:\s*column/s
    );
    expect(stylesCss).toMatch(
      /\.gallery-tile\s*\{[^}]*gap:\s*10px/s
    );
  });

  test("gallery-tile keeps muted body color with radius-md corners", () => {
    // Surface/border locks still pass if muted color or radius-md drop — caption
    // spans inherit ink or tiles go sharp while dashed plane and ink title
    // contracts stay green.
    expect(stylesCss).toMatch(
      /\.gallery-tile\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
    expect(stylesCss).toMatch(
      /\.gallery-tile\s*\{[^}]*border-radius:\s*var\(--radius-md\)/s
    );
  });
});

describe("shared btn resting geometry", () => {
  test("btn keeps radius-sm corners matching form controls", () => {
    // Color/shadow CTA locks still pass if radius softens to pill or goes square —
    // quote/call buttons then clash with shared form radius-sm while
    // btn-primary / btn-outline fill contracts remain green.
    expect(stylesCss).toMatch(
      /\.btn\s*\{[^}]*border-radius:\s*var\(--radius-sm\)/s
    );
  });

  test("btn keeps 14px/26px padding so CTAs keep a usable hit target", () => {
    // Fill/hover locks still pass if padding collapses — Get a Free Quote and
    // Call Now then shrink below a comfortable tap target while contrast and
    // shadow contracts stay green.
    expect(stylesCss).toMatch(
      /\.btn\s*\{[^}]*padding:\s*14px\s+26px/s
    );
  });

  test("btn keeps white-space:nowrap so multi-word CTAs do not wrap mid-label", () => {
    // Padding/radius locks still pass if nowrap is dropped — "Get a Free Quote"
    // and "Call Now" then wrap awkwardly in hero/cta-band while fill and focus
    // contracts remain green.
    expect(stylesCss).toMatch(
      /\.btn\s*\{[^}]*white-space:\s*nowrap/s
    );
  });
});

describe("shared btn flex alignment + weight", () => {
  test("btn centers label content with inline-flex so icon+text CTAs stay aligned", () => {
    // Padding/radius/nowrap locks still pass if flex centering drops — quote and
    // Call Now then left-align or stretch while fill, shadow, and focus contracts
    // remain green.
    expect(stylesCss).toMatch(
      /\.btn\s*\{[^}]*display:\s*inline-flex/s
    );
    expect(stylesCss).toMatch(
      /\.btn\s*\{[^}]*align-items:\s*center/s
    );
    expect(stylesCss).toMatch(
      /\.btn\s*\{[^}]*justify-content:\s*center/s
    );
  });

  test("btn keeps an 8px gap so multi-part CTA labels stay spaced", () => {
    // Inline-flex centering locks still pass if gap collapses — icon+text or
    // multi-word CTAs then crush together while padding and nowrap contracts
    // stay green.
    expect(stylesCss).toMatch(
      /\.btn\s*\{[^}]*gap:\s*8px/s
    );
  });

  test("btn keeps font-weight 600 so CTAs read as primary actions", () => {
    // Geometry locks still pass if weight drops to regular — Get a Free Quote
    // and Call Now then blend into body copy while radius/padding/nowrap
    // contracts remain green.
    expect(stylesCss).toMatch(
      /\.btn\s*\{[^}]*font-weight:\s*600/s
    );
  });
});

describe("gallery-tile content centering + padding", () => {
  test("gallery-tile centers mark and label on both axes", () => {
    // Flex-column + gap locks still pass if align/justify drift — placeholder
    // SVG and title then hug a corner while muted color and radius-md contracts
    // remain green.
    expect(stylesCss).toMatch(
      /\.gallery-tile\s*\{[^}]*align-items:\s*center/s
    );
    expect(stylesCss).toMatch(
      /\.gallery-tile\s*\{[^}]*justify-content:\s*center/s
    );
  });

  test("gallery-tile keeps centered text with 20px padding inside the plane", () => {
    // Aspect-ratio / dashed surface locks still pass if text-align or padding
    // drop — multi-line captions then left-align or kiss the dashed border while
    // wood-light glyph and ink strong contracts stay green.
    expect(stylesCss).toMatch(
      /\.gallery-tile\s*\{[^}]*text-align:\s*center/s
    );
    expect(stylesCss).toMatch(
      /\.gallery-tile\s*\{[^}]*padding:\s*20px/s
    );
  });
});

describe("service-card title hierarchy", () => {
  test("service-card h3 keeps 1.15rem size above muted body copy", () => {
    // service-card surface / muted-p locks still pass if h3 shrinks to body size —
    // service titles then lose hierarchy under wood icon chips while border and
    // hover-lift contracts remain green.
    expect(stylesCss).toMatch(
      /\.service-card\s+h3\s*\{[^}]*font-size:\s*1\.15rem/s
    );
  });

  test("service-card h3 keeps 10px bottom margin above the description", () => {
    // Title size locks still pass if margin collapses — h3 then sits flush on
    // muted body copy while service-icon spacing and surface contracts stay green.
    expect(stylesCss).toMatch(
      /\.service-card\s+h3\s*\{[^}]*margin-bottom:\s*10px/s
    );
  });
});

describe("shared btn type size, border, and pointer", () => {
  test("btn keeps 0.98rem type so CTAs stay slightly under body size", () => {
    // Flex/weight/padding locks still pass if font-size jumps to 1.15rem or
    // shrinks to caption — Get a Free Quote and Call Now then dominate or
    // recede beside hero lede while fill and focus contracts remain green.
    expect(stylesCss).toMatch(
      /\.btn\s*\{[^}]*font-size:\s*0\.98rem/s
    );
  });

  test("btn keeps a transparent 2px border so outline variants can swap color", () => {
    // Radius/padding locks still pass if the resting border collapses — btn-outline
    // then has no edge to recolor on hover while primary fill and nowrap
    // contracts stay green.
    expect(stylesCss).toMatch(
      /\.btn\s*\{[^}]*border:\s*2px\s+solid\s+transparent/s
    );
  });

  test("btn keeps cursor:pointer so CTAs advertise clickability", () => {
    // Geometry locks still pass if cursor defaults to text/auto — quote and
    // Call Now then lose the only affordance cue while flex centering and
    // weight contracts remain green.
    expect(stylesCss).toMatch(
      /\.btn\s*\{[^}]*cursor:\s*pointer/s
    );
  });
});

describe("gallery-tile label type hierarchy", () => {
  test("gallery-tile strong keeps 0.95rem so project titles stay primary", () => {
    // Ink color locks still pass if strong inherits body or caption size —
    // placeholder categories then flatten beside muted spans while wood-light
    // glyph and centering contracts stay green.
    expect(stylesCss).toMatch(
      /\.gallery-tile\s+strong\s*\{[^}]*font-size:\s*0\.95rem/s
    );
  });

  test("gallery-tile span keeps 0.8rem so captions stay secondary to titles", () => {
    // Muted tile color locks still pass if span grows to strong size —
    // supporting captions then compete with project labels while dashed plane
    // and ink strong contracts remain green.
    expect(stylesCss).toMatch(
      /\.gallery-tile\s+span\s*\{[^}]*font-size:\s*0\.8rem/s
    );
  });
});

describe("service-card body type + spacing", () => {
  test("service-card p keeps 0.96rem so descriptions stay under h3 titles", () => {
    // Muted color + h3 size locks still pass if body copy grows to title size —
    // service blurbs then compete with wood-chip headings while surface and
    // hover-lift contracts remain green.
    expect(stylesCss).toMatch(
      /\.service-card\s+p\s*\{[^}]*font-size:\s*0\.96rem/s
    );
  });

  test("service-card p clears bottom margin so cards do not stack extra space", () => {
    // Title margin + muted color locks still pass if p keeps a default
    // paragraph margin — catalog cards then grow uneven gaps under blurbs while
    // service-icon and h3 spacing contracts stay green.
    expect(stylesCss).toMatch(
      /\.service-card\s+p\s*\{[^}]*margin-bottom:\s*0/s
    );
  });
});

describe("service-card resting plane geometry", () => {
  test("service-card keeps radius-md corners matching gallery/testimonial planes", () => {
    // Surface/border locks still pass if radius softens to pill or goes square —
    // six catalog cards then clash with gallery-tile / testimonial radius-md
    // while hover-lift and muted-p contracts remain green.
    expect(stylesCss).toMatch(
      /\.service-card\s*\{[^}]*border-radius:\s*var\(--radius-md\)/s
    );
  });

  test("service-card keeps 32px/28px padding so icon+title+blurb stay readable", () => {
    // Surface/border/radius locks still pass if padding collapses — wood chips
    // and service blurbs then kiss the card edge while catalog↔option parity
    // and hover translateY contracts stay green.
    expect(stylesCss).toMatch(
      /\.service-card\s*\{[^}]*padding:\s*32px\s+28px/s
    );
  });
});

describe("testimonial-card resting plane geometry", () => {
  test("testimonial-card keeps radius-md corners matching service/gallery planes", () => {
    // Surface/border + SAMPLE badge locks still pass if radius drifts — review
    // cards then clash with service-card / gallery-tile radius-md while quote
    // italic and gold-star contracts remain green.
    expect(stylesCss).toMatch(
      /\.testimonial-card\s*\{[^}]*border-radius:\s*var\(--radius-md\)/s
    );
  });

  test("testimonial-card keeps 28px padding so quote and author clear the edges", () => {
    // Surface/relative/badge locks still pass if padding collapses — italic
    // quotes and author lines then kiss the border while SAMPLE chip anchor
    // and muted author-span contracts stay green.
    expect(stylesCss).toMatch(
      /\.testimonial-card\s*\{[^}]*padding:\s*28px/s
    );
  });
});

describe("cta-actions dark-band CTA row layout", () => {
  test("cta-actions centers Quote + Call with flex wrap and a 16px gap", () => {
    // cta-band btn-light / btn-outline-light pairing locks still pass if the
    // actions row loses flex-wrap, gap, or centering — narrow viewports then
    // overflow or left-align the only dark-band conversion CTAs while fill
    // contrast contracts remain green.
    expect(stylesCss).toMatch(/\.cta-actions\s*\{[^}]*display:\s*flex/s);
    expect(stylesCss).toMatch(/\.cta-actions\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(stylesCss).toMatch(/\.cta-actions\s*\{[^}]*gap:\s*16px/s);
    expect(stylesCss).toMatch(
      /\.cta-actions\s*\{[^}]*justify-content:\s*center/s
    );
  });
});

describe("contact page-hero entry hierarchy", () => {
  test("page-hero keeps a centered cream band for the contact entry", () => {
    // Lead-form field/DOM-order locks still pass if page-hero loses bg-alt or
    // text-align — Get in Touch then sits flush on cream without a distinct
    // entry plane while contact-grid and form-card contracts stay green.
    expect(stylesCss).toMatch(
      /\.page-hero\s*\{[^}]*background:\s*var\(--color-bg-alt\)/s
    );
    expect(stylesCss).toMatch(/\.page-hero\s*\{[^}]*text-align:\s*center/s);
  });

  test("page-hero supporting paragraph stays muted and measure-limited", () => {
    // Centered bg-alt locks still pass if the lede bleaches to ink or loses
    // max-width — contact intro then dominates the H1 or stretches edge-to-
    // edge while form-card heading and hours-row contracts remain green.
    expect(stylesCss).toMatch(
      /\.page-hero\s+p\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
    expect(stylesCss).toMatch(
      /\.page-hero\s+p\s*\{[^}]*max-width:\s*620px/s
    );
  });

  test("page-hero h1 keeps a responsive clamp so Get in Touch stays primary", () => {
    // Centered bg-alt / muted-lede locks still pass if the H1 collapses to a
    // fixed body size — contact entry then loses hierarchy above the form
    // while form-card heading and hours-row contracts remain green.
    expect(stylesCss).toMatch(
      /\.page-hero\s+h1\s*\{[^}]*font-size:\s*clamp\(\s*2rem\s*,\s*4vw\s*,\s*2\.8rem\s*\)/s
    );
  });

  test("page-hero keeps 72px/56px vertical padding for the contact entry band", () => {
    // Centered cream-band locks still pass if padding collapses to section
    // defaults — Get in Touch then sits tight against the sticky header while
    // muted lede and form-card contracts stay green.
    expect(stylesCss).toMatch(
      /\.page-hero\s*\{[^}]*padding:\s*72px\s+0\s+56px/s
    );
  });
});

describe("gallery placeholder-note warning chip", () => {
  test("placeholder-note keeps warning fill, border, and ink for gallery honesty", () => {
    // Gallery-tile stack / label locks still pass if the warning chip bleaches
    // into cream page tones — visitors then miss that tiles are placeholders
    // before launch while gallery-grid and tile geometry contracts stay green.
    expect(stylesCss).toMatch(
      /\.placeholder-note\s*\{[^}]*background-color:\s*#fff4dd/s
    );
    expect(stylesCss).toMatch(
      /\.placeholder-note\s*\{[^}]*border:\s*1px\s+solid\s+#ecd8a4/s
    );
    expect(stylesCss).toMatch(
      /\.placeholder-note\s*\{[^}]*color:\s*#7a5b12/s
    );
  });

  test("placeholder-note stays an inline-flex pill with compact padding", () => {
    // Warning color locks still pass if the chip loses pill radius or flex
    // alignment — the honesty banner then reads as a block paragraph while
    // gallery-tile centering contracts remain green.
    expect(stylesCss).toMatch(
      /\.placeholder-note\s*\{[^}]*display:\s*inline-flex/s
    );
    expect(stylesCss).toMatch(
      /\.placeholder-note\s*\{[^}]*align-items:\s*center/s
    );
    expect(stylesCss).toMatch(
      /\.placeholder-note\s*\{[^}]*border-radius:\s*999px/s
    );
    expect(stylesCss).toMatch(
      /\.placeholder-note\s*\{[^}]*padding:\s*8px\s+14px/s
    );
  });

  test("placeholder-note--centered centers above the gallery grid", () => {
    // Chip color/pill locks still pass if centering drops — the warning then
    // left-aligns under a centered section heading while gallery-grid gap
    // contracts stay green.
    expect(stylesCss).toMatch(
      /\.placeholder-note--centered\s*\{[^}]*display:\s*flex/s
    );
    expect(stylesCss).toMatch(
      /\.placeholder-note--centered\s*\{[^}]*margin-inline:\s*auto/s
    );
    expect(stylesCss).toMatch(
      /\.placeholder-note--centered\s*\{[^}]*width:\s*fit-content/s
    );
  });
});

describe("cta-band conversion band spacing + hierarchy", () => {
  test("cta-band keeps 80px vertical padding around Quote + Call", () => {
    // btn-light / btn-outline-light and cta-actions flex locks still pass if
    // the dark band padding collapses — Ready to Start then sits flush against
    // service-area while CTA fill contrast contracts remain green.
    expect(stylesCss).toMatch(
      /\.cta-band\s*\{[^}]*padding:\s*80px\s+0/s
    );
  });

  test("cta-band h2 keeps a responsive clamp so the close stays primary", () => {
    // White heading color locks still pass if the H2 collapses to body size —
    // Ready to Start then loses hierarchy above the muted lede while
    // cta-actions centering contracts stay green.
    expect(stylesCss).toMatch(
      /\.cta-band\s+h2\s*\{[^}]*font-size:\s*clamp\(\s*1\.6rem\s*,\s*3vw\s*,\s*2\.2rem\s*\)/s
    );
  });
});

describe("service-area area-intro hierarchy", () => {
  test("area-intro stays muted above the city chip row", () => {
    // area-chip pill / map-card locks still pass if the intro bleaches to ink —
    // Proudly Serving then loses a secondary lede above chips while chip
    // geometry and map-card elevation contracts remain green.
    expect(stylesCss).toMatch(
      /\.area-intro\s*\{[^}]*color:\s*var\(--color-text-muted\)/s
    );
    expect(stylesCss).toMatch(
      /\.area-intro\s*\{[^}]*margin-bottom:\s*24px/s
    );
  });
});

describe("shared btn motion transition token", () => {
  test("btn transitions transform/fill/color/border/shadow via --transition", () => {
    // Resting geometry / :active translateY locks still pass if transition is
    // dropped or hardcoded — hover/press motion then desyncs across Quote and
    // Call CTAs while fill contrast and focus contracts stay green.
    expect(stylesCss).toMatch(/--transition:\s*200ms\s+ease/);
    expect(stylesCss).toMatch(
      /\.btn\s*\{[^}]*transition:\s*transform\s+var\(--transition\)\s*,\s*background-color\s+var\(--transition\)\s*,\s*color\s+var\(--transition\)\s*,\s*border-color\s+var\(--transition\)\s*,\s*box-shadow\s+var\(--transition\)/s
    );
  });
});

describe("gallery placeholder-note icon + grid spacing", () => {
  test("placeholder-note svg keeps a fixed 16px box and flex-shrink", () => {
    // Chip color/pill locks still pass if the warning icon loses width/height
    // or flex-shrink:0 — long honesty copy then crushes the glyph while
    // placeholder-note padding and gallery-tile contracts stay green.
    expect(stylesCss).toMatch(
      /\.placeholder-note\s+svg\s*\{[^}]*width:\s*16px/s
    );
    expect(stylesCss).toMatch(
      /\.placeholder-note\s+svg\s*\{[^}]*height:\s*16px/s
    );
    expect(stylesCss).toMatch(
      /\.placeholder-note\s+svg\s*\{[^}]*flex-shrink:\s*0/s
    );
  });

  test("centered placeholder-note keeps 28px gap before the gallery grid", () => {
    // Centering + gallery-grid column locks still pass if the adjacent-sibling
    // margin-top drops — the honesty chip then sits flush against tiles while
    // grid track and tile geometry contracts remain green.
    expect(stylesCss).toMatch(
      /\.placeholder-note--centered\s*\+\s*\.gallery-grid\s*\{[^}]*margin-top:\s*28px/s
    );
  });
});

describe("cta-band supporting copy measure", () => {
  test("cta-band p keeps a limited measure and slightly larger body size", () => {
    // Muted 78% white color locks still pass if max-width or 1.05rem drop —
    // Ready to Start lede then spans full band width at body size while
    // cta-band padding/h2 clamp and CTA fill contracts stay green.
    expect(stylesCss).toMatch(
      /\.cta-band\s+p\s*\{[^}]*max-width:\s*560px/s
    );
    expect(stylesCss).toMatch(
      /\.cta-band\s+p\s*\{[^}]*font-size:\s*1\.05rem/s
    );
    expect(stylesCss).toMatch(
      /\.cta-band\s+p\s*\{[^}]*margin-inline:\s*auto/s
    );
  });
});

describe("contact page-hero eyebrow centering", () => {
  test("page-hero .eyebrow stays inline-flex centered above Get in Touch", () => {
    // Section .eyebrow accent-dark color locks still pass if page-hero loses
    // inline-flex/center — Let's Talk then left-aligns under a centered H1
    // while page-hero padding/h1 clamp contracts remain green.
    expect(stylesCss).toMatch(
      /\.page-hero\s+\.eyebrow\s*\{[^}]*display:\s*inline-flex/s
    );
    expect(stylesCss).toMatch(
      /\.page-hero\s+\.eyebrow\s*\{[^}]*justify-content:\s*center/s
    );
  });
});

describe("gallery placeholder-note type + spacing tokens", () => {
  test("placeholder-note keeps compact type weight and icon/text gap", () => {
    // Chip color/pill/padding locks still pass if type bleaches to body weight
    // or the icon/text gap collapses — the honesty banner then reads as muted
    // body copy while gallery-tile and svg size contracts stay green.
    expect(stylesCss).toMatch(
      /\.placeholder-note\s*\{[^}]*gap:\s*8px/s
    );
    expect(stylesCss).toMatch(
      /\.placeholder-note\s*\{[^}]*font-size:\s*0\.85rem/s
    );
    expect(stylesCss).toMatch(
      /\.placeholder-note\s*\{[^}]*font-weight:\s*600/s
    );
  });

  test("placeholder-note keeps 20px clearance below the honesty chip", () => {
    // Adjacent-sibling gallery margin-top locks still pass if the chip's own
    // margin-bottom drops — warning copy then sits flush against tiles on
    // non-centered layouts while gallery-grid track contracts remain green.
    expect(stylesCss).toMatch(
      /\.placeholder-note\s*\{[^}]*margin-bottom:\s*20px/s
    );
  });
});

describe("cta-band supporting copy CTA clearance", () => {
  test("cta-band p keeps 32px margin below the lede before Quote + Call", () => {
    // Measure / 1.05rem / margin-inline locks still pass if margin-bottom
    // collapses — Ready to Start copy then crowds the CTA row while
    // cta-actions flex and btn-light contrast contracts stay green.
    expect(stylesCss).toMatch(
      /\.cta-band\s+p\s*\{[^}]*margin-bottom:\s*32px/s
    );
  });
});

describe("contact page-hero supporting copy size", () => {
  test("page-hero p keeps 1.05rem so the contact lede stays above body size", () => {
    // Muted color / max-width locks still pass if font-size collapses to body
    // — Get in Touch intro then loses hierarchy under the H1 while form-card
    // heading and hours-row contracts remain green.
    expect(stylesCss).toMatch(
      /\.page-hero\s+p\s*\{[^}]*font-size:\s*1\.05rem/s
    );
  });
});

describe("cta-band heading clearance above muted lede", () => {
  test("cta-band h2 keeps 14px margin below Ready to Start", () => {
    // White color + clamp size locks still pass if margin-bottom collapses —
    // Ready to Start then sits flush on the 78% white lede while cta-band
    // padding and cta-actions centering contracts stay green.
    expect(stylesCss).toMatch(
      /\.cta-band\s+h2\s*\{[^}]*margin-bottom:\s*14px/s
    );
  });
});

describe("contact page-hero heading clearance above lede", () => {
  test("page-hero h1 keeps 14px margin below Get in Touch", () => {
    // Clamp size + muted lede locks still pass if margin-bottom collapses —
    // Get in Touch then crowds the contact intro while page-hero padding and
    // form-card heading contracts remain green.
    expect(stylesCss).toMatch(
      /\.page-hero\s+h1\s*\{[^}]*margin-bottom:\s*14px/s
    );
  });
});

describe("contact page-hero supporting copy centering", () => {
  test("page-hero p stays horizontally centered under the H1", () => {
    // Muted color / max-width / 1.05rem locks still pass if margin-inline:auto
    // drops — the contact lede then left-aligns inside a centered page-hero
    // while form-card and hours-row contracts stay green.
    expect(stylesCss).toMatch(
      /\.page-hero\s+p\s*\{[^}]*margin-inline:\s*auto/s
    );
  });
});

describe("cta-band conversion band text centering", () => {
  test("cta-band keeps text-align center for Ready to Start hierarchy", () => {
    // cta-actions flex justify-content:center locks still pass if the band
    // loses text-align — Ready to Start and the muted lede then left-align
    // above centered Quote + Call while btn-light contrast contracts stay green.
    expect(stylesCss).toMatch(
      /\.cta-band\s*\{[^}]*text-align:\s*center/s
    );
  });
});

describe("section-heading h2 size + clearance", () => {
  test("section-heading h2 keeps a responsive clamp so catalog titles stay primary", () => {
    // Muted supporting-paragraph locks still pass if H2 size collapses to body —
    // What We Do / About / Gallery / Testimonials titles then lose scan weight
    // while eyebrow accent-dark and section-heading p muted contracts stay green.
    expect(stylesCss).toMatch(
      /\.section-heading\s+h2\s*\{[^}]*font-size:\s*clamp\(\s*1\.7rem\s*,\s*3vw\s*,\s*2\.4rem\s*\)/s
    );
  });

  test("section-heading h2 keeps 14px margin below catalog titles", () => {
    // Clamp size locks still pass if margin-bottom collapses — section H2s then
    // sit flush on muted supporting copy while eyebrow color and section-heading
    // p muted contracts remain green.
    expect(stylesCss).toMatch(
      /\.section-heading\s+h2\s*\{[^}]*margin-bottom:\s*14px/s
    );
  });
});

describe("section eyebrow clearance above H2", () => {
  test("eyebrow keeps 14px margin below What We Do-style labels", () => {
    // Accent-dark color locks still pass if margin-bottom collapses — section
    // eyebrows then crowd the H2 while hero-eyebrow tint and section-heading
    // h2 clamp contracts stay green.
    expect(stylesCss).toMatch(
      /\.eyebrow\s*\{[^}]*margin-bottom:\s*14px/s
    );
  });
});

describe("testimonial-stars clearance above quote body", () => {
  test("testimonial-stars keep 14px margin below the gold rating row", () => {
    // Gold color locks still pass if margin-bottom collapses — star glyphs then
    // sit flush on italic quote copy while sample-badge and testimonial-author
    // contracts remain green.
    expect(stylesCss).toMatch(
      /\.testimonial-stars\s*\{[^}]*margin-bottom:\s*14px/s
    );
  });
});

describe("footer-brand wordmark clearance above blurb", () => {
  test("footer-brand .brand keeps 14px margin below the wordmark", () => {
    // Explicit #fff color locks still pass if margin-bottom collapses — the
    // footer wordmark then crowds the blurb while brand-mark wood-light and
    // footer-col h4 contracts stay green.
    expect(stylesCss).toMatch(
      /\.footer-brand\s+\.brand\s*\{[^}]*margin-bottom:\s*14px/s
    );
  });
});

describe("section-heading measure + section clearance", () => {
  test("section-heading keeps a 680px max-width so catalog copy stays readable", () => {
    // H2 clamp + muted supporting-paragraph locks still pass if max-width
    // drops — What We Do / About / Gallery intros then stretch full-bleed
    // while eyebrow accent-dark and section-heading h2 margin contracts stay green.
    expect(stylesCss).toMatch(
      /\.section-heading\s*\{[^}]*max-width:\s*680px/s
    );
  });

  test("section-heading keeps 48px margin below the intro block", () => {
    // Max-width + H2 clearance locks still pass if margin-bottom collapses —
    // section intros then sit flush on service/gallery grids while eyebrow
    // margin and section-heading p muted contracts remain green.
    expect(stylesCss).toMatch(
      /\.section-heading\s*\{[^}]*margin-bottom:\s*48px/s
    );
  });
});

describe("section eyebrow type treatment for scan hierarchy", () => {
  test("eyebrow keeps uppercase tracking so What We Do labels stay secondary", () => {
    // Accent-dark color + 14px margin locks still pass if letter-spacing or
    // text-transform drop — section eyebrows then read as body copy while
    // hero-eyebrow tint and section-heading h2 clamp contracts stay green.
    expect(stylesCss).toMatch(
      /\.eyebrow\s*\{[^}]*letter-spacing:\s*0\.14em/s
    );
    expect(stylesCss).toMatch(
      /\.eyebrow\s*\{[^}]*text-transform:\s*uppercase/s
    );
  });

  test("eyebrow keeps bold weight so catalog labels stay distinct from H2", () => {
    // Uppercase + tracking locks still pass if font-weight softens — eyebrows
    // then lose the only weight cue against Fraunces H2s while color and
    // margin-bottom contracts remain green.
    expect(stylesCss).toMatch(
      /\.eyebrow\s*\{[^}]*font-weight:\s*700/s
    );
  });
});

describe("testimonial-stars row layout", () => {
  test("testimonial-stars keep a flex row with 4px glyph gaps", () => {
    // Gold color + 14px margin locks still pass if display/gap drift — star
    // glyphs then stack or spread while sample-badge and testimonial-author
    // contracts stay green.
    expect(stylesCss).toMatch(
      /\.testimonial-stars\s*\{[^}]*display:\s*flex/s
    );
    expect(stylesCss).toMatch(
      /\.testimonial-stars\s*\{[^}]*gap:\s*4px/s
    );
  });
});

describe("section-heading.center alignment for catalog intros", () => {
  test("section-heading.center keeps margin-inline auto so Services/Gallery/Testimonials intros stay centered", () => {
    // Max-width 680px + H2 clamp locks still pass if margin-inline drops —
    // centered catalog intros then hug the left edge while eyebrow accent-dark
    // and section-heading measure contracts remain green.
    expect(stylesCss).toMatch(
      /\.section-heading\.center\s*\{[^}]*margin-inline:\s*auto/s
    );
  });

  test("section-heading.center keeps text-align center so eyebrow/H2/lede stay centered", () => {
    // margin-inline:auto alone still passes if text-align drifts left — What We
    // Do / Gallery / Client Feedback blocks then left-align copy inside a
    // centered box while section-heading max-width contracts stay green.
    expect(stylesCss).toMatch(
      /\.section-heading\.center\s*\{[^}]*text-align:\s*center/s
    );
  });
});

describe("section eyebrow compact type + body font", () => {
  test("eyebrow keeps 0.78rem size so What We Do labels stay secondary to H2", () => {
    // Uppercase + tracking + weight 700 locks still pass if font-size grows to
    // body — catalog eyebrows then compete with Fraunces H2s while accent-dark
    // and margin-bottom contracts remain green.
    expect(stylesCss).toMatch(
      /\.eyebrow\s*\{[^}]*font-size:\s*0\.78rem/s
    );
  });

  test("eyebrow stays inline-block with body font so labels do not inherit Fraunces", () => {
    // Compact size + uppercase locks still pass if display becomes block or
    // font-family inherits heading — eyebrows then stretch full-bleed or read
    // as mini-H2s while letter-spacing and font-weight contracts stay green.
    expect(stylesCss).toMatch(
      /\.eyebrow\s*\{[^}]*display:\s*inline-block/s
    );
    expect(stylesCss).toMatch(
      /\.eyebrow\s*\{[^}]*font-family:\s*var\(--font-body\)/s
    );
  });
});

describe("testimonial-stars glyph scale", () => {
  test("testimonial-stars svg keeps a 16px box so rating glyphs stay compact", () => {
    // Flex row + gold color + 14px margin locks still pass if svg width/height
    // drift — Client Feedback stars then dominate the card while sample-badge
    // and testimonial-author contracts remain green.
    expect(stylesCss).toMatch(
      /\.testimonial-stars\s+svg\s*\{[^}]*width:\s*16px/s
    );
    expect(stylesCss).toMatch(
      /\.testimonial-stars\s+svg\s*\{[^}]*height:\s*16px/s
    );
  });
});

describe("section-heading supporting copy size + flush margin", () => {
  test("section-heading p keeps 1.05rem so catalog ledes stay above body size", () => {
    // Muted color alone still passes if font-size collapses to body — What We
    // Do / Gallery / Client Feedback intros then lose hierarchy under H2 while
    // eyebrow compact type and section-heading measure contracts stay green.
    expect(stylesCss).toMatch(
      /\.section-heading\s+p\s*\{[^}]*font-size:\s*1\.05rem/s
    );
  });

  test("section-heading p keeps margin-bottom 0 so global p margin does not stack", () => {
    // Color + 1.05rem locks still pass if margin-bottom inherits the global
    // `p { margin: 0 0 1em }` — section intros then double-clear below the 48px
    // section-heading block while H2 clamp and eyebrow contracts remain green.
    expect(stylesCss).toMatch(
      /\.section-heading\s+p\s*\{[^}]*margin-bottom:\s*0/s
    );
  });
});

describe("page-hero eyebrow type parity with section eyebrows", () => {
  test("contact page-hero keeps the shared eyebrow class above Get in Touch", () => {
    // Layout-only .page-hero .eyebrow locks still pass if markup drops class
    // "eyebrow" — Let's Talk then loses accent-dark / tracking / uppercase while
    // inline-flex centering and page-hero padding contracts stay green.
    expect(contactHtml).toMatch(
      /class="page-hero"[\s\S]*?<span\s+class="eyebrow">\s*Let's Talk\s*<\/span>/
    );
  });

  test("page-hero .eyebrow does not override inherited eyebrow type tokens", () => {
    // Shared .eyebrow accent-dark / 0.14em / uppercase / 700 / 0.78rem locks
    // still pass if .page-hero .eyebrow reintroduces a conflicting color or
    // tracking — Contact "Let's Talk" then desyncs from section eyebrows while
    // display:inline-flex and justify-content:center contracts remain green.
    const block = stylesCss.match(/\.page-hero\s+\.eyebrow\s*\{([^}]*)\}/s);
    expect(block).not.toBeNull();
    const body = block[1];
    expect(body).not.toMatch(/color\s*:/);
    expect(body).not.toMatch(/letter-spacing\s*:/);
    expect(body).not.toMatch(/text-transform\s*:/);
    expect(body).not.toMatch(/font-weight\s*:/);
    expect(body).not.toMatch(/font-size\s*:/);
  });
});

describe("testimonial-card quote body type + author clearance", () => {
  test("testimonial-card p stays italic so Client Feedback quotes read as speech", () => {
    // Author weight/size + stars glyph locks still pass if font-style drops —
    // quote copy then reads as another muted bio paragraph while
    // testimonial-author and sample-badge contracts remain green.
    expect(stylesCss).toMatch(
      /\.testimonial-card\s+p\s*\{[^}]*font-style:\s*italic/s
    );
  });

  test("testimonial-card p keeps 18px clearance above the author line", () => {
    // Italic + text color locks still pass if margin-bottom collapses — quote
    // body then sits flush on the bold author name while testimonial-stars
    // and testimonial-author contracts stay green.
    expect(stylesCss).toMatch(
      /\.testimonial-card\s+p\s*\{[^}]*margin-bottom:\s*18px/s
    );
  });

  test("testimonial-card p keeps ink text so italic quotes stay readable", () => {
    // Italic + 18px clearance locks still pass if color softens to muted or
    // bleaches — Client Feedback quotes then lose contrast on the cream card
    // while author weight and stars gold contracts remain green.
    expect(stylesCss).toMatch(
      /\.testimonial-card\s+p\s*\{[^}]*color:\s*var\(--color-text\)/s
    );
  });
});

describe("hero-eyebrow compact type vs section eyebrow tracking", () => {
  test("hero-eyebrow keeps 0.06em tracking (not section 0.14em)", () => {
    // Section `.eyebrow` locks 0.14em. Copying that onto `.hero-eyebrow` (or
    // the reverse) collapses the intentional pill-vs-section hierarchy — the
    // SWFL location chip then reads as a section label while accent-dark tint
    // and section letter-spacing contracts stay green.
    expect(stylesCss).toMatch(
      /\.hero-eyebrow\s*\{[^}]*letter-spacing:\s*0\.06em/s
    );
    expect(stylesCss).toMatch(
      /\.eyebrow\s*\{[^}]*letter-spacing:\s*0\.14em/s
    );
  });

  test("hero-eyebrow stays uppercase bold so the SWFL chip reads as a label", () => {
    // Compact 0.06em tracking alone still passes if weight/transform drop —
    // Southwest Florida then reads as muted body beside the H1 while sage tint
    // and section-eyebrow contracts remain green.
    expect(stylesCss).toMatch(
      /\.hero-eyebrow\s*\{[^}]*text-transform:\s*uppercase/s
    );
    expect(stylesCss).toMatch(
      /\.hero-eyebrow\s*\{[^}]*font-weight:\s*700/s
    );
  });

  test("hero-eyebrow keeps 0.8rem so the location pill stays below H1 scale", () => {
    // Uppercase/weight locks still pass if font-size grows toward body or
    // matches section 0.78rem without intent — the first-viewport chip then
    // competes with the brand headline while sage tint contracts stay green.
    expect(stylesCss).toMatch(
      /\.hero-eyebrow\s*\{[^}]*font-size:\s*0\.8rem/s
    );
  });

  test("hero-eyebrow keeps 22px clearance above the hero H1", () => {
    // Type/tint locks still pass if margin-bottom collapses to section 14px or
    // zero — Southwest Florida then crowds Custom Carpentry while hero h1 clamp
    // and section-eyebrow 14px contracts remain green.
    expect(stylesCss).toMatch(
      /\.hero-eyebrow\s*\{[^}]*margin-bottom:\s*22px/s
    );
  });
});

describe("sample-badge compact tracking for SAMPLE disclosure", () => {
  test("sample-badge keeps 0.06em uppercase tracking on SAMPLE chips", () => {
    // Ink/#fff + absolute position locks still pass if letter-spacing/transform
    // drop — SAMPLE then reads as sentence case body on the chip while
    // testimonial-card surface and stars gold contracts stay green.
    expect(stylesCss).toMatch(
      /\.sample-badge\s*\{[^}]*letter-spacing:\s*0\.06em/s
    );
    expect(stylesCss).toMatch(
      /\.sample-badge\s*\{[^}]*text-transform:\s*uppercase/s
    );
  });

  test("sample-badge keeps compact 0.68rem so SAMPLE stays a disclosure chip", () => {
    // Uppercase/0.06em locks still pass if font-size grows toward body —
    // SAMPLE then dominates the card corner while ink/#fff and absolute
    // anchoring contracts remain green.
    expect(stylesCss).toMatch(
      /\.sample-badge\s*\{[^}]*font-size:\s*0\.68rem/s
    );
  });
});

describe("testimonial-author role stack under name", () => {
  test("testimonial-author span stays display:block so city/role wraps below", () => {
    // Bold name + muted/compact role locks still pass if display:block drops —
    // "Fort Myers, FL" then runs inline beside the author name while
    // testimonial-card quote and sample-badge contracts stay green.
    expect(stylesCss).toMatch(
      /\.testimonial-author\s+span\s*\{[^}]*display:\s*block/s
    );
  });
});

describe("hero-eyebrow pill geometry", () => {
  test("hero-eyebrow stays inline-flex so the SWFL chip sizes to its label", () => {
    // Type/tint/tracking locks still pass if display drops to block — Southwest
    // Florida then stretches full-bleed under the brand H1 while 0.06em / sage
    // tint / margin-bottom contracts remain green.
    expect(stylesCss).toMatch(
      /\.hero-eyebrow\s*\{[^}]*display:\s*inline-flex/s
    );
  });

  test("hero-eyebrow keeps 8px 16px padding so the location pill has breathing room", () => {
    // inline-flex alone still passes if padding collapses — the first-viewport
    // SWFL chip then reads as tight uppercase text beside the H1 while
    // letter-spacing and accent-dark tint contracts stay green.
    expect(stylesCss).toMatch(
      /\.hero-eyebrow\s*\{[^}]*padding:\s*8px\s+16px/s
    );
  });

  test("hero-eyebrow keeps pill radius 999px so the location chip stays a capsule", () => {
    // Padding/inline-flex locks still pass if border-radius softens to
    // radius-sm/md — Southwest Florida then looks like a boxed label while
    // sage tint and 0.8rem type contracts remain green.
    expect(stylesCss).toMatch(
      /\.hero-eyebrow\s*\{[^}]*border-radius:\s*999px/s
    );
  });
});

describe("sample-badge corner offset + chip weight", () => {
  test("sample-badge anchors at top:-10px right:20px so SAMPLE overhangs the card", () => {
    // Absolute position alone still passes if top/right drift to 0 — SAMPLE
    // then sits inside card padding instead of the corner overhang while
    // ink/#fff and 0.68rem contracts remain green.
    expect(stylesCss).toMatch(
      /\.sample-badge\s*\{[^}]*top:\s*-10px/s
    );
    expect(stylesCss).toMatch(
      /\.sample-badge\s*\{[^}]*right:\s*20px/s
    );
  });

  test("sample-badge keeps font-weight 700 so SAMPLE reads as a disclosure mark", () => {
    // Compact 0.68rem / uppercase locks still pass if weight drops to 400 —
    // SAMPLE then bleaches into the card corner while ink/#fff and absolute
    // anchoring contracts stay green.
    expect(stylesCss).toMatch(
      /\.sample-badge\s*\{[^}]*font-weight:\s*700/s
    );
  });

  test("sample-badge keeps compact 5px 10px padding and pill radius", () => {
    // Offset/weight locks still pass if padding grows or radius squares —
    // SAMPLE then balloons into a blocky corner label while 0.68rem and
    // ink/#fff contracts remain green.
    expect(stylesCss).toMatch(
      /\.sample-badge\s*\{[^}]*padding:\s*5px\s+10px/s
    );
    expect(stylesCss).toMatch(
      /\.sample-badge\s*\{[^}]*border-radius:\s*999px/s
    );
  });
});

describe("hero-eyebrow service-area messaging ↔ JSON-LD areaServed", () => {
  test("hero-eyebrow leads with Southwest Florida then middot-separated towns", () => {
    // Area-chip / contact small-list locks still pass if the first-viewport
    // pill drops the regional lead-in or the · separators — Southwest Florida
    // then reads as an unstructured town dump beside the brand H1 while
    // JSON-LD areaServed content contracts stay green.
    const match = indexHtml.match(
      /<span\s+class="hero-eyebrow">\s*([^<]+?)\s*<\/span>/
    );
    expect(match).toBeTruthy();
    const label = match[1].replace(/\s+/g, " ").trim();
    expect(label.startsWith("Southwest Florida")).toBe(true);
    expect(label).toMatch(/^Southwest Florida(?:\s*·\s*[^·]+)+$/);
  });

  test("every town named in the hero-eyebrow is listed in JSON-LD areaServed", () => {
    // areaServed ↔ area-chip equality still passes if the hero pill advertises
    // a town that left the schema (or never joined it) — first-viewport
    // geography then lies about coverage while chip list and contact sidebar
    // contracts remain green.
    const areaServed = JSON.parse(
      indexHtml.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
      )[1]
    ).areaServed;
    expect(Array.isArray(areaServed)).toBe(true);

    const label = indexHtml
      .match(/<span\s+class="hero-eyebrow">\s*([^<]+?)\s*<\/span>/)[1]
      .replace(/\s+/g, " ")
      .trim();
    const parts = label.split(/\s*·\s*/).map((part) => part.trim());
    expect(parts[0]).toBe("Southwest Florida");
    const towns = parts.slice(1);
    expect(towns.length).toBeGreaterThan(0);
    for (const town of towns) {
      expect(areaServed).toContain(town);
    }
  });
});

describe("sample testimonial cities ↔ JSON-LD areaServed", () => {
  test("every testimonial-author city is listed in JSON-LD areaServed", () => {
    // SAMPLE disclosure + author stack locks still pass if a review names a
    // city outside the served list — Client Feedback then implies coverage
    // the business does not claim while sample-badge and stars contracts
    // remain green.
    const areaServed = JSON.parse(
      indexHtml.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
      )[1]
    ).areaServed;
    expect(Array.isArray(areaServed)).toBe(true);

    const cities = collectMatches(
      indexHtml,
      /class="testimonial-author"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g
    ).map((raw) => decodeBasicEntities(raw).replace(/,\s*FL\s*$/i, "").trim());

    expect(cities.length).toBeGreaterThan(0);
    for (const city of cities) {
      expect(areaServed).toContain(city);
    }
  });
});

describe("hero-eyebrow icon-ready flex alignment", () => {
  test("hero-eyebrow keeps align-items center and 8px gap for label/icon rows", () => {
    // inline-flex / padding / pill-radius locks still pass if align-items or
    // gap drop — a future pin/icon beside Southwest Florida then misaligns or
    // crowds the label while sage tint and 0.8rem type contracts stay green.
    expect(stylesCss).toMatch(
      /\.hero-eyebrow\s*\{[^}]*align-items:\s*center/s
    );
    expect(stylesCss).toMatch(
      /\.hero-eyebrow\s*\{[^}]*gap:\s*8px/s
    );
  });
});

describe("hero-eyebrow towns order-preserving prefix of areaServed", () => {
  test("hero-eyebrow towns match the leading areaServed entries in order", () => {
    // Membership-only ⊆ locks still pass if the pill reorders towns (Cape Coral
    // first) or skips the catalog lead (starts at Fort Myers) — first-viewport
    // geography then disagrees with JSON-LD / area-chip priority while "every
    // town is listed somewhere" contracts remain green.
    const areaServed = JSON.parse(
      indexHtml.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
      )[1]
    ).areaServed;
    expect(Array.isArray(areaServed)).toBe(true);

    const label = indexHtml
      .match(/<span\s+class="hero-eyebrow">\s*([^<]+?)\s*<\/span>/)[1]
      .replace(/\s+/g, " ")
      .trim();
    const parts = label.split(/\s*·\s*/).map((part) => part.trim());
    expect(parts[0]).toBe("Southwest Florida");
    const towns = parts.slice(1);
    expect(towns.length).toBeGreaterThanOrEqual(3);
    expect(areaServed.slice(0, towns.length)).toEqual(towns);
  });
});

describe("sample-badge disclosure copy", () => {
  test("every sample-badge label is exactly Sample", () => {
    // Class/presence and ink/#fff locks still pass if the chip text softens to
    // "Example", "Demo", or empty — placeholder Client Feedback then looks like
    // real reviews while SAMPLE uppercase/type contracts remain green.
    const labels = collectMatches(
      indexHtml,
      /class="sample-badge"[^>]*>\s*([^<]*?)\s*</g
    ).map((raw) => decodeBasicEntities(raw).trim());
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label).toBe("Sample");
    }
  });
});

describe("sample testimonial cities ↔ hero-eyebrow town order", () => {
  test("sample author cities follow the same order as hero-eyebrow towns", () => {
    // ⊆ areaServed membership still passes if sample reviews reorder or skip
    // the first-viewport towns — Client Feedback then leads with a lower-priority
    // city while hero-eyebrow prefix and SAMPLE disclosure contracts stay green.
    const heroTowns = indexHtml
      .match(/<span\s+class="hero-eyebrow">\s*([^<]+?)\s*<\/span>/)[1]
      .replace(/\s+/g, " ")
      .trim()
      .split(/\s*·\s*/)
      .map((part) => part.trim())
      .slice(1);

    const cities = collectMatches(
      indexHtml,
      /class="testimonial-author"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g
    ).map((raw) => decodeBasicEntities(raw).replace(/,\s*FL\s*$/i, "").trim());

    expect(cities.length).toBeGreaterThan(0);
    expect(cities.length).toBeLessThanOrEqual(heroTowns.length);
    expect(heroTowns.slice(0, cities.length)).toEqual(cities);
  });
});

describe("sample testimonial author name disclosure", () => {
  test("every testimonial-author display name is exactly Sample Client", () => {
    // SAMPLE chip + city ⊆ areaServed locks still pass if author names soften to
    // "Happy Homeowner", initials, or a plausible first name — Client Feedback
    // then reads as attributed social proof while disclosure chrome stays green.
    const names = collectMatches(
      indexHtml,
      /class="testimonial-author"[^>]*>([^<]*?)<span>/g
    ).map((raw) => decodeBasicEntities(raw).replace(/\s+/g, " ").trim());

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).toBe("Sample Client");
    }
  });
});

describe("sample testimonial quote placeholder prefix", () => {
  test("every Client Feedback quote starts with Placeholder testimonial", () => {
    // Author/SAMPLE disclosure locks still pass if quote bodies drop the
    // "Placeholder testimonial — …" lead-in and only keep polished praise —
    // sample cards then look like real reviews while Sample Client / Sample
    // chip contracts remain green.
    const quotes = collectMatches(
      indexHtml,
      /class="testimonial-card"[^>]*>[\s\S]*?<p>\s*"([^"]+)"/g
    ).map((raw) => decodeBasicEntities(raw).replace(/\s+/g, " ").trim());

    expect(quotes.length).toBeGreaterThan(0);
    for (const quote of quotes) {
      expect(quote.startsWith("Placeholder testimonial")).toBe(true);
    }
  });
});

describe("testimonials section honesty lede", () => {
  test("testimonials heading keeps the real-reviews-replace-samples disclaimer", () => {
    // SAMPLE / Sample Client / Placeholder quote locks still pass if the
    // section lede softens to generic praise intro copy — visitors lose the
    // only catalog-level honesty signal above the sample cards.
    const block = indexHtml.match(
      /id="testimonials"[\s\S]*?<div class="section-heading[^"]*">([\s\S]*?)<\/div>/
    );
    expect(block).toBeTruthy();
    const lede = block[1]
      .match(/<p>\s*([^<]+?)\s*<\/p>/)[1]
      .replace(/\s+/g, " ")
      .trim();
    expect(lede).toMatch(/real client reviews/i);
    expect(lede).toMatch(/sample quotes/i);
  });
});

describe("gallery tile placeholder captions", () => {
  test("every gallery-tile caption is exactly Photos coming soon", () => {
    // Dashed tile / wood-light mark / strong title locks still pass if span
    // captions soften to finished-looking project blurbs ("Custom built-ins",
    // "Recent remodel") — Gallery then reads as a photo portfolio while
    // placeholder-note chrome contracts remain green.
    const captions = collectMatches(
      indexHtml,
      /class="gallery-tile"[^>]*>[\s\S]*?<span>\s*([^<]*?)\s*<\/span>/g
    ).map((raw) => decodeBasicEntities(raw).replace(/\s+/g, " ").trim());

    expect(captions.length).toBeGreaterThan(0);
    for (const caption of captions) {
      expect(caption).toBe("Photos coming soon");
    }
  });
});

describe("gallery placeholder-note honesty copy", () => {
  test("placeholder-note keeps the replace-with-real-photos-before-launch string", () => {
    // Warning-chip chrome + "Photos coming soon" caption locks still pass if the
    // banner softens to "Featured work" / drops "before launch" — Gallery then
    // reads as a live portfolio while dashed-tile / caption contracts stay green.
    // e2e only asserts /placeholder/i, so wording regressions slip through.
    const notes = collectMatches(
      indexHtml,
      /class="placeholder-note[^"]*"[^>]*>[\s\S]*?<\/svg>\s*([^<]+?)\s*</g
    ).map((raw) => decodeBasicEntities(raw).replace(/\s+/g, " ").trim());

    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) {
      expect(note).toBe(
        "Placeholder gallery — replace with real project photos before launch"
      );
    }
  });
});

describe("gallery section honesty lede", () => {
  test("gallery heading keeps the photos-being-added-soon disclaimer", () => {
    // placeholder-note exact copy + tile captions still pass if the section lede
    // softens to "Explore our recent builds" — visitors lose the catalog-level
    // honesty signal above the tiles while chip/caption contracts remain green.
    const block = indexHtml.match(
      /id="gallery"[\s\S]*?<div class="section-heading[^"]*">([\s\S]*?)<\/div>/
    );
    expect(block).toBeTruthy();
    const lede = block[1]
      .match(/<p>\s*([^<]+?)\s*<\/p>/)[1]
      .replace(/\s+/g, " ")
      .trim();
    expect(lede).toMatch(/photos? (are )?being added soon/i);
    expect(lede).toMatch(/showcase/i);
  });
});

describe("gallery-tile project title catalog", () => {
  test("gallery-tile strong labels keep the ordered project category catalog", () => {
    // CSS title hierarchy + "Photos coming soon" captions still pass if strong
    // labels soft-rename (e.g. "Custom Cabinets" vs "Built-In Cabinetry") or
    // drop categories — Gallery then drifts from the intended showcase map while
    // placeholder chrome contracts remain green.
    const titles = collectMatches(
      indexHtml,
      /class="gallery-tile"[^>]*>[\s\S]*?<strong>\s*([\s\S]*?)\s*<\/strong>/g
    ).map((raw) => decodeBasicEntities(raw).replace(/\s+/g, " ").trim());

    expect(titles).toEqual([
      "Kitchen Remodel",
      "Custom Trim & Millwork",
      "Built-In Cabinetry",
      "Entry Doors & Foyers",
      "Decks & Outdoor Living",
      "Bathroom Remodel",
    ]);
  });
});

describe("about-portrait caption honesty copy", () => {
  test("about-portrait-caption keeps the photo-coming-soon disclosure", () => {
    // Portrait plane / ink scrim / type locks still pass if the caption softens
    // to a finished bio line ("Greg Felton, Owner") — About then looks like a
    // real headshot is present while placeholder gradient contracts stay green.
    const captions = collectMatches(
      indexHtml,
      /class="about-portrait-caption"[^>]*>\s*([^<]+?)\s*</g
    ).map((raw) => decodeBasicEntities(raw).replace(/\s+/g, " ").trim());

    expect(captions.length).toBeGreaterThan(0);
    for (const caption of captions) {
      expect(caption).toBe("Photo of Greg Felton — coming soon");
    }
  });
});

describe("hero-facts first-viewport trust catalog", () => {
  test("hero-fact value↔label pairs keep the ordered owner/local/custom claims", () => {
    // Grid geometry + wood-dark/muted type locks still pass if values soft-rename
    // ("15 yrs", "Fully Staffed") or labels drift — first-viewport trust messaging
    // then overclaims capacity while hero-facts layout contracts remain green.
    const facts = [
      ...indexHtml.matchAll(
        /class="hero-fact"[^>]*>\s*<strong>\s*([\s\S]*?)\s*<\/strong>\s*<span>\s*([\s\S]*?)\s*<\/span>/g
      ),
    ].map((match) => ({
      value: decodeBasicEntities(match[1]).replace(/\s+/g, " ").trim(),
      label: decodeBasicEntities(match[2]).replace(/\s+/g, " ").trim(),
    }));

    expect(facts).toEqual([
      { value: "1-on-1", label: "Direct with the owner" },
      { value: "SWFL", label: "Locally based & owned" },
      { value: "Custom", label: "Carpentry & remodels" },
    ]);
  });
});

describe("trust-strip claim catalog + credentials honesty", () => {
  test("trust-item claims keep the ordered owner/license/area/scheduling catalog", () => {
    // Ink surface / accent-light icon / flex-row locks still pass if claims soften
    // ("Fully Staffed Crews", drop "No Subcontracted") — the dark strip then
    // overpromises delivery model while trust-item layout contracts stay green.
    const claims = collectMatches(
      indexHtml,
      /class="trust-item"[^>]*>[\s\S]*?<\/svg>\s*([\s\S]*?)\s*<\/div>/g
    ).map((raw) =>
      decodeBasicEntities(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
    );

    expect(claims).toEqual([
      "Owner-Operated — No Subcontracted Crews",
      "Licensed & Insured (add credentials)",
      "Serving All of Southwest Florida",
      "Prompt, Reliable Scheduling",
    ]);
  });

  test("Licensed & Insured trust-item keeps the muted (add credentials) honesty cue", () => {
    // Exact claim catalog still passes if muted-inline is dropped and the chip
    // reads as a finished license claim — launch then advertises credentials that
    // are not filled in while trust-strip color/layout contracts remain green.
    expect(indexHtml).toMatch(
      /class="trust-item"[^>]*>[\s\S]*?Licensed\s*&amp;\s*Insured\s*<span\s+class="muted-inline">\s*\(add credentials\)\s*<\/span>/
    );
  });
});

describe("founder signature identity ↔ JSON-LD", () => {
  test("about-signature strong is the JSON-LD founder and role cites the business name", () => {
    // Typography/ink/muted locks still pass if the strong name drifts from
    // JSON-LD founder or the role drops the business name — About identity then
    // disagrees with structured data / header chrome while CSS contracts stay green.
    const data = JSON.parse(
      indexHtml.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
      )[1]
    );
    const block = indexHtml.match(
      /class="about-signature"[^>]*>\s*<div>\s*<strong>\s*([\s\S]*?)\s*<\/strong>\s*<span>\s*([\s\S]*?)\s*<\/span>/
    );
    expect(block).toBeTruthy();
    const name = decodeBasicEntities(block[1]).replace(/\s+/g, " ").trim();
    const role = decodeBasicEntities(block[2]).replace(/\s+/g, " ").trim();

    expect(name).toBe(data.founder);
    expect(role).toBe(`Owner & Carpenter, ${data.name}`);
  });

  test("hero-visual-signature attributes the JSON-LD founder as Owner & Carpenter", () => {
    // Dot/type/opacity locks still pass if the attribution softens to a generic
    // "Our Team" line or drops the founder — hero then loses the only owner lock
    // beside the quote while visual-signature geometry contracts remain green.
    const founder = JSON.parse(
      indexHtml.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
      )[1]
    ).founder;
    const raw = indexHtml.match(
      /class="hero-visual-signature"[^>]*>\s*<span class="dot"><\/span>\s*([\s\S]*?)\s*<\/div>/
    )?.[1];
    expect(raw).toBeTruthy();
    const signature = decodeBasicEntities(raw).replace(/\s+/g, " ").trim();

    expect(signature).toBe(`${founder}, Owner & Carpenter`);
  });
});

describe("service-card ordered catalog", () => {
  test("service-card h3 labels keep the ordered offerings catalog", () => {
    // Form option value↔label + "every card is selectable" still pass if cards
    // reorder or soft-rename in lockstep with options — homepage Services then
    // drifts from the intended catalog map while mailto triage contracts stay green.
    const titles = collectMatches(
      indexHtml,
      /<article class="service-card"[\s\S]*?<h3>([\s\S]*?)<\/h3>/g
    ).map((title) => decodeBasicEntities(title.replace(/\s+/g, " ").trim()));

    expect(titles).toEqual([
      "Custom Trim & Millwork",
      "Custom Cabinetry & Built-Ins",
      "Doors & Entryways",
      "Decks, Framing & Outdoor Structures",
      "Kitchen & Bath Remodels",
      "Repairs & Small Renovations",
    ]);
  });
});

describe("value-list trust bullet catalog", () => {
  test("value-list strong↔span pairs keep the ordered owner-model claims", () => {
    // Icon accent + title hierarchy + grid spacing locks still pass if bullets
    // soft-rename ("Full crew support", "Competitive volume pricing") — About
    // then overclaims delivery model while value-list CSS contracts stay green.
    const listBlock = indexHtml.match(/class="value-list"[\s\S]*?<\/ul>/);
    expect(listBlock).toBeTruthy();
    const bullets = [
      ...listBlock[0].matchAll(
        /<strong>\s*([\s\S]*?)\s*<\/strong>\s*<span>\s*([\s\S]*?)\s*<\/span>/g
      ),
    ].map((match) => ({
      title: decodeBasicEntities(match[1]).replace(/\s+/g, " ").trim(),
      description: decodeBasicEntities(match[2]).replace(/\s+/g, " ").trim(),
    }));

    expect(bullets).toEqual([
      {
        title: "Direct communication",
        description:
          "You work with Greg personally — no middlemen, no runaround.",
      },
      {
        title: "Careful, hands-on craftsmanship",
        description:
          "Every cut and detail is done personally, not delegated.",
      },
      {
        title: "Respect for your home & budget",
        description: "Clear pricing and a clean job site, every time.",
      },
    ]);
  });
});

describe("service-card title↔description catalog", () => {
  test("service-card h3↔p pairs keep the ordered offering blurbs", () => {
    // Ordered h3 catalog + form option parity still pass if body copy softens
    // to overbroad claims ("any commercial build", drop Florida weather) —
    // Services then overpromises scope while title/mailto triage locks stay green.
    const cards = [
      ...indexHtml.matchAll(
        /<article class="service-card"[\s\S]*?<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g
      ),
    ].map((match) => ({
      title: decodeBasicEntities(match[1]).replace(/\s+/g, " ").trim(),
      description: decodeBasicEntities(match[2]).replace(/\s+/g, " ").trim(),
    }));

    expect(cards).toEqual([
      {
        title: "Custom Trim & Millwork",
        description:
          "Crown molding, baseboards, wainscoting, and casing — precise, custom-fit finish carpentry for any room.",
      },
      {
        title: "Custom Cabinetry & Built-Ins",
        description:
          "Built-in shelving, closets, entertainment centers, and cabinetry designed and built to fit your space exactly.",
      },
      {
        title: "Doors & Entryways",
        description:
          "Interior and exterior door installation, entryway upgrades, and custom trim details that make a strong first impression.",
      },
      {
        title: "Decks, Framing & Outdoor Structures",
        description:
          "Wood and composite decking, pergolas, framing repairs, and outdoor living structures built to last in Florida weather.",
      },
      {
        title: "Kitchen & Bath Remodels",
        description:
          "Full or partial kitchen and bathroom remodels — cabinetry, trim, fixtures, and finish carpentry handled start to finish.",
      },
      {
        title: "Repairs & Small Renovations",
        description:
          "General repairs, punch-list work, and smaller renovation projects — no job too small for the same level of care.",
      },
    ]);
  });
});

describe("about owner-model honesty copy", () => {
  test("about copy keeps sole-operator and Greg-on-the-job claims", () => {
    // Signature↔JSON-LD + value-list catalog locks still pass if About softens
    // to "our crews" / drops "sole operator" — the page then overclaims staffing
    // while founder identity and trust-bullet contracts remain green.
    const block = indexHtml.match(
      /id="about"[\s\S]*?class="about-copy">([\s\S]*?)<ul class="value-list"/
    );
    expect(block).toBeTruthy();
    const copy = decodeBasicEntities(block[1].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();

    expect(copy).toMatch(/sole operator/i);
    expect(copy).toMatch(/no office/i);
    expect(copy).toMatch(/no dispatcher/i);
    expect(copy).toMatch(/no rotating crew/i);
    expect(copy).toMatch(/Greg is the one doing it/i);
    expect(copy).toMatch(/one-person approach/i);
  });
});

describe("cta-band conversion copy catalog", () => {
  test("cta-band keeps Ready to Start heading and personal Greg quote lede", () => {
    // btn-light / btn-outline-light pairing + spacing locks still pass if the
    // band softens to "Our team will follow up" or drops the free-quote promise —
    // the final conversion surface then loses owner-personal + quote cues while
    // dark CTA chrome contracts remain green.
    const block = indexHtml.match(/class="cta-band"[\s\S]*?<div class="container">([\s\S]*?)<div class="cta-actions"/);
    expect(block).toBeTruthy();
    const heading = block[1]
      .match(/<h2>\s*([\s\S]*?)\s*<\/h2>/)[1]
      .replace(/\s+/g, " ")
      .trim();
    const lede = decodeBasicEntities(
      block[1].match(/<p>\s*([\s\S]*?)\s*<\/p>/)[1]
    )
      .replace(/\s+/g, " ")
      .trim();

    expect(heading).toBe("Ready to Start Your Project?");
    expect(lede).toBe(
      "Tell us a bit about what you're planning and Greg will get back to you personally to talk through the details and provide a free quote."
    );
  });
});

describe("footer brand owner-operated blurb", () => {
  test("footer-brand blurb keeps owner-operated + Greg Felton claims on both pages", () => {
    // Cross-page parity alone still passes if both footers soft-rename into
    // crew/agency language and drop the owner-operated claim — chrome then
    // overpromises staffing while footer Contact parity locks stay green.
    const expected =
      "Owner-operated carpentry and general contracting serving Southwest Florida. Custom carpentry, remodels, and repairs — done personally by Greg Felton.";

    for (const html of [indexHtml, contactHtml]) {
      const raw = html.match(/class="footer-brand"[\s\S]*?<p>([\s\S]*?)<\/p>/)?.[1];
      expect(raw).toBeTruthy();
      const blurb = decodeBasicEntities(raw).replace(/\s+/g, " ").trim();
      expect(blurb).toBe(expected);
    }
  });
});

describe("area-map-card conversion copy", () => {
  test("area-map-card keeps in-range heading and SWFL drive invite", () => {
    // btn-light / gradient / muted-white paragraph locks still pass if the card
    // loses the "call if in range" invite — service-area conversion then drops
    // its only soft-boundary CTA while map-card chrome contracts remain green.
    const block = indexHtml.match(/class="area-map-card"[^>]*>([\s\S]*?)<\/div>/);
    expect(block).toBeTruthy();
    const heading = block[1]
      .match(/<h3>\s*([\s\S]*?)\s*<\/h3>/)[1]
      .replace(/\s+/g, " ")
      .trim();
    const lede = decodeBasicEntities(
      block[1].match(/<p>\s*([\s\S]*?)\s*<\/p>/)[1]
    )
      .replace(/\s+/g, " ")
      .trim();

    expect(heading).toBe("Not sure if you're in range?");
    expect(lede).toBe(
      "Give us a call — if it's a reasonable drive in Southwest Florida, we're happy to talk through your project."
    );
  });
});

describe("hero-lede owner-operated first-viewport claim", () => {
  test("hero-lede keeps personally operated Greg claim and no-crew honesty", () => {
    // hero-facts catalog + CTA chrome locks still pass if the lede softens to
    // "our crews" / call-center staffing — first viewport then overclaims
    // capacity while hero-fact and quote CTA contracts remain green.
    const raw = indexHtml.match(/class="hero-lede">([\s\S]*?)<\/p>/)?.[1];
    expect(raw).toBeTruthy();
    const lede = decodeBasicEntities(raw).replace(/\s+/g, " ").trim();

    expect(lede).toBe(
      "[Business Name] is owned and personally operated by Greg Felton. When you hire us, you're hiring the craftsman who shows up, does the work, and stands behind it — not a call center or a rotating crew."
    );
  });
});

describe("contact page-hero personal Greg + SLA lede", () => {
  test("contact page-hero keeps personal Greg response-time free-quote promise", () => {
    // page-hero H1/eyebrow + spacing locks still pass if the lede drops personal
    // Greg, the one-business-day SLA, or the free-quote cue — contact entry then
    // loses the only response promise while page-hero CSS contracts stay green.
    const block = contactHtml.match(
      /class="page-hero"[\s\S]*?<div class="container">([\s\S]*?)<\/div>/
    );
    expect(block).toBeTruthy();
    const lede = decodeBasicEntities(
      block[1].match(/<p>\s*([\s\S]*?)\s*<\/p>/)[1]
    )
      .replace(/\s+/g, " ")
      .trim();

    expect(lede).toBe(
      "Tell Greg a bit about your project and he'll get back to you personally — usually within one business day — with next steps and a free quote."
    );
  });
});

describe("contact-form-card Greg follow-up intro", () => {
  test("contact-form-card keeps Request a Free Quote heading and Greg follow-up lede", () => {
    // Field/mailto/honeypot contracts still pass if the card softens to "our team
    // will contact you" — the form surface then loses the owner-personal follow-up
    // cue while lead-capture wiring locks remain green.
    const block = contactHtml.match(
      /class="contact-form-card"[^>]*>\s*<h3>\s*([\s\S]*?)\s*<\/h3>\s*<p>\s*([\s\S]*?)\s*<\/p>/
    );
    expect(block).toBeTruthy();
    const heading = decodeBasicEntities(block[1]).replace(/\s+/g, " ").trim();
    const lede = decodeBasicEntities(block[2]).replace(/\s+/g, " ").trim();

    expect(heading).toBe("Request a Free Quote");
    expect(lede).toBe(
      "Fill out the form below and Greg will follow up directly to discuss your project."
    );
  });
});

describe("contact email honesty placeholder", () => {
  test("contact mailto row keeps the Placeholder honesty cue beside info@example.com", () => {
    // mailto href/text parity still passes if the <small> honesty cue is dropped —
    // info@example.com then reads as a finished business address while lead-capture
    // identity contracts remain green (same class as gallery/credentials honesty).
    expect(contactHtml).toMatch(
      /href="mailto:info@example\.com"[\s\S]*?<small>\s*Placeholder\s*—\s*update with real business email\s*<\/small>/
    );
  });
});

describe("lead-form visible label catalog", () => {
  test("every lead control keeps its for= label text (name/phone/email/service/message)", () => {
    // id===name + autocomplete + option-value locks still pass if visible labels
    // drift ("Name", drop Service Interested In, rename message) — AT users and
    // e2e-only label checks then diverge while mailto FormData keys stay green.
    // Service is intentionally included: e2e asserts the other four labels only.
    const formBlock = contactHtml.match(
      /<form\b[^>]*\bdata-contact-form\b[\s\S]*?<\/form>/
    );
    expect(formBlock).toBeTruthy();

    const labelsByFor = Object.fromEntries(
      [...formBlock[0].matchAll(/<label\b[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/label>/g)].map(
        (match) => [
          match[1],
          decodeBasicEntities(match[2].replace(/\s+/g, " ").trim()),
        ]
      )
    );

    expect(labelsByFor).toEqual({
      name: "Full Name",
      phone: "Phone Number",
      email: "Email Address",
      service: "Service Interested In",
      message: "Tell Us About Your Project",
    });
  });

  test("submit control keeps the Send Message CTA label", () => {
    // type=submit + btn-primary/btn-block locks still pass if the visible label
    // softens to "Submit" / "Send" — the primary lead CTA then loses its clear
    // action while geometry and mailto wiring contracts remain green.
    const formBlock = contactHtml.match(
      /<form\b[^>]*\bdata-contact-form\b[\s\S]*?<\/form>/
    );
    expect(formBlock).toBeTruthy();
    const submit = formBlock[0].match(
      /<button\b[^>]*\btype="submit"[^>]*>([\s\S]*?)<\/button>/i
    );
    expect(submit).toBeTruthy();
    expect(decodeBasicEntities(submit[1]).replace(/\s+/g, " ").trim()).toBe(
      "Send Message"
    );
  });
});

describe("footer Florida License honesty placeholder", () => {
  test("footer-bottom keeps the Florida License #: [add license number] honesty cue", () => {
    // Cross-page footer-bottom parity alone still passes if both pages drop the
    // bracketed honesty cue or invent a finished license number — chrome then
    // advertises credentials that are not filled in while copyright parity and
    // trust-strip (add credentials) contracts remain green.
    const expected = "Florida License #: [add license number]";
    for (const html of [indexHtml, contactHtml]) {
      const bottom = extractFooterBottom(html);
      expect(bottom).toBeTruthy();
      const text = decodeBasicEntities(bottom.replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      expect(text).toContain(expected);
    }
  });
});

describe("contact-info-card channel + heading copy", () => {
  test("contact-info-card keeps Contact Information heading and call-or-text cue", () => {
    // Tel/mailto digit parity + hours-row locks still pass if the info card
    // heading softens or the phone row drops "Call or text anytime" — visitors
    // then lose the only explicit text/SMS channel cue beside the number while
    // lead-capture identity contracts remain green.
    const block = contactHtml.match(
      /class="contact-info-card"[^>]*>([\s\S]*?)<div class="contact-hours"/
    );
    expect(block).toBeTruthy();
    const heading = block[1].match(/<h3>\s*([\s\S]*?)\s*<\/h3>/);
    expect(heading).toBeTruthy();
    expect(decodeBasicEntities(heading[1]).replace(/\s+/g, " ").trim()).toBe(
      "Contact Information"
    );
    expect(block[1]).toMatch(
      /href="tel:\+12394402416"[\s\S]*?<small>\s*Call or text anytime\s*<\/small>/
    );
  });
});

describe("lead form-note Prefer to talk invite", () => {
  test("form-note keeps Prefer to talk call-or-text invite beside the phone-link", () => {
    // phone-link tel digit parity + form-note CSS locks still pass if the invite
    // softens to "Contact us" or drops the call-or-text cue — the under-submit
    // fallback then loses its conversion copy while tel href contracts stay green.
    const formBlock = contactHtml.match(
      /<form\b[^>]*\bdata-contact-form\b[\s\S]*?<\/form>/
    );
    expect(formBlock).toBeTruthy();
    const noteBlock = formBlock[0].match(
      /<p\b[^>]*\bclass="[^"]*\bform-note\b[^"]*"[^>]*>([\s\S]*?)<\/p>/
    );
    expect(noteBlock).toBeTruthy();
    const text = decodeBasicEntities(noteBlock[1].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    expect(text).toMatch(/^Prefer to talk it through first\?\s*Call or text\b/);
    expect(text).toMatch(/\bdirectly\.?$/);
  });
});

describe("Netlify honeypot accessible label", () => {
  test("honeypot field keeps the Don't fill this out if you're human label", () => {
    // netlify-honeypot↔name + autocomplete=off/tabindex locks still pass if the
    // human-readable label is dropped or rewritten — AT users then lose the only
    // cue that the field is a spam trap while Netlify attribute contracts stay green.
    const formBlock = contactHtml.match(
      /<form\b[^>]*\bdata-contact-form\b[\s\S]*?<\/form>/
    );
    expect(formBlock).toBeTruthy();
    expect(formBlock[0]).toMatch(
      /Don't fill this out if you're human:\s*<input\b[^>]*\bname="bot-field"/
    );
  });
});

describe("JSON-LD telephone exact NANP string", () => {
  test("JSON-LD telephone stays the exact +1-239-440-2416 shared number", () => {
    // Digit equality + NANP shape alone still pass if schema softens punctuation
    // (+12394402416 / +1 239 440 2416) — rich-result dialers and copy-paste then
    // diverge from the visible tel: href while digit parity stays green.
    const data = JSON.parse(
      indexHtml.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
      )[1]
    );
    expect(data.telephone).toBe("+1-239-440-2416");
  });
});

describe("JSON-LD description + hours/pricing honesty", () => {
  test("JSON-LD description stays the exact Southwest Florida carpentry blurb", () => {
    // Non-empty string checks still pass if description softens into crew-scale
    // marketing or drops the Southwest Florida scope — rich results then overclaim
    // while required-field presence and telephone exactness stay green.
    const data = JSON.parse(
      indexHtml.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
      )[1]
    );
    expect(data.description).toBe(
      "Carpentry and general contracting services throughout Southwest Florida."
    );
  });

  test("JSON-LD omits openingHours and priceRange so schema cannot invent mismatched hours or pricing", () => {
    // Contact Availability hours-row is the human source of truth today. Adding
    // openingHours/priceRange without matching that card invents crawlable claims
    // that diverge from the site while hours-row and address locks stay green.
    const data = JSON.parse(
      indexHtml.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
      )[1]
    );
    expect(data).not.toHaveProperty("openingHours");
    expect(data).not.toHaveProperty("openingHoursSpecification");
    expect(data).not.toHaveProperty("priceRange");
  });
});

describe("contact meta description exact free-quote invite", () => {
  test("contact meta description keeps the Greg free-quote Southwest Florida invite", () => {
    // Business-name/founder containment alone still passes if the contact share
    // blurb drops the free-quote CTA or softens into generic crew copy — SERP/
    // share fallback then loses conversion intent while identity locks stay green.
    const description = decodeBasicEntities(
      contactHtml.match(/name="description"\s+content="([^"]+)"/)[1]
    );
    expect(description).toBe(
      "Get in touch with Greg Felton at [Business Name] for a free quote on carpentry and general contracting work throughout Southwest Florida."
    );
  });
});

describe("lead message placeholder exact guidance", () => {
  test("project message textarea keeps the exact location/timeline placeholder", () => {
    // location/timeline substring cues still pass if the placeholder softens into
    // a vague "Tell us about your project" — lead quality prompts then disappear
    // while required + cue-regex contracts remain green.
    const textarea = contactHtml.match(/<textarea\b[^>]*\bid="message"[^>]*>/);
    expect(textarea).toBeTruthy();
    const placeholder = textarea[0].match(/\bplaceholder="([^"]*)"/);
    expect(placeholder).toBeTruthy();
    expect(placeholder[1]).toBe(
      "Share a few details — location, timeline, and what you have in mind."
    );
  });
});

describe("robots.txt exact crawl body", () => {
  test("robots.txt keeps the exact allow-all crawl policy and single sitemap line", () => {
    // Loose User-agent/Allow/Sitemap regexes still pass if Disallow rules or
    // duplicate Sitemap lines are inserted — crawlers then hit conflicting
    // directives while discovery origin parity stays green.
    expect(robotsTxt.replace(/\r\n/g, "\n").trim()).toBe(
      ["User-agent: *", "Allow: /", "", "Sitemap: https://www.example.com/sitemap.xml"].join(
        "\n"
      )
    );
  });
});
