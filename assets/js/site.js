/* ═══════════════════════════════════════════════════════════════════
   Moquim Foundation
   Motion built on springs, not durations. Every gesture is
   interruptible, velocity-aware, and starts from the live value.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var REDUCE = matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* ── Spring ──────────────────────────────────────────────────────
     Parameterised the way designers think: damping ratio + response.
     Re-targeting carries current velocity, so a reversal never hits
     a wall. Reading .value gives the live on-screen number.          */
  function Spring(value, opts) {
    opts = opts || {};
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.damping = opts.damping != null ? opts.damping : 1.0;   // 1.0 = no overshoot
    this.response = opts.response != null ? opts.response : 0.4; // seconds, not a duration
    this.onUpdate = opts.onUpdate || function () {};
    this.onRest = opts.onRest || function () {};
    this._raf = null;
    this._last = 0;
  }
  Spring.prototype.setTarget = function (t, velocity) {
    this.target = t;
    if (velocity != null) this.velocity = velocity;   // hand off the finger's speed
    this.start();
  };
  Spring.prototype.set = function (v) {               // jump, no animation
    this.stop();
    this.value = v; this.velocity = 0;
    this.onUpdate(v);
  };
  Spring.prototype.stop = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  };
  Spring.prototype.start = function () {
    if (this._raf) return;
    this._last = performance.now();
    var self = this;
    (function tick(now) {
      var dt = Math.min((now - self._last) / 1000, 1 / 30);
      self._last = now;

      var w = 2 * Math.PI / self.response;            // natural frequency
      var z = self.damping;
      var d = self.target - self.value;
      var a = w * w * d - 2 * z * w * self.velocity;  // spring + damper

      self.velocity += a * dt;
      self.value += self.velocity * dt;

      if (Math.abs(d) < 0.05 && Math.abs(self.velocity) < 0.05) {
        self.value = self.target; self.velocity = 0;
        self.onUpdate(self.value);
        self._raf = null;
        self.onRest();
        return;
      }
      self.onUpdate(self.value);
      self._raf = requestAnimationFrame(tick);
    })(performance.now());
  };

  /* Project where a flick was heading, the way scroll deceleration does.
     Exponential decay, not v²/2a, which diverges at low speed.        */
  function project(v, rate) {
    rate = rate || 0.998;
    return (v / 1000) * rate / (1 - rate);
  }

  /* Progressive resistance past a boundary, never a hard stop. */
  function rubberband(overshoot, dimension, c) {
    c = c || 0.55;
    return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
  }

  /* Rolling samples so release velocity reflects the last few frames,
     not the single last event, which is noisy.                        */
  function Tracker() { this.s = []; }
  Tracker.prototype.push = function (x, y) {
    var t = performance.now();
    this.s.push({ x: x, y: y, t: t });
    while (this.s.length > 6 || (this.s.length > 2 && t - this.s[0].t > 110)) this.s.shift();
  };
  Tracker.prototype.velocity = function () {
    if (this.s.length < 2) return { x: 0, y: 0 };
    var a = this.s[0], b = this.s[this.s.length - 1];
    var dt = (b.t - a.t) / 1000;
    if (dt <= 0) return { x: 0, y: 0 };
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  };
  Tracker.prototype.reset = function () { this.s = []; };

  window.MF = { Spring: Spring, project: project, rubberband: rubberband, Tracker: Tracker, REDUCE: REDUCE };

  /* ── reveal on scroll ─────────────────────────────────────────── */
  (function () {
    var els = document.querySelectorAll('.rv');
    if (!els.length) return;
    function showAll() { els.forEach(function (e) { e.classList.add('in'); }); }

    // Reduced motion, no observer, or a print/capture context: just show it.
    if (REDUCE || !('IntersectionObserver' in window)) { showAll(); return; }
    if (matchMedia('print').matches) { showAll(); return; }
    addEventListener('beforeprint', showAll);

    // Last resort. If anything above goes wrong, the page must still be readable.
    var net = setTimeout(showAll, 4000);
    addEventListener('load', function () { setTimeout(function () {
      els.forEach(function (e) {
        var r = e.getBoundingClientRect();
        if (r.top < innerHeight * 1.5) e.classList.add('in');
      });
    }, 300); });
    void net;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -60px' });
    els.forEach(function (e) { io.observe(e); });
  })();

  /* ── nav lifts once content passes beneath it ─────────────────── */
  (function () {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    var on = false;
    addEventListener('scroll', function () {
      var next = scrollY > 8;
      if (next !== on) { on = next; nav.classList.toggle('lifted', on); }
    }, { passive: true });
  })();

  /* ── drawer: draggable, interruptible, velocity decides commit ─── */
  (function () {
    var b = document.querySelector('.burger');
    var d = document.querySelector('.drawer');
    if (!b || !d) return;

    var W = function () { return d.getBoundingClientRect().width || innerWidth; };
    var open = false, dragging = false, startX = 0, grab = 0;
    var track = new Tracker();

    var s = new Spring(W(), {
      damping: 0.86, response: 0.34,
      onUpdate: function (v) { d.style.transform = 'translate3d(' + v + 'px,0,0)'; },
      onRest: function () { if (!open) d.style.visibility = 'hidden'; }
    });
    d.style.visibility = 'hidden';
    s.set(W());

    function setOpen(next, vel) {
      open = next;
      b.setAttribute('aria-expanded', next);
      document.body.style.overflow = next ? 'hidden' : '';
      d.classList.toggle('on', next);
      if (next) d.style.visibility = 'visible';
      if (REDUCE) { s.set(next ? 0 : W()); if (!next) d.style.visibility = 'hidden'; return; }
      s.setTarget(next ? 0 : W(), vel);
    }

    b.addEventListener('click', function () { setOpen(!open); });
    var c = d.querySelector('.close');
    if (c) c.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) setOpen(false);
    });

    // grab it mid-flight and it follows the finger from wherever it is
    d.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      dragging = true;
      d.setPointerCapture(e.pointerId);
      s.stop();
      grab = s.value;
      startX = e.clientX;
      track.reset(); track.push(e.clientX, e.clientY);
    });
    d.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      track.push(e.clientX, e.clientY);
      var dx = e.clientX - startX;
      var next = grab + dx;
      if (next < 0) next = -rubberband(-next, W());   // resist past the open edge
      s.set(next);
    });
    function release(e) {
      if (!dragging) return;
      dragging = false;
      try { d.releasePointerCapture(e.pointerId); } catch (err) {}
      var v = track.velocity().x;
      var landing = s.value + project(v);
      setOpen(landing < W() * 0.5, v);                // velocity decides, not distance
    }
    d.addEventListener('pointerup', release);
    d.addEventListener('pointercancel', release);
  })();

  /* ── hero: contain-fit slides, films load only when shown ─────── */
  (function () {
    var hero = document.querySelector('.hero');
    if (!hero) return;
    var slides = hero.querySelectorAll('.slide');
    var dots = hero.querySelectorAll('.dots button');
    var cap = hero.querySelector('.cap');
    var txt = hero.querySelector('.txt');
    if (!slides.length) return;

    var thrifty = !!(navigator.connection &&
      (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || '')));
    var allowVideo = !REDUCE && !thrifty;

    var i = 0, timer = null, visible = true;
    var hL = document.getElementById('hero-label'),
        hH = document.getElementById('hero-h'),
        hP = document.getElementById('hero-p');

    function media(slide, on) {
      slide.querySelectorAll('video').forEach(function (v) {
        if (on && allowVideo) {
          if (!v.src && v.dataset.src) v.src = v.dataset.src;
          var p = v.play(); if (p && p.catch) p.catch(function () {});
        } else { v.pause(); }
      });
    }

    function go(n) {
      i = (n + slides.length) % slides.length;
      var d = slides[i].dataset;
      var od = document.documentElement.lang === 'or';

      slides.forEach(function (s, k) {
        var on = k === i;
        s.classList.toggle('on', on);
        media(s, on && visible);
      });
      dots.forEach(function (b, k) {
        k === i ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current');
      });
      if (cap) cap.textContent = d.cap || '';

      if (hH) {
        if (txt) txt.classList.add('out');
        setTimeout(function () {
          if (hL) hL.textContent = (od && d.labelOd) || d.label || '';
          hH.textContent = (od && d.hOd) || d.h || '';
          if (hP) hP.textContent = (od && d.pOd) || d.p || '';
          if (txt) txt.classList.remove('out');
        }, REDUCE ? 0 : 260);
      }
      queue();
    }
    window.__heroRefresh = function () { go(i); };

    function queue() {
      clearTimeout(timer);
      if (REDUCE || slides.length < 2 || !visible) return;
      var hasVideo = !!slides[i].querySelector('video');
      timer = setTimeout(function () { go(i + 1); }, hasVideo && allowVideo ? 11000 : 6800);
    }

    dots.forEach(function (b, k) { b.addEventListener('click', function () { go(k); }); });

    // swipe the hero
    var track = new Tracker(), down = false, sx = 0, axis = null;
    hero.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button,a')) return;
      down = true; axis = null; sx = e.clientX;
      track.reset(); track.push(e.clientX, e.clientY);
      clearTimeout(timer);
    });
    hero.addEventListener('pointermove', function (e) {
      if (!down) return;
      track.push(e.clientX, e.clientY);
      if (axis === null) {                             // ~10px hysteresis before committing
        var dx = Math.abs(e.clientX - sx);
        var dy = Math.abs(track.s[0].y - e.clientY);
        if (dx > 10 || dy > 10) axis = dx > dy ? 'x' : 'y';
      }
    });
    function up() {
      if (!down) return;
      down = false;
      if (axis === 'x') {
        var v = track.velocity().x;
        var moved = track.s.length ? track.s[track.s.length - 1].x - sx : 0;
        var landing = moved + project(v, 0.99);
        if (landing < -60) go(i + 1);
        else if (landing > 60) go(i - 1);
        else queue();
      } else queue();
    }
    hero.addEventListener('pointerup', up);
    hero.addEventListener('pointercancel', up);

    // pause everything while the hero is off screen
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          visible = e.isIntersecting;
          if (visible) { media(slides[i], true); queue(); }
          else { clearTimeout(timer); slides.forEach(function (s) { media(s, false); }); }
        });
      }, { threshold: 0.15 }).observe(hero);
    }
    go(0);
  })();

  /* ── films: original sound, one at a time ─────────────────────── */
  document.querySelectorAll('.film').forEach(function (f) {
    var v = f.querySelector('video'), b = f.querySelector('.play');
    if (!v || !b) return;
    b.addEventListener('click', function () {
      document.querySelectorAll('.film.playing').forEach(function (o) {
        if (o !== f) {
          o.classList.remove('playing');
          var ov = o.querySelector('video');
          ov.pause(); ov.muted = true; ov.controls = false;
        }
      });
      f.classList.add('playing');
      v.muted = false; v.volume = 1; v.controls = true;
      var p = v.play();
      if (p && p.catch) p.catch(function () { v.muted = true; v.play(); });
      f.scrollIntoView({ block: 'nearest', inline: 'center', behavior: REDUCE ? 'auto' : 'smooth' });
    });
    v.addEventListener('ended', function () {
      f.classList.remove('playing');
      v.controls = false; v.muted = true; v.currentTime = 0;
    });
  });

  /* ── rails: drag to scroll, momentum on release ───────────────── */
  document.querySelectorAll('.filmwrap, .railwrap').forEach(function (w) {
    var rail = w.querySelector('.filmrail, .rail');
    var prev = w.querySelector('.rprev'), next = w.querySelector('.rnext');
    if (!rail) return;

    function sync() {
      if (!prev || !next) return;
      var max = rail.scrollWidth - rail.clientWidth - 2;
      prev.disabled = rail.scrollLeft <= 2;
      next.disabled = rail.scrollLeft >= max;
    }
    function step() {
      var card = rail.firstElementChild;
      return card ? card.getBoundingClientRect().width + 16 : rail.clientWidth * 0.8;
    }
    if (prev) prev.addEventListener('click', function () {
      rail.scrollBy({ left: -step(), behavior: REDUCE ? 'auto' : 'smooth' });
    });
    if (next) next.addEventListener('click', function () {
      rail.scrollBy({ left: step(), behavior: REDUCE ? 'auto' : 'smooth' });
    });
    rail.addEventListener('scroll', sync, { passive: true });
    addEventListener('resize', sync);
    sync();

    // pointer drag with momentum, mouse only (touch already has native inertia)
    var track = new Tracker(), down = false, sx = 0, sl = 0, moved = false, glide = null;
    rail.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse') return;
      if (e.target.closest('button,a,video')) return;
      down = true; moved = false;
      sx = e.clientX; sl = rail.scrollLeft;
      if (glide) { cancelAnimationFrame(glide); glide = null; }
      track.reset(); track.push(e.clientX, e.clientY);
      rail.style.cursor = 'grabbing';
    });
    rail.addEventListener('pointermove', function (e) {
      if (!down) return;
      track.push(e.clientX, e.clientY);
      var dx = e.clientX - sx;
      if (Math.abs(dx) > 4) moved = true;
      rail.scrollLeft = sl - dx;
    });
    function release() {
      if (!down) return;
      down = false;
      rail.style.cursor = '';
      var v = track.velocity().x;
      if (Math.abs(v) < 80) { sync(); return; }
      var to = rail.scrollLeft - project(v, 0.995);
      var max = rail.scrollWidth - rail.clientWidth;
      to = Math.max(0, Math.min(max, to));
      var s = new Spring(rail.scrollLeft, {
        damping: 1.0, response: 0.55,
        onUpdate: function (x) { rail.scrollLeft = x; sync(); }
      });
      s.setTarget(to, -v);
    }
    rail.addEventListener('pointerup', release);
    rail.addEventListener('pointercancel', release);
    rail.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  });

  /* ── lightbox: sheet you can throw away ───────────────────────── */
  (function () {
    var btns = [].slice.call(document.querySelectorAll('.mason button'));
    if (!btns.length) return;

    var lb = document.createElement('div');
    lb.className = 'lb';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Photograph viewer');
    lb.innerHTML =
      '<div class="stage"><img alt=""></div>' +
      '<button class="x" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<button class="pv" aria-label="Previous"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<button class="nx" aria-label="Next"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>' +
      '<p class="ct"></p>';
    document.body.appendChild(lb);

    var stage = lb.querySelector('.stage');
    var img = lb.querySelector('img');
    var ct = lb.querySelector('.ct');
    var cur = 0, opener = null;

    var sy = new Spring(0, {
      damping: 0.86, response: 0.34,
      onUpdate: function (v) {
        stage.style.transform = 'translate3d(0,' + v + 'px,0)';
        var f = Math.max(0, 1 - Math.abs(v) / 420);
        lb.style.background = 'rgba(10,8,7,' + (0.5 * f) + ')';
      }
    });

    function show(n) {
      cur = (n + btns.length) % btns.length;
      var t = btns[cur].querySelector('img');
      img.src = btns[cur].dataset.full || t.src;
      img.alt = t.alt;
      ct.textContent = t.alt + '  (' + (cur + 1) + ' of ' + btns.length + ')';
      lb.classList.add('on');
      document.body.style.overflow = 'hidden';
      sy.set(0);
      lb.querySelector('.x').focus();
    }
    function hide() {
      lb.classList.remove('on');
      document.body.style.overflow = '';
      img.src = '';
      sy.set(0);
      lb.style.background = '';
      if (opener) opener.focus();
    }

    btns.forEach(function (b, k) {
      b.addEventListener('click', function () { opener = b; show(k); });
    });
    lb.querySelector('.x').addEventListener('click', hide);
    lb.querySelector('.pv').addEventListener('click', function (e) { e.stopPropagation(); show(cur - 1); });
    lb.querySelector('.nx').addEventListener('click', function (e) { e.stopPropagation(); show(cur + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) hide(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('on')) return;
      if (e.key === 'Escape') hide();
      if (e.key === 'ArrowRight') show(cur + 1);
      if (e.key === 'ArrowLeft') show(cur - 1);
    });

    // drag down to dismiss, resistance upward, velocity decides
    var track = new Tracker(), down = false, gy = 0;
    stage.addEventListener('pointerdown', function (e) {
      down = true;
      stage.setPointerCapture(e.pointerId);
      sy.stop();
      gy = e.clientY - sy.value;
      track.reset(); track.push(e.clientX, e.clientY);
    });
    stage.addEventListener('pointermove', function (e) {
      if (!down) return;
      track.push(e.clientX, e.clientY);
      var next = e.clientY - gy;
      if (next < 0) next = -rubberband(-next, innerHeight);
      sy.set(next);
    });
    function up(e) {
      if (!down) return;
      down = false;
      try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
      var v = track.velocity().y;
      var landing = sy.value + project(v);
      if (landing > innerHeight * 0.28) {
        sy.setTarget(innerHeight, v);
        setTimeout(hide, 240);
      } else {
        sy.setTarget(0, v);
      }
    }
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
  })();

  /* ── gallery filters ──────────────────────────────────────────── */
  (function () {
    var fs = document.querySelectorAll('[data-filter]');
    if (!fs.length) return;
    fs.forEach(function (b) {
      b.addEventListener('click', function () {
        fs.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        var k = b.dataset.filter;
        document.querySelectorAll('.mason [data-cat]').forEach(function (it) {
          it.style.display = (k === 'all' || it.dataset.cat === k) ? '' : 'none';
        });
      });
    });
  })();

  /* ── donation pills ───────────────────────────────────────────── */
  (function () {
    var a = document.querySelectorAll('.amt');
    a.forEach(function (b) {
      b.addEventListener('click', function () {
        a.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        var o = document.getElementById('other-amount');
        if (o) o.value = b.dataset.amt || '';
      });
    });
  })();

  /* ── forms are not wired to a backend yet ─────────────────────── */
  document.querySelectorAll('form[data-noop]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var n = f.querySelector('.submitted');
      if (n) { n.hidden = false; n.scrollIntoView({ block: 'center', behavior: REDUCE ? 'auto' : 'smooth' }); }
    });
  });

  /* ── language switch ──────────────────────────────────────────── */
  (function () {
    var OD = {
      "About Us":"ଆମ ବିଷୟରେ","What We Do":"ଆମେ କ'ଣ କରୁ","Our Work":"ଆମର କାର୍ଯ୍ୟ",
      "You Can Help":"ଆପଣ ସାହାଯ୍ୟ କରିପାରିବେ","Contact":"ଯୋଗାଯୋଗ","Contact Us":"ଆମ ସହ ଯୋଗାଯୋଗ",
      "Donate Now":"ଏବେ ଦାନ କରନ୍ତୁ","Support Our Work":"ଆମ କାର୍ଯ୍ୟକୁ ସହଯୋଗ କରନ୍ତୁ",
      "Volunteer":"ସ୍ୱେଚ୍ଛାସେବୀ","Volunteer With Us":"ଆମ ସହ ସ୍ୱେଚ୍ଛାସେବୀ ହୁଅନ୍ତୁ",
      "Gallery":"ଗ୍ୟାଲେରୀ","Latest":"ସର୍ବଶେଷ","Home":"ମୂଳପୃଷ୍ଠା","Sitemap":"ସାଇଟମ୍ୟାପ",
      "The Inception":"ଆରମ୍ଭ","Our Founder":"ଆମ ପ୍ରତିଷ୍ଠାତା","The Journey":"ଆମର ଯାତ୍ରା",
      "Vision & Mission":"ଦୃଷ୍ଟି ଓ ଲକ୍ଷ୍ୟ","Legal & Registration":"ଆଇନଗତ ଓ ପଞ୍ଜୀକରଣ",
      "Activities":"କାର୍ଯ୍ୟକ୍ରମ","All Activities":"ସମସ୍ତ କାର୍ଯ୍ୟକ୍ରମ",
      "Healthcare":"ସ୍ୱାସ୍ଥ୍ୟସେବା","Food, Relief & Sanitation":"ଖାଦ୍ୟ, ରିଲିଫ ଓ ପରିମଳ",
      "Women's Empowerment":"ମହିଳା ସଶକ୍ତିକରଣ","Environment":"ପରିବେଶ",
      "Education & Youth":"ଶିକ୍ଷା ଓ ଯୁବ","Sports & Wellness":"କ୍ରୀଡ଼ା ଓ ସୁସ୍ଥତା",
      "Key focus areas":"ମୁଖ୍ୟ କାର୍ଯ୍ୟକ୍ଷେତ୍ର","Recent activities":"ସାମ୍ପ୍ରତିକ କାର୍ଯ୍ୟକ୍ରମ",
      "See the work":"କାର୍ଯ୍ୟ ଦେଖନ୍ତୁ","From the ground":"ମଇଦାନରୁ","Films":"ଚଳଚ୍ଚିତ୍ର",
      "Find Us":"ଆମକୁ ଖୋଜନ୍ତୁ","Newsroom":"ସମ୍ବାଦକକ୍ଷ","Programme":"କାର୍ଯ୍ୟକ୍ରମ",
      "Explore":"ଅଧିକ ଜାଣନ୍ତୁ","All activities":"ସମସ୍ତ କାର୍ଯ୍ୟକ୍ରମ",
      "See all our work":"ଆମର ସମସ୍ତ କାର୍ଯ୍ୟ ଦେଖନ୍ତୁ","Read our story":"ଆମ କାହାଣୀ ପଢ଼ନ୍ତୁ",
      "Open full gallery":"ସମ୍ପୂର୍ଣ୍ଣ ଗ୍ୟାଲେରୀ ଖୋଲନ୍ତୁ","Read his message":"ତାଙ୍କ ବାର୍ତ୍ତା ପଢ଼ନ୍ତୁ",
      "Become a Member":"ସଦସ୍ୟ ହୁଅନ୍ତୁ","Privacy Policy":"ଗୋପନୀୟତା ନୀତି",
      "Terms & Conditions":"ସର୍ତ୍ତାବଳୀ","Accessibility":"ଅଭିଗମ୍ୟତା",
      "Humanity is our Priority":"ମାନବିକତା ଆମର ପ୍ରାଥମିକତା",
      "Cuttack, Odisha":"କଟକ, ଓଡ଼ିଶା","Our Reach":"ଆମର ପରିସର",
      "In the field":"କ୍ଷେତ୍ରରେ","Related":"ସମ୍ପର୍କିତ","Details":"ବିବରଣୀ",
      "Date":"ତାରିଖ","Place":"ସ୍ଥାନ","Photographs":"ଫଟୋଚିତ୍ର","Phone":"ଫୋନ୍","Email":"ଇମେଲ",
      "Office":"କାର୍ଯ୍ୟାଳୟ","Address":"ଠିକଣା","Message":"ବାର୍ତ୍ତା","Send Enquiry":"ପଠାନ୍ତୁ"
    };
    var ens = [document.getElementById('lang-en'), document.getElementById('lang-en-m')].filter(Boolean);
    var ors = [document.getElementById('lang-od'), document.getElementById('lang-od-m')].filter(Boolean);
    if (!ens.length || !ors.length) return;
    var nodes = [].slice.call(document.querySelectorAll('[data-t]'));
    nodes.forEach(function (n) { n.dataset.en = n.textContent.trim(); });

    function apply(l) {
      document.documentElement.lang = (l === 'or') ? 'or' : 'en';
      nodes.forEach(function (n) {
        var e = n.dataset.en;
        n.textContent = (l === 'or' && OD[e]) ? OD[e] : e;
      });
      ors.forEach(function (b) { b.setAttribute('aria-pressed', l === 'or'); });
      ens.forEach(function (b) { b.setAttribute('aria-pressed', l !== 'or'); });
      var note = document.getElementById('lang-note');
      if (note) note.hidden = (l !== 'or');
      if (window.__heroRefresh) window.__heroRefresh();
      try { localStorage.setItem('mf-lang', l); } catch (err) {}
    }
    ens.forEach(function (b) { b.addEventListener('click', function () { apply('en'); }); });
    ors.forEach(function (b) { b.addEventListener('click', function () { apply('or'); }); });
    var saved = 'en';
    try { saved = localStorage.getItem('mf-lang') || 'en'; } catch (err) {}
    apply(saved);
  })();
})();

