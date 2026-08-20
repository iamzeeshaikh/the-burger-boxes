#!/usr/bin/env python3
"""Generate the routing rules -- redirects, rewrites, headers -- into
src/data/*.json (used by the local QA server) and vercel.json (used in
production), from one source of truth.

Every rule reproduces behaviour the live WordPress site has today:
  * WordPress' own old-slug redirects (wp_old_slug_redirect)
  * the /products/page/1/ -> /products/ redirect
  * WooCommerce's customer-logout redirect
  * the mixed-case product-category URLs the product copy links to, which
    WordPress answers 200 with the lower-case page's content
  * the .htaccess rule that returns 410 Gone for any add-to-cart URL
  * the feeds, served from their captured XML
"""
import os, json, sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = 'https://theburgerboxes.com'
con = sqlite3.connect(os.path.join(ROOT, '..', '_wpress', 'db.sqlite'))

redirects = {}

# WordPress keeps every previous slug and 301s it to the current permalink.
for post_type, current, old in con.execute(
        "SELECT p.post_type, p.post_name, m.meta_value FROM postmeta m "
        "JOIN posts p ON p.ID=m.post_id WHERE m.meta_key='_wp_old_slug'"):
    base = '/product/' if post_type == 'product' else '/'
    redirects['%s%s/' % (base, old)] = {'to': '%s%s%s/' % (SITE, base, current), 'status': 301}

redirects['/products/page/1/'] = {'to': SITE + '/products/', 'status': 301}
redirects['/my-account/customer-logout/'] = {'to': SITE + '/my-account/', 'status': 302}

# Product copy links these with the wrong case; WordPress serves the category
# page and canonicalises to the lower-case URL.
MIXED_CASE = ['Boxes-By-Material', 'Boxes-By-Type', 'Boxes-By-Customization', 'boxes-by-Color']
rewrites = {}
for slug in MIXED_CASE:
    rewrites['/product-category/%s/' % slug] = '/product-category/%s/' % slug.lower()
rewrites['/feed/'] = '/feed.xml'
rewrites['/comments/feed/'] = '/comments-feed.xml'

json.dump(redirects, open(os.path.join(ROOT, 'src', 'data', 'redirects.json'), 'w'), indent=1)
json.dump(rewrites, open(os.path.join(ROOT, 'src', 'data', 'rewrites.json'), 'w'), indent=1)

vercel = {
    '$schema': 'https://openapi.vercel.sh/vercel.json',
    'buildCommand': 'astro build',
    'outputDirectory': 'dist',
    'trailingSlash': True,
    'redirects': [
        {'source': '/(.*)', 'has': [{'type': 'host', 'value': 'www.theburgerboxes.com'}],
         'destination': SITE + '/$1', 'permanent': True},
    ] + [
        {'source': src.rstrip('/'), 'destination': cfg['to'], 'permanent': cfg['status'] == 301}
        for src, cfg in sorted(redirects.items())
    ],
    'rewrites': [
        # WooCommerce add-to-cart URLs answer 410 Gone, as .htaccess does today.
        {'source': '/:path*', 'has': [{'type': 'query', 'key': 'add-to-cart'}],
         'destination': '/api/gone'},
        # WordPress' search results
        {'source': '/', 'has': [{'type': 'query', 'key': 's'}], 'destination': '/api/search'},
        {'source': '/page/:n(\\d+)', 'has': [{'type': 'query', 'key': 's'}],
         'destination': '/api/search'},
        # Elementor Pro's form endpoint
        {'source': '/wp-admin/admin-ajax.php', 'destination': '/api/admin-ajax'},
    ] + [
        {'source': src.rstrip('/'), 'destination': dest} for src, dest in sorted(rewrites.items())
    ],
    'headers': [
        {'source': '/(.*)',
         'has': [{'type': 'host', 'value': '.*\\.vercel\\.app'}],
         'headers': [{'key': 'X-Robots-Tag', 'value': 'noindex, nofollow'}]},
        {'source': '/feed/', 'headers': [
            {'key': 'Content-Type', 'value': 'application/rss+xml; charset=UTF-8'}]},
        {'source': '/comments/feed/', 'headers': [
            {'key': 'Content-Type', 'value': 'application/rss+xml; charset=UTF-8'}]},
    ],
}
json.dump(vercel, open(os.path.join(ROOT, 'vercel.json'), 'w'), indent=2)
print('redirects:', len(redirects), ' rewrites:', len(rewrites))
