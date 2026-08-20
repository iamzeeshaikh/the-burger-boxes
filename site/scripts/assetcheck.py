#!/usr/bin/env python3
"""Every asset the pages reference -- from markup attributes, srcset, CSS url()
and the URLs WordPress prints inside JS config objects -- resolved against the
files this site ships."""
import os, re, json, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
pages = json.load(open(os.path.join(ROOT, 'src', 'data', 'pages.json')))

ATTR = re.compile(r'(?:src|href|data-src|data-thumb|data-large_image|poster)='
                  r'["\'](/(?:wp-content|wp-includes|wp-admin)/[^"\']+)["\']')
IN_JS = re.compile(r'"(/(?:wp-content|wp-includes|wp-admin)/[^"]+\.(?:js|css|png|jpg|jpeg|gif|svg|woff2?))"')

refs = collections.Counter()
for slug, p in pages.items():
    blob = p['head'] + p['bodyOpen'] + p['content'] + p['bodyTail'] + p.get('joinchatSettings', '')
    for m in ATTR.finditer(blob):
        refs[m.group(1).split('?')[0]] += 1
    for m in re.finditer(r'srcset=["\']([^"\']+)["\']', blob):
        for part in m.group(1).split(','):
            u = part.strip().split(' ')[0]
            if u.startswith(('/wp-content/', '/wp-includes/')):
                refs[u.split('?')[0]] += 1
    for m in re.finditer(r'url\((["\']?)(/(?:wp-content|wp-includes)/[^)"\']+)\1\)', blob):
        refs[m.group(2).split('?')[0]] += 1
    for m in IN_JS.finditer(blob):
        refs[m.group(1).split('?')[0]] += 1

missing = sorted(a for a in refs if not os.path.isfile(os.path.join(PUB, a.lstrip('/'))))
print('assets referenced:', len(refs))
print('missing from public/:', len(missing))
for m in missing:
    print('  ', m, '(%d references)' % refs[m])
