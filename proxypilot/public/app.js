const $ = (selector) => document.querySelector(selector);

const state = {
  profiles: [],
  settings: null,
  selected: new Set(),
  filter: 'all',
  search: '',
};

// ---------- server ----------

async function api(method, path, body = {}) {
  const res = await fetch(path, {
    method,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function loadState() {
  const data = await api('GET', '/api/state');
  state.profiles = data.profiles;
  state.settings = data.settings;
  pruneSelection();
  fillSettings();
  render();
}

function connect() {
  const events = new EventSource('/api/events');
  // Reload on every (re)connect so nothing is missed while the engine was restarting.
  events.onopen = () => {
    setConnected(true);
    loadState().catch((err) => toast(err.message, 'bad'));
  };
  events.onerror = () => setConnected(false);
  events.addEventListener('profiles', (e) => {
    state.profiles = JSON.parse(e.data);
    pruneSelection();
    render();
  });
  events.addEventListener('profile', (e) => {
    const profile = JSON.parse(e.data);
    const i = state.profiles.findIndex((p) => p.id === profile.id);
    if (i !== -1) state.profiles[i] = profile;
    render();
  });
  events.addEventListener('status', (e) => {
    const { id, status } = JSON.parse(e.data);
    const profile = state.profiles.find((p) => p.id === id);
    if (profile) profile.run = status;
    render();
  });
  events.addEventListener('settings', (e) => {
    state.settings = JSON.parse(e.data);
    if (!$('#settingsForm').contains(document.activeElement)) fillSettings();
  });
}

function setConnected(live) {
  const el = $('#conn');
  el.classList.toggle('live', live);
  el.textContent = live ? 'Engine running' : 'Engine offline: is "npm start" still running?';
}

// ---------- rendering ----------

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    draw();
  });
}

const isOpen = (p) => p.run.state === 'running' || p.run.state === 'launching';

function visibleProfiles() {
  const q = state.search.trim().toLowerCase();
  return state.profiles.filter((p) => {
    if (state.filter === 'open' && !isOpen(p)) return false;
    if (state.filter === 'ok' && p.proxyStatus !== 'ok') return false;
    if (state.filter === 'dead' && p.proxyStatus !== 'dead') return false;
    if (!q) return true;
    const haystack = [p.name, p.proxy.host, p.proxy.username, p.geo?.ip, p.geo?.country, p.geo?.countryCode, p.geo?.city];
    return haystack.some((v) => v && String(v).toLowerCase().includes(q));
  });
}

function draw() {
  const profiles = state.profiles;
  const count = (fn) => profiles.filter(fn).length;
  const launching = count((p) => p.run.state === 'launching');
  $('#stats').innerHTML = [
    ['Profiles', profiles.length],
    ['Working', count((p) => p.proxyStatus === 'ok')],
    ['Dead', count((p) => p.proxyStatus === 'dead')],
    ['Open', count((p) => p.run.state === 'running')],
    ...(launching ? [['Launching', launching]] : []),
  ]
    .map(([label, n]) => `<span class="stat">${label} <b>${n}</b></span>`)
    .join('');

  const visible = visibleProfiles();
  drawRows(visible);
  $('#empty').hidden = profiles.length > 0;

  const selectedVisible = visible.filter((p) => state.selected.has(p.id)).length;
  const selectAll = $('#selectAll');
  selectAll.checked = visible.length > 0 && selectedVisible === visible.length;
  selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;

  const n = state.selected.size;
  const usable = count((p) => p.proxyStatus !== 'dead');
  $('#bulkTarget').textContent = n ? `Applies to ${n} selected` : 'Applies to all profiles';
  $('#openTarget').textContent = n
    ? `Opens on the ${n} selected profile${n === 1 ? '' : 's'}.`
    : `Opens on all ${usable} profile${usable === 1 ? '' : 's'} whose proxy isn't dead.`;
  $('#openBtn').textContent = n ? `Open on ${n} selected` : 'Open on all';
}

