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

    test("preserves Unicode line separators (only CR/LF are stripped)", () => {
      // Defense-in-depth today targets RFC822-style CR/LF header breaks only.
      // Collapsing U+2028 / U+2029 (or treating them like \\n) would silently
      // rewrite pasted international names while CR/LF locks stay green — lock
      // the current CR/LF-only policy so broadening it is an intentional change.
      const lineSeparator = "\u2028";
      const paragraphSeparator = "\u2029";
      expect(main.sanitizeForHeader(`Pat${lineSeparator}Lee`)).toBe(
        `Pat${lineSeparator}Lee`
      );
      expect(main.sanitizeForHeader(`Pat${paragraphSeparator}Lee`)).toBe(
        `Pat${paragraphSeparator}Lee`
      );
      expect(main.sanitizeForHeader(`Pat\r${lineSeparator}\nLee`)).toBe(
        `Pat ${lineSeparator} Lee`
      );
    });

    test("preserves zero-width space (CR/LF-only policy does not collapse ZWSP)", () => {
      // Same CR/LF-only class as U+2028/U+2029. Silent ZWSP collapsing would
      // rewrite pasted names while CRLF / LS / PS locks stay green.
      const zwsp = "\u200b";
      expect(main.sanitizeForHeader(`Pat${zwsp}Lee`)).toBe(`Pat${zwsp}Lee`);
      expect(main.sanitizeForHeader(`Pat\r${zwsp}\nLee`)).toBe(`Pat ${zwsp} Lee`);
    });

    test("preserves non-breaking space (CR/LF-only policy does not collapse NBSP)", () => {
      // Pasted phone/name values often carry U+00A0 from rich text. Collapsing
      // NBSP into a regular space (or stripping it) would rewrite triage labels
      // while CR/LF / ZWSP / tab locks stay green — lock the current policy.
      const nbsp = "\u00a0";
      expect(main.sanitizeForHeader(`Pat${nbsp}Lee`)).toBe(`Pat${nbsp}Lee`);
      expect(main.sanitizeForHeader(`Pat\r${nbsp}\nLee`)).toBe(`Pat ${nbsp} Lee`);
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

    test("preserves a lone CR in the message body (unlike sanitizeForHeader)", () => {
      // Header fields strip lone CR as an injection break. Message must keep
      // that CR so Windows-style / odd-paste project details are not silently
      // flattened into a single line while multi-line \\n locks still pass.
      const url = main.buildMailtoUrl("info@example.com", {
        name: "Jane",
        message: "Line one\rLine two",
      });
      const decodedBody = decodeURIComponent(url.split("body=")[1]);
      expect(decodedBody).toContain("Line one\rLine two");
      expect(main.sanitizeForHeader("Line one\rLine two")).toBe("Line one Line two");
    });

    test("keeps a literal @ in the mailto recipient (does not percent-encode authority)", () => {
      // Subject/body encoding locks still pass if the recipient is encoded to
      // info%40example.com — some mobile mail clients then fail to resolve the
      // compose target while triage body contracts stay green.
      const url = main.buildMailtoUrl("info@example.com", {
        name: "Jane",
        message: "Need a quote",
      });
      expect(url.startsWith("mailto:info@example.com?")).toBe(true);
      expect(url).not.toContain("info%40example.com");
      expect(url).not.toContain(encodeURIComponent("info@example.com"));
    });

    test("does not percent-encode ?, #, or & in the mailto recipient authority", () => {
      // Subject/body already encode reserved chars. The recipient is concatenated
      // raw after CR/LF sanitize only — a poisoned launch paste can rewrite or
      // drop the compose query while @ / CRLF locks stay green. Lock the current
      // seam so encoding or stripping these becomes an intentional change; HTML
      // data-recipient shape forbids them on the live form.
      expect(
        main.buildMailtoUrl("info@example.com?cc=evil@x.com", { name: "Pat" })
      ).toMatch(/^mailto:info@example\.com\?cc=evil@x\.com\?subject=/);
      expect(
        main.buildMailtoUrl("info@example.com#frag", { name: "Pat" })
      ).toMatch(/^mailto:info@example\.com#frag\?subject=/);
      expect(
        main.buildMailtoUrl("info@example.com&cc=evil@x.com", { name: "Pat" })
      ).toMatch(/^mailto:info@example\.com&cc=evil@x\.com\?subject=/);
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

    test("trims surrounding whitespace on a real recipient before the mailto authority", () => {
      // Whitespace-only recipients already collapse to empty. A padded but valid
      // address must still land as a clean mailto:user@host — otherwise some
      // clients treat the leading space as part of the authority and bounce.
      const url = main.buildMailtoUrl("  info@example.com  ", {
        name: "Jane",
        message: "hi",
      });
      expect(url.startsWith("mailto:info@example.com?")).toBe(true);
      expect(url).not.toMatch(/^mailto:\s/);
    });

    test("empty-string fields match missing-field triage body (no undefined leaks)", () => {
      // FormData can yield "" for cleared inputs. Empty strings must sanitize the
      // same as omitted keys — "undefined" / "null" text in the owner's inbox is
      // a lead-quality regression even when required HTML5 checks stay green.
      const fromEmptyStrings = main.buildMailtoUrl("info@example.com", {
        name: "",
        email: "",
        phone: "",
        service: "",
        message: "",
      });
      const fromMissing = main.buildMailtoUrl("info@example.com", {});
      expect(fromEmptyStrings).toBe(fromMissing);
      const decodedBody = decodeURIComponent(fromEmptyStrings.split("body=")[1]);
      expect(decodedBody).toBe(
        ["Name: ", "Email: ", "Phone: ", "Service interested in: ", "", ""].join("\n")
      );
      expect(decodedBody).not.toMatch(/undefined|null/i);
    });

    test("null field properties match empty/missing triage body (no 'null' leaks)", () => {
      // Integration covers missing FormData keys → null from .get. Explicit null
      // properties must still coerce via sanitizeForHeader / message || "" — a
      // regression that String(null) into triage labels would not fail empty-string
      // or fields===null locks.
      const fromNullProps = main.buildMailtoUrl("info@example.com", {
        name: null,
        email: null,
        phone: null,
        service: null,
        message: null,
      });
      const fromMissing = main.buildMailtoUrl("info@example.com", {});
      expect(fromNullProps).toBe(fromMissing);
      expect(fromNullProps).toContain(
        encodeURIComponent("New project inquiry from website visitor")
      );
      const decodedBody = decodeURIComponent(fromNullProps.split("body=")[1]);
      expect(decodedBody).not.toMatch(/null/i);
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

    test("coerces non-object fields (string/number/boolean) without throwing", () => {
      // null/undefined fields are locked. Primitive mistaken callers must not
      // throw — fields && field short-circuit + String/sanitizeForHeader coerce
      // quirks stay documented so a refactor cannot introduce crashes while the
      // null/undefined locks stay green.
      expect(() => main.buildMailtoUrl("info@example.com", "oops")).not.toThrow();
      expect(() => main.buildMailtoUrl("info@example.com", true)).not.toThrow();
      expect(() => main.buildMailtoUrl("info@example.com", 0)).not.toThrow();
      expect(() => main.buildMailtoUrl("info@example.com", false)).not.toThrow();

      const fromString = main.buildMailtoUrl("info@example.com", "oops");
      const fromTrue = main.buildMailtoUrl("info@example.com", true);
      const fromMissing = main.buildMailtoUrl("info@example.com", {});
      expect(fromString).toBe(fromMissing);
      expect(fromTrue).toBe(fromMissing);

      // 0/false are falsy but still passed into sanitizeForHeader via the
      // short-circuit value itself — lock that coerce rather than inventing a
      // cleaner empty-body fallback that production does not implement.
      const fromZero = main.buildMailtoUrl("info@example.com", 0);
      expect(fromZero).toContain(encodeURIComponent("New project inquiry from 0"));
      expect(decodeURIComponent(fromZero.split("body=")[1])).toBe(
        ["Name: 0", "Email: 0", "Phone: 0", "Service interested in: 0", "", ""].join(
          "\n"
        )
      );

      const fromFalse = main.buildMailtoUrl("info@example.com", false);
      expect(fromFalse).toContain(
        encodeURIComponent("New project inquiry from false")
      );
      expect(decodeURIComponent(fromFalse.split("body=")[1])).toBe(
        [
          "Name: false",
          "Email: false",
          "Phone: false",
          "Service interested in: false",
          "",
          "",
        ].join("\n")
      );
    });

    test("treats array fields like an empty object (no indexed name/email leaks)", () => {
      // Arrays are objects, so fields && fields.name is undefined — lock that
      // empty-triage behavior so a mistaken FormData-like array caller cannot
      // start reading indexed values or throw while string/boolean coerce locks
      // stay green.
      expect(() => main.buildMailtoUrl("info@example.com", [])).not.toThrow();
      expect(() =>
        main.buildMailtoUrl("info@example.com", ["Pat", "pat@example.com"])
      ).not.toThrow();

      const fromEmptyArray = main.buildMailtoUrl("info@example.com", []);
      const fromPopulatedArray = main.buildMailtoUrl("info@example.com", [
        "Pat",
        "pat@example.com",
      ]);
      const fromMissing = main.buildMailtoUrl("info@example.com", {});

      expect(fromEmptyArray).toBe(fromMissing);
      expect(fromPopulatedArray).toBe(fromMissing);
      expect(fromPopulatedArray).not.toContain(encodeURIComponent("Pat"));
      expect(fromPopulatedArray).not.toContain(
        encodeURIComponent("pat@example.com")
      );
    });
  });

  describe("getYear", () => {
    test("returns the four-digit year of the supplied date", () => {
      expect(main.getYear(new Date("2030-06-15T00:00:00Z"))).toBe("2030");
    });

    test("defaults to the current year when no date is supplied", () => {
      expect(main.getYear()).toBe(String(new Date().getFullYear()));
    });

    test("returns NaN for an invalid Date (no silent epoch-year fallback)", () => {
      // Callers that pass a failed Date parse must surface NaN rather than
      // quietly printing 1970 (or another invented year) in the footer while
      // the happy-path getYear locks stay green.
      expect(main.getYear(new Date("not-a-date"))).toBe("NaN");
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
