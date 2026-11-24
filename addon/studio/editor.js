'use strict';
// The grid editor. The sheet is the real tablet renderer in an iframe (live house state), with a transparent
// layer on top for selecting, dragging and right-clicking. Uses the helpers in studio.js.

// ---------- what each kind of button is, and which fields it has ----------
const ORBS = [['ribbons', 'Glass ball with ribbons'], ['ring', 'Ring of light'], ['veil', 'Veil']];
const TYPES = {
  button: {label: 'Button', icon: 'gesture-tap', w: 14, h: 10, fields: []},
  entity: {label: 'Light or switch', icon: 'lightbulb', w: 10, h: 8, fields: [['entity', 'Entity', 'entity'], ['name', 'Name', 'text'], ['icon', 'Icon', 'icon'], ['confirm', 'Ask first', 'text', 'Question to confirm, or leave empty']]},
  action: {label: 'Scene or script', icon: 'star', w: 12, h: 6, fields: [['entity', 'Run', 'entity', ['scene', 'script', 'button']], ['name', 'Name', 'text'], ['label', 'Small text', 'text'], ['icon', 'Icon', 'icon'], ['confirm', 'Ask first', 'text', 'Question to confirm, or leave empty']]},
  room: {label: 'Room', icon: 'home', w: 12, h: 8, fields: [['area', 'Room', 'area'], ['name', 'Name', 'text', 'Room name'], ['icon', 'Icon', 'icon']]},
  camera: {label: 'Camera', icon: 'video', w: 18, h: 12, fields: [['entity', 'Camera', 'entity', ['camera']], ['name', 'Name', 'text'], ['video', 'Live video', 'bool'], ['page', 'Tap opens', 'page']]},
  media: {label: 'Media player', icon: 'play', w: 24, h: 8, fields: [['entity', 'Player', 'entity', ['media_player']], ['name', 'Name', 'text']]},
  assistant: {label: 'Assistant', icon: 'microphone', w: 12, h: 8, fields: [['name', 'Name', 'text', 'Assistant'], ['label', 'Small text', 'text', 'Tap to talk'],
    ['mode', 'Answers from', 'select', () => [['', 'Home Assistant'], ['llm', 'Direct LLM']]],
    ['pipeline', 'Voice assistant', 'select', () => [['', 'The preferred one'], ...A.pipelines.map(p => [p.id, p.name])]],
    ['speaker', 'Speaks on', 'select', () => [['', 'This device'], ...A.ents.filter(n => n.id.startsWith('media_player.')).map(n => [n.id, n.name])]],
    ['orb', 'Animation', 'select', () => ORBS]]},
  weather: {label: 'Weather', icon: 'weather-sunny', w: 14, h: 6, fields: [['entity', 'Source', 'entity', ['weather']]]},
  clock: {label: 'Clock', icon: 'clock', w: 24, h: 13, flat: true, fields: []},
  people: {label: 'Who is home', icon: 'account-multiple', w: 18, h: 6, fields: [['entities', 'People', 'entities', ['person']]]},
  alerts: {label: 'Alerts', icon: 'alert', w: 18, h: 6, fields: [], note: 'Shows only while something is wrong. Its list of things to watch is not editable here yet.'},
  nav: {label: 'Dashboard link', icon: 'chevron-right', w: 10, h: 5, fields: [['page', 'Opens', 'page'], ['name', 'Name', 'text'], ['icon', 'Icon', 'icon']]},
  label: {label: 'Text', icon: 'text', w: 20, h: 5, flat: true, fields: [['text', 'Text', 'text'], ['size', 'Size', 'range', [0.2, 1, 0.02]]]},
  image: {label: 'Picture', icon: 'image', w: 12, h: 8, fields: []},
};
A.pipelines = [];

async function openDesign(id, at) {
  if (!(A.ed && A.ed.id === id) && unsaved()) return;
  try {
    const rec = await api('designs/' + id);
    loadHouse();
    if (!A.pipelines.length) api('pipelines').then(r => { A.pipelines = r.pipelines || []; }, () => {});
    const t = A.state.tablets.find(x => x.design === id && x.width) || A.state.tablets.find(x => x.width);
    A.th = null;
    A.ed = {id, name: rec.name, design: rec.design, page: rec.design.start || rec.design.pages[0].id, sel: -1, dirty: false, hist: [], redo: [],
      screen: t ? {w: t.width, h: t.height} : {w: 1024, h: 768}, tab: 'tile', use: false, open: false, openDev: null};
    if (at && A.ed.design.pages.some(p => p.id === at.page)) A.ed.page = at.page;
    if (at && at.tile >= 0 && at.tile < page().tiles.length) A.ed.sel = at.tile;
    A.view = 'editor'; rail(); viewEditor(); history.replaceState(null, '', '#editor=' + id);  // a refresh comes back to the same panel
  } catch (e) { fail(e); }
}

const ed = () => A.ed;
const page = () => ed().design.pages.find(p => p.id === ed().page) || ed().design.pages[0];
const tile = () => page().tiles[ed().sel];
const edTheme = () => themeBy(ed().design.themeId);

