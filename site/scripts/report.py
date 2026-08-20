#!/usr/bin/env python3
"""Collect every audit output into one JSON the final report is written from."""
import os, re, json, glob, subprocess, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MIG = os.path.join(ROOT, '..', '_migration')


def load(p, default=None):
    try:
        return json.load(open(p))
    except Exception:
        return default


out = {}
pages = load(os.path.join(ROOT, 'src', 'data', 'pages.json'), {})
manifest = load(os.path.join(MIG, 'manifest.json'), [])
discovered = load(os.path.join(MIG, 'discovered.json'), {'status': {}, 'links': {}})
sitemap = {l.strip() for l in open(os.path.join(MIG, 'urls_sitemap.txt')) if l.strip()}
redirects = load(os.path.join(ROOT, 'src', 'data', 'redirects.json'), {})
rewrites = load(os.path.join(ROOT, 'src', 'data', 'rewrites.json'), {})
bytediff = load(os.path.join(HERE, 'bytediff.json'), {})
compare = load(os.path.join(HERE, 'compare.json'), {})
functional = load(os.path.join(HERE, 'functional.json'), [])
pixel = load(os.path.join(MIG, 'shots', 'diff', '_pixeldiff.json'), [])
overflow_a = load(os.path.join(MIG, 'shots', 'astro', '_overflow.json'), [])
overflow_l = load(os.path.join(MIG, 'shots', 'live', '_overflow.json'), [])

built = glob.glob(os.path.join(ROOT, 'dist', '**', 'index.html'), recursive=True)
out['counts'] = {
    'sitemap_urls': len(sitemap),
    'urls_reachable_by_crawl': len(discovered['status']),
    'urls_outside_sitemap': sorted(u for u in discovered['status'] if u not in sitemap),
    'captured_pages': len(pages),
    'built_routes': len(built) + (1 if os.path.exists(os.path.join(ROOT, 'dist', '404.html')) else 0),
    'manifest_rows': len(manifest),
    'redirects': len(redirects),
    'rewrites': len(rewrites),
}
out['bytediff'] = {
    'pages_with_unexplained_differences': len(bytediff),
    'sample': {k: v for k, v in list(bytediff.items())[:3]},
}
if compare:
    rep = compare.get('report', {})
    keys = collections.Counter()
    for slug, diffs in rep.items():
        for k in diffs:
            keys[k] += 1
    out['rendered_dom'] = {
        'pages_compared': len(rep) + (len(pages) - len(rep)),
        'pages_with_differences': len(rep),
        'by_field': dict(keys),
        'missing': compare.get('missing', []),
    }
out['functional'] = {
    'checks': len(functional),
    'passed': sum(1 for r in functional if r['ok']),
    'failed': [r for r in functional if not r['ok']],
}
if pixel:
    scored = [r for r in pixel if r.get('pct') is not None]
    by_width = collections.defaultdict(list)
    for r in scored:
        by_width[r['file'].split('@')[1].replace('.png', '')].append(r['pct'])
    out['visual'] = {
        'screenshots_compared': len(scored),
        'by_width': {w: {'pages': len(v), 'mean_pct': round(sum(v) / len(v), 3),
                         'worst_pct': round(max(v), 3)} for w, v in by_width.items()},
        'worst': sorted(scored, key=lambda r: -r['pct'])[:12],
    }
for label, data in (('astro', overflow_a), ('live', overflow_l)):
    bad = [r for r in data if r.get('scrollWidth', 0) > r.get('clientWidth', 0) + 1]
    out.setdefault('overflow', {})[label] = {'checked': len(data), 'pages_with_overflow': bad}

json.dump(out, open(os.path.join(MIG, 'report-data.json'), 'w'), indent=1, default=str)
print(json.dumps({k: (v if not isinstance(v, dict) or len(str(v)) < 900 else '...')
                  for k, v in out.items()}, indent=1, default=str)[:4000])
