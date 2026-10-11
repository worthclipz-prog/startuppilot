// Builders + state helpers for every mock-up on the stage.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

const EXT_FILES = {
  folders: ['icons', 'popup', 'scripts', 'styles'],
  files: [
    ['AD_REFRESH_STRATEGY.md', 'Markdown File', '10 KB'],
    ['AD_SKIP_COMPLETE.md', 'Markdown File', '7 KB'],
    ['AD_SKIP_FIX.md', 'Markdown File', '8 KB'],
    ['AD_SKIP_FLOWCHART.md', 'Markdown File', '11 KB'],
    ['AD_VIDEO_DETECTION_FIX.md', 'Markdown File', '8 KB'],
    ['CUSTOM_CATEGORIES.md', 'Markdown File', '5 KB'],
    ['IMPLEMENTATION_SUMMARY.md', 'Markdown File', '5 KB'],
    ['INFINITE_LOOP_FIX.md', 'Markdown File', '8 KB'],
    ['INSTALLATION_TESTING.md', 'Markdown File', '7 KB'],
    ['manifest.json', 'JSON Source File', '2 KB'],
    ['MODAL_UI_GUIDE.md', 'Markdown File', '7 KB'],
    ['QUICK_REF_AD_SKIP.md', 'Markdown File', '3 KB'],
    ['QUICK_START.md', 'Markdown File', '7 KB'],
    ['UI_UPDATE_SUMMARY.md', 'Markdown File', '7 KB'],
    ['VISUAL_COMPARISON.md', 'Markdown File', '12 KB']
  ]
};

/* ============================ Taskbar ============================ */
function buildTaskbar() {
  $('#taskbar').innerHTML = `
    <div class="tb-btn">${LOGOS.windows(24)}</div>
    <div class="tb-search">${icon('search', 18, '#555')}<span>Search</span></div>
    <div class="tb-btn" id="tb-explorer">${LOGOS.folder(26)}</div>
    <div class="tb-btn running active" id="tb-chrome">${LOGOS.chrome(24)}</div>
    <div class="tray"><div>1:05 PM<br>10/11/2026</div></div>`;
}