function mark() { const e = ed(); e.hist.push(JSON.stringify(e.design)); if (e.hist.length > 80) e.hist.shift(); e.redo = []; }
/** Every change goes through here: remember the state before a run of edits, apply, redraw, tell the sheet. */
function change(fn, opts) {
  const e = ed(), o = opts || {};
  if (!e.open) { mark(); e.open = !!o.live; }
  fn(); e.dirty = true; saveLabel();
  if (!o.keepBoxes) boxes();
  if (o.inspect) inspector();
  push();
}
const settle = () => { if (ed()) ed().open = false; };
function push() {
  if (push.q) return;
  push.q = requestAnimationFrame(() => { push.q = 0; const f = $('.stage iframe'); if (f && ed() && ed().ready) f.contentWindow.postMessage({type: 'hp-design', design: ed().design, page: ed().page, theme: edTheme()}, '*'); });
}
function travel(from, to) {
  const e = ed(); if (!from.length) return;
  to.push(JSON.stringify(e.design)); e.design = JSON.parse(from.pop());
  if (!e.design.pages.some(p => p.id === e.page)) e.page = e.design.pages[0].id;
  e.sel = Math.min(e.sel, page().tiles.length - 1); e.dirty = true; e.open = false;
  viewEditor(true); fit();  // fit: an undone grid change alters cell size
}
async function save() {
  const e = ed();
  try { await send('PUT', 'designs/' + e.id, {name: e.name, design: e.design}); e.dirty = false; saveLabel(); toast('Saved. Devices using it update now.'); api('state').then(s => { A.state = s; rail(); }); }
  catch (err) { toast('Not saved: ' + err.message, true); }
}
/** Toolbar state: the saved/unsaved note, and buttons that have nothing to do right now are disabled. */
function saveLabel() {
  const e = ed(), s = $('.bar .saved'); if (!s) return;
  s.textContent = e.dirty ? 'Unsaved changes' : 'Saved'; s.className = 'saved' + (e.dirty ? ' dirty' : '');
  const set = (k, off) => { const b = $('.bar [data-k=' + k + ']'); if (b) b.disabled = off; };
  set('undo', !e.hist.length); set('redo', !e.redo.length); set('save', !e.dirty);
}

function viewEditor(keepFrame) {
  const e = ed(), d = e.design;
  const tabs = h('div', {class: 'tabs', role: 'tablist', 'aria-label': 'Dashboards'}, ...d.pages.map(p => h('button', {type: 'button', role: 'tab', 'aria-selected': p.id === e.page,
    onclick: () => { e.page = p.id; e.sel = -1; viewEditor(true); push(); }}, p.name || p.id)));
  const addPage = btn('', 'plus', () => { const id = 'page' + (d.pages.length + 1); change(() => d.pages.push({id, name: 'Dashboard ' + (d.pages.length + 1), tiles: []})); e.page = id; e.sel = -1; e.tab = 'page'; viewEditor(true); }, 'icon');
  const undo = btn('', 'undo', () => travel(e.hist, e.redo), 'icon'), redo = btn('', 'redo', () => travel(e.redo, e.hist), 'icon'), saveB = btn('Save', null, save, 'go');
  [[addPage, 'Add a dashboard'], [undo, 'Undo (Ctrl+Z)', 'undo'], [redo, 'Redo (Ctrl+Y)', 'redo']].forEach(([b, title, k]) => { b.title = title; b.setAttribute('aria-label', title); if (k) b.dataset.k = k; });
  saveB.dataset.k = 'save';
  const bar = h('div', {class: 'bar'},
    h('input', {type: 'text', class: 'name', value: e.name, 'aria-label': 'Panel name', oninput: ev => { e.name = ev.target.value; e.dirty = true; saveLabel(); }}),
    h('span', {class: 'sep'}), tabs, addPage, h('span', {class: 'sep'}),
    screenPick(e.screen, s => { e.screen = s; viewEditor(); }),
    btn(e.use ? 'Back to editing' : 'Preview', null, () => { e.use = !e.use; viewEditor(true); if (e.use) toast('Buttons on the sheet now control the house.'); }, e.use ? 'on' : ''),
    h('span', {class: 'sep'}), undo, redo, h('span', {class: 'saved'}), saveB);

  const th = edTheme();
  const palette = h('div', {class: 'palette'},
    ...(th ? [h('h2', null, 'Designs'), ...th.buttons.map(b => h('button', {type: 'button', title: 'Add a button with the design "' + b.name + '"', onclick: () => addTile('button', null, b.name), html: icon('gesture-tap') + `<span>${esc(b.name)}</span>`}))] : []),
    h('h2', null, 'Add'),
    ...Object.keys(TYPES).map(k => h('button', {type: 'button', title: 'Add: ' + TYPES[k].label, onclick: () => addTile(k), html: icon(TYPES[k].icon) + `<span>${esc(TYPES[k].label)}</span>`})));

  if (keepFrame && $('.ed')) {
    // Same panel, same sheet: swap the toolbar and redraw the edit layer only. Re-inserting the preview
    // frame would make the browser reload it and reconnect to the house on every dashboard switch or undo.
    const held = document.activeElement && document.activeElement.dataset.k;  // keep keyboard focus on Undo/Redo across the swap
    $('.bar').replaceWith(bar); $('.palette').replaceWith(palette); $('.stage').classList.toggle('use', e.use);
    if (held && !$('.bar [data-k=' + held + ']').disabled) $('.bar [data-k=' + held + ']').focus();
    saveLabel(); boxes(); inspector(); push();
    return;
  }
  e.ready = false;
  const frame = h('iframe', {title: 'Dashboard preview', src: 'renderer/index.html?preview=1&key=studio-preview&design=' + encodeURIComponent(e.id)});
  const over = h('div', {class: 'over grid'});
  const stage = h('div', {class: 'stage' + (e.use ? ' use' : '')}, h('div', {class: 'frame'}, frame), over);
  const sheet = h('div', {class: 'sheet'}, h('div', {class: 'ruler top'}), h('div', {class: 'ruler left'}), stage);
  over.addEventListener('pointerdown', ev => { if (ev.target === over && ev.button === 0) { e.sel = -1; boxes(); inspector(); } });
  over.addEventListener('contextmenu', ev => { if (ev.target === over) sheetMenu(ev); });
  $('#main').replaceChildren(bar, h('div', {class: 'ed'}, palette, h('div', {class: 'sheetwrap'}, sheet), h('aside', {class: 'insp', 'aria-label': 'Properties'})));
  saveLabel(); fit(); inspector();
}

