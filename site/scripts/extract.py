#!/usr/bin/env python3
"""Extract per-page data from the crawled live HTML into src/data/*.json.

Strict 1:1 migration: the live rendered HTML is the source of truth for markup.
Only WordPress-runtime artefacts that cannot exist on a static host are removed
(oembed, RSD/EditURI, wp-json discovery, shortlink, Cloudflare's email
obfuscation, session nonces). Everything visible -- markup, classes, inline
styles, CSS links, vendor JS, metadata, schema, tracking -- is carried across
byte-for-byte and served from this site's own /wp-content tree.
"""
import os, re, json, glob, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LIVE = os.environ.get("LIVE_DIR", os.path.join(ROOT, "..", "_migration", "live"))
OUT = os.path.join(ROOT, "src", "data")
SITE = "https://theburgerboxes.com"

# --------------------------------------------------------------- cloudflare
def _dec(hexstr):
    b = bytes.fromhex(hexstr)
    k = b[0]
    return "".join(chr(c ^ k) for c in b[1:])


def cf_decode(h):
    """Undo Cloudflare's edge email obfuscation and restore the real address:
    the edge will not re-apply it once the site moves off that proxy."""
    h = re.sub(
        r'<a([^>]*?)href="/cdn-cgi/l/email-protection#([0-9a-f]+)"([^>]*)>\s*<span[^>]*class="__cf_email__"[^>]*data-cfemail="[0-9a-f]+"[^>]*>.*?</span>\s*</a>',
        lambda m: '<a%shref="mailto:%s"%s>%s</a>' % (m.group(1), _dec(m.group(2)), m.group(3), _dec(m.group(2))),
        h, flags=re.S)
    h = re.sub(
        r'<a href="/cdn-cgi/l/email-protection"(?![^>]*href="mailto)[^>]*?data-cfemail="([0-9a-f]+)"[^>]*>.*?</a>',
        lambda m: _dec(m.group(1)), h, flags=re.S)
    h = re.sub(r'<span[^>]*class="__cf_email__"[^>]*data-cfemail="([0-9a-f]+)"[^>]*>.*?</span>',
               lambda m: _dec(m.group(1)), h, flags=re.S)
    h = re.sub(r'href="/cdn-cgi/l/email-protection#([0-9a-f]+)"',
               lambda m: 'href="mailto:%s"' % _dec(m.group(1)), h)
    h = re.sub(r'<script[^>]*src="/cdn-cgi/[^"]*"[^>]*>\s*</script>', '', h)
    return h


# --------------------------------------------------------------- head clean
DROP_TAG_PATTERNS = [
    r'<link[^>]*rel=["\']alternate["\'][^>]*type=["\']application/json\+oembed["\'][^>]*>',
    r'<link[^>]*rel=["\']alternate["\'][^>]*type=["\']text/xml\+oembed["\'][^>]*>',
    r'<link[^>]*rel=["\']https://api\.w\.org/["\'][^>]*>',
    r'<link[^>]*rel=["\']EditURI["\'][^>]*>',
    r'<link[^>]*rel=["\']wlwmanifest["\'][^>]*>',
    r'<link[^>]*rel=["\']shortlink["\'][^>]*>',
    r'<link[^>]*rel=["\']pingback["\'][^>]*>',
    # the REST API discovery link
    r'<link[^>]*rel=["\']alternate["\'][^>]*type=["\']application/json["\'][^>]*>',
    # per-post comment feeds are not reproduced (there is no comment backend).
    # The site feed and the site comments feed are, and their links are kept:
    # their titles are exactly "... &raquo; Feed" and "... &raquo; Comments Feed",
    # while a post's is "... &raquo; <post title> Comments Feed".
    r'<link[^>]*rel=["\']alternate["\'][^>]*type=["\']application/rss\+xml["\'][^>]*title=["\'][^"\']*&raquo; .+? Comments Feed["\'][^>]*>',
]

# Absolute references to the old host's asset tree become root-relative so
# nothing -- markup, inline script config, or a JSON settings block a script
# reads a URL out of -- is ever fetched from the WordPress host. Structured data
# and metadata are exempt: canonicals, og:image and schema URLs have to keep
# naming the production domain.
ASSET_ORIGIN = re.compile(r'https://theburgerboxes\.com(/(?:wp-content|wp-includes|wp-admin)/)')
ASSET_ORIGIN_ESC = re.compile(r'https:\\/\\/theburgerboxes\.com(\\/(?:wp-content|wp-includes|wp-admin)\\/)')
# EAEL prints its plugin directory without a trailing slash
ASSET_ORIGIN_BARE = re.compile(r'https://theburgerboxes\.com(/wp-content/plugins)(?![\w-])')
PROTECTED = re.compile(
    r'(?s)(<script[^>]*application/ld\+json[^>]*>.*?</script>'
    r'|<meta\b[^>]*>'
    r'|<link\b[^>]*rel=["\']canonical["\'][^>]*>)')


