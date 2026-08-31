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
│   ├── unit/              Static + pure-function Jest suites
│   │   ├── main.test.js           Pure helpers (mailto, sanitize, year)
│   │   ├── html-js-contract.test.js  Selector / data-* / init() wiring
│   │   ├── security-headers.test.js  CSP + host-header four-way sync
│   │   └── site-invariants.test.js   Lead-capture, SEO, chrome parity
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
- From the project root, run `npm run serve` (or `python3 -m http.server 8080`)
  then visit `http://localhost:8080`. The serve script only needs Python 3 —
  no `npm install` required for viewing the site.

Prefer a local HTTP server over `file://` when checking fonts, CSP, or the
contact form — some browsers restrict `mailto:` / font loading from file URLs.

## Deploying

Because this is a folder of static files, it can be deployed to almost any
static host with no configuration, for example:

- **Netlify** — drag-and-drop the folder, or connect the git repo (no build
  command needed; publish directory is the repo root).
- **Vercel** — import the repo as a static project (no build command).
- **GitHub Pages** — enable Pages on this repo, root directory.
- Any traditional web host — upload the files via FTP/SFTP.

`_headers` (Netlify) and `vercel.json` (Vercel) apply the security headers
described in the "Security" section automatically on those platforms.

### Contact form modes (operational runbook)

There is no backend. The form on `contact.html` supports two mutually
exclusive submission modes:

| Mode | When to use | How it works | Setup |
|---|---|---|---|
| **mailto (default)** | Any host; zero server config | JS intercepts submit, builds a `mailto:` URL from the fields, opens the visitor's email client | Keep `initContactForm()` in `init()` (`js/main.js`). Set `data-recipient` on the `<form>` to the real inbox. |
| **Netlify Forms** | Deployed on Netlify; want submissions in the Netlify dashboard | Browser POSTs the form to Netlify; no email client needed | Form already has `data-netlify="true"`, hidden `form-name=contact`, and `bot-field` honeypot. **Remove** the `initContactForm();` call inside `init()` so JS no longer `preventDefault()`s the submit. |

Constraints:

- Do not leave both modes active. With `initContactForm()` enabled, the
  submit handler always calls `event.preventDefault()`, so Netlify never
  receives a real POST.
- Changing the inbox means updating `data-recipient` on the form **and**
  every visible `mailto:` / JSON-LD email placeholder (`info@example.com`).
- Required fields (`name`, `phone`, `email`, `message`) rely on native
  HTML5 validation; the JS path only runs after the browser accepts the form.

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
- Theme tokens live in the `:root` block of `css/styles.css`. Key variables:

  | Token | Role |
  |---|---|
  | `--color-bg`, `--color-bg-alt`, `--color-surface` | Page / section backgrounds |
  | `--color-text`, `--color-text-muted`, `--color-ink` | Body and emphasis text |
  | `--color-wood*`, `--color-accent*` | Brand cedar + sage accents |
  | `--font-heading`, `--font-body` | Fraunces / Inter stacks |
  | `--container-width`, `--radius-*`, `--shadow-*`, `--transition` | Layout + motion |

## JavaScript ↔ HTML contract

`js/main.js` wires behavior through stable selectors. Renaming these without
updating both the HTML and JS (and the contract tests) will silently disable
features. Guarded by `tests/unit/html-js-contract.test.js` and
`tests/integration/dom-behavior.test.js`.

| Hook | Used by | Behavior |
|---|---|---|
| `.nav-toggle` + `.primary-nav` (`id="primary-nav"`, `aria-controls="primary-nav"`) | `initMobileNav` | Toggles `.is-open` and `aria-expanded`; closes on link click. Toggle must be `type="button"` with `aria-expanded="false"` initially |
| `[data-current-year]` | `initFooterYear` | Sets text to the current four-digit year |
| `[data-reveal]` | `initScrollReveal` | Adds `.is-visible` on intersection (`threshold: 0.12`, `rootMargin: "0px 0px -60px 0px"`), then `unobserve`s. Falls back to immediate `.is-visible` if `IntersectionObserver` is missing. CSS also force-shows reveals under `prefers-reduced-motion: reduce` |
| `[data-contact-form]` + `data-recipient` | `initContactForm` | On submit: `preventDefault`, build mailto from named fields (`name`, `email`, `phone`, `service`, `message`), redirect via `navigation.redirect`, show inner `[data-form-status]` (`role="status"`) |
| `main section[id]` + `.nav-links a[href^='#']` | `initActiveNavHighlight` | Sets `aria-current="true"` on the in-view section's nav link (homepage only; `rootMargin: "-45% 0px -50% 0px"`). Keeps observing (unlike scroll-reveal) so scrolling back still updates the current link |

