// Phase 4 -- pixel-difference comparison of the live and Astro screenshots.
// Usage: node scripts/pixeldiff.mjs <live-dir> <astro-dir> <out-dir>
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [liveDir, astroDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const rows = [];
for (const file of fs.readdirSync(astroDir).filter((f) => f.endsWith('.png')).sort()) {
  const a = path.join(liveDir, file);
  const b = path.join(astroDir, file);
  if (!fs.existsSync(a)) { rows.push({ file, note: 'no live screenshot' }); continue; }
  const live = PNG.sync.read(fs.readFileSync(a));
  const astro = PNG.sync.read(fs.readFileSync(b));
  const width = Math.min(live.width, astro.width);
  const height = Math.min(live.height, astro.height);
  const crop = (img) => {
    if (img.width === width && img.height === height) return img;
    const out = new PNG({ width, height });
    PNG.bitblt(img, out, 0, 0, width, height, 0, 0);
    return out;
  };
  const A = crop(live), B = crop(astro);
  const diff = new PNG({ width, height });
  const changed = pixelmatch(A.data, B.data, diff.data, width, height,
    { threshold: 0.12, includeAA: false });
  const pct = (changed / (width * height)) * 100;
  rows.push({
    file, changed, pct: Number(pct.toFixed(3)),
    liveSize: [live.width, live.height], astroSize: [astro.width, astro.height],
    heightDelta: astro.height - live.height,
  });
  if (pct > 0.15 || Math.abs(astro.height - live.height) > 24) {
    fs.writeFileSync(path.join(outDir, file.replace('.png', '.diff.png')), PNG.sync.write(diff));
  }
}
fs.writeFileSync(path.join(outDir, '_pixeldiff.json'), JSON.stringify(rows, null, 1));

const scored = rows.filter((r) => r.pct !== undefined);
scored.sort((x, y) => y.pct - x.pct);
console.log('compared:', scored.length, ' missing live shots:', rows.length - scored.length);
const byWidth = {};
for (const r of scored) {
  const w = r.file.split('@')[1].replace('.png', '');
  (byWidth[w] ||= []).push(r.pct);
}
for (const [w, list] of Object.entries(byWidth)) {
  const avg = list.reduce((a, b) => a + b, 0) / list.length;
  console.log(`  ${w}px  pages=${list.length}  mean diff=${avg.toFixed(3)}%  worst=${Math.max(...list).toFixed(3)}%`);
}
console.log('\nworst 15:');
for (const r of scored.slice(0, 15)) {
  console.log(`  ${r.pct.toFixed(3)}%  ${r.file}  live=${r.liveSize.join('x')} astro=${r.astroSize.join('x')} Δh=${r.heightDelta}`);
}
