/* ------------------------------------------------------------------
   Deterministic timeline engine. The renderer calls stage.render(t) for
   every frame (t in seconds); everything visible is a pure function of the
   events/tweens that have fired up to t. The extension popup's own timers
   run on __vclock, which advances in lockstep.
   ------------------------------------------------------------------ */

window.__vclock = {
  epoch: new Date(2026, 9, 11, 13, 5, 0).getTime(),
  now: 0,
  seq: 1,
  timers: [],
  setTimeout(fn, ms, args) {
    const id = this.seq++;
    this.timers.push({ id, due: this.now + Math.max(0, +ms || 0), fn, args, every: 0 });
    return id;
  },
  setInterval(fn, ms, args) {
    const id = this.seq++;
    const every = Math.max(1, +ms || 0);
    this.timers.push({ id, due: this.now + every, fn, args, every });
    return id;
  },
  clear(id) {
    this.timers = this.timers.filter((t) => t.id !== id);
  },
  advanceTo(ms) {
    for (let guard = 0; guard < 20000; guard++) {
      let next = null;
      for (const t of this.timers) if (t.due <= ms && (!next || t.due < next.due || (t.due === next.due && t.id < next.id))) next = t;
      if (!next) break;
      this.now = Math.max(this.now, next.due);
      if (next.every) next.due += next.every;
      else this.timers = this.timers.filter((t) => t !== next);
      try {
        typeof next.fn === 'function' && next.fn(...(next.args || []));
      } catch (e) {
        console.error('popup timer error', e);
      }
    }
    this.now = Math.max(this.now, ms);
  }
};

const ease = {
  linear: (p) => p,
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  out: (p) => 1 - Math.pow(1 - p, 3),
  in: (p) => p * p * p
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, p) => a + (b - a) * p;

const TL = { events: [], rings: [], dims: [], clicks: [], caps: [], cards: [], steps: [], cues: [], end: 0 };
let evSeq = 0;
function ev(t, fn) {
  TL.events.push({ t, fn, i: evSeq++ });
}

const activeTweens = [];
function tween(t0, dur, start, update, easing = ease.inOut) {
  const tw = { t0, t1: t0 + Math.max(dur, 1e-3), start, update, easing, ctx: null };
  ev(t0, () => {
    tw.ctx = tw.start ? tw.start() : null;
    activeTweens.push(tw);
  });
  return tw;
}
// Plain property animation helper: fn(p) with eased p in [0,1].
function anim(t0, dur, fn, easing = ease.inOut) {
  return tween(t0, dur, null, (p) => fn(p), easing);
}

/* ---------------- Camera (visible rect of the 1920x1080 screen) ---------------- */
const cam = { x: 0, y: 0, w: 1920 };
function camRectFor(target, scale) {
  const w = 1920 / scale;
  const hgt = w * (1080 / 1920);
  if (!target) return { x: 0, y: 0, w: 1920 };
  const r = resolveRect(target);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return { x: clamp(cx - w / 2, 0, 1920 - w), y: clamp(cy - hgt / 2, 0, 1080 - hgt), w };
}
function camTo(t0, dur, target, scale = 1) {
  tween(
    t0,
    dur,
    () => ({ from: { ...cam }, to: camRectFor(target, scale) }),
    (p, c) => {
      cam.w = Math.exp(lerp(Math.log(c.from.w), Math.log(c.to.w), p));
      cam.x = lerp(c.from.x, c.to.x, p);
      cam.y = lerp(c.from.y, c.to.y, p);
    }
  );
}
function camReset(t0, dur = 0.9) {
  camTo(t0, dur, null, 1);
}
function camTransform() {
  const s = 1920 / cam.w;
  return { s, tx: -cam.x * s, ty: -cam.y * s };
}

