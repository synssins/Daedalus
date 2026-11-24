'use strict';
// HomePanel Studio: devices, panels, themes, and (in editor.js) the grid editor. No framework.
// Words used on screen: a Panel is a finished set of dashboards; a Dashboard is one screen of buttons; a Device is
// a tablet running a panel; a Theme is a set of backgrounds and button designs that panels can follow.
// In the code and on disk a panel is still a "design", a dashboard a "page" and a button a "tile".

// ---------- small helpers ----------
const ICON = Object.assign({}, window.HP_ICONS, {
  plus: 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z',
  trash: 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z',
  copy: 'M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z',
  undo: 'M12.5,8C9.85,8 7.45,9 5.6,10.6L2,7V16H11L7.38,12.38C8.77,11.22 10.54,10.5 12.5,10.5C16.04,10.5 19.05,12.81 20.1,16L22.47,15.22C21.08,11.03 17.15,8 12.5,8Z',
  redo: 'M18.4,10.6C16.55,9 14.15,8 11.5,8C6.85,8 2.92,11.03 1.54,15.22L3.9,16C4.95,12.81 7.95,10.5 11.5,10.5C13.45,10.5 15.23,11.22 16.62,12.38L13,16H22V7L18.4,10.6Z',
  tablet: 'M19,18H5V6H19M21,4H3C1.89,4 1,4.89 1,6V18A2,2 0 0,0 3,20H21A2,2 0 0,0 23,18V6C23,4.89 22.1,4 21,4Z',
  sheet: 'M13,3V9H21V3M13,21H21V11H13M3,21H11V15H3M3,13H11V3H3V13Z',
  pencil: 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z',
  palette: 'M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z',
  cog: 'M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z',
  upload: 'M9,16V10H5L12,3L19,10H15V16H9M5,20V18H19V20H5Z',
  download: 'M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z',
  clock: 'M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z',
  image: 'M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z',
  text: 'M18.5,4L19.66,8.35L18.7,8.61C18.25,7.74 17.79,6.87 17.26,6.43C16.73,6 16.11,6 15.5,6H13V16.5C13,17 13,17.5 13.33,17.75C13.67,18 14.33,18 15,18V19H9V18C9.67,18 10.33,18 10.67,17.75C11,17.5 11,17 11,16.5V6H8.5C7.89,6 7.27,6 6.74,6.43C6.21,6.87 5.75,7.74 5.3,8.61L4.34,8.35L5.5,4H18.5Z',
  'chevron-right': 'M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z',
  'chevron-down': 'M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z',
  check: 'M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z',
});
const icon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n] || ''}"/></svg>`;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const uid = () => Math.random().toString(16).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
/** h('div', {class: 'x', onclick: fn}, child, 'text') */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'html') el.innerHTML = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v; else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const btn = (label, ic, onclick, cls) => h('button', {class: 'btn ' + (cls || ''), onclick, html: (ic ? icon(ic) : '') + (label ? `<span>${esc(label)}</span>` : ''), type: 'button'});
function toast(text, bad) { const t = $('#toast'); t.textContent = text; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = ''; }, 2800); }
const api = (path, opt) => fetch('admin/api/' + path, opt).then(async r => { if (!r.ok) throw new Error((await r.text()) || r.statusText); return r.json(); });
const send = (method, path, body) => api(path, {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body || {})});
const fail = e => toast(e.message, true);
const saveFile = (name, text, type) => { const a = h('a', {href: URL.createObjectURL(new Blob([text], {type: type || 'application/json'})), download: name}); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
const pickFile = (accept, fn) => { const i = h('input', {type: 'file', accept, onchange: () => { if (i.files[0]) fn(i.files[0]); }}); i.click(); };
const row = (label, ...ctl) => h('div', {class: 'f'}, h('label', null, label), h('div', {class: 'w'}, ...ctl));
const rgba = s => { const m = /rgba?\(([\d.\s]+),([\d.\s]+),([\d.\s]+)(?:,([\d.\s]+))?\)/.exec(s || ''); const x = v => (+v).toString(16).padStart(2, '0');
  return m ? {hex: '#' + x(m[1]) + x(m[2]) + x(m[3]), a: m[4] == null ? 1 : +m[4]} : /^#[0-9a-f]{6}$/i.test(s || '') ? {hex: s, a: 1} : null; };
const toRgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

/** Right-click menu. items: [label, fn] | [label, [sub items]] | null for a divider. */
function menu(ev, items) {
  ev.preventDefault();
  closeMenu();
  const build = list => h('div', {class: 'menu', role: 'menu'}, ...list.map(it => !it ? h('hr') : Array.isArray(it[1])
    ? h('div', {class: 'has', role: 'menuitem', tabIndex: 0, html: `<span>${esc(it[0])}</span>` + icon('chevron-right')}, build(it[1]))
    : h('button', {type: 'button', role: 'menuitem', class: it[2] || '', onclick: () => { closeMenu(); it[1](); }}, it[0])));
  const m = build(items); m.id = 'menu';
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(ev.clientX, innerWidth - r.width - 6) + 'px'; m.style.top = Math.min(ev.clientY, innerHeight - r.height - 6) + 'px';
  if (ev.clientX > innerWidth - r.width - 190) m.classList.add('flip');  // submenus open leftwards near the right edge
}
function closeMenu() { const m = $('#menu'); if (m) m.remove(); }
window.addEventListener('pointerdown', e => { if (!e.target.closest('#menu')) closeMenu(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
window.addEventListener('blur', closeMenu);

// ---------- Home Assistant's look ----------
// The Studio has no look of its own: inside Home Assistant it reads the active theme's variables from the page
// around it (same origin through ingress) and uses those, and follows when the theme or dark mode changes.
const HA_VARS = ['primary-background-color', 'secondary-background-color', 'card-background-color', 'sidebar-background-color', 'sidebar-text-color',
  'sidebar-icon-color', 'sidebar-selected-text-color', 'sidebar-selected-icon-color', 'divider-color', 'primary-text-color', 'secondary-text-color',
  'disabled-text-color', 'primary-color', 'text-primary-color', 'accent-color', 'success-color', 'warning-color', 'error-color', 'ha-card-border-radius',
  'ha-card-border-color', 'ha-card-border-width', 'ha-card-box-shadow', 'ha-font-family-body', 'paper-font-body1_-_font-family', 'input-fill-color',
  'input-ink-color', 'input-idle-line-color', 'app-header-background-color', 'app-header-text-color', 'mdc-theme-primary', 'ha-border-radius-pill'];
function haTheme() {
  let host = null;
  try { if (window.parent !== window) host = window.parent.document; } catch (e) {}  // not inside Home Assistant
  if (!host) return;
  const read = () => {
    const from = getComputedStyle(host.documentElement), body = getComputedStyle(host.body), to = document.documentElement.style;
    for (const k of HA_VARS) { const v = from.getPropertyValue('--' + k).trim() || body.getPropertyValue('--' + k).trim(); if (v) to.setProperty('--' + k, v); else to.removeProperty('--' + k); }
    const bg = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || [255, 255, 255];
    to.colorScheme = (0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]) < 128 ? 'dark' : 'light';
  };
  read();
  new MutationObserver(read).observe(host.documentElement, {attributes: true, attributeFilter: ['style', 'class']});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', read);
  setInterval(read, 5000);  // themes applied by other means than the root style attribute
}

// ---------- state and navigation ----------
const A = {state: {tablets: [], designs: [], assets: [], library: {themes: []}}, view: 'gallery', ed: null, th: null, ents: [], devs: [], areas: [],
  open: {panels: true, themes: true}, panel: null, screen: null};
const themes = () => A.state.library.themes || [];
const themeBy = id => themes().find(t => t.id === id) || null;
const usedBy = id => A.state.tablets.filter(t => t.design === id).map(t => t.name);
const VIEWS = {gallery: viewGallery, devices: viewDevices, panel: viewPanel, backgrounds: viewTheme, buttons: viewTheme, settings: viewSettings};
function redraw() { rail(); if (A.view !== 'editor' && VIEWS[A.view]) VIEWS[A.view](); }
const setState = s => { A.state = s; redraw(); };
function unsaved() {
  if (A.ed && A.ed.dirty && !confirm('Leave without saving? Changes to "' + A.ed.name + '" will be lost.')) return true;
  if (A.th && A.th.dirty && !confirm('Leave without saving? Changes to the theme "' + A.th.draft.name + '" will be lost.')) return true;
  return false;
}
function go(view, arg) {
  if (unsaved()) return;
  A.ed = null;
  if (view !== 'backgrounds' && view !== 'buttons') A.th = null;
  A.view = view;
  if (view === 'panel') A.panel = arg;
  history.replaceState(null, '', '#' + (view === 'panel' ? 'panel=' + arg : view === 'gallery' ? 'editor' : view));
  redraw();
}

function rail() {
  const pending = A.state.tablets.some(t => t.status === 'pending');
  const item = (label, ic, cur, onclick, extra, cls) => h('button', {type: 'button', title: label, class: cls || '', 'aria-current': cur ? 'page' : null, onclick, html: (ic ? icon(ic) : '') + `<span>${esc(label)}</span>` + (extra || '')});
  const group = (key, label, ic, kids) => [
    h('button', {type: 'button', title: label, 'aria-expanded': A.open[key], onclick: () => { A.open[key] = !A.open[key]; rail(); }, html: icon(ic) + `<span>${esc(label)}</span>` + `<span class="tw">${icon(A.open[key] ? 'chevron-down' : 'chevron-right')}</span>`}),
    ...(A.open[key] ? kids : [])];
  $('#rail').replaceChildren(
    item('Editor', 'pencil', A.view === 'gallery' || A.view === 'editor', () => go('gallery')),
    item('Devices', 'tablet', A.view === 'devices', () => go('devices'), pending ? '<span class="dot" title="A device is waiting for approval"></span>' : ''),
    ...group('panels', 'Panels', 'sheet', A.state.designs.length
      ? A.state.designs.map(d => item(d.name, null, A.view === 'panel' && A.panel === d.id, () => go('panel', d.id), '', 'sub'))
      : [h('div', {class: 'none'}, 'None yet')]),
    ...group('themes', 'Themes', 'palette', [
      item('Backgrounds', null, A.view === 'backgrounds', () => go('backgrounds'), '', 'sub'),
      item('Buttons', null, A.view === 'buttons', () => go('buttons'), '', 'sub')]),
    h('span', {class: 'sp'}),
    item('Settings', 'cog', A.view === 'settings', () => go('settings')));
}

/** A live, scaled-down copy of a panel as the tablet draws it. */
function thumb(designId, w, hh, width, live) {
  const s = width / w;
  return h('div', {class: 'thumb' + (live ? ' live' : ''), style: `width:${width}px;height:${Math.round(hh * s)}px`},
    h('iframe', {title: 'Panel preview', loading: designId ? 'lazy' : null, width: w, height: hh, style: `transform:scale(${s})`, tabIndex: live ? 0 : -1,
      src: 'renderer/index.html?preview=1&key=studio-preview&design=' + encodeURIComponent(designId || '')}));
}
const BLANK = () => ({format: 1, grid: {cols: 64, rows: 48}, start: 'home', rooms: {},
  theme: {background: {image: 'assets/dusk.svg', color: '#141a5c', dim: 0.04}, tile: {fill: 'rgba(255,255,255,.15)', radius: 22, gap: 5, glass: true}},
  pages: [{id: 'home', name: 'Home', tiles: []}]});
const newPanel = () => send('POST', 'designs', {name: 'New panel', design: BLANK()}).then(rec => openDesign(rec.id), fail);
const importPanel = () => pickFile('.json,application/json', async f => {
  try { const d = JSON.parse(await f.text()); const rec = await send('POST', 'designs', {name: f.name.replace(/\.json$/i, ''), design: d.design || d}); openDesign(rec.id); }
  catch (err) { toast('That file is not a HomePanel panel: ' + err.message, true); }
});
const exportPanel = id => api('designs/' + id).then(rec => saveFile(rec.name + '.json', JSON.stringify(rec.design, null, 1)), fail);
const deletePanel = d => { const on = usedBy(d.id); if (confirm('Delete "' + d.name + '"?' + (on.length ? ' ' + on.join(', ') + ' will show no panel.' : ''))) api('designs/' + d.id, {method: 'DELETE'}).then(s => { if (A.view === 'panel' && A.panel === d.id) { A.state = s; go('gallery'); } else setState(s); }, fail); };
const panelMenu = (ev, d) => menu(ev, [['Edit', () => openDesign(d.id)], ['Open', () => go('panel', d.id)], null,
  ['Duplicate', () => send('POST', 'designs/' + d.id + '/duplicate').then(setState, fail)], ['Export', () => exportPanel(d.id)], null, ['Delete', () => deletePanel(d), 'stop']]);

// ---------- Editor: choose a panel ----------
function viewGallery() {
  const cards = A.state.designs.map(d => {
    const on = usedBy(d.id);
    return h('div', {class: 'card pick', tabIndex: 0, role: 'button', 'aria-label': 'Edit ' + d.name, onclick: () => openDesign(d.id), oncontextmenu: ev => panelMenu(ev, d),
      onkeydown: ev => { if (ev.key === 'Enter') openDesign(d.id); }},
      thumb(d.id, 1024, 768, 300),
      h('div', {class: 'cap'}, h('b', null, d.name), h('span', null, on.length ? on.join(', ') : 'Not on a device')));
  });
  $('#main').replaceChildren(
    h('div', {class: 'head'}, h('h1', null, 'Editor'), h('span', {class: 'sp'}), btn('Import', 'upload', importPanel), btn('New panel', 'plus', newPanel, 'go')),
    h('div', {class: 'body'}, cards.length ? h('div', {class: 'cards'}, ...cards)
      : h('div', {class: 'empty', html: '<b>No panels yet</b>A panel is a set of dashboards for a device. Make one, lay out its buttons, then give it to a device.'})));
}

// ---------- Devices ----------
function viewDevices() {
  const ts = [...A.state.tablets].sort((a, b) => (a.status === 'approved') - (b.status === 'approved') || a.name.localeCompare(b.name));
  const rows = ts.map(t => {
    const pending = t.status === 'pending';
    const panel = h('select', {'aria-label': 'Panel for ' + t.name, disabled: pending, onchange: e => send('PATCH', 'tablets/' + t.id, {design: e.target.value || null}).then(setState, fail)},
      h('option', {value: ''}, 'None'), ...A.state.designs.map(d => h('option', {value: d.id, selected: d.id === t.design}, d.name)));
    return h('tr', null,
      h('td', null, h('input', {type: 'text', value: t.name, 'aria-label': 'Device name', onchange: e => send('PATCH', 'tablets/' + t.id, {name: e.target.value.trim() || t.name}).then(setState, fail)})),
      h('td', null, t.model || 'Unknown', h('div', {class: 'sub'}, t.width ? `${t.width} × ${t.height}, ${t.orientation}` : 'Size not reported')),
      h('td', null, h('span', {class: 'chip ' + (pending ? 'wait' : t.online ? 'live' : '')}, pending ? 'Waiting for approval' : t.online ? 'Connected' : 'Not connected')),
      h('td', null, panel),
      h('td', null, t.design ? h('button', {type: 'button', class: 'bare', title: 'Open this panel', onclick: () => go('panel', t.design)}, thumb(t.design, t.width || 1024, t.height || 768, 132)) : h('span', {class: 'sub'}, 'No panel')),
      h('td', {class: 'act'},
        pending ? btn('Approve', null, () => send('POST', 'tablets/' + t.id + '/approve').then(setState, fail), 'go') : null,
        btn('Remove', 'trash', () => { if (confirm('Remove "' + t.name + '"? It will have to be approved again.')) api('tablets/' + t.id, {method: 'DELETE'}).then(setState, fail); }, 'stop')));
  });
  $('#main').replaceChildren(
    h('div', {class: 'head'}, h('h1', null, 'Devices')),
    h('div', {class: 'body'}, ts.length
      ? h('div', {class: 'card'}, h('table', null, h('thead', null, h('tr', null, ...['Name', 'Device', 'Status', 'Panel', 'On screen', ''].map(x => h('th', null, x)))), h('tbody', null, ...rows)))
      : h('div', {class: 'empty', html: '<b>No devices yet</b>Open the HomePanel app on a tablet that is on the same network. It finds this server by itself and appears here for approval.'})));
}

// ---------- Panels: one finished panel, live, at any device's size ----------
const SCREENS = [[1024, 768, 'iPad landscape'], [768, 1024, 'iPad portrait'], [1280, 800, 'Tablet 1280 × 800'], [800, 480, 'Small panel 800 × 480']];
function screens() {
  const out = SCREENS.map(s => ({w: s[0], h: s[1], name: s[2]}));
  [...A.state.tablets].reverse().forEach(t => { if (t.width) out.unshift({w: t.width, h: t.height, name: t.name, device: true}); });
  return out;
}
const screenPick = (cur, set) => h('select', {'aria-label': 'Device', title: 'Device to fit', onchange: ev => { const [w, hh] = ev.target.value.split('x').map(Number); set({w, h: hh}); }},
  ...screens().map(s => h('option', {value: s.w + 'x' + s.h, selected: s.w === cur.w && s.h === cur.h}, `${s.name} (${s.w} × ${s.h})`)));
function viewPanel() {
  const d = A.state.designs.find(x => x.id === A.panel);
  if (!d) return go('gallery');
  const t0 = A.state.tablets.find(x => x.design === d.id && x.width), sc = A.screen || (t0 ? {w: t0.width, h: t0.height} : {w: 1024, h: 768});
  const assign = h('div', {class: 'checks'}, ...A.state.tablets.filter(t => t.status === 'approved').map(t => h('label', null,
    h('input', {type: 'checkbox', checked: t.design === d.id, onchange: e => send('PATCH', 'tablets/' + t.id, {design: e.target.checked ? d.id : null}).then(setState, fail)}), t.name)));
  const stage = h('div', {class: 'livewrap'});
  $('#main').replaceChildren(
    h('div', {class: 'head'},
      h('input', {type: 'text', class: 'title', value: d.name, 'aria-label': 'Panel name', onchange: async e => { try { const rec = await api('designs/' + d.id); await send('PUT', 'designs/' + d.id, {name: e.target.value.trim() || d.name, design: rec.design}); setState(await api('state')); } catch (err) { fail(err); } }}),
      h('span', {class: 'sp'}), screenPick(sc, s => { A.screen = s; viewPanel(); }),
      btn('Edit', 'pencil', () => openDesign(d.id), 'go'), btn('', 'chevron-down', ev => { ev.stopPropagation(); const r = ev.currentTarget.getBoundingClientRect(); panelMenu({preventDefault() {}, clientX: r.left, clientY: r.bottom + 4}, d); }, 'icon more')),
    h('div', {class: 'body panelview'},
      h('div', {class: 'side'}, h('h2', null, 'On these devices'), assign.children.length ? assign : h('p', {class: 'note'}, 'No approved devices yet.'),
        h('p', {class: 'note'}, 'This is the panel itself. Buttons here control the house.')),
      stage));
  $('.more').title = 'More'; $('.more').setAttribute('aria-label', 'More');
  const fitLive = () => { const k = Math.min((stage.clientWidth - 8) / sc.w, (stage.clientHeight - 8) / sc.h, 1); stage.replaceChildren(thumb(d.id, sc.w, sc.h, Math.max(200, Math.floor(sc.w * k)), true)); };
  requestAnimationFrame(fitLive);
}

// ---------- Themes: backgrounds and button designs ----------
const STARTER = () => { const b = uid(), g = uid(); return {id: uid(), name: 'My theme', background: b, button: g,
  backgrounds: [{id: b, name: 'Dusk', image: 'assets/dusk.svg', color: '#141a5c', dim: 0.04}],
  buttons: [{id: g, name: 'Glass', style: {fill: 'rgba(255,255,255,.15)', radius: 22, border: 'rgba(255,255,255,.4)', borderWidth: 1, rim: true, glass: true, depth: 1}}]}; };
const FONTS = [['', 'Tablet default'], ['"Avenir Next", "Segoe UI", sans-serif', 'Avenir'], ['"Helvetica Neue", Arial, sans-serif', 'Helvetica'], ['"SF Pro Rounded", "Arial Rounded MT Bold", sans-serif', 'Rounded'],
  ['Georgia, "Times New Roman", serif', 'Georgia'], ['"Gill Sans", "Trebuchet MS", sans-serif', 'Gill Sans'], ['Futura, "Century Gothic", sans-serif', 'Futura'], ['Menlo, Consolas, monospace', 'Menlo']];
const MOTION = [['none', 'Still'], ['drift', 'Slow drift'], ['breathe', 'Breathe'], ['pan', 'Pan across']];

function openTheme(id) {
  const t = themeBy(id) || themes()[0];
  A.th = t ? {id: t.id, draft: clone(t), dirty: false, sel: {}} : null;
}
async function saveTheme() {
  const th = A.th, list = themes().some(t => t.id === th.id) ? themes().map(t => t.id === th.id ? th.draft : t) : [...themes(), th.draft];
  try { A.state = await send('PUT', 'library', {themes: list}); th.dirty = false; toast('Saved. Panels following this theme update now.'); redraw(); }
  catch (e) { toast('Not saved: ' + e.message, true); }
}
async function uploadAsset(file) {
  const fd = new FormData(); fd.append('file', file);
  const before = new Set(A.state.assets); A.state = await api('assets', {method: 'POST', body: fd});
  return 'assets/' + (A.state.assets.find(a => !before.has(a)) || file.name.replace(/[^A-Za-z0-9._-]+/g, '-'));
}
/** A theme pack is one file: the theme plus every picture it uses, so it can go to another house. */
async function exportTheme(t) {
  const names = new Set();
  t.backgrounds.forEach(b => [b.image, b.video].forEach(p => p && names.add(p)));
  t.buttons.forEach(b => b.style && b.style.image && names.add(b.style.image));
  const assets = {};
  for (const p of names) {
    try { const blob = await (await fetch(p)).blob(); assets[p] = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); } catch (e) {}
  }
  saveFile(t.name + '.hptheme', JSON.stringify({format: 'hptheme', version: 1, theme: t, assets}));
}
const importTheme = () => pickFile('.hptheme,application/json', async f => {
  try {
    const pack = JSON.parse(await f.text());
    if (pack.format !== 'hptheme' || !pack.theme) throw new Error('not a theme pack');
    for (const p in pack.assets || {}) { const blob = await (await fetch(pack.assets[p])).blob(); await uploadAsset(new File([blob], p.replace(/^assets\//, ''), {type: blob.type})); }
    const t = Object.assign(pack.theme, {id: uid()});
    if (themes().some(x => x.name === t.name)) t.name += ' (imported)';
    A.state = await send('PUT', 'library', {themes: [...themes(), t]});
    openTheme(t.id); redraw(); toast('Theme "' + t.name + '" added.');
  } catch (e) { toast('That file is not a HomePanel theme pack: ' + e.message, true); }
});

/** Colour plus see-through amount, stored as rgba(). */
function colourIn(val, set, fallback, clear) {
  const c = rgba(val) || rgba(fallback) || {hex: '#ffffff', a: 0.15};
  const col = h('input', {type: 'color', value: c.hex, 'aria-label': 'Colour', oninput: () => set(toRgba(col.value, +al.value))});
  const al = h('input', {type: 'range', min: 0, max: 1, step: 0.01, value: c.a, 'aria-label': 'Opacity', title: 'How solid the colour is', oninput: () => set(toRgba(col.value, +al.value))});
  return [col, al, clear && val ? h('button', {type: 'button', class: 'btn icon mini', title: clear.title, 'aria-label': clear.title, html: icon('undo'), onclick: clear.fn}) : null];
}
/** Every slider shows its measurement: percent for 0-1 amounts, pixels for the rest. */
function sliderValues(box) {
  box.querySelectorAll('input[type=range]').forEach(r => {
    if (r.nextElementSibling && r.nextElementSibling.classList.contains('val')) return;
    const out = h('output', {class: 'val'}), show = () => { out.textContent = +r.max <= 1 ? Math.round(r.value * 100) + '%' : r.value + (r.dataset.unit == null ? ' px' : r.dataset.unit); };
    r.addEventListener('input', show); show(); r.after(out);
  });
}
/** Pictures to choose from: none, everything uploaded, and an upload button. */
function picture(val, set, accept) {
  const names = ['dusk.svg', ...A.state.assets.filter(a => a !== 'dusk.svg')].filter(a => accept === 'video' ? /\.(mp4|mov|m4v|webm)$/i.test(a) : !/\.(mp4|mov|m4v|webm)$/i.test(a));
  return h('div', {class: 'pics'},
    h('button', {type: 'button', 'aria-pressed': !val, onclick: () => set(null)}, 'None'),
    ...names.map(a => h('button', {type: 'button', title: a, 'aria-label': a, 'aria-pressed': val === 'assets/' + a, style: accept === 'video' ? '' : `background-image:url("assets/${encodeURIComponent(a)}")`, onclick: () => set('assets/' + a)}, accept === 'video' ? a : '')),
    h('button', {type: 'button', title: 'Upload', 'aria-label': 'Upload', html: icon('upload'), onclick: () => pickFile(accept === 'video' ? 'video/mp4,video/quicktime,.mp4,.mov,.m4v' : 'image/*', f => uploadAsset(f).then(set, e => toast('Upload failed: ' + e.message, true)))}));
}

/** The fields of one button design. Used by the Themes page and by the editor for a single button's own look. */
function lookFields(s, set, o) {
  o = o || {};
  const cl = k => o.clear && s[k] != null ? {title: "Use the design's value", fn: () => set(k, null, true)} : null;
  const num = (k, min, max, dflt, unit) => { const r = h('input', {type: 'range', min, max, step: max <= 1 ? 0.01 : 1, value: s[k] == null ? dflt : s[k], oninput: ev => set(k, +ev.target.value)}); if (unit != null) r.dataset.unit = unit; return r; };
  const fade = !!s.fillTo;
  return [
    row('Fill', h('select', {'aria-label': 'Fill kind', onchange: ev => { if (ev.target.value === 'fade') set('fillTo', s.fillTo || 'rgba(255,255,255,0)', true); else set('fillTo', null, true); }},
      h('option', {value: 'solid', selected: !fade}, 'One colour'), h('option', {value: 'fade', selected: fade}, 'Fade'))),
    row(fade ? 'From' : 'Colour', ...colourIn(s.fill, v => set('fill', v), o.base && o.base.fill || 'rgba(255,255,255,.15)', cl('fill'))),
    fade ? row('To', ...colourIn(s.fillTo, v => set('fillTo', v))) : null,
    fade ? row('Direction', h('select', {'aria-label': 'Fade direction', onchange: ev => set('fadeDir', ev.target.value === 'right' ? 'right' : null, true)}, h('option', {value: 'down', selected: s.fadeDir !== 'right'}, 'Top to bottom'), h('option', {value: 'right', selected: s.fadeDir === 'right'}, 'Left to right'))) : null,
    fade ? row('Fade length', num('fadeLen', 20, 600, 160)) : null,
    fade ? h('p', {class: 'note'}, 'The fade keeps this length on every button, tall or short, then holds its end colour.') : null,
    row('When on', ...colourIn(rgba(s.fillOn) ? s.fillOn : null, v => set('fillOn', v), 'rgba(255,170,80,.88)', s.fillOn ? {title: 'Back to the amber glow', fn: () => set('fillOn', null, true)} : null)),
    row('Text', h('input', {type: 'color', value: (rgba(s.text) || {hex: '#ffffff'}).hex, 'aria-label': 'Text colour', oninput: ev => set('text', ev.target.value)})),
    row('Font', h('select', {'aria-label': 'Font', onchange: ev => set('font', ev.target.value || null, true)}, ...FONTS.map(f => h('option', {value: f[0], selected: (s.font || '') === f[0]}, f[1])))),
    h('h2', null, 'Shape'),
    row('Corners', num('radius', 0, 60, o.base && o.base.radius != null ? o.base.radius : 22)),
    row('Border', ...colourIn(s.border, v => set('border', v), 'rgba(255,255,255,.4)', cl('border'))),
    row('Border width', num('borderWidth', 0, 8, 1)),
    o.clear ? null : row('Spacing', num('gap', 0, 16, 5)),
    h('h2', null, 'Depth'),
    row('Lit edge', h('input', {type: 'checkbox', checked: s.rim !== false, 'aria-label': 'Lit edge', onchange: ev => set('rim', ev.target.checked ? (o.clear ? true : null) : false, true)}), h('span', {class: 'note'}, 'Light on a curved edge')),
    row('Shadow', num('depth', 0, 2, 1, '')),
    row('Frosted', h('input', {type: 'checkbox', checked: s.glass !== false, 'aria-label': 'Frosted glass', onchange: ev => set('glass', ev.target.checked ? null : false, true)}), h('span', {class: 'note'}, 'Blur the background behind')),
    row('See-through', num('opacity', 0.1, 1, 1)),
    h('h2', null, 'Picture'), picture(s.image, v => set('image', v, true)),
  ];
}

/** What the theme pages show beside the form: the real tablet renderer, drawing sample buttons with the draft. */
function themeDemo() {
  const th = A.th, t = th.draft, btnName = (t.buttons.find(b => b.id === th.sel.buttons) || t.buttons[0] || {}).name;
  const tile = (x, y, w, hh, name, label, ic, on) => ({type: 'action', info: true, demoOn: on, x, y, w, h: hh, name, label, icon: ic, look: btnName});
  return {design: {format: 1, grid: {cols: 48, rows: 36}, start: 'p', themeId: t.id, bg: A.view === 'backgrounds' ? th.sel.backgrounds : null, theme: {},
    pages: [{id: 'p', tiles: [tile(3, 4, 13, 10, 'Lamp', 'Off', 'lightbulb'), tile(17, 4, 13, 10, 'Lamp', 'On', 'lightbulb', true), tile(31, 4, 14, 28, 'Tall', 'Same fade', 'star'),
      tile(3, 16, 27, 7, 'Wide', 'Scene', 'play'), tile(3, 25, 8, 7, 'Small', '', 'power'), tile(12, 25, 18, 7, 'Door', 'Closed', 'door')]}]},
    theme: Object.assign({}, t, A.view === 'buttons' && th.sel.buttons ? {button: th.sel.buttons} : {})};
}
function demoPush() { const f = $('.demo iframe'); if (f && A.th && f.dataset.ready) f.contentWindow.postMessage(Object.assign({type: 'hp-design', page: 'p'}, themeDemo()), '*'); }

function viewTheme() {
  const kind = A.view;  // 'backgrounds' or 'buttons'
  if (!A.th || !themeBy(A.th.id) && !A.th.dirty) openTheme(A.th && A.th.id);
  const head = extra => h('div', {class: 'head'}, h('h1', null, kind === 'buttons' ? 'Buttons' : 'Backgrounds'), ...extra);
  if (!A.th) {
    return $('#main').replaceChildren(head([h('span', {class: 'sp'}), btn('Import theme', 'upload', importTheme)]),
      h('div', {class: 'body'}, h('div', {class: 'empty'}, h('b', null, 'No themes yet'), 'A theme holds backgrounds and button designs. A panel that follows a theme changes with it.',
        h('p', {style: 'margin-top:16px'}, btn('Start a theme', 'plus', () => { const t = STARTER(); A.th = {id: t.id, draft: t, dirty: true, sel: {}}; saveTheme(); }, 'go')))));
  }
  const th = A.th, t = th.draft, list = t[kind], touch = () => { th.dirty = true; mark(); demoPush(); };
  if (!list.some(x => x.id === th.sel[kind])) th.sel[kind] = (list.find(x => x.id === (kind === 'buttons' ? t.button : t.background)) || list[0] || {}).id;
  const cur = list.find(x => x.id === th.sel[kind]);
  const mark = () => { const s = $('.saved'); if (s) { s.textContent = th.dirty ? 'Unsaved changes' : 'Saved'; s.className = 'saved' + (th.dirty ? ' dirty' : ''); } const b = $('[data-k=savetheme]'); if (b) b.disabled = !th.dirty; };
  const defKey = kind === 'buttons' ? 'button' : 'background';
  const add = async () => {
    if (kind === 'buttons') { const b = {id: uid(), name: 'Button ' + (list.length + 1), style: clone((cur || STARTER().buttons[0]).style)}; list.push(b); th.sel[kind] = b.id; }
    else { const b = {id: uid(), name: 'Background ' + (list.length + 1), color: '#141a5c', dim: 0}; list.push(b); th.sel[kind] = b.id; }
    th.dirty = true; viewTheme();
  };
  const itemMenu = (ev, x) => menu(ev, [
    ['Duplicate', () => { const c = clone(x); c.id = uid(); c.name += ' copy'; list.push(c); th.sel[kind] = c.id; th.dirty = true; viewTheme(); }],
    ['Use as the theme default', () => { t[defKey] = x.id; th.dirty = true; viewTheme(); }], null,
    ['Delete', () => { if (list.length < 2) return toast('A theme keeps at least one.', true); t[kind] = list.filter(y => y !== x); if (t[defKey] === x.id) t[defKey] = t[kind][0].id; th.dirty = true; viewTheme(); }, 'stop']]);
  const chips = h('div', {class: 'chips'}, ...list.map(x => h('button', {type: 'button', 'aria-pressed': x.id === th.sel[kind], oncontextmenu: ev => itemMenu(ev, x), onclick: () => { th.sel[kind] = x.id; viewTheme(); },
    style: kind === 'backgrounds' ? `background:${x.image ? `url("${x.image}") center/cover, ` : ''}${x.color || '#141a5c'}` : ''},
    h('span', null, x.name), t[defKey] === x.id ? h('small', null, 'Default') : null)), h('button', {type: 'button', class: 'add', title: 'Add', 'aria-label': 'Add', html: icon('plus'), onclick: add}));

  let form = [];
  if (cur && kind === 'buttons') {
    const set = (k, v, re) => { if (v == null || v === '') delete cur.style[k]; else cur.style[k] = v; touch(); if (re) viewTheme(); };
    form = [row('Name', h('input', {type: 'text', value: cur.name, 'aria-label': 'Button design name', oninput: ev => { cur.name = ev.target.value; touch(); }, onchange: () => viewTheme()})), ...lookFields(cur.style, set)];
  } else if (cur) {
    const set = (k, v, re) => { if (v == null || v === '') delete cur[k]; else cur[k] = v; touch(); if (re) viewTheme(); };
    form = [row('Name', h('input', {type: 'text', value: cur.name, 'aria-label': 'Background name', oninput: ev => { cur.name = ev.target.value; touch(); }, onchange: () => viewTheme()})),
      h('h2', null, 'Picture'), picture(cur.image, v => set('image', v, true)),
      h('p', {class: 'note'}, 'Animated GIF and WebP pictures play as they are.'),
      row('Colour', h('input', {type: 'color', value: (rgba(cur.color) || {hex: '#141a5c'}).hex, 'aria-label': 'Colour behind the picture', oninput: ev => set('color', ev.target.value)})),
      row('Darken', h('input', {type: 'range', min: 0, max: 0.8, step: 0.01, value: cur.dim || 0, oninput: ev => set('dim', +ev.target.value)})),
      row('Movement', h('select', {'aria-label': 'Movement', onchange: ev => set('motion', ev.target.value === 'none' ? null : ev.target.value)}, ...MOTION.map(m => h('option', {value: m[0], selected: (cur.motion || 'none') === m[0]}, m[1])))),
      h('h2', null, 'Video'), picture(cur.video, v => set('video', v, true), 'video'),
      h('p', {class: 'note'}, 'A short looping MP4 plays over the picture. Keep it small: the tablets are old.')];
  }
  const pickTheme = h('select', {'aria-label': 'Theme', class: 'themepick', onchange: ev => { if (unsaved()) { ev.target.value = th.id; return; } openTheme(ev.target.value); viewTheme(); }},
    ...(themes().some(x => x.id === th.id) ? themes() : [...themes(), t]).map(x => h('option', {value: x.id, selected: x.id === th.id}, x.name)));
  const themeMenu = ev => { const r = ev.currentTarget.getBoundingClientRect(); menu({preventDefault() {}, clientX: r.left, clientY: r.bottom + 4}, [
    ['Rename', () => { const n = prompt('Theme name', t.name); if (n && n.trim()) { t.name = n.trim(); th.dirty = true; viewTheme(); } }],
    ['New theme', () => { if (unsaved()) return; const n = STARTER(); n.name = 'Theme ' + (themes().length + 1); A.th = {id: n.id, draft: n, dirty: true, sel: {}}; viewTheme(); }],
    ['Duplicate', () => { if (unsaved()) return; const n = clone(t); n.id = uid(); n.name += ' copy'; A.th = {id: n.id, draft: n, dirty: true, sel: {}}; viewTheme(); }], null,
    ['Export as a theme pack', () => exportTheme(t)], ['Import a theme pack', importTheme], null,
    ['Delete theme', async () => { if (!confirm('Delete the theme "' + t.name + '"? Panels following it keep their last look.')) return; try { A.state = await send('PUT', 'library', {themes: themes().filter(x => x.id !== th.id)}); A.th = null; redraw(); } catch (e) { fail(e); } }, 'stop']]); };
  const more = btn('Theme', 'chevron-down', ev => { ev.stopPropagation(); themeMenu(ev); });
  const savebtn = btn('Save', null, saveTheme, 'go'); savebtn.dataset.k = 'savetheme';

  const top = head([pickTheme, more, h('span', {class: 'sp'}), h('span', {class: 'saved'}), savebtn]);
  if ($('.themeview .demo iframe')) {
    // Keep the preview frame where it is: taking an iframe out of the page and putting it back reloads it.
    $('.head').replaceWith(top); $('.chips').replaceWith(chips); $('.insp').replaceChildren(...form.filter(Boolean));
  } else $('#main').replaceChildren(top,
    h('div', {class: 'body themeview'}, h('div', {class: 'col'}, chips, h('div', {class: 'demo'}, thumb('', 1024, 768, 560))), h('aside', {class: 'insp wide', 'aria-label': 'Properties'}, ...form)));
  sliderValues($('.insp')); mark(); demoPush();
}

// ---------- Settings: backup, and the direct LLM for assistant buttons ----------
async function viewSettings() {
  const llm = (await api('settings').catch(() => ({llm: {}}))).llm || {};
  if (A.view !== 'settings') return;
  const f = {url: h('input', {type: 'text', value: llm.url || '', placeholder: 'http://192.168.1.10:8080/v1', 'aria-label': 'LLM address'}),
    model: h('input', {type: 'text', value: llm.model || '', placeholder: 'Model name', 'aria-label': 'Model'}),
    key: h('input', {type: 'password', value: '', placeholder: llm.key ? 'A key is stored. Type to replace it.' : 'Only if the server asks for one', 'aria-label': 'API key', autocomplete: 'off'}),
    system: h('textarea', {rows: 3, placeholder: 'How the assistant should behave', 'aria-label': 'Instructions'}, llm.system || '')};
  const saveLlm = () => { const body = {url: f.url.value.trim(), model: f.model.value.trim(), system: f.system.value.trim()}; if (f.key.value) body.key = f.key.value; send('PUT', 'settings', {llm: body}).then(() => { toast('Saved.'); viewSettings(); }, fail); };
  const restore = () => pickFile('.hpbackup,application/json', async file => {
    if (!confirm('Restore from "' + file.name + '"? Panels, themes and devices in the file replace the ones here with the same identity.')) return;
    try { const r = await send('POST', 'restore', JSON.parse(await file.text())); A.state = r.state; const d = r.restored;
      toast(`Restored ${d.panels} panels, ${d.devices} devices, ${d.pictures} pictures` + (d.skipped ? `. ${d.skipped} damaged items skipped.` : '.')); redraw(); }
    catch (e) { toast('Not restored: ' + e.message, true); }
  });
  $('#main').replaceChildren(h('div', {class: 'head'}, h('h1', null, 'Settings')),
    h('div', {class: 'body narrow'},
      h('div', {class: 'card pad'}, h('h2', null, 'Backup'),
        h('p', {class: 'note'}, 'One file with every panel, theme, picture and device. Restoring never checks entities: a button whose entity is gone comes back and shows "Not found".'),
        h('div', {class: 'acts'}, h('a', {class: 'btn go', href: 'admin/api/backup', download: 'homepanel-' + new Date().toISOString().slice(0, 10) + '.hpbackup', html: icon('download') + '<span>Download backup</span>'}), btn('Restore from a file', 'upload', restore))),
      h('div', {class: 'card pad'}, h('h2', null, 'Assistant: direct LLM'),
        h('p', {class: 'note'}, 'Used by assistant buttons set to "Direct LLM". Any server that speaks the OpenAI chat format. Assistant buttons set to "Home Assistant" need nothing here.'),
        row('Address', f.url), row('Model', f.model), row('API key', f.key), row('Instructions', f.system),
        h('div', {class: 'acts'}, btn('Save', null, saveLlm, 'go')))));
}

// ---------- house data for the pickers ----------
function loadHouse() {
  if (A.ents.length || loadHouse.busy) return;
  loadHouse.busy = true;
  api('entities').then(r => { A.ents = r.entities; A.devs = r.devices || []; A.areas = r.areas; if (A.view === 'editor') inspector(); }, fail).then(() => { loadHouse.busy = false; });
}

// ---------- start ----------
window.addEventListener('message', ev => {
  if (!ev.data || ev.data.type !== 'hp-ready') return;
  const f = [...document.querySelectorAll('iframe')].find(x => x.contentWindow === ev.source);
  if (!f) return;
  f.dataset.ready = '1';
  if (f.closest('.demo')) demoPush();
  else if (A.ed && f.closest('.stage')) { A.ed.ready = true; push(); }
});
window.addEventListener('beforeunload', ev => { if ((A.ed && A.ed.dirty) || (A.th && A.th.dirty)) { ev.preventDefault(); ev.returnValue = ''; } });
haTheme();
(function start() {
  api('state').then(s => {
    A.state = s;
    // #editor=<id>,page=<id>,tile=<number> so a link or a refresh lands on the same spot
    const q = new URLSearchParams(location.hash.slice(1).replace(/,/g, '&')), has = id => s.designs.some(d => d.id === id);
    if (has(q.get('editor'))) { rail(); openDesign(q.get('editor'), {page: q.get('page'), tile: q.has('tile') ? q.get('tile') - 1 : -1}); }
    else if (has(q.get('panel'))) { A.view = 'panel'; A.panel = q.get('panel'); redraw(); }
    else { const v = Object.keys(VIEWS).find(k => q.has(k) && k !== 'panel'); A.view = v || 'gallery'; redraw(); }
  }, err => {  // nothing loaded: say so on the page, with a way to try again, instead of a blank screen
    $('#main').replaceChildren(h('div', {class: 'body'}, h('div', {class: 'empty'}, h('b', null, 'HomePanel Studio did not answer'),
      'The add-on may still be starting. ' + err.message, h('p', {style: 'margin-top:16px'}, btn('Try again', null, start, 'go')))));
  });
})();
(function live() {  // devices that say hello appear without a refresh
  const ws = new WebSocket(new URL('admin/api/live', location.href).href.replace(/^http/, 'ws'));
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.type !== 'state') return; A.state = m.state; rail(); if (['gallery', 'devices'].includes(A.view)) VIEWS[A.view](); };
  ws.onclose = () => setTimeout(live, 4000);
})();