// Rows are rebuilt only when their content changes, so a status update elsewhere in the table
// never swaps out the button or checkbox someone is clicking.
const rowCache = new Map();

function drawRows(visible) {
  const tbody = $('#rows');
  const rows = visible.map((p) => {
    const html = rowHtml(p);
    let entry = rowCache.get(p.id);
    if (entry?.html !== html) {
      const template = document.createElement('template');
      template.innerHTML = html;
      entry = { html, el: template.content.firstElementChild };
      rowCache.set(p.id, entry);
    }
    return entry.el;
  });
  rows.forEach((el, i) => {
    const current = tbody.children[i];
    if (current !== el) tbody.insertBefore(el, current ?? null);
  });
  while (tbody.children.length > rows.length) tbody.lastElementChild.remove();
  const known = new Set(state.profiles.map((p) => p.id));
  for (const id of rowCache.keys()) if (!known.has(id)) rowCache.delete(id);
}

function rowHtml(p) {
  const selected = state.selected.has(p.id);
  const open = isOpen(p);
  const fp = p.fingerprint;
  return `<tr data-id="${p.id}" class="${selected ? 'selected' : ''}">
    <td><input type="checkbox" data-select="${p.id}" ${selected ? 'checked' : ''} aria-label="Select ${esc(p.name)}"></td>
    <td><div class="name">${esc(p.name)}</div><div class="sub">${fp.hardwareConcurrency} cores · ${fp.deviceMemory} GB RAM</div></td>
    <td>
      <div class="mono"><span class="proto">${esc(p.proxy.protocol)}</span>${esc(hostPort(p.proxy))}</div>
      ${p.proxy.username ? `<div class="sub">user ${esc(p.proxy.username)}${p.proxy.hasPassword ? ' · password set' : ''}</div>` : ''}
    </td>
    <td>${proxyCell(p)}</td>
    <td>${browserCell(p)}</td>
    <td><div class="cell-actions">
      ${
        open
          ? `<button class="btn small" data-action="close" ${p.run.state === 'launching' ? 'disabled' : ''}>Close</button>`
          : `<button class="btn small" data-action="launch">Launch</button>`
      }
      <button class="btn small" data-action="check" ${p.proxyStatus === 'checking' ? 'disabled' : ''}>Test</button>
      <button class="btn icon" data-action="delete" title="Delete profile" aria-label="Delete ${esc(p.name)}">✕</button>
    </div></td>
  </tr>`;
}

function proxyCell(p) {
  if (p.proxyStatus === 'checking') return '<span class="pill busy">Testing…</span>';
  if (p.proxyStatus === 'unchecked') return '<span class="pill idle">Not tested</span>';
  if (p.proxyStatus === 'dead') return `<span class="pill bad">Dead</span><div class="err">${esc(p.proxyError ?? '')}</div>`;
  const g = p.geo;
  const place = [g.city, g.country].filter(Boolean).join(', ');
  return `<div>${flag(g.countryCode)} ${esc(place)}</div>
    <div class="sub mono">${esc(g.ip)} · ${g.latencyMs} ms</div>
    <div class="sub">${esc(g.timezone)}</div>`;
}

function browserCell(p) {
  const run = p.run;
  if (run.state === 'launching') return '<span class="pill busy">Launching…</span>';
  if (run.state === 'error') return `<span class="pill bad">Failed</span><div class="err">${esc(run.error)}</div>`;
  if (run.state !== 'running') return '<span class="pill idle">Closed</span>';
  const page = run.url
    ? `<div class="page-title sub"><a href="${esc(run.url)}" target="_blank" rel="noreferrer" title="${esc(run.url)}">${esc(run.title || run.url)}</a></div>`
    : '';
  return `<span class="pill ok">Open</span>${page}${run.error ? `<div class="err">${esc(run.error)}</div>` : ''}`;
}