/* ---------------- Targets ---------------- */
// Rect of a stage element in unscaled stage coordinates.
function stageRect(el) {
  const r = el.getBoundingClientRect();
  const { s, tx, ty } = camTransform();
  return { x: (r.left - tx) / s, y: (r.top - ty) / s, w: r.width / s, h: r.height / s };
}
const S = (sel) => () => {
  const el = document.querySelector(sel);
  if (!el) throw new Error('missing stage element ' + sel);
  return stageRect(el);
};
// Element inside the extension popup iframe.
const P = (sel) => () => {
  const frame = Popup.frame;
  if (!frame) throw new Error('popup not open for ' + sel);
  const fr = stageRect(frame);
  const el = frame.contentDocument.querySelector(sel);
  if (!el) throw new Error('missing popup element ' + sel);
  const r = el.getBoundingClientRect();
  return { x: fr.x + r.left, y: fr.y + r.top, w: r.width, h: r.height };
};
const R = (x, y, w, hh) => () => ({ x, y, w, h: hh });
// Rect from the real chrome://extensions capture (page coordinates -> stage).
const X = (name) => () => {
  const b = BOXES[name];
  return { x: b.x, y: b.y + 87, w: b.w, h: b.h };
};
function resolveRect(target) {
  if (typeof target === 'function') return target();
  if (typeof target === 'string') return S(target)();
  return target;
}
function resolvePoint(target, ox = 0.5, oy = 0.5) {
  const r = resolveRect(target);
  return { x: r.x + (r.w || 0) * ox, y: r.y + (r.h || 0) * oy };
}

/* ---------------- Cursor ---------------- */
const cur = { x: 1180, y: 640, shape: 'arrow', pressAt: -10 };
function move(t0, dur, target, { shape = 'arrow', ox = 0.5, oy = 0.5, arc = 0.1 } = {}) {
  tween(
    t0,
    dur,
    () => {
      const to = resolvePoint(target, ox, oy);
      return { fx: cur.x, fy: cur.y, tx: to.x, ty: to.y };
    },
    (p, c) => {
      const mx = (c.fx + c.tx) / 2;
      const my = (c.fy + c.ty) / 2;
      const cx = mx - (c.ty - c.fy) * arc;
      const cy = my + (c.tx - c.fx) * arc;
      const q = 1 - p;
      cur.x = q * q * c.fx + 2 * q * p * cx + p * p * c.tx;
      cur.y = q * q * c.fy + 2 * q * p * cy + p * p * c.ty;
    }
  );
  ev(t0 + dur * 0.8, () => (cur.shape = shape));
  return t0 + dur;
}
function click(t, fn) {
  const c = { t, x: 0, y: 0 };
  TL.clicks.push(c);
  ev(t, () => {
    c.x = cur.x;
    c.y = cur.y;
    cur.pressAt = t;
  });
  if (fn) ev(t + 0.06, fn);
  return t;
}
// Move to a target then click it. Returns the click time.
function clickOn(t0, target, fn, { dur = 0.75, shape = 'hand', ox, oy, pause = 0.18 } = {}) {
  move(t0, dur, target, { shape, ox, oy });
  return click(t0 + dur + pause, fn);
}
function dblclick(t, fn) {
  click(t);
  return click(t + 0.16, fn);
}
function typeText(t0, text, apply, cps = 13) {
  for (let i = 1; i <= text.length; i++) ev(t0 + (i - 1) / cps, () => apply(text.slice(0, i)));
  return t0 + text.length / cps;
}

/* ---------------- Highlights ---------------- */
function ring(t0, t1, target, { pad = 8, radius = 12 } = {}) {
  TL.rings.push({ t0, t1, target, pad, radius });
}
function spot(t0, t1, target, { pad = 10, radius = 14 } = {}) {
  TL.dims.push({ t0, t1, target, pad, radius });
}

/* ---------------- HUD ---------------- */
function card(t0, t1, el, { fade = 0.45 } = {}) {
  el.style.opacity = 0;
  $('#cards').appendChild(el);
  TL.cards.push({ t0, t1, el, fade });
}