def localise_assets(h):
    parts = PROTECTED.split(h)
    for i in range(0, len(parts), 2):
        chunk = parts[i]
        chunk = ASSET_ORIGIN.sub(r'\1', chunk)
        chunk = ASSET_ORIGIN_ESC.sub(r'\1', chunk)
        chunk = ASSET_ORIGIN_BARE.sub(r'\1', chunk)
        parts[i] = chunk
    return ''.join(parts)


NONCE_RE = re.compile(r'"nonce":"[0-9a-f]+"')


def strip_secrets(h):
    """Session-bound WordPress nonces are dead tokens off WordPress; blank them
    rather than publishing them."""
    h = NONCE_RE.sub('"nonce":""', h)
    h = re.sub(r'"rest_nonce":"[0-9a-f]+"', '"rest_nonce":""', h)
    h = re.sub(r'(<input[^>]*name="(?:_wpnonce|[\w-]*[-_]nonce)"[^>]*value=")[^"]*(")', r'\1\2', h)
    h = re.sub(r'(createNonceMiddleware\(\s*")[0-9a-f]+(")', r'\1\2', h)
    h = re.sub(r'("storeApiNonce"\s*:\s*")[0-9a-f]+(")', r'\1\2', h)
    return h


def clean(h):
    h = cf_decode(h)
    for p in DROP_TAG_PATTERNS:
        h = re.sub(p, "", h, flags=re.I)
    h = localise_assets(h)
    h = strip_secrets(h)
    return h


# ------------------------------------------------------------------ slicing
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}


def slice_element(h, start_re, tag):
    m = re.search(start_re, h)
    if not m:
        return None
    i = m.start()
    depth, pos = 0, i
    open_re = re.compile(r"<(/?)(%s)\b[^>]*?(/?)>" % tag, re.I)
    while True:
        mm = open_re.search(h, pos)
        if not mm:
            return None
        pos = mm.end()
        if mm.group(3) == "/" or mm.group(2).lower() in VOID:
            continue
        depth += -1 if mm.group(1) else 1
        if depth == 0:
            return h[i:mm.end()]


def slice_between(h, start_marker, end_marker):
    i = h.find(start_marker)
    if i < 0:
        return None
    j = h.find(end_marker, i)
    if j < 0:
        return None
    return h[i:j + len(end_marker)]


# Pages WordPress serves that are not addressed by a normal permalink.
SPECIAL_ROUTES = {"_404": "/404/", "_search": "/?s="}


def route_for(slug):
    if slug == "__home__":
        return "/"
    if slug in SPECIAL_ROUTES:
        return SPECIAL_ROUTES[slug]
    return "/" + slug.replace("__", "/") + "/"


TAG_SPLIT = re.compile(r"(<[^>]+>)")
CHROME_KEYS = ("header", "offcanvas", "footer")
SKIP_FILES = {"checkout.html"}   # 302 -> /cart/ on the live site; a redirect, not a page


def tokenize(h):
    return TAG_SPLIT.split(h or "")


def tag_overrides(baseline_tokens, page_html):
    toks = tokenize(page_html)
    if len(toks) != len(baseline_tokens):
        return None
    return {str(i): t for i, (t, b) in enumerate(zip(toks, baseline_tokens)) if t != b}


# Elementor caches the form's hidden attribution fields into the *template*, so
# every product page on the live site submits the same stale referer_title
# ("Custom Coffee Cups with Lids...") and the same queried_id. The visible form
# is untouched; the two hidden values are corrected per page so an enquiry
# identifies the product it came from.
def fix_form_attribution(raw, slug):
    m = re.search(r"<title>(.*?)</title>", raw, re.S)
    title = m.group(1).strip() if m else ""
    b = re.search(r'<body class="([^"]*)"', raw)
    classes = b.group(1) if b else ""
    pid = re.search(r"\b(?:postid|page-id|post-id)-(\d+)\b", classes)
    raw = re.sub(r'(<input type="hidden" name="referer_title" value=")[^"]*(")',
                 lambda mm: mm.group(1) + title.replace('"', "&quot;") + mm.group(2), raw)
    if pid:
        raw = re.sub(r'(<input type="hidden" name="queried_id" value=")\d*(")',
                     lambda mm: mm.group(1) + pid.group(1) + mm.group(2), raw)
    return raw


