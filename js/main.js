/**
 * Felton Carpentry & Construction — Site Scripts
 *
 * Vanilla JS only, no dependencies, no build step. This file is loaded
 * directly via a <script> tag in the browser. It also exposes its pure,
 * side-effect-free helper functions via `module.exports` when run under
 * Node/Jest (the `typeof module` check below is a no-op in the browser),
 * so those functions can be unit tested without a bundler.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Pure helper functions (unit tested — see tests/unit/main.test.js)
   * ------------------------------------------------------------------ */

  /**
   * Removes characters that could be used to inject extra headers into a
   * "mailto:" link (CR/LF) and trims whitespace. This is defense-in-depth:
   * the browser's own mailto handling is generally safe, but sanitizing
   * user-entered values before they end up in a URI is good practice.
   * @param {unknown} value
   * @returns {string}
   */
  function sanitizeForHeader(value) {
    return String(value == null ? "" : value)
      .replace(/[\r\n]+/g, " ")
      .trim();
  }

  /**
   * Builds a "mailto:" URL from contact form field values. Pure function —
   * takes plain data in, returns a string, no DOM access.
   * @param {string} recipient
   * @param {{name?: string, email?: string, phone?: string, service?: string, message?: string}} fields
   * @returns {string}
   */
  function buildMailtoUrl(recipient, fields) {
    var safeRecipient = sanitizeForHeader(recipient);
    var name = sanitizeForHeader(fields && fields.name);
    var email = sanitizeForHeader(fields && fields.email);
    var phone = sanitizeForHeader(fields && fields.phone);
    var service = sanitizeForHeader(fields && fields.service);
    var message = String((fields && fields.message) || "").trim();

    var subject = encodeURIComponent("New project inquiry from " + (name || "website visitor"));
    var bodyLines = [
      "Name: " + name,
      "Email: " + email,
      "Phone: " + phone,
      "Service interested in: " + service,
      "",
      message,
    ];
    var body = encodeURIComponent(bodyLines.join("\n"));

    return "mailto:" + safeRecipient + "?subject=" + subject + "&body=" + body;
  }

  /**
   * Returns the four-digit year for a given Date (defaults to now).
   * @param {Date} [date]
   * @returns {string}
   */
  function getYear(date) {
    return String((date || new Date()).getFullYear());
  }

  /**
   * Thin, overridable seam around browser navigation. Kept as a mutable
   * object (rather than calling `window.location.href = url` inline)
   * purely so tests can substitute `navigation.redirect` with a spy —
   * jsdom does not implement real navigation, so asserting against
   * `window.location.href` directly isn't possible in tests.
   */
  var navigation = {
    redirect: function (url) {
      window.location.href = url;
    },
  };

  /* ------------------------------------------------------------------ *
   * DOM wiring (integration tested with jsdom — see tests/integration)
   * ------------------------------------------------------------------ */

  function initMobileNav() {
    var navToggle = document.querySelector(".nav-toggle");
    var primaryNav = document.querySelector(".primary-nav");

    if (!navToggle || !primaryNav) {
      return;
    }

    navToggle.addEventListener("click", function () {
      var isOpen = primaryNav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    primaryNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        primaryNav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function initFooterYear() {
    var yearEl = document.querySelector("[data-current-year]");
    if (yearEl) {
      yearEl.textContent = getYear();
    }
  }

  function initScrollReveal() {
    var revealEls = document.querySelectorAll("[data-reveal]");
    if (!revealEls.length) {
      return;
    }

    // Opt into hide-until-revealed CSS only when this script is actually
    // running. If main.js never loads, [data-reveal] stays visible (see
    // css/styles.css) so contact/lead UI cannot disappear permanently.
    document.documentElement.classList.add("js-reveal");

    if (!("IntersectionObserver" in window)) {
      revealEls.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );

    revealEls.forEach(function (el) {
      observer.observe(el);
    });
  }

  /**
   * Contact form handling.
   *
   * There is no backend on this static site. By default, submitting the
   * form builds a "mailto:" link from the entered fields and opens the
   * visitor's email client — this works on any host with zero setup.
   *
   * The form markup also includes Netlify Forms attributes
   * (`data-netlify="true"` + a hidden `form-name` field + honeypot field).
   * If you deploy this site on Netlify and would rather have submissions
   * collected automatically in your Netlify dashboard instead of opening
   * an email client, delete the call to `initContactForm()` below —
   * Netlify will then handle the real form POST for you. See README.md.
   */
  function initContactForm() {
    var contactForm = document.querySelector("[data-contact-form]");
    if (!contactForm) {
      return;
    }

    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();

      var formData = new FormData(contactForm);
      var recipient = contactForm.getAttribute("data-recipient") || "";
      var mailtoUrl = buildMailtoUrl(recipient, {
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        service: formData.get("service"),
        message: formData.get("message"),
      });

      navigation.redirect(mailtoUrl);

      var statusEl = contactForm.querySelector("[data-form-status]");
      if (statusEl) {
        statusEl.textContent = "Opening your email app to send this message…";
        statusEl.classList.add("is-visible");
      }
    });
  }

  function initActiveNavHighlight() {
    var sections = document.querySelectorAll("main section[id]");
    var navLinks = document.querySelectorAll(".nav-links a[href^='#']");

    if (!sections.length || !navLinks.length || !("IntersectionObserver" in window)) {
      return;
    }

    var sectionObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var id = entry.target.getAttribute("id");
          var matchingLink = document.querySelector('.nav-links a[href="#' + id + '"]');
          if (!matchingLink) {
            return;
          }

          if (entry.isIntersecting) {
            navLinks.forEach(function (link) {
              link.removeAttribute("aria-current");
            });
            matchingLink.setAttribute("aria-current", "true");
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );

    sections.forEach(function (section) {
      sectionObserver.observe(section);
    });
  }

  function init() {
    initMobileNav();
    initFooterYear();
    initScrollReveal();
    initContactForm();
    initActiveNavHighlight();
  }

  init();

  /* istanbul ignore else */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      sanitizeForHeader: sanitizeForHeader,
      buildMailtoUrl: buildMailtoUrl,
      getYear: getYear,
      navigation: navigation,
      initMobileNav: initMobileNav,
      initFooterYear: initFooterYear,
      initScrollReveal: initScrollReveal,
      initContactForm: initContactForm,
      initActiveNavHighlight: initActiveNavHighlight,
      init: init,
    };
  }
})();
