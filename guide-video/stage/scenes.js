/* ------------------------------------------------------------------
   The storyboard. Each block plays one narration line (say) and schedules
   the on-screen actions that go with it, timed against the spoken words.
   ------------------------------------------------------------------ */
let LINES = {};
let DUR = {};
let BOXES = {};

const STEP_TITLES = ['Add the extension to Chrome', 'Open YouTube', 'Select the extension', 'Open the extension', 'Choose a category', 'Start it'];

/* ---------------- popup helpers ---------------- */
function popupWin() {
  return Popup.frame.contentWindow;
}
function setSelect(value) {
  const s = Popup.$('#niche-select');
  s.value = value;
  s.dispatchEvent(new (popupWin().Event)('change', { bubbles: true }));
}
function typeInto(sel, text) {
  const el = Popup.$(sel);
  el.focus();
  el.value = text;
  el.dispatchEvent(new (popupWin().Event)('input', { bubbles: true }));
}
// Chrome draws the open <select> list natively, which screenshots can't
// capture, so we draw an equivalent list inside the popup document.
const Dropdown = {
  open() {
    const d = Popup.doc;
    const sel = Popup.$('#niche-select');
    const r = sel.getBoundingClientRect();
    const list = d.createElement('div');
    list.id = 'stage-dropdown';
    Object.assign(list.style, {
      position: 'absolute',
      left: r.left + 'px',
      top: r.bottom + d.scrollingElement.scrollTop + 2 + 'px',
      width: r.width + 'px',
      background: '#fff',
      border: '1px solid #8a8a8a',
      boxShadow: '0 6px 18px rgba(0,0,0,.35)',
      zIndex: 99999,
      padding: '2px 0',
      fontFamily: "'Segoe UI', Inter, sans-serif",
      fontSize: '15px',
      color: '#000'
    });
    [...sel.options].forEach((o) => {
      const row = d.createElement('div');
      row.id = 'dd-' + (o.value || 'none');
      row.textContent = o.textContent;
      Object.assign(row.style, { height: '27px', lineHeight: '27px', padding: '0 12px', color: o.disabled ? '#9a9a9a' : '#000', whiteSpace: 'nowrap' });
      list.appendChild(row);
    });
    d.body.appendChild(list);
    this.highlight(sel.value || 'none');
  },
  highlight(value) {
    const list = Popup.doc && Popup.doc.getElementById('stage-dropdown');
    if (!list) return;
    [...list.children].forEach((row) => {
      const on = row.id === 'dd-' + value;
      row.style.background = on ? '#0067c0' : 'transparent';
      row.style.color = on ? '#fff' : row.textContent.startsWith('──') ? '#9a9a9a' : '#000';
    });
  },
  close() {
    const list = Popup.doc && Popup.doc.getElementById('stage-dropdown');
    if (list) list.remove();
  }
};

/* ---------------- small scene helpers ---------------- */
function show(sel, on = true) {
  $(sel).classList.toggle('hidden', !on);
}
function fadeIn(t, sel, dur = 0.25) {
  ev(t, () => {
    $(sel).style.opacity = 0;
    show(sel);
  });
  anim(t, dur, (p) => ($(sel).style.opacity = p), ease.out);
}
function setShot(name) {
  $('#ext-shot').src = '/build/shots/' + name + '.png';
}
function hl(sel, on = true) {
  $(sel).classList.toggle('hl', on);
}
function stepCard(n, lineId) {
  const el = h(`<div class="card-step"><div class="box"><div class="k">STEP ${n} OF 6</div><h2>${STEP_TITLES[n - 1]}</h2></div></div>`);
  const t0 = T + 0.1;
  const s = say(lineId, { pre: 0.55, post: 0.5 });
  card(t0, s.end + 0.45, el, { fade: 0.35 });
  TL.steps.push({ n, title: STEP_TITLES[n - 1], t0, t1: Infinity });
  if (TL.steps.length > 1) TL.steps[TL.steps.length - 2].t1 = t0;
  return s;
}
function pageLoad(t, { page, url, title, fav }, dur = 0.7) {
  let i = 0;
  ev(t, () => {
    i = Chrome.active;
    Chrome.setOmni('url');
    Chrome.setTab(i, { loading: true, url });
    show('#flash');
  });
  ev(t + dur, () => {
    Chrome.setTab(i, { loading: false, page, url, title, fav });
    show('#flash', false);
  });
  return t + dur;
}