CART_BLOCK = os.path.join(OUT, "cart-block.html")


def splice_cart_block(h):
    """The cart page ships a WooCommerce Blocks skeleton that only becomes the
    real panel once the Blocks bundle hydrates it against the Store API. With no
    WordPress behind it the skeleton would be all a visitor ever sees, so the
    hydrated markup captured from the live page is baked in; cart.js then
    swaps in the filled-cart table when there is something in the cart."""
    if 'wp-block-woocommerce-cart' not in h or not os.path.exists(CART_BLOCK):
        return h
    el = slice_element(h, r'<div data-block-name="woocommerce/cart"', "div")
    if not el:
        return h
    return h.replace(el, open(CART_BLOCK, encoding="utf-8").read())


def read_page(f):
    slug = os.path.basename(f)[:-5]
    raw = clean(open(f, encoding="utf-8", errors="replace").read())
    # the search-modal key is randomised on every render; pin it
    raw = re.sub(r'data-modal-key="\d+"', 'data-modal-key="tbb-search"', raw)
    raw = fix_form_attribution(raw, slug)
    parts = {
        "header": slice_element(raw, r'<header id="header"', "header"),
        "offcanvas": slice_element(raw, r'<div id="rishi-offcanvas"', "div"),
        "footer": slice_element(raw, r'<footer class="rishi-footer"', "footer"),
        "joinchat": slice_element(raw, r'<div class="joinchat joinchat--', "div"),
        "skip": slice_between(raw, '<a class="skip-link', "</a>"),
        "content": slice_between(raw, '<div class="site-content"', "</div><!-- .site-content -->"),
    }
    b = raw.find(">", raw.find("<body")) + 1
    parts["bodyOpen"] = raw[b:raw.find('<div id="main-container"')]
    t = raw.find("</div><!-- #page -->")
    parts["bodyTail"] = raw[t + len("</div><!-- #page -->"):raw.rfind("</body>")]
    for k in CHROME_KEYS + ("joinchat", "content", "skip"):
        assert parts[k], "%s: missing %s" % (slug, k)
    return slug, raw, parts


def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob(os.path.join(LIVE, "*.html")))
    files = [f for f in files if os.path.basename(f) not in SKIP_FILES
             and os.path.getsize(f) > 5000]
    parsed = [read_page(f) for f in files]

    # the shop page carries no active top-level menu state -> cleanest baseline
    base = next(p for p in parsed if p[0] == "products")
    chrome = {"skip": base[2]["skip"]}
    for k in CHROME_KEYS:
        chrome[k] = base[2][k]
    chrome["joinchat"] = re.sub(r"data-settings='[^']*'", "data-settings='%%JC%%'",
                                base[2]["joinchat"])
    base_tokens = {k: tokenize(chrome[k]) for k in CHROME_KEYS}

    pages, unsplittable = {}, []
    for slug, raw, parts in parsed:
        head = raw[raw.find("<head>") + 6: raw.find("</head>")]
        bodym = re.search(r"<body class=\"([^\"]*)\"", raw)
        jc = re.search(r"<div class=\"joinchat[^\"]*\"[^>]*data-settings='([^']*)'", raw)

        chrome_diff = {}
        for k in CHROME_KEYS:
            d = tag_overrides(base_tokens[k], parts[k])
            if d is None:
                unsplittable.append((slug, k))
            elif d:
                chrome_diff[k] = d

        pages[slug] = {
            "slug": slug,
            "route": route_for(slug),
            "url": SITE + route_for(slug),
            "bodyClass": bodym.group(1) if bodym else "",
            "head": head,
            "content": splice_cart_block(parts["content"]),
            "joinchatSettings": jc.group(1) if jc else "",
            "chromeDiff": chrome_diff,
            "bodyOpen": parts["bodyOpen"],
            "bodyTail": parts["bodyTail"].replace(parts["joinchat"], "<!--JOINCHAT-->"),
        }

    json.dump(pages, open(os.path.join(OUT, "pages.json"), "w"), indent=1)
    json.dump(chrome, open(os.path.join(OUT, "chrome.json"), "w"), indent=1)
    print("pages:", len(pages))
    for k in ("header", "offcanvas", "footer", "joinchat", "skip"):
        print("  chrome.%s: %d bytes" % (k, len(chrome[k] or "")))
    print("  structural mismatches:", unsplittable or "none")
    print("  max chrome overrides on a page:",
          max(sum(len(v) for v in p["chromeDiff"].values()) for p in pages.values()))


if __name__ == "__main__":
    main()
