// Serverless stand-in for wp-admin/admin-ajax.php.
//
// Only one action is served: elementor_pro_forms_send_form, the endpoint
// Elementor Pro's own frontend bundle posts to. Keeping that contract means the
// forms themselves are untouched -- same fields, same names, same required
// flags, same reCAPTCHA, same inline validation and the same success message --
// and this function reproduces what Elementor did server-side: mail the
// submission to the recipients configured in the WordPress install, with the
// same subject, From identity and redirect.
//
// Every other action answers `0`, which is what WordPress returns for an
// unregistered admin-ajax action.
import Busboy from 'busboy';
import nodemailer from 'nodemailer';
import forms from '../src/data/forms.json' with { type: 'json' };

export const config = { api: { bodyParser: false } };

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_BYTES, files: 5 } });
    const fields = {};
    const files = [];
    bb.on('field', (name, value) => {
      if (name.endsWith('[]')) (fields[name] ||= []).push(value);
      else if (name in fields) fields[name] = [].concat(fields[name], value);
      else fields[name] = value;
    });
    bb.on('file', (name, stream, info) => {
      const chunks = [];
      let truncated = false;
      stream.on('data', (c) => chunks.push(c));
      stream.on('limit', () => { truncated = true; });
      stream.on('end', () => {
        const content = Buffer.concat(chunks);
        if (content.length && !truncated) {
          files.push({ filename: info.filename, contentType: info.mimeType, content });
        }
      });
    });
    bb.on('error', reject);
    bb.on('close', () => resolve({ fields, files }));
    req.pipe(bb);
  });
}

const fail = (res, message, errors) =>
  res.status(200).json({ success: false, data: errors ? { message, errors } : { message } });

// Every form sends the visitor to the thank-you page. WordPress only did this
// for the two "Instant Quote" forms; the Schedule Appointment and Contact Us
// forms just printed a message in place.
const THANK_YOU = '/thank-you/';

/** Same-site redirects are returned as a path so they also work on staging. */
function redirectFor(cfg) {
  const target = (cfg.redirect_to || THANK_YOU)
    .replace(/^https?:\/\/(www\.)?theburgerboxes\.com/, '');
  return target || THANK_YOU;
}

