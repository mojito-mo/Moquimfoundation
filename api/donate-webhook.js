/* Razorpay webhook. This is the authoritative record: it fires even if the
   donor closes the tab before the browser can confirm. Every request is
   signature-checked against the raw body before anything is trusted. */
import { CFG, safeEqual, json, sheetAppend } from './_lib.js';
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

    /* The spreadsheet row. This runs only after the signature has been
       verified and only once per event, so the Donations tab is a record of
       real, confirmed payments rather than attempts. Failed payments are
       recorded too, marked as such, because a donor who calls to ask what
       happened deserves an answer.

       Deliberately awaited: Vercel may freeze the function the moment the
       response is sent, and a fire-and-forget write would sometimes be cut
       off halfway. If the sheet is unreachable, sheetAppend returns false
       and we still answer 200, because the payment itself is not in doubt
       and Razorpay must not be told to retry. */
    const notes = pay.notes || {};
    await sheetAppend('donation', [
      notes.receipt || ('MF-' + String(pay.id).replace(/^pay_/, '').toUpperCase()),
      (pay.amount || 0) / 100,
      notes.donor_name || '',
      pay.email || '',
      pay.contact || '',
      pay.id,
      pay.order_id || '',
      pay.method || '',
      evt.event === 'payment.captured' ? 'Received' : 'Failed'
    ]);

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