/* ============================ Chrome ============================ */
const Chrome = {
  tabs: [],
  active: 0,
  omni: { mode: 'url', text: '' },
  build() {
    $('#chrome').innerHTML = `
      <div class="tabstrip">
        <div class="tabs" id="tabs"></div>
        <div class="caption-btns"><div>${icon('minimize', 16)}</div><div>${icon('maximize', 14)}</div><div>${icon('close', 16)}</div></div>
      </div>
      <div class="toolbar">
        <div class="tbtn" id="tb-back">${icon('back', 20)}</div>
        <div class="tbtn disabled" id="tb-fwd">${icon('forward', 20)}</div>
        <div class="tbtn" id="tb-reload">${icon('reload', 20)}</div>
        <div class="omnibox" id="omnibox">
          <div class="site" id="omni-site">${icon('tune', 16)}</div>
          <div class="url" id="omni-url"></div>
          <div class="tbtn" style="width:30px;height:30px">${icon('star', 18)}</div>
          <div class="omni-drop hidden" id="omni-drop"></div>
        </div>
        <div class="tb-right">
          <div class="tbtn hidden" id="tb-dl">${icon('download', 20)}</div>
          <div class="tbtn hidden" id="tb-ext">${LOGOS.extY(18)}</div>
          <div class="tbtn" id="tb-puzzle">${icon('puzzle', 20)}</div>
          <div class="tbtn" id="tb-avatar"><div class="avatar">A</div></div>
          <div class="tbtn" id="tb-menu">${icon('dots', 20)}</div>
        </div>
      </div>
      <div class="content" id="content">
        <div class="page drive hidden" id="pg-drive"></div>
        <div class="page hidden" id="pg-ext"><img class="shot" id="ext-shot" src="/build/shots/ext-off.png"></div>
        <div class="page ntp hidden" id="pg-ntp"></div>
        <div class="page yt hidden" id="pg-yt"></div>
        <div class="page yt watch hidden" id="pg-watch"></div>
        <div class="blank-flash hidden" id="flash"></div>
      </div>
      <div class="bubble dl-bubble hidden" id="dl-bubble"></div>
      <div class="bubble menu hidden" id="chrome-menu"></div>
      <div class="bubble menu hidden" id="chrome-submenu" style="width:260px"></div>
      <div class="bubble ext-menu hidden" id="ext-menu"></div>
      <div id="ext-popup" class="hidden"></div>`;
    buildDrive();
    buildNtp();
    buildYouTube();
    buildWatch();
    buildMenus();
  },
  addTab(tab) {
    this.tabs.push({ loading: false, ...tab });
    this.active = this.tabs.length - 1;
    this.render();
    return this.active;
  },
  setTab(i, patch) {
    Object.assign(this.tabs[i], patch);
    this.render();
  },
  activate(i) {
    this.active = i;
    this.render();
  },
  get tab() {
    return this.tabs[this.active];
  },
  render() {
    $('#tabs').innerHTML =
      this.tabs
        .map(
          (t, i) => `<div class="tab ${i === this.active ? 'active' : ''}" id="tab-${i}">
          <div class="fav">${t.loading ? '<div class="spinner"></div>' : t.fav}</div>
          <div class="title">${t.title}</div><div class="x">${icon('close', 14)}</div>
          ${i === this.active ? '<div class="corner-r"></div>' : ''}</div>`
        )
        .join('') + `<div class="newtab" id="tb-newtab">${icon('plus', 20)}</div>`;
    $$('#content > .page').forEach((p) => p.classList.add('hidden'));
    if (this.tab) $('#pg-' + this.tab.page).classList.remove('hidden');
    this.renderOmni();
  },
  renderOmni() {
    const o = this.omni;
    const box = $('#omnibox');
    box.classList.toggle('focused', o.mode !== 'url');
    let html = '';
    if (o.mode === 'url') {
      const u = this.tab ? this.tab.url : '';
      const m = u.match(/^([^/]+)(.*)$/);
      html = m ? `${m[1]}<span class="dim">${m[2]}</span>` : u;
      $('#omni-site').innerHTML = this.tab && this.tab.page === 'ext' ? LOGOS.chrome(16) : icon('tune', 16);
    } else if (o.mode === 'typing') {
      html = o.text ? `${o.text}<span class="caret"></span>` : `<span class="caret"></span><span class="ph">Search Google or type a URL</span>`;
      $('#omni-site').innerHTML = icon('search', 18);
    } else if (o.mode === 'selected') {
      html = `<span class="sel">${o.text}</span>`;
    }
    $('#omni-url').innerHTML = html;
  },
  setOmni(mode, text = '') {
    this.omni = { mode, text };
    this.renderOmni();
  }
};

