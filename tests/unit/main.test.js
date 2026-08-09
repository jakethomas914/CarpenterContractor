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
});
