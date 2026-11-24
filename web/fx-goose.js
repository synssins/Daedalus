'use strict';
// Goose: now and then a white goose waddles in, honks at a tile, tugs it loose and shoves it off the screen
// to another dashboard. Swipe through the dashboards to find it sitting on its loot; tap it and it flaps off in a
// panic and the tile is back where it belongs. Sometimes it lays an egg: tap the egg in time, or a gosling hatches
// and grows into one more goose (four at most; the extra ones fly away again after half an hour).
// The goose is never friendly. It glares, hisses at whatever comes near (other overlays' creatures, a finger), and
// chases stick figures, sheep and walkers across the dashboard. It tells the other kinds where it is through
// ctx.scene and never offers them a "pet" function: nobody strokes the goose.
//
// This is the one overlay that moves a real tile, so these rules are requirements, not style. They hold for every
// goose and every tile separately:
//   - A taken tile comes back by itself when its time is up (the "Keeps a tile for" option, one minute unless
//     changed), counted from when it was taken, caught or not. The deadline is checked in
//     every frame, in create() (a dashboard shown after the deadline shows its tile at once) and by a timer of its
//     own that holds the element, so it still comes back if the overlay is switched off meanwhile.
//   - A dashboard rebuilt while its tile is taken gets fresh elements: the fresh one is hidden again until the deadline.
//     A dashboard whose tile is not taken (any more) has that tile's styles cleared in create().
//   - Never taken: text-only (flat) or hidden tiles; camera, nav, assistant, alerts, clock, weather, label and image
//     tiles; anything holding a lock, alarm, cover, climate or camera entity, directly or in its items.
//     If nothing qualifies the goose just walks through, honks and leaves.
//   - One tile per goose, no tile for two geese, and never so many that fewer than half of a dashboard's takeable
//     tiles would remain. What the geese are up to lives in one object in this file (the engine builds a kind's
//     state again on every dashboard change), saved under hp:goose so it survives a restart.
//   - Every touch of a real element is inside try/catch. An overlay failing must never leave a tile hidden.
//   - A double tap anywhere on the screen (the engine's restore hook) gives every tile back at once.
// It also derails trains: a train posted by another kind may be grabbed, dragged off and dropped. Those calls go
// to someone else's code, so each is checked and wrapped, and a grabbed train is always dropped again, whatever
// interrupts the goose.
(() => {
  const U = HP.fx.util, KEY = 'hp:goose', MAX = 4;
  // milliseconds: how long a tile stays away, when the extra geese leave, an egg's time to hatch, a gosling's to grow up
  let HOLD = 0, RESET = 30 * 60000, EGG = 30000, GROW = 60000;  // HOLD: only the self-check sets it; otherwise the option decides
  const STICK = [20000, 45000, 60000, 120000];  // with stick figures about: first visit after 20 to 45 s, then every 60 to 120 s
  const hold = () => HOLD || (+(cur && cur.opts.keep) || 60) * 1000;
  const BAN_TYPE = ['camera', 'nav', 'assistant', 'alerts', 'clock', 'weather', 'label', 'image'];
  const BAN_ENTITY = /^(lock|alarm_control_panel|cover|climate|camera)\./;
  const EVERY = {often: 2, sometimes: 15, rarely: 60};  // minutes between one goose's visits, roughly

  // ---------- what the geese are up to (survives dashboard changes and restarts) ----------
  // S = {geese, egg: {page, x, y, at} or null, hatched (when the last egg hatched), stamp (when saved)}
  // a goose = {phase: 'away'|'hiding'|'chick', next (when it visits again), taken, due (when the tile comes back),
  //   page + idx (the tile), name, w, h, r, cx, cy (the tile, for the stand-in), hide (dashboard it hides on), hx, hy,
  //   bounce, and for a gosling: at (dashboard), ax, ay, born}
  // goose._ is what is only true right now and is not saved: {V (the goose walking about on screen), held (the
  //   element that is styled away), timer, A (pose), pop, ...}
  const one = () => ({phase: 'away', taken: false, _: {A: {}}});
  let S = {geese: [one()], egg: null, hatched: 0};
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.geese) && s.geese.length) S = s; } catch (e) {}
  if (!(Date.now() - S.stamp < RESET)) { S.geese.length = 1; S.egg = null; }  // an old state: back to one goose
  S.geese.forEach(q => { q._ = {A: {}}; if (q.phase !== 'chick' && (q.phase !== 'hiding' || !q.taken)) { q.phase = 'away'; q.taken = false; } });  // restarted in the middle of a visit: the tile's element is new and untouched
  if (S.geese[0].phase === 'chick') S.geese[0].phase = 'away';
  const save = () => { try { S.stamp = Date.now(); localStorage.setItem(KEY, JSON.stringify(Object.assign({}, S, {geese: S.geese.filter(q => !q.gone)}), (k, v) => k === '_' ? undefined : v)); } catch (e) {} };

  let cur = null;     // the dashboard on screen (latest ctx)
  let hurry = 0, lastT = -1, forced = false, label = {};
  const bits = [];    // feathers and shell

  const style = (el, o) => { try { Object.assign(el.style, o); } catch (e) {} };
  /** Put a tile's element back exactly as it was: every style this file sets, cleared. */
  function restore(el, bounce) {
    try { const s = el.style; s.transform = ''; s.visibility = ''; s.zIndex = ''; s.pointerEvents = ''; s.transition = ''; if (HP.cut) HP.cut(); } catch (e) {}
    // the drop-in bounce is an animation, not a style, so it leaves nothing behind
    if (bounce) try { el.animate([{transform: 'translateY(-34px) scale(1.05)'}, {transform: 'translateY(0)'}, {transform: 'translateY(-9px)'}, {transform: 'none'}], {duration: 420, easing: 'ease-out'}); } catch (e) {}
  }
  const nameOf = r => String((r.tile && (r.tile.name || r.tile.type)) || '');
  /** May a goose take this tile? Anything that guards the house, shows a picture or is not a plain tile: no. */
  function allowed(r) {
    const t = r && r.tile;
    if (!r || !t || !r.el || r.flat || r.hidden) return false;
    if (BAN_TYPE.indexOf(t.type) >= 0 || BAN_TYPE.indexOf(r.type) >= 0) return false;
    if (BAN_ENTITY.test(String(t.entity || ''))) return false;
    if (Array.isArray(t.items) && t.items.some(it => it && BAN_ENTITY.test(String(it.entity || '')))) return false;
    return true;
  }
  /** Which tiles goose q may take here: not one another goose has or is after, and at least half of the
   *  takeable tiles must be left on the dashboard afterwards. */
  function takeable(rects, q, page) {
    const busy = {}, ok = []; let away = 0, n = 0;
    S.geese.forEach(o => { if (o === q) return; const v = o._.V;
      if (o.taken && o.page === page) { busy[o.idx] = 1; away++; } else if (v && v.i >= 0 && /enter|look|honk|lay|tug|drag|chase|gloat|back|train/.test(v.mode) && !(v.back && v.back.mode === 'exit')) { busy[v.i] = 1; away++; } });
    rects.forEach((r, i) => { if (allowed(r)) { n++; if (!busy[i]) ok.push(i); } });
    return n - away - 1 >= n / 2 ? ok : [];
  }
  function pick(rects, q, page) { const ok = takeable(rects, q, page); return ok.length ? ok[Math.floor(Math.random() * ok.length)] : -1; }
  const mean = () => (EVERY[cur && cur.opts.every] || 15) * 60000;
  function schedule(q) { q.next = Date.now() + mean() * (0.6 + 0.8 * Math.random()); }
  function arm(q) { clearTimeout(q._.timer); q._.timer = setTimeout(() => { if (q.taken && Date.now() >= q.due) release(q); }, Math.max(0, q.due - Date.now()) + 60); }
  S.geese.forEach(q => { if (q.taken) arm(q); });  // restarted while a tile was away: the deadline still stands
  const lootSize = q => [Math.min(220, (q.w || 150) * 0.6), Math.min(160, (q.h || 100) * 0.6)];

  /** Give goose q's tile back, whatever it was doing: deadline, caught, dropped, or anything that went wrong. */
  function release(q) {
    const e = q._; clearTimeout(e.timer);
    const here = !!cur && q.page === cur.page, r = here ? cur.rects[q.idx] : null;
    if (e.held) restore(e.held, here);
    if (r && r.el && r.el !== e.held) restore(r.el, true);
    e.held = null; q.taken = false;
    q.bounce = !here;           // not on screen: it drops in when its dashboard is shown
    if (here) q.page = null;
    if (q.phase === 'hiding' && cur && q.hide === cur.page && q.hx != null && !e.V) {  // the goose is on screen: off it goes
      const s = lootSize(q);
      e.V = {mode: 'flee', page: cur.page, x: q.hx, y: q.hy - s[1] / 2 + 8, f: q.hx < cur.w / 2 ? 1 : -1, i: -1, T: 0};
      e.pop = {x: q.hx, y: q.hy, t: 0.35};
    }
    if (e.V && e.V.mode === 'drag') { e.V.mode = 'runoff'; e.V.f = -e.V.d; e.V.el = null; }
    q.phase = 'away'; schedule(q); save();
  }
  /** Forget everything (the test options start from here). */
  function reset() {
    S.geese.forEach(q => { const e = q._; dropTrain(q); if (e.V && e.V.el) restore(e.V.el); e.V = null; if (q.taken) release(q); if (e.held) restore(e.held); clearTimeout(e.timer); });
    S = {geese: [one()], egg: null, hatched: 0}; bits.length = 0;
  }
  /** Half an hour after the last egg hatched the extra geese fly away, each giving back what it has. */
  function flyOff() {
    S.geese.forEach((q, i) => { if (!i) return; const e = q._;
      dropTrain(q);
      if (e.V && e.V.el && !q.taken) restore(e.V.el);
      if (q.taken) release(q);
      if (e.V) { e.V.mode = 'flee'; e.V.el = null; }
      else if (q.phase === 'chick' && cur && q.at === cur.page) e.V = {mode: 'flee', page: cur.page, x: q.ax, y: q.ay, f: 1, i: -1, T: 0};
      q.gone = true; });
    save();
  }

  // ---------- the goose itself: a plain white farmyard goose as a flat cartoon, seen a little from above ----------
  // Drawn with paths every frame (about 16 of them) from one pose: where the head is, how far the beak and wings are
  // open, sitting or not. The pose on screen eases toward the wanted one, so it moves fluidly at 12 frames a second.
  const WHITE = '#ffffff', SHADE = '#dce3ed', LINE = 'rgba(60,80,115,.4)', BEAK = '#f59a23', BEAK2 = '#dd7f18', INK = '#2b3145';
  const FONT = '"Arial Rounded MT Bold", "Avenir Next", system-ui, sans-serif';
  const mix = (a, b, k) => 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join() + ')';  // a gosling's down, fading to white
  const STAND = {nx: 27, ny: -78, ha: 0, beak: 0, sit: 0, wing: 0, eye: 0, hf: 1};
  const POSE = {
    stand: {}, peek: {nx: 37, ny: -71, ha: 0.25}, honk: {nx: 38, ny: -80, ha: -0.5, beak: 1},
    reach: {nx: 44, ny: -58, ha: 0.25, beak: 0.4}, grip: {nx: 50, ny: -38, ha: 0.45, beak: 0.5},
    sit: {sit: 1}, sithonk: {sit: 1, nx: 38, ny: -80, ha: -0.5, beak: 1},
    flap: {nx: 36, ny: -70, ha: -0.2, beak: 1, wing: 1},
    // it is always cross: head low and forward, wings half up
    glare: {nx: 42, ny: -60, ha: 0.12, wing: 0.22}, hiss: {nx: 49, ny: -52, ha: 0.05, beak: 1, wing: 0.4},
    sitglare: {sit: 1, nx: 42, ny: -60, ha: 0.12, wing: 0.22}, sithiss: {sit: 1, nx: 49, ny: -52, ha: 0.05, beak: 1, wing: 0.4},
    charge: {nx: 60, ny: -43, ha: 0.05, beak: 1, wing: 0.75}, peck: {nx: 63, ny: -20, ha: 0.75, beak: 0.5, wing: 0.5},
    tall: {nx: 22, ny: -89, ha: -0.4, beak: 1, wing: 0.3},
  };
  /** Draw a goose standing on (x, y), facing f (1 right, -1 left). A is its pose on screen now. walk: 0 standing,
   *  1 walking, more = faster. look: {sc (size), chick (0 to 1, how much of a gosling), wig (wiggle), hiss (lines from the beak), stamp (a foot)}. */
  function goose(g, A, x, y, f, name, t, dt, walk, look) {
    const want = Object.assign({}, STAND, POSE[name]), k = 1 - Math.exp(-dt * 12), sc = (look && look.sc) || 1, ch = (look && look.chick) || 0;
    if (A.nx == null) Object.assign(A, want, {face: f, walk: 0, ph: 0});
    for (const key in want) A[key] += (want[key] - A[key]) * k;
    A.face += (f - A.face) * k; A.walk += (walk - A.walk) * k; A.ph += dt * 9 * walk;
    const amp = Math.min(1, A.walk), s = Math.sin(A.ph), bob = Math.abs(s) * 2.5 * amp, flip = v => v >= 0 ? Math.max(0.08, v) : Math.min(-0.08, v);
    const body = ch ? mix([255, 255, 255], [240, 220, 120], ch) : WHITE, shade = ch ? mix([220, 227, 237], [178, 170, 132], ch) : SHADE;
    g.save(); g.translate(x, y); g.scale(sc, sc); g.lineCap = 'round'; g.lineJoin = 'round';
    g.fillStyle = 'rgba(10,14,30,' + (0.24 * (1 - Math.max(0, A.wing - 0.8) * 5)).toFixed(3) + ')'; g.beginPath(); g.ellipse(0, 1, 31, 8, 0, 0, 6.3); g.fill();  // it stands on the dashboard
    g.scale(flip(A.face), 1);  // turning round squeezes it through its own middle
    if (A.sit < 0.6) {
      // the far foot is drawn a little higher up the screen: that is what shows the ground from above
      const leg = (hx, hy, off, depth, col) => {
        const ax = hx + Math.sin(A.ph + off) * 11 * amp, ay = depth - Math.max(0, Math.cos(A.ph + off)) * 6 * amp - (!off && look && look.stamp ? Math.max(0, Math.sin(t * 15)) * 8 : 0);
        g.strokeStyle = g.fillStyle = col; g.lineWidth = 4; g.beginPath(); g.moveTo(hx, hy); g.lineTo(ax, ay - 2); g.stroke();
        g.beginPath(); g.moveTo(ax - 4, ay - 2); g.quadraticCurveTo(ax + 5, ay - 7, ax + 14, ay - 3); g.lineTo(ax + 15, ay + 2); g.quadraticCurveTo(ax + 4, ay + 4, ax - 4, ay - 2); g.fill();
      };
      leg(-8, -24, Math.PI, -6, BEAK2); leg(6, -22, 0, 1, BEAK);
    }
    // the waddle: the body rocks over the feet
    g.translate(0, A.sit * 16 - bob - 30); g.rotate(s * 0.07 * amp + (look && look.wig ? Math.sin(t * 22) * 0.07 * look.wig : 0)); g.translate(0, 30);
    const wing = (ox, oy, ang, ws, fill, mirror) => {
      g.save(); g.translate(ox, oy); g.scale(mirror ? -ws : ws, ws); g.rotate(ang);
      g.beginPath(); g.moveTo(6, 0); g.bezierCurveTo(-4, -14, -34, -13, -50, -2); g.quadraticCurveTo(-40, 2, -34, 8); g.quadraticCurveTo(-20, 12, -4, 10); g.quadraticCurveTo(6, 8, 6, 0);
      g.fillStyle = fill; g.fill(); g.lineWidth = 1.4 / ws; g.strokeStyle = LINE; g.stroke(); g.restore();
    };
    const beat = Math.sin(t * 14) * 0.55, open = A.wing;
    if (open > 0.15) wing(8, -50, 0.75 + beat, 0.9 * open, shade, true);  // the far wing, spread the other way
    // neck: a thick line from the shoulders to the head, arched when the head is low
    const nbx = 20, nby = -44, ncx = nbx + (A.nx - nbx) * 0.2, ncy = Math.min(A.ny + (nby - A.ny) * 0.3, nby - 10);
    const neck = (w, col) => { g.lineWidth = w; g.strokeStyle = col; g.beginPath(); g.moveTo(nbx, nby); g.quadraticCurveTo(ncx, ncy, A.nx, A.ny); g.stroke(); };
    neck(16, LINE);
    g.beginPath(); g.moveTo(-38, -50); g.bezierCurveTo(-22, -60, 14, -60, 28, -47); g.bezierCurveTo(39, -36, 30, -15, 8, -13); g.bezierCurveTo(-13, -11, -27, -22, -38, -50);
    g.fillStyle = body; g.fill(); g.lineWidth = 1.5; g.strokeStyle = LINE; g.stroke();
    g.beginPath(); g.moveTo(-27, -27); g.bezierCurveTo(-13, -13, 14, -13, 29, -30); g.bezierCurveTo(14, -20, -12, -19, -27, -27); g.fillStyle = shade; g.fill();  // the underside, in shade
    const hs = flip(A.hf), head = fn => { g.save(); g.translate(A.nx, A.ny); g.scale(hs, 1); g.rotate(A.ha); fn(); g.restore(); };
    head(() => { g.fillStyle = LINE; g.beginPath(); g.ellipse(0, 0, 11.9, 10.4, 0, 0, 6.3); g.fill(); });
    neck(13, body);
    head(() => {
      const jaw = (a, col, fn) => { g.save(); g.translate(6, 0); g.rotate(a); g.fillStyle = col; g.beginPath(); fn(); g.fill(); g.restore(); };
      jaw(A.beak * 0.5, BEAK2, () => { g.moveTo(0, 0); g.lineTo(15, 1.5); g.quadraticCurveTo(8, 6, 0, 5); });
      jaw(-A.beak * 0.28, BEAK, () => { g.moveTo(0, -5); g.quadraticCurveTo(12, -5, 18, 0.5); g.lineTo(0, 1); });
      g.fillStyle = body; g.beginPath(); g.ellipse(0, 0, 10.5, 9, 0, 0, 6.3); g.fill();
      if (A.eye > 0.5) { g.lineWidth = 1.6; g.strokeStyle = INK; g.beginPath(); g.arc(3.5, -3.5, 2.6, 0.3, 2.84); g.stroke(); }
      else { g.fillStyle = INK; g.beginPath(); g.arc(3.5, -3, 2.1, 0, 6.3); g.fill(); }
      g.lineWidth = 1.8; g.strokeStyle = INK; g.beginPath(); g.moveTo(-1, -8.5); g.lineTo(7.5, -5.5); g.stroke();  // the brow: never pleased
      if (look && look.hiss) { g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 31); g.strokeStyle = WHITE; g.lineWidth = 1.7; g.beginPath(); g.moveTo(25, -3); g.lineTo(34, -7); g.moveTo(26, 2); g.lineTo(37, 2); g.moveTo(25, 7); g.lineTo(34, 11); g.stroke(); g.globalAlpha = 1; }
    });
    wing(10 - 6 * open, -40 - 8 * open, 0.1 + (0.65 + beat) * open, 0.66 + 0.5 * open, ch ? mix([242, 245, 249], [226, 205, 110], ch) : '#f2f5f9');
    g.restore();
  }
  function bubble(g, x, y, f, ctx, T, word) {
    const s = Math.min(1, 0.4 + T * 6);  // pops out
    g.save(); g.translate(U.clamp(x + f * 56, 58, ctx.w - 58), Math.max(30, y - 128)); g.rotate(-0.07 * f); g.scale(s, s);
    g.fillStyle = WHITE; g.strokeStyle = LINE; g.lineWidth = 1.5; g.lineJoin = 'round';
    U.box(g, {x: -48, y: -21, w: 96, h: 42, r: 19}); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-f * 26, 19); g.lineTo(-f * 36, 36); g.lineTo(-f * 8, 20); g.fill(); g.stroke();
    g.fillRect(-f * 17 - 8.5, 17, 17, 3.2);  // the tail joins the bubble without a seam
    g.fillStyle = INK; g.font = '800 21px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(word || 'HONK!', 0, 1);
    g.restore();
  }
  function puff(x, y, n, shell) { for (let i = 0; i < n && bits.length < 24; i++) bits.push({x, y, shell, vx: (Math.random() - 0.5) * 260, vy: -60 - Math.random() * 160, l: 1.4 + Math.random() * 0.9, s: Math.random() * 6}); }

  // ---------- the others ----------
  /** Tell the other kinds where this goose is. No pet function, on purpose. */
  function post(ctx, x, y, sc, chasing) { if (ctx.scene && ctx.scene.next) ctx.scene.next.push({kind: 'goose', x, y, h: 95 * sc, angry: true, chasing: chasing || null}); }
  const others = ctx => ((ctx.scene && ctx.scene.actors) || []).filter(a => a && a.kind !== 'goose' && a.x === +a.x && a.y === +a.y);
  /** The nearest of these, within reach r. */
  function nearest(list, x, y, r) { let best = null, bd = r; list.forEach(a => { const d = Math.hypot(a.x - x, a.y - y); if (d < bd) { bd = d; best = a; } }); return best; }
  /** What goose q should glare at right now: a finger that just touched near it, or anyone within about 200 px. */
  function threat(q, ctx, x, y, dt) {
    const e = q._; e.ft = Math.max(0, (e.ft || 0) - dt);
    return e.ft > 0 ? e.finger : nearest(others(ctx), x, y, 200);
  }
  /** Whom to chase: the nearest stick figure, now and then a sheep or a walker instead. It hates everything. */
  function quarry(ctx, x, y) {
    const all = others(ctx), is = k => a => k.indexOf(a.kind) >= 0, far = Math.hypot(ctx.w, ctx.h);
    const st = nearest(all.filter(is(['stick'])), x, y, far), ot = nearest(all.filter(is(['sheep', 'walker'])), x, y, far);
    const p = (ot && (!st || Math.random() < 0.2)) ? ot : st;
    return p ? {kind: p.kind, x: p.x, y: p.y, lost: 0} : null;
  }

  /** Another kind's function on an actor (a train's grab, drag, drop): only if it is there, and never trusted. */
  const call = (o, fn, a, b) => { try { if (o && typeof o[fn] === 'function') return o[fn](a, b); } catch (err) {} };
  /** Whatever stops the goose, a train it holds is let go. */
  function dropTrain(q) { const e = q._; if (e.tr) { const tr = e.tr; e.tr = null; call(tr, 'drop'); } }
  /** Somewhere on screen a good way off: where the train is dragged to. */
  function farFrom(ctx, x, y) { let p; for (let i = 0; i < 40; i++) { p = {x: 70 + Math.random() * (ctx.w - 140), y: 100 + Math.random() * Math.max(1, ctx.h - 130)}; if (Math.hypot(p.x - x, p.y - y) >= 250) break; } return p; }

  // ---------- eggs and goslings ----------
  /** May goose q lay now? One egg at a time, and none once there are four geese. About every other chance. */
  const canLay = () => !S.egg && S.geese.filter(q => !q.gone).length < MAX && (Math.random() < 0.5 || !!(cur && cur.opts.egg));
  function lay(page, x, y) { S.egg = {page, x: Math.round(x), y: Math.round(y), at: Date.now()}; save(); }
  function hatch() {
    const E = S.egg; S.egg = null;
    if (S.geese.filter(q => !q.gone).length < MAX) { S.geese.push(Object.assign(one(), {phase: 'chick', at: E.page, ax: E.x, ay: E.y, born: Date.now()})); S.hatched = Date.now(); }
    if (cur && cur.page === E.page) puff(E.x, E.y - 14, 7, true);
    save();
  }
  function egg(g, t, now) {
    const E = S.egg, age = U.clamp((now - E.at) / EGG, 0, 1), wob = Math.sin(t * (5 + age * 9)) * (0.03 + age * age * 0.34);  // rocks harder and harder
    g.fillStyle = 'rgba(10,14,30,.22)'; g.beginPath(); g.ellipse(E.x, E.y + 1, 12, 4, 0, 0, 6.3); g.fill();
    g.save(); g.translate(E.x, E.y); g.rotate(wob); g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-14, 0, -13, -17, -6, -24); g.bezierCurveTo(-3, -29, 3, -29, 6, -24); g.bezierCurveTo(13, -17, 14, 0, 0, 0);
    g.fillStyle = '#fff8ea'; g.fill(); g.lineWidth = 1.4; g.strokeStyle = LINE; g.stroke();
    g.beginPath(); g.moveTo(2, -1.5); g.bezierCurveTo(10, -3, 10, -14, 7.5, -19); g.bezierCurveTo(8, -10, 6, -4, 2, -1.5); g.fillStyle = '#eadcc2'; g.fill();
    if (age > 0.35) {
      g.beginPath(); g.moveTo(-9, -13); g.lineTo(-4, -10); g.lineTo(-1, -15); g.lineTo(4, -11);
      if (age > 0.7) { g.lineTo(8, -14); g.moveTo(-4, -10); g.lineTo(-6, -4); g.moveTo(-1, -15); g.lineTo(1, -21); }
      g.lineWidth = 1.3; g.strokeStyle = INK; g.stroke();
    }
    g.restore();
  }
  /** A gosling: trots after the nearest grown goose on its dashboard (in a line when there are several, and at a run
   *  when the goose is chasing someone), and is a goose itself after a minute. n: its place in the line. */
  function chick(q, g, ctx, t, dt, now, n) {
    const age = (now - q.born) / GROW, e = q._, sc = 0.4 + 0.6 * age;
    if (age >= 1) { q.phase = 'away'; schedule(q); save(); return; }
    if (q.at !== ctx.page) return;
    let tx = q.ax, ty = q.ay, run = false, prey = null;
    S.geese.some(o => { const v = o._.V;
      if (o.phase === 'chick' || o.gone) return false;
      if (v && v.mode !== 'flee' && v.mode !== 'runoff') { tx = v.x - v.f * (54 + n * 34); ty = v.y; run = v.mode === 'chase'; prey = run ? v.prey : null; return true; }
      if (o.phase === 'hiding' && o.hide === ctx.page && o.hx != null) { tx = o.hx + (o.hx < ctx.w / 2 ? -1 : 1) * (lootSize(o)[0] / 2 + 26 + n * 30); ty = o.hy + lootSize(o)[1] / 2; return true; }
      return false; });
    tx = U.clamp(tx, 24, ctx.w - 24);
    const dx = tx - q.ax, dy = ty - q.ay, dist = Math.hypot(dx, dy), go = dist > 12, foe = run ? null : threat(q, ctx, q.ax, q.ay, dt);
    if (go) { const st = Math.min(dist, (run ? 250 : 130) * dt); q.ax += dx / dist * st; q.ay += dy / dist * st; if (Math.abs(dx) > 4) e.f = dx > 0 ? 1 : -1; }
    else if (foe && Math.abs(foe.x - q.ax) > 6) e.f = foe.x > q.ax ? 1 : -1;
    const cross = !run && (!!foe || t % 3 < 0.7);
    goose(g, e.A, q.ax, q.ay, e.f || 1, run ? 'charge' : cross ? 'hiss' : 'glare', t, dt, go ? (run ? 2.6 : 1.7) : 0, {sc, chick: 1 - age, hiss: cross});
    post(ctx, q.ax, q.ay, sc, prey && {x: prey.x, y: prey.y});
  }

  // ---------- a visit ----------
  function begin(q, ctx) {
    const i = pick(ctx.rects, q, ctx.page), r = ctx.rects[i];
    q._.A = {};
    if (r) {
      const d = r.x + r.w / 2 < ctx.w / 2 ? -1 : 1;  // the tile leaves by the side it is nearest to
      // the goose comes in from the other side and stops behind the tile's top corner, so that its lowered beak
      // lands on the tile's edge: it shoves the tile out ahead of itself and so is on screen for as long as the tile is
      q._.V = {mode: 'enter', page: ctx.page, i, el: r.el, d, f: d, x: d > 0 ? -80 : ctx.w + 80, y: r.y + 34, x0: U.clamp((d < 0 ? r.x + r.w : r.x) - d * 47, 56, ctx.w - 56), T: 0, dx: 0, rx: r.x, rw: r.w};
    } else {
      // nothing it may take: a stroll through, with a honk on the way
      const d = Math.random() < 0.5 ? -1 : 1, vis = ctx.rects.filter(o => !o.hidden), o = vis[Math.floor(Math.random() * vis.length)];
      q._.V = {mode: 'enter', page: ctx.page, i: -1, el: null, d, f: d, x: d > 0 ? -80 : ctx.w + 80, y: o ? o.y + 34 : ctx.h * 0.5, x0: ctx.w * (0.35 + 0.3 * Math.random()), T: 0};
    }
  }
  function done(q) { q._.V = null; if (!q.taken && q.phase === 'away' && !(q.next > Date.now())) { schedule(q); save(); } }
  function act(q, g, ctx, t, dt) {
    const e = q._, v = e.V, sp = hurry > 0 ? 2.2 : 1, r = v.i >= 0 ? ctx.rects[v.i] : null;
    const go = m => { v.mode = m; v.T = 0; }, after = () => go(v.i >= 0 && r && r.el === v.el && allowed(r) ? 'tug' : 'exit');
    let pose = 'glare', honk = false, walk = 0, wig = 0, hiss = false, stamp = false, bt = 0, word = 'HONK!';
    v.T += dt * sp;
    // about one visit in four, when a train is running, is spent on the train instead (never with a tile in hand)
    if (!v.trained && !q.taken && !e.tr && /enter|look|honk|exit/.test(v.mode) && v.x > -40 && v.x < ctx.w + 40) {
      const tr = nearest(others(ctx).filter(a => a.kind === 'train'), v.x, v.y, 1e5);
      if (tr) {
        if (v.keen == null) v.keen = Math.random() < 0.25 || !!ctx.opts.train;
        if (v.keen) { v.trained = true; v.back = {mode: v.mode, T: v.T, x: U.clamp(v.x, 30, ctx.w - 30), y: v.y, f: v.f}; v.tp = {x: tr.x, y: tr.y, dir: tr.dir, a: tr, lost: 0}; v.lunge = 0; go('train-go'); }
      }
    }
    // once on a visit it drops what it is doing and goes for someone (not while it has its beak on a tile)
    if (!v.chased && /enter|look|honk|exit/.test(v.mode) && v.x > -40 && v.x < ctx.w + 40) {
      const prey = quarry(ctx, v.x, v.y);
      if (prey) { v.chased = true; v.back = {mode: v.mode, T: v.T, x: U.clamp(v.x, 30, ctx.w - 30), y: v.y, f: v.f}; v.prey = prey; v.left = 6 + Math.random() * 6; go('chase'); }
    }
    const foe = /look|honk|enter|exit/.test(v.mode) ? threat(q, ctx, v.x, v.y, dt) : null;
    if (v.mode === 'train-go') {
      // to the track, a little ahead of the train along its heading (dir, radians): there it stands and glares at
      // the headlight until the train is on it. Not for long: if the train does not come, it goes and gets it.
      const a = nearest(others(ctx).filter(o => o.kind === 'train'), v.tp.x, v.tp.y, 220);
      if (a) v.tp = {x: a.x, y: a.y, dir: a.dir, a, lost: 0}; else v.tp.lost += dt;
      const hd = v.tp.dir === +v.tp.dir && (v.wait || 0) < 4, hx = hd ? Math.cos(v.tp.dir) : 0, hy = hd ? Math.sin(v.tp.dir) : 0;
      const ax = U.clamp(v.tp.x + hx * 110, 30, ctx.w - 30), ay = U.clamp(v.tp.y + hy * 110, 70, ctx.h - 6);
      const tx = v.tp.x - v.x, ty = v.tp.y - v.y, dist = Math.hypot(tx, ty), dx = ax - v.x, dy = ay - v.y, far = Math.hypot(dx, dy);
      const ahead = hd && dist < 190 && -(tx * hx + ty * hy) > dist * 0.8;  // the train is heading straight for it
      if (Math.abs(tx) > 8) v.f = tx > 0 ? 1 : -1;
      if (dist < 66) {
        pose = 'peck'; v.lunge += dt;
        if (v.lunge > 0.25) {
          if (call(v.tp.a, 'grab') === true) { e.tr = v.tp.a; v.to = farFrom(ctx, v.x, v.y); go('train-haul'); }  // the beak is clamped on the engine
          else go('back');
        }
      } else if (hd && (ahead || far < 10)) { v.wait = (v.wait || 0) + dt; pose = 'hiss'; hiss = true; stamp = true; }
      else { const st = Math.min(far, 220 * dt); if (far > 0.01) { v.x += dx / far * st; v.y += dy / far * st; } if (Math.abs(dx) > 8) v.f = dx > 0 ? 1 : -1; pose = 'charge'; walk = 2.4; }
      if (v.mode === 'train-go' && (v.T > 12 || v.tp.lost > 1.2)) go('back');
    } else if (v.mode === 'train-haul') {
      // walks backward with the train trailing from its beak, honking through a full beak, and shakes it twice like
      // a dog with a toy. The train is told where the beak is in every frame.
      const dx = v.to.x - v.x, dy = v.to.y - v.y, dist = Math.hypot(dx, dy), shake = (v.T > 1.2 && v.T < 1.9) || (v.T > 3.3 && v.T < 3.9);
      if (!shake && dist > 0.01) { const st = Math.min(dist, 85 * sp * dt); v.x += dx / dist * st; v.y += dy / dist * st; walk = 1.2; if (Math.abs(dx) > 8) v.f = dx > 0 ? -1 : 1; }
      pose = 'grip'; wig = shake ? 1 : 0; bt = v.T % 1.5; honk = bt < 0.7; word = 'HNK';
      const sh = shake ? Math.sin(t * 30) * 14 : 0;
      call(e.tr, 'drag', v.x + v.f * 50 + sh, v.y - 34 + sh * 0.6);
      if (dist < 6 || v.T > 15) { dropTrain(q); v.f = -v.f; go('train-kick'); }  // left lying there
    } else if (v.mode === 'train-kick') {  // its back turned, dirt kicked over the heap
      stamp = true; walk = 0.01;
      if (Math.floor(v.T / 0.28) !== Math.floor((v.T - dt * sp) / 0.28)) puff(v.x - v.f * 22, v.y - 4, 2, 2);
      if (v.T > 1.1) go('gloat');
    } else if (v.mode === 'chase') {
      // after the same one all the way: whoever of its kind is nearest to where it last was. Neck flat out,
      // wings spread, honking; a peck at the heels when it catches up; a flap up or down to the level they are on
      const p = nearest(others(ctx).filter(a => a.kind === v.prey.kind), v.prey.x, v.prey.y, 160);
      if (p) { v.prey.x = p.x; v.prey.y = p.y; v.prey.lost = 0; } else v.prey.lost += dt;
      const dx = v.prey.x - v.x, dy = v.prey.y - v.y, close = Math.abs(dx) < 64 && Math.abs(dy) < 30;
      if (Math.abs(dx) > 8) v.f = dx > 0 ? 1 : -1;
      if (!close) v.x = U.clamp(v.x + v.f * Math.min(Math.abs(dx), 235 * dt), 30, ctx.w - 30);
      v.y = U.clamp(v.y + U.clamp(dy, -300 * dt, 300 * dt), 70, ctx.h - 6);
      pose = Math.abs(dy) > 30 ? 'flap' : close && v.T % 0.5 < 0.25 ? 'peck' : 'charge'; walk = close ? 0.8 : 2.6;
      bt = v.T % 1; honk = bt < 0.62;
      v.left -= dt; if (v.left <= 0 || v.prey.lost > 1.2) go('gloat');
    } else if (v.mode === 'gloat') {  // stands tall, one triumphant honk, a shake of the tail
      pose = 'tall'; wig = 1; honk = v.T < 1.1; bt = v.T;
      if (v.T > 1.7) go('back');
    } else if (v.mode === 'back') {  // and back to what it was doing, where it was doing it
      const dx = v.back.x - v.x, dy = v.back.y - v.y, dist = Math.hypot(dx, dy), st = Math.min(dist, 130 * sp * dt);
      if (dist > 4) { v.x += dx / dist * st; v.y += dy / dist * st; if (Math.abs(dx) > 6) v.f = dx > 0 ? 1 : -1; walk = 1.3 * sp; }
      else { v.x = v.back.x; v.y = v.back.y; v.f = v.back.f; v.mode = v.back.mode; v.T = v.back.T; }
    } else if (v.mode === 'enter') {
      v.x += v.d * 100 * sp * dt; walk = sp; hiss = !!foe; if (foe) pose = 'hiss';
      if ((v.x - v.x0) * v.d >= 0) { v.x = v.x0; go('look'); }
    } else if (v.mode === 'look') {
      pose = foe || v.T % 0.7 >= 0.35 ? 'hiss' : 'glare'; hiss = pose === 'hiss'; stamp = true;
      if (foe && Math.abs(foe.x - v.x) > 6) v.f = foe.x > v.x ? 1 : -1; else v.f = v.d;
      if (v.T > 0.9) { v.f = v.d; go('honk'); }
    } else if (v.mode === 'honk') {
      pose = 'honk'; honk = true; bt = v.T;
      if (v.T > 1.1) { if (canLay()) go('lay'); else after(); }
    } else if (v.mode === 'lay') {  // settles, wiggles, and there is an egg
      pose = 'sit'; wig = v.T > 0.4 ? 1 : 0;
      if (v.T > 1.7) { if (!S.egg) lay(ctx.page, v.x - v.f * 42, v.y); after(); }
    } else if (v.mode === 'tug') {
      const k = Math.floor(v.T / 0.55), pull = v.T / 0.55 - k >= 0.5;
      pose = pull ? 'grip' : 'reach';
      if (pull !== v.pull) { v.pull = pull; style(v.el, {transition: 'transform .14s ease-out', transform: pull ? `translate(${-v.d * 7}px,0) rotate(${-v.d * 1.6}deg)` : ''}); }
      if (k >= 3) {
        if (takeable(ctx.rects, q, ctx.page).indexOf(v.i) < 0) { restore(v.el); v.el = null; go('exit'); }  // another goose got in first, or too few tiles are left
        else {
          // got it. From here the tile is "taken" and the clock runs.
          q.taken = true; q.due = Date.now() + hold(); q.page = ctx.page; q.idx = v.i; q.name = nameOf(r); q.w = r.w; q.h = r.h; q.r = r.r || 0; q.cx = r.x + r.w / 2; q.cy = r.y + r.h / 2; q.bounce = false;
          e.held = v.el; arm(q); save();
          style(v.el, {zIndex: '2', pointerEvents: 'none', transition: 'transform .12s linear'}); try { if (HP.cut) HP.cut(); } catch (err) {}  // its frosted patch leaves with it
          go('drag');
        }
      }
    } else if (v.mode === 'drag') {
      v.dx += v.d * 80 * sp * dt; v.x = v.x0 + v.dx; pose = 'grip'; walk = sp;
      style(v.el, {transform: `translate(${v.dx.toFixed(1)}px,${Math.sin(t * 9) > 0 ? -2 : 0}px) rotate(${(v.d * (3 + Math.sin(t * 7) * 1.5)).toFixed(2)}deg)`});
      if (v.d < 0 ? v.rx + v.rw + v.dx < -14 : v.rx + v.dx > ctx.w + 14) {
        // off the screen: hidden, and back in its own place so that a layout measured meanwhile is still right
        style(v.el, {visibility: 'hidden', transform: '', transition: ''});
        const others = (ctx.pages || []).filter(p => p !== ctx.page);
        q.phase = 'hiding'; q.hide = others.length ? others[Math.floor(Math.random() * others.length)] : ctx.page; q.hx = null; e.layAt = null;
        v.el = null; go('exit'); save();  // and the goose walks out after it
      }
    } else if (v.mode === 'exit') {
      v.x += v.d * 100 * sp * dt; walk = sp; v.f = v.d; hiss = !!foe; if (foe) pose = 'hiss';
      if (v.x < -90 || v.x > ctx.w + 90) { done(q); if (q.phase === 'hiding' && q.hide === ctx.page && q.hx == null) spot(q, ctx); return; }
    } else if (v.mode === 'runoff') {  // dropped it: back the way it came, fast
      v.x -= v.d * 300 * dt; pose = 'flap'; walk = 3;
      if (v.x < -90 || v.x > ctx.w + 90) return done(q);
    } else {  // flee: up and away
      v.x += v.f * 170 * dt; v.y -= 230 * dt; pose = 'flap';
      if (v.y < -140) return done(q);
    }
    const age = q.born ? Math.min(1, (Date.now() - q.born) / GROW) : 1;
    goose(g, e.A, v.x, v.y, v.f, pose, t, dt, walk, {wig, hiss, stamp, sc: 0.4 + 0.6 * age, chick: 1 - age});
    if (honk) bubble(g, v.x, v.y + (pose === 'charge' || pose === 'peck' || pose === 'grip' ? 34 : 0), v.f, ctx, bt, word);
    if (v.mode !== 'flee' && v.mode !== 'runoff') post(ctx, v.x, v.y, 0.4 + 0.6 * age, v.mode === 'chase' ? {x: v.prey.x, y: v.prey.y} : null);
  }

  // ---------- hiding ----------
  /** Where on this dashboard goose q sits: on a corner where tiles meet, so it covers a little of several
   *  tiles and the middle of none, and not on top of another goose. */
  function spot(q, ctx) {
    const s = lootSize(q), c = [];
    const free = p => S.geese.every(o => o === q || o.hide !== ctx.page || o.hx == null || Math.hypot(p[0] - o.hx, p[1] - o.hy) > 170);
    ctx.rects.forEach(r => { if (r.hidden || r.flat) return;
      [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].forEach(p => {
        if (p[0] > s[0] / 2 + 12 && p[0] < ctx.w - s[0] / 2 - 12 && p[1] - s[1] / 2 > 112 && p[1] + s[1] / 2 < ctx.h - 10 && free(p) && (q.page !== ctx.page || Math.hypot(p[0] - q.cx, p[1] - q.cy) > 260)) c.push(p); }); });
    const p = c.length ? c[Math.floor(Math.random() * c.length)] : [ctx.w * (0.3 + 0.4 * Math.random()), ctx.h * 0.62];
    q.hx = Math.round(p[0]); q.hy = Math.round(p[1]); save();
  }
  /** The stand-in for the taken tile: its shape at about 60%, with its name, so the owner sees what is missing. */
  function loot(g, q, x, y, a) {
    const s = lootSize(q), w = s[0], h = s[1], rr = (q.r || 0) * 0.6;
    g.save(); g.translate(x, y); g.globalAlpha = a;
    g.fillStyle = 'rgba(10,14,30,.2)'; g.beginPath(); g.ellipse(0, h / 2 + 2, w * 0.5, 7, 0, 0, 6.3); g.fill();
    g.rotate(-0.06);
    U.box(g, {x: -w / 2, y: -h / 2, w, h, r: rr}); g.fillStyle = '#414a68'; g.fill();
    U.box(g, {x: -w / 2, y: -h / 2, w, h: h * 0.5, r: rr}); g.fillStyle = 'rgba(255,255,255,.07)'; g.fill();  // a flat sheen on the upper half
    U.box(g, {x: -w / 2, y: -h / 2, w, h, r: rr}); g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.55)'; g.stroke();
    const key = q.name + '|' + Math.round(w);
    if (!label[key]) {  // fit the name once: smaller first, then cut
      let fs = 14, txt = q.name || '';
      const fits = () => { g.font = '600 ' + fs + 'px ' + FONT; return g.measureText(txt).width <= w - 16; };
      while (!fits() && fs > 10) fs--;
      while (!fits() && txt.length > 2) txt = txt.slice(0, -2).trim() + '…';
      label[key] = {fs, txt};
    }
    g.font = '600 ' + label[key].fs + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.fillText(label[key].txt, 0, h * 0.2);
    g.restore();
  }
  function nest(q, g, ctx, t, dt) {
    const e = q._, s = lootSize(q), x = q.hx, y = q.hy, top = y - s[1] / 2 + 8, k = Math.floor(t / 4) % 5, u = t % 4;
    let pose = 'sitglare', f = x < ctx.w / 2 ? 1 : -1, honk = false, wig = 0, hiss = false, lunge = 0;
    const foe = threat(q, ctx, x, top, dt);
    loot(g, q, x, y, 1);
    // once while it sits here it may lay an egg beside itself
    if (e.layAt == null) { e.layAt = t + (ctx.opts.egg ? 2 : 4 + Math.random() * 8); e.laying = 0; e.tried = false; }
    if (!e.tried && t >= e.layAt) { e.tried = true; if (canLay()) e.laying = 1.7; }
    if (e.laying > 0) { e.laying -= dt; wig = 1; pose = 'sit'; if (e.laying <= 0 && !S.egg) lay(ctx.page, x - f * 44, top + 2); }
    else if (foe) { pose = 'sithiss'; hiss = true; if (Math.abs(foe.x - x) > 6) f = foe.x > x ? 1 : -1; lunge = Math.abs(Math.sin(t * 7)) * 10; }  // lunges, but does not leave its loot
    else if (k === 1) { pose = 'sithiss'; hiss = true; }
    else if (k === 2) { if (u > 1 && u < 3) f = -f; }  // glares the other way for a moment
    else if (k === 3) wig = u < 1.2 ? 1 : 0;  // an irritable shake
    else if (k === 4 && u < 1.2) { pose = 'sithonk'; honk = true; }
    goose(g, e.A, x + f * lunge, top, f, pose, t, dt, 0, {wig, hiss});
    if (honk) bubble(g, x, top + 16, f, ctx, u);
    post(ctx, x, top, 1, null);
  }
  function extras(g, dt) {
    S.geese.forEach(q => { const p = q._.pop; if (p) { p.t -= dt; if (p.t <= 0) q._.pop = null; else loot(g, q, p.x, p.y - (0.35 - p.t) * 40, p.t / 0.35); } });
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]; b.l -= dt; if (b.l <= 0) { bits.splice(i, 1); continue; }
      // feathers flutter down slowly, rocking; shell just falls
      b.vy = Math.min(b.shell ? 400 : 55, b.vy + (b.shell ? 700 : 320) * dt); b.vx *= 0.92; b.x += (b.vx + (b.shell ? 0 : Math.sin(b.l * 6 + b.s) * 46)) * dt; b.y += b.vy * dt;
      g.save(); g.translate(b.x, b.y); g.rotate(b.shell ? b.s + b.l * 6 : Math.sin(b.l * 6 + b.s) * 0.9); g.globalAlpha = Math.min(1, b.l * 2);
      g.beginPath();
      if (b.shell) { g.moveTo(-5, 3); g.lineTo(0, -5); g.lineTo(5, 2); g.quadraticCurveTo(0, 5, -5, 3); g.fillStyle = b.shell === 2 ? '#8b6a48' : '#fff8ea'; }  // shell, or kicked dirt
      else { g.moveTo(-9, 0); g.quadraticCurveTo(0, -7, 10, -1); g.quadraticCurveTo(1, 5, -9, 0); g.fillStyle = WHITE; }
      g.fill(); g.lineWidth = 1; g.strokeStyle = LINE; g.stroke(); g.restore();
    }
  }
  const near = (v, x, y) => Math.abs(x - v.x) < 60 && y > v.y - 104 && y < v.y + 10;
  /** A finger came down: a goose at a tile hurries, and every goose near the finger turns on it and hisses. */
  const shy = (x, y) => {
    S.geese.forEach(q => { const e = q._, v = e.V, c = cur || {};
      const at = v ? v : q.phase === 'hiding' && q.hide === c.page && q.hx != null ? {x: q.hx, y: q.hy - lootSize(q)[1] / 2} : q.phase === 'chick' && q.at === c.page ? {x: q.ax, y: q.ay} : null;
      if (!at || Math.hypot(x - at.x, y - (at.y - 48)) > 170) return;
      if (v && /enter|look|honk|lay|tug|drag/.test(v.mode)) hurry = 3;
      e.finger = {x, y}; e.ft = 1.6; });
  };

  HP.fx.add('goose', {
    label: 'Goose',
    live: true, fps: 12,
    options: [{key: 'every', label: 'How often', type: 'select', choices: [['often', 'Often'], ['sometimes', 'Sometimes'], ['rarely', 'Rarely']], default: 'sometimes'},
      {key: 'keep', label: 'Keeps a tile for', type: 'select', choices: [[30, '30 seconds'], [60, '1 minute'], [120, '2 minutes'], [300, '5 minutes'], [600, '10 minutes']], default: 60}],
    create(ctx) {
      cur = ctx;
      const now = Date.now();
      // the engine builds this again when the dashboard or its layout changes: a visit under way cannot go on
      S.geese.forEach(q => { const e = q._, v = e.V; dropTrain(q); if (!v) return;
        e.V = null; if (v.mode === 'drag') release(q); else if (v.el) restore(v.el);
        if (q.phase === 'away' && !(q.next > now)) schedule(q); });
      S.geese = S.geese.filter(q => !q.gone);
      // not in the options list, for the test page: now = come at once, hide = start out hiding here with a made-up
      // tile, egg = lay an egg at the first chance
      if ((ctx.opts.now || ctx.opts.hide) && !forced) {
        forced = true; reset(); S.geese[0].next = 1;
        if (ctx.opts.hide) { const q = Object.assign(S.geese[0], {phase: 'hiding', taken: true, due: now + hold(), page: '(test)', idx: -1, name: 'Kitchen lights', w: 190, h: 120, r: 22, hide: ctx.page, hx: null}); arm(q); }
      }
      if (S.egg && now - S.egg.at >= EGG) hatch();
      if (S.geese.length > 1 && now - S.hatched >= RESET) { flyOff(); S.geese = S.geese.filter(q => !q.gone || q._.V); }
      S.geese.forEach(q => {
        if (q.gone) return;
        if (q.next == null) schedule(q);
        if (q.taken && now >= q.due) release(q);
        if (q.page === ctx.page) {
          const r = ctx.rects[q.idx], e = q._;
          if (q.taken) {
            // still away: this is a fresh element, hide it again. If the tile here is no longer the one taken, give up.
            if (r && allowed(r) && nameOf(r) === q.name) { if (e.held && e.held !== r.el) restore(e.held); e.held = r.el; style(e.held, {visibility: 'hidden', pointerEvents: 'none'}); try { if (HP.cut) HP.cut(); } catch (err) {} arm(q); }
            else release(q);
          } else {
            if (r && r.el) restore(r.el, q.bounce);
            q.page = null; q.bounce = false; save();
          }
        }
        if (q.phase === 'hiding' && q.hide === ctx.page && q.hx == null) spot(q, ctx);
      });
      return {};
    },
    draw(g, st, ctx, t, dt) {
      if (t === lastT) return; lastT = t;  // listed twice on one dashboard: still the same geese, at one pace
      const now = Date.now();
      hurry = Math.max(0, hurry - dt);
      if (S.egg && now - S.egg.at >= EGG) hatch();
      if (S.geese.length > 1 && now - S.hatched >= RESET && !S.geese[1].gone) flyOff();
      let line = 0;
      const sticks = others(ctx).some(a => a.kind === 'stick');
      for (let i = 0; i < S.geese.length; i++) {
        const q = S.geese[i], e = q._;
        if (q.taken && now >= q.due) release(q);
        if (q.gone && !e.V) { S.geese.splice(i--, 1); continue; }  // flown
        if (q.phase === 'chick' && !e.V) { chick(q, g, ctx, t, dt, now, line++); continue; }
        if (!e.V && q.phase === 'away') {
          if (q.next - now > mean() * 1.4) q.next = now + mean() * 1.4;  // "How often" was turned up meanwhile
          // stick figures on the dashboard: it does not wait for its usual visit. It is there 20 to 45 seconds after
          // first noticing them, and again every minute or two for as long as they stay. Entering, it sees them and
          // the chase comes first; "How often" still decides the visits when nobody is about.
          if (!sticks) e.sn = null;
          else if (e.sn == null) e.sn = now + STICK[0] + Math.random() * (STICK[1] - STICK[0]);
          if (now >= q.next) begin(q, ctx);
          else if (sticks && now >= e.sn) { e.sn = now + STICK[2] + Math.random() * (STICK[3] - STICK[2]); begin(q, ctx); }
        }
        if (e.V) act(q, g, ctx, t, dt);
        else if (q.phase === 'hiding' && q.hide === ctx.page && q.hx != null) nest(q, g, ctx, t, dt);
      }
      if (S.egg && S.egg.page === ctx.page) egg(g, t, now);
      extras(g, dt);
    },
    // The screen was double-tapped: every tile any goose holds is back at once, wherever it belongs (one from another
    // dashboard is marked as returned and is there when that dashboard is shown), a train is let go, and the geese
    // on screen take it as being caught: a jump, feathers, and off in a huff.
    restore(st, ctx) {
      cur = ctx;
      S.geese.forEach(q => { const e = q._;
        dropTrain(q);
        if (e.V && e.V.el && !q.taken) { restore(e.V.el); e.V.el = null; }  // it only had its beak on one
        if (q.taken) release(q);
        const v = e.V;
        if (v && v.page === ctx.page) { puff(v.x, v.y - 44, 8); v.mode = 'flee'; v.el = null; v.i = -1; if (v.f == null) v.f = 1; }
      });
      save();
    },
    // fingers near a goose: it hurries if it is at a tile, and hisses at the finger
    touch(st, x, y) { shy(x, y); },
    drag(st, x, y) { shy(x, y); },
    tap(st, x, y, ctx) {
      const E = S.egg;
      if (E && E.page === ctx.page && Math.abs(x - E.x) < 24 && y > E.y - 40 && y < E.y + 12) { S.egg = null; puff(E.x, E.y - 14, 7, true); save(); return true; }  // in time: only shell
      for (const q of S.geese) {
        const v = q._.V;
        if (v && v.mode === 'drag' && near(v, x, y)) { puff(v.x, v.y - 40, 5); release(q); return true; }  // caught in the act: drops it and runs
        if (v && v.mode === 'train-haul' && near(v, x, y)) { puff(v.x, v.y - 40, 6); dropTrain(q); v.mode = 'flee'; return true; }  // the same with a train in its beak
        if (!v && q.phase === 'hiding' && q.hide === ctx.page && q.hx != null) {
          const s = lootSize(q), top = q.hy - s[1] / 2;
          if ((Math.abs(x - q.hx) < s[0] / 2 && Math.abs(y - q.hy) < s[1] / 2) || (Math.abs(x - q.hx) < 56 && y > top - 100 && y <= top + 6)) { puff(q.hx, top - 44, 12); release(q); return true; }
        }
      }
    },
  });

  /** From a console: make the geese come now. */
  HP.fx.gooseNow = () => { S.geese.forEach(q => { if (!q._.V && q.phase === 'away') q.next = 1; }); };
  // for the self-check page only
  HP.fx.gooseTest = {allowed, pick: (rects, page) => pick(rects, null, page), state: () => S, count: () => S.geese.filter(q => !q.gone).length,
    times: o => { if ('hold' in o) HOLD = o.hold; if (o.reset) RESET = o.reset; if (o.egg) EGG = o.egg; if (o.grow) GROW = o.grow; },
    add: () => { if (S.geese.length < MAX) { S.geese.push(Object.assign(one(), {next: 1})); S.hatched = Date.now(); } }};
})();
