#!/usr/bin/env python3
"""Build the product catalogue the cart and the order endpoint work from.

Ids, names, slugs, SKUs and prices come from the WooCommerce tables in the
extracted backup; the thumbnail is the product's featured image at the same
size WooCommerce used in its cart table.
"""
import os, json, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WP = json.load(open(os.path.join(ROOT, '..', '_migration', 'db', 'wp.json')))
SITE = 'https://theburgerboxes.com'

att = WP['attachments']

def thumb(aid):
    a = att.get(str(aid))
    if not a or not a.get('file'):
        return '/wp-content/uploads/woocommerce-placeholder-100x100.png'
    sizes = a.get('sizes') or {}
    base = os.path.dirname(a['file'])
    for key in ('woocommerce_thumbnail', 'thumbnail', 'woocommerce_gallery_thumbnail'):
        if key in sizes and sizes[key].get('file'):
            return '/wp-content/uploads/' + (base + '/' if base else '') + sizes[key]['file']
    return '/wp-content/uploads/' + a['file']

products = {}
for p in WP['products']:
    m = p['meta']
    products[str(p['ID'])] = {
        'id': str(p['ID']),
        'name': p['post_title'],
        'slug': p['post_name'],
        'url': SITE + '/product/' + p['post_name'] + '/',
        'sku': m.get('_sku', ''),
        'price': float(m.get('_price') or 0),
        'image': thumb(m.get('_thumbnail_id')),
        'categories': [t['name'] for t in p['terms'] if t['taxonomy'] == 'product_cat'],
    }

cat = {
    'currency': 'USD',
    'currencySymbol': '$',
    'decimals': 2,
    'products': products,
}
for path in (os.path.join(ROOT, 'src', 'data', 'catalogue.json'),
             os.path.join(ROOT, 'public', 'assets', 'catalogue.json')):
    json.dump(cat, open(path, 'w'), indent=1)
print('catalogue products:', len(products))
missing = [p['name'] for p in products.values() if not p['price']]
print('products with no price:', missing or 'none')
