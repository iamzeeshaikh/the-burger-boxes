// Spam protection for the four forms WordPress left unguarded.
//
// The quote and contact forms carry a reCAPTCHA v2 checkbox and a honeypot; the
// "Contact Us" copies on /about-us/ and the three policy pages carry neither,
// and that is where the site's spam submissions arrive -- bots post straight at
// /wp-admin/admin-ajax.php with every visible field filled in.
//
// Rather than depend on Elementor Pro's own reCAPTCHA module (which is not even
// enqueued on those pages), the widget is rendered with Google's standard
// `.g-recaptcha` div plus api.js. Google's script injects the
// `g-recaptcha-response` textarea into the enclosing form, Elementor's serializer
// posts the whole form as FormData, and the handler reads that field exactly as
// it does for the widgets Elementor renders elsewhere.
import forms from '../data/forms.json' with { type: 'json' };

const SITE_KEY = '6LcpH6wrAAAAAPLze8TWxIjfX9_5ZESZbznOycYV';
export const RECAPTCHA_SRC = 'https://www.google.com/recaptcha/api.js';

// The four forms WordPress shipped with no guard at all. Listed explicitly
// rather than inferred: their configs now *do* carry a honeypot and a
// reCAPTCHA field (that is what the handler validates against), so there is no
// longer anything in the data to infer it from -- and which forms we modify
// after the fact should be a decision you can read, not one you derive.
const UNGUARDED = new Set(['4675000', '977a832', 'fe0583d', 'c21af86']);

const SUBMIT_GROUP = '<div class="elementor-field-group elementor-column elementor-field-type-submit';

const honeypotField = (id) =>
  `<div class="elementor-field-type-text">\n` +
  `\t\t\t\t\t<input size="1" type="text" name="form_fields[${id}]" ` +
  `id="form-field-${id}" class="elementor-field elementor-size-sm " ` +
  `style="display:none !important;" tabindex="-1" autocomplete="off" aria-hidden="true">` +
  `\t\t\t\t</div>\n\t\t\t\t\t\t\t\t`;

const recaptchaField = (id) =>
  `<div class="elementor-field-type-recaptcha elementor-field-group elementor-column ` +
  `elementor-field-group-${id} elementor-col-100">\n` +
  `\t\t\t\t\t<div class="elementor-field" id="form-field-${id}">` +
  `<div class="g-recaptcha" data-sitekey="${SITE_KEY}" data-theme="light" data-size="normal"></div>` +
  `</div>\t\t\t\t</div>\n\t\t\t\t\t\t\t\t`;

/**
 * Add the honeypot and reCAPTCHA markup to any unguarded form in `html`.
 * Returns the html and whether api.js is now needed on the page.
 */
export function protectForms(html) {
  let out = html;
  let needsScript = false;

  for (const id of UNGUARDED) {
    const marker = `<input type="hidden" name="form_id" value="${id}"/>`;
    const at = out.indexOf(marker);
    if (at === -1) continue;

    // Insert immediately before this form's submit group, which is the same
    // position Elementor uses for both field types.
    const submit = out.indexOf(SUBMIT_GROUP, at);
    if (submit === -1) continue;

    const cfg = forms[id];
    const hp = cfg.fields.find((f) => f.type === 'honeypot');
    const rc = cfg.fields.find((f) => f.type === 'recaptcha');
    if (!hp || !rc) continue;
    // Never double up if the captured markup already carries a widget.
    if (out.slice(at, submit).includes('g-recaptcha')) continue;

    out = out.slice(0, submit) + honeypotField(hp.id) + recaptchaField(rc.id) + out.slice(submit);
    needsScript = true;
  }

  return { html: out, needsScript };
}
