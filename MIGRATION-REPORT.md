# theburgerboxes.com — WordPress/WooCommerce → Astro migration report

**Staging:** https://site-dun-ten-91.vercel.app — every `*.vercel.app` host returns `X-Robots-Tag: noindex, nofollow`
**Repository:** `~/Documents/The Burger Boxes` (site in `site/`)
**Source:** `theburgerboxes-com-20260817-135529-4r47t59actme.wpress` (All-in-One WP Migration, 17 Aug 2026)
**The production domain has not been connected.** Nothing points at this build.

---

## Phase 1 — Extraction and inventory

The archive was unpacked with a local reader. No WordPress was installed, no PHP was
executed, and nothing from the archive is served. 34,205 files, 552.7 MB:

| Area | Files | Size |
|---|---:|---:|
| plugins | 27,304 | 311.4 MB |
| uploads | 3,979 | 187.1 MB |
| themes (Rishi 2.0.7) | 2,909 | 15.4 MB |
| root (`database.sql`, `.htaccess`, `package.json`) | 5 | 38.8 MB |

`database.sql` was loaded into SQLite for reading only — 91 tables, 34,165 rows.

Recovered stack: WordPress 7.0.4, WooCommerce 11.0.1, Elementor 4.2.2 + Elementor Pro 4.1.2,
Rishi theme, Yoast SEO 28.2, Schema & Structured Data for WP, Essential Addons, Custom Tabs,
Joinchat, Google Listings & Ads, WP Mail SMTP, LiteSpeed Cache.

Recovered content: 69 products, 7 populated product categories (+1 empty), 11 pages, 2 posts,
289 attachments, 3 menus, 9 live Elementor forms with their recipients and messages, Yoast
titles and descriptions per URL, WooCommerce settings, Joinchat settings, tracking IDs, custom
CSS, 30 old-slug redirects, and the `.htaccess` rule that answers **410 Gone** for every
add-to-cart URL.

The archive, the SQL dump and every PHP file stay outside the deployable tree and outside git.
`scripts/validate.py` re-checks the built output for backup, database, PHP and secret material
on every run.

### URL discovery

| Source | URLs |
|---|---:|
| `sitemap_index.xml` and its six child sitemaps | 91 |
| Reachable by crawling internal links from the home page | 105 |
| Derived from the database (products, pages, posts, terms) | 82 |
| **Rows in the migration manifest** | **107** |

**Manifest:** `_migration/manifest.csv` / `.json` — one row per URL with its discovery source,
live status, page type, title, meta description, canonical, robots, OG tags, H1, heading counts,
schema types, image and alt-text counts, internal/external link counts, form and hidden-field
counts, and tracking IDs.

---

## Phase 2 — The Astro build

Astro 7.2.4, static output, `trailingSlash: 'always'`, on Vercel with five serverless functions
and one edge middleware.

The crawled rendered HTML is the source of truth for markup. Header, off-canvas drawer and footer
are stored once and rebuilt per page from a positional tag diff, which reproduces each page's menu
state exactly — at most 31 differing tags on any page. `scripts/audit-shell.mjs` asserts that the
plain-JS shell used by the request-time endpoints emits byte-identical documents to the Astro
layout; it does, on every page.

Everything the pages load is served from this deployment: 205 MB, 4,365 files, of which 3,860 are
uploaded media and 89 are font files.

---

## Final report

### 1. Total source URLs

91 in the sitemap. 105 reachable by crawling internal links. 82 derivable from the database.
107 rows in the manifest once the cart-flow pages are included.

### 2. Total Astro routes

**106 built pages** (105 `index.html` + `404.html`), plus `/?s=` search results rendered at
request time, plus five endpoints (`/wp-admin/admin-ajax.php`, `/api/order`,
`/wp-comments-post.php`, `/wp-json/joinchat/v1/track-click`, the 410 handler).

### 3. URLs found outside the sitemap