/** Scale the sheet to the space available and draw the cell rulers. */
function fit() {
  const e = ed(), wrap = $('.sheetwrap'); if (!wrap) return;
  const {w, h: hh} = e.screen, g = e.design.grid;
  const s = e.s = Math.min((wrap.clientWidth - 62) / w, (wrap.clientHeight - 70) / hh, 1);
  const sheet = $('.sheet'), stage = $('.stage'), frame = stage.querySelector('iframe');
  sheet.style.width = w * s + 24 + 'px'; sheet.style.height = hh * s + 46 + 'px';
  stage.style.width = w * s + 'px'; stage.style.height = hh * s + 'px';
  frame.width = w; frame.height = hh; frame.style.transform = `scale(${s})`;
  e.cw = w * s / g.cols; e.ch = hh * s / g.rows;
  $('.over').style.backgroundSize = `${e.cw}px ${e.ch}px`;
  const top = $('.ruler.top'), left = $('.ruler.left');
  top.style.width = w * s + 'px'; left.style.height = hh * s + 'px';
  top.replaceChildren(...Array.from({length: Math.ceil(g.cols / 8)}, (_, i) => h('i', {style: `left:${i * 8 * e.cw}px`}, String(i * 8))));
  left.replaceChildren(...Array.from({length: Math.ceil(g.rows / 8)}, (_, i) => h('i', {style: `top:${i * 8 * e.ch}px`}, String(i * 8))));
  boxes();
}
window.addEventListener('resize', () => { if (A.view === 'editor') fit(); });

// ---------- the edit layer ----------
/** Where a multi-item button keeps its items, in sheet pixels relative to the button. Mirrors the renderer's sizes. */
function innerArea(t) {
  const e = ed(), g = e.design.grid, th = edTheme(), look = (th && (th.buttons.find(b => b.id === th.button) || th.buttons[0] || {}).style) || (e.design.theme || {}).tile || {};
  const gap = look.gap == null ? 5 : look.gap, W = t.w * e.screen.w / g.cols - 2 * gap, H = t.h * e.screen.h / g.rows - 2 * gap;
  const u = Math.max(11, Math.min(H * 0.2, W * 0.11, 64)), pad = u * 0.35, top = t.name ? H * 0.22 + u * 0.2 : pad;
  return {x: (gap + pad) * e.s, y: (gap + top) * e.s, w: (W - 2 * pad) * e.s, h: (H - top - pad) * e.s};
}
/** The arrangement the renderer would choose by itself for n items on this button. */
function autoGrid(t, n) {
  const a = innerArea(t); let cols = 1, rows = 1, best = Infinity;
  for (let c = 1; c <= Math.max(1, n); c++) { const r = Math.ceil(n / c), miss = Math.abs(Math.log((a.w / c) / (a.h / r) / 1.5)); if (miss < best) { best = miss; cols = c; rows = r; } }
  return {cols, rows};
}

/** One box per button over the preview; the selected one shows its measurements and handles. */
function boxes() {
  const e = ed(), over = $('.over'); if (!over) return;
  const hadFocus = over.contains(document.activeElement);  // redrawing replaces the focused box: give focus back after
  over.replaceChildren(...page().tiles.map((t, i) => {
    const b = h('div', {class: 'box' + (i === e.sel ? ' sel' : ''), tabIndex: 0, role: 'button', 'aria-label': `Button ${i + 1}, ${(TYPES[t.type] || {}).label || t.type}`, 'aria-pressed': i === e.sel, style: `left:${t.x * e.cw}px;top:${t.y * e.ch}px;width:${t.w * e.cw}px;height:${t.h * e.ch}px`, title: (TYPES[t.type] || {}).label || t.type},
      h('span', {class: 'tag'}, String(i + 1)), h('span', {class: 'dim' + (t.y + t.h > e.design.grid.rows - 3 ? ' up' : '')}, `${t.w} × ${t.h} at ${t.x}, ${t.y}`),
      ...['nw', 'ne', 'sw', 'se'].map(c => h('span', {class: 'hd ' + c, 'data-c': c})));
    b.addEventListener('pointerdown', ev => { if (ev.button === 0 && !ev.target.closest('.ibox')) drag(ev, i, b); });
    b.addEventListener('contextmenu', ev => { if (ev.target.closest('.ibox')) return; select(i); tileMenu(ev, i); });
    b.addEventListener('focus', () => { if (e.sel !== i) { e.sel = i; e.tab = 'tile'; boxes(); inspector(); $('.over').children[i].focus(); } });
    // A button arranged by hand shows its own grid and its items, each of which drags and resizes on that grid.
    if (i === e.sel && t.type === 'button' && t.auto === false && t.grid) {
      const a = innerArea(t), cw = a.w / t.grid.cols, ch = a.h / t.grid.rows;
      const inner = h('div', {class: 'inner', style: `left:${a.x}px;top:${a.y}px;width:${a.w}px;height:${a.h}px;background-size:${cw}px ${ch}px`});
      (t.items || []).forEach((it, k) => {
        const ib = h('div', {class: 'ibox', title: itemName(it), style: `left:${it.x * cw}px;top:${it.y * ch}px;width:${it.w * cw}px;height:${it.h * ch}px`}, h('span', {class: 'hd se', 'data-c': 'se'}));
        ib.addEventListener('pointerdown', ev => { if (ev.button !== 0) return; ev.stopPropagation(); dragRect(ev, ib, it, {cols: t.grid.cols, rows: t.grid.rows, min: 1}, cw, ch, r => change(() => Object.assign(it, r), {live: true, keepBoxes: true})); });
        ib.addEventListener('contextmenu', ev => { ev.stopPropagation(); itemMenu(ev, t, k); });
        inner.append(ib);
      });
      b.append(inner);
    }
    return b;
  }));
  if (hadFocus && over.children[e.sel]) over.children[e.sel].focus();
}
function select(i) { const e = ed(); if (e.sel === i) return; e.sel = i; e.tab = 'tile'; boxes(); inspector(); }