/* ---------------- storyboard ---------------- */
function buildTimeline() {
  const DRIVE_URL = 'drive.google.com/file/d/13qDsKVXXKthOtlYsce_HR1MLKXq-WJzb/view';
  Chrome.addTab({ title: 'youtube-ai-assistant.zip - Google Drive', fav: LOGOS.drive(16), url: DRIVE_URL, page: 'drive' });

  /* ===== Intro ===== */
  const intro = h(`<div class="card-full"><div class="inner">
      <div class="kicker">Step-by-step guide</div>
      <h1>YouTube Niche Filter</h1>
      <h2>How to install the Chrome extension and start using it on YouTube</h2>
      <div class="steps">${STEP_TITLES.map((s, i) => `<div class="st"><span class="num">${i + 1}</span>${s}</div>`).join('')}</div>
    </div></div>`);
  intro.style.zIndex = 5;
  const sIntro = say('intro', { pre: 0.9, post: 0.6 });
  card(-1, sIntro.end + 0.7, intro, { fade: 0.6 });
  T = sIntro.end + 0.9;

  /* ===== Step 1: add the extension ===== */
  stepCard(1, 's1_title');

  // Download from Google Drive
  let s = say('s1_drive', { pre: 0.4 });
  camTo(s.t0 - 0.3, 1.2, S('#drive-dl'), 1.7);
  move(s.w('Click') - 0.4, 1.0, S('#drive-dl'), { shape: 'hand' });
  ev(s.w('Click') + 0.6, () => {
    hl('#drive-dl');
    show('#drive-tip');
  });
  ring(s.w('Download') - 0.2, s.w('download', 1) + 0.4, S('#drive-dl'), { pad: 6, radius: 26 });
  let tc = click(s.w('download', 1) + 0.1, () => {
    show('#drive-tip', false);
    hl('#drive-dl', false);
  });
  ev(tc + 0.5, () => {
    show('#tb-dl');
    placeBubble('dl-bubble', 'tb-dl', { dx: 120 });
  });
  camTo(tc + 0.6, 1.1, R(1180, 60, 740, 260), 1.9);
  ring(tc + 1.0, s.end + 0.3, S('#dl-bubble .dl-row'), { pad: 4, radius: 10 });
  waitUntil(tc + 1.6);

  // Open the downloads folder
  s = say('s1_downloaded');
  move(s.t0 + 0.2, 0.9, S('#dl-folder'), { shape: 'hand' });
  ev(s.t0 + 1.0, () => hl('#dl-folder'));
  tc = click(s.w('Downloads'), () => {
    show('#dl-bubble', false);
    hl('#dl-folder', false);
  });
  camReset(tc + 0.1, 0.8);
  ev(tc + 0.45, () => {
    Explorer.go('downloads');
    Explorer.select('ex-zip');
    $('#tb-explorer').classList.add('running', 'active');
    $('#tb-chrome').classList.remove('active');
  });
  fadeIn(tc + 0.45, '#explorer', 0.3);
  waitUntil(tc + 1.4);

  // Extract All
  s = say('s1_extract');
  camTo(s.t0, 1.1, R(250, 96, 1100, 520), 1.55);
  move(s.w('Right-click') - 0.9, 0.9, S('#ex-zip'), { ox: 0.18 });
  tc = click(s.w('Right-click') + 0.15, () => {
    const p = resolvePoint(S('#ex-zip'), 0.18);
    $('#ctxmenu').style.left = p.x + 'px';
    $('#ctxmenu').style.top = p.y - 6 + 'px';
    show('#ctxmenu');
  });
  move(s.w('Extract All') - 0.6, 0.7, S('#ctx-extract'), { ox: 0.3 });
  ev(s.w('Extract All') + 0.05, () => hl('#ctx-extract'));
  ring(s.w('Extract All'), s.end + 0.2, S('#ctx-extract'), { pad: 3, radius: 8 });
  tc = click(s.end + 0.15, () => {
    show('#ctxmenu', false);
    hl('#ctx-extract', false);
  });
  camReset(tc + 0.1, 0.8);
  fadeIn(tc + 0.35, '#extract-dlg', 0.25);
  waitUntil(tc + 0.9);

  s = say('s1_extract2');
  camTo(s.t0 - 0.2, 0.9, S('#extract-dlg'), 1.5);
  ring(s.t0 + 0.1, s.w('Extract') - 0.2, S('#extract-dlg .fld'), { pad: 6 });
  move(s.w('click') - 0.5, 0.8, S('#dlg-extract'), { shape: 'hand' });
  ev(s.w('Extract') + 0.1, () => hl('#dlg-extract'));
  tc = click(s.w('Extract') + 0.35, () => {
    show('#extract-dlg', false);
    hl('#dlg-extract', false);
  });
  camReset(tc + 0.1, 0.8);
  ev(tc + 0.5, () => Explorer.go('extracted'));
  waitUntil(tc + 1.0);

  // The extracted folder -> inner folder -> manifest.json
  s = say('s1_folders');
  camTo(s.t0, 1.0, R(250, 96, 1100, 560), 1.55);
  ring(s.w('Inside') - 0.1, s.w('Open it') - 0.1, S('#ex-inner'), { pad: 3, radius: 6 });
  move(s.w('Inside'), 0.9, S('#ex-inner'), { ox: 0.15 });
  ev(s.w('Inside') + 0.9, () => $('#ex-inner').classList.add('hover'));
  tc = dblclick(s.w('Open it'), () => Explorer.go('inner'));
  camTo(tc + 0.2, 1.0, R(480, 220, 900, 560), 1.5);
  move(s.w('manifest') - 0.8, 0.9, S('#ex-manifest'), { ox: 0.12 });
  ev(s.w('manifest') + 0.15, () => Explorer.select('ex-manifest'));
  ring(s.w('manifest'), s.end + 0.5, S('#ex-manifest'), { pad: 3, radius: 6 });
  waitUntil(s.end + 0.6);

  // Back to Chrome -> menu -> Extensions -> Manage Extensions
  s = say('s1_menu');
  camReset(s.t0, 0.7);
  tc = clickOn(s.t0 + 0.1, S('#ex-min'), null, { dur: 0.8 });
  ev(tc + 0.05, () => {
    $('#tb-explorer').classList.remove('active');
    $('#tb-chrome').classList.add('active');
  });
  anim(tc + 0.05, 0.3, (p) => {
    $('#explorer').style.opacity = 1 - p;
    $('#explorer').style.transform = `translateY(${p * 120}px) scale(${1 - p * 0.15})`;
  });
  ev(tc + 0.4, () => show('#explorer', false));
  camTo(s.w('three') - 0.4, 1.0, R(1400, 0, 520, 420), 1.75);
  tc = clickOn(s.w('three') - 0.6, S('#tb-menu'), () => {
    hl('#tb-menu');
    $('#tb-menu').classList.add('pressed');
    placeBubble('chrome-menu', 'tb-menu', { dx: 2 });
  });
  move(s.w('Extensions') - 0.5, 0.7, S('#mi-extensions'), { ox: 0.4, shape: 'arrow' });
  ev(s.w('Extensions') + 0.15, () => {
    $('#mi-extensions').classList.add('hl');
    const mr = rectIn($('#mi-extensions'), $('#chrome'));
    const m = rectIn($('#chrome-menu'), $('#chrome'));
    show('#chrome-submenu');
    $('#chrome-submenu').style.left = m.x - 262 + 'px';
    $('#chrome-submenu').style.top = mr.y - 8 + 'px';
  });
  move(s.w('Manage') - 0.5, 0.8, S('#mi-manage'), { ox: 0.5, arc: 0.03 });
  ev(s.w('Manage') + 0.2, () => $('#mi-manage').classList.add('hl'));
  ring(s.w('Manage'), s.end + 0.3, S('#mi-manage'), { pad: 2, radius: 8 });
  tc = click(s.end + 0.2, () => {
    show('#chrome-menu', false);
    show('#chrome-submenu', false);
    $('#tb-menu').classList.remove('pressed');
    setShot('ext-off');
    Chrome.addTab({ title: 'Extensions', fav: LOGOS.chrome(16), url: 'chrome://extensions', page: 'ext' });
  });
  camReset(tc + 0.1, 0.9);
  waitUntil(tc + 0.8);

  s = say('s1_tip');
  camTo(s.t0, 1.0, R(0, 30, 760, 300), 2.0);
  ring(s.w('chrome colon') - 0.2, s.end + 0.3, S('#omnibox .url'), { pad: 4, radius: 14 });
  move(s.t0 + 0.4, 1.0, S('#omnibox'), { ox: 0.1, oy: 1.5 });
  waitUntil(s.end + 0.4);

  // Developer mode
  s = say('s1_devmode');
  camTo(s.t0 - 0.2, 1.1, X('devMode'), 2.2);
  move(s.t0, 1.1, X('devMode'), { shape: 'hand' });
  ring(s.w('Developer') - 0.3, s.end + 0.6, X('devMode'), { pad: 8, radius: 14 });
  tc = click(s.w('Developer') + 0.3, () => setShot('ext-on'));
  waitUntil(tc + 0.8);

  s = say('s1_devmode2');
  camTo(s.t0 - 0.2, 1.1, R(0, 130, 520, 120), 2.1);
  ring(s.w('Load') - 0.1, s.w('Pack') - 0.1, X('loadUnpacked'), { pad: 4, radius: 22 });
  ring(s.w('Pack') - 0.1, s.w('Update') - 0.1, R(166, 87 + 66, 123, 36), { pad: 4, radius: 22 });
  ring(s.w('Update') - 0.1, s.end + 0.3, R(308, 87 + 66, 75, 36), { pad: 4, radius: 22 });
  move(s.t0 + 0.2, 1.0, R(700, 300, 10, 10));

  s = say('s1_load', { pre: 0.2, post: 0.3 });
  move(s.t0 - 0.3, 0.8, X('loadUnpacked'), { shape: 'hand' });
  ev(s.t0 + 0.45, () => setShot('ext-on-hover-load'));
  ring(s.t0, s.end + 0.4, X('loadUnpacked'), { pad: 4, radius: 22 });
  tc = click(s.end + 0.15, () => setShot('ext-on'));
  camReset(tc + 0.2, 0.8);
  ev(tc + 0.4, () => Picker.go('documents'));
  fadeIn(tc + 0.4, '#picker', 0.25);
  waitUntil(tc + 1.0);

  // Folder picker
  s = say('s1_picker');
  camTo(s.t0, 1.0, R(400, 140, 1120, 520), 1.45);
  tc = clickOn(s.w('Downloads') - 0.7, S('#pk-nav [data-nav="downloads"]'), () => Picker.go('downloads'), { shape: 'arrow' });
  move(s.w('open the') - 0.3, 0.8, S('#pk-outer'), { ox: 0.15 });
  ring(s.w('open the') - 0.2, s.end + 0.25, S('#pk-outer'), { pad: 3, radius: 6 });
  tc = dblclick(s.end + 0.1, () => Picker.go('outer'));
  waitUntil(tc + 0.5);

  s = say('s1_picker2');
  move(s.t0, 0.6, S('#pk-inner'), { ox: 0.15 });
  tc = click(s.w('Click') + 0.7, () => Picker.select('pk-inner'));
  ring(tc, s.w('Select Folder') - 0.2, S('#pk-inner'), { pad: 3, radius: 6 });
  camTo(s.w('Select Folder') - 1.0, 1.0, R(400, 460, 1120, 400), 1.45);
  ring(s.w('Select Folder') - 0.2, s.end + 0.6, S('#pk-select'), { pad: 4, radius: 8 });
  move(s.w('Select Folder') - 0.6, 0.8, S('#pk-select'), { shape: 'hand' });
  tc = click(s.end + 0.35, () => show('#picker', false));
  camReset(tc + 0.1, 0.8);
  ev(tc + 0.5, () => setShot('ext-loaded'));
  waitUntil(tc + 1.0);

  s = say('s1_done');
  camTo(s.t0, 1.1, X('card'), 1.9);
  move(s.t0 + 0.3, 1.0, R(900, 600, 10, 10));
  ring(s.t0 + 0.2, s.w('Make sure') - 0.1, X('card'), { pad: 8, radius: 14 });
  ring(s.w('switch') - 0.2, s.end + 0.6, X('cardToggle'), { pad: 8, radius: 14 });
  move(s.w('switch'), 0.8, X('cardToggle'), { oy: 1.2 });
  camReset(s.end + 0.3, 0.9);
  waitUntil(s.end + 0.9);

  /* ===== Step 2: open YouTube ===== */
  stepCard(2, 's2_title');
  s = say('s2_open', { pre: 0.4 });
  camTo(s.t0 - 0.2, 1.0, R(0, 0, 900, 400), 1.9);
  tc = clickOn(s.w('new tab') - 0.8, S('#tb-newtab'), () => {
    Chrome.addTab({ title: 'New Tab', fav: LOGOS.chrome(16), url: '', page: 'ntp' });
    Chrome.setOmni('typing', '');
  });
  move(tc + 0.3, 0.6, S('#omnibox'), { ox: 0.15, shape: 'arrow' });
  let te = typeText(s.w('type') + 0.2, 'youtube.com', (txt) => {
    Chrome.setOmni('typing', txt);
    $('#omni-drop').innerHTML = `<div class="sg hl">${icon('search', 18, '#5f6368')}<span>${txt}</span><span class="d">– youtube.com</span></div>`;
    show('#omni-drop');
  }, 11);
  ring(s.w('Enter') - 0.2, s.w('Enter') + 0.5, S('#omnibox'), { pad: 3, radius: 22 });
  ev(s.w('Enter') + 0.3, () => show('#omni-drop', false));
  pageLoad(s.w('Enter') + 0.3, { page: 'yt', url: 'youtube.com', title: 'YouTube', fav: LOGOS.youtube(11) }, 0.8);
  camReset(s.w('Enter') + 0.6, 0.9);
  ring(s.w('home page'), s.end + 0.5, S('#pg-yt .si.on'), { pad: 4, radius: 12 });
  move(s.w('home page') - 0.4, 0.9, S('#pg-yt .si.on'), { ox: 0.7 });
  waitUntil(s.end + 0.6);

  /* ===== Step 3: select (pin) the extension ===== */
  stepCard(3, 's3_title');
  s = say('s3_puzzle', { pre: 0.4 });
  camTo(s.t0 - 0.2, 1.1, R(1440, 0, 480, 330), 2.0);
  ring(s.w('puzzle') - 0.3, s.w('puzzle') + 1.5, S('#tb-puzzle'), { pad: 3, radius: 20 });
  tc = clickOn(s.w('puzzle') - 0.5, S('#tb-puzzle'), () => {
    $('#tb-puzzle').classList.add('pressed');
    placeBubble('ext-menu', 'tb-puzzle', { dx: 80 });
  });
  ring(s.w('YouTube Niche') - 0.2, s.end + 0.4, S('#ext-row'), { pad: 2, radius: 8 });
  move(s.w('YouTube Niche') - 0.3, 0.8, S('#ext-row'), { ox: 0.4, shape: 'arrow' });

  s = say('s3_pin');
  move(s.t0, 0.8, S('#ext-pin'), { shape: 'hand' });
  ev(s.t0 + 0.75, () => hl('#ext-pin'));
  ring(s.t0 + 0.6, s.w('so the') + 0.1, S('#ext-pin'), { pad: 2, radius: 18 });
  tc = click(s.w('pin') + 0.25, () => {
    $('#ext-pin').innerHTML = icon('pinFilled', 18);
    $('#ext-pin').classList.add('on');
    show('#tb-ext');
  });
  ring(s.w('visible') - 0.3, s.end + 0.8, S('#tb-ext'), { pad: 3, radius: 20 });
  ev(s.end + 0.6, () => {
    show('#ext-menu', false);
    $('#tb-puzzle').classList.remove('pressed');
    hl('#ext-pin', false);
  });
  move(s.w('visible') - 0.2, 0.9, S('#tb-ext'), { oy: 1.6, shape: 'arrow' });
  waitUntil(s.end + 0.9);
  camReset(T - 0.2, 0.8);

  /* ===== Step 4: open the extension ===== */
  stepCard(4, 's4_title');
  s = say('s4_open', { pre: 0.4 });
  tc = clickOn(s.w('icon') - 0.6, S('#tb-ext'), () => {
    $('#tb-ext').classList.add('pressed');
    Popup.open();
  });
  ring(s.w('icon') - 0.4, tc + 0.1, S('#tb-ext'), { pad: 3, radius: 20 });
  camTo(tc + 0.3, 1.1, R(1370, 84, 440, 600), 1.55);
  move(tc + 0.6, 0.8, R(1000, 400, 10, 10), { shape: 'arrow' });

  s = say('s4_signals');
  ring(s.t0, s.w('Tab') - 0.1, P('.hero-signals'), { pad: 6, radius: 18 });
  ring(s.w('Tab') - 0.1, s.w('Automation') - 0.1, P('#signal-youtube'), { pad: 4, radius: 16 });
  ring(s.w('Automation') - 0.1, s.end + 0.5, P('#signal-automation'), { pad: 4, radius: 16 });
  move(s.w('Tab') - 0.4, 0.8, P('#signal-youtube'), { oy: 0.85 });
  move(s.w('Automation') - 0.4, 0.7, P('#signal-automation'), { oy: 0.85 });
  waitUntil(s.end + 0.6);

  /* ===== Step 5: choose a category ===== */
  stepCard(5, 's5_title');
  s = say('s5_scroll', { pre: 0.4 });
  move(s.t0, 0.7, P('.hero-panel'), { ox: 0.7 });
  Popup.scroll(s.t0 + 0.3, 1.2, Popup.scrollFor('.control-card', 70));
  ring(s.w('Category') - 0.1, s.w('click') - 0.1, P('.control-card .section-heading'), { pad: 6, radius: 12 });
  tc = clickOn(s.w('click') - 0.4, P('#niche-select'), () => Dropdown.open(), { shape: 'hand' });
  ring(s.w('Choose a lane') - 0.2, tc + 0.1, P('#niche-select'), { pad: 4, radius: 16 });

  s = say('s5_list', { post: 0.3 });
  const items = [
    ['Tech', 'tech'],
    ['Gaming', 'gaming'],
    ['Finance', 'finance'],
    ['Fitness', 'fitness'],
    ['Business', 'business'],
    ['Education', 'education'],
    ['Entertainment', 'entertainment'],
    ['Music', 'music']
  ];
  items.forEach(([word, value], i) => {
    const tw = s.w(word);
    move(tw - 0.25, 0.3, P('#dd-' + value), { ox: 0.3, arc: 0.02, shape: 'arrow' });
    ev(tw + 0.05, () => Dropdown.highlight(value));
  });
  ring(s.w('Tech') - 0.1, s.end + 0.2, () => {
    const a = P('#dd-tech')();
    const b = P('#dd-music')();
    return { x: a.x, y: a.y, w: a.w, h: b.y + b.h - a.y };
  }, { pad: 3, radius: 6 });

  s = say('s5_pick');
  move(s.t0, 0.7, P('#dd-gaming'), { ox: 0.3, arc: 0.02 });
  ev(s.t0 + 0.6, () => Dropdown.highlight('gaming'));
  tc = click(s.w('Gaming') + 0.2, () => {
    Dropdown.close();
    setSelect('gaming');
  });
  ring(s.w('button') - 0.2, s.end + 0.4, P('#scan-btn'), { pad: 4, radius: 18 });
  move(s.w('button') - 0.3, 0.8, P('#scan-btn'), { oy: 1.25 });

  s = say('s5_manual');
  tc = clickOn(s.w('Open the dropdown') - 0.3, P('#niche-select'), () => Dropdown.open(), { shape: 'hand' });
  move(s.w('Add manually') - 0.7, 0.8, P('#dd-__add_manually__'), { ox: 0.3, shape: 'arrow' });
  ev(s.w('Add manually') + 0.1, () => Dropdown.highlight('__add_manually__'));
  ring(s.w('Add manually'), s.end + 0.3, P('#dd-__add_manually__'), { pad: 2, radius: 4 });
  tc = click(s.end + 0.2, () => {
    Dropdown.close();
    setSelect('__add_manually__');
  });
  waitUntil(tc + 0.7);

  s = say('s5_name');
  tc = clickOn(s.t0 - 0.2, P('#modal-category-name'), null, { shape: 'arrow', dur: 0.6 });
  te = typeText(s.w('Cooking') - 0.1, 'Cooking', (txt) => typeInto('#modal-category-name', txt), 9);
  ring(s.t0 + 0.3, te + 0.4, P('#modal-category-name'), { pad: 4, radius: 14 });
  waitUntil(te + 0.4);

  s = say('s5_keywords');
  tc = clickOn(s.t0, P('#modal-category-keywords'), () => Popup.$('#modal-category-keywords').focus(), { shape: 'arrow', dur: 0.6 });
  te = typeText(s.w('like') + 0.1, 'recipe, chef, food', (txt) => typeInto('#modal-category-keywords', txt), 11);
  ring(s.t0 + 0.4, s.end + 0.3, P('#modal-category-keywords'), { pad: 4, radius: 14 });
  waitUntil(te + 0.3);

  s = say('s5_add');
  tc = clickOn(s.t0, P('#modal-add'), () => Popup.$('#modal-add').click(), { shape: 'hand', dur: 0.7 });
  ring(s.t0 + 0.2, tc + 0.1, P('#modal-add'), { pad: 4, radius: 14 });
  ring(s.w('added') - 0.1, s.end + 0.5, P('#niche-select'), { pad: 4, radius: 16 });
  move(tc + 0.4, 0.8, P('#niche-select'), { oy: 1.35, shape: 'arrow' });

  s = say('s5_save');
  tc = clickOn(s.w('Save Setup') - 0.5, P('#save-btn'), () => Popup.$('#save-btn').click(), { shape: 'hand' });
  ring(s.w('Save Setup') - 0.3, s.end + 0.5, P('#save-btn'), { pad: 4, radius: 16 });
  waitUntil(s.end + 0.6);

  /* ===== Step 6: start ===== */
  stepCard(6, 's6_title');
  s = say('s6_scan', { pre: 0.4, post: 0.3 });
  tc = clickOn(s.w('Scan') - 0.6, P('#scan-btn'), () => Popup.$('#scan-btn').click(), { shape: 'hand' });
  ring(s.t0, tc + 0.4, P('#scan-btn'), { pad: 4, radius: 18 });
  waitUntil(tc + 0.8);

  s = say('s6_refresh_msg', { pre: 0.2 });
  move(s.t0, 0.6, P('.control-note'), { ox: 0.8, shape: 'arrow' });
  Popup.scroll(s.t0 + 0.2, 1.3, Popup.scrollFor('#status-section', 230));
  ring(s.w('Please') - 0.3, s.end + 0.4, P('#status-section'), { pad: 4, radius: 16 });

  s = say('s6_refresh');
  camTo(s.t0 - 0.3, 1.1, R(0, 0, 900, 420), 2.1);
  tc = clickOn(s.w('reload') - 0.6, S('#tb-reload'), () => {
    Popup.close();
    $('#tb-ext').classList.remove('pressed');
  });
  ring(s.w('reload') - 0.5, tc + 0.6, S('#tb-reload'), { pad: 3, radius: 20 });
  const keycap = h(`<div style="position:absolute;left:250px;top:215px;display:flex;align-items:center;gap:14px;color:#fff;font:600 26px Inter;background:rgba(10,14,22,.85);padding:12px 20px;border-radius:14px">or press <span style="display:inline-grid;place-items:center;min-width:58px;height:50px;border-radius:10px;background:#f3f4f6;color:#111;font-weight:800;box-shadow:0 4px 0 #9aa3ad">F5</span></div>`);
  card(s.w('F five') - 0.2, s.end + 0.6, keycap, { fade: 0.25 });
  ev(tc + 0.1, () => (YT.connected = false));
  pageLoad(tc + 0.1, { page: 'yt', url: 'youtube.com', title: 'YouTube', fav: LOGOS.youtube(11) }, 1.1);
  ev(tc + 1.2, () => (YT.connected = true));
  camReset(tc + 1.3, 0.9);
  waitUntil(tc + 2.0);

  s = say('s6_reopen');
  tc = clickOn(s.w('open the extension') - 0.6, S('#tb-ext'), () => {
    $('#tb-ext').classList.add('pressed');
    Popup.open();
  });
  camTo(tc + 0.3, 1.0, R(1370, 84, 440, 600), 1.55);
  Popup.scroll(tc + 0.9, 1.1, Popup.scrollFor('.control-card', 70));
  ring(s.w('saved category') - 0.2, s.w('Scan') - 0.3, P('#niche-select'), { pad: 4, radius: 16 });
  tc = clickOn(s.w('Scan') - 0.5, P('#scan-btn'), () => Popup.$('#scan-btn').click(), { shape: 'hand' });
  ring(s.w('Scan') - 0.3, tc + 0.4, P('#scan-btn'), { pad: 4, radius: 18 });
  const scanAt = tc;
  waitUntil(tc + 0.6);

  // ---- the content script at work (messages mirror scripts/content.js) ----
  const cat = 'cooking (keywords: recipe, chef, food)';
  const VIDEO = 'Easy 15-Minute Pasta Anyone Can Make';
  const log = (t, text, type) => ev(t, () => emitToPopup({ action: 'activityLog', text, type }));
  const progress = (t, msg) => ev(t, () => YT.scan && emitToPopup({ action: 'scanProgress', scanId: YT.scan.id, ...msg }));
  progress(scanAt + 0.3, { stage: 'start', category: cat });
  log(scanAt + 0.35, `Session started - Category: ${cat}`, 'action');
  log(scanAt + 0.6, 'Cycle 1/2: browsing home feed (3 videos)', 'action');
  log(scanAt + 1.4, 'Scrolling through the home feed...', 'navigation');
  anim(scanAt + 1.4, 1.6, (p) => ($('#yt-scroll').style.transform = `translateY(${-560 * p}px)`));
  anim(scanAt + 3.2, 1.2, (p) => ($('#yt-scroll').style.transform = `translateY(${-560 * (1 - p)}px)`));
  log(scanAt + 3.0, `Scanning for ${cat} videos...`, 'brain');
  progress(scanAt + 3.4, { stage: 'analyzing', scanned: 24, totalDiscovered: 24, title: 'Analyzing 24 videos...' });
  log(scanAt + 3.45, 'Analyzing 24 videos with AI...', 'brain');
  log(scanAt + 5.0, 'Found 3 matching video(s) (scores: 94, 88, 81%)', 'success');

  // zoom out so the feed scan and the video opening are visible
  camReset(scanAt + 1.1, 1.0);
  s = say('s6_running', { pre: 0.1 });
  camTo(s.w('Activity Log') - 1.0, 1.0, R(1370, 84, 440, 600), 1.55);
  Popup.scroll(scanAt + 1.0, 1.4, Popup.scrollFor('#status-section', 10));
  ring(scanAt + 5.2, scanAt + 7.0, S('#yt-match'), { pad: 6, radius: 16 });
  progress(scanAt + 5.6, { stage: 'opening', scanned: 24, title: VIDEO });
  log(scanAt + 5.65, `Opening: ${VIDEO}`, 'navigation');
  const openAt = scanAt + 6.4;
  pageLoad(openAt, { page: 'watch', url: 'youtube.com/watch?v=Qp5mK2xR8sA', title: VIDEO + ' - YouTube', fav: LOGOS.youtube(11) }, 0.7);
  ev(openAt + 0.8, () => {
    YT.timer = {
      isActive: true,
      returnAt: __vclock.epoch + __vclock.now + 582000,
      sessionEndsAt: __vclock.epoch + __vclock.now + 49 * 60000,
      stage: 'watching',
      currentTitle: VIDEO
    };
    YT.scan && YT.scan.resolve({ success: true, opened: true, openedVideo: { url: 'https://www.youtube.com/watch?v=Qp5mK2xR8sA', title: VIDEO } });
  });
  log(openAt + 1.6, 'Video started playing', 'success');
  log(openAt + 2.2, `Watching: ${VIDEO}`, 'watch');
  log(openAt + 2.25, 'Watching 9:42 (~70% of video)', 'timer');
  ev(openAt + 2.3, () => emitToPopup({ action: 'timerUpdate', ...YT.timer }));
  // the video keeps playing until the end of the guide
  const playFrom = openAt + 1.0;
  anim(playFrom, 400, (p) => {
    const sec = p * 400;
    const total = 13 * 60 + 48;
    $('#watch-prog').style.width = (sec / total) * 100 + '%';
    $('#watch-knob').style.left = (sec / total) * 100 + '%';
    $('#watch-time').textContent = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')} / 13:48`;
  }, ease.linear);
  Popup.scroll(s.w('Activity Log') - 0.9, 1.0, () => {
    const d = Popup.doc;
    const r = d.querySelector('#activity-section').getBoundingClientRect();
    return Math.max(0, r.bottom + d.scrollingElement.scrollTop - 600 + 14);
  });
  ring(s.w('Activity Log') - 0.1, s.end + 0.6, P('#activity-section'), { pad: 4, radius: 16 });
  move(s.t0 + 0.5, 1.0, R(1120, 520, 10, 10), { shape: 'arrow' });
  waitUntil(Math.max(s.end + 0.5, openAt + 2.6));

  s = say('s6_watch');
  Popup.scroll(s.w('timers') - 0.9, 1.0, Popup.scrollFor('#timers-section', 14));
  ring(s.w('timers') - 0.3, s.end + 0.5, P('#timers-section'), { pad: 4, radius: 16 });
  move(s.w('timers') - 0.6, 0.9, P('#timers-section'), { ox: 0.9, oy: 1.1 });

  s = say('s6_stop');
  Popup.scroll(s.t0, 1.0, 0);
  move(s.w('red STOP') - 0.9, 0.9, P('#kill-switch'), { shape: 'hand' });
  ring(s.w('red STOP') - 0.3, s.end + 0.8, P('#kill-switch'), { pad: 5, radius: 22 });
  waitUntil(s.end + 0.9);
  TL.steps[TL.steps.length - 1].t1 = T;
  camReset(T - 0.3, 0.9);

  /* ===== Outro ===== */
  const outro = h(`<div class="card-full"><div class="inner">
      <div class="kicker">Recap</div>
      <h1 style="font-size:84px">You're all set!</h1>
      <div class="steps">${STEP_TITLES.map((st, i) => `<div class="st" id="recap-${i + 1}"><span class="num">${i + 1}</span>${st}</div>`).join('')}</div>
    </div></div>`);
  const tOut = T + 0.2;
  s = say('outro', { pre: 0.9, post: 1.2 });
  card(tOut, s.end + 3.0, outro, { fade: 0.6 });
  [
    [1, 'Unzip'],
    [2, 'open YouTube'],
    [3, 'pin'],
    [4, 'open the extension'],
    [5, 'choose or add'],
    [6, 'click Scan']
  ].forEach(([n, word]) =>
    ev(s.w(word), () => {
      $('#recap-' + n).classList.add('done');
      $('#recap-' + n + ' .num').innerHTML = icon('check', 26, '#fff');
    })
  );
  TL.end = s.end + 2.4;
}

