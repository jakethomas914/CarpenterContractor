# [Business Name] — Website

A static marketing website for a Southwest Florida carpentry and general
contracting business owned and personally operated by **Greg Felton**.

This is a marketing website, not an application: there is no backend, no
database, and no build step. It's plain HTML, CSS, and a small amount of
vanilla JavaScript, chosen specifically so the site is as simple as possible
to host and maintain long-term.

## Project structure

```
.
├── index.html            Homepage (hero, services, about, gallery, testimonials, service area, CTA)
├── contact.html          Contact page (contact info + quote request form)
├── css/
│   └── styles.css        All site styling (single stylesheet, CSS custom properties)
├── js/
│   └── main.js           Mobile nav toggle, scroll reveal, contact form handling
├── assets/
│   └── favicon.svg       Site icon
├── robots.txt
├── sitemap.xml
├── _headers              Netlify security headers (ignored by other hosts)
├── vercel.json           Vercel security headers (ignored by other hosts)
│
├── package.json          Dev-only tooling (linting + testing) — NOT a runtime dependency of the site
├── eslint.config.js       JS lint rules
├── .stylelintrc.json      CSS lint rules
├── .htmlvalidate.json     HTML lint rules
├── jest.config.js         Unit/integration test runner config
├── playwright.config.js   End-to-end/regression + accessibility test runner config
├── tests/
│   ├── unit/              Pure-function unit tests (Jest)
│   ├── integration/       DOM-wiring tests against jsdom fixtures (Jest)
│   └── e2e/               Real-browser regression + accessibility tests (Playwright)
├── .github/workflows/ci.yml   Runs lint + all tests on every push/PR
└── README.md
```

The `package.json` and everything under it is **developer tooling only** —
it has zero runtime dependencies and is never shipped to production. The
deployed site is still just `index.html`, `contact.html`, `css/`, `js/`,
`assets/`, `robots.txt`, and `sitemap.xml`.

## Running the site locally

No build tools, package manager, or server framework are required. Any of
the following work:

- Open `index.html` directly in a browser, or
- Serve the folder locally, e.g. `python3 -m http.server 8080` from the
  project root, then visit `http://localhost:8080`.

## Deploying

Because this is a folder of static files, it can be deployed to almost any
static host with no configuration, for example:

- **Netlify** — drag-and-drop the folder, or connect the git repo (no build
  command needed; publish directory is the repo root).
- **Vercel** — import the repo as a static project (no build command).
- **GitHub Pages** — enable Pages on this repo, root directory.
- Any traditional web host — upload the files via FTP/SFTP.

If you deploy on **Netlify**, the contact form (`contact.html`) already
includes the attributes Netlify needs (`data-netlify="true"`, a hidden
`form-name` field, and a spam honeypot field) to automatically collect
submissions in your Netlify site dashboard — no email inbox required. To
use that instead of the default email behavior, remove the
`initContactForm();` call inside `init()` in `js/main.js` (it's clearly
commented) so Netlify's native form POST isn't intercepted by JavaScript.

`_headers` (Netlify) and `vercel.json` (Vercel) are also included and apply
the security headers described below automatically if you deploy on either
of those platforms — see the "Security" section.

By default (on any other host), submitting the contact form opens the
visitor's email app with a pre-filled message addressed to the placeholder
inbox — this requires no server and works everywhere.

## Content you must update before launch

This site was built with **clearly marked placeholders** anywhere real
business information wasn't available yet. Search the project for the
following and replace them everywhere they appear:

| Placeholder | Found in | Replace with |
|---|---|---|
| `[Business Name]` | `index.html`, `contact.html` (title, nav, footer, JSON-LD) | Final business name |
| `info@example.com` | `index.html`, `contact.html` (JSON-LD, footer, contact form `data-recipient`) | Real business email |
| `https://www.example.com/` | `index.html`, `contact.html`, `robots.txt`, `sitemap.xml` | Final live domain |
| `[add license number]` | Footer of both pages | Florida contractor license number, if applicable |
| `Licensed & Insured (add credentials)` | Trust strip on `index.html` | Confirm licensing/insurance status and update or remove this claim accordingly |
| Sample testimonials (marked with a "Sample" badge) | `#testimonials` section of `index.html` | Real client reviews |
| Gallery tiles ("Photos coming soon") | `#gallery` section of `index.html` | Real project photos |
| "Photo of Greg Felton — coming soon" | `#about` section of `index.html` | A real photo of Greg |
| Availability hours | `contact.html` | Confirm actual working hours |