/** Drag or resize a rectangle on a grid of cw × ch pixel cells, snapping to whole cells. */
function dragRect(ev, el, o0, lim, cw, ch, apply, onMove) {
  const corner = ev.target.dataset.c, o = {x: o0.x, y: o0.y, w: o0.w, h: o0.h}, min = lim.min;
  let last = o, moved = false;
  ev.preventDefault(); el.setPointerCapture(ev.pointerId);
  const move = m => {
    const dx = Math.round((m.clientX - ev.clientX) / cw), dy = Math.round((m.clientY - ev.clientY) / ch);
    let {x, y, w, h: hh} = o;
    if (!corner) { x = Math.max(0, Math.min(lim.cols - w, o.x + dx)); y = Math.max(0, Math.min(lim.rows - hh, o.y + dy)); }
    else {
      if (corner.includes('e')) w = Math.max(min, Math.min(lim.cols - o.x, o.w + dx));
      if (corner.includes('s')) hh = Math.max(min, Math.min(lim.rows - o.y, o.h + dy));
      if (corner.includes('w')) { x = Math.max(0, Math.min(o.x + o.w - min, o.x + dx)); w = o.x + o.w - x; }
      if (corner.includes('n')) { y = Math.max(0, Math.min(o.y + o.h - min, o.y + dy)); hh = o.y + o.h - y; }
    }
    if (x === last.x && y === last.y && w === last.w && hh === last.h) return;
    last = {x, y, w, h: hh}; moved = true;
    apply(last);
    Object.assign(el.style, {left: x * cw + 'px', top: y * ch + 'px', width: w * cw + 'px', height: hh * ch + 'px'});
    if (onMove) onMove(last);
  };
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); settle(); if (moved) { boxes(); inspector(); } };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
}
function drag(ev, i, b) {
  const e = ed(), t = page().tiles[i], g = e.design.grid;
  if (e.sel !== i) { e.sel = i; e.tab = 'tile'; boxes(); inspector(); b = $('.over').children[i]; }
  dragRect(ev, b, t, {cols: g.cols, rows: g.rows, min: 2}, e.cw, e.ch, r => change(() => Object.assign(t, r), {live: true, keepBoxes: true}), r => {
    b.querySelector('.dim').classList.toggle('up', r.y + r.h > g.rows - 3);  // no room below the last rows: show it above
    b.querySelector('.dim').textContent = `${r.w} × ${r.h} at ${r.x}, ${r.y}`;
  });
}

function addTile(type, at, look) {
  const e = ed(), def = TYPES[type], g = e.design.grid, ts = page().tiles;
  const free = (x, y) => !ts.some(t => x < t.x + t.w && x + def.w > t.x && y < t.y + t.h && y + def.h > t.y);
  let pos = {x: 2, y: 2};
  if (at) pos = {x: Math.max(0, Math.min(g.cols - def.w, at.x)), y: Math.max(0, Math.min(g.rows - def.h, at.y))};
  else search: for (let y = 2; y + def.h <= g.rows - 1; y++) for (let x = 2; x + def.w <= g.cols - 1; x++) if (free(x, y)) { pos = {x, y}; break search; }
  const t = Object.assign({type, w: def.w, h: def.h}, pos, def.flat ? {flat: true} : {}, look ? {look} : {});
  if (type === 'label') t.text = 'Text';
  if (type === 'button') t.items = [];
  change(() => ts.push(t)); e.sel = ts.length - 1; e.tab = 'tile'; boxes(); inspector();
}
function removeTile() { const e = ed(); if (e.sel < 0) return; change(() => page().tiles.splice(e.sel, 1)); e.sel = -1; boxes(); inspector(); }
function duplicateTile() {
  const e = ed(), t = tile(), g = e.design.grid; if (!t) return;
  const c = clone(t); c.x = Math.min(g.cols - c.w, c.x + 1); c.y = Math.min(g.rows - c.h, c.y + 1);
  change(() => page().tiles.push(c)); e.sel = page().tiles.length - 1; boxes(); inspector();
}
/** Buttons drawn later sit on top: order in the list is the stacking order. */
function restack(i, front) { const e = ed(), ts = page().tiles; change(() => { const [t] = ts.splice(i, 1); front ? ts.push(t) : ts.unshift(t); }); e.sel = front ? ts.length - 1 : 0; boxes(); inspector(); }

// ---------- right-click menus ----------
function tileMenu(ev, i) {
  const e = ed(), t = page().tiles[i], th = edTheme();
  const setLook = name => { change(() => { if (name) t.look = name; else delete t.look; }, {inspect: true}); settle(); };
  menu(ev, [
    ['Edit', () => { e.tab = 'tile'; inspector(); const f = $('.insp input, .insp select'); if (f) f.focus(); }],
    th ? ['Design', [[(t.look ? '' : '✓ ') + 'Theme default', () => setLook(null)], ...th.buttons.map(b => [(t.look === b.name ? '✓ ' : '') + b.name, () => setLook(b.name)])]] : null,
    t.type === 'button' ? [(t.auto === false ? '' : '✓ ') + 'Arrange automatically', () => setAuto(t, t.auto === false)] : null,
    ['Duplicate', duplicateTile], ['Bring to front', () => restack(i, true)], ['Send to back', () => restack(i, false)],
    null, ['Delete', removeTile, 'stop']].filter((x, k, a) => x !== null || (k > 0 && a[k - 1] !== null)));
}
function itemMenu(ev, t, k) {
  const it = t.items[k];
  menu(ev, [['Rename', () => { const n = prompt('Name shown on the button', it.label || itemName(it)); if (n != null) { change(() => { if (n.trim()) it.label = n.trim(); else delete it.label; }, {inspect: true}); settle(); } }],
    null, ['Remove from this button', () => { change(() => t.items.splice(k, 1), {inspect: true}); settle(); }, 'stop']]);
}
function sheetMenu(ev) {
  const e = ed(), r = $('.over').getBoundingClientRect(), at = {x: Math.floor((ev.clientX - r.left) / e.cw), y: Math.floor((ev.clientY - r.top) / e.ch)}, th = edTheme();
  menu(ev, [
    ['Add here', [...(th ? th.buttons.map(b => ['Button: ' + b.name, () => addTile('button', at, b.name)]) : []), ...Object.keys(TYPES).map(k => [TYPES[k].label, () => addTile(k, at)])]],
    null, ['Dashboard settings', () => { e.tab = 'page'; inspector(); }], ['Look and theme', () => { e.tab = 'look'; inspector(); }],
    ['Add a dashboard', () => $('.bar .btn.icon').click()]]);
}