A full internal-link crawl found 16, every one preserved:

| URL | Live | Handling |
|---|---|---|
| `/products/page/2..5/` | 200, indexable, self-canonical | Built as pages |
| `/products/page/1/` | 301 → `/products/` | Redirect |
| `/page/2..5/` | 200, home page with `paged` class, canonical `/` | Built as pages |
| `/my-account/lost-password/`, `/orders/`, `/edit-account/` | 200, `noindex` | Built as pages |
| `/my-account/customer-logout/` | 302 → `/my-account/` | Redirect |
| `/product-category/Boxes-By-Material\|Type\|Customization/`, `/boxes-by-Color/` | 200, canonical to lower case | Rewrites (same 200, same canonical) |
| `/category/uncategorized/`, `/product-category/uncategorized/` | 200, empty archives | Built as pages |
| `/?add-to-cart=…` | 410 Gone | Reproduced (§14) |
| `/product/clamshell-burger-boxes/URL` | 404 | Pre-existing broken link, left as-is |
| `/cdn-cgi/l/email-protection` | 404 | Cloudflare artefact, gone with the proxy |

### 4. Missing URLs

**None.** Every sitemap URL and every database-derived URL has an Astro route. The 30 old product
slugs WordPress 301s are reproduced as 301s.

### 5. Redirect comparison

**49/49 match the live server** — status code and `Location` — across all 35 redirects, 6 rewrites
and the special statuses (410 on add-to-cart, 404 on `/shop/` and `/product-tag/…`, 200 on
robots.txt and the sitemaps). Note that the live host answers a non-browser request with a 202
bot-challenge interstitial; probes send browser headers, and with them the live site returns 410
exactly as this build does.

### 6. Content differences

**Zero unexpected.** Every URL was compared field by field from the HTML each side serves:
headings, visible text, body classes and text order are identical on 103 of 104 URLs.

The one exception is `/cart/`, and it is in the right direction: the live *served* HTML carries a
hidden "You may be interested in…" heading belonging to the WooCommerce Blocks loading skeleton,
which the Blocks bundle deletes when it hydrates an empty cart. This build ships the hydrated
markup, so the page matches what a visitor sees rather than what the server sent.

A second pass compared the **post-JavaScript DOM** of 50 pages, live against staging, after
scripts ran and lazy content was scrolled in: **0 unexplained differences**. What did differ:
Cloudflare's proxy-injected shims (gone with the proxy), `/assets/cart.js` (added), and
WooCommerce's randomised "Related products" — confirmed to shuffle between two requests to the
live site.

### 7. Metadata differences

**Zero**, on every URL: title, meta description, canonical, meta robots, all Open Graph and
Twitter tags, and both Google site-verification tokens.

### 8. Missing images

**Zero.** 2,009 referenced assets and 1,891 distinct image references all resolve to files this
site ships. `scripts/assetcheck.py` re-verifies this on every build, covering markup attributes,
`srcset`, CSS `url()` and the URLs WordPress prints inside JS config objects. No image referenced
by the live site 404s.

### 9. Broken internal links

**One, pre-existing.** 12,861 internal links were resolved; the only failure is
`/product/clamshell-burger-boxes/URL`, a typo in that product's own description which 404s on the
live site too. Content freeze — left as found.

### 10. Schema differences

**Zero.** All JSON-LD is byte-identical: 69 `Product`, 12 `ItemList`, 5 `FAQPage`,
5 `Organization`, 2 `BlogPosting`, 1 `Person`. Every URL inside the structured data stays absolute
on `https://theburgerboxes.com/`, as do canonicals and `og:image`.

### 11. Product / category differences

**Zero.** 69 products, each in exactly one category, database and rendered markup agreeing on
every assignment. Archive tile counts match the term counts exactly, so material, type, colour,
size, customization, complementary and occasion categories are not mixed:

