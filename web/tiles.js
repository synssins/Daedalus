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

  // ---------- what a touch does, by what the thing is ----------
  const DOMAIN_ICON = {light: 'lightbulb', switch: 'power', fan: 'power', input_boolean: 'power', cover: 'garage', lock: 'lock', alarm_control_panel: 'lock', media_player: 'play', camera: 'video',
    scene: 'star', script: 'star', button: 'gesture-tap', input_button: 'gesture-tap', climate: 'thermometer', person: 'account-multiple', weather: 'weather-cloudy'};
  /** Locks, doors and alarms ask before they act: for the code where Home Assistant wants one, else yes or no (when
   *  there is a question to ask). A panel can switch the asking off (design.guard === false, the Studio's Dashboard
   *  tab); a code Home Assistant insists on is then Home Assistant's to refuse. */
  const guard = (name, question, needsCode, run) => HP.design.guard === false ? run() : needsCode ? HP.pin(name, run) : question ? HP.confirm(question, run, 'No') : run();
  const withCode = code => code ? {code} : {};
  const DOORS = ['garage', 'door', 'gate'];
  /** Used by the single button and by each thing on a button that holds several. name is the button's own name for it. */
  HP.act = (e, ctx, name) => {
    const dom = e.split('.')[0], s = st(e), a = s ? s.attributes : {}, nm = name || U.fname(e);
    if (dom === 'light') return lightCan(e).dim ? lightPop(e, ctx, nm) : ctx.service('light', 'toggle', e);  // nothing to set on an on/off light: it switches
    if (dom === 'lock') {
      const unlock = s.state === 'locked';  // locking a door that has no code needs no question
      return guard(nm, unlock ? `This will unlock ${nm}. Are you sure?` : null, !!a.code_format, code => ctx.service('lock', unlock ? 'unlock' : 'lock', e, withCode(code)));
    }
    if (dom === 'cover' && DOORS.includes(a.device_class)) {
      const open = s.state !== 'open' && s.state !== 'opening';
      return guard(nm, `This will ${open ? 'open' : 'close'} ${nm}. Are you sure?`, false, () => ctx.service('cover', open ? 'open_cover' : 'close_cover', e));
    }
    if (dom === 'alarm_control_panel') return alarmPop(e, ctx, nm);
    if (dom === 'scene') HP.sceneMark(e);
    if (dom === 'scene' || dom === 'script') return ctx.service(dom, 'turn_on', e);
    if (dom === 'button' || dom === 'input_button') return ctx.service(dom, 'press', e);
    if (dom === 'media_player') return ctx.service('media_player', 'media_play_pause', e);
    return ctx.service('homeassistant', 'toggle', e);
  };

  /** A lit light's own colour at its own level as the button's lit fill, where the button design asks for it
   *  (lightState). Off, not a light, or not asked for: the design's own look. */
  function lit(el, e, want) {
    const s = st(e), on = want && s && s.state === 'on' && e.startsWith('light.');
    paint(el, on ? [[s.attributes.rgb_color || WARM, level(s.attributes.brightness)]] : null);
  }
  const WARM = [255, 196, 110], level = b => b == null ? 1 : 0.1 + 0.9 * b / 255;
  /** A button's lit fill from light: stops of [[r, g, b], level 0 to 1]. One stop is a plain fill; several fade into
   *  each other from left to right. null gives the button its design's own look back. */
  function paint(el, stops) {
    const sig = stops ? JSON.stringify(stops) : '';
    if ((el.hpLit || '') === sig) return;
    el.hpLit = sig;
    if (!stops) { ['--fill-on', '--glow-on'].forEach(k => el.style.removeProperty(k)); el.style.color = ''; return; }
    const css = (s, k) => `rgba(${s[0].slice(0, 3).map(Math.round)},${(s[1] * k).toFixed(2)})`;
    el.style.setProperty('--fill-on', stops.length === 1 ? `linear-gradient(155deg, ${css(stops[0], 1)}, ${css(stops[0], 0.86)})` : `linear-gradient(90deg, ${stops.map(s => css(s, 1)).join(', ')})`);
    el.style.setProperty('--glow-on', css(stops[0], 0.5));
    const lum = stops.reduce((n, s) => n + (0.299 * s[0][0] + 0.587 * s[0][1] + 0.114 * s[0][2]) / 255 * s[1], 0) / stops.length;
    el.style.color = lum < 0.55 ? '#fff' : '#1c1408';  // words stay readable on a dim or dark fill
  }
  /** A scene's button is lit while the lights are as the scene sets them (HP.sceneActive). Where the button design
   *  asks for light status, it is lit in the scene's own colours: its lights that are on, one fading into the next. */
  function sceneLook(el, id, want) {
    const on = !!id && HP.sceneActive(id), ls = on && want ? (HP.scenes[id] || []).filter(l => l.on) : [];
    el.classList.toggle('on', on);
    paint(el, ls.length ? ls.map(l => [l.rgb || WARM, level(l.bri)]) : null);
  }
  /** The scenes of a place: all of them, or those of a room ('area:<id>') or of a floor's rooms ('floor:<id>'). */
  const scenesIn = scope => {
    const S = HP.S, key = (scope || '').slice((scope || '').indexOf(':') + 1), areas = !scope ? null : scope.startsWith('floor:') ? Object.keys(S.floor || {}).filter(a => S.floor[a] === key) : [key];
    return Object.keys(S.states).filter(e => e.startsWith('scene.') && U.avail(e) && (!areas || (!!S.reg[e] && areas.includes(S.reg[e].area)))).sort((a, b) => U.fname(a).localeCompare(U.fname(b)));
  };
  const sceneName = (e, scope) => U.short(U.fname(e).split(':').pop().trim(), (scope || '').startsWith('area:') ? HP.S.areas[scope.slice(5)] : '');

  // ---------- controls on a popup tile ----------
  /** A finger moves a control, or the remote does while it holds it. move(x, y): the place inside it, 0 to 1.
   *  nudge(dx, dy): one arrow press. The house is told a few times a second on the way and once more at the end;
   *  for two seconds after, the control keeps the finger's value and not the house's, which is still catching up. */
  function drag(el, move, nudge, send) {
    let last = 0, timer = 0;
    const tell = now => { clearTimeout(timer); if (now || performance.now() - last > 300) { last = performance.now(); send(); } else timer = setTimeout(() => tell(true), 300); };
    const hold = () => { el.hpHold = performance.now() + 2000; };
    const at = e => { const r = el.getBoundingClientRect(); hold(); move(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))); };
    el.addEventListener('pointerdown', e => { try { el.setPointerCapture(e.pointerId); } catch (x) {} at(e); tell(); });
    el.addEventListener('pointermove', e => { if (e.buttons) { at(e); tell(); } });
    el.addEventListener('pointerup', () => tell(true));
    el.addEventListener('hp-nudge', e => { hold(); nudge(e.detail.dx, e.detail.dy); tell(true); });
  }
  /** A list that opens upward from its well: a light's effects, or a choice kept on the light's own device (a WLED
   *  preset). options() gives [the list, the one in use]. */
  function dropdown(parent, options, pick) {
    const d = part(parent, 'dd', '1', '<div class="ddv"></div><div class="ddl"></div>');
    d.onclick = ev => {
      const o = ev.target.closest('.ddl div'), open = d.classList.contains('open');
      parent.querySelectorAll('.dd.open').forEach(x => x.classList.remove('open'));  // one list at a time
      if (o) return pick(o.textContent);
      if (open) return;
      const [list, now] = options();
      d.lastChild.innerHTML = list.map(x => `<div data-r="1"${x === now ? ' class="cur"' : ''}>${U.esc(x)}</div>`).join('');
      d.classList.add('open');
    };
    return d;
  }
  const part = (parent, cls, r, html) => { const d = document.createElement('div'); d.className = cls; if (r) d.dataset.r = r; d.innerHTML = html || ''; parent.append(d); return d; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const COLOUR = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];
  /** What a light can do, as Home Assistant reports it. Nothing about it is chosen in the Studio. */
  const lightCan = e => { const a = (st(e) || {attributes: {}}).attributes, m = a.supported_color_modes || [];
    return {dim: m.some(x => x !== 'onoff'), ct: m.includes('color_temp') || m.includes('rgbww'), colour: m.some(x => COLOUR.includes(x)), fx: (a.effect_list || []).length > 0}; };
  /** Left to right: level, warm to cool white, colour, with the light's effects under the colour. Only what the light has.
   *  Setting any of them switches an off light on at that value. */
  function lightPop(e, ctx, name) {
    const can = lightCan(e), a0 = st(e).attributes, lo = a0.min_color_temp_kelvin || 2000, hi = a0.max_color_temp_kelvin || 6500;
    const call = data => ctx.service('light', 'turn_on', e, data);
    // Each step fades into the next, so a drag reads as one smooth change and not as a row of jumps.
    const fade = data => call(Object.assign(data, {transition: 0.3}));
    // A new white or colour would not show under a running effect: the light's own "no effect" goes with it.
    const NONE = /^(off|none)$/i;
    const tune = data => { const a = st(e).attributes, none = (a.effect_list || []).find(x => NONE.test(x)); return fade(Object.assign(a.effect && none && !NONE.test(a.effect) ? {effect: none} : {}, data)); };
    HP.pop.open(name, (body, head) => {
      const v = {on: false, bri: 0, k: lo, h: 0, s: 0, white: true};  // what the controls show
      const power = part(head, 'rb', '1', U.icon('power')); head.insertBefore(power, head.querySelector('.px'));
      power.onclick = () => ctx.service('light', 'toggle', e);
      const MARK = '<div class="mark"></div>', y = p => 4 + (100 - p) * 0.92 + '%';  // keeps the mark inside the bar at both ends
      const bri = part(body, 'vbar bri', 'adj', MARK), ct = can.ct ? part(body, 'vbar ct', 'adj', MARK) : null;
      // Choices kept on the same device as the light, as Home Assistant has them: a WLED strip's presets and playlists.
      const reg = HP.S.reg, dev = reg[e] && reg[e].dev;
      const picks = dev ? Object.keys(HP.S.states).filter(id => id.startsWith('select.') && reg[id] && reg[id].dev === dev && !reg[id].skip).sort() : [];
      const side = can.colour || can.fx || picks.length ? part(body, 'pr') : null, wheel = can.colour ? part(side, 'wheel', 'adj', MARK) : null;
      const fx = can.fx ? dropdown(side, () => [st(e).attributes.effect_list || [], st(e).attributes.effect], x => call({effect: x})) : null;
      const sel = picks.map(id => [id, dropdown(side, () => [(st(id) || {attributes: {}}).attributes.options || [], (st(id) || {}).state], x => ctx.service('select', 'select_option', id, {option: x}))]);
      // A group Home Assistant knows the members of: each one under the controls, to open by itself.
      const mem = (Array.isArray(a0.entity_id) ? a0.entity_id : []).filter(st), chips = mem.length ? part(body.parentNode, 'pmem') : null;
      if (chips) { chips.innerHTML = mem.map(() => '<div class="mb" data-r="1"></div>').join(''); chips.onclick = ev => { const k = [...chips.children].indexOf(ev.target.closest('.mb')); if (k >= 0 && U.avail(mem[k])) HP.act(mem[k], ctx); }; }
      const place = () => {
        bri.firstChild.style.top = y(v.on ? v.bri : 0);
        // the mark sits on whichever of the two the light is using: the white bar or the colour wheel
        if (ct) { ct.firstChild.hidden = !v.white; ct.firstChild.style.top = y((v.k - lo) / (hi - lo) * 100); }
        if (wheel) { const g = v.h * Math.PI / 180, r = v.s / 2; wheel.firstChild.hidden = v.white && !!ct; wheel.firstChild.style.left = 50 + Math.sin(g) * r + '%'; wheel.firstChild.style.top = 50 - Math.cos(g) * r + '%'; }
      };
      drag(bri, (x, py) => { v.bri = Math.max(1, Math.round((1 - py) * 100)); v.on = true; place(); },
        (dx, dy) => { v.bri = clamp((v.on ? v.bri : 0) - dy * 5, 1, 100); v.on = true; place(); }, () => fade({brightness_pct: v.bri}));
      if (ct) drag(ct, (x, py) => { v.k = Math.round((hi - py * (hi - lo)) / 50) * 50; v.white = v.on = true; place(); },
        (dx, dy) => { v.k = clamp(v.k - dy * 250, lo, hi); v.white = v.on = true; place(); }, () => tune({color_temp_kelvin: v.k}));
      if (wheel) drag(wheel, (px, py) => { v.h = Math.round((Math.atan2(px - 0.5, 0.5 - py) * 180 / Math.PI + 360) % 360); v.s = Math.round(Math.min(1, Math.hypot(px - 0.5, py - 0.5) * 2) * 100); v.white = false; v.on = true; place(); },
        (dx, dy) => { v.h = (v.h + dx * 15 + 360) % 360; v.s = clamp(v.s - dy * 10, 0, 100); v.white = false; v.on = true; place(); }, () => tune({hs_color: [v.h, v.s]}));
      return () => {
        const s = st(e); if (!s) return 'Not found';
        const a = s.attributes, on = s.state === 'on', white = a.color_mode === 'color_temp' || !can.colour;
        if (![bri, ct, wheel].some(c => c && c.hpHold > performance.now())) {
          v.on = on; v.bri = a.brightness ? Math.round(a.brightness / 2.55) : 0; v.white = white;
          if (a.color_temp_kelvin) v.k = clamp(a.color_temp_kelvin, lo, hi);
          if (a.hs_color) { v.h = a.hs_color[0]; v.s = a.hs_color[1]; }
          place();
        }
        power.classList.toggle('lit', on);
        if (fx) fx.firstChild.textContent = on && a.effect && !NONE.test(a.effect) ? a.effect : 'Effect';  // some lights only play an effect once and never report one
        // a choice with nothing chosen shows what it is: "Preset" from select.strip_preset
        sel.forEach(([id, d]) => { const v = (st(id) || {}).state; d.firstChild.textContent = v && v !== 'unknown' && v !== 'unavailable' ? v : U.cap(id.split('_').pop()); });
        if (chips) mem.forEach((m, k) => { const c = chips.children[k], text = U.short(U.fname(m), U.fname(e)); if (c.textContent !== text) c.textContent = text; c.classList.toggle('go', U.active(m)); c.classList.toggle('off', !U.avail(m)); });
        // beside the level: the white a tunable light is at, or its colour as a hex code
        const more = !on ? '' : white && a.color_temp_kelvin ? a.color_temp_kelvin + 'K' : can.colour && a.rgb_color ? '#' + a.rgb_color.map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase() : '';
        return [U.stateLabel(e), more].filter(Boolean).join(' · ');
      };
    });
  }

  // Feature bit, service, label, the state it leads to. Home Assistant's own names for the modes.
  const ARM = [[2, 'arm_away', 'Arm away', 'armed_away'], [1, 'arm_home', 'Arm home', 'armed_home'], [4, 'arm_night', 'Arm night', 'armed_night'],
    [32, 'arm_vacation', 'Arm vacation', 'armed_vacation'], [16, 'arm_custom_bypass', 'Custom bypass', 'armed_custom_bypass'], [0, 'disarm', 'Disarm', 'disarmed']];
  /** The alarm Home Assistant already has, with a face: one button for each mode it offers. Disarming asks first;
   *  arming asks only for a code, and only where Home Assistant wants one to arm.
   *  shortcut: the PIN pad has digits only, an alarm or lock whose code has letters needs a keyboard here. */
  function alarmPop(e, ctx, name) {
    HP.pop.open(name, body => {
      const modes = ARM.filter(m => !m[0] || (st(e).attributes.supported_features & m[0])), box = part(body, 'modes');
      box.innerHTML = modes.map(m => `<div class="mb" data-r="1" data-s="${m[1]}">${m[2]}</div>`).join('');
      box.onclick = ev => {
        const b = ev.target.closest('[data-s]'), a = st(e).attributes; if (!b) return;
        const dis = b.dataset.s === 'disarm';
        guard(name, dis ? `This will disarm ${name}. Are you sure?` : null, !!a.code_format && (dis || a.code_arm_required !== false),
          code => ctx.service('alarm_control_panel', 'alarm_' + b.dataset.s, e, withCode(code)));
      };
      return () => { const s = st(e); if (!s) return 'Not found'; modes.forEach((m, k) => box.children[k].classList.toggle('go', s.state === m[3])); return U.stateLabel(e); };
    });
  }

  HP.tile('entity', {
    create(t, body, ctx, i) { i.p = U.card(body, t.icon || DOMAIN_ICON[(t.entity || '').split('.')[0]] || 'lightbulb'); },
    update(t, body, ctx, i) {
      U.set(i.p.n, t.name || U.fname(t.entity)); U.set(i.p.l, U.stateLabel(t.entity));
      i.el.classList.toggle('on', U.active(t.entity)); i.el.classList.toggle('off', !U.avail(t.entity));
      i.el.classList.toggle('alert', !!st(t.entity) && st(t.entity).state === 'triggered');
      lit(i.el, t.entity, i.lightState);
    },
    tap: (t, ctx) => U.avail(t.entity) ? () => HP.act(t.entity, ctx, t.name) : null,
  });
  HP.tile('alarm', HP.tiles.entity);
  /** Saves the lights of its room or floor, as they are now, as a scene. */
  HP.tile('savescene', {
    create(t, body, ctx, i) { i.p = U.card(body, t.icon || 'star'); U.set(i.p.n, t.name || 'Save scene'); },
    tap: t => t.scope ? () => HP.saveScene(t.scope) : null,
  });  // its own entry in the Studio; the alarm's face is the popup HP.act opens

  HP.tile('action', {
    create(t, body, ctx, i) { i.p = U.card(body, t.icon || 'star'); U.set(i.p.n, t.name || ''); U.set(i.p.l, t.label || ''); },
    update(t, body, ctx, i) { if ((t.entity || '').startsWith('scene.')) sceneLook(i.el, t.entity, i.lightState); },
    tap: (t, ctx) => () => { const [d, s] = t.service.split('.'); if (d === 'scene') HP.sceneMark(t.entity); ctx.service(d, s, t.entity, t.data); },
  });

  /** The scenes of a place in one button: it shows the scene in use, and a touch drops the list to set another.
   *  The button itself sets nothing. A scene saved later is in the list by itself. */
  HP.tile('scenes', {
    create(t, body, ctx, i) {
      body.innerHTML = `<div class="ic">${U.icon(t.icon || 'star')}</div><div class="tx"><div class="sel"><div class="n"></div><div class="arr"></div></div><div class="l"></div></div>`;
      i.p = {n: body.querySelector('.n'), l: body.querySelector('.l')};
    },
    update(t, body, ctx, i) {
      i.now = scenesIn(t.scope).find(HP.sceneActive) || null;
      U.set(i.p.n, i.now ? sceneName(i.now, t.scope) : 'Scenes'); U.set(i.p.l, t.name || '');
      sceneLook(i.el, i.now, i.lightState);
    },
    tap: (t, ctx, i) => () => HP.pop.menu(i.el, scenesIn(t.scope).map(e => [e, sceneName(e, t.scope)]), i.now, e => { HP.sceneMark(e); ctx.service('scene', 'turn_on', e); }),
  });

  HP.tile('nav', {
    create(t, body, ctx, i) { i.p = U.card(body, t.icon || 'home'); U.set(i.p.n, t.name || ''); U.set(i.p.l, t.label || ''); },
    tap: (t, ctx) => () => t.back ? ctx.back() : t.panel ? ctx.goPanel(t.panel) : ctx.go(t.page),
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
        if (!readOnly) el.addEventListener('click', () => { if (U.avail(it.entity)) HP.act(it.entity, ctx, it.label); });
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
        lit(c.el, e, i.lightState);
      }
    },
  });

  // The assistant's face on the dashboard: the orb is always there, calm while nothing happens, and it is where
  // the wake word, the listening, the thinking and the answer show (assist.js drives it). Tap to talk without the word.
  HP.tile('assistant', {
    create(t, body, ctx, i) {
      i.p = U.card(body, ''); i.el.classList.add('talking');
      U.set(i.p.n, t.name || ''); U.set(i.p.l, t.label || '');
      if (!HP.orb) return null;
      const canvas = document.createElement('canvas'), side = Math.floor(Math.min(i.w, i.h) * 0.92);  // a square that fits the button, whatever its shape
      canvas.style.width = canvas.style.height = side + 'px';
      i.p.ic.append(canvas);
      i.orb = HP.orb.create(canvas, {style: t.orb || 'ribbons'}); i.orb.start();
      return {destroy: () => { i.orb.destroy(); i.orb = null; }};
    },
    tap: t => () => HP.assist.start(t),
  });
})();
