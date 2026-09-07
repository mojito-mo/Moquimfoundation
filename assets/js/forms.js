/* Volunteer and contact forms.

   The page collects, our own server validates and forwards. No spreadsheet
   URL, no key and no third party script is involved on this side.

   If JavaScript is off or the request fails, the panel above the form still
   carries the phone number and the email address, so nobody is ever left
   without a way to reach the Foundation. */
(function () {
  var form = document.querySelector('form.form[data-kind]');
  if (!form) return;

  var kind   = form.dataset.kind;
  var btn    = form.querySelector('button[type=submit]');
  var done   = form.querySelector('.submitted');
  var label  = btn ? btn.textContent : 'Send';
  var busy   = false;
  var note;

  /* The honeypot. Hidden from sight and from screen readers, and left out of
     the tab order, so only a script will ever fill it. */
  var pot = document.createElement('div');
  pot.setAttribute('aria-hidden', 'true');
  pot.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden';
  pot.innerHTML = '<label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label>';
  form.appendChild(pot);

  function say(msg, bad) {
    if (!note) {
      note = document.createElement('p');
      note.setAttribute('role', 'status');
      note.setAttribute('aria-live', 'polite');
      note.style.cssText = 'margin:12px 0 0;font-size:15px;line-height:1.5';
      form.insertBefore(note, btn ? btn.parentNode : null);
    }
    note.textContent = msg || '';
    note.style.color = bad ? 'var(--crimson)' : 'var(--ink-3)';
    note.hidden = !msg;
  }

  function value(sel) {
    var el = form.querySelector(sel);
    return el ? el.value.trim() : '';
  }

  function collect() {
    var consent = form.querySelector('.consent input[type=checkbox]');
    var body = {
      kind: kind,
      consent: !!(consent && consent.checked),
      website: (form.querySelector('[name=website]') || {}).value || ''
    };
    if (kind === 'volunteer') {
      body.name         = value('#v-name');
      body.phone        = value('#v-phone');
      body.email        = value('#v-email');
      body.address      = value('#v-address');
      body.skill        = value('#v-skill');
      body.availability = value('#v-avail');
      body.message      = value('#v-msg');
    } else {
      body.first   = value('#c-first');
      body.last    = value('#c-last');
      body.email   = value('#c-email');
      body.phone   = value('#c-phone');
      body.reason  = value('#c-reason');
      body.message = value('#c-msg');
    }
    return body;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    if (!form.reportValidity()) return;

    busy = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    say('');

    fetch('/api/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(collect())
    })
      .then(function (r) {
        return r.text().then(function (t) {
          return { ok: r.ok, data: t ? JSON.parse(t) : {} };
        });
      })
      .then(function (o) {
        if (!o.ok || !o.data.ok) throw new Error(o.data.error || 'Something went wrong.');
        /* Success. Retire the fields so the same details cannot be sent
           twice by an impatient second click. */
        form.querySelectorAll('.f2, .fr, .consent').forEach(function (el) { el.hidden = true; });
        if (btn && btn.parentNode) btn.parentNode.hidden = true;
        say('');
        if (done) {
          done.hidden = false;
          done.setAttribute('tabindex', '-1');
          done.focus();
        }
      })
      .catch(function (err) {
        busy = false;
        if (btn) { btn.disabled = false; btn.textContent = label; }
        say(err.message || 'We could not send that. Please call +91 99370 81575.', true);
      });
  });
})();
