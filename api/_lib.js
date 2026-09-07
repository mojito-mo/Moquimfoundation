/* Shared helpers for the Foundation's API routes.
   Nothing here logs personal data, and no secret is ever returned. */
import crypto from 'node:crypto';

/* ── config, read from the environment only ─────────────────────────
   Never hardcode a key. Vercel > Project > Settings > Environment
   Variables. RZP_KEY_ID is safe to expose to the browser; RZP_KEY_SECRET
   and RZP_WEBHOOK_SECRET must never leave the server.               */
export const CFG = {
  keyId:         process.env.RZP_KEY_ID         || '',
  keySecret:     process.env.RZP_KEY_SECRET     || '',
  webhookSecret: process.env.RZP_WEBHOOK_SECRET || '',
  notifyUrl:     process.env.DONATION_WEBHOOK   || '',   // optional ops notification
  /* Google Sheet, written through an Apps Script web app. The URL is a
     capability in itself, so it lives here and never reaches the browser. */
  sheetUrl:      process.env.SHEET_URL          || '',
  sheetSecret:   process.env.SHEET_SECRET       || '',
  live() { return !!(this.keyId && this.keySecret); }
};

/* ── donation amounts are decided here, on the server ───────────────
   The browser sends a tier name, never a number, so a tampered page
   cannot create a one-rupee order that reports as a large gift.     */
export const TIERS = {
  t1000:  100000,     // paise
  t3000:  300000,
  t5000:  500000,
  t10000:1000000
};
export const CUSTOM_MIN = 10000;      // ₹100
export const CUSTOM_MAX = 50000000;   // ₹5,00,000, above this we ask people to call

export function resolveAmount(body) {
  if (body && typeof body.tier === 'string' && Object.prototype.hasOwnProperty.call(TIERS, body.tier)) {
    return TIERS[body.tier];
  }
  var n = Number(body && body.customPaise);
  if (Number.isInteger(n) && n >= CUSTOM_MIN && n <= CUSTOM_MAX) return n;
  return null;
}

/* ── timing-safe comparison, so a signature cannot be guessed byte by byte */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

export function hmac(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/* ── in-memory rate limit. Per warm instance, so it is a speed bump,
   not a wall. Vercel's platform limits sit in front of it.          */
const BUCKETS = new Map();
export function rateLimit(req, max, windowMs) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const hits = (BUCKETS.get(ip) || []).filter(t => now - t < windowMs);
  hits.push(now);
  BUCKETS.set(ip, hits);
  if (BUCKETS.size > 4000) BUCKETS.clear();
  return hits.length <= max;
}

/* ── input hygiene ─────────────────────────────────────────────────── */
export function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, max || 120);
}
export function validEmail(v) {
  return /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(v) && v.length <= 254;
}
export function validPhone(v) {
  return /^[0-9+\-\s()]{7,20}$/.test(v);
}

/* Redact anything that could identify a donor before it reaches a log. */
export function maskEmail(e) {
  const [u, d] = String(e).split('@');
  if (!d) return '***';
  return (u || '').slice(0, 2) + '***@' + d;
}

export function json(res, code, obj) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.status(code).end(JSON.stringify(obj));
}

/* Only our own pages may call these routes. */
export function sameOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const src = req.headers.origin || req.headers.referer || '';
  if (!src) return false;
  try { return new URL(src).host === host; } catch { return false; }
}

/* ── append one row to the Foundation's spreadsheet ──────────────────
   Best effort by design. A spreadsheet that is slow or unreachable must
   never fail a donation or hold up a webhook, so this resolves either way
   and reports success as a boolean rather than throwing.            */
export async function sheetAppend(kind, row) {
  if (!CFG.sheetUrl || !CFG.sheetSecret) return false;
  try {
    const r = await fetch(CFG.sheetUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: CFG.sheetSecret, kind, row }),
      redirect: 'follow',
      signal: AbortSignal.timeout(9000)
    });
    const text = await r.text();
    let out = {};
    try { out = JSON.parse(text); } catch { /* Apps Script served HTML, not JSON */ }

    if (r.ok && out.ok) return true;

    /* Say plainly what went wrong, in the Vercel runtime log. The reason
       comes from our own script and names no personal data, so it is safe
       to record. An HTML body almost always means a sign-in page, which
       means the deployment is not open to "Anyone". */
    const why = out.error
      ? out.error
      : text.slice(0, 120).includes('<')
        ? 'the script returned a web page, not JSON. Check Who has access is set to Anyone.'
        : 'unexpected reply: ' + text.slice(0, 120);
    console.error('sheet append refused', kind, 'status', r.status, why);
    return false;
  } catch (err) {
    console.error('sheet append failed', kind, String(err.message || err));
    return false;
  }
}
