/**
 * Felton Carpentry & Construction — Site Scripts
 * Vanilla JS only, no dependencies, no build step.
 */
(function () {
  "use strict";

  /* Mobile navigation toggle */
  var navToggle = document.querySelector(".nav-toggle");
  var primaryNav = document.querySelector(".primary-nav");

  if (navToggle && primaryNav) {
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

  /* Footer year */
  var yearEl = document.querySelector("[data-current-year]");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* Scroll reveal animations */
  var revealEls = document.querySelectorAll("[data-reveal]");
  if (revealEls.length) {
    if ("IntersectionObserver" in window) {
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
    } else {
      revealEls.forEach(function (el) {
        el.classList.add("is-visible");
      });
    }
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
   * an email client, delete this entire "Contact form handling" block —
   * Netlify will then handle the real form POST for you. See README.md.
   */
  var contactForm = document.querySelector("[data-contact-form]");
  if (contactForm) {
    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();

      var formData = new FormData(contactForm);
      var name = (formData.get("name") || "").toString().trim();
      var email = (formData.get("email") || "").toString().trim();
      var phone = (formData.get("phone") || "").toString().trim();
      var service = (formData.get("service") || "").toString().trim();
      var message = (formData.get("message") || "").toString().trim();

      var recipient = contactForm.getAttribute("data-recipient") || "";
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

      window.location.href = "mailto:" + recipient + "?subject=" + subject + "&body=" + body;

      var statusEl = contactForm.querySelector("[data-form-status]");
      if (statusEl) {
        statusEl.textContent = "Opening your email app to send this message…";
        statusEl.classList.add("is-visible");
      }
    });
  }

  /* Active nav link highlighting on the homepage */
  var sections = document.querySelectorAll("main section[id]");
  var navLinks = document.querySelectorAll(".nav-links a[href^='#']");

  if (sections.length && navLinks.length && "IntersectionObserver" in window) {
    var sectionObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var id = entry.target.getAttribute("id");
          var matchingLink = document.querySelector('.nav-links a[href="#' + id + '"]');
          if (!matchingLink) return;

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
})();
