/* Razorpay webhook. This is the authoritative record: it fires even if the
   donor closes the tab before the browser can confirm. Every request is
   signature-checked against the raw body before anything is trusted. */
import { CFG, safeEqual, json } from './_lib.js';
import crypto from 'node:crypto';

// Vercel would otherwise parse the body and change the bytes we must hash.
export const config = { api: { bodyParser: false } };

function rawBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 1_000_000) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Remember recent event ids so a retried delivery is not counted twice.
const SEEN = new Map();
function firstTime(id) {
  const now = Date.now();
  for (const [k, t] of SEEN) if (now - t > 30 * 60_000) SEEN.delete(k);
  if (SEEN.has(id)) return false;
  SEEN.set(id, now);
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!CFG.webhookSecret)    return json(res, 503, { error: 'Webhook not configured' });

  let raw;
  try { raw = await rawBody(req); } catch { return json(res, 413, { error: 'Payload too large' }); }

  const sent = req.headers['x-razorpay-signature'];
  const mine = crypto.createHmac('sha256', CFG.webhookSecret).update(raw).digest('hex');
  if (!sent || !safeEqual(mine, sent)) {
    console.warn('webhook signature rejected');
    return json(res, 400, { error: 'Invalid signature' });   // deliberately vague
  }

  let evt;
  try { evt = JSON.parse(raw.toString('utf8')); } catch { return json(res, 400, { error: 'Bad payload' }); }

  const eventId = req.headers['x-razorpay-event-id'] || (evt.payload?.payment?.entity?.id ?? '');
  if (eventId && !firstTime(eventId)) return json(res, 200, { ok: true, duplicate: true });

  const pay = evt.payload?.payment?.entity;
  if (pay && (evt.event === 'payment.captured' || evt.event === 'payment.failed')) {
    // Identifiers and amounts only. Never card data, never a full contact.
    console.log('webhook', evt.event, pay.id, pay.amount, pay.currency);
    if (CFG.notifyUrl) {
      fetch(CFG.notifyUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: evt.event,
          paymentId: pay.id,
          orderId: pay.order_id,
          amountPaise: pay.amount,
          currency: pay.currency,
          method: pay.method,
          at: new Date().toISOString()
        })
      }).catch(() => {});
    }
  }

  // Always 200 on a valid signature, or Razorpay will retry forever.
  return json(res, 200, { ok: true });
}
