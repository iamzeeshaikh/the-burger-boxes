// Post-migration SEO overrides.
//
// The captured WordPress <head> is kept byte-for-byte in pages.json so parity
// audits stay meaningful; anything we deliberately change after the migration
// lives in src/data/seo.json and is applied here at render time. That keeps the
// diff reviewable -- one file lists every title and description we authored,
// instead of them being buried in a 25 MB capture.
//
// Yoast prints the title, description, og:title and og:description as a block,
// and only prints a description pair when the page had one. So a title is
// always a replace, and a description is a replace when present and an insert
// after <title> when absent.
import overrides from '../data/seo.json' with { type: 'json' };

const attr = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function applySeo(head, route) {
  const o = overrides[route];
  if (!o) return head;
  let out = head;

  if (o.title) {
    const t = attr(o.title);
    out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`);
    out = out.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${t}$2`);
  }

  if (o.description) {
    const d = attr(o.description);
    if (/<meta name="description" content="/.test(out)) {
      out = out.replace(/(<meta name="description" content=")[^"]*(")/, `$1${d}$2`);
    } else {
      // Yoast's own order: description sits immediately after the title.
      out = out.replace(/(<title>[\s\S]*?<\/title>)/,
        `$1\n\t<meta name="description" content="${d}" />`);
    }
    if (/<meta property="og:description" content="/.test(out)) {
      out = out.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${d}$2`);
    } else {
      out = out.replace(/(<meta property="og:type" content="[^"]*" \/>)/,
        `$1\n\t<meta property="og:description" content="${d}" />`);
    }
  }

  return out;
}