/* ---------------- Popup (real extension popup in an iframe) ---------------- */
const Popup = {
  frame: null,
  loading: false,
  open() {
    const box = $('#ext-popup');
    box.innerHTML = '';
    const frame = document.createElement('iframe');
    frame.src = '/build/popup/popup.html';
    box.appendChild(frame);
    box.classList.remove('hidden');
    const anchor = rectIn($('#tb-ext'), $('#chrome'));
    box.style.left = anchor.x + anchor.w - 436 + 6 + 'px';
    box.style.top = '84px';
    this.frame = frame;
    this.loading = true;
    frame.addEventListener('load', async () => {
      const win = frame.contentWindow;
      await win.document.fonts.ready;
      win.__popupBridge.setTabMessageHandler(contentScript);
      this.loading = false;
    });
  },
  close() {
    $('#ext-popup').classList.add('hidden');
    $('#ext-popup').innerHTML = '';
    this.frame = null;
    __vclock.timers = [];
  },
  get doc() {
    return this.frame && this.frame.contentDocument;
  },
  $(sel) {
    return this.doc.querySelector(sel);
  },
  scroll(t0, dur, toY) {
    tween(
      t0,
      dur,
      () => ({ from: this.doc.scrollingElement.scrollTop }),
      (p, c) => {
        this.doc.scrollingElement.scrollTop = lerp(c.from, typeof toY === 'function' ? toY() : toY, p);
      }
    );
  },
  // scrollTop that puts an element `margin` px below the popup's top edge.
  scrollFor(sel, margin = 16) {
    return () => {
      const d = this.doc;
      const el = d.querySelector(sel);
      return Math.max(0, el.getBoundingClientRect().top + d.scrollingElement.scrollTop - margin);
    };
  }
};

// Emulates the extension's content script inside the YouTube tab.
const YT = { connected: false, scan: null, timer: { isActive: false, returnAt: 0, sessionEndsAt: 0, stage: 'idle' } };
async function contentScript(msg) {
  if (!YT.connected) throw new Error('Could not establish connection. Receiving end does not exist.');
  if (msg.action === 'getTimerState') return YT.timer;
  if (msg.action === 'scanFeed') return new Promise((resolve) => (YT.scan = { id: msg.scanId, resolve, category: msg.category }));
  return { success: true };
}
function emitToPopup(message) {
  if (Popup.frame && Popup.frame.contentWindow.__popupBridge) Popup.frame.contentWindow.__popupBridge.emit(message);
}

/* ---------------- Per-frame drawing ---------------- */
const fxPool = { rings: [], dims: [], ripples: [] };
function poolEl(kind, cls) {
  const el = document.createElement('div');
  el.className = cls;
  $('#fx').appendChild(el);
  fxPool[kind].push(el);
  return el;
}
function fadeAlpha(t, t0, t1, f = 0.25) {
  return clamp(Math.min((t - t0) / f, (t1 - t) / f), 0, 1);
}

const CURSORS = {
  arrow: `<svg width="30" height="44" viewBox="0 0 30 44"><path d="M2 2 L2 33 L9.5 26 L14.6 38.2 L19.6 36 L14.6 24.2 L24.8 24.2 Z" fill="#fff" stroke="#000" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  hand: `<svg width="34" height="40" viewBox="0 0 34 40"><path d="M11.5 2.5c1.6 0 2.8 1.2 2.8 2.8v10.1c.4-.3 1-.5 1.6-.5 1.2 0 2.2.7 2.6 1.7.5-.4 1.1-.6 1.8-.6 1.3 0 2.4.9 2.7 2.1.4-.2.9-.3 1.4-.3 1.6 0 2.8 1.2 2.8 2.8v7.6c0 5.5-3.8 10.3-9.7 10.3h-3.1c-3 0-5.1-1.3-6.7-3.6L2.4 24.6c-.9-1.3-.6-3 .6-3.9 1.2-.9 2.9-.7 3.8.4l1.9 2.3V5.3c0-1.6 1.2-2.8 2.8-2.8z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/><path d="M14.3 16v7M19.2 18.2v5M23.6 20.2v4" stroke="#000" stroke-width="1.3" stroke-linecap="round"/></svg>`
};
const HOTSPOT = { arrow: [2, 2], hand: [11.5, 3] };