/* ── ambient sound ───────────────────────────────────────────────────
   Never autoplays. Off unless the visitor has previously turned it on
   and already interacted with the page. Ducks under any film.        */
(function () {
  var btns = [].slice.call(document.querySelectorAll('.snd'));
  if (!btns.length) return;
  var btn = btns[0];

  var el = new Audio('assets/audio/ambient.mp3');
  el.loop = true;
  el.preload = 'none';
  el.volume = 0;

  var TARGET = 0.22;          // background, not foreground
  var on = false, fadeRaf = null;

  function fade(to, done) {
    if (fadeRaf) cancelAnimationFrame(fadeRaf);
    var from = el.volume, t0 = performance.now(), dur = 900;
    (function step(now) {
      var k = Math.min((now - t0) / dur, 1);
      var e = 1 - Math.pow(1 - k, 3);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * e));
      if (k < 1) fadeRaf = requestAnimationFrame(step);
      else { fadeRaf = null; if (done) done(); }
    })(performance.now());
  }

  function set(next, remember) {
    on = next;
    btns.forEach(function (b) {
      b.setAttribute('aria-pressed', on);
      var l = b.querySelector('.lbl'); if (l) l.textContent = on ? 'Sound on' : 'Sound';
    });
    if (on) {
      var p = el.play();
      if (p && p.catch) p.catch(function () {          // browser refused, stay honest
        on = false;
        btns.forEach(function (b) {
          b.setAttribute('aria-pressed', false);
          var l = b.querySelector('.lbl'); if (l) l.textContent = 'Sound';
        });
      });
      fade(TARGET);
    } else {
      fade(0, function () { el.pause(); });
    }
    if (remember !== false) { try { localStorage.setItem('mf-snd', on ? '1' : '0'); } catch (e) {} }
  }

  btns.forEach(function (b) { b.addEventListener('click', function () { set(!on); }); });

  // duck away entirely while a film is playing
  document.querySelectorAll('.film video').forEach(function (v) {
    v.addEventListener('play', function () { if (on) fade(0); });
    v.addEventListener('pause', function () { if (on) fade(TARGET); });
    v.addEventListener('ended', function () { if (on) fade(TARGET); });
  });

  // quieten when the tab is in the background
  document.addEventListener('visibilitychange', function () {
    if (!on) return;
    fade(document.hidden ? 0 : TARGET);
  });

  // Restore a previous choice, but a browser still needs a real gesture
  // before it will let anything make a sound, so wait for the first one.
  var wanted = false;
  try { wanted = localStorage.getItem('mf-snd') === '1'; } catch (e) {}
  if (wanted && !MF.REDUCE) {
    var arm = function () {
      document.removeEventListener('pointerdown', arm);
      document.removeEventListener('keydown', arm);
      set(true, false);
    };
    document.addEventListener('pointerdown', arm, { once: true });
    document.addEventListener('keydown', arm, { once: true });
  }
})();