function hostPort(proxy) {
  return `${proxy.host.includes(':') ? `[${proxy.host}]` : proxy.host}:${proxy.port}`;
}

function flag(code) {
  if (!/^[A-Z]{2}$/.test(code ?? '')) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function pruneSelection() {
  const ids = new Set(state.profiles.map((p) => p.id));
  for (const id of state.selected) if (!ids.has(id)) state.selected.delete(id);
}

// ---------- feedback ----------

function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 9000 : 5000);
}

async function withBusy(button, label, fn) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    await fn();
  } catch (err) {
    toast(err.message, 'bad');
  } finally {
    button.disabled = false;
    button.textContent = original;
    render();
  }
}

function summarize(results, verb) {
  if (!results.length) return toast('Nothing to do: no matching profiles.', 'bad');
  const failed = results.filter((r) => !r.ok);
  const ok = results.length - failed.length;
  if (!failed.length) return toast(`${verb} ${ok} of ${results.length}.`, 'ok');
  toast(`${verb} ${ok} of ${results.length}. ${failed.length} failed: ${failed[0].error}${failed.length > 1 ? ' (details in the table)' : ''}`, ok ? '' : 'bad');
}

const selectedIds = () => (state.selected.size ? [...state.selected] : undefined);

// ---------- actions ----------

$('#proxyFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  $('#proxyText').value = text;
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;
  $('#importResult').textContent = `Loaded ${file.name} (${lines} lines). Click "Import proxies".`;
  e.target.value = '';
});

$('#importBtn').addEventListener('click', (e) =>
  withBusy(e.currentTarget, 'Importing…', async () => {
    const text = $('#proxyText').value;
    if (!text.trim()) return toast('Paste proxies or upload a .txt file first.', 'bad');
    const r = await api('POST', '/api/proxies/import', {
      text,
      protocol: $('#proxyProtocol').value,
      check: $('#checkAfterImport').checked,
    });
    const parts = [`Added ${r.added} profile${r.added === 1 ? '' : 's'}.`];
    if (r.duplicates) parts.push(`${r.duplicates} duplicate${r.duplicates === 1 ? '' : 's'} skipped.`);
    if (r.errorCount) {
      const sample = r.errors.slice(0, 3).map((err) => `line ${err.line}: ${err.reason}`).join('; ');
      parts.push(`${r.errorCount} line${r.errorCount === 1 ? '' : 's'} not understood (${sample}).`);
    } else {
      $('#proxyText').value = '';
    }
    $('#importResult').textContent = parts.join(' ');
    toast(parts[0], r.added ? 'ok' : 'bad');
  }),
);

$('#openForm').addEventListener('submit', (e) => {
  e.preventDefault();
  withBusy($('#openBtn'), 'Opening…', async () => {
    const url = $('#url').value.trim();
    if (!url) return toast('Enter a website address first.', 'bad');
    savePrefs();
    const r = await api('POST', '/api/browsers/open-url', {
      url,
      ids: selectedIds(),
      newTab: $('#newTab').checked,
      launchClosed: $('#launchClosed').checked,
    });
    summarize(r.results, `Opened ${new URL(r.url).host} on`);
  });
});

document.querySelectorAll('[data-bulk]').forEach((button) =>
  button.addEventListener('click', () => runBulk(button.dataset.bulk, button)),
);

