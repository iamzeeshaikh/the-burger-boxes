#!/usr/bin/env python3
"""Field-by-field comparison of every URL, from the HTML each side serves.

Complements compare.py (which compares the post-JavaScript DOM on a sample):
this one covers all 103 URLs and every field the audit asks for -- title,
description, canonical, robots, OG/Twitter, headings, visible text and its
order, internal links, images and alt text, schema, forms and their fields,
body classes and tracking.
"""
import os, re, sys, json, glob, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import clean
from compare import parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE = os.path.join(ROOT, '..', '_migration', 'live')
DIST = os.path.join(ROOT, 'dist')
LIVE_HOST = 'https://theburgerboxes.com'

pages = json.load(open(os.path.join(ROOT, 'src', 'data', 'pages.json')))

# Fields where a difference is expected and documented.
EXPECTED = {
    'forms': 'the two hidden attribution inputs (referer_title, queried_id) are '
             'corrected per page; Elementor had cached one stale value into the '
             'shared product template',
    'scripts': "Cloudflare's email-decode shim is gone (the address is written into "
               'the markup instead) and /assets/cart.js is added',
}
CART_NOTE = ('the WooCommerce Blocks loading skeleton is replaced with the hydrated '
             'markup captured from the live rendered DOM')


def built_path(route):
    if route == '/404/':
        return os.path.join(DIST, '404.html')
    if route == '/':
        return os.path.join(DIST, 'index.html')
    return os.path.join(DIST, route.strip('/'), 'index.html')


report, counts, compared = {}, collections.Counter(), 0
for slug, page in sorted(pages.items()):
    if slug == '_search':
        continue
    live_file = os.path.join(LIVE, slug + '.html')
    built_file = built_path(page['route'])
    if not os.path.exists(live_file) or not os.path.exists(built_file):
        report[slug] = {'MISSING': {'live': os.path.exists(live_file),
                                    'astro': os.path.exists(built_file)}}
        continue
    compared += 1
    a = parse(clean(open(live_file, encoding='utf-8', errors='replace').read()), LIVE_HOST)
    b = parse(open(built_file, encoding='utf-8', errors='replace').read(), LIVE_HOST)
    diffs = {}
    for key in a:
        if a[key] == b[key]:
            continue
        note = CART_NOTE if slug == 'cart' else EXPECTED.get(key)
        diffs[key] = {'expected': note, 'live': a[key], 'astro': b[key]}
        counts[key + (' (expected)' if note else '')] += 1
    if diffs:
        report[slug] = diffs

json.dump(report, open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    'compare-served.json'), 'w'), indent=1, default=str)
print('URLs compared:', compared)
print('URLs with any difference:', len(report))
for k, v in counts.most_common():
    print('  %-26s %d URLs' % (k, v))
unexpected = {s: {k: v for k, v in d.items() if not v.get('expected')}
              for s, d in report.items()}
unexpected = {s: d for s, d in unexpected.items() if d and s != 'cart'}
print('URLs with an UNEXPECTED difference:', len(unexpected))
for s, d in list(unexpected.items())[:6]:
    print('  ', s, list(d))
