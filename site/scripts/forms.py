#!/usr/bin/env python3
"""Recover each Elementor Pro form's server-side settings from the extracted
WordPress database: subject, redirect target and the exact success / error
wording the live site shows.

Recipient and From addresses are deliberately NOT written into src/data, which
is a public repository. They are identical across all nine live forms, so they
live in the FORM_TO / MAIL_FROM_EMAIL / MAIL_FROM_NAME environment variables
instead; this script prints the recovered values so they can be set, and fails
loudly if the forms ever stop agreeing on them.
"""
import os, json, sqlite3, re, html

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DB = os.path.join(ROOT, '..', '_wpress', 'db.sqlite')

con = sqlite3.connect(DB)

KEEP = ('form_name', 'email_subject', 'success_message', 'error_message',
        'required_field_message', 'invalid_message', 'server_message', 'redirect_to',
        'submit_actions')
# Recovered but never written to disk -- see the module docstring.
ADDRESS_FIELDS = ('email_to', 'email_from', 'email_from_name', 'email_reply_to',
                  'email_to_2', 'email_from_2', 'email_from_name_2', 'email_reply_to_2')

def walk(els, out, post_id):
    for e in els:
        if e.get('widgetType') == 'form':
            s = e.get('settings', {})
            cfg = {k: s[k] for k in KEEP if k in s}
            cfg['post_id'] = str(post_id)
            addresses[e['id']] = {k: s[k] for k in ADDRESS_FIELDS if k in s}
            cfg['fields'] = [
                {'id': f.get('custom_id'), 'type': f.get('field_type', 'text'),
                 'label': f.get('field_label', ''), 'placeholder': f.get('placeholder', ''),
                 'required': f.get('required') == 'true'}
                for f in s.get('form_fields', [])
            ]
            out[e['id']] = cfg
        walk(e.get('elements', []), out, post_id)

forms = {}
addresses = {}
for pid, data in con.execute(
        "SELECT post_id, meta_value FROM postmeta WHERE meta_key='_elementor_data'"):
    try:
        els = json.loads(data)
    except Exception:
        continue
    walk(els, forms, pid)

# Elementor stores some strings HTML-encoded; the browser shows them decoded.
for cfg in forms.values():
    for k in ('email_subject', 'email_subject_2', 'invalid_message', 'success_message',
              'error_message', 'required_field_message', 'server_message'):
        if k in cfg:
            cfg[k] = html.unescape(cfg[k])

# The nine forms the live site actually renders.
LIVE = {'b0c910d', 'a377aa9', '2bb183f5', '7003659', '4675000', '1b9de9e',
        '977a832', 'c21af86', 'fe0583d'}
recipients = {(addresses[f].get('email_to'), addresses[f].get('email_from'),
               addresses[f].get('email_from_name'))
              for f in LIVE if f in addresses}
if len(recipients) != 1:
    raise SystemExit('the live forms no longer agree on their recipients; set them '
                     'per form rather than from one environment variable:\n  '
                     + '\n  '.join(map(str, recipients)))
to, mail_from, from_name = recipients.pop()

json.dump(forms, open(os.path.join(ROOT, 'src', 'data', 'forms.json'), 'w'), indent=1)
print('forms recovered:', len(forms), '(%d rendered by the live site)' % len(LIVE))
for fid, c in forms.items():
    print(' ', fid, '|', c.get('form_name'), '| subject:', c.get('email_subject'),
          '| redirect:', c.get('redirect_to', ''))
print()
print('Set these in the environment (they are not written to src/data):')
print('  FORM_TO=%s' % to)
print('  MAIL_FROM_EMAIL=%s' % mail_from)
print('  MAIL_FROM_NAME=%s' % from_name)