/* ---------------- boot ---------------- */
window.stage = {
  ready: false,
  render,
  busy() {
    if (Popup.loading) return true;
    return [...document.images].some((img) => !img.complete);
  },
  errors: () => stageErrors,
  info() {
    return { duration: TL.end, cues: TL.cues, steps: TL.steps.map(({ n, title, t0, t1 }) => ({ n, title, t0, t1 })) };
  }
};

(async () => {
  const [lines, durations, boxes] = await Promise.all([
    fetch('/narration/lines.json').then((r) => r.json()),
    fetch('/build/narration/durations.json').then((r) => r.json()),
    fetch('/build/shots/boxes.json').then((r) => r.json())
  ]);
  lines.forEach((l) => (LINES[l.id] = l));
  DUR = durations;
  BOXES = boxes;
  // preload screenshots so swapping them never shows a blank frame
  await Promise.all(['ext-off', 'ext-on', 'ext-on-hover-load', 'ext-loaded'].map((n) => new Promise((res) => {
    const img = new Image();
    img.onload = img.onerror = res;
    img.src = '/build/shots/' + n + '.png';
  })));
  buildAll();
  buildTimeline();
  TL.events.sort((a, b) => a.t - b.t || a.i - b.i);
  await document.fonts.ready;
  window.stage.ready = true;
})().catch((e) => {
  console.error(e);
  window.stage.error = String(e && e.stack || e);
});