Nav href constraints (easy to break when copy-pasting chrome between pages):

- **Homepage** primary nav must use bare `#services`, `#about`, … hashes — `initActiveNavHighlight` only selects `a[href^='#']`. Prefixed `index.html#…` links silently disable highlighting.
- **Contact** primary nav must use `index.html#…` targets — bare hashes on that page scroll nowhere useful.

Other constraints:

- Both pages load a **synchronous** end-of-body `<script src="js/main.js">` (no `defer` / `async`) so `init()` runs after the hooks exist in the DOM.
- Lead fields keep matching `id` / `name` / `label[for]` (`name`, `email`, `phone`, `service`, `message`); required fields use native HTML5 validation (no `novalidate`).
- Homepage service-card titles must stay selectable in the contact `<select>` (plus “Not sure yet”) — locked by `site-invariants.test.js`.

`module.exports` (browser no-op via `typeof module` check) exposes pure helpers
`sanitizeForHeader`, `buildMailtoUrl`, `getYear`, the `navigation` seam (tests
spy on `navigation.redirect` because jsdom cannot assert real location
changes), and the `init*` / `init` entry points for integration tests.

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
- **`js/main.js` is a single IIFE, not a bundle.** Pure helpers
  (`sanitizeForHeader`, `buildMailtoUrl`, `getYear`) are grouped separately
  from DOM-wiring (`initMobileNav`, `initContactForm`, etc.). The file
  conditionally does `module.exports = {...}` at the end — a no-op in the
  browser — so Jest can `require()` both the pure helpers and the `init*`
  entry points (integration tests call them against jsdom fixtures).

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
| Unit (pure) | Jest | `tests/unit/main.test.js` | Mailto URL construction, CR/LF header sanitization, year formatting — no DOM. |
| Unit (contracts) | Jest | `tests/unit/html-js-contract.test.js` | Selector / `data-*` / `init()` wiring; homepage bare-hash vs contact `index.html#` nav rules; form field id/name/label pairing. |
| Unit (security) | Jest | `tests/unit/security-headers.test.js` | `_headers` ↔ `vercel.json` parity; CSP four-way sync with HTML `<meta>` tags (see Security). |
| Unit (invariants) | Jest | `tests/unit/site-invariants.test.js` | Cross-file lead-capture identity (mailto/tel/JSON-LD), SEO discovery (`robots.txt` / `sitemap.xml` / canonicals), chrome/footer drift, service catalog ↔ form options, CI workflow gates. |
| Integration | Jest + jsdom | `tests/integration/dom-behavior.test.js` | DOM ↔ `js/main.js` wiring: mobile nav, footer year, scroll-reveal (with/without `IntersectionObserver`), active-nav, contact form → mailto redirect + status. |
| End-to-end / regression | Playwright (Chromium + Mobile Safari emulation) | `tests/e2e/homepage.spec.js`, `tests/e2e/contact.spec.js` | Real-browser rendering: titles, heading hierarchy, alt text, nav scrolling, mobile menu, internal 404 checks, CSP-violation checks, form fill + HTML5 validation + submit. |
| Accessibility | Playwright + `@axe-core/playwright` | `tests/e2e/accessibility.spec.js` | Automated WCAG 2 A/AA scan of both pages (0 serious/critical violations). |

Current status: **218 Jest tests + 38 Playwright tests, all passing**
(Playwright: 19 specs × desktop Chromium + Mobile Safari/iPhone 13 → 38 runs).
`js/main.js` statement coverage is ~99% via `npm run test:unit:coverage`.

When editing markup or CSP, prefer the contract/invariant suites above as the
source of truth for “what must stay in sync” — they exist specifically to catch
silent cross-file drift that e2e alone often misses.

### Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on every pull
request:

1. Node **22** + `npm ci`
2. `npm run lint` (ESLint + Stylelint + html-validate)
3. `npm run test:unit` (Jest)
4. `npx playwright install --with-deps chromium webkit`, then `npm run test:e2e`
5. `npm audit --audit-level=high`
6. Uploads `playwright-report/` as a CI artifact (14-day retention), even on failure

