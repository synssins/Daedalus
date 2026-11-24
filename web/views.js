'use strict';
// Views: home dashboard, room pages, camera wall. Layout and rules follow the HA "Master" dashboard:
// things show only when relevant, one accent colour means "on", every room page has the same order.
// Everything home-specific (rooms, quick tiles, alerts) comes from config.json -> "dashboard".

const S = {states: {}, areas: {}, reg: {}, dash: {}};
let ha, route = {view: 'home'}, teardown = [], drawTimer = null, touching = false;
const main = document.getElementById('main'), bar = document.getElementById('bar'), nav = document.getElementById('nav');

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const st = e => S.states[e];
const avail = e => !!st(e) && st(e).state !== 'unavailable';
const fname = e => (st(e) && st(e).attributes.friendly_name) || e;
const cap = s => (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, ' ');
const ACTIVE = ['on', 'open', 'opening', 'playing'];

function stateLabel(e) {
  const s = st(e);
  if (!s || s.state === 'unavailable') return 'Offline';
  if (s.state === 'on' && s.attributes.brightness) return Math.round(s.attributes.brightness / 2.55) + '%';
  return cap(s.state);
}
/** 'Master Bedroom Arc Lamp 2' in Master Bedroom -> 'Arc Lamp 2' */
function short(name, room) {
  const out = name.trim().toLowerCase().startsWith(room.toLowerCase() + ' ') ? name.trim().slice(room.length + 1) : name.trim();
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : name;
}
function inArea(area, domain) {
  return Object.keys(S.states).filter(e => e.startsWith(domain + '.') && S.reg[e] && S.reg[e].area === area && !S.reg[e].skip && avail(e)).sort();
}

// ---------- tiles ----------
function tile(o) {
  const act = o.act ? ` data-act="${o.act}" data-arg="${esc(o.arg)}"` + (o.confirm ? ` data-confirm="${esc(o.confirm)}"` : '') : '';
  return `<div class="t ${o.cls || ''}${o.wide ? ' wide' : ''}"${act}><div class="n">${esc(o.name)}</div><div class="l">${esc(o.label || '')}</div></div>`;
}
function toggleTile(e, name, confirm) {
  const off = !avail(e);
  return tile({name: name || fname(e), label: stateLabel(e), cls: off ? 'off' : ACTIVE.includes(st(e).state) ? 'on' : '',
    act: off ? null : 'toggle', arg: e, confirm});
}
const section = (title, tiles, cls) => tiles.length ? `<section class="${cls || ''}">${title ? `<h2>${esc(title)}</h2>` : ''}<div class="grid">${tiles.join('')}</div></section>` : '';
function mediaTile(e, room) {
  const a = st(e).attributes;
  return tile({wide: true, name: a.media_title || a.friendly_name, cls: st(e).state === 'playing' ? 'on' : '',
    label: [a.media_artist || a.app_name, room].filter(Boolean).join(' · ') || cap(st(e).state), act: 'media', arg: e});
}

