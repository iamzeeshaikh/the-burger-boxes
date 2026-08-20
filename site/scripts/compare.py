#!/usr/bin/env python3
"""Phase 3 -- compare the rendered, post-JavaScript DOM of every live URL with
the same URL on the Astro deployment.

Both sides are captured with the same headless browser, after scripts have run
and lazy content has been scrolled in, so what is compared is what a visitor
(and Googlebot) actually gets -- not the raw served HTML.

Usage: python3 scripts/compare.py <live-dom-dir> <astro-dom-dir>
"""
import os, re, sys, json, glob, collections
from bs4 import BeautifulSoup

LIVE_HOST = 'https://theburgerboxes.com'

def parse(html, host):
    s = BeautifulSoup(html, 'lxml')

    def meta(name=None, prop=None):
        t = s.find('meta', attrs={'name': name} if name else {'property': prop})
        return t.get('content') if t else None

    schema = []
    for sc in s.find_all('script', type='application/ld+json'):
        try:
            schema.append(json.loads(sc.string or '{}'))
        except Exception:
            schema.append({'PARSE_ERROR': (sc.string or '')[:120]})

    body = s.find('body')
    text_soup = BeautifulSoup(str(body), 'lxml')
    for t in text_soup.find_all(['script', 'style', 'noscript']):
        t.decompose()

    def norm(u):
        if not u:
            return u
        u = u.replace(host, '')
        u = re.sub(r'\?ver=[^&"\']*', '', u)
        return u

    return {
        'title': s.title.get_text() if s.title else None,
        'description': meta(name='description'),
        'robots': meta(name='robots'),
        'canonical': (s.find('link', rel='canonical') or {}).get('href'),
        'og': {t.get('property'): t.get('content') for t in s.find_all('meta', property=True)},
        'twitter': {t.get('name'): t.get('content')
                    for t in s.find_all('meta', attrs={'name': re.compile('^twitter:')})},
        'verification': sorted(t.get('content') for t in
                               s.find_all('meta', attrs={'name': 'google-site-verification'})),
        'h1': [h.get_text(' ', strip=True) for h in s.find_all('h1')],
        'h2': [h.get_text(' ', strip=True) for h in s.find_all('h2')],
        'h3': [h.get_text(' ', strip=True) for h in s.find_all('h3')],
        'schema': schema,
        'links': sorted({norm(a['href']) for a in s.find_all('a', href=True)}),
        'images': sorted({(norm(i.get('src')) or '', i.get('alt') or '') for i in s.find_all('img')}),
        'stylesheets': [norm(l.get('href')) for l in s.find_all('link', rel='stylesheet')],
        'scripts': sorted({norm(x.get('src')) for x in s.find_all('script', src=True)}),
        'forms': [{'action': norm(f.get('action')),
                   'fields': sorted((i.get('name') or '', i.get('type') or i.name,
                                     i.has_attr('required')) for i in f.find_all(['input', 'textarea', 'select'])),
                   'buttons': [b.get_text(' ', strip=True) for b in f.find_all('button')]}
                  for f in s.find_all('form')],
        'bodyClass': ' '.join(body.get('class', [])) if body else '',
        'text': re.sub(r'\s+', ' ', text_soup.get_text(' ', strip=True)),
        'tracking': sorted(set(re.findall(r'AW-\d+|G-[A-Z0-9]{6,}|GTM-[A-Z0-9]+', str(s)))),
        'chat': 'chat.zeeops.dev' in str(s),
        'joinchat': bool(s.select('.joinchat')),
    }


# Differences that are deliberate and documented, not migration defects.
def explain(slug, key, a, b):
    if key == 'scripts':
        removed = set(a) - set(b)
        added = set(b) - set(a)
        if removed <= {'/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js'} \
           and added <= {'/assets/cart.js'}:
            return ("Cloudflare's email-obfuscation script is gone (the address is "
                    "restored in the markup instead) and the cart script is added.")
    if key == 'text':
        return None
    return None


def main():
    live_dir, astro_dir = sys.argv[1], sys.argv[2]
    astro_host = open(os.path.join(astro_dir, '_host.txt')).read().strip() \
        if os.path.exists(os.path.join(astro_dir, '_host.txt')) else ''
    slugs = sorted(os.path.basename(f)[:-5] for f in glob.glob(os.path.join(live_dir, '*.html')))
    report = {}
    missing = []
    counts = collections.Counter()
    for slug in slugs:
        a_path = os.path.join(live_dir, slug + '.html')
        b_path = os.path.join(astro_dir, slug + '.html')
        if not os.path.exists(b_path):
            missing.append(slug)
            continue
        a = parse(open(a_path, encoding='utf-8', errors='replace').read(), LIVE_HOST)
        b = parse(open(b_path, encoding='utf-8', errors='replace').read(), astro_host)
        diffs = {}
        for key in a:
            if a[key] != b[key]:
                why = explain(slug, key, a[key], b[key])
                diffs[key] = {'live': a[key], 'astro': b[key], 'explained': why}
                counts[key] += 1
        if diffs:
            report[slug] = diffs
    json.dump({'report': report, 'missing': missing},
              open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'compare.json'), 'w'),
              indent=1, default=str)
    print('pages compared:', len(slugs), ' with differences:', len(report),
          ' missing on the Astro side:', len(missing))
    for k, v in counts.most_common():
        print('  %-14s %d pages' % (k, v))


if __name__ == '__main__':
    main()