// ---------- inspector ----------
function inspector() {
  const e = ed(), box = $('.insp'); if (!box || !e) return;
  const tab = (id, label) => h('button', {type: 'button', role: 'tab', 'aria-selected': e.tab === id, onclick: () => { e.tab = id; inspector(); }}, label);
  const keep = box.scrollTop;
  box.replaceChildren(h('div', {class: 'tabs', role: 'tablist', 'aria-label': 'Properties'}, tab('tile', 'Button'), tab('look', 'Look'), tab('page', 'Dashboard')),
    ...(e.tab === 'look' ? panelLook() : e.tab === 'page' ? pageFields() : tileFields()).filter(Boolean));
  sliderValues(box); box.scrollTop = keep;
}
const textIn = (val, set, ph) => h('input', {type: 'text', value: val == null ? '' : val, placeholder: ph || '', oninput: ev => set(ev.target.value), onchange: settle});
const entName = id => { const x = A.ents.find(n => n.id === id); return x ? x.name : id || ''; };
const itemName = it => it.label || entName(it.entity);

/** Type to search, arrow keys and Enter to choose. list() gives [{id, name, sub}]. */
function searchPick(shown, list, onPick, ph, label) {
  const input = h('input', {type: 'text', value: shown || '', placeholder: ph, 'aria-label': label, autocomplete: 'off'});
  const out = h('div', {class: 'list', hidden: true});
  const fill = () => {
    const q = input.value.trim().toLowerCase(), all = list();
    const hits = all.filter(n => !q || n.name.toLowerCase().includes(q) || (n.sub || '').toLowerCase().includes(q)).slice(0, 40);
    out.replaceChildren(...(hits.length ? hits.map(n => h('button', {type: 'button', onmousedown: ev => { ev.preventDefault(); onPick(n.id); }}, n.name, h('small', null, n.sub || '')))
      : [h('div', {class: 'note', style: 'padding:8px 9px'}, A.ents.length ? 'Nothing matches.' : 'Loading the list from Home Assistant.')]));
    out.hidden = false;
  };
  input.addEventListener('focus', () => { input.select(); fill(); }); input.addEventListener('input', fill);
  input.addEventListener('keydown', ev => {
    const items = [...out.querySelectorAll('button')], at = items.findIndex(b => b.classList.contains('hi'));
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault(); if (!items.length) return;
      const next = (at + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((b, i) => b.classList.toggle('hi', i === next)); items[next].scrollIntoView({block: 'nearest'});
    } else if (ev.key === 'Enter' && items.length) { ev.preventDefault(); (items[at] || items[0]).dispatchEvent(new MouseEvent('mousedown', {cancelable: true})); }
    else if (ev.key === 'Escape') input.blur();
  });
  input.addEventListener('blur', () => { out.hidden = true; input.value = shown || ''; });
  return h('div', {class: 'pick'}, input, out);
}
const entityPick = (val, set, domains, many) => searchPick(many ? '' : entName(val),
  () => A.ents.filter(n => !domains || domains.includes(n.id.split('.')[0])).map(n => ({id: n.id, name: n.name, sub: n.id})),
  id => { set(id); settle(); inspector(); }, many ? 'Add' : 'Search by name', 'Entity');

function setAuto(t, on) {
  change(() => {
    if (on) { delete t.auto; return; }
    // Start hand placement from what the automatic arrangement shows, on a grid twice as fine.
    const n = (t.items || []).length, g = autoGrid(t, n);
    t.grid = {cols: g.cols * 2, rows: g.rows * 2}; t.auto = false;
    (t.items || []).forEach((it, k) => Object.assign(it, {x: (k % g.cols) * 2, y: Math.floor(k / g.cols) * 2, w: 2, h: 2}));
  }, {inspect: true}); settle();
}
function addItem(t, entity) {
  if ((t.items || []).some(it => it.entity === entity)) return;
  const it = {entity};
  if (t.auto === false && t.grid) {  // placed by hand: put the newcomer in the first free cell
    const g = t.grid, hit = (x, y) => t.items.some(o => x < o.x + o.w && x + 1 > o.x && y < o.y + o.h && y + 1 > o.y);
    let pos = {x: 0, y: 0};
    search: for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (!hit(x, y)) { pos = {x, y}; break search; }
    Object.assign(it, pos, {w: 1, h: 1});
  }
  t.items = [...(t.items || []), it];
}
/** A button that holds things from the house: add a device (its main entity comes with it), open the device for the rest. */
function buttonFields(t) {
  const e = ed(), items = t.items || [], has = id => items.some(it => it.entity === id);
  const devs = (t.devices || []).map(id => A.devs.find(d => d.id === id)).filter(Boolean);
  const out = [row('Title', textIn(t.name, v => change(() => { if (v) t.name = v; else delete t.name; }, {live: true, keepBoxes: true}), 'None')),
    h('h2', null, 'Devices'),
    searchPick('', () => A.devs.map(d => ({id: d.id, name: d.name, sub: (A.areas.find(a => a.id === d.area) || {}).name || ''})), id => {
      const d = A.devs.find(x => x.id === id);
      change(() => { t.devices = [...new Set([...(t.devices || []), id])]; addItem(t, d.primary); }, {inspect: true}); settle();
    }, 'Add a device', 'Add a device')];
  for (const d of devs) {
    const open = e.openDev === d.id, toggle = () => { e.openDev = open ? null : d.id; inspector(); };
    out.push(h('div', {class: 'dev' + (open ? ' open' : ''), title: 'Double-click to choose its entities', ondblclick: toggle},
      h('button', {type: 'button', class: 'bare tw', 'aria-expanded': open, 'aria-label': 'Entities of ' + d.name, html: icon(open ? 'chevron-down' : 'chevron-right'), onclick: toggle}),
      h('span', {class: 'nm'}, d.name),
      btn('', 'trash', () => { change(() => { t.devices = t.devices.filter(x => x !== d.id); t.items = items.filter(it => !d.entities.includes(it.entity)); }, {inspect: true}); settle(); }, 'icon mini')));
    out[out.length - 1].lastChild.title = 'Remove this device and its entities from the button';
    if (open) out.push(h('div', {class: 'checks ents'}, ...d.entities.map(id => h('label', null,
      h('input', {type: 'checkbox', checked: has(id), onchange: ev => { change(() => { if (ev.target.checked) addItem(t, id); else t.items = t.items.filter(it => it.entity !== id); }, {inspect: true}); settle(); }}),
      h('span', null, entName(id)), id === d.primary ? h('small', null, 'main') : null))));
  }
  out.push(row('Entity', entityPick(null, id => change(() => addItem(t, id), {keepBoxes: true}), null, true)),
    h('h2', null, 'On this button'));
  if (!items.length) out.push(h('p', {class: 'note'}, 'Nothing yet. Add a device above.'));
  items.forEach((it, k) => out.push(h('div', {class: 'item'},
    h('input', {type: 'text', value: it.label || '', placeholder: entName(it.entity), 'aria-label': 'Name shown for ' + entName(it.entity), title: it.entity,
      oninput: ev => change(() => { if (ev.target.value.trim()) it.label = ev.target.value; else delete it.label; }, {live: true, keepBoxes: true}), onchange: settle}),
    btn('', 'trash', () => { change(() => t.items.splice(k, 1), {inspect: true}); settle(); }, 'icon mini'))));
  if (items.length) out.push(h('p', {class: 'note'}, 'These names are for the panel only. Nothing is renamed in Home Assistant.'));
  out.push(h('h2', null, 'Arrangement'),
    row('Automatic', h('input', {type: 'checkbox', checked: t.auto !== false, 'aria-label': 'Arrange automatically', onchange: ev => setAuto(t, ev.target.checked)}), h('span', {class: 'note'}, t.auto !== false ? 'Reshuffles when the button is resized' : 'Drag the items on the sheet')));
  if (t.auto === false && t.grid) out.push(h('div', {class: 'f4'}, ...['cols', 'rows'].map(k => h('div', null, h('label', null, k === 'cols' ? 'Columns' : 'Rows'), h('input', {type: 'number', min: 1, max: 24, value: t.grid[k], 'aria-label': 'Button grid ' + k,
    onchange: ev => { const v = Math.max(1, Math.min(24, Math.round(+ev.target.value || t.grid[k]))), f = v / t.grid[k], p = k === 'cols' ? ['x', 'w'] : ['y', 'h'];
      change(() => { t.items.forEach(it => { it[p[0]] = Math.min(v - 1, Math.round(it[p[0]] * f)); it[p[1]] = Math.max(1, Math.min(v - it[p[0]], Math.round(it[p[1]] * f))); }); t.grid[k] = v; }, {inspect: true}); settle(); }})))));
  return out;
}

