#!/usr/bin/env python3
"""Every internal link in the built output, resolved against what the
deployment actually serves: a built page, a redirect, a rewrite, a static file
or the add-to-cart 410. Anything left over is a broken link."""
import os, re, sys, json, glob, collections
from urllib.parse import urlparse, unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
SITE = 'https://theburgerboxes.com'

redirects = json.load(open(os.path.join(ROOT, 'src', 'data', 'redirects.json')))
rewrites = json.load(open(os.path.join(ROOT, 'src', 'data', 'rewrites.json')))

def exists(path):
    p = path.lstrip('/')
    if os.path.isfile(os.path.join(DIST, p)):
        return True
    if os.path.isfile(os.path.join(DIST, p, 'index.html')):
        return True
    return False

broken = collections.defaultdict(set)
total = 0
for f in glob.glob(os.path.join(DIST, '**', '*.html'), recursive=True):
    rel = os.path.relpath(f, DIST)
    body = open(f, encoding='utf-8', errors='replace').read()
    for m in re.finditer(r'<a\b[^>]*href="([^"]+)"', body):
        href = m.group(1).strip()
        if href.startswith(('mailto:', 'tel:', 'javascript:', '#', 'data:')):
            continue
        u = urlparse(href)
        if u.netloc and u.netloc not in ('theburgerboxes.com', 'www.theburgerboxes.com'):
            continue
        total += 1
        path = unquote(u.path) or '/'
        if 'add-to-cart=' in (u.query or ''):
            continue                      # answered 410 Gone, as on the live site
        if u.query and 's=' in u.query and (path == '/' or re.match(r'^/page/\d+/$', path)):
            continue                      # search results, rendered at request time
        if path in redirects or path in rewrites:
            continue
        if path.rstrip('/') + '/' in redirects:
            continue
        if not exists(path):
            broken[path].add(rel)

print('internal links checked:', total)
print('broken internal link targets:', len(broken))
for path, sources in sorted(broken.items()):
    print('  %-58s from %d page(s): %s' % (path, len(sources), ', '.join(sorted(sources)[:3])))
