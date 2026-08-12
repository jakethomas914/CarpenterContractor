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
  test("robots.txt allows crawling and points at sitemap.xml", () => {
    expect(robotsTxt).toMatch(/User-agent:\s*\*/i);
    expect(robotsTxt).toMatch(/Allow:\s*\//i);
    expect(robotsTxt).toMatch(/Sitemap:\s*https:\/\/www\.example\.com\/sitemap\.xml/i);
  });

  test("sitemap.xml lists the homepage and contact page", () => {
    expect(sitemapXml).toContain("https://www.example.com/");
    expect(sitemapXml).toContain("https://www.example.com/contact.html");
  });

  test("canonical URLs on each page match the sitemap locs", () => {
    expect(indexHtml).toMatch(/rel="canonical" href="https:\/\/www\.example\.com\/"/);
    expect(contactHtml).toMatch(
      /rel="canonical" href="https:\/\/www\.example\.com\/contact\.html"/
    );
  });
});

describe("accessibility motion contract (CSS)", () => {
  test("prefers-reduced-motion force-shows [data-reveal] without waiting for JS", () => {
    // Accessibility e2e relies on this so axe measures final contrast.
    expect(stylesCss).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    expect(stylesCss).toMatch(/\[data-reveal\]\s*\{[^}]*opacity:\s*1/s);
  });
});