function tileFields() {
  const e = ed(), t = tile(), d = e.design, th = edTheme();
  if (!t) return [h('p', {class: 'note', style: 'margin-top:16px'}, 'Select a button on the sheet, or add one from the list on the left. Right-click the sheet or a button for more.')];
  const def = TYPES[t.type] || {label: t.type, fields: []}, live = {live: true, keepBoxes: true};
  const setp = (k, v, o) => change(() => { if (v == null || v === '') delete t[k]; else t[k] = v; }, o || live);
  const num = (k, min, max) => h('div', null, h('label', null, k.toUpperCase()), h('input', {type: 'number', min, max, value: t[k], 'aria-label': k,
    onchange: ev => { const v = Math.max(min, Math.min(max, Math.round(+ev.target.value || 0))); change(() => { t[k] = v; }, {inspect: true}); settle(); }}));
  const out = [h('h2', null, def.label),
    h('div', {class: 'f4'}, num('x', 0, d.grid.cols - t.w), num('y', 0, d.grid.rows - t.h), num('w', 2, d.grid.cols - t.x), num('h', 2, d.grid.rows - t.y))];
  if (t.type === 'button') out.push(...buttonFields(t));
  for (const [k, label, kind, opt] of def.fields) {
    if (kind === 'text') out.push(row(label, textIn(t[k], v => setp(k, v), opt)));
    else if (kind === 'entity') out.push(row(label, entityPick(t[k], v => change(() => {
      t[k] = v; if (t.type === 'action') { const dom = v.split('.')[0]; t.service = dom === 'button' ? 'button.press' : dom + '.turn_on'; }
    }, {keepBoxes: true}), opt)));
    else if (kind === 'entities') out.push(row(label, entityPick(null, v => change(() => { t[k] = [...new Set([...(t[k] || []), v])]; }, {keepBoxes: true}), opt, true)),
      ...(t[k] || []).map(id => row('', h('span', {style: 'flex:1;overflow:hidden;text-overflow:ellipsis'}, entName(id)),
        btn('', 'trash', () => { change(() => { t[k] = t[k].filter(x => x !== id); }, {inspect: true}); settle(); }, 'icon mini'))));
    else if (kind === 'area') out.push(row(label, h('select', {onchange: ev => { setp(k, ev.target.value, {keepBoxes: true}); settle(); }}, h('option', {value: ''}, 'Choose a room'), ...A.areas.map(a => h('option', {value: a.id, selected: a.id === t[k]}, a.name)))));
    else if (kind === 'page') out.push(row(label, h('select', {onchange: ev => { setp(k, ev.target.value, {keepBoxes: true}); settle(); }}, h('option', {value: ''}, 'Nothing'), ...d.pages.map(p => h('option', {value: p.id, selected: p.id === t[k]}, p.name || p.id)))));
    else if (kind === 'select') out.push(row(label, h('select', {'aria-label': label, onchange: ev => { setp(k, ev.target.value, {keepBoxes: true, inspect: true}); settle(); }}, ...opt().map(o => h('option', {value: o[0], selected: (t[k] || '') === o[0]}, o[1])))));
    else if (kind === 'bool') out.push(row(label, h('input', {type: 'checkbox', checked: t[k] !== false, onchange: ev => { setp(k, ev.target.checked ? null : false, {keepBoxes: true}); settle(); }})));
    else if (kind === 'range') out.push(row(label, h('input', {type: 'range', min: opt[0], max: opt[1], step: opt[2], value: t[k] == null ? 0.5 : t[k], oninput: ev => setp(k, +ev.target.value), onchange: settle})));
    else if (kind === 'icon') out.push(h('h2', null, label), h('div', {class: 'icons'}, ...Object.keys(window.HP_ICONS).filter(n => n !== 'lightbulb-group').map(n =>
      h('button', {type: 'button', title: n, 'aria-label': n, 'aria-pressed': t[k] === n, html: icon(n), onclick: () => { setp(k, n, {keepBoxes: true, inspect: true}); settle(); }}))));
  }
  if (t.type === 'assistant' && t.mode === 'llm') out.push(h('p', {class: 'note'}, 'The LLM address is in Settings. Home Assistant still does the listening and the speaking.'));
  if (def.note) out.push(h('p', {class: 'note'}, def.note));

  out.push(h('h2', null, 'Appearance'));
  if (th) out.push(row('Design', h('select', {'aria-label': 'Button design', onchange: ev => { setp('look', ev.target.value, {keepBoxes: true, inspect: true}); settle(); }},
    h('option', {value: ''}, 'Theme default'), ...th.buttons.map(b => h('option', {value: b.name, selected: t.look === b.name}, b.name)))));
  out.push(row('Background', h('input', {type: 'checkbox', checked: !t.flat, 'aria-label': 'Show the button background', onchange: ev => { setp('flat', ev.target.checked ? null : true, {keepBoxes: true, inspect: true}); settle(); }}), h('span', {class: 'note'}, t.flat ? 'None, content only' : 'Shown')));
  if (!t.flat) {
    // This one button's own changes, on top of its design. Each can be dropped to go back to the design's value.
    const s = t.style || {}, base = (th && ((th.buttons.find(b => b.name === t.look) || th.buttons.find(b => b.id === th.button) || {}).style)) || (d.theme || {}).tile || {};
    const set = (k, v, re) => { change(() => { t.style = t.style || {}; if (v == null || v === '') delete t.style[k]; else t.style[k] = v; if (!Object.keys(t.style).length) delete t.style; }, re ? {keepBoxes: true, inspect: true} : live); if (re) settle(); };
    const own = h('details', {open: e.ownOpen || !!t.style, ontoggle: ev => { e.ownOpen = ev.target.open; }}, h('summary', null, 'Change this button only'), ...lookFields(Object.assign({}, s), set, {clear: true, base}).filter(Boolean));
    own.addEventListener('change', settle);
    out.push(own, t.style ? h('p', {class: 'note'}, btn('Back to the design', 'undo', () => { change(() => { delete t.style; }, {inspect: true}); settle(); })) : null);
  }
  out.push(h('div', {class: 'apart'}, btn('Duplicate', 'copy', duplicateTile), btn('Delete', 'trash', removeTile, 'stop')));
  return out;
}

