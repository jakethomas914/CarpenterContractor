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
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
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
  });

  test("both pages expose a skip link to #main-content", () => {
    for (const html of [indexHtml, contactHtml]) {
      expect(html).toMatch(/class="skip-link"[^>]*href="#main-content"/);
      expect(html).toMatch(/id="main-content"/);
    }
  });
});
