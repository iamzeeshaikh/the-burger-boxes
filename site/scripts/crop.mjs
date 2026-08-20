// Crop a band out of a screenshot (and optionally stack live/astro side by side).
import fs from 'node:fs';
import { PNG } from 'pngjs';
const [file, yStr, hStr, out, scaleStr] = process.argv.slice(2);
const y = Number(yStr), h = Number(hStr), scale = Number(scaleStr || 1);
const img = PNG.sync.read(fs.readFileSync(file));
const height = Math.min(h, img.height - y);
const band = new PNG({ width: img.width, height });
PNG.bitblt(img, band, 0, y, img.width, height, 0, 0);
let final = band;
if (scale !== 1) {
  const w2 = Math.round(img.width * scale), h2 = Math.round(height * scale);
  final = new PNG({ width: w2, height: h2 });
  for (let yy = 0; yy < h2; yy++) {
    for (let xx = 0; xx < w2; xx++) {
      const sx = Math.floor(xx / scale), sy = Math.floor(yy / scale);
      const si = (sy * img.width + sx) * 4, di = (yy * w2 + xx) * 4;
      final.data[di] = band.data[si]; final.data[di + 1] = band.data[si + 1];
      final.data[di + 2] = band.data[si + 2]; final.data[di + 3] = band.data[si + 3];
    }
  }
}
fs.writeFileSync(out, PNG.sync.write(final));
console.log(out, final.width + 'x' + final.height);