Everything else on the site (owner name, phone number, service area, and
all service descriptions) reflects the information provided for this
project and should already be accurate — double check it regardless before
launch.

> Tip: your editor's project-wide "Find in Files" (or `grep -rn` from a
> terminal) for `[Business Name]`, `example.com`, and `[add` will surface
> every remaining placeholder.

## Design notes

- **Palette**: warm cedar/walnut tones paired with a soft cream background
  and a muted sage-green accent — evokes craftsmanship and natural
  materials without leaning on any particular existing contractor site's
  look.
- **Type**: [Fraunces](https://fonts.google.com/specimen/Fraunces) (serif)
  for headings, [Inter](https://fonts.google.com/specimen/Inter) for body
  text, loaded from Google Fonts.
- **Layout**: a single long homepage covering everything a homeowner needs
  (services, about, gallery, testimonials, service area) plus one dedicated
  Contact page — intentionally lean, since a one-person business doesn't
  need a deep, multi-page site.
- **Icons**: hand-authored inline SVGs, no icon font or icon library
  dependency.
- All interactive behavior (mobile menu, scroll-reveal animation, active
  nav highlighting, contact form) is in `js/main.js` with no external
  libraries.

## Making future content edits

Because there's no CMS, content changes mean directly editing the HTML
files in a text editor:

- Text content lives directly in `index.html` and `contact.html`.
- Colors, fonts, and spacing are controlled by CSS custom properties at the
  top of `css/styles.css` (the `:root` block) — change a value there to
  update it site-wide.
- To add a new gallery photo, replace one of the placeholder
  `.gallery-tile` blocks in `index.html` with an `<img>` tag pointing at a
  photo in a new `assets/gallery/` folder.
- To add a new testimonial, copy an existing `.testimonial-card` block and
  remove the `sample-badge` element once it's a real review.

## Architecture notes / code design decisions

This section documents the reasoning behind a few deliberate trade-offs, in
case they come up in a future review:

- **No framework, no build step.** For a 2-page marketing site maintained
  by a non-developer long-term, the lowest-risk architecture is plain
  static files: nothing to upgrade, no `node_modules` in production, no
  build pipeline that can break, and it runs on literally any static host.
- **Some markup duplication between `index.html` and `contact.html`**
  (header/nav/footer). With only two pages, a templating/build layer to
  eliminate ~60 lines of duplication would add more long-term maintenance
  risk (a build step, a templating dependency) than it removes. Each file
  is self-contained and comments mark the shared blocks so they're easy to
  keep in sync; if the site grows past a handful of pages, revisit this
  with a static site generator (e.g. Eleventy/Astro).
- **No inline styles or inline event handlers.** All presentation lives in
  `css/styles.css`; all behavior lives in `js/main.js`. This keeps
  concerns separated, makes the CSS lintable/consistent, and is what
  allows the strict Content-Security-Policy described below.
- **`js/main.js` is a single IIFE, not a bundle.** Its pure helper
  functions (`sanitizeForHeader`, `buildMailtoUrl`, `getYear`) are grouped
  separately from DOM-wiring functions (`initMobileNav`, `initContactForm`,
  etc.), each independently callable and independently tested. The file
  conditionally does `module.exports = {...}` at the end — a no-op in the
  browser (no bundler/transpiler needed) — solely so Jest can `require()`
  it and unit-test the pure functions directly.

## Development tooling (lint + tests)

The site itself has no dependencies, but this repo includes dev-only
tooling to keep it high-quality over time. To use it:

```bash
npm install                 # one-time setup (dev dependencies only)
npx playwright install      # one-time: downloads browsers for e2e tests

npm run lint                # ESLint (js/) + Stylelint (css/) + html-validate (html)
npm run lint:fix            # auto-fix what can be auto-fixed

npm run test:unit           # Jest: pure-function + DOM-integration tests
npm run test:e2e            # Playwright: real-browser regression + accessibility tests
npm test                    # everything above
```

`.github/workflows/ci.yml` runs all of this automatically on every push and
pull request.

### Linting

| Tool | Checks | Config |
|---|---|---|
| ESLint | `js/main.js` and the test suite itself | `eslint.config.js` |
| Stylelint (`stylelint-config-standard`) | `css/styles.css` | `.stylelintrc.json` |
| html-validate (`html-validate:recommended`) | `index.html`, `contact.html` | `.htmlvalidate.json` |

All three currently pass with zero errors. Notable fixes made during the
initial lint pass: removed all inline `style="..."` attributes in favor of
CSS classes, switched void elements (`<meta>`, `<link>`, `<input>`) to
HTML5-style (no trailing `/>`), added non-breaking hyphens/spaces to
visible phone numbers so they don't awkwardly line-wrap, and added a
`type` attribute to the honeypot input.

### Testing

| Layer | Tool | Location | What it covers |
|---|---|---|---|
| Unit | Jest | `tests/unit/main.test.js` | Pure logic: mailto URL construction, header-injection sanitization, year formatting — no DOM. |
| Integration | Jest + jsdom | `tests/integration/dom-behavior.test.js` | Wiring between the DOM and `js/main.js`: mobile nav toggle, footer year injection, scroll-reveal (with/without `IntersectionObserver`), active-nav highlighting, contact form submit → mailto redirect + status message. |
| End-to-end / regression | Playwright (Chromium + Mobile Safari emulation) | `tests/e2e/homepage.spec.js`, `tests/e2e/contact.spec.js` | Real-browser rendering: page loads/titles, heading hierarchy, image alt text, nav anchor scrolling, mobile hamburger menu, internal link 404 checks, CSP-violation checks, form fill + native HTML5 validation + submit. |
| Accessibility | Playwright + `@axe-core/playwright` | `tests/e2e/accessibility.spec.js` | Automated WCAG 2 A/AA scan of both pages (0 serious/critical violations). |

Current status: **21 Jest tests + 38 Playwright tests, all passing**
(Playwright runs each spec against both a desktop Chromium profile and a
Mobile Safari/iPhone 13 emulation profile). Run `npm run test:unit:coverage`
for a statement-coverage report of `js/main.js` (currently ~97%).

## Security

This is a static, backend-less site, which already eliminates most
categories of web vulnerability (no server code, no database, no user
authentication, no server-side template injection). The hardening below
covers what's left:

- **Content-Security-Policy** is set via `<meta>` tag in both HTML files
  (works with zero server config on any host) and again via HTTP header in
  `_headers`/`vercel.json` for hosts that support them. It restricts
  scripts/styles/fonts/images/connections to `'self'` plus the two Google
  Fonts domains actually used, blocks `<object>`/plugins, and restricts
  form submission targets. `contact.html` needs no inline-script
  allowance; `index.html` allows inline scripts only because of its
  single static JSON-LD structured-data block (kept as `'unsafe-inline'`
  rather than a SHA-256 hash allowlist — hashing was considered, but it
  would silently break the page's structured data the next time someone
  edits that JSON-LD without knowing to regenerate the hash, which
  conflicts with this site's "safe for a non-developer to edit" goal).
- **No inline styles or event handler attributes anywhere** — besides
  being cleaner code, this means the CSP `style-src` needs no
  `'unsafe-inline'` exception.
- **Headers that can only be set via a real HTTP response** (`X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`,
  `Permissions-Policy`, and CSP's `frame-ancestors 'none'`) are provided
  via `_headers` (Netlify) and `vercel.json` (Vercel) and applied
  automatically if you deploy on either platform. If you use a different
  host, configure equivalent headers there for full protection against
  clickjacking, MIME-sniffing, and protocol downgrade.
- **`Referrer-Policy: strict-origin-when-cross-origin`** limits how much of
  your URL is leaked to other sites when a visitor clicks an outbound
  link.
- **Contact form input sanitization.** The mailto builder
  (`sanitizeForHeader` in `js/main.js`) strips CR/LF characters from
  name/email/phone/service fields before they're placed into the
  `mailto:` URL's subject/body, as defense-in-depth against email-header
  injection. Covered by unit tests.
- **No `innerHTML`/`eval`/`document.write` anywhere in `js/main.js`** — all
  DOM text updates use `textContent`, so there's no DOM-based XSS surface
  even though the codebase has no build-time sanitizer.
- **Honeypot field + Netlify's built-in spam filtering** on the contact
  form (`bot-field`) for when the site is deployed on Netlify; the field
  is hidden from sighted users via the same `.visually-hidden` pattern
  used for screen-reader-only text (not `display: none`, so it still
  works as an anti-bot honeypot).
- **`npm audit`** reports 0 known vulnerabilities in the dev tooling
  (checked in CI on every push, at `--audit-level=high`). Since the tooling
  is dev-only, it never ships to the production site regardless.
- **No secrets, API keys, or credentials** anywhere in the repo — there's
  nothing to leak because the site has no backend to authenticate to.
- **HTTPS-only external resources**: the only third-party resources loaded
  are the two Google Fonts domains, both over `https://`.