/** The panel's look: follow a theme, or carry its own. Then day and night, and depth. */
function panelLook() {
  const e = ed(), d = e.design, live = {live: true, keepBoxes: true}, th = edTheme();
  const own = d.theme = d.theme || {}, bg = own.background = own.background || {}, tl = own.tile = own.tile || {}, night = own.night = own.night || {};
  const set = (o, k, v, re) => { change(() => { if (v == null || v === '') delete o[k]; else o[k] = v; }, re ? {keepBoxes: true, inspect: true} : live); if (re) settle(); };
  const bgSelect = (val, onset, none) => h('select', {'aria-label': 'Background', onchange: ev => onset(ev.target.value || null)}, none ? h('option', {value: ''}, none) : null, ...th.backgrounds.map(b => h('option', {value: b.id, selected: val === b.id}, b.name)));
  const out = [h('h2', null, 'Theme'),
    row('Follows', h('select', {'aria-label': 'Theme', onchange: ev => { change(() => { if (ev.target.value) d.themeId = ev.target.value; else delete d.themeId; delete d.bg; }, {inspect: true}); settle(); viewEditor(true); }},
      h('option', {value: ''}, 'Its own look'), ...themes().map(t => h('option', {value: t.id, selected: t.id === d.themeId}, t.name))))];
  if (th) out.push(row('Background', bgSelect(d.bg || th.background, v => { change(() => { d.bg = v; }, {inspect: true}); settle(); })),
    h('p', {class: 'note'}, 'Backgrounds and button designs come from the theme. Changing the theme here, or editing it under Themes, restyles every button at once.'));
  else {
    out.push(themes().length ? null : h('p', {class: 'note'}, 'Make a theme under Themes to share one look between panels.'),
      h('h2', null, 'Background'), picture(bg.image, v => set(bg, 'image', v, true)),
      row('Colour', h('input', {type: 'color', value: (rgba(bg.color) || {hex: '#141a5c'}).hex, 'aria-label': 'Background colour', oninput: ev => set(bg, 'color', ev.target.value), onchange: settle})),
      row('Darken', h('input', {type: 'range', min: 0, max: 0.8, step: 0.01, value: bg.dim || 0, oninput: ev => set(bg, 'dim', +ev.target.value), onchange: settle})),
      row('Movement', h('select', {'aria-label': 'Movement', onchange: ev => set(bg, 'motion', ev.target.value === 'none' ? null : ev.target.value, true)}, ...MOTION.map(m => h('option', {value: m[0], selected: (bg.motion || 'none') === m[0]}, m[1])))),
      h('h2', null, 'Buttons'), ...lookFields(tl, (k, v, re) => set(tl, k, v, re)).filter(Boolean));
  }
  out.push(h('h2', null, 'Day and night'),
    row('Changes', h('select', {'aria-label': 'Day and night', onchange: ev => set(night, 'mode', ev.target.value, true)},
      ...[['', 'Never'], ['switch', 'Night background after sunset'], ['sun', 'Light follows the sun']].map(m => h('option', {value: m[0], selected: (night.mode || '') === m[0]}, m[1])))));
  if (night.mode === 'switch') {
    if (th) out.push(row('At night', bgSelect(night.bg, v => set(night, 'bg', v, true), 'Choose a background')));
    else { const nb = night.background = night.background || {}; out.push(h('h2', null, 'Night background'), picture(nb.image, v => set(nb, 'image', v, true)),
      row('Colour', h('input', {type: 'color', value: (rgba(nb.color) || {hex: '#05071c'}).hex, 'aria-label': 'Night colour', oninput: ev => set(nb, 'color', ev.target.value), onchange: settle})),
      row('Darken', h('input', {type: 'range', min: 0, max: 0.8, step: 0.01, value: nb.dim || 0, oninput: ev => set(nb, 'dim', +ev.target.value), onchange: settle}))); }
  }
  if (night.mode) {
    const mins = (k, label) => row(label, h('input', {type: 'number', min: 0, max: 180, step: 5, value: night[k] || 0, 'aria-label': label, onchange: ev => set(night, k, Math.max(0, Math.min(180, +ev.target.value || 0)) || null, true)}), h('span', {class: 'note'}, 'minutes'));
    out.push(mins('before', 'Before sunset'), night.mode === 'switch' ? mins('after', 'After sunrise') : null,
      h('p', {class: 'note'}, night.mode === 'sun' ? 'The screen warms as the sun nears the horizon and deepens to blue after it. The minutes bring dusk forward.'
        : 'Night starts this long before sunset and ends this long after sunrise, since it is dark before the sun is fully down.'));
  }
  out.push(h('h2', null, 'Depth'),
    row('Tilt effect', h('input', {type: 'range', min: 0, max: 1, step: 0.01, value: own.depth || 0, oninput: ev => set(own, 'depth', +ev.target.value || null), onchange: settle})),
    h('p', {class: 'note'}, 'Tilting the device shifts the buttons against the background. In this preview, the pointer stands in for the tilt. A wall-mounted device does not move, so it shows nothing there.'),
    h('h2', null, 'Grid'),
    h('div', {class: 'f4'}, ...['cols', 'rows'].map(k => h('div', null, h('label', null, k === 'cols' ? 'Columns' : 'Rows'), h('input', {type: 'number', min: 8, max: 160, value: d.grid[k], 'aria-label': k,
      onchange: ev => { const v = Math.max(8, Math.min(160, Math.round(+ev.target.value || d.grid[k]))), f = v / d.grid[k], pos = k === 'cols' ? ['x', 'w'] : ['y', 'h'];
        // Buttons keep their share of the screen, so a panel moves between device sizes and orientations.
        change(() => { d.pages.forEach(p => p.tiles.forEach(t => { t[pos[0]] = Math.min(v - 2, Math.round(t[pos[0]] * f)); t[pos[1]] = Math.max(2, Math.min(v - t[pos[0]], Math.round(t[pos[1]] * f))); })); d.grid[k] = v; }); settle(); fit(); }})))),
    h('p', {class: 'note'}, 'Smaller cells give finer control. Changing the grid keeps every button at its share of the screen.'));
  return out;
}

