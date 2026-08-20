#!/usr/bin/env python3
"""Every image the built pages reference -- src, srcset candidate, data-thumb,
data-large_image, CSS background -- resolved against the files actually shipped."""
import os, re, glob, collections
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')

refs = collections.defaultdict(set)
for f in glob.glob(os.path.join(DIST, '**', '*.html'), recursive=True):
    rel = os.path.relpath(f, DIST)
    body = open(f, encoding='utf-8', errors='replace').read()
    for m in re.finditer(r'(?:src|data-src|data-thumb|data-large_image|href)="(/wp-content/uploads/[^"]+)"', body):
        refs[m.group(1)].add(rel)
    for m in re.finditer(r'(?:srcset|data-thumb-srcset)="([^"]+)"', body):
        for part in m.group(1).split(','):
            u = part.strip().split(' ')[0]
            if u.startswith('/wp-content/uploads/'):
                refs[u].add(rel)
    for m in re.finditer(r'url\((["\']?)(/wp-content/uploads/[^)"\']+)\1\)', body):
        refs[m.group(2)].add(rel)

def on_disk(u):
    # WordPress appends ?ver= cache-busters; the file itself has no query string
    return os.path.isfile(os.path.join(DIST, unquote(u.split('?')[0]).lstrip('/')))


missing = {u: p for u, p in refs.items() if not on_disk(u)}
print('distinct image references:', len(refs))
print('missing files:', len(missing))
for u, pages in sorted(missing.items())[:25]:
    print('  %-70s referenced by %d page(s)' % (u, len(pages)))