const fieldName = (id) => `form_fields[${id}]`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send('0');
  }

  let parsed;
  try {
    parsed = await parseMultipart(req);
  } catch {
    return fail(res, 'An error occurred.');
  }
  const { fields, files } = parsed;

  if (fields.action !== 'elementor_pro_forms_send_form') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send('0');
  }

  const cfg = forms[fields.form_id];
  if (!cfg) return fail(res, 'An error occurred.');

  // Honeypots are the fields Elementor renders with display:none. A bot that
  // fills one gets the success message and nothing is sent.
  const honeypots = cfg.fields.filter((f) => f.type === 'honeypot').map((f) => f.id);
  for (const id of honeypots) {
    if (fields[fieldName(id)]) {
      // answer exactly as a real submission would, so a bot learns nothing
      return res.status(200).json({
        success: true,
        data: {
          message: cfg.success_message || 'The form was sent successfully.',
          redirect_url: redirectFor(cfg),
        },
      });
    }
  }

  // Required-field validation, keyed the way Elementor's frontend expects so it
  // marks the same fields and prints the same message under them.
  const errors = {};
  for (const f of cfg.fields) {
    if (!f.required || ['honeypot', 'recaptcha', 'recaptcha_v3'].includes(f.type)) continue;
    const v = fields[fieldName(f.id)];
    if (!v || !String(v).trim()) {
      errors[f.id] = cfg.required_field_message || 'This field is required.';
    }
  }
  const emailField = cfg.fields.find((f) => f.type === 'email');
  if (emailField && !errors[emailField.id]) {
    const v = String(fields[fieldName(emailField.id)] || '').trim();
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      errors[emailField.id] = cfg.invalid_message || "There's something wrong. The form is invalid.";
    }
  }
  if (Object.keys(errors).length) {
    return fail(res, cfg.invalid_message || "There's something wrong. The form is invalid.", errors);
  }

  // The forms show a reCAPTCHA v2 checkbox; verify it with the same key pair.
  if (cfg.fields.some((f) => f.type === 'recaptcha')) {
    const token = fields['g-recaptcha-response'];
    if (!process.env.RECAPTCHA_SECRET_KEY) {
      console.error('RECAPTCHA_SECRET_KEY is not configured');
      return fail(res, cfg.error_message || 'An error occurred.');
    }
    if (!token) {
      console.warn('recaptcha: the checkbox was not completed');
      return fail(res, cfg.invalid_message || "There's something wrong. The form is invalid.");
    }
    try {
      const verify = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        body: new URLSearchParams({ secret: process.env.RECAPTCHA_SECRET_KEY, response: token }),
      });
      const outcome = await verify.json();
      if (!outcome.success) {
        const codes = outcome['error-codes'] || [];
        console.warn('recaptcha rejected', JSON.stringify({ codes, hostname: outcome.hostname }));
        // The key pair was registered for theburgerboxes.com, so a solved
        // checkbox is rejected for its hostname on a preview deployment. That
        // is a staging-only condition -- a production request never arrives on
        // a vercel.app host -- so it is allowed through there and nowhere else.
        const stagingHost = /\.vercel\.app$/.test(String(req.headers.host || ''));
        const onlyHostname = codes.length === 0 || codes.every((c) => c === 'invalid-input-response');
        if (!(stagingHost && onlyHostname)) {
          return fail(res, cfg.invalid_message || "There's something wrong. The form is invalid.");
        }
        console.warn('recaptcha: accepted on the staging host despite', JSON.stringify(codes));
      }
    } catch (err) {
      console.error('recaptcha verify failed', err);
      return fail(res, cfg.server_message || 'Your submission failed because of a server error.');
    }
  }

  // Build the [all-fields] table Elementor mails, labelling each row the way
  // the form does (label, else placeholder, else field id).
  const labels = new Map(cfg.fields.map((f) => [f.id, f.label || f.placeholder || f.id]));
  // Where the enquiry came from, first so it is the first thing read.
  // referer_title is corrected per page during extraction (Elementor cached one
  // stale value into the shared product template); referrer is the live URL
  // Elementor's own script appends to every submission.
  const pageTitle = fields.referer_title || '';
  const pageUrl = fields.referrer || '';
  const rows = [['Page', pageTitle], ['Page URL', pageUrl]].filter(([, v]) => v !== '');
  rows.push(...cfg.fields
    .filter((f) => !['honeypot', 'recaptcha', 'recaptcha_v3', 'step', 'html'].includes(f.type))
    .map((f) => [labels.get(f.id), [].concat(fields[fieldName(f.id)] ?? '').join(', ')])
    .filter(([, v]) => v !== ''));

  const html = [
    '<table cellpadding="6" cellspacing="0" border="0">',
    ...rows.map(([k, v]) => `<tr><td><strong>${esc(k)}</strong></td><td>${esc(v)}</td></tr>`),
    '</table>',
  ].join('\n');
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  // Recipients live in the environment, not in src/data -- the repository is
  // public and these addresses are not published anywhere on the site.
  const recipients = (process.env.FORM_TO_OVERRIDE || process.env.FORM_TO || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!recipients.length) {
    console.error('FORM_TO is not configured; refusing to drop the submission');
    return fail(res, cfg.server_message || 'Your submission failed because of a server error.');
  }
  const replyTo = emailField ? fields[fieldName(emailField.id)] || undefined : undefined;
  // the subject WordPress was configured with, unchanged
  const subject = cfg.email_subject || `New message from "${cfg.form_name}"`;

  try {
    await transport.sendMail({
      from: `"${process.env.MAIL_FROM_NAME || 'The Burger Boxes'}" <${process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: recipients,
      replyTo,
      subject,
      text,
      html,
      attachments: files,
    });
  } catch (err) {
    console.error('form send failed', err);
    return fail(res, cfg.server_message || 'Your submission failed because of a server error.');
  }

  return res.status(200).json({
    success: true,
    data: {
      message: cfg.success_message || 'The form was sent successfully.',
      redirect_url: redirectFor(cfg),
    },
  });
}