const stageErrors = [];
function reportError(t, e) {
  stageErrors.push(`t=${t.toFixed(2)}s ${e && e.message}`);
  console.error('stage error at', t, e);
}
let evIdx = 0;
let lastShape = '';
function render(t) {
  while (evIdx < TL.events.length && TL.events[evIdx].t <= t) {
    try {
      TL.events[evIdx].fn();
    } catch (e) {
      reportError(TL.events[evIdx].t, e);
    }
    evIdx++;
  }
  for (let i = 0; i < activeTweens.length; i++) {
    const tw = activeTweens[i];
    const p = clamp((t - tw.t0) / (tw.t1 - tw.t0), 0, 1);
    try {
      tw.update(tw.easing(p), tw.ctx);
    } catch (e) {
      reportError(t, e);
      activeTweens.splice(i--, 1);
      continue;
    }
    if (p >= 1) activeTweens.splice(i--, 1);
  }
  __vclock.advanceTo(t * 1000);

  // camera
  const { s, tx, ty } = camTransform();
  $('#camera').style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;

  // cursor
  const c = $('#cursor');
  if (cur.shape !== lastShape) {
    c.innerHTML = CURSORS[cur.shape];
    lastShape = cur.shape;
  }
  const hs = HOTSPOT[cur.shape];
  const press = t - cur.pressAt < 0.14 ? 0.86 : 1;
  c.style.transform = `translate(${cur.x - hs[0]}px, ${cur.y - hs[1]}px) scale(${press})`;
  c.style.transformOrigin = `${hs[0]}px ${hs[1]}px`;

  // ripples
  let ri = 0;
  for (const k of TL.clicks) {
    const age = t - k.t;
    if (age < 0 || age > 0.55) continue;
    const el = fxPool.ripples[ri] || poolEl('ripples', 'ripple');
    ri++;
    el.style.display = 'block';
    el.style.left = k.x + 'px';
    el.style.top = k.y + 'px';
    el.style.opacity = String(1 - age / 0.55);
    el.style.transform = `scale(${0.35 + (age / 0.55) * 1.1})`;
  }
  fxPool.ripples.slice(ri).forEach((el) => (el.style.display = 'none'));

  // rings + dims
  for (const [list, kind, cls] of [[TL.rings, 'rings', 'ring'], [TL.dims, 'dims', 'spot-dim']]) {
    let n = 0;
    for (const g of list) {
      if (t < g.t0 || t > g.t1) continue;
      let r;
      try {
        r = resolveRect(g.target);
      } catch {
        continue;
      }
      const el = fxPool[kind][n] || poolEl(kind, cls);
      n++;
      const pulse = kind === 'rings' ? 1 + 0.035 * Math.sin((t - g.t0) * Math.PI * 2 * 1.1) : 1;
      el.style.display = 'block';
      el.style.left = r.x - g.pad + 'px';
      el.style.top = r.y - g.pad + 'px';
      el.style.width = r.w + g.pad * 2 + 'px';
      el.style.height = r.h + g.pad * 2 + 'px';
      el.style.borderRadius = g.radius + 'px';
      el.style.opacity = String(fadeAlpha(t, g.t0, g.t1, 0.3));
      el.style.transform = `scale(${pulse})`;
    }
    fxPool[kind].slice(n).forEach((el) => (el.style.display = 'none'));
  }

  // taskbar clock follows the same virtual time as the popup's log timestamps
  const now = new Date(__vclock.epoch + t * 1000);
  const clock = `${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')} ${now.getHours() < 12 ? 'AM' : 'PM'}`;
  const tray = $('#taskbar .tray div');
  if (tray && tray.dataset.clock !== clock) {
    tray.dataset.clock = clock;
    tray.innerHTML = `${clock}<br>10/11/2026`;
  }

  drawHud(t);
  syncPopupAnimations();
  const vis = camTransform();
  return { x: cur.x * vis.s + vis.tx, y: cur.y * vis.s + vis.ty };
}

