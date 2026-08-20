#!/usr/bin/env python3
"""Phase 6 -- cutover checks on the built output.

Confirms the deployable tree carries no backup, database or PHP files, no
secrets, no dependency on the WordPress host for assets, and no staging or
localhost URLs in the metadata that search engines read.
"""
import os, re, sys, json, glob, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, os.environ.get('DIST', 'dist'))

FORBIDDEN_EXT = {'.wpress', '.sql', '.php', '.sqlite', '.env', '.gz', '.zip', '.bak', '.log'}
SECRET_PATTERNS = [
    (re.compile(r'\bSMTP_PASS\b\s*[=:]\s*\S+'), 'SMTP password'),
    (re.compile(r'RECAPTCHA_SECRET|recaptcha_secret'), 'reCAPTCHA secret'),
    (re.compile(r'\bAUTH_KEY\b|\bSECURE_AUTH_KEY\b|\bLOGGED_IN_KEY\b|\bNONCE_KEY\b'), 'WordPress salt'),
    (re.compile(r'DB_PASSWORD|DB_USER\b'), 'database credential'),
    (re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----'), 'private key'),
]
# The metadata search engines read must always name the production domain.
META_RE = re.compile(
    r'<link rel="canonical" href="([^"]*)"|'
    r'<meta property="og:url" content="([^"]*)"|'
    r'"@id"\s*:\s*"([^"]*)"|"url"\s*:\s*"([^"]*)"')

problems = collections.defaultdict(list)

files = [os.path.join(r, f) for r, _, fs in os.walk(DIST) for f in fs]
print('files in output:', len(files))

for p in files:
    ext = os.path.splitext(p)[1].lower()
    rel = os.path.relpath(p, DIST)
    if ext in FORBIDDEN_EXT:
        problems['forbidden file type'].append(rel)

html = [p for p in files if p.endswith(('.html', '.xml', '.txt', '.js', '.css', '.json'))]
for p in html:
    rel = os.path.relpath(p, DIST)
    try:
        body = open(p, encoding='utf-8', errors='replace').read()
    except Exception:
        continue
    for pat, label in SECRET_PATTERNS:
        if pat.search(body):
            problems['possible secret: ' + label].append(rel)
    if p.endswith('.html'):
        for m in re.finditer(r'(?:src|href)="(https://theburgerboxes\.com/(?:wp-content|wp-includes|wp-admin)/[^"]*)"', body):
            problems['asset served from the WordPress host'].append('%s -> %s' % (rel, m.group(1)))
        for m in META_RE.finditer(body):
            v = next((g for g in m.groups() if g), '')
            if 'localhost' in v or 'vercel.app' in v or v.startswith('file:'):
                problems['staging URL in page metadata'].append('%s -> %s' % (rel, v))
        if 'wp-json' in body:
            for m in re.finditer(r'https?://[^"\']*wp-json[^"\']*', body):
                problems['wp-json reference'].append('%s -> %s' % (rel, m.group(0)[:110]))

for p in glob.glob(os.path.join(DIST, '*.xml')):
    body = open(p, encoding='utf-8', errors='replace').read()
    if 'localhost' in body or 'vercel.app' in body:
        problems['staging URL in a sitemap or feed'].append(os.path.basename(p))

print()
for k, v in sorted(problems.items()):
    uniq = sorted(set(v))
    print('%-42s %d' % (k, len(uniq)))
    for item in uniq[:6]:
        print('     ', item[:160])
    if len(uniq) > 6:
        print('      ... and %d more' % (len(uniq) - 6))
if not problems:
    print('no problems found')