// ---------- home ----------
function homeView() {
  const d = S.dash, now = new Date();
  const status = [tile({name: now.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
    label: now.toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'})})];
  if (avail(d.weather)) {
    const w = st(d.weather), map = {partlycloudy: 'Partly cloudy', 'clear-night': 'Clear'};
    status.push(tile({name: Math.round(w.attributes.temperature) + '°', label: map[w.state] || cap(w.state)}));
  }
  if (d.alarm && st(d.alarm)) {
    const a = st(d.alarm).state;
    status.push(tile({name: 'Alarm', label: stateLabel(d.alarm), cls: a === 'triggered' ? 'alert' : /^armed/.test(a) ? 'on' : ''}));
  }
  const people = (d.people || []).filter(st);
  if (people.length) {
    const first = p => fname(p).split(' ')[0], home = people.filter(p => st(p).state === 'home'), away = people.filter(p => st(p).state !== 'home');
    status.push(tile({cls: home.length ? 'ok' : '',
      name: home.length === people.length ? 'Everyone home' : home.length ? home.map(first).join(', ') + ' home' : 'Nobody home',
      label: away.map(p => first(p) + ': ' + (st(p).state === 'not_home' ? 'away' : st(p).state)).join(', ')}));
  }

  const alerts = (d.alerts || []).filter(a => st(a.entity) && st(a.entity).state === a.bad).map(a => tile({name: a.text, label: stateLabel(a.entity), cls: 'alert'}));
  if (d.ups && st(d.ups) && (d.ups_on_battery || []).includes(st(d.ups).state)) alerts.push(tile({name: 'UPS on battery', label: st(d.ups).state, cls: 'alert'}));
  const offline = Object.keys(d.offline_watch || {}).filter(e => !avail(e)).map(e => d.offline_watch[e]);
  if (offline.length) alerts.push(tile({name: 'Offline', label: offline.join(', '), cls: 'warn'}));

  const quick = [];
  if (d.all_off) quick.push(tile({name: 'All lights off', label: 'Whole house', act: 'script', arg: d.all_off, confirm: 'Turn off every light in the house?'}));
  (d.quick_lights || []).forEach(q => quick.push(toggleTile(q.entity, q.name)));
  if (d.garage) quick.push(toggleTile(d.garage, 'Garage door', 'Move the garage door?'));
  if (d.lock) quick.push(tile({name: 'Front lock', label: stateLabel(d.lock), cls: !avail(d.lock) ? 'off' : st(d.lock).state === 'unlocked' ? 'warn' : ''}));
  (d.quick_scenes || []).forEach(q => quick.push(tile({name: q.name, label: 'Scene', act: 'scene', arg: q.entity})));

  const rooms = (d.rooms || []).filter(r => S.areas[r.area]);
  const playing = [];
  Object.keys(S.areas).forEach(a => inArea(a, 'media_player').filter(e => st(e).state === 'playing').forEach(e => playing.push(mediaTile(e, S.areas[a]))));

  const roomTiles = rooms.map(r => {
    const ls = inArea(r.area, 'light'), on = ls.filter(e => st(e).state === 'on').length;
    const t = inArea(r.area, 'sensor').filter(e => st(e).attributes.device_class === 'temperature').map(e => parseFloat(st(e).state)).find(v => !isNaN(v));
    return tile({name: S.areas[r.area], cls: on ? 'on' : '', act: 'room', arg: r.area,
      label: [ls.length ? (on ? on + ' on' : 'Lights off') : '', t == null ? '' : Math.round(t) + '°'].filter(Boolean).join(' · ')});
  });

  return section(null, status) + section('Needs attention', alerts) + section('Quick', quick) +
    section('Now playing', playing) + section('Rooms', roomTiles);
}

// ---------- room ----------
function roomView(area) {
  const room = S.areas[area] || area, cfg = (S.dash.rooms || []).find(r => r.area === area) || {};
  const lights = inArea(area, 'light').filter(e => e !== cfg.group).map(e => toggleTile(e, short(fname(e), room)));
  if (cfg.group && avail(cfg.group)) lights.unshift(toggleTile(cfg.group, 'All lights'));
  const scenes = inArea(area, 'scene').map(e => tile({name: short(fname(e).split(':').pop().trim(), room), label: 'Scene', act: 'scene', arg: e}));
  const doors = inArea(area, 'cover').map(e => toggleTile(e, null, 'Move this door?'));
  const media = inArea(area, 'media_player').map(e => mediaTile(e, null));
  const temps = inArea(area, 'sensor').filter(e => st(e).attributes.device_class === 'temperature' && !isNaN(parseFloat(st(e).state)))
    .map(e => tile({name: short(fname(e), room), label: Math.round(parseFloat(st(e).state)) + (st(e).attributes.unit_of_measurement || '°')}));
  return (section('Lights', lights) + section('Scenes', scenes) + section('Doors', doors) + section('Media', media) + section('Temperature', temps))
    || '<div class="empty">Nothing to control in this room right now</div>';
}

// ---------- camera wall ----------
const MAX_LIVE = 4;  // Air 2 has 2 GB RAM: cap simultaneous decoders
function cameraView(only) {
  main.innerHTML = '<div id="wall"' + (only ? ' class="one"' : '') + '></div>';
  const wall = document.getElementById('wall');
  let cams = Object.values(S.states).filter(s => s.entity_id.startsWith('camera.') && s.state !== 'unavailable');
  if (only) cams = cams.filter(s => s.entity_id === only);
  cams.sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  if (!cams.length) { wall.innerHTML = '<div class="empty">No cameras available in Home Assistant</div>'; return; }
  let live = 0;
  for (const s of cams) {
    const el = document.createElement('div'); el.className = 'cam';
    const img = document.createElement('img'), video = document.createElement('video'), label = document.createElement('div');
    video.muted = true; video.autoplay = true; video.playsInline = true; video.setAttribute('playsinline', '');
    label.className = 'label';
    const name = (s.attributes.friendly_name || s.entity_id).replace(/ High resolution channel$/i, '');
    const status = t => { label.textContent = t ? name + ' · ' + t : name; el.classList.toggle('live', !t); };
    el.append(img, video, label);
    wall.append(el);
    teardown.push(snapshots(ha, s, img, el));
    if (!(s.attributes.supported_features & 2)) status('stills, RTSPS off');
    else if (live < MAX_LIVE || only) { live++; status('connecting'); teardown.push(playCamera(ha, s.entity_id, video, status)); }
    else status('tap for video');
    el.onclick = () => show({view: 'cameras', only: only ? null : s.entity_id});
  }
}

// ---------- router ----------
function show(r) {
  route = r;
  teardown.forEach(f => f()); teardown = [];
  const title = r.view === 'room' ? S.areas[r.area] || '' : r.view === 'cameras' ? 'Cameras' : '';
  nav.innerHTML = (r.view === 'room' || r.only ? `<div class="nb back" data-act="${r.only ? 'cameras' : 'home'}">‹ Back</div>` : '') +
    `<div class="title">${esc(title)}</div>` +
    `<div class="nb${r.view !== 'cameras' ? ' cur' : ''}" data-act="home">Home</div><div class="nb${r.view === 'cameras' ? ' cur' : ''}" data-act="cameras">Cameras</div>`;
  if (r.view === 'cameras') cameraView(r.only); else draw();
  main.scrollTop = 0;
}
function draw() {
  if (route.view === 'cameras') return;  // the wall manages its own elements; redrawing would restart video
  main.innerHTML = '<div class="page">' + (route.view === 'room' ? roomView(route.area) : homeView()) + '</div>';
}
/** State changes arrive in bursts: redraw at most a few times a second, and never under a finger (the tap would be lost). */
function dirty() {
  if (drawTimer) return;
  drawTimer = setTimeout(() => { drawTimer = null; touching ? dirty() : draw(); }, 300);
}
document.addEventListener('touchstart', () => { touching = true; }, {passive: true});
document.addEventListener('touchend', () => { setTimeout(() => { touching = false; }, 350); }, {passive: true});
document.addEventListener('touchcancel', () => { touching = false; }, {passive: true});

// ---------- actions ----------
const service = (domain, svc, entity) => ha.call({type: 'call_service', domain, service: svc, target: {entity_id: entity}})
  .catch(e => { bar.textContent = e.message; setTimeout(() => { bar.textContent = ''; }, 5000); });
const ACTIONS = {
  home: () => show({view: 'home'}),
  cameras: () => show({view: 'cameras'}),
  room: a => show({view: 'room', area: a}),
  toggle: e => service('homeassistant', 'toggle', e),
  scene: e => service('scene', 'turn_on', e),
  script: e => service('script', 'turn_on', e),
  media: e => service('media_player', 'media_play_pause', e),
};
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const run = () => ACTIONS[el.dataset.act](el.dataset.arg);
  el.dataset.confirm ? confirmBox(el.dataset.confirm, run) : run();
});
// Own dialog: the web view has no built-in confirm().
function confirmBox(text, yes) {
  const m = document.getElementById('modal');
  m.innerHTML = `<div class="box"><div class="q">${esc(text)}</div><div class="row"><div class="nb" data-m="no">Cancel</div><div class="nb go" data-m="yes">Yes</div></div></div>`;
  m.className = 'open';
  m.onclick = e => { const b = e.target.closest('[data-m]'); if (!b && e.target !== m) return; m.className = ''; if (b && b.dataset.m === 'yes') yes(); };
}

// ---------- boot ----------
async function loadAll() {
  const [areas, devices, ents, states] = await Promise.all([
    ha.call({type: 'config/area_registry/list'}), ha.call({type: 'config/device_registry/list'}),
    ha.call({type: 'config/entity_registry/list'}), ha.call({type: 'get_states'})]);
  S.areas = {}; areas.forEach(a => { S.areas[a.area_id] = a.name; });
  const dev = {}; devices.forEach(d => { dev[d.id] = d.area_id; });
  S.reg = {}; ents.forEach(e => { S.reg[e.entity_id] = {area: e.area_id || dev[e.device_id] || null, skip: !!(e.hidden_by || e.entity_category || e.disabled_by)}; });
  S.states = {}; states.forEach(s => { S.states[s.entity_id] = s; });
  await ha.subscribe({type: 'subscribe_events', event_type: 'state_changed'}, ev => {
    const d = ev.data;
    if (d.new_state) S.states[d.entity_id] = d.new_state; else delete S.states[d.entity_id];
    dirty();
  });
  show(route);
}

native('ping').then(m => {
  const cfg = m.config || {};
  if (!cfg.ha_url || !cfg.ha_token) { bar.textContent = 'config.json needs ha_url and ha_token'; return; }
  S.dash = cfg.dashboard || {};
  if (cfg.start) route = cfg.start;  // per-iPad opening page, e.g. {"view": "room", "area": "office"}
  ha = new HA(cfg.ha_url, cfg.ha_token);
  ha.onstate = s => { bar.textContent = s === 'online' ? '' : 'Home Assistant: ' + s; console.log('HA ' + s); };
  ha.onready = () => loadAll().catch(e => { bar.textContent = 'load failed: ' + e.message; });
  ha.connect();
  setInterval(dirty, 30000);  // keeps the clock tile current
}).catch(e => { bar.textContent = 'native bridge failed: ' + e.message; });