function pageFields() {
  const e = ed(), d = e.design, p = page();
  return [h('h2', null, 'This dashboard'),
    row('Name', textIn(p.name, v => change(() => { p.name = v; }, {live: true, keepBoxes: true}))),
    row('Opens first', h('input', {type: 'checkbox', checked: (d.start || d.pages[0].id) === p.id, 'aria-label': 'Open this dashboard first', onchange: () => { change(() => { d.start = p.id; }, {inspect: true}); settle(); }})),
    row('Swipe', h('input', {type: 'checkbox', checked: !p.noswipe, 'aria-label': 'Reach this dashboard by swiping', onchange: ev => { change(() => { if (ev.target.checked) delete p.noswipe; else p.noswipe = true; }, {inspect: true}); settle(); }}), h('span', {class: 'note'}, p.noswipe ? 'Only by a link button' : 'Reached by swiping sideways')),
    d.pages.length > 1 ? h('div', {class: 'apart'},
      btn('Move left', null, () => { const i = d.pages.indexOf(p); if (i > 0) { change(() => { d.pages.splice(i, 1); d.pages.splice(i - 1, 0, p); }); settle(); viewEditor(true); } }),
      btn('Move right', null, () => { const i = d.pages.indexOf(p); if (i < d.pages.length - 1) { change(() => { d.pages.splice(i, 1); d.pages.splice(i + 1, 0, p); }); settle(); viewEditor(true); } }),
      btn('Delete', 'trash', () => {
        if (!confirm('Delete the dashboard "' + (p.name || p.id) + '" and its buttons?')) return;
        change(() => { d.pages = d.pages.filter(x => x !== p); if (d.start === p.id) d.start = d.pages[0].id; }); e.page = d.pages[0].id; e.sel = -1; viewEditor(true);
      }, 'stop')) : null];
}

// ---------- keyboard ----------
window.addEventListener('keydown', ev => {
  const e = ed(); if (!e || A.view !== 'editor' || $('#menu')) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName), mod = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
  if (mod && k === 's') { ev.preventDefault(); return save(); }
  if (typing) return;
  if (mod && k === 'z') { ev.preventDefault(); return travel(e.hist, e.redo); }
  if (mod && k === 'y') { ev.preventDefault(); return travel(e.redo, e.hist); }
  if (mod && k === 'd') { ev.preventDefault(); return duplicateTile(); }
  const t = tile(); if (!t) return;
  const g = e.design.grid, step = {arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1]}[k];
  if (step) {
    ev.preventDefault();
    change(() => { if (ev.shiftKey) { t.w = Math.max(2, Math.min(g.cols - t.x, t.w + step[0])); t.h = Math.max(2, Math.min(g.rows - t.y, t.h + step[1])); }
      else { t.x = Math.max(0, Math.min(g.cols - t.w, t.x + step[0])); t.y = Math.max(0, Math.min(g.rows - t.h, t.y + step[1])); } }, {live: true, inspect: true});
  } else if (k === 'delete' || k === 'backspace') { ev.preventDefault(); removeTile(); }
});
window.addEventListener('keyup', settle);
document.addEventListener('change', settle, true);  // a finished drag of a slider or colour ends that run of edits