function buildMenus() {
  const items = [
    ['New tab', 'Ctrl+T'],
    ['New window', 'Ctrl+N'],
    ['New Incognito window', 'Ctrl+Shift+N'],
    '-',
    ['Passwords and autofill', '›'],
    ['History', '›'],
    ['Downloads', 'Ctrl+J'],
    ['Bookmarks and lists', '›'],
    ['Tab groups', '›'],
    ['Extensions', '›', 'mi-extensions', 'puzzle'],
    ['Delete browsing data...', 'Ctrl+Shift+Del'],
    '-',
    ['Zoom', 'zoom'],
    '-',
    ['Print...', 'Ctrl+P'],
    ['Search with Google Lens', ''],
    ['Translate...', ''],
    ['Find and edit', '›'],
    ['Cast, save, and share', '›'],
    ['More tools', '›'],
    '-',
    ['Help', '›'],
    ['Settings', ''],
    ['Exit', '']
  ];
  $('#chrome-menu').innerHTML = items
    .map((it) => {
      if (it === '-') return '<div class="sep"></div>';
      const [label, kb, id, ic] = it;
      if (kb === 'zoom')
        return `<div class="mi"><span class="mic"></span><span class="lbl">Zoom</span><span class="zoom"><span>–</span><span>100%</span><span>+</span></span></div>`;
      return `<div class="mi" ${id ? `id="${id}"` : ''}><span class="mic">${ic ? icon(ic, 18) : ''}</span><span class="lbl">${label}</span><span class="kb">${kb === '›' ? icon('chevronRight', 18, '#5f6368') : kb}</span></div>`;
    })
    .join('');
  $('#chrome-submenu').innerHTML = `
    <div class="mi" id="mi-manage"><span class="mic">${icon('puzzle', 18)}</span><span class="lbl">Manage Extensions</span></div>
    <div class="mi"><span class="mic">${icon('star', 18)}</span><span class="lbl">Visit Chrome Web Store</span></div>`;
  $('#ext-menu').innerHTML = `
    <h4>Extensions <span>${icon('close', 18, '#474747')}</span></h4>
    <div class="sub">Full access<span>These extensions can see and change information on this site.</span></div>
    <div class="ext-row" id="ext-row"><span>${LOGOS.extY(20)}</span><span class="nm">YouTube Niche Filter</span>
      <span class="pinbtn" id="ext-pin">${icon('pin', 18)}</span><span class="more">${icon('dots', 18)}</span></div>
    <div class="foot">${icon('tune', 18, '#474747')}<span>Manage extensions</span></div>`;
  $('#dl-bubble').innerHTML = `
    <h4>Recent download history</h4>
    <div class="dl-row"><span>${LOGOS.zip(32)}</span>
      <div class="meta"><b>youtube-ai-assistant.zip</b><span>339 KB • Done</span></div>
      <span class="act" id="dl-folder">${icon('folderOpen', 20)}</span></div>
    <div class="dl-foot">Full download history</div>`;
}

function placeBubble(id, anchorId, { align = 'right', dx = 0, dy = 4 } = {}) {
  const el = $('#' + id);
  const a = $('#' + anchorId);
  const ar = rectIn(a, $('#chrome'));
  el.classList.remove('hidden');
  const w = el.offsetWidth;
  const left = align === 'right' ? ar.x + ar.w - w + dx : ar.x + dx;
  el.style.left = Math.min(left, 1920 - w - 8) + 'px';
  el.style.top = ar.y + ar.h + dy + 'px';
}