Locally, Playwright starts its own static server on port **4173**
(`python3 -m http.server 4173` via `playwright.config.js`). CI always
starts a fresh server; locally it reuses one if already running.

## Security

This is a static, backend-less site, which already eliminates most
categories of web vulnerability (no server code, no database, no user
authentication, no server-side template injection). The hardening below
covers what's left:

- **Content-Security-Policy** is set in **four places that must stay aligned**
  when you change allowed origins: the `<meta>` tags in `index.html` and
  `contact.html`, plus `_headers` (Netlify) and `vercel.json` (Vercel).
  Locked by `tests/unit/security-headers.test.js`. Rules of the sync:

  | Copy | Must match host CSP? | Notable differences |
  |---|---|---|
  | `_headers` / `vercel.json` | Each other, exactly | Include `frame-ancestors 'none'` (HTTP-only). Site-wide: Netlify `/*`, Vercel `/(.*)`. |
  | `index.html` `<meta>` | Host CSP minus `frame-ancestors` | `script-src 'self' 'unsafe-inline'` for the static JSON-LD block (hash allowlists were rejected — regenerating a SHA on every JSON-LD edit conflicts with “safe for a non-developer to edit”). |
  | `contact.html` `<meta>` | Shared fetch allowlists + `form-action` | `script-src 'self'` only (no JSON-LD / no `'unsafe-inline'`). Must not be more permissive than the host policy. |

  Shared allowlists: `style-src` / `font-src` = `'self'` + Google Fonts;
  `form-action 'self' mailto:` (Netlify POST **and** the JS mailto path);
  `img-src 'self' data:`; `connect-src` / `default-src` / `base-uri` `'self'`;
  `object-src 'none'`.
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

## Troubleshooting & common pitfalls

| Symptom | Likely cause | Fix |
|---|---|---|
| Fonts missing / CSP console errors after adding a CDN or analytics script | CSP allowlists are strict and duplicated | Update **all four** CSP copies together (see Security table). Prefer hosting assets under `assets/` so `'self'` is enough. |
| Netlify Forms dashboard stays empty | `initContactForm()` still intercepts submit | Remove `initContactForm();` from `init()` in `js/main.js` (see contact-form runbook above). Redeploy. |
| mailto form does nothing / opens blank | Inbox still `info@example.com`, or opened via `file://` | Set `data-recipient` (and other email placeholders) to the real address; serve over `http://localhost`. |
| Form submit blocked by CSP (`form-action`) | Host/meta CSP missing `mailto:` or `'self'` | Keep `form-action 'self' mailto:` on every CSP copy — `'self'` alone breaks mailto; `mailto:` alone breaks Netlify Forms POST. |
| Active nav highlight never moves on homepage | Nav links use `index.html#…` instead of bare `#…` | Restore bare hashes in the homepage `.nav-links` list (see contract above). |
| Contact “Explore” / section links go nowhere | Contact nav uses bare `#…` hashes | Use `index.html#section` on `contact.html` only. |
| New service on homepage missing from quote form | Catalog / `<option>` drift | Add a matching `<option>` (label must equal the service-card `<h3>`); `site-invariants` enforces this. |
| Quote form invisible until scroll / permanently hidden | `[data-reveal]` on contact cards + missing/blocked `main.js` | Ensure `js/main.js` loads; or rely on `prefers-reduced-motion` / `.is-visible` CSS. Do not remove reveal hooks without updating CSS. |
| `npm run test:e2e` fails on browser download | Playwright browsers not installed | Run `npx playwright install` (CI uses `chromium` + `webkit` with OS deps). |
| axe color-contrast failures on reveals | Elements measured mid-fade (`opacity: 0`) | Accessibility e2e already emulates `prefers-reduced-motion: reduce`, which CSS uses to show `[data-reveal]` immediately — keep that pattern if you add more animated content. |
| Mobile menu never opens after markup edit | Missing `.nav-toggle` / `.primary-nav` / `id="primary-nav"` / `aria-controls` pairing | Restore the contract in the table above; covered by contract + integration + e2e tests. |
| Header/footer drift between pages | Intentional duplication (no templating) | Edit **both** `index.html` and `contact.html`; comments mark the shared blocks. Invariants fail if brand, phone, mailto, or nav labels diverge. |
| CI green locally but fails in GitHub Actions | Different Node / missing Playwright OS deps | Match CI: Node 22, `npm ci`, and `npx playwright install --with-deps chromium webkit`. Download the `playwright-report` artifact from the failed run. |
