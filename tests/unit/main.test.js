"use strict";

describe("js/main.js pure helper functions", () => {
  let main;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = "";
    main = require("../../js/main.js");
  });

  describe("sanitizeForHeader", () => {
    test("trims surrounding whitespace", () => {
      expect(main.sanitizeForHeader("  John Smith  ")).toBe("John Smith");
    });

    test("strips embedded carriage returns and line feeds", () => {
      expect(main.sanitizeForHeader("John\r\nBcc: attacker@example.com")).toBe(
        "John Bcc: attacker@example.com"
      );
    });

    test("collapses multiple consecutive newlines to a single space", () => {
      expect(main.sanitizeForHeader("a\n\n\nb")).toBe("a b");
    });

    test("returns an empty string for null/undefined", () => {
      expect(main.sanitizeForHeader(null)).toBe("");
      expect(main.sanitizeForHeader(undefined)).toBe("");
    });

    test("coerces non-string values to strings", () => {
      expect(main.sanitizeForHeader(42)).toBe("42");
    });

    test("returns an empty string for an empty string input", () => {
      expect(main.sanitizeForHeader("")).toBe("");
      expect(main.sanitizeForHeader("   ")).toBe("");
    });

    test("strips a lone carriage return the same way as CRLF pairs", () => {
      // CR-only payloads still inject header breaks in some clients; treating
      // only \\r\\n / \\n would leave a raw CR in the mailto subject/recipient.
      expect(main.sanitizeForHeader("Pat\rBcc:victim@example.com")).toBe(
        "Pat Bcc:victim@example.com"
      );
    });

    test("coerces boolean false to the string false (not empty)", () => {
      // FormData can surface unexpected types in tests/fixtures; false must not
      // collapse to "" the way null/undefined do, or triage labels silently blank.
      expect(main.sanitizeForHeader(false)).toBe("false");
    });

    test("preserves mid-string tabs while still stripping CR/LF header breaks", () => {
      // Only CR/LF are header-injection vectors. Collapsing tabs (or all
      // whitespace) would mangle pasted phone/name values while CRLF locks
      // still pass — keep tabs as literal characters in sanitized headers.
      expect(main.sanitizeForHeader("Jane\tDoe")).toBe("Jane\tDoe");
      expect(main.sanitizeForHeader("Pat\t\r\nBcc:x@y.z")).toBe("Pat\t Bcc:x@y.z");
    });

    test("coerces boolean true and numeric zero to strings (not empty)", () => {
      // Mirror of the false coerce lock: true/0 must stringify rather than
      // collapsing like null/undefined, or triage labels silently blank when
      // unexpected FormData-like types surface in fixtures.
      expect(main.sanitizeForHeader(true)).toBe("true");
      expect(main.sanitizeForHeader(0)).toBe("0");
    });

    test("coerces arrays and plain objects via String() without throwing", () => {
      // Unexpected non-primitives (fixture bugs, future FormData wrappers) must
      // still produce stable triage strings — throwing here aborts mailto submit.
      expect(main.sanitizeForHeader([])).toBe("");
      expect(main.sanitizeForHeader(["Pat", "Lee"])).toBe("Pat,Lee");
      expect(main.sanitizeForHeader({ name: "Pat" })).toBe("[object Object]");
    });
  });

  describe("buildMailtoUrl", () => {
    test("builds a well-formed mailto URL from complete fields", () => {
      const url = main.buildMailtoUrl("info@example.com", {
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "239-555-0100",
        service: "Kitchen & Bath Remodel",
        message: "Please call me back.",
      });

      expect(url.startsWith("mailto:info@example.com?subject=")).toBe(true);
      expect(url).toContain(encodeURIComponent("New project inquiry from Jane Doe"));
      expect(url).toContain("body=");

      const decodedBody = decodeURIComponent(url.split("body=")[1]);
      expect(decodedBody).toContain("Name: Jane Doe");
      expect(decodedBody).toContain("Email: jane@example.com");
      expect(decodedBody).toContain("Phone: 239-555-0100");
      expect(decodedBody).toContain("Service interested in: Kitchen & Bath Remodel");
      expect(decodedBody).toContain("Please call me back.");
    });

    test("keeps stable mailto body triage labels in a fixed field order", () => {
      // Inbox triage depends on these exact prefixes. Renaming/reordering them
      // breaks filters and human scanning even when FormData keys stay correct.
      const url = main.buildMailtoUrl("info@example.com", {
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "239-555-0100",
        service: "Decks",
        message: "Ready to start.",
      });
      const decodedBody = decodeURIComponent(url.split("body=")[1]);
      expect(decodedBody).toBe(
        [
          "Name: Jane Doe",
          "Email: jane@example.com",
          "Phone: 239-555-0100",
          "Service interested in: Decks",
          "",
          "Ready to start.",
        ].join("\n")
      );
    });

    test("falls back to a generic subject when no name is supplied", () => {
      const url = main.buildMailtoUrl("info@example.com", {});
      expect(url).toContain(encodeURIComponent("New project inquiry from website visitor"));
    });

    test("falls back to the generic subject when name is whitespace-only after sanitize", () => {
      // Trimmed-empty names must not produce "from " with a blank suffix — inbox
      // filters key off the stable "website visitor" fallback token.
      const url = main.buildMailtoUrl("info@example.com", { name: "   \t  " });
      expect(url).toContain(encodeURIComponent("New project inquiry from website visitor"));
      expect(url).not.toContain(encodeURIComponent("New project inquiry from  "));
    });

    test("locks the inquiry subject prefix used for inbox filters", () => {
      // Mail clients and owner-side filters key off this exact prefix. Rewording
      // it (e.g. "Quote request from") silently breaks triage rules even when
      // the mailto body labels stay correct.
      const withName = main.buildMailtoUrl("info@example.com", { name: "Pat" });
      const withoutName = main.buildMailtoUrl("info@example.com", {});
      expect(withName).toContain(encodeURIComponent("New project inquiry from Pat"));
      expect(withoutName).toContain(
        encodeURIComponent("New project inquiry from website visitor")
      );
      expect(withName).toMatch(/subject=[^&]*New%20project%20inquiry%20from/);
    });

    test("sanitizes header-relevant fields to prevent mailto header injection", () => {
      const url = main.buildMailtoUrl("info@example.com", {
        name: "Evil\r\nBcc:victim@example.com",
        email: "attacker@example.com",
        message: "hello",
      });

      // The raw CRLF sequence must never appear un-encoded or encoded in the
      // resulting URL — sanitizeForHeader should have already stripped it.
      expect(url.toLowerCase()).not.toContain("%0d%0a");
      expect(url.toLowerCase()).not.toContain("bcc:victim");
    });

    test("sanitizes the recipient address against CRLF header injection", () => {
      const url = main.buildMailtoUrl("info@example.com\r\nBcc:victim@example.com", {
        name: "Jane",
        message: "hi",
      });

      expect(url.startsWith("mailto:info@example.com Bcc:victim@example.com?")).toBe(true);
      expect(url.toLowerCase()).not.toContain("%0d%0a");
    });

    test("sanitizes phone and service fields used in the mailto body labels", () => {
      const url = main.buildMailtoUrl("info@example.com", {
        phone: "239-555-0100\r\nCc:spam@example.com",
        service: "Remodel\nBcc:other@example.com",
        message: "hello",
      });

      const decodedBody = decodeURIComponent(url.split("body=")[1]);
      expect(decodedBody).toContain("Phone: 239-555-0100 Cc:spam@example.com");
      expect(decodedBody).toContain("Service interested in: Remodel Bcc:other@example.com");
      expect(url.toLowerCase()).not.toContain("%0d%0a");
    });

    test("sanitizes email field against CRLF header injection in the mailto body", () => {
      // Name/phone/service/recipient are locked; email is equally header-shaped
      // once it lands in the body. Skipping it lets CRLF rewrite Cc/Bcc lines.
      const url = main.buildMailtoUrl("info@example.com", {
        email: "ok@example.com\r\nBcc:victim@example.com",
        message: "hi",
      });

      const decodedBody = decodeURIComponent(url.split("body=")[1]);
      expect(decodedBody).toContain("Email: ok@example.com Bcc:victim@example.com");
      expect(url.toLowerCase()).not.toContain("%0d%0a");
    });

    test("preserves intentional newlines in the free-form message body", () => {
      // Message is only trimmed, not run through sanitizeForHeader, so
      // visitors can still write multi-line project details.
      const url = main.buildMailtoUrl("info@example.com", {
        name: "Jane",
        message: "Line one\nLine two\r\nLine three",
      });

      const decodedBody = decodeURIComponent(url.split("body=")[1]);
      expect(decodedBody).toContain("Line one\nLine two\r\nLine three");
    });

    test("handles an empty recipient without throwing", () => {
      const url = main.buildMailtoUrl("", { name: "Jane", message: "hi" });
      expect(url.startsWith("mailto:?subject=")).toBe(true);
    });

    test("sanitizes whitespace-only recipient to empty so mailto has no forged address", () => {
      // Empty-string recipient is already locked. Whitespace / CR/LF-only values
      // must sanitize the same way — otherwise a blank-looking address can still
      // leave control characters in the mailto authority before ?.
      const url = main.buildMailtoUrl("  \r\n\t  ", { name: "Jane", message: "hi" });
      expect(url.startsWith("mailto:?subject=")).toBe(true);
      expect(url).not.toMatch(/^mailto:\s/);
      expect(url).not.toMatch(/[\r\n]/);
    });

    test("mailto query keys stay exactly subject and body (no silent cc/bcc)", () => {
      // Encoding locks still pass if triage "helpers" append cc=/bcc=/reply-to=
      // params that quietly fan out lead mail or rewrite the compose target.
      const url = main.buildMailtoUrl("info@example.com", {
        name: "Jane",
        email: "jane@example.com",
        message: "Need a quote",
      });
      const query = url.slice(url.indexOf("?") + 1);
      const keys = query.split("&").map((part) => part.split("=")[0]).sort();
      expect(keys).toEqual(["body", "subject"]);
    });

    test("does not throw and returns a string when fields is undefined", () => {
      expect(() => main.buildMailtoUrl("info@example.com", undefined)).not.toThrow();
      expect(typeof main.buildMailtoUrl("info@example.com", undefined)).toBe("string");
    });

    test("does not throw when fields is null (same empty-field fallback as undefined)", () => {
      // Callers/tests may pass null; fields && field short-circuit must still
      // yield a mailto URL instead of throwing on property access.
      expect(() => main.buildMailtoUrl("info@example.com", null)).not.toThrow();
      const url = main.buildMailtoUrl("info@example.com", null);
      expect(url).toContain(encodeURIComponent("New project inquiry from website visitor"));
      const decodedBody = decodeURIComponent(url.split("body=")[1]);
      expect(decodedBody).toBe(
        ["Name: ", "Email: ", "Phone: ", "Service interested in: ", "", ""].join("\n")
      );
    });

    test("trims whitespace-only message to empty while keeping triage label block", () => {
      // Message is trim-only (not sanitizeForHeader). Whitespace-only payloads
      // must collapse to an empty body section — not a blank-looking "   " line
      // that looks like lost project details in the owner's inbox.
      const url = main.buildMailtoUrl("info@example.com", {
        name: "Jane",
        message: "  \t  \n  ",
      });
      const decodedBody = decodeURIComponent(url.split("body=")[1]);
      expect(decodedBody).toBe(
        ["Name: Jane", "Email: ", "Phone: ", "Service interested in: ", "", ""].join("\n")
      );
    });

    test("percent-encodes ampersands in subject/body so mailto query parsing stays intact", () => {
      // Service option values intentionally contain "&" (e.g. Kitchen & Bath).
      // An unencoded "&" would truncate the mailto query string in many clients.
      const url = main.buildMailtoUrl("info@example.com", {
        name: "Jane & Co",
        service: "Kitchen & Bath Remodels",
        message: "Cabinets & trim",
      });

      expect(url).toContain(encodeURIComponent("Jane & Co"));
      expect(url).toContain(encodeURIComponent("Kitchen & Bath Remodels"));
      expect(url).toContain(encodeURIComponent("Cabinets & trim"));
      const query = url.slice(url.indexOf("?") + 1);
      expect(query.includes("Jane & Co")).toBe(false);
      expect(query.includes("Kitchen & Bath")).toBe(false);
    });

    test("percent-encodes ?, #, and = in fields so they cannot rewrite the mailto URL", () => {
      // Unencoded reserved characters in subject/body can truncate or retarget the
      // mailto URI (new query params, fragment, or key/value splits).
      const url = main.buildMailtoUrl("info@example.com", {
        name: "Pat? #1",
        email: "pat=test@example.com",
        phone: "239#440",
        service: "Repairs?=urgent",
        message: "Need a quote? Call #2 after 5=pm",
      });

      const query = url.slice(url.indexOf("?") + 1);
      for (const raw of ["Pat? #1", "Repairs?=urgent", "Need a quote? Call #2 after 5=pm"]) {
        expect(url).toContain(encodeURIComponent(raw));
        expect(query.includes(raw)).toBe(false);
      }
      expect(query.match(/subject=/g)).toHaveLength(1);
      expect(query.match(/body=/g)).toHaveLength(1);
      expect(query.includes("#")).toBe(false);
    });
  });

  describe("getYear", () => {
    test("returns the four-digit year of the supplied date", () => {
      expect(main.getYear(new Date("2030-06-15T00:00:00Z"))).toBe("2030");
    });

    test("defaults to the current year when no date is supplied", () => {
      expect(main.getYear()).toBe(String(new Date().getFullYear()));
    });
  });

  describe("navigation seam", () => {
    test("exposes an overridable redirect function for form submit tests", () => {
      // The real window.location.href assignment cannot be asserted in jsdom
      // (location is non-configurable). Integration tests spy on this seam
      // instead — keep the export shape stable.
      expect(typeof main.navigation.redirect).toBe("function");
      const original = main.navigation.redirect;
      const spy = jest.fn();
      main.navigation.redirect = spy;
      main.navigation.redirect("mailto:info@example.com");
      expect(spy).toHaveBeenCalledWith("mailto:info@example.com");
      main.navigation.redirect = original;
    });
  });
});
