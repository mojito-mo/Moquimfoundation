/* Volunteer and contact form receiver.

   The browser posts here, to our own domain. This function then forwards the
   row to a Google Apps Script web app whose URL lives only in a Vercel
   environment variable, so the spreadsheet endpoint is never exposed to the
   page, to the network tab, or to anyone reading the source.

   Nothing is written until the request passes the origin check, the rate
   limit, the honeypot and field validation. */
import { CFG, json, rateLimit, clean, validEmail, validPhone, sameOrigin, maskEmail, sheetAppend } from './_lib.js';

const MAX = { name: 80, email: 254, phone: 20, line: 120, text: 2000 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!sameOrigin(req))      return json(res, 403, { error: 'Forbidden' });

  /* Six submissions per ten minutes from one address is generous for a
     person and tight for a script. */
  if (!rateLimit(req, 6, 10 * 60_000)) {
    return json(res, 429, { error: 'Too many submissions. Please try again in a few minutes.' });
  }

  if (!CFG.sheetUrl || !CFG.sheetSecret) {
    return json(res, 503, {
      error: 'The form is not connected yet. Please call +91 99370 81575 or email moquimfoundation.org@gmail.com.'
    });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  if (!body) return json(res, 400, { error: 'Bad request' });

  /* Honeypot. A real person never fills a field they cannot see, so a value
     here means a bot. Answer 200 so it does not learn anything. */
  if (clean(body.website, 20)) return json(res, 200, { ok: true });

  const kind = clean(body.kind, 20);
  const built = kind === 'volunteer' ? volunteer(body)
              : kind === 'contact'   ? contact(body)
              : null;

  if (!built)      return json(res, 400, { error: 'Bad request' });
  if (built.error) return json(res, 400, { error: built.error });

  const written = await sheetAppend(kind, built.row);
  if (!written) {
    /* The log records that it failed and for whom, in a masked form.
       It never records the message, the phone number or the address. */
    console.error('submit failed', kind, maskEmail(built.email || ''));
    return json(res, 502, {
      error: 'We could not record that just now. Please call +91 99370 81575 or email moquimfoundation.org@gmail.com.'
    });
  }

  return json(res, 200, { ok: true });
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

function volunteer(b) {
  const name  = clean(b.name, MAX.name);
  const phone = clean(b.phone, MAX.phone);
  const email = clean(b.email, MAX.email);

  if (name.length < 2)              return { error: 'Please give your name.' };
  if (!validPhone(phone))           return { error: 'Please give a phone number we can reach you on.' };
  if (email && !validEmail(email))  return { error: 'That email address does not look right.' };
  if (b.consent !== true)           return { error: 'Please tick the consent box so we may contact you.' };

  return {
    email,
    row: [
      name,
      phone,
      email,
      clean(b.address, MAX.line),
      clean(b.skill, MAX.line),
      clean(b.availability, MAX.line),
      clean(b.message, MAX.text)
    ]
  };
}

function contact(b) {
  const first = clean(b.first, MAX.name);
  const last  = clean(b.last, MAX.name);
  const email = clean(b.email, MAX.email);
  const phone = clean(b.phone, MAX.phone);
  const msg   = clean(b.message, MAX.text);

  if (first.length < 1)            return { error: 'Please give your first name.' };
  if (!validEmail(email))          return { error: 'Please give an email address so we can reply.' };
  if (phone && !validPhone(phone)) return { error: 'That phone number does not look right.' };
  if (msg.length < 5)              return { error: 'Please write your message.' };
  if (b.consent !== true)          return { error: 'Please tick the consent box so we may reply.' };

  return {
    email,
    row: [first, last, email, phone, clean(b.reason, MAX.line), msg]
  };
}
