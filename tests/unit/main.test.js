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

    test("falls back to a generic subject when no name is supplied", () => {
      const url = main.buildMailtoUrl("info@example.com", {});
      expect(url).toContain(encodeURIComponent("New project inquiry from website visitor"));
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

    test("does not throw and returns a string when fields is undefined", () => {
      expect(() => main.buildMailtoUrl("info@example.com", undefined)).not.toThrow();
      expect(typeof main.buildMailtoUrl("info@example.com", undefined)).toBe("string");
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
