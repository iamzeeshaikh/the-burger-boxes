#!/usr/bin/env python3
"""Byte-level diff of every built page against the crawled live HTML.

Both sides go through the same normalisation the migration applies (Cloudflare
email decoding, local asset paths, blanked nonces, pinned search-modal key), so
what remains is a genuine difference in output.
"""
import os, re, sys, glob, difflib, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import clean, route_for

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE = os.path.join(ROOT, '..', '_migration', 'live')
DIST = os.path.join(ROOT, os.environ.get('DIST', 'dist'))

def live_html(slug):
    h = clean(open(os.path.join(LIVE, slug + '.html'), encoding='utf-8', errors='replace').read())
    h = re.sub(r'data-modal-key="\d+"', 'data-modal-key="tbb-search"', h)
    # LiteSpeed stamps a cache footer after </html>
    h = re.sub(r'(?s)\n*<!-- Page supported by LiteSpeed Cache.*?-->\s*$', '', h)
    return h

# 404 is emitted as dist/404.html; /?s= is rendered at request time by
# api/search.js and is compared by scripts/audit-search.mjs instead.
SPECIAL_BUILT = {'/404/': '404.html'}
SKIP_SLUGS = {'_search'}


def built_html(route):
    if route in SPECIAL_BUILT:
        p = os.path.join(DIST, SPECIAL_BUILT[route])
    elif route == '/':
        p = os.path.join(DIST, 'index.html')
    else:
        p = os.path.join(DIST, route.strip('/'), 'index.html')
    return open(p, encoding='utf-8', errors='replace').read() if os.path.exists(p) else None

IGNORE = [
    # doctype / html / head indentation the theme emitted, and the cart script
    # this build adds; neither changes the DOM.
    re.compile(r'^[+-]\s*<!DOCTYPE html>$', re.I),
    re.compile(r'^[+-]\s*<html lang="en-US">$'),
    re.compile(r'^[+-]\s*<head>$'),
    # <body class="..."  > -- the theme printed two trailing spaces inside the
    # tag; Astro cannot emit them and the DOM is unaffected.
    re.compile(r'^[+-]<body class="'),
    re.compile(r'^[+-].*assets/cart\.js'),
]

# Deliberate, documented deviations rather than migration defects.
INTENDED = [
    re.compile(r'^[+-]\s*<input type="hidden" name="referer_title"'),
    re.compile(r'^[+-]\s*<input type="hidden" name="queried_id"'),
]

def main():
    pages = json.load(open(os.path.join(ROOT, 'src', 'data', 'pages.json')))
    total = 0
    intended_total = [0]
    report = {}
    for slug, page in sorted(pages.items()):
        if slug in SKIP_SLUGS:
            continue
        a = live_html(slug).split('\n')
        b = built_html(page['route'])
        if b is None:
            report[slug] = ['MISSING BUILT PAGE']; total += 1; continue
        b = b.split('\n')
        d = [l for l in difflib.unified_diff(a, b, lineterm='', n=0)
             if l[:1] in '+-' and not l.startswith(('---', '+++'))
             and not any(p.match(l) for p in IGNORE)]
        intended = [l for l in d if any(p.match(l) for p in INTENDED)]
        d = [l for l in d if l not in intended]
        # the blank lines between the two hidden inputs move with them
        if intended and d:
            d = [l for l in d if l.strip() not in ('+', '-')]
        if intended:
            intended_total[0] += len(intended)
        if d:
            report[slug] = d
            total += len(d)
    print('pages with unexplained differences:', len(report), ' total diff lines:', total)
    print('intended form-attribution diff lines:', intended_total[0])
    for slug, d in list(report.items())[:8]:
        print('=====', slug, len(d))
        for l in d[:12]:
            print('   ', l[:220])
    json.dump({k: v for k, v in report.items()}, open(os.path.join(ROOT, 'scripts', 'bytediff.json'), 'w'), indent=1)

if __name__ == '__main__':
    main()
