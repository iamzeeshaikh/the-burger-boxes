#!/usr/bin/env python3
"""Build the Google Merchant Center feed data.

Item ids come from the Merchant Center export so the products keep the
identities Google already has history against (gla_<post id>). Everything else
-- title, price, availability, link, images, product type -- is read from the
WooCommerce tables, so the feed cannot drift from the site.

Products the store marked "don't sync and show" in Google Listings & Ads stay
out, exactly as they are out of the current feed.
"""
import os, re, csv, json, html, sys

csv.field_size_limit(10 ** 7)
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MIG = os.path.join(ROOT, '..', '_migration')
SITE = 'https://theburgerboxes.com'
BRAND = 'The Burger Boxes'
SHIP_COUNTRIES = ['US', 'GB', 'AU', 'CA']
MAX_DESCRIPTION = 5000          # Merchant Center limit
MAX_EXTRA_IMAGES = 10           # Merchant Center limit

wp = json.load(open(os.path.join(MIG, 'db', 'wp.json')))
att = wp['attachments']

export = {}
export_path = os.path.join(MIG, 'gmc', 'products-export.tsv')
if os.path.exists(export_path):
    for row in csv.DictReader(open(export_path, encoding='utf-8-sig'), delimiter='\t'):
        export[row['id'].replace('gla_', '')] = row


def image_url(aid):
    a = att.get(str(aid))
    if not a or not a.get('file'):
        return None
    return SITE + '/wp-content/uploads/' + a['file']


TAGS = re.compile(r'(?s)<[^>]+>')
SPACE = re.compile(r'[ \t]+')


def plain(markup):
    """Merchant Center wants plain text; keep paragraph breaks, drop markup."""
    text = re.sub(r'(?s)<(script|style).*?</\1>', ' ', markup or '')
    text = re.sub(r'(?i)</(p|div|h[1-6]|li|tr)>', '\n', text)
    text = re.sub(r'(?i)<br\s*/?>', '\n', text)
    text = TAGS.sub('', text)
    text = html.unescape(text)
    text = SPACE.sub(' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = '\n'.join(line.strip() for line in text.split('\n'))
    return text.strip()[:MAX_DESCRIPTION]


items, skipped = [], []
for p in sorted(wp['products'], key=lambda x: int(x['ID'])):
    pid = str(p['ID'])
    meta = p['meta']
    if meta.get('_wc_gla_visibility') == 'dont-sync-and-show':
        skipped.append((pid, p['post_title'], 'excluded in Google Listings & Ads'))
        continue
    price = meta.get('_price')
    if not price:
        skipped.append((pid, p['post_title'], 'no price'))
        continue

    gallery = [g for g in (meta.get('_product_image_gallery') or '').split(',') if g]
    extra = [u for u in (image_url(g) for g in gallery) if u][:MAX_EXTRA_IMAGES]
    main = image_url(meta.get('_thumbnail_id'))
    if not main and extra:
        main, extra = extra[0], extra[1:]
    cats = [t['name'] for t in p['terms'] if t['taxonomy'] == 'product_cat']

    description = plain(p['post_excerpt']) or plain(p['post_content'])
    items.append({
        'id': 'gla_' + pid,
        'title': p['post_title'],
        'description': description,
        'link': SITE + '/product/' + p['post_name'] + '/',
        'image_link': main,
        'additional_image_link': extra,
        'availability': 'in stock' if meta.get('_stock_status', 'instock') == 'instock' else 'out of stock',
        'price': '%.2f USD' % float(price),
        'condition': 'new',
        'brand': BRAND,
        'product_type': cats[0] if cats else '',
        'identifier_exists': 'no',      # made to order: no GTIN, no manufacturer part number
        'shipping_countries': SHIP_COUNTRIES,
        'in_current_feed': pid in export,
    })

json.dump({'updated': None, 'items': items},
          open(os.path.join(ROOT, 'src', 'data', 'merchant.json'), 'w'), indent=1)

print('feed items:', len(items))
for pid, title, why in skipped:
    print('  skipped %-6s %-28s %s' % (pid, title[:28], why))
missing_image = [i['id'] for i in items if not i['image_link']]
print('  items with no image:', missing_image or 'none')
print('  items not in the current Merchant Center export:',
      [i['id'] for i in items if not i['in_current_feed']] or 'none')
gone = sorted(set(export) - {i['id'].replace('gla_', '') for i in items})
print('  in the export but not in this feed:', gone or 'none')
filled = sum(1 for pid in export if not export[pid].get('brand') or not export[pid].get('condition'))
print('  export rows that were missing brand/condition (now filled):', filled)