/* ── numbers count up, once, when the band arrives ───────────────────
   The markup already carries the final text, so if this never runs the
   correct figure is still on the page. We only borrow it for a moment. */
(function () {
  var els = document.querySelectorAll('.stat b[data-count]');
  if (!els.length) return;
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;

  function run(el) {
    var target = parseInt(el.dataset.count, 10);
    if (!isFinite(target) || target <= 0) return;

    // keep the suffix and the estimate marker exactly as authored
    var final = el.innerHTML;
    var plain = el.textContent;
    var pre   = plain.slice(0, plain.search(/[0-9]/));
    var post  = plain.slice(plain.search(/[0-9]/)).replace(/[0-9,]/g, '');

    // hold the width so the layout cannot twitch while the digits change
    el.style.minWidth = el.getBoundingClientRect().width + 'px';
    el.style.display  = 'inline-block';

    var dur = 1500, t0 = null;
    function frame(t) {
      if (t0 === null) t0 = t;
      var p = Math.min((t - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 4);          // decelerate, no bounce
      if (p < 1) {
        el.textContent = pre + Math.round(target * e).toLocaleString('en-IN') + post;
        requestAnimationFrame(frame);
      } else {
        el.innerHTML = final;                   // exact, including the asterisk
        el.style.minWidth = '';
        el.style.display = '';
      }
    }
    el.textContent = pre + '0' + post;
    requestAnimationFrame(frame);
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);                   // once per page load
      run(e.target);
    });
  }, { threshold: 0.5 });
  els.forEach(function (e) { io.observe(e); });
})();
