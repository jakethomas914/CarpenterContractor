"use strict";

/**
 * Keeps Netlify (_headers) and Vercel (vercel.json) security headers aligned.
 * Drift between hosts would silently weaken framing/CSP protections on one platform.
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "../..");

function parseNetlifyHeaders(raw) {
  const headers = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s+([A-Za-z0-9-]+):\s*(.+)\s*$/);
    if (match) {
      headers[match[1]] = match[2];
    }
  }
  return headers;
}

function parseVercelHeaders(config) {
  const route = (config.headers || []).find((entry) => entry.source === "/(.*)");
  if (!route) {
    return {};
  }
  return Object.fromEntries(route.headers.map((h) => [h.key, h.value]));
}

describe("security headers parity (_headers ↔ vercel.json)", () => {
  const netlify = parseNetlifyHeaders(fs.readFileSync(path.join(root, "_headers"), "utf8"));
  const vercel = parseVercelHeaders(
    JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"))
  );

  const requiredKeys = [
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security",
    "Content-Security-Policy",
  ];

  test.each(requiredKeys)("defines %s on both hosts with the same value", (key) => {
    expect(netlify[key]).toBeDefined();
    expect(vercel[key]).toBeDefined();
    expect(vercel[key]).toBe(netlify[key]);
  });

  test("CSP allows mailto form-action used by the contact form", () => {
    expect(netlify["Content-Security-Policy"]).toMatch(/form-action[^;]*mailto:/);
    expect(vercel["Content-Security-Policy"]).toMatch(/form-action[^;]*mailto:/);
  });

  test("denies framing via X-Frame-Options and CSP frame-ancestors", () => {
    expect(netlify["X-Frame-Options"]).toBe("DENY");
    expect(netlify["Content-Security-Policy"]).toMatch(/frame-ancestors 'none'/);
  });
});