async function runBulk(action, button) {
  const ids = selectedIds();
  if (action === 'delete') {
    const n = ids ? ids.length : state.profiles.length;
    if (!n) return;
    const what = ids ? `${n} selected profile${n === 1 ? '' : 's'}` : `ALL ${n} profiles`;
    if (!confirm(`Delete ${what}? Their browsers are closed and their cookies and saved data are erased.`)) return;
  }
  const labels = { launch: 'Launching…', close: 'Closing…', check: 'Starting…', delete: 'Deleting…' };
  await withBusy(button, labels[action], async () => {
    if (action === 'launch') summarize((await api('POST', '/api/browsers/launch', { ids })).results, 'Launched');
    if (action === 'close') toast(`Closed ${(await api('POST', '/api/browsers/close', { ids })).closed} browser(s).`, 'ok');
    if (action === 'check') toast(`Testing ${(await api('POST', '/api/proxies/check', { ids })).started} proxies…`);
    if (action === 'delete') {
      const r = await api('POST', '/api/profiles/delete', { ids });
      toast(`Deleted ${r.removed} profile(s).${r.skipped ? ` ${r.skipped} still launching, try again in a moment.` : ''}`, 'ok');
    }
  });
}

$('#rows').addEventListener('click', async (e) => {
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  const id = row.dataset.id;
  const button = e.target.closest('button[data-action]');
  if (!button) {
    if (e.target.closest('a, input')) return;
    toggleSelected(id, !state.selected.has(id));
    return;
  }
  const action = button.dataset.action;
  const profile = state.profiles.find((p) => p.id === id);
  if (action === 'delete' && !confirm(`Delete ${profile?.name ?? 'this profile'}? Its cookies and saved data are erased.`)) return;
  await withBusy(button, '…', async () => {
    if (action === 'launch') {
      const [result] = (await api('POST', '/api/browsers/launch', { ids: [id] })).results;
      if (result && !result.ok) toast(result.error, 'bad');
    }
    if (action === 'close') await api('POST', '/api/browsers/close', { ids: [id] });
    if (action === 'check') await api('POST', '/api/proxies/check', { ids: [id] });
    if (action === 'delete') await api('POST', '/api/profiles/delete', { ids: [id] });
  });
});

$('#rows').addEventListener('change', (e) => {
  const id = e.target.dataset.select;
  if (id) toggleSelected(id, e.target.checked);
});

function toggleSelected(id, on) {
  if (on) state.selected.add(id);
  else state.selected.delete(id);
  render();
}

$('#selectAll').addEventListener('change', (e) => {
  for (const p of visibleProfiles()) toggleSelected(p.id, e.target.checked);
});

$('#search').addEventListener('input', (e) => {
  state.search = e.target.value;
  render();
});

$('#filter').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-filter]');
  if (!button) return;
  state.filter = button.dataset.filter;
  document.querySelectorAll('#filter button').forEach((b) => b.classList.toggle('active', b === button));
  render();
});

// ---------- settings ----------

function fillSettings() {
  const form = $('#settingsForm');
  for (const [key, value] of Object.entries(state.settings ?? {})) {
    const field = form.elements.namedItem(key);
    if (!field) continue;
    if (field.type === 'checkbox') field.checked = value;
    else field.value = value;
  }
}

$('#settingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  withBusy(form.querySelector('button[type=submit]'), 'Saving…', async () => {
    const patch = {};
    for (const field of form.elements) {
      if (!field.name) continue;
      patch[field.name] = field.type === 'checkbox' ? field.checked : field.type === 'number' ? Number(field.value) : field.value;
    }
    state.settings = await api('PUT', '/api/settings', patch);
    fillSettings();
    toast('Settings saved. They apply to browsers launched from now on.', 'ok');
  });
});

// ---------- remembered inputs (this browser only) ----------

const PREFS_KEY = 'proxypilot.prefs';

function savePrefs() {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ url: $('#url').value, newTab: $('#newTab').checked, launchClosed: $('#launchClosed').checked }),
    );
  } catch {
    // Storage unavailable (private window); nothing to remember.
  }
}

function restorePrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    if (typeof prefs.url === 'string') $('#url').value = prefs.url;
    if (typeof prefs.newTab === 'boolean') $('#newTab').checked = prefs.newTab;
    if (typeof prefs.launchClosed === 'boolean') $('#launchClosed').checked = prefs.launchClosed;
  } catch {
    // Ignore unreadable prefs.
  }
}

restorePrefs();
connect();
