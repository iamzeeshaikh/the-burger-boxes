// Exercise the quote-form endpoint the way Elementor Pro's own script does:
// multipart POST to /wp-admin/admin-ajax.php with action=elementor_pro_forms_send_form.
// Checks the response contract (Elementor reads response.data.message /
// .errors / .redirect_url), required-field validation, the honeypot and the
// reCAPTCHA gate. Real delivery is proven separately, with SMTP configured.
import forms from '../src/data/forms.json' with { type: 'json' };

const base = process.argv[2] || 'https://the-burger-boxes.vercel.app';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  -- ' + detail : ''));
};

async function post(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const r = await fetch(base + '/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, text, json };
}

const PRODUCT_FORM = {
  action: 'elementor_pro_forms_send_form',
  post_id: '241',
  form_id: '2bb183f5',
  referer_title: 'Black Burger Boxes Wholesale | The Burger Boxes',
  queried_id: '500',
  referrer: 'https://theburgerboxes.com/product/black-burger-boxes/',
};

// 1. unknown action answers 0, the way admin-ajax.php does
{
  const r = await post({ action: 'something_else' });
  check('unknown admin-ajax action answers 0', r.text.trim() === '0', r.text.slice(0, 40));
}

// 2. missing required fields come back keyed for the inline messages
{
  const r = await post({ ...PRODUCT_FORM, 'form_fields[name]': 'QA Bot' });
  check('missing required fields rejected', r.json && r.json.success === false);
  const errs = r.json?.data?.errors || {};
  check('errors keyed by field id', 'email' in errs && 'field_f54cfcb' in errs,
    Object.keys(errs).join(', '));
  check('required-field wording matches Elementor',
    errs.email === 'This field is required.', errs.email);
}

// 3. an invalid email address is caught
{
  const r = await post({
    ...PRODUCT_FORM, 'form_fields[name]': 'QA Bot',
    'form_fields[email]': 'not-an-email', 'form_fields[field_f54cfcb]': '5551234567',
  });
  check('invalid email rejected', r.json && r.json.success === false,
    JSON.stringify(r.json?.data?.errors || {}));
}

// 4. the honeypot silently absorbs a bot
{
  const r = await post({
    ...PRODUCT_FORM, 'form_fields[name]': 'Bot',
    'form_fields[email]': 'bot@example.com', 'form_fields[field_f54cfcb]': '5551234567',
    'form_fields[field_480fb0f]': 'i am a bot',
  });
  check('honeypot answers success without sending',
    r.json && r.json.success === true &&
    r.json.data.message === 'The form was sent successfully.',
    JSON.stringify(r.json?.data || {}));
}

// 5. a complete submission with no reCAPTCHA token is refused
{
  const r = await post({
    ...PRODUCT_FORM, 'form_fields[name]': 'QA Bot',
    'form_fields[email]': 'qa@example.com', 'form_fields[field_f54cfcb]': '5551234567',
    'form_fields[field_a858f27]': 'Black Burger Boxes', 'form_fields[message]': 'QA check',
  });
  check('missing reCAPTCHA refused', r.json && r.json.success === false,
    r.json?.data?.message);
  check('reCAPTCHA wording matches Elementor',
    r.json?.data?.message === "There's something wrong. The form is invalid.",
    r.json?.data?.message);
}

// 6. the contact form on a page carries its own recipient config
{
  const r = await post({
    action: 'elementor_pro_forms_send_form', post_id: '431', form_id: '1b9de9e',
    referer_title: 'Contact Us - The Burger Boxes',
    referrer: 'https://theburgerboxes.com/contact-us/',
  });
  check('contact form validates too', r.json && r.json.success === false,
    JSON.stringify(r.json?.data?.errors || {}));
}

// 7. every form sends the visitor to the thank-you page. The honeypot path
// answers exactly as a real submission does and needs no reCAPTCHA token, so
// it proves the redirect without sending mail. Five of the nine live forms have
// a honeypot; they cover both configurations -- the two "Instant Quote" forms
// that WordPress already redirected, and forms with no redirect_to of their own,
// including a Contact Us. The other four differ only in lacking the honeypot,
// and all nine return through the same success path.
const LIVE_FORMS = {
  'b0c910d': 'Instant Quote (home)',
  'a377aa9': 'Schedule Appointment (home)',
  '2bb183f5': 'Instant Quote (product)',
  '7003659': 'Schedule Appointment (product)',
  '4675000': 'Contact Us (about)',
  '1b9de9e': 'Contact Us (contact)',
  '977a832': 'Contact Us (privacy)',
  'c21af86': 'Contact Us (refund)',
  'fe0583d': 'Contact Us (terms)',
};
for (const [fid, label] of Object.entries(LIVE_FORMS)) {
  const honeypot = (forms[fid].fields || []).find((f) => f.type === 'honeypot');
  if (!honeypot) continue;
  const r = await post({
    action: 'elementor_pro_forms_send_form', form_id: fid, post_id: '0',
    [`form_fields[${honeypot.id}]`]: 'bot',
  });
  check(`redirects to thank-you: ${label}`,
    r.json?.success === true && r.json?.data?.redirect_url === '/thank-you/',
    r.json?.data?.redirect_url ?? JSON.stringify(r.json));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
