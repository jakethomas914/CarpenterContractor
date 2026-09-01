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

  test("locks clickjacking/MIME/HSTS/Permissions-Policy to the documented hardened values", () => {
    expect(netlify["X-Content-Type-Options"]).toBe("nosniff");
    expect(netlify["Strict-Transport-Security"]).toBe(
      "max-age=63072000; includeSubDomains; preload"
    );
    expect(netlify["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=(), payment=()"
    );
    expect(vercel["X-Content-Type-Options"]).toBe(netlify["X-Content-Type-Options"]);
    expect(vercel["Strict-Transport-Security"]).toBe(netlify["Strict-Transport-Security"]);
    expect(vercel["Permissions-Policy"]).toBe(netlify["Permissions-Policy"]);
  });

  test("locks Referrer-Policy to strict-origin-when-cross-origin on both hosts", () => {
    // Parity alone can pass if both hosts drift to unsafe-url or no-referrer
    // (breaking analytics/cross-origin attribution or over-sharing full URLs).
    expect(netlify["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(vercel["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("locks CSP frame-ancestors to exact none (not a softer allowlist)", () => {
    // A contains-check for frame-ancestors 'none' still passes if extra hosts
    // are appended. Exact equality keeps clickjacking denial absolute.
    const host = parseCspDirectives(netlify["Content-Security-Policy"]);
    expect(host["frame-ancestors"]).toBe("'none'");
    expect(parseCspDirectives(vercel["Content-Security-Policy"])["frame-ancestors"]).toBe(
      "'none'"
    );
  });

  test("locks CSP default-src/object-src/base-uri/connect-src/img-src deny-self defaults", () => {
    // Parity alone can pass while both hosts grow more permissive. These
    // directives gate plugins, <base> hijacks, third-party XHR, and remote images.
    const host = parseCspDirectives(netlify["Content-Security-Policy"]);
    expect(host["default-src"]).toBe("'self'");
    expect(host["object-src"]).toBe("'none'");
    expect(host["base-uri"]).toBe("'self'");
    expect(host["connect-src"]).toBe("'self'");
    expect(host["img-src"]).toBe("'self' data:");
  });

  test("locks CSP form-action to self + mailto (Netlify POST and lead mailto)", () => {
    // mailto:-only checks pass if 'self' is dropped, which breaks Netlify Forms
    // POST while the JS mailto path still appears healthy in unit tests.
    const host = parseCspDirectives(netlify["Content-Security-Policy"]);
    expect(host["form-action"]).toBe("'self' mailto:");
    expect(parseCspDirectives(vercel["Content-Security-Policy"])["form-action"]).toBe(
      "'self' mailto:"
    );
  });

  test("locks host script-src to self + unsafe-inline (JSON-LD on homepage)", () => {
    // Dropping 'unsafe-inline' blocks the homepage JSON-LD <script> under CSP.
    // Expanding to https: would allow third-party script hosts the README forbids.
    const host = parseCspDirectives(netlify["Content-Security-Policy"]);
    expect(host["script-src"]).toBe("'self' 'unsafe-inline'");
    expect(host["script-src"]).not.toMatch(/https?:/);
  });

  test("locks CSP style-src/font-src to self + Google Fonts only", () => {
    // Contains-only checks pass if https: or * is appended. Exact allowlists keep
    // stylesheet/font loading on the documented hosts and block silent CDN sprawl.
    const host = parseCspDirectives(netlify["Content-Security-Policy"]);
    expect(host["style-src"]).toBe("'self' https://fonts.googleapis.com");
    expect(host["font-src"]).toBe("'self' https://fonts.gstatic.com");
    expect(parseCspDirectives(vercel["Content-Security-Policy"])["style-src"]).toBe(
      host["style-src"]
    );
    expect(parseCspDirectives(vercel["Content-Security-Policy"])["font-src"]).toBe(
      host["font-src"]
    );
  });

  test("security headers apply site-wide on both hosts", () => {
    // Narrowing /* or /(.*) to a single path silently drops framing/CSP/HSTS on
    // contact.html and static assets while unit parity on the shared key set still passes.
    const netlifyRaw = fs.readFileSync(path.join(root, "_headers"), "utf8");
    expect(netlifyRaw).toMatch(/^\/\*\s*$/m);
    const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
    const sources = (vercelConfig.headers || []).map((entry) => entry.source);
    expect(sources).toContain("/(.*)");
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
    expect(contact["form-action"]).toBe("'self' mailto:");
    expect(contact["script-src"]).toBe("'self'");
    expect(contact["script-src"]).not.toMatch(/https?:/);
    expect(contact["script-src"]).not.toMatch(/'unsafe-inline'/);
  });

  test("contact meta CSP matches host allowlists for non-script fetch directives", () => {
    // script-src may differ (no 'unsafe-inline' on contact). Everything else that
    // gates fonts/images/XHR must stay aligned or contact page loads break.
    const contact = parseCspDirectives(contactCsp);
    const host = parseCspDirectives(hostCsp);

    for (const directive of ["style-src", "font-src", "img-src", "connect-src"]) {
      expect(contact[directive]).toBe(host[directive]);
    }
  });

  test("all CSP copies share font and style Google Fonts allowlists", () => {
    for (const csp of [hostCsp, indexCsp, contactCsp]) {
      const directives = parseCspDirectives(csp);
      expect(directives["style-src"]).toContain("https://fonts.googleapis.com");
      expect(directives["font-src"]).toContain("https://fonts.gstatic.com");
    }
  });
});