// Rect of an element relative to an ancestor, in unscaled stage pixels.
function rectIn(el, ancestor) {
  let x = 0;
  let y = 0;
  let n = el;
  while (n && n !== ancestor) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/* ============================ Drive ============================ */
function buildDrive() {
  $('#pg-drive').innerHTML = `
    <div class="dbar">
      <div class="nm">${LOGOS.zip(24)}<span>youtube-ai-assistant.zip</span></div>
      <div class="dbtn" id="drive-dl">${icon('download', 24)}<div class="tip hidden" id="drive-tip">Download</div></div>
      <div class="dbtn">${icon('dots', 24)}</div>
    </div>
    <div class="zipcard">
      <h5>youtube-ai-assistant.zip</h5>
      <div class="zrow">${LOGOS.folder(22)}<span>youtube-ai-assistant</span></div>
      ${EXT_FILES.folders.map((f) => `<div class="zrow ind">${LOGOS.folder(22)}<span>${f}</span></div>`).join('')}
      ${['manifest.json', 'QUICK_START.md', 'CUSTOM_CATEGORIES.md', 'INSTALLATION_TESTING.md'].map((f) => `<div class="zrow ind">${LOGOS.file(22)}<span>${f}</span></div>`).join('')}
      <div class="zrow ind" style="color:#5f6368">+ 11 more files</div>
    </div>`;
}

/* ============================ New tab ============================ */
function buildNtp() {
  const g = [['G', '#4285f4'], ['o', '#ea4335'], ['o', '#fbbc05'], ['g', '#4285f4'], ['l', '#34a853'], ['e', '#ea4335']];
  $('#pg-ntp').innerHTML = `
    <div class="glogo">${g.map(([c, col]) => `<span style="color:${col}">${c}</span>`).join('')}</div>
    <div class="gsearch">${icon('search', 20, '#5f6368')}<span>Search Google or type a URL</span></div>
    <div class="shortcuts">
      <div><i>${LOGOS.drive(22)}</i>Drive</div><div><i>${LOGOS.youtube(16)}</i>YouTube</div><div><i>${icon('plus', 22, '#3c4043')}</i>Add shortcut</div>
    </div>`;
}

/* ============================ YouTube ============================ */
const VIDEOS = [
  { t: 'I Built a Full-Stack App in 24 Hours (Here’s How)', c: 'CodeCraft Daily', v: '412K views • 3 days ago', d: '18:42', e: '💻', tt: '24h app', bg: 'linear-gradient(135deg,#0f2027,#2c5364)', av: '#2c5364' },
  { t: 'Easy 15-Minute Pasta Anyone Can Make', c: 'Home Kitchen Studio', v: '1.2M views • 1 week ago', d: '13:48', e: '🍝', tt: '15 min pasta', bg: 'linear-gradient(135deg,#f7971e,#ffd200)', av: '#e67e22', id: 'yt-match' },
  { t: 'Top 10 Hidden Gems in Open-World Games', c: 'Pixel Quest', v: '856K views • 2 days ago', d: '21:05', e: '🎮', tt: 'hidden gems', bg: 'linear-gradient(135deg,#41295a,#2f0743)', av: '#8e44ad' },
  { t: 'How I Save $1,000 Every Month on a Normal Salary', c: 'Money Simple', v: '2.3M views • 5 days ago', d: '15:10', e: '💰', tt: 'save $1000', bg: 'linear-gradient(135deg,#134e5e,#71b280)', av: '#16a085' },
  { t: 'Full Body Workout — No Equipment Needed', c: 'FitWithSam', v: '640K views • 1 day ago', d: '25:31', e: '🏋️', tt: 'no gym', bg: 'linear-gradient(135deg,#cb2d3e,#ef473a)', av: '#c0392b' },
  { t: 'Chef Tips: Knife Skills for Beginners', c: 'Kitchen Basics', v: '380K views • 4 days ago', d: '11:27', e: '🔪', tt: 'knife skills', bg: 'linear-gradient(135deg,#355c7d,#6c5b7b)', av: '#355c7d' },
  { t: 'Lo-fi Beats to Study and Relax', c: 'Calm Waves Music', v: '5.1M views • 1 month ago', d: '1:02:13', e: '🎧', tt: 'lo-fi', bg: 'linear-gradient(135deg,#654ea3,#eaafc8)', av: '#654ea3' },
  { t: 'Python in 100 Seconds for Absolute Beginners', c: 'ByteSized', v: '990K views • 2 weeks ago', d: '2:41', e: '🐍', tt: 'python', bg: 'linear-gradient(135deg,#1e3c72,#2a5298)', av: '#2a5298' },
  { t: 'The Perfect Homemade Pizza Dough Recipe', c: 'Home Kitchen Studio', v: '2.7M views • 3 weeks ago', d: '16:02', e: '🍕', tt: 'pizza dough', bg: 'linear-gradient(135deg,#c0392b,#f39c12)', av: '#e67e22' },
  { t: 'Starting a Business With $0 — What Actually Works', c: 'Founder Notes', v: '720K views • 6 days ago', d: '19:44', e: '📈', tt: '$0 start', bg: 'linear-gradient(135deg,#232526,#414345)', av: '#414345' },
  { t: 'Street Food Tour: 12 Dishes in One Day', c: 'Wander & Taste', v: '1.8M views • 2 weeks ago', d: '28:16', e: '🍜', tt: '12 dishes', bg: 'linear-gradient(135deg,#ff512f,#dd2476)', av: '#dd2476' },
  { t: 'Funniest Moments of the Year', c: 'Laugh Lab', v: '3.4M views • 1 month ago', d: '12:09', e: '😂', tt: 'top moments', bg: 'linear-gradient(135deg,#f953c6,#b91d73)', av: '#b91d73' }
];

function thumb(v, small = false) {
  return `<div class="thumb" style="background:${v.bg}">${small ? '' : `<div class="tt">${v.tt}</div>`}<div class="emo" style="${small ? '' : 'position:absolute;right:22px;top:50%;transform:translateY(-50%)'}">${v.e}</div><div class="dur">${v.d}</div></div>`;
}

function ytHeader() {
  return `<div class="yh">
    ${icon('menu', 24)}
    <div class="ylogo">${LOGOS.youtube(20)}<span>YouTube</span><sup>IN</sup></div>
    <div class="ysearch"><div class="box">Search</div><div class="sbtn">${icon('search', 22)}</div><div class="mic">${icon('mic', 22)}</div></div>
    <div class="yright"><div class="create">${icon('plus', 22)}Create</div>${icon('bell', 24)}<div class="yav">A</div></div>
  </div>`;
}

function buildYouTube() {
  $('#pg-yt').innerHTML = `${ytHeader()}
    <div class="yside">
      <div class="si on">${icon('home', 24)}Home</div><div class="si">${icon('shorts', 24)}Shorts</div><div class="si">${icon('subs', 24)}Subscriptions</div>
      <div class="ssep"></div><h6>You ›</h6><div class="si">${icon('history', 24)}History</div><div class="si">${icon('video', 24)}Your videos</div><div class="si">${icon('thumbUp', 24)}Liked videos</div>
      <div class="ssep"></div><h6>Explore</h6><div class="si">${icon('music', 24)}Music</div><div class="si">${icon('video', 24)}Gaming</div>
    </div>
    <div class="ymain"><div class="yscroll" id="yt-scroll">
      <div class="chips">${['All', 'Music', 'Gaming', 'Cooking', 'Programming', 'Live', 'Podcasts', 'Fitness', 'News', 'Recently uploaded'].map((c, i) => `<div class="chip ${i === 0 ? 'on' : ''}">${c}</div>`).join('')}</div>
      <div class="grid">${VIDEOS.map(
        (v, i) => `<div class="card" id="${v.id || 'yt-card-' + i}">${thumb(v)}
          <div class="meta"><div class="cav" style="background:${v.av}">${v.c[0]}</div><div><h3>${v.t}</h3><p>${v.c}<br>${v.v}</p></div></div></div>`
      ).join('')}</div>
    </div></div>
    <div class="cover hidden" id="yt-cover"></div>`;
}

function buildWatch() {
  const v = VIDEOS[1];
  const next = [VIDEOS[8], VIDEOS[5], VIDEOS[10], VIDEOS[0], VIDEOS[3]];
  $('#pg-watch').innerHTML = `${ytHeader()}
    <div class="wmain">
      <div class="player">
        <div class="scene" style="background:${v.bg}">
          <div style="font-size:300px;font-family:'Noto Color Emoji';filter:drop-shadow(0 20px 30px rgba(0,0,0,.35))" id="watch-emo">${v.e}</div>
          <div style="position:absolute;left:60px;top:50px;font-family:Barlow;font-weight:700;font-size:96px;color:#fff;text-shadow:0 6px 0 rgba(0,0,0,.3);line-height:.95">15 MIN<br>PASTA</div>
        </div>
        <div class="ctrl"><div class="bar"><i id="watch-prog"></i><b id="watch-knob"></b></div>
          <div class="cl">${icon('pause', 28, '#fff')}${icon('volume', 26, '#fff')}<span id="watch-time">0:00 / 13:48</span></div>
          <div class="cr">${icon('tune', 26, '#fff')}${icon('fullscreen', 28, '#fff')}</div></div>
      </div>
      <div class="wtitle">${v.t}</div>
      <div class="wrow"><div class="yav" style="background:${v.av};width:40px;height:40px;border-radius:20px">H</div>
        <div class="cn"><b>${v.c}</b><span>1.24M subscribers</span></div><div class="subbtn">Subscribe</div>
        <div style="flex:1"></div><div class="pillbtn">${icon('thumbUp', 20)}24K</div><div class="pillbtn">${icon('share', 20)}Share</div><div class="pillbtn">${icon('dotsH', 20)}</div></div>
    </div>
    <div class="upnext">${next.map((n) => `<div class="ui">${thumb(n, true)}<div><h4>${n.t}</h4><p>${n.c}<br>${n.v}</p></div></div>`).join('')}</div>`;
}

/* ============================ Explorer ============================ */
const Explorer = {
  loc: 'downloads',
  build() {
    $('#explorer').innerHTML = `
      <div class="wt"><div class="wtab">${LOGOS.folder(18)}<span class="t" id="ex-title">Downloads</span>${icon('close', 14, '#555')}</div>
        <div style="padding:0 0 8px 12px">${icon('plus', 18, '#444')}</div>
        <div class="caps"><div id="ex-min">${icon('minimize', 16)}</div><div>${icon('maximize', 14)}</div><div>${icon('close', 16)}</div></div></div>
      <div class="addr"><div class="nav">${icon('back', 18)}</div><div class="nav off">${icon('forward', 18)}</div><div class="nav">${icon('up', 18)}</div><div class="nav">${icon('reload', 18)}</div>
        <div class="crumbs" id="ex-crumbs"></div><div class="wsearch">${icon('search', 16)}<span id="ex-search">Search Downloads</span></div></div>
      <div class="cmd" id="ex-cmd"></div>
      <div class="body">
        <div class="navpane">${navItems('downloads')}</div>
        <div class="list" id="ex-list"></div>
      </div>
      <div class="status" id="ex-status"></div>`;
    this.go('downloads');
  },
  go(loc) {
    this.loc = loc;
    const crumbs = { downloads: ['This PC', 'Downloads'], extracted: ['This PC', 'Downloads', 'youtube-ai-assistant'], inner: ['This PC', 'Downloads', 'youtube-ai-assistant', 'youtube-ai-assistant'] }[loc];
    $('#ex-crumbs').innerHTML = `${icon('pc', 16, '#555')}` + crumbs.map((c) => `${icon('chevronRight', 16)}<span class="c">${c}</span>`).join('');
    $('#ex-title').textContent = crumbs[crumbs.length - 1];
    $('#ex-search').textContent = 'Search ' + crumbs[crumbs.length - 1];
    let rows = [];
    if (loc === 'downloads') rows = [{ id: 'ex-zip', n: 'youtube-ai-assistant.zip', ic: LOGOS.zip(20), m: '10/11/2026 1:04 PM', ty: 'Compressed (zipped) Folder', s: '340 KB' }];
    if (loc === 'extracted') rows = [{ id: 'ex-inner', n: 'youtube-ai-assistant', ic: LOGOS.folder(20), m: '10/11/2026 1:05 PM', ty: 'File folder', s: '' }];
    if (loc === 'inner')
      rows = [
        ...EXT_FILES.folders.map((f) => ({ id: 'ex-f-' + f, n: f, ic: LOGOS.folder(20), m: '10/11/2026 1:05 PM', ty: 'File folder', s: '' })),
        ...EXT_FILES.files.map(([f, ty, s]) => ({ id: f === 'manifest.json' ? 'ex-manifest' : '', n: f, ic: LOGOS.file(20, f.endsWith('.json') ? '{ }' : ''), m: '10/11/2026 1:05 PM', ty, s }))
      ];
    $('#ex-list').innerHTML =
      `<div class="lh"><div>Name</div><div>Date modified</div><div>Type</div><div>Size</div></div>` +
      (loc === 'downloads' ? `<div class="grp">${icon('chevronDown', 16, '#2a5ea8')}Today</div>` : '') +
      rows.map((r) => `<div class="lr" ${r.id ? `id="${r.id}"` : ''}><div class="n">${r.ic}<span>${r.n}</span></div><div class="m">${r.m}</div><div class="m">${r.ty}</div><div class="m">${r.s}</div></div>`).join('');
    $('#ex-status').innerHTML = `<span>${rows.length} item${rows.length === 1 ? '' : 's'}</span>`;
    this.cmd(false);
  },
  cmd(zipSelected) {
    $('#ex-cmd').innerHTML = `<div class="cb">${icon('plus', 18)}New ${icon('chevronDown', 16)}</div><div class="vs"></div>
      ${['cut', 'copy', 'rename', 'share', 'trash'].map((n) => `<div class="cb dim">${icon(n, 18)}</div>`).join('')}<div class="vs"></div>
      <div class="cb">${icon('sort', 18)}Sort ${icon('chevronDown', 16)}</div><div class="cb">${icon('view', 18)}View ${icon('chevronDown', 16)}</div>
      ${zipSelected ? `<div class="vs"></div><div class="cb" id="ex-extractall">${icon('extract', 18)}Extract all</div>` : ''}<div class="cb">${icon('dotsH', 18)}</div>`;
  },
  select(id, on = true) {
    $$('#ex-list .lr').forEach((r) => r.classList.remove('sel'));
    if (id && on) $('#' + id).classList.add('sel');
    if (this.loc === 'downloads') {
      this.cmd(!!id);
      $('#ex-status').innerHTML = `<span>1 item</span>${id ? '<span>1 item selected  340 KB</span>' : ''}`;
    }
  }
};

function navItems(sel) {
  const items = [
    ['home', 'Home', 'home'],
    ['image', 'Gallery', 'gallery'],
    '-',
    ['desktop', 'Desktop', 'desktop'],
    ['download', 'Downloads', 'downloads'],
    ['doc', 'Documents', 'documents'],
    ['image', 'Pictures', 'pictures'],
    ['music', 'Music', 'music'],
    ['video', 'Videos', 'videos'],
    '-',
    ['pc', 'This PC', 'pc'],
    ['network', 'Network', 'network']
  ];
  return items
    .map((it) => (it === '-' ? '<div class="nsep"></div>' : `<div class="ni ${it[2] === sel ? 'sel' : ''}" data-nav="${it[2]}">${icon(it[0], 18)}<span>${it[1]}</span></div>`))
    .join('');
}

function buildCtxMenu() {
  $('#ctxmenu').innerHTML = `
    <div class="ctop">${['cut', 'copy', 'rename', 'share', 'trash'].map((n) => `<div>${icon(n, 18)}</div>`).join('')}</div>
    <div class="ci"><span class="cico">${icon('folderOpen', 18)}</span>Open<span class="k">Enter</span></div>
    <div class="ci"><span class="cico">${icon('plus', 18)}</span>Open in new tab</div>
    <div class="ci"><span class="cico">${icon('desktop', 18)}</span>Open in new window</div>
    <div class="ci" id="ctx-extract"><span class="cico">${icon('extract', 18)}</span>Extract All...</div>
    <div class="ci"><span class="cico">${icon('pin', 18)}</span>Pin to Quick access</div>
    <div class="ci"><span class="cico">${icon('pin', 18)}</span>Pin to Start</div>
    <div class="ci"><span class="cico">${icon('copy', 18)}</span>Copy as path<span class="k">Ctrl+Shift+C</span></div>
    <div class="ci"><span class="cico">${icon('tune', 18)}</span>Properties<span class="k">Alt+Enter</span></div>
    <div class="csep"></div>
    <div class="ci"><span class="cico">${icon('dotsH', 18)}</span>Show more options</div>`;
}

function buildExtractDialog() {
  $('#extract-dlg').innerHTML = `
    <div class="dt"><span>${icon('back', 16, '#333')}</span><div class="x">${icon('close', 16)}</div></div>
    <div class="wiz">
      <div style="display:flex;align-items:center;gap:10px;font-size:15px">${LOGOS.zip(22)}Extract Compressed (Zipped) Folders</div>
      <h3>Select a Destination and Extract Files</h3>
      <div>Files will be extracted to this folder:</div>
      <div class="fld"><div class="inp">C:\\Users\\You\\Downloads\\youtube-ai-assistant</div><div class="btn-w">Browse...</div></div>
      <div class="chk"><i>${icon('check', 16, '#fff')}</i>Show extracted files when complete</div>
    </div>
    <div class="foot"><div class="btn-w primary" id="dlg-extract">Extract</div><div class="btn-w">Cancel</div></div>`;
}

/* ============================ Folder picker ============================ */
const Picker = {
  build() {
    $('#picker').innerHTML = `
      <div class="dt"><span style="display:flex;align-items:center;gap:8px">${LOGOS.chrome(16)}Select the extension directory.</span><div class="x">${icon('close', 16)}</div></div>
      <div class="pk-top" style="background:#fff">
        <div class="addr"><div class="nav">${icon('back', 18)}</div><div class="nav off">${icon('forward', 18)}</div><div class="nav">${icon('up', 18)}</div><div class="nav">${icon('reload', 18)}</div>
          <div class="crumbs" id="pk-crumbs"></div><div class="wsearch" style="width:240px">${icon('search', 16)}<span id="pk-search"></span></div></div>
        <div class="cmd"><div class="cb">Organize ${icon('chevronDown', 16)}</div><div class="cb">New folder</div></div>
      </div>
      <div class="pk-body">
        <div class="navpane" id="pk-nav"></div>
        <div class="list" id="pk-list"></div>
      </div>
      <div class="pk-bottom">
        <div class="row"><label>Folder:</label><div class="inp" id="pk-folder"></div></div>
        <div class="btns"><div class="btn-w primary" id="pk-select">Select Folder</div><div class="btn-w">Cancel</div></div>
      </div>`;
    this.go('documents');
  },
  go(loc) {
    const crumbs = { documents: ['This PC', 'Documents'], downloads: ['This PC', 'Downloads'], outer: ['This PC', 'Downloads', 'youtube-ai-assistant'] }[loc];
    $('#pk-crumbs').innerHTML = `${icon('pc', 16, '#555')}` + crumbs.map((c) => `${icon('chevronRight', 16)}<span class="c">${c}</span>`).join('');
    $('#pk-search').textContent = 'Search ' + crumbs[crumbs.length - 1];
    $('#pk-nav').innerHTML = navItems(loc === 'documents' ? 'documents' : 'downloads');
    const rows = {
      documents: [['Projects', ''], ['Receipts', '']],
      downloads: [['youtube-ai-assistant', 'pk-outer']],
      outer: [['youtube-ai-assistant', 'pk-inner']]
    }[loc];
    $('#pk-list').innerHTML =
      `<div class="lh"><div>Name</div><div>Date modified</div><div>Type</div><div></div></div>` +
      rows.map(([n, id]) => `<div class="lr" ${id ? `id="${id}"` : ''}><div class="n">${LOGOS.folder(20)}<span>${n}</span></div><div class="m">10/11/2026 1:05 PM</div><div class="m">File folder</div><div></div></div>`).join('');
    $('#pk-folder').textContent = crumbs[crumbs.length - 1];
  },
  select(id) {
    $$('#pk-list .lr').forEach((r) => r.classList.remove('sel'));
    if (id) {
      $('#' + id).classList.add('sel');
      $('#pk-folder').textContent = 'youtube-ai-assistant';
    }
  }
};

function buildAll() {
  buildTaskbar();
  Chrome.build();
  Explorer.build();
  buildCtxMenu();
  buildExtractDialog();
  Picker.build();
}
