/* 

The Kawaii Spatial Diorama, UI layer (panels, audio, forms, slider). 

 
*/
(function(){
  'use strict';
  var doc = document, body = doc.body;
  var $ = function(s, r){ return (r || doc).querySelector(s); };
  var $$ = function(s, r){ return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var SECTIONS = ['hero', 'gallery', 'cabinet', 'mail'];
  var SOUND_KEY = 'gm635-sound';

  var Bus = window.GM635 = {
    mode: 'room',
    engine: null,
    reduced: !!(mq && mq.matches),
    sections: SECTIONS
  };
  if (mq) {
    var onMq = function(){ Bus.reduced = mq.matches; };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  }

  /* ---------------- Audio: modal marimba bars, glass bells, chord swell ---------------- */
  var Sound = Bus.audio = {
    ctx: null, dry: null, wet: null, enabled: true, stepIdx: 0,
    load: function(){ try { if (localStorage.getItem(SOUND_KEY) === 'off') this.enabled = false; } catch (e) {} },
    save: function(){ try { localStorage.setItem(SOUND_KEY, this.enabled ? 'on' : 'off'); } catch (e) {} },
    arm: function(){
      if (!this.enabled) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) { try { this.build(new AC()); } catch (e) { this.ctx = null; return; } }
      if (this.ctx.state === 'suspended') { var p = this.ctx.resume(); if (p && p.catch) p.catch(function(){}); }
    },
    build: function(ctx){
      this.ctx = ctx;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
      var master = ctx.createGain(); master.gain.value = 0.85;
      master.connect(comp); comp.connect(ctx.destination);
      var conv = ctx.createConvolver();
      conv.normalize = false;               /* unit-energy IR below keeps the wet level honest */
      conv.buffer = this.impulse(ctx, 2.6);
      var wetGain = ctx.createGain(); wetGain.gain.value = 0.55;
      conv.connect(wetGain); wetGain.connect(master);
      this.dry = master; this.wet = conv;
    },
    impulse: function(ctx, sec){
      var rate = ctx.sampleRate, len = Math.floor(rate * sec), buf = ctx.createBuffer(2, len, rate);
      for (var ch = 0; ch < 2; ch++) {
        var d = buf.getChannelData(ch), e = 0, i, t, v;
        for (i = 0; i < len; i++) { t = i / len; v = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.8) * (0.55 + 0.45 * Math.exp(-t * 18)); d[i] = v; e += v * v; }
        var s = 1 / Math.sqrt(e || 1);
        for (i = 0; i < len; i++) d[i] *= s;
      }
      return buf;
    },
    live: function(){ return !!(this.enabled && this.ctx && this.ctx.state === 'running'); },
    voice: function(send){
      var c = this.ctx, g = c.createGain(), s = c.createGain();
      g.connect(this.dry); s.gain.value = send; g.connect(s); s.connect(this.wet);
      return g;
    },
    partials: function(out, f, t, v, modes, atk){
      var c = this.ctx, ny = c.sampleRate * 0.45;
      modes.forEach(function(m){
        var fr = f * m[0]; if (fr > ny) return;
        var o = c.createOscillator(), e = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(fr, t);
        e.gain.setValueAtTime(0.0001, t);
        e.gain.linearRampToValueAtTime(v * m[1], t + atk);
        e.gain.exponentialRampToValueAtTime(0.0001, t + m[2]);
        o.connect(e); e.connect(out); o.start(t); o.stop(t + m[2] + 0.05);
      });
    },
    /* Wooden bar: marimba mode ratios 1 : 3.93 : 9.24 with a short mallet knock */
    bar: function(f, t, v, send){
      var c = this.ctx, out = this.voice(send);
      this.partials(out, f, t, v, [[1, 1, 0.5], [3.93, 0.28, 0.14], [9.24, 0.07, 0.05]], 0.004);
      var k = c.createOscillator(), ke = c.createGain();
      k.type = 'triangle'; k.frequency.setValueAtTime(f * 0.5, t); k.frequency.exponentialRampToValueAtTime(f * 0.25, t + 0.03);
      ke.gain.setValueAtTime(0.0001, t); ke.gain.linearRampToValueAtTime(v * 0.22, t + 0.002); ke.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      k.connect(ke); ke.connect(out); k.start(t); k.stop(t + 0.06);
    },
    /* Glass bell: inharmonic free-plate ratios */
    bell: function(f, t, v, send){
      this.partials(this.voice(send), f, t, v, [[1, 1, 2.4], [2.756, 0.45, 1.5], [5.404, 0.22, 0.9], [8.933, 0.1, 0.5]], 0.006);
    },
    tap: function(){
      if (!this.live()) return;
      var seq = [0, 2, 4, 2, 3, 1, 4, 5];
      var notes = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];
      this.bar(notes[seq[this.stepIdx++ % seq.length]], this.ctx.currentTime + 0.004, 0.16, 0.14);
    },
    chime: function(){
      if (!this.live()) return;
      var t = this.ctx.currentTime + 0.01, self = this;
      [1318.51, 1975.53, 2637.02].forEach(function(f, i){ self.bell(f, t + i * 0.075, 0.11 - i * 0.02, 0.5); });
    },
    hop: function(){
      if (!this.live()) return;
      var t = this.ctx.currentTime + 0.004;
      this.bar(1318.51, t, 0.12, 0.18); this.bar(1975.53, t + 0.055, 0.1, 0.22);
    },
    /* Drawer open: a bright wooden bar that rises a step per drawer, plus a soft upper chirp */
    drawerOpen: function(i){
      if (!this.live()) return;
      var t = this.ctx.currentTime + 0.01, f = 783.99 * Math.pow(2, i * 2 / 12);
      this.bar(f, t, 0.14, 0.25);
      this.bar(f * 1.5, t + 0.06, 0.06, 0.3);
    },
    /* Drawer close: the open gesture in reverse. A soft-mallet wooden bar that steps down
       a fourth, warm and rounded (slow attack, low upper partial, gentle lowpass) */
    drawerClose: function(i, soft){
      if (!this.live()) return;
      var c = this.ctx, t = c.currentTime + 0.01, f = 1174.66 * Math.pow(2, i * 2 / 12), v = soft ? 0.55 : 1;
      var out = this.voice(0.3);
      var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.4;
      lp.connect(out);
      var mallet = [[1, 1, 0.5], [3.93, 0.08, 0.09]];
      this.partials(lp, f, t, 0.11 * v, mallet, 0.009);
      this.partials(lp, f * 0.75, t + 0.085, 0.1 * v, [[1, 1, 0.7], [3.93, 0.06, 0.1]], 0.01);
    },
    /* Secret found: a music-box run up the pentatonic scale */
    secret: function(){
      if (!this.live()) return;
      var t = this.ctx.currentTime + 0.01, self = this;
      [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093].forEach(function(f, i){ self.bell(f, t + i * 0.07, 0.07, 0.45); });
    },
    /* Water drop: a round sine plop that glides up, stepping higher each drop */
    drop: function(n){
      if (!this.live()) return;
      var c = this.ctx, t = c.currentTime + 0.01, base = [587.33, 698.46, 880][Math.max(0, Math.min(2, n - 1))];
      var out = this.voice(0.35), o = c.createOscillator(), e = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * 2, t + 0.09);
      e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(0.16, t + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(e); e.connect(out); o.start(t); o.stop(t + 0.3);
      this.bar(base * 2, t + 0.1, 0.06, 0.35);
    },
    /* Bloom: soft chord swell with a sparkle of glass bells on top */
    bloom: function(){
      if (!this.live()) return;
      this.swell();
      var t = this.ctx.currentTime + 0.3, self = this;
      [2093, 2349.32, 2637.02, 3135.96].forEach(function(f, i){ self.bell(f, t + i * 0.09, 0.05, 0.6); });
    },
    back: function(){
      if (!this.live()) return;
      var t = this.ctx.currentTime + 0.01;
      this.bar(1567.98, t, 0.13, 0.2); this.bar(1174.66, t + 0.09, 0.11, 0.2);
    },
    swell: function(){
      if (!this.live()) return;
      var c = this.ctx, t = c.currentTime + 0.02, self = this;
      var out = this.voice(0.6);
      var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
      lp.frequency.setValueAtTime(320, t); lp.frequency.exponentialRampToValueAtTime(2800, t + 1.1); lp.frequency.exponentialRampToValueAtTime(1100, t + 3.2);
      lp.connect(out);
      var amp = c.createGain();
      amp.gain.setValueAtTime(0.0001, t); amp.gain.exponentialRampToValueAtTime(0.5, t + 0.9); amp.gain.setTargetAtTime(0.0001, t + 1.6, 0.7);
      amp.connect(lp);
      [261.63, 329.63, 392.0, 523.25, 659.25].forEach(function(f){
        [-6, 6].forEach(function(dt){
          var o = c.createOscillator(), g = c.createGain();
          o.type = 'triangle'; o.frequency.value = f; o.detune.value = dt; g.gain.value = 0.05;
          o.connect(g); g.connect(amp); o.start(t); o.stop(t + 5);
        });
      });
      [1046.5, 1318.51, 1567.98, 2093].forEach(function(f, i){ self.bell(f, t + 0.55 + i * 0.11, 0.07, 0.6); });
    },
    setEnabled: function(on){
      this.enabled = on; this.save();
      if (on) this.arm(); else if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
      syncSoundBtn();
    }
  };
  Sound.load();
  var soundBtn = $('#soundBtn');
  function syncSoundBtn(){
    soundBtn.setAttribute('aria-pressed', Sound.enabled ? 'true' : 'false');
    soundBtn.setAttribute('aria-label', Sound.enabled ? 'Sound on. Turn sound off' : 'Sound off. Turn sound on');
  }
  syncSoundBtn();
  soundBtn.addEventListener('click', function(){ Sound.setEnabled(!Sound.enabled); if (Sound.enabled) Sound.chime(); });
  /* Arm on the first real gesture, never before */
  window.addEventListener('pointerdown', function(){ Sound.arm(); }, true);
  window.addEventListener('keydown', function(){ Sound.arm(); }, true);

  /* ---------------- Panels ---------------- */
  var panels = { hero: $('#panel-hero'), gallery: $('#panel-gallery'), cabinet: $('#panel-cabinet'), mail: $('#panel-mail'), secret: $('#panel-secret') };
  var lastTrigger = null;

  $$('[data-stagger]').forEach(function(wrap){
    Array.prototype.forEach.call(wrap.children, function(el, i){ el.style.setProperty('--i', i); });
  });
  $$('.card').forEach(function(el, i){ el.style.setProperty('--i', i); });

  function setInert(el, on){ if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); try { el.inert = on; } catch (e) {} }

  function showPanel(id){
    var el = panels[id]; if (!el || Bus.mode !== id) return;
    if (id === 'mail') bloomOrigin();
    setInert(el, false);
    void el.offsetWidth;
    el.classList.add('is-open');
    var h = $('.panel__head', el);
    if (h) { try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
  }
  function hidePanel(id){
    var el = panels[id]; if (!el) return;
    el.classList.remove('is-open');
    setInert(el, true);
    if (id === 'cabinet') closeDrawers();
  }
  function bloomOrigin(){
    var el = panels.mail, r = el.getBoundingClientRect();
    var p = Bus.engine ? Bus.engine.project('mail') : null;
    var x = p ? p.x - r.left : r.width / 2, y = p ? p.y - r.top : r.height / 2;
    el.style.setProperty('--ox', Math.round(x) + 'px');
    el.style.setProperty('--oy', Math.round(y) + 'px');
    var far = 0;
    [[0, 0], [r.width, 0], [0, r.height], [r.width, r.height]].forEach(function(c){ far = Math.max(far, Math.hypot(c[0] - x, c[1] - y)); });
    el.style.setProperty('--or', Math.ceil(far + 24) + 'px');
  }

  function open(id, stay){
    if (!panels[id] || Bus.mode === id) return;
    var prev = Bus.mode;
    if (prev !== 'room') hidePanel(prev);
    else lastTrigger = doc.activeElement && doc.activeElement !== body ? doc.activeElement : null;
    Bus.mode = id;
    body.setAttribute('data-mode', id);
    if (id === 'secret') Sound.secret(); else Sound.chime();
    var reveal = function(){ showPanel(id); };
    if (Bus.engine && !stay) Bus.engine.focus(id, reveal); else reveal();
  }
  function close(){
    if (Bus.mode === 'room') return;
    var id = Bus.mode;
    hidePanel(id);
    Bus.mode = 'room';
    body.setAttribute('data-mode', 'room');
    Sound.back();
    if (Bus.engine) Bus.engine.home();
    var target = lastTrigger && doc.contains(lastTrigger) && !lastTrigger.closest('[inert]') ? lastTrigger : $('.dock__btn[data-open="' + id + '"]');
    if (target) { try { target.focus({ preventScroll: true }); } catch (e) {} }
  }
  Bus.open = open; Bus.close = close;

  doc.addEventListener('click', function(e){
    var t = e.target.closest ? e.target.closest('[data-open],[data-go]') : null;
    if (!t) return;
    open(t.getAttribute('data-open') || t.getAttribute('data-go'));
  });
  $('#backBtn').addEventListener('click', close);
  $('#resetBtn').addEventListener('click', function(){ if (Bus.mode !== 'room') close(); else if (Bus.engine) Bus.engine.resetView(); });

  doc.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && Bus.mode !== 'room') { e.preventDefault(); close(); return; }
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4) { e.preventDefault(); open(SECTIONS[n - 1]); }
  });

  /* ---------------- Smooth wheel scrolling (panels + gallery) ---------------- */
  function wheelDelta(e, el, horizontal){
    var d = horizontal && Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (horizontal && Math.abs(e.deltaX) > 0 && Math.abs(e.deltaY) === 0 ? e.deltaX : e.deltaY);
    if (e.deltaMode === 1) d *= 18; else if (e.deltaMode === 2) d *= horizontal ? el.clientWidth : el.clientHeight;
    return d;
  }
  function smoothScroller(el, horizontal, opts){
    opts = opts || {};
    var prop = horizontal ? 'scrollLeft' : 'scrollTop';
    var st = { target: 0, cur: 0, raf: 0, last: 0 };
    function max(){ return horizontal ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight; }
    function tick(){
      var now = performance.now(), dt = Math.max(0.001, Math.min(0.05, (now - st.last) / 1000)); st.last = now;
      st.cur += (st.target - st.cur) * (1 - Math.exp(-dt * 14));
      if (Math.abs(st.target - st.cur) < 0.5) st.cur = st.target;
      el[prop] = st.cur;
      if (st.cur !== st.target) st.raf = requestAnimationFrame(tick);
      else { st.raf = 0; if (opts.onSettle) opts.onSettle(st); }
    }
    el.addEventListener('wheel', function(e){
      if (e.ctrlKey || Bus.reduced) return;
      var ta = e.target.closest && e.target.closest('textarea');
      if (ta && ta.scrollHeight > ta.clientHeight + 1) return;
      var m = max(); if (m <= 0) return;
      var d = wheelDelta(e, el, horizontal);
      if (!st.raf) { st.cur = el[prop]; st.target = st.cur; }
      var next = Math.max(0, Math.min(m, st.target + d));
      if (next === st.target && (next === 0 || next === m)) return;
      e.preventDefault();
      st.target = next;
      if (opts.onStart) opts.onStart(st);
      if (!st.raf) { st.last = performance.now(); st.raf = requestAnimationFrame(tick); }
    }, { passive: false });
    el.addEventListener('pointerdown', function(){ if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; } });
    return {
      stop: function(){ if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; } },
      get target(){ return st.target; },
      get running(){ return !!st.raf; },
      glideTo: function(v){ if (!st.raf) st.cur = el[prop]; st.target = Math.max(0, Math.min(max(), v)); if (!st.raf) { st.last = performance.now(); st.raf = requestAnimationFrame(tick); } }
    };
  }
  ['hero', 'cabinet', 'mail', 'secret'].forEach(function(id){ smoothScroller(panels[id], false); });

  /* ---------------- Gallery slider ---------------- */
  var track = $('#track'), cards = $$('.card', track), count = $('#galCount');
  var dragging = false, dragMoved = false, startX = 0, startScroll = 0, pid = null;

  function cardIndexNearest(){
    var best = 0, bestD = Infinity, left = track.scrollLeft;
    cards.forEach(function(c, i){ var d = Math.abs(cardLeft(i) - left); if (d < bestD) { bestD = d; best = i; } });
    return best;
  }
  function updateCount(){ count.textContent = (cardIndexNearest() + 1) + ' / ' + cards.length; }
  track.addEventListener('scroll', updateCount, { passive: true });
  /* wheel glides the row (vertical wheel maps to horizontal), then eases onto the nearest card */
  var snapTimer = 0;
  function cardLeft(i){ return cards[i].offsetLeft - track.offsetLeft - parseFloat(getComputedStyle(track).paddingLeft || 0); }
  function nearestTo(x){ var best = 0, bd = Infinity; cards.forEach(function(c, i){ var d = Math.abs(cardLeft(i) - x); if (d < bd) { bd = d; best = i; } }); return best; }
  /* when the wheel stops, retarget the glide already in flight onto the nearest card, so it never pauses */
  var trackWheel = smoothScroller(track, true, {
    onStart: function(){
      track.classList.add('is-wheeling');
      clearTimeout(snapTimer);
      snapTimer = setTimeout(function(){
        snapTimer = 0;
        var x = Math.max(0, Math.min(track.scrollWidth - track.clientWidth, cardLeft(nearestTo(trackWheel.target))));
        trackWheel.glideTo(x);
      }, 90);
    },
    onSettle: function(){ if (!snapTimer) track.classList.remove('is-wheeling'); }
  });
  function step(dir){
    var i = Math.max(0, Math.min(cards.length - 1, cardIndexNearest() + dir));
    trackWheel.stop(); track.classList.remove('is-wheeling');
    track.scrollTo({ left: cardLeft(i), behavior: Bus.reduced ? 'auto' : 'smooth' });
    rippleCard(i, 0.5, 0.5);
  }
  $('#galPrev').addEventListener('click', function(){ step(-1); });
  $('#galNext').addEventListener('click', function(){ step(1); });
  track.addEventListener('keydown', function(e){
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });

  function endDrag(){
    if (!dragging) return;
    dragging = false; pid = null;
    track.classList.remove('is-dragging');
  }
  track.addEventListener('pointerdown', function(e){
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    dragging = true; dragMoved = false; startX = e.clientX; startScroll = track.scrollLeft; pid = e.pointerId;
    try { track.setPointerCapture(pid); } catch (err) {}
  });
  track.addEventListener('pointermove', function(e){
    if (!dragging || e.pointerId !== pid) return;
    var dx = e.clientX - startX;
    if (Math.abs(dx) > 4) { dragMoved = true; track.classList.add('is-dragging'); }
    track.scrollLeft = startScroll - dx;
  });
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('lostpointercapture', endDrag);
  window.addEventListener('blur', endDrag);
  track.addEventListener('click', function(e){ if (dragMoved) { e.preventDefault(); e.stopPropagation(); dragMoved = false; } }, true);
  track.addEventListener('dragstart', function(e){ e.preventDefault(); });

  function rippleCard(i, u, v){
    if (Bus.engine && Bus.mode === 'gallery') Bus.engine.ripple(i, u, v, cards[i].querySelector('img'));
  }
  cards.forEach(function(card, i){
    var vid = card.querySelector('video');
    if (vid) {
      card.addEventListener('pointerenter', function(){ vid.play().catch(function(){}); });
      card.addEventListener('pointerleave', function(){ vid.pause(); });
      card.addEventListener('focus', function(){ vid.play().catch(function(){}); });
      card.addEventListener('blur', function(){ vid.pause(); });
    }
    card.addEventListener('pointerenter', function(e){
      var r = card.getBoundingClientRect();
      rippleCard(i, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    });
    card.addEventListener('pointermove', function(e){
      if (!Bus.engine || dragging) return;
      var r = card.getBoundingClientRect();
      Bus.engine.rippleMove(i, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    });
    card.addEventListener('focus', function(){ rippleCard(i, 0.5, 0.5); });
  });

  /* ---------------- Cabinet drawers (click only) ---------------- */
  var drawerBtns = $$('.drawer__btn');
  function setDrawer(btn, on){
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (Bus.engine) Bus.engine.drawer(+btn.getAttribute('data-drawer'), on);
  }
  function closeDrawers(){ drawerBtns.forEach(function(b){ if (b.getAttribute('aria-expanded') === 'true') setDrawer(b, false); }); }
  drawerBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      var on = btn.getAttribute('aria-expanded') !== 'true', idx = +btn.getAttribute('data-drawer');
      var swapped = false;
      drawerBtns.forEach(function(b){ if (b !== btn && b.getAttribute('aria-expanded') === 'true') { setDrawer(b, false); swapped = true; Sound.drawerClose(+b.getAttribute('data-drawer'), true); } });
      setDrawer(btn, on);
      if (on) Sound.drawerOpen(idx); else Sound.drawerClose(idx, false);
    });
  });

  /* ---------------- Secret sprout ---------------- */
  var sproutStage = 0, waterBtn = $('#waterBtn'), meter = $$('.sprout-meter li');
  waterBtn.addEventListener('click', function(){
    if (sproutStage >= 3) return;
    sproutStage++;
    meter.forEach(function(li, i){ li.classList.toggle('is-full', i < sproutStage); });
    $('#sproutCount').textContent = sproutStage + ' of 3 drops';
    Sound.drop(sproutStage);
    if (Bus.engine && Bus.engine.grow) Bus.engine.grow(sproutStage);
    if (sproutStage < 3) { $('#sproutNote').textContent = sproutStage === 1 ? 'A little taller. Two more.' : 'Almost there. One more.'; return; }
    waterBtn.disabled = true;
    setTimeout(function(){
      panels.secret.classList.add('is-bloomed');
      Sound.bloom();
      if (Bus.engine && Bus.engine.bloom) Bus.engine.bloom();
      var h = $('#secret-title'); try { h.focus({ preventScroll: true }); } catch (e) {}
    }, 420);
  });
  Bus.sprout = function(){ return sproutStage; };

  /* ---------------- Mail form ---------------- */
  var form = $('#mailForm'), wrap = $('#formWrap');
  /* Paste your Google Apps Script web app URL (ends in /exec) here to send wishes to the sheet. */
  var SHEET_URL = 'https://script.google.com/macros/s/AKfycbwzkACDDSheLdz2zKhCTipsqO6f4y4RlyGjZl_GeJfozE25GXYXQATWEHHOuelqHJ8A/exec';
  var rules = {
    message: function(v){ return v.trim().length >= 10 ? '' : 'Write at least 10 characters for your wish.'; }
  };
  function check(field){
    var msg = rules[field.name](field.value);
    field.setAttribute('aria-invalid', msg ? 'true' : 'false');
    $('#' + field.getAttribute('aria-describedby')).textContent = msg;
    return !msg;
  }
  ['message'].forEach(function(n){
    var f = form.elements[n];
    f.addEventListener('blur', function(){ if (f.value) check(f); });
    f.addEventListener('input', function(){ if (f.getAttribute('aria-invalid') === 'true') check(f); });
  });
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var bad = null;
    ['message'].forEach(function(n){ var f = form.elements[n]; if (!check(f) && !bad) bad = f; });
    if (bad) { bad.focus(); return; }
    if (SHEET_URL) {
      var roles = $$('input[name="topic"]:checked', form).map(function(c){ return c.value; }).join(', ');
      var data = new URLSearchParams({ roles: roles, message: form.elements.message.value.trim() });
      try { fetch(SHEET_URL, { method: 'POST', mode: 'no-cors', body: data }); } catch (err) {}
    }
    wrap.classList.add('is-sent');
    Sound.swell();
    if (Bus.engine) Bus.engine.celebrate();
    var sent = $('#sent'); sent.setAttribute('tabindex', '-1'); try { sent.focus({ preventScroll: true }); } catch (err) {}
  });
  $('#againBtn').addEventListener('click', function(){
    form.reset();
    ['message'].forEach(function(n){ form.elements[n].removeAttribute('aria-invalid'); });
    $$('.err', form).forEach(function(s){ s.textContent = ''; });
    wrap.classList.remove('is-sent');
    form.elements.message.focus();
  });

  /* ---------------- Birthday: name from ?name=, confetti, auto-open ---------------- */
  var confettiEl = $('#confetti');
  function confetti(n){
    if (Bus.reduced) return;
    var colors = ['#FFD1DC', '#C8E6C9', '#E6E6FA', '#FFE27A', '#9FD8FF', '#FFC3D3'];
    for (var i = 0; i < n; i++) {
      var p = doc.createElement('i'), r = Math.random;
      p.style.cssText = '--x:' + (r() * 100).toFixed(1) + 'vw;--w:' + (6 + r() * 8).toFixed(0) + 'px;--h:' + (8 + r() * 10).toFixed(0) +
        'px;--c:' + colors[i % colors.length] + ';--rd:' + (r() < 0.4 ? '50%' : '2px') + ';--d:' + (2.6 + r() * 2).toFixed(2) +
        's;--dl:' + (r() * 0.9).toFixed(2) + 's;--dx:' + ((r() - 0.5) * 240).toFixed(0) + 'px;--rot:' + ((r() - 0.5) * 1080).toFixed(0) + 'deg';
      confettiEl.appendChild(p);
      setTimeout(function(el){ el.remove(); }, 6500, p);
    }
  }
  Bus.confetti = confetti;
  var guestName = 'Urvi';
  try {
    var who = new URLSearchParams(location.search).get('name');
    if (who && who.trim()) { guestName = who.trim().slice(0, 30); $('#bdayName').textContent = 'dear ' + guestName + '!'; }
  } catch (e) {}

  /* ---------------- Engine handshake ---------------- */
  var loaderText = $('#loaderText');
  var failTimer = setTimeout(function(){ if (!Bus.engine) Bus.fail('timeout'); }, 12000);
  Bus.attach = function(engine){
    clearTimeout(failTimer);
    Bus.engine = engine;
    body.classList.add('is-ready');
    body.classList.remove('no-3d');
    greet();
  };
  /* Land on the birthday message: fly into the TV and open the hero panel */
  var greeted = false;
  function greet(){
    if (greeted) return; greeted = true;
    var say = $('#mochiSay'), txt = $('#sayTxt'), hops = 0;
    function alive(){ return Bus.mode === 'room'; }
    var typer = 0;
    function type(msg){
      var chars = Array.from(msg), i = 0, id = ++typer;
      txt.textContent = '';
      (function next(){
        if (id !== typer) return;
        txt.textContent += chars[i++];
        if (i < chars.length) setTimeout(next, /[,.!?]/.test(chars[i - 1]) ? 160 : 38);
      })();
    }
    function speak(msg, then){
      txt.classList.add('is-swap');
      setTimeout(function(){ txt.classList.remove('is-swap'); say.classList.add('is-on'); type(msg); if (then) then(); }, say.classList.contains('is-on') ? 260 : 0);
    }
    /* Uvi hops 5 times with the birthday line over its head */
    function jump(){
      if (!alive()) { say.classList.remove('is-on'); return; }
      if (Bus.engine) { Bus.engine.hop(4.4); Sound.hop(); }
      if (++hops < 5) setTimeout(jump, 1000);
      else setTimeout(intro, 1300);
    }
    /* then Uvi introduces itself, and the bubble fades away */
    function intro(){
      if (!alive()) { say.classList.remove('is-on'); return; }
      speak("Hi, I'm Uvi, your little companion! Let's make your birthday extra special \u2728");
      setTimeout(function(){ say.classList.remove('is-on'); }, 6500);
    }
    setTimeout(function(){
      if (!alive()) return;
      speak('Happy Birthday to you, ' + guestName + '! \uD83C\uDF82', jump);
      confetti(90);
    }, 500);
  }
  Bus.fail = function(){
    if (Bus.engine) return;
    clearTimeout(failTimer);
    body.classList.add('no-3d');
    loaderText.textContent = 'The 3D room could not start here. Use the bar below to open each object.';
    setTimeout(function(){ body.classList.add('is-ready'); greet(); }, 5000);
  };
})();
