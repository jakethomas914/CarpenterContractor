"use strict";

/**
 * Keeps Netlify (_headers) and Vercel (vercel.json) security headers aligned,
 * and keeps HTML <meta> CSP copies from drifting (README: update all four together).
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

function extractMetaCsp(html) {
  // Content uses double quotes; single quotes appear inside the policy values.
  const match = html.match(
    /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content="([^"]+)"/i
  );
  return match ? match[1] : null;
}

/** Parse a CSP string into a directive → value map (trailing semicolon optional). */
function parseCspDirectives(csp) {
  const directives = {};
  for (const part of csp.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const space = trimmed.indexOf(" ");
    if (space === -1) {
      directives[trimmed] = "";
    } else {
      directives[trimmed.slice(0, space)] = trimmed.slice(space + 1).trim();
    }
  }
  return directives;
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

describe("CSP four-way sync (HTML meta ↔ host headers)", () => {
  const netlify = parseNetlifyHeaders(fs.readFileSync(path.join(root, "_headers"), "utf8"));
  const hostCsp = netlify["Content-Security-Policy"];
  const indexCsp = extractMetaCsp(fs.readFileSync(path.join(root, "index.html"), "utf8"));
  const contactCsp = extractMetaCsp(fs.readFileSync(path.join(root, "contact.html"), "utf8"));

  test("both HTML pages declare a Content-Security-Policy meta tag", () => {
    expect(indexCsp).toBeTruthy();
    expect(contactCsp).toBeTruthy();
  });

  test("index meta CSP matches host CSP except frame-ancestors (meta-incompatible)", () => {
    const host = parseCspDirectives(hostCsp);
    const index = parseCspDirectives(indexCsp);

    expect(index["frame-ancestors"]).toBeUndefined();
    expect(host["frame-ancestors"]).toBe("'none'");

    const hostWithoutFrame = { ...host };
    delete hostWithoutFrame["frame-ancestors"];
    expect(index).toEqual(hostWithoutFrame);
  });

  test("contact meta CSP keeps the hard security allowlists and mailto form-action", () => {
    const contact = parseCspDirectives(contactCsp);
    const host = parseCspDirectives(hostCsp);

    // Contact may omit 'unsafe-inline' (no JSON-LD / inline scripts), but must
    // not be more permissive than the host policy for shared directives.
    expect(contact["default-src"]).toBe(host["default-src"]);
    expect(contact["object-src"]).toBe(host["object-src"]);
    expect(contact["base-uri"]).toBe(host["base-uri"]);
    expect(contact["form-action"]).toBe(host["form-action"]);
    expect(contact["form-action"]).toMatch(/mailto:/);
    expect(contact["script-src"]).toMatch(/'self'/);
    expect(contact["script-src"]).not.toMatch(/https?:/);
  });

  test("all CSP copies share font and style Google Fonts allowlists", () => {
    for (const csp of [hostCsp, indexCsp, contactCsp]) {
      const directives = parseCspDirectives(csp);
      expect(directives["style-src"]).toContain("https://fonts.googleapis.com");
      expect(directives["font-src"]).toContain("https://fonts.gstatic.com");
    }
  });
});
