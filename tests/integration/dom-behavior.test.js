"use strict";

/**
 * Integration tests: exercise js/main.js against realistic DOM fixtures
 * built from the same markup patterns used in index.html / contact.html,
 * using jsdom. These verify wiring between the DOM and the script, not
 * just the pure functions in isolation.
 */

function loadMainWithFixture(html) {
  document.body.innerHTML = html;
  jest.resetModules();
  return require("../../js/main.js");
}

describe("mobile navigation toggle", () => {
  const navFixture = `
    <header>
      <button class="nav-toggle" aria-expanded="false"></button>
      <nav class="primary-nav">
        <ul class="nav-links">
          <li><a href="#services">Services</a></li>
        </ul>
      </nav>
    </header>
  `;

  test("clicking the toggle opens the nav and sets aria-expanded", () => {
    loadMainWithFixture(navFixture);
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.querySelector(".primary-nav");

    expect(nav.classList.contains("is-open")).toBe(false);

    toggle.dispatchEvent(new window.Event("click", { bubbles: true }));

    expect(nav.classList.contains("is-open")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  test("clicking the toggle again closes the nav", () => {
    loadMainWithFixture(navFixture);
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.querySelector(".primary-nav");

    toggle.dispatchEvent(new window.Event("click", { bubbles: true }));
    toggle.dispatchEvent(new window.Event("click", { bubbles: true }));

    expect(nav.classList.contains("is-open")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  test("clicking a nav link closes an open mobile menu", () => {
    loadMainWithFixture(navFixture);
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.querySelector(".primary-nav");
    const link = document.querySelector(".nav-links a");

    toggle.dispatchEvent(new window.Event("click", { bubbles: true }));
    expect(nav.classList.contains("is-open")).toBe(true);

    link.dispatchEvent(new window.Event("click", { bubbles: true }));

    expect(nav.classList.contains("is-open")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("footer year injection", () => {
  test("populates the current year into [data-current-year]", () => {
    loadMainWithFixture('<footer>&copy; <span data-current-year>2000</span></footer>');
    const yearEl = document.querySelector("[data-current-year]");
    expect(yearEl.textContent).toBe(String(new Date().getFullYear()));
  });

  test("does not throw when no year element is present on the page", () => {
    expect(() => loadMainWithFixture("<footer></footer>")).not.toThrow();
  });
});

describe("scroll reveal fallback", () => {
  const revealFixture = '<section data-reveal>Content</section>';

  test("reveals elements immediately when IntersectionObserver is unavailable", () => {
    const original = window.IntersectionObserver;
    delete window.IntersectionObserver;

    loadMainWithFixture(revealFixture);

    const el = document.querySelector("[data-reveal]");
    expect(el.classList.contains("is-visible")).toBe(true);

    window.IntersectionObserver = original;
  });

  test("does not eagerly reveal elements when IntersectionObserver is available", () => {
    let capturedCallback;
    window.IntersectionObserver = class {
      constructor(callback) {
        capturedCallback = callback;
      }

      observe() {}
      unobserve() {}
      disconnect() {}
    };

    loadMainWithFixture(revealFixture);

    const el = document.querySelector("[data-reveal]");
    expect(el.classList.contains("is-visible")).toBe(false);
    expect(typeof capturedCallback).toBe("function");

    delete window.IntersectionObserver;
  });

  test("reveals an element and unobserves it once its intersection callback fires", () => {
    let capturedCallback;
    const unobserve = jest.fn();
    window.IntersectionObserver = class {
      constructor(callback) {
        capturedCallback = callback;
      }

      observe() {}
      unobserve(target) {
        unobserve(target);
      }

      disconnect() {}
    };

    loadMainWithFixture(revealFixture);
    const el = document.querySelector("[data-reveal]");

    capturedCallback([{ isIntersecting: true, target: el }]);

    expect(el.classList.contains("is-visible")).toBe(true);
    expect(unobserve).toHaveBeenCalledWith(el);

    delete window.IntersectionObserver;
  });
});

describe("active nav highlighting", () => {
  const navHighlightFixture = `
    <nav>
      <ul class="nav-links">
        <li><a href="#services">Services</a></li>
        <li><a href="#about">About</a></li>
      </ul>
    </nav>
    <main>
      <section id="services">Services content</section>
      <section id="about">About content</section>
    </main>
  `;

  test("marks the nav link for the currently intersecting section as aria-current", () => {
    let capturedCallback;
    window.IntersectionObserver = class {
      constructor(callback) {
        capturedCallback = callback;
      }

      observe() {}
      unobserve() {}
      disconnect() {}
    };

    loadMainWithFixture(navHighlightFixture);

    const aboutSection = document.getElementById("about");
    const servicesLink = document.querySelector('.nav-links a[href="#services"]');
    const aboutLink = document.querySelector('.nav-links a[href="#about"]');

    capturedCallback([{ isIntersecting: true, target: aboutSection }]);

    expect(aboutLink.getAttribute("aria-current")).toBe("true");
    expect(servicesLink.hasAttribute("aria-current")).toBe(false);

    delete window.IntersectionObserver;
  });

  test("does not throw when there are no sections or nav links on the page", () => {
    expect(() => loadMainWithFixture("<div></div>")).not.toThrow();
  });
});

describe("contact form handling", () => {
  const formFixture = `
    <form data-contact-form data-recipient="info@example.com">
      <input name="name" value="Jane Doe" />
      <input name="email" value="jane@example.com" />
      <input name="phone" value="239-555-0100" />
      <select name="service"><option value="Kitchen & Bath Remodel" selected>Kitchen &amp; Bath Remodel</option></select>
      <textarea name="message">Please call me back.</textarea>
      <div data-form-status></div>
    </form>
  `;

  test("submitting the form redirects to a mailto: URL built from the fields", () => {
    const main = loadMainWithFixture(formFixture);
    const redirectSpy = jest.fn();
    main.navigation.redirect = redirectSpy;

    const form = document.querySelector("[data-contact-form]");
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

    expect(redirectSpy).toHaveBeenCalledTimes(1);
    const [calledUrl] = redirectSpy.mock.calls[0];
    expect(calledUrl).toMatch(/^mailto:info@example\.com\?subject=/);
    expect(decodeURIComponent(calledUrl)).toContain("Jane Doe");
  });

  test("submitting the form shows a status message to the user", () => {
    const main = loadMainWithFixture(formFixture);
    main.navigation.redirect = jest.fn();

    const form = document.querySelector("[data-contact-form]");
    const status = document.querySelector("[data-form-status]");

    expect(status.classList.contains("is-visible")).toBe(false);

    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

    expect(status.classList.contains("is-visible")).toBe(true);
    expect(status.textContent.length).toBeGreaterThan(0);
  });

  test("does not throw when the page has no contact form", () => {
    expect(() => loadMainWithFixture("<div></div>")).not.toThrow();
  });
});
