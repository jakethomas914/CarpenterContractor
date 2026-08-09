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
├── index.html          Homepage (hero, services, about, gallery, testimonials, service area, CTA)
├── contact.html         Contact page (contact info + quote request form)
├── css/
│   └── styles.css       All site styling (single stylesheet, CSS custom properties)
├── js/
│   └── main.js          Mobile nav toggle, scroll reveal, contact form handling
├── assets/
│   └── favicon.svg      Site icon
├── robots.txt
├── sitemap.xml
└── README.md
```

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
use that instead of the default email behavior, delete the "Contact form
handling" block in `js/main.js` (it's clearly commented) so Netlify's native
form POST isn't intercepted by JavaScript.

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
