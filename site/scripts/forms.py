#!/usr/bin/env python3
"""Recover each Elementor Pro form's server-side settings from the extracted
WordPress database: recipients, subject, From identity, redirect target and the
exact success / error wording the live site shows."""
import os, json, sqlite3, re, html

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DB = os.path.join(ROOT, '..', '_wpress', 'db.sqlite')

con = sqlite3.connect(DB)

KEEP = ('form_name', 'email_to', 'email_subject', 'email_from', 'email_from_name',
        'email_reply_to', 'email_to_2', 'email_subject_2', 'email_from_2',
        'email_from_name_2', 'email_reply_to_2', 'success_message', 'error_message',
        'required_field_message', 'invalid_message', 'server_message', 'redirect_to',
        'submit_actions')

def walk(els, out, post_id):
    for e in els:
        if e.get('widgetType') == 'form':
            s = e.get('settings', {})
            cfg = {k: s[k] for k in KEEP if k in s}
            cfg['post_id'] = str(post_id)
            cfg['fields'] = [
                {'id': f.get('custom_id'), 'type': f.get('field_type', 'text'),
                 'label': f.get('field_label', ''), 'placeholder': f.get('placeholder', ''),
                 'required': f.get('required') == 'true'}
                for f in s.get('form_fields', [])
            ]
            out[e['id']] = cfg
        walk(e.get('elements', []), out, post_id)

forms = {}
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

json.dump(forms, open(os.path.join(ROOT, 'src', 'data', 'forms.json'), 'w'), indent=1)
print('forms recovered:', len(forms))
for fid, c in forms.items():
    print(' ', fid, '|', c.get('form_name'), '| to:', c.get('email_to'),
          '| subject:', c.get('email_subject'), '| redirect:', c.get('redirect_to', ''))