| Category | Products |
|---|---:|
| Boxes By Type | 16 |
| Complementary Food Packaging | 16 |
| Boxes By Customization | 13 |
| Boxes By Material | 10 |
| Boxes By Color | 5 |
| Boxes By Size | 5 |
| Food Occasion Packaging | 4 |

All 69 appear exactly once across the five pages of the shop archive.

### 12. Form test results

The forms themselves are untouched — same fields, names, required flags, file upload, honeypots
and reCAPTCHA v2 checkbox. Elementor Pro's own bundle is kept and `wp-admin/admin-ajax.php` is
reimplemented as a serverless function, so the round trip is the original one.

**9/9 contract checks pass:** unknown actions answer `0` the way admin-ajax does; missing required
fields come back keyed by field id with Elementor's own wording ("This field is required.");
invalid email is caught; the honeypot answers success without sending; a submission with no
reCAPTCHA token is refused with "There's something wrong. The form is invalid."; the contact forms
validate against their own configuration.

In the browser, the form posts to `https://site-dun-ten-91.vercel.app/wp-admin/admin-ajax.php` —
this deployment, never the WordPress host — and Elementor's script renders the server's message
inline exactly as before.

**Real delivery is not yet proven.** The SMTP password is encrypted with the site's WordPress
salts and `wp-config.php` is not in the backup. Everything else was recovered: recipients
(`shanimazhar82@gmail.com, support@smartwaypackaging.com`), subject ("New message from The Burger
Boxes"), From identity, the reCAPTCHA secret, and the `/thank-you/` redirect. Give me the Gmail
app password for `info@theburgerboxes.com` and I will run real end-to-end submissions. No
test-recipient override is set anywhere.

### 13. Product attribution test results

Elementor had cached the hidden attribution fields into the shared product template, so **all 69
product pages submitted the same wrong values**: `referer_title` = "Custom Coffee Cups with Lids |
Disposable & Double Wall" and `queried_id` = 1416. Both are now correct per page — 75 distinct
titles and 75 distinct ids across the site — and the enquiry email leads with **Page** and **Page
URL**. The visible form is unchanged, and the configured subject is unchanged.

### 14. Cart / checkout test results

On the live site the Add To Cart button links to `/?add-to-cart=<id>`, which the server answers
**410 Gone** — the button is broken for every visitor, the cart is always empty and `/checkout/`
302s to `/cart/`. At your instruction the cart now works:

- clicks are handled client-side, the cart lives in `localStorage`, and the order is emailed by
  `/api/order` (Cash on delivery, the one gateway the store has enabled)
- the markup is WooCommerce's own classic cart / checkout / order-received markup, which the
  theme's stylesheets already style — nothing new was designed
- prices are re-read server-side from the catalogue, so a total cannot be tampered with
- direct hits on `?add-to-cart=` URLs still answer 410, keeping the status those URLs already have
  with search engines

**34/34 functional checks pass, three consecutive clean runs:** logo, six top-level menu items,
dropdown on hover, search modal, search results, mobile drawer, mobile submenu, product H1,
four-image gallery, gallery visibility after JS, four product tabs and tab switching, quote form
and its per-product attribution, reCAPTCHA widget, phone/email links, WhatsApp widget, live chat
script, form posting to this site, add to cart → cart page, cart contents, subtotal, quantity
update, proceed to checkout, order review, Cash on delivery, checkout validation, empty cart after
removal, 410 and 404 statuses, and zero JavaScript errors.

One real defect was found and fixed here: the cart page was loading WooCommerce's Blocks bundle,
which hydrates the cart panel with React against the Store API. With no Store API behind it, React
tore down the markup it found and left an empty container — a race a visitor sometimes lost. The
bundle and its inline config are gone; the hydrated markup is baked in and `cart.js` owns the
behaviour.

### 15. Desktop, tablet and mobile visual results

Full-page screenshots of both sites at four widths, animations frozen and lazy content scrolled
in. Because a 19,000px page accumulates sub-pixel rounding, each 400px band is aligned to its best
vertical offset before being compared — otherwise a page whose every row is identical but shifted
one pixel reports as 11% different.

| Width | Pages | Mean difference | Worst | Pixel-identical | Under 0.5% |
|---|---:|---:|---:|---:|---:|
| 1440 | 103 | 0.115% | 1.99% | 88 | 93 |
| 768 | 46 | 0.056% | 1.81% | 42 | 44 |
| 390 | 46 | 0.036% | 1.47% | 44 | 45 |
| 320 | 46 | 0.090% | 1.97% | 42 | 43 |

Every page above 1% was cropped and inspected. **All of it is WooCommerce's randomised "Related
products"** — same card design, same category label, same $0.20 price, four different products —
or images that had not finished lazy-loading in the *live* capture. There are no differences in
layout, typography, spacing, colour, menus, forms or responsive behaviour.

At 1440px all 103 pages were captured on both sides. Below 1440px the 34 non-product pages and a
spread of 12 products were screenshotted, and the remaining 57 product pages — which are rendered
by the same Elementor template — were still loaded and measured for horizontal overflow, so
overflow coverage is complete.

**Horizontal overflow at 320px and 390px is not zero, and is identical on both sides**: 25
measurements across 10 routes (the home page, the four `/page/N/` copies, and the five Elementor
pages), all traced to the theme's off-canvas drawer. Live and Astro match exactly — same routes,
same widths, same counts, no divergence in either direction. This is a pre-existing condition of
the WordPress site, reproduced faithfully. Fixing it is a design change and is therefore held for
the post-migration phase.

### 16. Tracking verification

Present and identical on all 105 pages: Google Ads **AW-16676761289** with its `page_view` event,
both Google Search Console verification tokens (`vf-H10hHWz2…` and the Google-for-WooCommerce
`X7awmBP608cc…`), the Joinchat WhatsApp widget with its per-page prefilled message, and the ZeeOps
live-chat widget. The Google Listings & Ads gtag-events script is on the same 98 pages as live.
The live site has no GA4 property and no Google Tag Manager container, so neither was invented.

### 17. Cutover simulation results

- **Zero missing essential assets** — 2,009 referenced, 2,009 shipped
- **Zero failed essential requests** — a full-site run in a real browser leaves only Google Ads /
  DoubleClick tracker calls, which fail identically on the live site
- **Zero JavaScript errors** across all 105 routes
- **Zero font failures** — 89 font files served from this site; the Elementor CSS that pointed at
  the old origin was rewritten
- **Zero WordPress runtime dependency** — no asset, inline script or JSON settings blob references
  `theburgerboxes.com/wp-*` any more; the check that proves this covers the whole document, not
  just attributes
- **`astro check`: 0 errors, 0 warnings, 0 hints**
- **Production build passes** — 106 pages
- **No secrets in the public build** — no SMTP password, reCAPTCHA secret, WordPress salt or
  database credential; session nonces are blanked
- **No `.wpress`, SQL, PHP or backup files in the output** — 4,365 files, none of those types

### 18. Remaining issues

**Blocking real-world completion**

1. **SMTP password** — needed to prove the quote forms and the order email actually deliver.
   Everything else is configured and in Vercel's environment.

**Deliberate deviations, all documented**

2. Quote-form attribution corrected per page (§13).
3. Cart page ships the hydrated Blocks markup instead of the loading skeleton, and the Blocks
   bundle is dropped (§14).
4. Add To Cart works; direct hits still answer 410 (§14).
5. `/checkout/` is a real page rather than a 302 to `/cart/`; it inherits the cart page's
   `noindex, follow`.
6. Cloudflare's email obfuscation is replaced by a plain `mailto:` link — the edge will not
   re-apply it. Post-JavaScript both show `info@theburgerboxes.com`.
7. Dropped from `<head>`: oEmbed discovery, the REST API `alternate` and `api.w.org` links,
   RSD/EditURI and `shortlink` — WordPress-runtime endpoints that would 404. The site feed and
   site comments feed links are kept and both feeds are served; per-post comment feeds are not
   reproduced.
8. Session-bound REST and AJAX nonces are blanked.
9. The product review form posts to a serverless `wp-comments-post.php` that emails the review to
   the store. WordPress held every submission for moderation — 557 in the backup, none ever
   approved — so nothing was ever published from it. The visitor no longer sees an inline
   "awaiting moderation" notice.
10. `/page/2/` through `/page/5/` are reproduced. The live site answers 200 for *any* `/page/N/`;
    nothing links to them and none is in the sitemap, so deeper numbers are not built.
11. Two cosmetic whitespace differences per page that no browser can see: `<html lang="en-US">`
    and `<head>` end up on one line, and the theme printed `<body class="…"  >` with two trailing
    spaces inside the tag, which Astro cannot emit.
12. Related products are frozen at the set captured during migration; WooCommerce reshuffles them
    per render.

**Found on the live site, preserved unchanged — for the SEO phase, not this one**

13. **Every product carries three different ratings at once.** The Elementor widget shows a
    hard-coded **4.7**; the JSON-LD claims `aggregateRating` **5 from 1 review**, authored by
    `shanimazhar82@gmail.com`, whose review text is the page's own meta description; the visible
    tab says **"Reviews (0)"**. All 69 products, identical pattern. Fabricated review schema of
    exactly this shape is what got zeecustomboxes.com suspended from Merchant Center.
14. Header and footer show `(503) 358-0443` but link to `tel:+1-929-2141-874`.
15. Several product descriptions contain pasted AI-tool UI markup — ChatGPT wrappers
    (`data-testid="conversation-turn-2"`, `class="markdown prose dark:prose-invert"`) and
    Perplexity table classes (`border-borderMain`, `dark:border-borderMainDark`).
16. 448 images have no alt text.
17. The product form's "Product" field lists **candle** products in its stored options, and the
    second email action's subject is `New message from "thetubepackaging.com"`. Both are inert —
    the field renders as a text input and only the first email action runs — and both were left
    as configured.
18. Horizontal overflow at 320/390px on 10 routes (§15).
19. `/YOUR-HERO-IMAGE.jpg` is requested on the home page by the third-party chat widget and 404s
    on the live site as well.
20. The GSC Performance export was never on disk, so URL coverage has not been cross-checked
    against impressions. The internal-link crawl found 16 URLs the sitemap misses, all preserved,
    so the risk is low — but send the file and I will confirm.

### 19. Production deployment recommendation

**Ready to cut over, once two things are done.**

The build reproduces the live site across every URL, product, category, image, form, metadata
element, responsive layout and interactive function that was audited: 0 missing URLs, 0 metadata
differences, 0 schema differences, 0 content differences that were not deliberate, 0 missing
assets, 0 JavaScript errors, and pixel differences that trace entirely to WooCommerce's own
randomisation. Three defects that would have shipped were caught by the audits and fixed — the
emoji bundle still loading from WordPress, the missing password-strength library, and the cart
page's Blocks bundle blanking itself.

Before connecting `theburgerboxes.com`:

1. **Send the SMTP app password** so I can prove the quote forms and order emails deliver. This is
   the one thing standing between the site and a clean bill of health — do not cut over on an
   unproven contact path.
2. **Approve the audit**, per your own instruction that the domain not be connected until you have.

At cutover: point DNS at Vercel, add `theburgerboxes.com` and `www.theburgerboxes.com` to the
project (the www → apex 301 is already configured), and confirm the production hostname does not
carry `X-Robots-Tag` — the noindex rule is scoped to `*.vercel.app` only.

I would then re-run the audit suite against the production hostname and, separately from this
migration, put items 13–18 in front of you as the first agenda for the SEO phase. Item 13 in
particular is a live Merchant Center risk today, not something the migration introduced.
