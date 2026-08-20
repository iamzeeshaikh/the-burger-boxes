// Where on the page do two screenshots differ? Reports the vertical bands.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [a, b, bandArg] = process.argv.slice(2);
const band = Number(bandArg || 200);
const A = PNG.sync.read(fs.readFileSync(a));
const B = PNG.sync.read(fs.readFileSync(b));
const width = Math.min(A.width, B.width);
const height = Math.min(A.height, B.height);
const crop = (img) => {
  if (img.width === width && img.height === height) return img;
  const out = new PNG({ width, height });
  PNG.bitblt(img, out, 0, 0, width, height, 0, 0);
  return out;
};
const X = crop(A), Y = crop(B);
const diff = new PNG({ width, height });
pixelmatch(X.data, Y.data, diff.data, width, height, { threshold: 0.12, includeAA: false });
const rows = new Array(Math.ceil(height / band)).fill(0);
for (let y = 0; y < height; y++) {
  let n = 0;
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (diff.data[i] === 255 && diff.data[i + 1] < 100) n++;
  }
  rows[Math.floor(y / band)] += n;
}
console.log(`${a.split('/').pop()}  ${width}x${height}`);
rows.forEach((n, i) => {
  const pct = (n / (band * width)) * 100;
  if (pct > 0.4) console.log(`  y ${i * band}-${(i + 1) * band}: ${pct.toFixed(1)}% differing`);
});
