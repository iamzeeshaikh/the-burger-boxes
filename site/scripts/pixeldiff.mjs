// Phase 4 -- pixel-difference comparison of the live and Astro screenshots.
// Usage: node scripts/pixeldiff.mjs <live-dir> <astro-dir> <out-dir>
//
// Full-page screenshots of a 19,000px page accumulate sub-pixel rounding, so a
// single top-aligned comparison reports a page as "11% different" when every
// row is identical but shifted by one pixel. Each band is therefore aligned to
// its best vertical offset before being compared, which measures what actually
// differs rather than how far it has drifted.
//
// Rows are contiguous in the PNG buffer and both sides share a viewport width,
// so a band is a subarray view -- no copies, which keeps 19,000px pages inside
// memory.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [liveDir, astroDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const BAND = 400;
const MAX_SHIFT = 60;
const SHIFTS = [0];
for (let k = 1; k <= MAX_SHIFT; k++) SHIFTS.push(k, -k);

const rows = [];
for (const file of fs.readdirSync(astroDir).filter((f) => f.endsWith('.png')).sort()) {
  const ap = path.join(liveDir, file);
  if (!fs.existsSync(ap)) { rows.push({ file, note: 'no live screenshot' }); continue; }
  let live, astro;
  try {
    live = PNG.sync.read(fs.readFileSync(ap));
    astro = PNG.sync.read(fs.readFileSync(path.join(astroDir, file)));
  } catch (e) {
    rows.push({ file, note: 'unreadable: ' + e.message });
    continue;
  }
  if (live.width !== astro.width) {
    rows.push({ file, note: `width mismatch ${live.width} vs ${astro.width}` });
    continue;
  }
  const width = live.width;
  const rowBytes = width * 4;
  const bandBytes = BAND * rowBytes;
  const scratch = Buffer.alloc(bandBytes);
  const height = Math.min(live.height, astro.height);

  let changed = 0, pixels = 0, worstBand = null, maxShift = 0;
  for (let y = 0; y + BAND <= height; y += BAND) {
    const A = live.data.subarray(y * rowBytes, y * rowBytes + bandBytes);
    let best = null;
    for (const s of SHIFTS) {
      const y2 = y + s;
      if (y2 < 0 || y2 + BAND > astro.height) continue;
      const B = astro.data.subarray(y2 * rowBytes, y2 * rowBytes + bandBytes);
      const n = pixelmatch(A, B, null, width, BAND, { threshold: 0.12, includeAA: false });
      if (!best || n < best.n) best = { n, s };
      if (n === 0) break;
    }
    if (!best) continue;
    changed += best.n;
    pixels += width * BAND;
    maxShift = Math.max(maxShift, Math.abs(best.s));
    const pct = (best.n / (width * BAND)) * 100;
    if (!worstBand || pct > worstBand.pct) worstBand = { y, pct: Number(pct.toFixed(2)), shift: best.s };
  }
  const pct = pixels ? (changed / pixels) * 100 : 0;
  rows.push({
    file, pct: Number(pct.toFixed(3)),
    liveSize: [live.width, live.height], astroSize: [astro.width, astro.height],
    heightDelta: astro.height - live.height, maxShift, worstBand,
  });

  // keep a picture of the worst band on the pages that actually differ
  if (pct > 0.3 && worstBand) {
    const y = worstBand.y, y2 = y + worstBand.shift;
    const out = new PNG({ width, height: BAND });
    pixelmatch(live.data.subarray(y * rowBytes, y * rowBytes + bandBytes),
      astro.data.subarray(y2 * rowBytes, y2 * rowBytes + bandBytes),
      out.data, width, BAND, { threshold: 0.12, includeAA: false });
    fs.writeFileSync(path.join(outDir, file.replace('.png', `.band${y}.diff.png`)), PNG.sync.write(out));
  }
  scratch.fill(0);
}
fs.writeFileSync(path.join(outDir, '_pixeldiff.json'), JSON.stringify(rows, null, 1));

const scored = rows.filter((r) => r.pct !== undefined);
scored.sort((x, y) => y.pct - x.pct);
console.log('compared:', scored.length, ' skipped:', rows.length - scored.length);
const byWidth = {};
for (const r of scored) (byWidth[r.file.split('@')[1].replace('.png', '')] ||= []).push(r.pct);
for (const [w, list] of Object.entries(byWidth).sort((a, b) => Number(b[0]) - Number(a[0]))) {
  const avg = list.reduce((a, b) => a + b, 0) / list.length;
  console.log(`  ${w}px  pages=${list.length}  mean=${avg.toFixed(3)}%  worst=${Math.max(...list).toFixed(3)}%  pixel-identical=${list.filter((p) => p === 0).length}`);
}
console.log('\nworst 12:');
for (const r of scored.slice(0, 12)) {
  console.log(`  ${r.pct.toFixed(3)}%  ${r.file}  Δh=${r.heightDelta}  maxShift=${r.maxShift}  worstBand=y${r.worstBand?.y}:${r.worstBand?.pct}%`);
}
