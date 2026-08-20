#!/usr/bin/env python3
"""Index every published post, page and product the way WordPress search does.

WordPress matched the query against post_title, post_excerpt and post_content
and listed the hits newest-first, ten to a page. The same haystack is built here
so /?s= returns the same results in the same order.
"""
import os, re, json, html, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WP = json.load(open(os.path.join(ROOT, '..', '_migration', 'db', 'wp.json')))
SITE = 'https://theburgerboxes.com'
att = WP['attachments']

MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
          'August', 'September', 'October', 'November', 'December']


def fmt_date(s):
    d = datetime.datetime.strptime(s, '%Y-%m-%d %H:%M:%S')
    return '%s %d, %d' % (MONTHS[d.month - 1], d.day, d.year)


def iso(s):
    d = datetime.datetime.strptime(s, '%Y-%m-%d %H:%M:%S')
    return d.strftime('%Y-%m-%dT%H:%M:%S+00:00')


def image(aid, alt_fallback):
    a = att.get(str(aid))
    if not a or not a.get('file'):
        return None
    base = '/wp-content/uploads/'
    d = os.path.dirname(a['file'])
    prefix = base + (d + '/' if d else '')
    full = base + a['file']
    w, h = a.get('width'), a.get('height')
    cands = [(full, w)]
    for s in (a.get('sizes') or {}).values():
        if s.get('file') and s.get('width'):
            cands.append((prefix + s['file'], s['width']))
    seen, srcset = set(), []
    for u, cw in cands:
        if cw and u not in seen:
            seen.add(u)
            srcset.append('%s %dw' % (u, cw))
    return {
        'src': full, 'width': w, 'height': h,
        'alt': a.get('alt') or a.get('title') or alt_fallback,
        'srcset': ', '.join(srcset),
        'sizes': 'auto, (max-width: %dpx) 100vw, %dpx' % (w, w) if w else '',
    }


STRIP = re.compile(r'(?s)<[^>]+>')


def excerpt(post):
    """WordPress' the_excerpt(): the manual excerpt if set, else the first 55
    words of the content with a [&hellip;] tail."""
    if post['post_excerpt'].strip():
        return post['post_excerpt'].strip()
    text = post['post_content']
    text = re.sub(r'(?s)<(script|style).*?</\1>', ' ', text)
    text = re.sub(r'\[[^\]]+\]', ' ', text)
    text = STRIP.sub(' ', text)
    text = html.unescape(text)
    words = text.split()
    if len(words) <= 55:
        return '<p>%s</p>' % html.escape(' '.join(words))
    return '<p>%s [&hellip;]</p>' % html.escape(' '.join(words[:55]))


def base_url(post):
    if post['post_type'] == 'product':
        return SITE + '/product/' + post['post_name'] + '/'
    if post['post_type'] == 'post':
        return SITE + '/' + post['post_name'] + '/'
    if post['post_name'] == 'home':
        return SITE + '/'
    return SITE + '/' + post['post_name'] + '/'


entries = []
for kind in ('posts', 'products', 'pages'):
    for p in WP[kind]:
        cats = [t for t in p['terms'] if t['taxonomy'] == 'category']
        ex = excerpt(p)
        entries.append({
            'id': str(p['ID']),
            'type': p['post_type'],
            'title': p['post_title'],
            'url': base_url(p),
            'date': iso(p['post_date']),
            'dateDisplay': fmt_date(p['post_date']),
            'modified': iso(p['post_modified']),
            'modifiedDisplay': fmt_date(p['post_modified']),
            'excerpt': ex if ex.lstrip().startswith('<') else '<p>%s</p>' % ex,
            'image': image(p['meta'].get('_thumbnail_id'), p['post_title']),
            'categories': [{'name': c['name'], 'url': SITE + '/category/' + c['slug'] + '/'}
                           for c in cats],
            'classes': ('%s type-%s status-publish %s hentry rishi-post'
                        % (p['post_type'], p['post_type'],
                           'has-post-thumbnail' if p['meta'].get('_thumbnail_id') else '')),
            'haystack': html.unescape(STRIP.sub(' ', ' '.join(
                [p['post_title'], p['post_excerpt'], p['post_content']]))).lower(),
            'sort': p['post_date'],
        })

entries.sort(key=lambda e: e['sort'], reverse=True)
for e in entries:
    del e['sort']
json.dump(entries, open(os.path.join(ROOT, 'src', 'data', 'searchindex.json'), 'w'), indent=1)
print('search index entries:', len(entries))
