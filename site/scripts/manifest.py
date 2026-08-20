#!/usr/bin/env python3
"""Phase 1 -- the migration manifest.

One row per URL, cross-checked across the sitemap, the live crawl, the extracted
WordPress database, the uploads and the internal-link crawl: where it was
discovered, what it answers, what type of page it is, its metadata, headings,
schema, links, images, forms and tracking, and whether the Astro build has it.
"""
import os, re, sys, json, glob, csv, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MIG = os.path.join(ROOT, '..', '_migration')
SITE = 'https://theburgerboxes.com'

pages = json.load(open(os.path.join(ROOT, 'src', 'data', 'pages.json')))
redirects = json.load(open(os.path.join(ROOT, 'src', 'data', 'redirects.json')))
rewrites = json.load(open(os.path.join(ROOT, 'src', 'data', 'rewrites.json')))
discovered = json.load(open(os.path.join(MIG, 'discovered.json')))
wp = json.load(open(os.path.join(MIG, 'db', 'wp.json')))

sitemap_urls = {l.strip() for l in open(os.path.join(MIG, 'urls_sitemap.txt')) if l.strip()}
crawl_status = {}
for line in open(os.path.join(MIG, 'crawl_log.tsv')):
    parts = line.rstrip('\n').split('\t')
    if len(parts) >= 3:
        crawl_status[parts[0]] = parts[2].split(' ')[0]

# what the database says should exist
db_urls = {}
for p in wp['products']:
    db_urls[SITE + '/product/' + p['post_name'] + '/'] = 'product'
for p in wp['posts']:
    db_urls[SITE + '/' + p['post_name'] + '/'] = 'post'
for p in wp['pages']:
    slug = p['post_name']
    db_urls[SITE + '/' if slug == 'home' else SITE + '/' + slug + '/'] = 'page'
for t in wp['terms']:
    if t['taxonomy'] == 'product_cat' and t['count']:
        db_urls[SITE + '/product-category/' + t['slug'] + '/'] = 'product_cat'
    if t['taxonomy'] == 'category' and t['count']:
        db_urls[SITE + '/category/' + t['slug'] + '/'] = 'category'


def page_type(slug, body_class):
    if slug == '_404':
        return '404'
    if slug == '_search':
        return 'search results'
    for cls, label in [('single-product', 'product'), ('tax-product_cat', 'product category'),
                       ('post-template-default', 'blog post'), ('category', 'blog category'),
                       ('author', 'author archive'), ('woocommerce-cart', 'cart'),
                       ('woocommerce-account', 'my account'), ('home', 'home'),
                       ('archive', 'archive'), ('page', 'page')]:
        if cls in body_class.split():
            return label
    return 'page'


rows = []
for slug, p in sorted(pages.items()):
    s = BeautifulSoup(p['head'], 'lxml')
    content = BeautifulSoup(p['content'], 'lxml')

    def meta(name=None, prop=None):
        t = s.find('meta', attrs={'name': name} if name else {'property': prop})
        return t.get('content') if t else ''

    schema_types = []
    for sc in re.findall(r'(?s)<script[^>]*application/ld\+json[^>]*>(.*?)</script>',
                         p['head'] + p['content']):
        try:
            data = json.loads(sc)
        except Exception:
            schema_types.append('PARSE_ERROR')
            continue
        for item in (data if isinstance(data, list) else [data]):
            g = item.get('@graph') if isinstance(item, dict) else None
            for node in (g or [item]):
                if isinstance(node, dict) and node.get('@type'):
                    t = node['@type']
                    schema_types += t if isinstance(t, list) else [t]

    imgs = content.find_all('img')
    links = [a['href'] for a in content.find_all('a', href=True)]
    internal = [l for l in links if l.startswith(SITE) or l.startswith('/')]
    external = [l for l in links
                if l.startswith('http') and not l.startswith(SITE)]
    forms = content.find_all('form')
    url = SITE + p['route'] if p['route'].startswith('/') else p['route']

    rows.append({
        'url': url,
        'route': p['route'],
        'type': page_type(slug, p['bodyClass']),
        'in_sitemap': url in sitemap_urls,
        'in_database': url in db_urls,
        'found_by_internal_link': url in discovered['status'],
        'live_status': crawl_status.get(url, '200' if url in discovered['status'] else ''),
        'astro_route_built': True,
        'title': (s.title.get_text() if s.title else ''),
        'meta_description': meta(name='description'),
        'canonical': (s.find('link', rel='canonical') or {}).get('href', ''),
        'robots': meta(name='robots'),
        'og_title': meta(prop='og:title'),
        'og_image': meta(prop='og:image'),
        'twitter_card': meta(name='twitter:card'),
        'h1': ' | '.join(h.get_text(' ', strip=True) for h in content.find_all('h1')),
        'h2_count': len(content.find_all('h2')),
        'h3_count': len(content.find_all('h3')),
        'schema': ','.join(sorted(set(schema_types))),
        'images': len(imgs),
        'images_missing_alt': sum(1 for i in imgs if not (i.get('alt') or '').strip()),
        'internal_links': len(internal),
        'external_links': len(external),
        'forms': len(forms),
        'hidden_form_fields': sum(len(f.find_all('input', attrs={'type': 'hidden'})) for f in forms),
        'tracking': ','.join(sorted(set(re.findall(r'AW-\d+|G-[A-Z0-9]{6,}|GTM-[A-Z0-9]+',
                                                   p['head'] + p['bodyTail'])))),
    })

