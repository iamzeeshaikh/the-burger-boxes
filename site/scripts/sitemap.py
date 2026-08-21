#!/usr/bin/env python3
"""Build /sitemap.xml as one flat sitemap listing every URL.

Yoast published an index that pointed at six child sitemaps. The URLs and their
lastmod values are taken from those children verbatim, so nothing about what is
listed changes -- only that a crawler now finds all of it in one file.

The child sitemaps stay where they are: they are live URLs today and removing
them would 404 addresses search engines already know.
"""
import os, re, glob, html
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PUB = os.path.join(ROOT, 'public')
CHILDREN = ['post', 'page', 'product', 'category', 'product_cat', 'author']

URL_RE = re.compile(r'(?s)<url>(.*?)</url>')
LOC_RE = re.compile(r'<loc>(.*?)</loc>')
MOD_RE = re.compile(r'<lastmod>(.*?)</lastmod>')
IMG_RE = re.compile(r'(?s)<image:image>.*?</image:image>')

entries = {}
order = []
for name in CHILDREN:
    path = os.path.join(PUB, '%s-sitemap.xml' % name)
    if not os.path.exists(path):
        print('  missing child sitemap:', name)
        continue
    body = open(path, encoding='utf-8').read()
    found = 0
    for block in URL_RE.findall(body):
        loc = LOC_RE.search(block)
        if not loc:
            continue
        url = html.unescape(loc.group(1).strip())
        mod = MOD_RE.search(block)
        found += 1
        if url in entries:
            # /products/ is listed by both the page and product sitemaps; keep
            # the newer lastmod rather than dropping one silently
            if mod and (not entries[url] or mod.group(1) > entries[url]):
                entries[url] = mod.group(1)
            continue
        entries[url] = mod.group(1).strip() if mod else None
        order.append(url)
    print('  %-12s %3d urls' % (name, found))

out = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<?xml-stylesheet type="text/xsl" href="/wp-content/plugins/wordpress-seo/css/main-sitemap.xsl"?>',
       '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for url in order:
    out.append('\t<url>')
    out.append('\t\t<loc>%s</loc>' % escape(url))
    if entries[url]:
        out.append('\t\t<lastmod>%s</lastmod>' % escape(entries[url]))
    out.append('\t</url>')
out.append('</urlset>')
out.append('')

open(os.path.join(PUB, 'sitemap.xml'), 'w', encoding='utf-8').write('\n'.join(out))
print('sitemap.xml: %d unique urls' % len(order))
