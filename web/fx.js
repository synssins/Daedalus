'use strict';
// Overlays: a drawing layer over the whole dashboard, above the buttons. Vines that grow between the buttons
// over a week, frost creeping in on a cold night, fireflies after dusk. Each kind is a plugin registered with
// HP.fx.add(); the kinds live in the fx-*.js files. This file is the engine they share.
//
// What a kind gets:
//   - every button's rectangle, so it can follow the gaps and creep over edges
//   - "progress" from 0 to 1 for things that grow: worked out from the clock (start date and cycle length), never
//     from how long the screen has been on, so a panel that slept for a day wakes showing a day's growth
//   - a seed that is the same on every tablet and after every restart, so the same plant grows everywhere
//   - the house: night or day, sun height, weather, outdoor temperature, which buttons are on
//   - touches: a tap it may claim (a flower that closes), and touches it may only watch (fish that scatter)
//
// Two canvases. "Slow" kinds are redrawn only when something changes or every few minutes: almost free.
// "Live" kinds are redrawn a few times a second, and only while at least one is in use.
//
// A kind is HP.fx.add('name', {
//   label: 'Shown in the Studio',
//   grows: true,              // uses ctx.progress; the Studio then offers a cycle length and "start over"
//   days: 7,                  // default cycle length for a kind that grows
//   live: false,              // true = animated (redrawn at fps); false = slow layer
//   fps: 12,                  // for live kinds, at most 15
//   z: 0,                     // drawing order among live kinds: 0 scenery, 1 creatures, 2 the goose. Higher is drawn later, so in front,
//                             // whatever the order of the dashboard's list. Kinds with the same z keep the list's order.
//   options: [{key, label, type: 'range'|'select'|'bool', min, max, step, unit: 's'|'min' (shown after a range's value), choices: [[value, label]], default}],
//   create(ctx) -> state      // build whatever the kind needs to remember; called again when the layout changes
//   draw(g, state, ctx, t, dt)// g is a 2D canvas context in CSS pixels; t seconds since start, dt since last frame
//   tap(state, x, y, ctx)     // optional; return true to claim the tap (the button underneath does not get it)
//   touch(state, x, y, ctx)   // optional; a finger went down here (not claimed)
//   drag(state, x, y, ctx)    // optional; a finger is moving here
//   press(state, rect, ctx)   // optional; the button with this rectangle was pressed
//   swipe(state, dir, ctx)    // optional; the screen starts to slide to another dashboard (dir -1 = to the left, 1 = right)
//   restore(state, ctx)       // optional; the screen was double-tapped: put back at once every real tile this kind took, hid or cut
//   covers: true,             // it can lie over a tile's face: its layer fades for a few seconds when a tile is tapped
// });
// ctx: {w, h, rects: [{x, y, w, h, r, on, flat, type, el, tile}], gaps: [{x1, y1, x2, y2}], env, opts, seed, progress, days,
//       rand() (seeded), util, redraw(), page, pages}
// rects[i].el is the tile's own element and rects[i].tile its settings: for the rare kind that moves a real tile.
// ctx.page names the dashboard on screen and ctx.pages every dashboard this device has, for kinds that roam.
//   actors(state, ctx)        // optional; things this kind has on the dashboard, as a list of actors (see below). For kinds that
//                             // are not live, or whose things stand still. The engine asks every frame, so keep the list ready.
//
// ---------- how kinds meet each other ----------
// ctx.scene is shared by every kind on the dashboard. Each frame, every kind says what it has there; one frame later
// every other kind can read it. Nobody needs to know which kinds exist: they go by tags and by verbs.
//
// An actor: {kind: 'sheep', tags: ['creature', 'animal'], x, y, h, dir, ...verbs}
//   x, y   where it stands (its feet, or its middle for something that hangs); h its height; dir -1 or 1 if it faces a way
//   tags   what it is to others. Use these words, several at once if they fit:
//            creature  it moves about by itself        person   a figure on two legs       animal  on four, or a bird
//            threat    others run from it              wonder   others stop and look at it
//            trap      it can take hold of a creature  trapped  it is held and wants help
//            food      it can be eaten or stolen       vehicle  it travels a track, may be ridden
//            prop      it stands where it was put      light    it glows
//            guard     it drives threats away          station  a place where a vehicle stops and creatures wait
//          An actor without tags gets them from its kind (the table KIND_TAGS below), so older kinds still fit in.
//   hid    true while it is out of sight (behind a tile, hanging off an edge): others leave it alone
//   verbs  functions others may call. Offer only what the thing can really do; callers must cope with a missing one.
//            pet(by)          someone strokes it                    by = {x, y}
//            take(by)         something is taken from it (a carrot); true if it was there to take
//            grab(by), drag(x, y), drop()    it is seized, hauled about, and let go (the goose and a train)
//            trap(by)         it takes hold of the creature at by = {x, y}; true if it did
//            free()           whatever it holds is let go
//            rescue(by)       on a "trapped" actor: someone has come and pulled; true once it is free
//            paint(g)         draw yourself now: called by the one you hold, so that you are in front of it
//            scare(by)        on a creature: it is frightened off from by = {x, y}; true if it fled
//            carry(by)        on a creature: it is taken out of sight toward by = {x, y, secs, out: {x, y}} and comes back by
//                             itself after secs seconds, at out if given; true if it went. The creature's own kind draws its going.
//            board(rider)     on a vehicle standing at a station: rider = {alight(x, y)} gets on; true if there was room.
//                             The vehicle calls rider.alight(x, y) at the station where the rider gets off.
//   more fields, for the tags that need them:
//            station   x1, x2 the ends of the platform, y its level (where feet stand); train: the vehicle standing there, or null
//            vehicle   stopped: true while it stands at a station; vx its speed along the screen, signed
//            trapped   rescue (the verb above)
// To say what you have: ctx.scene.next.push(actor) while drawing (live kinds), or return the list from actors().
// To read: ctx.scene.all('wonder'), ctx.scene.near('trap', x, y, 300), or ctx.scene.actors for the whole list.
// To call a verb safely: ctx.util.act(actor, 'pet', {x, y}). It returns undefined when the verb is not offered.
// To draw in front of every kind this frame (the jaws over the head they hold): ctx.scene.over.push(g => {...}).
// ctx.env: {night, elevation (sun, degrees), weather ('rainy', 'snowy', 'clear-night', ...), temp (outdoor, in the
//           house's own unit), cold (true at or below freezing), month (1-12), date: Date}
(() => {
  window.HP = window.HP || {};
  const kinds = {};

  // ---------- helpers every kind may use ----------
  const U = {
    /** Seeded random numbers: same seed, same sequence, on every device. */
    rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
    hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; },
    clamp: (v, a, b) => v < a ? a : v > b ? b : v,
    /** Call a verb on another kind's actor. Undefined if it does not offer that verb, or if the verb fails. */
    act(o, verb, a, b) { try { if (o && typeof o[verb] === 'function') return o[verb](a, b); } catch (e) {} },
    lerp: (a, b, t) => a + (b - a) * t,
    /** 0 before a, 1 after b, smooth between: for "this part appears between 30% and 60% of the cycle". */
    span: (p, a, b) => { const x = p <= a ? 0 : p >= b ? 1 : (p - a) / (b - a); return x * x * (3 - 2 * x); },
    /** Smooth wandering value in -1..1 for position x; same seed, same curve. */
    noise(seed) { const r = U.rng(seed), v = []; for (let i = 0; i < 256; i++) v.push(r() * 2 - 1); return x => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return v[i & 255] + (v[(i + 1) & 255] - v[i & 255]) * s; }; },
    /** A rounded rectangle path, grown (positive) or shrunk (negative) by d pixels. */
    box(g, r, d) {
      d = d || 0; const x = r.x - d, y = r.y - d, w = r.w + 2 * d, h = r.h + 2 * d, rr = Math.max(0, Math.min((r.r || 0) + d, w / 2, h / 2));
      g.beginPath(); g.moveTo(x + rr, y); g.arcTo(x + w, y, x + w, y + h, rr); g.arcTo(x + w, y + h, x, y + h, rr); g.arcTo(x, y + h, x, y, rr); g.arcTo(x, y, x + w, y, rr); g.closePath();
    },
    /** Points along a rectangle's edge, clockwise from the top-left corner, d pixels outside it, about step apart. */
    around(r, d, step) {
      const x = r.x - d, y = r.y - d, w = r.w + 2 * d, h = r.h + 2 * d, out = [], n = (len) => Math.max(1, Math.round(len / step));
      for (let i = 0, k = n(w); i < k; i++) out.push({x: x + w * i / k, y, side: 0});
      for (let i = 0, k = n(h); i < k; i++) out.push({x: x + w, y: y + h * i / k, side: 1});
      for (let i = 0, k = n(w); i < k; i++) out.push({x: x + w - w * i / k, y: y + h, side: 2});
      for (let i = 0, k = n(h); i < k; i++) out.push({x, y: y + h - h * i / k, side: 3});
      return out;
    },
    /** Is the point inside any button? Returns the rectangle or null. */
    over(rects, x, y, d) { d = d || 0; for (const r of rects) if (!r.hidden && x >= r.x - d && x <= r.x + r.w + d && y >= r.y - d && y <= r.y + r.h + d) return r; return null; },
  };

  /** The channels between buttons: a centre line for every gap between two neighbours, plus the screen's own edges.
   *  Things that travel "between the buttons" (stems, fish, pulses, ants) follow these. */
  function gapLines(rects, w, h) {
    const out = [], vis = rects.filter(r => !r.hidden && !r.flat), near = 40;
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i], b = vis[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (oy > 12) {  // side by side
        const l = a.x < b.x ? a : b, r = l === a ? b : a, gap = r.x - (l.x + l.w);
        if (gap >= 0 && gap < near) { const x = l.x + l.w + gap / 2, y1 = Math.max(a.y, b.y), y2 = Math.min(a.y + a.h, b.y + b.h); out.push({x1: x, y1, x2: x, y2, vertical: true}); }
      }
      if (ox > 12) {  // one above the other
        const t = a.y < b.y ? a : b, u = t === a ? b : a, gap = u.y - (t.y + t.h);
        if (gap >= 0 && gap < near) { const y = t.y + t.h + gap / 2, x1 = Math.max(a.x, b.x), x2 = Math.min(a.x + a.w, b.x + b.w); out.push({x1, y1: y, x2, y2: y, vertical: false}); }
      }
    }
    return out;
  }

  // ---------- the engine ----------
  let host = null, slow = null, live = null, items = [], rects = [], gaps = [], env = {date: new Date(), month: new Date().getMonth() + 1}, preview = null;
  // what an actor is taken for when it does not say: the kinds that were here before there were tags
  const KIND_TAGS = {goose: ['creature', 'animal', 'threat'], stick: ['creature', 'person'], walker: ['creature', 'person'], sheep: ['creature', 'animal'],
    train: ['vehicle'], snowman: ['prop', 'food']};
  const NONE = [];
  const scene = {actors: [], next: [], over: [],
    /** Everyone with this tag, out of what was posted in the frame before. */
    all(tag) { return scene.actors.filter(a => a.tags.indexOf(tag) >= 0 && !a.hid); },
    /** The nearest with this tag within r pixels (not `not`), or null. */
    near(tag, x, y, r, not) { let best = null, bd = r == null ? 1e9 : r; for (const a of scene.actors) if (a !== not && !a.hid && a.tags.indexOf(tag) >= 0) { const d = Math.hypot(a.x - x, a.y - y); if (d < bd) { bd = d; best = a; } } return best; }};
  let W = 0, H = 0, raf = 0, last = 0, t0 = performance.now(), slowTimer = 0, config = [], key = '', pages = [];

  // Weather as people say it, each covering several of Home Assistant's states.
  const WEATHER = {clear: ['sunny', 'clear-night'], cloudy: ['cloudy', 'partlycloudy'], rain: ['rainy', 'pouring', 'lightning', 'lightning-rainy', 'hail'],
    snow: ['snowy', 'snowy-rainy'], fog: ['fog'], wind: ['windy', 'windy-variant']};
  /** Does this overlay's "when" fit today: weekdays, a span of dates (month-day, may wrap the new year), weather. */
  function fits(c) {
    const w = c.when; if (!w || HP.preview) return true;  // the Studio shows what is being edited whatever the day
    const d = new Date(), md = ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    if (w.days && w.days.length && w.days.indexOf(d.getDay()) < 0) return false;
    if (w.from && w.to && !(w.from <= w.to ? md >= w.from && md <= w.to : md >= w.from || md <= w.to)) return false;
    if (w.weather && w.weather.length && !w.weather.some(k => (WEATHER[k] || []).indexOf(env.weather) >= 0)) return false;
    return true;
  }

  function canvases() {
    if (host) return;
    host = document.getElementById('fx') || document.body.appendChild(Object.assign(document.createElement('div'), {id: 'fx'}));
    host.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:3';
    const make = () => { const c = document.createElement('canvas'); c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%'; host.append(c); return c; };
    slow = make(); live = make();
    // A tap goes to an overlay first if one claims it (a flower); otherwise to the button as usual.
    // A double tap anywhere is "give me my screen back": every kind that took, hid or cut a real tile undoes it now.
    let lastTap = 0, lastX = 0, lastY = 0;
    document.addEventListener('click', e => {
      const now = performance.now(), twice = now - lastTap < 420 && Math.hypot(e.clientX - lastX, e.clientY - lastY) < 70;
      lastTap = twice ? 0 : now; lastX = e.clientX; lastY = e.clientY;
      if (twice) items.forEach(it => { if (it.def.restore) { try { it.def.restore(it.st, it.ctx); } catch (err) { fail(it.kind, err); } } });
    }, true);
    document.addEventListener('click', e => { for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; if (it.def.tap && it.def.tap(it.st, e.clientX, e.clientY, it.ctx) === true) { e.stopPropagation(); e.preventDefault(); redraw(); return; } }
      if (U.over(rects, e.clientX, e.clientY)) giveWay(); }, true);
    let down = false;
    document.addEventListener('pointerdown', e => { down = true; items.forEach(it => { if (it.def.touch) it.def.touch(it.st, e.clientX, e.clientY, it.ctx); }); });
    document.addEventListener('pointermove', e => { if (down) items.forEach(it => { if (it.def.drag) it.def.drag(it.st, e.clientX, e.clientY, it.ctx); }); });
    document.addEventListener('pointerup', () => { down = false; }); document.addEventListener('pointercancel', () => { down = false; });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { redraw(); loop(); } });
  }
  /** A tile was tapped: whatever may lie over the tiles steps back for a few seconds, so the tile can be read and used. */
  let wayTimer = 0;
  function giveWay() {
    const fade = (c, isLive) => { if (c && items.some(it => it.def.covers && !!it.def.live === isLive)) { c.style.transition = 'opacity .25s'; c.style.opacity = '0.12'; } };
    fade(slow, false); fade(live, true);
    clearTimeout(wayTimer); wayTimer = setTimeout(() => { [slow, live].forEach(c => { if (c) { c.style.transition = 'opacity 1.2s'; c.style.opacity = ''; } }); }, 4000);
  }
  function size(c, dpr) {
    const w = Math.round(W * dpr), h = Math.round(H * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); return g;
  }
  /** How far a growing kind is through its cycle, from the clock. */
  function progressOf(def, opts) {
    if (preview != null) return preview;
    const days = +opts.days || def.days || 7, start = opts.start ? Date.parse(opts.start) : Date.UTC(2026, 0, 5);  // no start date given: cycles are counted from a fixed Monday
    let p = (Date.now() - start) / (days * 864e5);
    if (p < 0) p = 0;
    return opts.loop === 'stay' ? Math.min(1, p) : p - Math.floor(p);
  }
  function build() {
    items.forEach(it => { if (it.def.restore) { try { it.def.restore(it.st, it.ctx); } catch (e) { fail(it.kind, e); } } });  // a kind that goes gives back the tiles it took, hid or cut
    items = []; scene.actors = []; scene.next = []; scene.over.length = 0;
    if (!W) return;
    config.forEach((c, n) => {
      const def = kinds[c.kind]; if (!def) return;
      const opts = {}; (def.options || []).forEach(o => { opts[o.key] = o.default; }); Object.assign(opts, c);
      if (HP.fx.demo) opts.now = 1;  // the Studio's Preview: kinds that wait (a goose's visit, the tank battle) start at once
      const seed = U.hash(key + '/' + c.kind + '/' + n + '/' + (opts.start || ''));
      const ctx = {w: W, h: H, rects, gaps, env, opts, seed, scene, util: U, rand: U.rng(seed), redraw, page: key, pages, progress: def.grows ? progressOf(def, opts) : 1, days: +opts.days || def.days || 7};
      let st = null; try { st = def.create ? def.create(ctx) : {}; } catch (e) { fail(c.kind, e); return; }
      items.push({def, ctx, st, kind: c.kind});
    });
    items.sort((a, b) => (a.def.z || 0) - (b.def.z || 0));
    redraw(); loop();
  }
  function fail(kind, e) { console.error('overlay ' + kind + ': ' + e.message); if (HP.report && !fail[kind]) { fail[kind] = 1; HP.report('overlay ' + kind + ' failed: ' + e.message); } }
  function drawSlow() {
    slowTimer = 0;
    if (!slow) return;
    const g = size(slow, Math.min(window.devicePixelRatio || 1, 1.5)), t = (performance.now() - t0) / 1000;
    for (const it of items) if (!it.def.live) {
      if (it.def.grows) it.ctx.progress = progressOf(it.def, it.ctx.opts);
      g.save(); try { it.def.draw(g, it.st, it.ctx, t, 0); } catch (e) { fail(it.kind, e); } g.restore();
    }
  }
  /** Ask for the slow layer to be drawn again soon (several requests in a row become one drawing). */
  function redraw() { if (!slowTimer) slowTimer = setTimeout(drawSlow, 30); }
  function loop() {
    if (raf || document.hidden) return;
    const lives = items.filter(it => it.def.live);
    if (!lives.length) { if (live) size(live, 1); return; }
    const gapMs = 1000 / Math.min(15, Math.max(...lives.map(it => it.def.fps || 12)));
    const frame = ts => {
      raf = 0;
      if (document.hidden || !items.some(it => it.def.live)) { if (live) size(live, 1); return; }
      raf = requestAnimationFrame(frame);
      if (ts - last < gapMs - 3) return;
      const dt = Math.min(0.25, (ts - last) / 1000) || 0; last = ts;
      const g = size(live, 1), t = (ts - t0) / 1000;
      scene.actors = scene.next; scene.next = [];
      for (const it of items) if (it.def.actors) { try { for (const a of it.def.actors(it.st, it.ctx) || NONE) scene.actors.push(a); } catch (e) { fail(it.kind, e); } }
      for (const a of scene.actors) if (!a.tags) a.tags = KIND_TAGS[a.kind] || NONE;
      for (const it of items) if (it.def.live) {
        if (it.def.grows) it.ctx.progress = progressOf(it.def, it.ctx.opts);
        g.save(); try { it.def.draw(g, it.st, it.ctx, t, dt); } catch (e) { fail(it.kind, e); } g.restore();
      }
      for (const f of scene.over) { g.save(); try { f(g); } catch (e) {} g.restore(); }
      scene.over.length = 0;
    };
    raf = requestAnimationFrame(frame);
  }
  setInterval(redraw, 180000);  // growth is slow: a fresh drawing every three minutes is plenty

  HP.fx = {
    kinds, util: U,
    add(name, def) { kinds[name] = def; },
    /** Which overlays this dashboard has: [{kind, ...options}]. seedKey makes each dashboard's plants its own. */
    use(list, seedKey, wait, all) { canvases(); config = (list || []).filter(c => c && kinds[c.kind]); key = seedKey || ''; pages = all || [key]; if (!wait) build(); },  // wait: a layout() follows at once and builds
    /** Today's overlays: the panel's own, plus what its playlist plays today. A playlist shows all its overlays,
     *  or one per day or week: in turn, or picked from the date so that every tablet picks the same one. */
    pick(own, pl) {
      const out = (own || []).filter(fits);
      if (pl && pl.items) {
        const it = pl.items.filter(fits), d = new Date(), day = Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5), n = /week/.test(pl.mode) ? Math.floor((day + 3) / 7) : day;
        if (!pl.mode || pl.mode === 'all') out.push(...it);
        else if (it.length) out.push(it[(/^rand/.test(pl.mode) ? U.hash((pl.id || '') + n) : n) % it.length]);
      }
      return out;
    },
    weather: WEATHER,
    /** The buttons' rectangles, after every layout. */
    layout(list) {
      canvases(); W = window.innerWidth; H = window.innerHeight;
      rects = list; gaps = gapLines(rects, W, H); build();
    },
    /** Which buttons are on right now, in the same order as the rectangles. */
    lights(flags) { let ch = false; rects.forEach((r, i) => { if (r.on !== !!flags[i]) { r.on = !!flags[i]; ch = true; } }); if (ch) redraw(); },
    env(e) { let ch = false; for (const k in e) if (env[k] !== e[k]) { env[k] = e[k]; if (k !== 'date') ch = true; } if (ch) redraw(); },
    press(i) { const r = rects[i]; if (r) items.forEach(it => { if (it.def.press) it.def.press(it.st, r, it.ctx); }); },
    /** The screen starts to slide sideways to another dashboard. */
    swipe(dir) { items.forEach(it => { if (it.def.swipe) { try { it.def.swipe(it.st, dir, it.ctx); } catch (e) { fail(it.kind, e); } } }); },
    /** The Studio's preview: show a growing overlay at this point of its cycle (0 to 1), or null for the real clock. */
    preview(p) { preview = p; items.forEach(it => { if (it.def.grows) it.ctx.progress = progressOf(it.def, it.ctx.opts); }); redraw(); },
    get count() { return items.length; },
    /** Everything on the dashboard right now: the same object every kind gets as ctx.scene. For tests and tools. */
    get scene() { return scene; },
  };
  /** Sunlight under water, for the koi pond and the coral reef: slanted beams from the surface and wavering
   *  patches of light on the seabed. Both kinds call it; it draws once a frame. */
  HP.fx.rays = (g, w, h, t) => {
    if (HP.fx.rays.t === t) return; HP.fx.rays.t = t;
    g.save();
    for (let i = 0; i < 7; i++) {
      const x = w * (0.08 + i * 0.14) + Math.sin(t * 0.13 + i * 1.7) * 40, wd = 26 + 22 * Math.sin(i * 2.3) ** 2, a = 0.07 + 0.07 * (0.5 + 0.5 * Math.sin(t * 0.4 + i * 2.1)), lean = h * 0.22;
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `rgba(255,250,210,${a.toFixed(3)})`); gr.addColorStop(1, 'rgba(160,230,255,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + wd, 0); g.lineTo(x + wd * 2.6 - lean, h); g.lineTo(x - wd * 1.2 - lean, h); g.closePath(); g.fill();
    }
    for (let i = 0; i < 14; i++) {
      const x = (i * 97 + Math.sin(t * 0.5 + i) * 30 + t * 6) % (w + 120) - 60, a = 0.11 + 0.07 * Math.sin(t * 0.9 + i * 2);
      g.fillStyle = `rgba(210,245,255,${Math.max(0, a).toFixed(3)})`; g.beginPath(); g.ellipse(x, h - 14 - (i % 4) * 16, 46 + 20 * Math.sin(t * 0.7 + i * 1.3), 5, 0, 0, 6.2832); g.fill();
    }
    g.restore();
  };
})();