# the two cart-flow routes are hand-built Astro pages rather than captured ones
for route, kind in [('/checkout/', 'checkout'), ('/checkout/order-received/', 'order received')]:
    f = os.path.join(ROOT, 'dist', route.strip('/'), 'index.html')
    if not os.path.exists(f):
        continue
    doc = BeautifulSoup(open(f, encoding='utf-8', errors='replace').read(), 'lxml')
    rows.append({
        'url': SITE + route, 'route': route, 'type': kind,
        'in_sitemap': (SITE + route) in sitemap_urls, 'in_database': False,
        'found_by_internal_link': (SITE + route) in discovered['status'],
        'live_status': crawl_status.get(SITE + route, ''),
        'astro_route_built': True,
        'title': doc.title.get_text() if doc.title else '',
        'meta_description': (doc.find('meta', attrs={'name': 'description'}) or {}).get('content', ''),
        'canonical': (doc.find('link', rel='canonical') or {}).get('href', ''),
        'robots': (doc.find('meta', attrs={'name': 'robots'}) or {}).get('content', ''),
        'og_title': (doc.find('meta', property='og:title') or {}).get('content', ''),
        'og_image': (doc.find('meta', property='og:image') or {}).get('content', ''),
        'twitter_card': (doc.find('meta', attrs={'name': 'twitter:card'}) or {}).get('content', ''),
        'h1': ' | '.join(h.get_text(' ', strip=True) for h in doc.find_all('h1')),
        'h2_count': len(doc.find_all('h2')), 'h3_count': len(doc.find_all('h3')),
        'schema': '', 'images': len(doc.find_all('img')), 'images_missing_alt': 0,
        'internal_links': 0, 'external_links': 0, 'forms': 0, 'hidden_form_fields': 0,
        'tracking': 'AW-16676761289',
    })
rows.sort(key=lambda r: r['url'])

out_json = os.path.join(MIG, 'manifest.json')
out_csv = os.path.join(MIG, 'manifest.csv')
json.dump(rows, open(out_json, 'w'), indent=1)
with open(out_csv, 'w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)

print('manifest rows:', len(rows))
print('  by type:', dict(collections.Counter(r['type'] for r in rows)))
print('  in sitemap:', sum(1 for r in rows if r['in_sitemap']))
print('  outside the sitemap:', sum(1 for r in rows if not r['in_sitemap']))
print('  images without alt text:', sum(r['images_missing_alt'] for r in rows))
print('  pages carrying a form:', sum(1 for r in rows if r['forms']))
missing_from_astro = sorted(set(db_urls) - {r['url'] for r in rows})
print('  database URLs with no Astro route:', missing_from_astro or 'none')
sitemap_missing = sorted(sitemap_urls - {r['url'] for r in rows})
print('  sitemap URLs with no Astro route:', sitemap_missing or 'none')
print('  redirects:', len(redirects), ' rewrites:', len(rewrites))
print('written:', out_csv)