function drawHud(t) {
  // captions
  const capEl = $('#cap');
  const cap = TL.caps.find((k) => t >= k.t0 && t < k.t1);
  if (cap) {
    if (capEl.dataset.key !== cap.key) {
      capEl.innerHTML = cap.html;
      capEl.dataset.key = cap.key;
    }
    const fin = cap.fadeIn ? clamp((t - cap.t0) / 0.15, 0, 1) : 1;
    const fout = cap.fadeOut ? clamp((cap.t1 - t) / 0.15, 0, 1) : 1;
    capEl.style.opacity = String(Math.min(fin, fout));
    capEl.style.display = 'block';
  } else capEl.style.display = 'none';

  // full-screen / step cards
  for (const k of TL.cards) {
    const a = fadeAlpha(t, k.t0, k.t1, k.fade);
    k.el.style.opacity = String(a);
    k.el.style.display = a > 0 ? 'flex' : 'none';
    const box = k.el.querySelector('.box, .inner');
    if (box) box.style.transform = `scale(${0.96 + 0.04 * ease.out(clamp((t - k.t0) / 0.6, 0, 1))})`;
  }

  // step chip + progress
  const st = TL.steps.find((k) => t >= k.t0 && t < k.t1);
  const chip = $('#stepchip');
  const prog = $('#progress');
  if (st) {
    if (chip.dataset.n !== String(st.n)) {
      chip.innerHTML = `<span class="n">STEP ${st.n} / 6</span><span>${st.title}</span>`;
      chip.dataset.n = String(st.n);
    }
    // fade the chip out while the camera is zoomed in, so it never covers the action
    const zoom = 1920 / cam.w;
    const a = fadeAlpha(t, st.t0, st.t1, 0.4) * clamp((1.3 - zoom) / 0.25, 0, 1);
    chip.style.opacity = String(a);
    chip.style.display = 'flex';
    prog.style.opacity = '1';
  } else {
    chip.style.display = 'none';
  }
  const first = TL.steps[0];
  const last = TL.steps[TL.steps.length - 1];
  prog.style.display = first && t >= first.t0 - 0.5 && t < last.t1 + 0.5 ? 'flex' : 'none';
  TL.steps.forEach((k, i) => {
    const fill = clamp((t - k.t0) / (k.t1 - k.t0), 0, 1);
    prog.children[i].firstChild.style.width = fill * 100 + '%';
  });
}

// Pin the popup's CSS animations/transitions to virtual time.
function syncPopupAnimations() {
  const d = Popup.doc;
  if (!d) return;
  const now = __vclock.now;
  for (const a of d.getAnimations()) {
    if (a.__vt0 === undefined) {
      a.__vt0 = now;
      a.pause();
    }
    a.currentTime = now - a.__vt0;
  }
}

/* ---------------- Narration ---------------- */
let T = 0; // authoring playhead (seconds)
function chunkCaption(text) {
  const sentences = text.split(/(?<=[.!?…])\s+(?=[A-Z“"])/);
  const out = [];
  for (const s of sentences) {
    if (s.replace(/\*\*/g, '').length <= 150) {
      out.push(s);
      continue;
    }
    // split long sentences at the comma closest to the middle
    const commas = [...s.matchAll(/,\s/g)].map((m) => m.index);
    if (!commas.length) {
      out.push(s);
      continue;
    }
    const mid = s.length / 2;
    const cut = commas.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
    out.push(s.slice(0, cut + 1), s.slice(cut + 2));
  }
  return out;
}
function say(id, { pre = 0.3, post = 0.45 } = {}) {
  const line = LINES[id];
  const d = DUR[id];
  if (!line || !d) throw new Error('missing narration ' + id);
  const t0 = T + pre;
  TL.cues.push({ id, t: t0 });
  const chunks = chunkCaption(line.text);
  const total = chunks.reduce((a, c) => a + c.replace(/\*\*/g, '').length, 0);
  let acc = t0;
  chunks.forEach((c, i) => {
    const len = (c.replace(/\*\*/g, '').length / total) * d;
    TL.caps.push({
      key: id + i,
      t0: acc,
      t1: i === chunks.length - 1 ? t0 + d + 0.25 : acc + len,
      fadeIn: i === 0,
      fadeOut: i === chunks.length - 1,
      html: c.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    });
    acc += len;
  });
  const spoken = (line.say || line.text).replace(/\*\*/g, '');
  // Approximate time at which a word is spoken (proportional to text position).
  const w = (word, nth = 0) => {
    let idx = -1;
    for (let k = 0; k <= nth; k++) idx = spoken.toLowerCase().indexOf(word.toLowerCase(), idx + 1);
    if (idx < 0) throw new Error(`word "${word}" not in ${id}`);
    return t0 + (idx / spoken.length) * d;
  };
  T = t0 + d + post;
  return { t0, d, end: t0 + d, w };
}
function waitUntil(t) {
  T = Math.max(T, t);
}
