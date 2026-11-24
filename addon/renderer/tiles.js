'use strict';
// Built-in tile types. A tile type is a plugin: HP.tile(name, {create, update, tap}).
//   create(t, body, ctx, inst) -> optional data object (may carry destroy())   builds the DOM once
//   update(t, body, ctx, inst)                                                patches it on state changes
//   tap(t, ctx, inst) -> function to run, or null                             what a touch does
// "t" is the tile's entry from the design file; inst.el is the tile element (add class "on" for the lit look).
(() => {
  const U = HP.util, st = U.st;

  HP.tile('label', {
    create(t, body) { body.innerHTML = `<div class="big" style="font-size:${(t.size || 0.5) * 100}%;text-align:${t.align || 'left'}">${U.esc(t.text || '')}</div>`; },
  });

  HP.tile('image', {create() {}});  // the picture is the tile's style.image

  HP.tile('clock', {
    create(t, body) { body.innerHTML = '<div class="time"></div><div class="date"></div>'; },
    update(t, body) {
      const now = new Date();
      U.set(body.firstChild, now.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}).replace(/\s?[AP]M$/i, ''));
      U.set(body.lastChild, now.toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'}));
    },
  });

  // shortcut: the starter icon set has three sky icons; everything that is not clear shows the cloud until the full set ships.
  const SKY = {sunny: 'weather-sunny', 'clear-night': 'weather-night'};
  HP.tile('weather', {
    create(t, body, ctx, i) { i.p = U.card(body, 'weather-cloudy'); },
    update(t, body, ctx, i) {
      const w = st(t.entity); if (!w) return;
      const ic = U.icon(SKY[w.state] || 'weather-cloudy'); if (i.p.ic.innerHTML !== ic) i.p.ic.innerHTML = ic;
      U.set(i.p.n, Math.round(w.attributes.temperature) + '°');
      U.set(i.p.l, ({partlycloudy: 'Partly cloudy', 'clear-night': 'Clear'})[w.state] || U.cap(w.state));
    },
  });

  HP.tile('people', {
    create(t, body, ctx, i) { i.p = U.card(body, t.icon || 'account-multiple'); },
    update(t, body, ctx, i) {
      const ps = (t.entities || []).filter(st), first = p => U.fname(p).split(' ')[0];
      const home = ps.filter(p => st(p).state === 'home'), away = ps.filter(p => st(p).state !== 'home');
      U.set(i.p.n, home.length === ps.length ? 'Everyone home' : home.length ? home.map(first).join(', ') + ' home' : 'Nobody home');
      U.set(i.p.l, away.map(p => first(p) + ': ' + (st(p).state === 'not_home' ? 'away' : st(p).state)).join(', '));
    },
  });

  // Shows only when something is wrong; hidden otherwise.
  HP.tile('alerts', {
    create(t, body, ctx, i) { i.p = U.card(body, 'alert'); i.el.classList.add('warn'); },
    update(t, body, ctx, i) {
      const bad = (t.alerts || []).filter(a => st(a.entity) && st(a.entity).state === a.bad).map(a => a.text);
      const off = Object.keys(t.offline || {}).filter(e => !U.avail(e)).map(e => t.offline[e]);
      const hide = !bad.length && !off.length;
      if (i.el.hidden !== hide) { i.el.hidden = hide; ctx.relayout(); }
      i.el.classList.toggle('alert', bad.length > 0);
      U.set(i.p.n, bad.length ? bad.join(' · ') : 'Offline');
      U.set(i.p.l, off.length ? (bad.length ? 'Offline: ' : '') + off.join(', ') : '');
    },
  });

  HP.tile('entity', {
    create(t, body, ctx, i) { i.p = U.card(body, t.icon || 'lightbulb'); },
    update(t, body, ctx, i) {
      U.set(i.p.n, t.name || U.fname(t.entity)); U.set(i.p.l, U.stateLabel(t.entity));
      i.el.classList.toggle('on', U.active(t.entity)); i.el.classList.toggle('off', !U.avail(t.entity));
    },
    tap: (t, ctx) => U.avail(t.entity) ? () => ctx.service('homeassistant', 'toggle', t.entity) : null,
  });

  HP.tile('action', {
    create(t, body, ctx, i) { i.p = U.card(body, t.icon || 'star'); U.set(i.p.n, t.name || ''); U.set(i.p.l, t.label || ''); },
    tap: (t, ctx) => () => { const [d, s] = t.service.split('.'); ctx.service(d, s, t.entity, t.data); },
  });

  HP.tile('nav', {
    create(t, body, ctx, i) { i.p = U.card(body, t.icon || 'home'); U.set(i.p.n, t.name || ''); U.set(i.p.l, t.label || ''); },
    tap: (t, ctx) => () => t.back ? ctx.back() : ctx.go(t.page),
  });

  HP.tile('room', {
    create(t, body, ctx, i) { i.p = U.card(body, t.icon || 'home'); },
    update(t, body, ctx, i) {
      const ls = U.inArea(t.area, 'light'), on = ls.filter(e => st(e).state === 'on').length;
      const temp = U.inArea(t.area, 'sensor').filter(e => st(e).attributes.device_class === 'temperature').map(e => parseFloat(st(e).state)).find(v => !isNaN(v));
      U.set(i.p.n, t.name || HP.S.areas[t.area] || t.area);
      U.set(i.p.l, [ls.length ? (on ? on + ' on' : 'Lights off') : '', temp == null ? '' : Math.round(temp) + '°'].filter(Boolean).join(' · '));
      i.el.classList.toggle('on', on > 0);
    },
    tap: (t, ctx) => () => ctx.go('@room', t.area),
  });

  HP.tile('media', {
    create(t, body, ctx, i) { i.p = U.card(body, 'play'); },
    update(t, body, ctx, i) {
      const s = st(t.entity); if (!s) return;
      const a = s.attributes, playing = s.state === 'playing', ic = U.icon(playing ? 'pause' : 'play');
      if (i.p.ic.innerHTML !== ic) i.p.ic.innerHTML = ic;
      U.set(i.p.n, a.media_title || t.name || a.friendly_name); U.set(i.p.l, a.media_artist || a.app_name || U.cap(s.state));
      i.el.classList.toggle('on', playing);
    },
    tap: (t, ctx) => () => ctx.service('media_player', 'media_play_pause', t.entity),
  });

  // Still picture at once, live video takes over where the tablet can decode it. Tap opens the camera's page.
  HP.tile('camera', {
    create(t, body) {
      const s = st(t.entity);
      body.classList.add('cam');
      const img = document.createElement('img'), video = document.createElement('video'), label = document.createElement('div');
      video.muted = true; video.autoplay = true; video.playsInline = true; video.setAttribute('playsinline', '');
      label.className = 'camlabel';
      const name = t.name || (s ? U.fname(t.entity).replace(/ High resolution channel$/i, '') : t.entity);
      const status = x => { label.textContent = x ? name + ' · ' + x : name; body.classList.toggle('live', !x); };
      body.append(img, video, label);
      if (!s || s.state === 'unavailable') { status('offline'); return null; }
      const stops = [snapshots(HP.ha, s, img, body)];
      if (t.video === false || !(s.attributes.supported_features & 2)) status('stills'); else { status('connecting'); stops.push(playCamera(HP.ha, t.entity, video, status)); }
      return {destroy: () => stops.forEach(f => f())};
    },
    tap: (t, ctx) => t.page ? () => ctx.go(t.page) : null,
  });
  // A button that holds several things from the house, each on the button's own small grid. Items are either
  // placed by hand in the Studio (x, y, w, h on t.grid) or, while t.auto is not false, arranged to suit the
  // button's shape, so stretching the button in the editor reshuffles what is on it.
  const DOMAIN_ICON = {light: 'lightbulb', switch: 'power', fan: 'power', input_boolean: 'power', cover: 'garage', lock: 'lock', media_player: 'play', camera: 'video',
    scene: 'star', script: 'star', button: 'gesture-tap', input_button: 'gesture-tap', climate: 'thermometer', person: 'account-multiple', weather: 'weather-cloudy'};
  const press = (it, ctx) => {
    const e = it.entity, dom = e.split('.')[0], s = st(e);
    if (dom === 'scene' || dom === 'script') return ctx.service(dom, 'turn_on', e);
    if (dom === 'button' || dom === 'input_button') return ctx.service(dom, 'press', e);
    if (dom === 'lock') return ctx.service('lock', s.state === 'locked' ? 'unlock' : 'lock', e);
    if (dom === 'media_player') return ctx.service('media_player', 'media_play_pause', e);
    return ctx.service('homeassistant', 'toggle', e);
  };
  const READ_ONLY = ['sensor', 'binary_sensor', 'weather', 'person', 'sun', 'device_tracker', 'camera', 'update', 'event', 'zone'];
  HP.tile('button', {
    create(t, body, ctx, i) {
      const items = (t.items || []).filter(it => it && it.entity);
      body.classList.add('multi');
      body.innerHTML = (t.name ? '<div class="bt"></div>' : '') + '<div class="its"></div>';
      if (t.name) body.firstChild.textContent = t.name;
      const box = body.lastChild, W = box.clientWidth, H = box.clientHeight, n = items.length;
      // by hand, or the arrangement whose cells come closest to a comfortable card shape for this button
      const manual = t.auto === false && t.grid && items.every(it => it.w > 0 && it.h > 0);
      let cols = 1, rows = 1, best = Infinity;
      if (manual) { cols = t.grid.cols; rows = t.grid.rows; }
      else for (let c = 1; c <= Math.max(1, n); c++) { const r = Math.ceil(n / c), miss = Math.abs(Math.log((W / c) / (H / r) / 1.5)); if (miss < best) { best = miss; cols = c; rows = r; } }
      i.cells = items.map((it, k) => {
        const el = document.createElement('div'), p = manual ? it : {x: k % cols, y: Math.floor(k / cols), w: 1, h: 1};
        const w = W * p.w / cols, h = H * p.h / rows, readOnly = READ_ONLY.includes(it.entity.split('.')[0]);
        el.className = 'it' + (w / h > 2.4 ? ' wide' : '') + (n === 1 ? ' only' : '') + (readOnly ? '' : ' tap');
        el.style.cssText = `left:${p.x / cols * 100}%;top:${p.y / rows * 100}%;width:${p.w / cols * 100}%;height:${p.h / rows * 100}%;--iu:${U.unit(w, h).toFixed(1)}px`;
        el.innerHTML = '<div class="ic"></div><div class="tx"><div class="n"></div><div class="l"></div></div>';
        if (!readOnly) el.addEventListener('click', () => { if (U.avail(it.entity)) press(it, ctx); });
        box.append(el);
        return {it, el, ic: el.firstChild, n: el.querySelector('.n'), l: el.querySelector('.l')};
      });
    },
    update(t, body, ctx, i) {
      for (const c of i.cells || []) {
        const e = c.it.entity, s = st(e), dom = e.split('.')[0];
        const name = c.it.icon || (dom === 'media_player' && s && s.state === 'playing' ? 'pause' : DOMAIN_ICON[dom] || ''), ic = U.icon(name);
        if (c.ic.innerHTML !== ic) c.ic.innerHTML = ic;
        // The label is the Studio's own name for it when one was typed; otherwise Home Assistant's friendly name.
        U.set(c.n, c.it.label || (s ? U.fname(e) : e)); U.set(c.l, U.stateLabel(e));
        c.el.classList.toggle('on', U.active(e)); c.el.classList.toggle('off', !U.avail(e));
      }
    },
  });

  // The exchange shows inside the button: assist.js puts the orb where the icon is and the words on the two lines.
  HP.tile('assistant', {
    create(t, body, ctx, i) { i.p = U.card(body, t.icon || 'microphone'); U.set(i.p.n, t.name || 'Assistant'); U.set(i.p.l, t.label || ''); },
    tap: t => () => HP.assist.start(t),
  });
})();
