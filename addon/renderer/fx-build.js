'use strict';
// Construction crew: stick figures in hard hats turn the tiles into one big apartment block over the cycle. First
// surveyors and stakes, then scaffolding round every tile from the bottom row up, floors and windows, lifts in the
// channels between tiles, a crane on the top row. When it is finished the scaffolds and the crew are gone: curtains,
// lit windows at night, tenants at the windows, a front door with an awning and a FOR RENT sign at ground level.
// Everything that stands still is decided once from the seed and painted to a hidden sheet; only the figures, the
// lift cages and the crane hook are drawn every frame.
// A tile is one apartment: a window or two of a size to see into, and something of its own (flowers, a balcony rail,
// an air conditioner). A tile much bigger than most is two apartments that share a wall. Once people have moved in
// the lights go on and off household by household, someone throws a party, tenants lean out and wave, and they come
// and go by the front door and the lifts. All of that changes, so it is drawn each frame on top of the sheet.
(() => {
  const U = HP.fx.util, TAU = Math.PI * 2;
  const solid = r => !r.hidden && !r.flat;
  const INK = '#f4efe6', HALO = 'rgba(14,14,24,.55)', HAT = '#ffc62a', WOOD = '#e2b25e', STEEL = 'rgba(208,216,228,';
  const SEEN = HP.fx.buildTest = {flees: 0, carries: 0, rides: 0, climbs: 0, raves: 0, waves: 0, entries: 0, exits: 0, drops: 0, turkeys: 0, splats: 0, quote: 0, stomped: 0, shoppers: 0, cover: 0, x: 0, y: 0};   // counters for the test page; x, y where the last rave, wave or ride began (drops: turkey drops begun, turkeys: birds let go, splats: birds landed, x, y the last landing; quote: speech bubbles shown; stomped: things flattened; shoppers: people out on the pavement now; cover: times someone ran for cover)
  const WARM = '#ffce70', COOL = '#d6e8ff', TELLY = '#6ea0ff', RAVE = ['#ff3ccf', '#36e6ff', '#5cff6a', '#ffb52e'], CURT = ['rgba(236,120,110,.62)', 'rgba(120,190,170,.62)', 'rgba(240,232,214,.62)'];
  const SHIRT = ['#e8645a', '#5aa9e8', '#7cc46a', '#e8b84a', '#b37ae0', '#ef8fb8', '#58c8c0'], HAIR = ['#3a2a22', '#8a5a2c', '#d8b46a', '#2a2a30', '#b0b0b8'], BLOOM = ['#ff6f91', '#ffd24a', '#c98bff'];
  const FIR = '#2f9e58', BAUB = [0, 0.34, -0.3, 0.58, 0.32, 0.64, -0.5, 0.9, 0.05, 0.86, 0.55, 0.92], GLOW = ['#ff5a4a', '#ffd84a', '#6ec8ff'], FOWL = '#8a5a2c', FAN = '#6b3f1c', PLUME = ['#c9a26b', '#f4efe6', '#8a5a2c'];   // BAUB: where the lights hang on a tree, across and down
  const J = new Float32Array(14);   // one figure's joints: head, shoulder, hip, two feet, two hands

  /** Work out a figure's joints for what it is doing, in its own space: feet at 0,0, facing right, about 18 tall. */
  function pose(w) {
    const s = Math.sin(w.ph), c = Math.cos(w.ph), a = w.st;
    let hx = 0, hy = -15, sx = 0, sy = -11.5, px = 0, py = -6, f1x = -2, f1y = 0, f2x = 2, f2y = 0, h1x = -2.5, h1y = -6, h2x = 2.5, h2y = -6;
    if (a === 'walk' || a === 'flee') {
      f1x = s * 3.6; f2x = -s * 3.6; f1y = Math.min(0, c) * 1.4; f2y = Math.min(0, -c) * 1.4; h1x = -s * 3; h2x = s * 3; h1y = h2y = -6.5;
      if (a === 'flee') { sx = 1.5; hx = 2.5; h1x = -2; h1y = -18 + s; h2x = 5; h2y = -18 - s; }
      else if (w.hold) { h1x = 1; h1y = -13.4; h2x = 3.5; h2y = -13.4; }
      else if (w.item > 1) { h1x = 4; h1y = -8; h2x = 5; h2y = -8.5; }   // a box or a plant, held in front
      else if (w.item) { h2x = 2.5; h2y = -5.5; }   // a bag hangs still
    }
    else if (a === 'wave' && w.up) { h2x = 4.5 + s * 1.6; h2y = -19; }
    else if (a === 'climb') { h1x = -2; h1y = -17 + s * 2; h2x = 2; h2y = -17 - s * 2; f1y = Math.min(0, s * 2.5); f2y = Math.min(0, -s * 2.5); }
    else if (a === 'task' && w.task === 'hammer') { const k = Math.abs(s); px = -1; py = -4; f1x = -5; f2x = 3; sx = 1.5; sy = -9; hx = 3; hy = -12.3; h1x = 6; h1y = -1.5; h2x = 4 + 2 * k; h2y = -4 - 8 * k; }
    else if (a === 'task' && w.task === 'break') { py = -2; sy = -8; hy = -11.5; f1x = 6; f1y = -1; f2x = 6.5; f2y = 0; h1x = 2; h1y = -3.5; h2x = s > 0.9 ? 2.5 : 4.5; h2y = s > 0.9 ? -10 : -5; }
    else if (a === 'task' && w.task === 'survey') { sx = 1; hx = 2.2; hy = -14.6; h2x = 6.5; h2y = -11.5; }
    else if (a === 'sit') { px = -1; py = -5.5; sx = -0.6; sy = -11; hx = -0.2; hy = -14.6; f1x = 3.5; f2x = 5; h1x = 3; h1y = -8; h2x = 5; h2y = -8.2; }   // on a chair, hands on the table
    else if (a === 'look') {   // the radio crew, eyes on the sky: the reporter's microphone arm drops (m to 1), then both hands go to the head (m to 2)
      const k = U.clamp(w.m, 0, 1), u = U.clamp(w.m - 1, 0, 1); let ax = 2.5, ay = -6;
      if (w.mic) { ax = 3; ay = U.lerp(-13.2, -5.5, k); } else if (w.pt) { ax = w.lx * 7; ay = -11.5 + w.ly * 7; }
      hx = w.lx * 0.5 - 0.5; h2x = U.lerp(ax, 2.6, u); h2y = U.lerp(ay, -17, u); h1x = U.lerp(-2.5, -2.6, u); h1y = U.lerp(-6, -17, u);
    }
    J[0] = hx; J[1] = hy; J[2] = sx; J[3] = sy; J[4] = px; J[5] = py; J[6] = f1x; J[7] = f1y; J[8] = f2x; J[9] = f2y; J[10] = h1x; J[11] = h1y; J[12] = h2x; J[13] = h2y;
  }
  function man(g, w) {
    pose(w);
    const sc = w.sc || 1.2;
    g.save(); g.translate(w.x, w.y); g.scale(w.dir * sc, sc); g.lineCap = g.lineJoin = 'round';
    for (let k = 0; k < 2; k++) {   // a dark edge first, so the pale figure shows on any backdrop
      g.strokeStyle = g.fillStyle = k ? INK : HALO; g.lineWidth = k ? 1.5 : 3.4;
      g.beginPath(); g.moveTo(J[6], J[7]); g.lineTo(J[4], J[5]); g.lineTo(J[8], J[9]); g.moveTo(J[4], J[5]); g.lineTo(J[2], J[3]); g.moveTo(J[10], J[11]); g.lineTo(J[2], J[3]); g.lineTo(J[12], J[13]); g.stroke();
      g.beginPath(); g.arc(J[0], J[1], k ? 2.7 : 3.6, 0, TAU); g.fill();
    }
    if (w.ten) kit(g, w);
    else { g.fillStyle = HAT; g.beginPath(); g.arc(J[0], J[1] - 0.6, 3.2, Math.PI, 0); g.fill(); g.fillRect(J[0] - 3.2, J[1] - 1.3, 7.8, 1.2); }   // hard hat, brim to the front
    if (w.st === 'walk' && w.hold) { g.strokeStyle = WOOD; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-9, -14.6); g.lineTo(12, -14.6); g.stroke(); }
    else if (w.st === 'task' && w.task === 'hammer') { g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.moveTo(J[12], J[13]); g.lineTo(J[12] + 3.5, J[13] - 2.5); g.stroke(); g.fillStyle = '#9aa3ad'; g.fillRect(J[12] + 2.4, J[13] - 4.6, 2.6, 3.6); }
    else if (w.st === 'task' && w.task === 'break') { g.fillStyle = '#fff'; g.fillRect(J[12] + 0.4, J[13] - 2.6, 2.4, 2.8); g.fillStyle = '#d9534a'; g.fillRect(-8, -4.2, 5.5, 4.2); }
    else if (w.st === 'look') {   // an eye, so the head is seen to follow; and the reporter's microphone, in the hand or dropped at the feet
      g.fillStyle = '#222'; g.fillRect(J[0] + w.lx * 1.6 - 0.55, J[1] + w.ly * 1.6 - 0.55, 1.1, 1.1);
      if (w.mic) { const d = w.m > 1.5, x = d ? 5.5 : J[12], y = d ? -0.8 : J[13]; g.strokeStyle = '#2a2a30'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, y + (d ? 0 : 1.5)); g.lineTo(d ? x + 3 : x, d ? y : y - 2); g.stroke(); g.fillStyle = '#c9ced6'; g.beginPath(); g.arc(d ? x + 3.6 : x, d ? y : y - 2.8, 1.4, 0, TAU); g.fill(); }
    }
    else if (w.st === 'task' && w.task === 'survey') { g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(9, -11); g.lineTo(6, 0); g.moveTo(9, -11); g.lineTo(9.5, 0); g.moveTo(9, -11); g.lineTo(13, 0); g.stroke(); g.fillStyle = HAT; g.fillRect(6.8, -13.8, 4.8, 3.2); }
    g.restore();
  }

  /** A tenant is no builder: hair for a hat, a shirt, and now and then something carried home. Drawn in the figure's own space. */
  function kit(g, w) {
    g.strokeStyle = w.col; g.lineWidth = 2.6; g.beginPath(); g.moveTo(J[2], J[3] + 0.6); g.lineTo(J[4], J[5] - 0.6); g.stroke();
    const tl = w.st === 'look' ? Math.atan2(w.ly, w.lx) : 0;   // looking up, the hair goes to the back of the head
    g.fillStyle = w.hair; g.beginPath(); g.arc(J[0], J[1] - 0.4, 2.9, Math.PI + tl, tl); g.fill();
    const x = J[12], y = J[13], k = w.st === 'walk' || w.st === 'wave' ? w.item : 0;
    if (k === 1) { g.strokeStyle = INK; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - 1.6, y + 2); g.lineTo(x, y); g.lineTo(x + 1.6, y + 2); g.stroke(); g.fillStyle = '#efe2c4'; g.fillRect(x - 2.6, y + 2, 5.2, 5.4); g.fillStyle = '#6cc070'; g.fillRect(x - 0.4, y + 0.8, 2.4, 1.6); }   // shopping bag, something green on top
    else if (k === 2) { g.fillStyle = WOOD; g.fillRect(x - 1.5, y - 5, 7, 6); g.strokeStyle = 'rgba(60,40,20,.8)'; g.lineWidth = 0.7; g.strokeRect(x - 1.5, y - 5, 7, 6); g.beginPath(); g.moveTo(x - 1.5, y - 3); g.lineTo(x + 5.5, y - 3); g.stroke(); }   // a box
    else if (k === 3) { g.strokeStyle = '#6cc070'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 1.5, y - 3); g.lineTo(x - 1, y - 9); g.moveTo(x + 1.5, y - 3); g.lineTo(x + 1.8, y - 10.5); g.moveTo(x + 1.5, y - 3); g.lineTo(x + 4.5, y - 8.5); g.stroke(); g.fillStyle = '#c8643c'; g.fillRect(x - 1, y - 3.5, 5, 4.2); }   // a plant in a pot
    else if (k === 4) crate(g, x - 3.5, y + 7.5);   // the radio crew's equipment case, by its handle
    else if (k === 5) { g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 3, y - 1); g.lineTo(x + 4.5, y - 1); g.stroke(); g.fillStyle = '#fff'; g.fillRect(x - 0.5, y - 4.2, 2.6, 3); }   // the waiter's tray, a cup on it
  }

  /** What a figure does next: a job somewhere on the level it stands on, or a ladder or lift to another level. */
  function plan(st, w, p) {
    const P = w.pl, ways = st.ways; ways.length = 0;
    for (const k of P.links) if (k.at <= p && p < k.off) ways.push(k);
    for (const k of P.lifts) if (k.L.at <= p) ways.push(k);
    w.go = null; w.hold = 0;
    if (ways.length && Math.random() < 0.4) { const k = w.go = ways[Math.floor(Math.random() * ways.length)]; w.tx = k.L ? U.clamp(k.L.x, P.x1, P.x2) : k.x; }
    else { w.tx = P.x1 + Math.random() * (P.x2 - P.x1); w.task = p < 0.14 ? 'survey' : Math.random() < 0.25 ? 'break' : 'hammer'; w.hold = w.task === 'hammer' && Math.random() < 0.5 ? 1 : 0; }
    w.st = 'walk'; w.dir = w.tx < w.x ? -1 : 1;
  }
  function letGo(w) { if (w.hold) { w.hold = 0; w.fall = {x: w.x, y: w.y - 17, fy: w.pl.y - 1, t: 0}; } }
  function scare(w, by) {
    if (w.st === 'ride' || w.st === 'climb' || w.st === 'gone' || w.A.hid) return false;   // on a ladder or in the cage there is nowhere to run
    letGo(w); w.go = null; w.dir = by && by.x > w.x ? -1 : 1;
    if (w.dir < 0 ? w.x < w.pl.x1 + 12 : w.x > w.pl.x2 - 12) w.dir = -w.dir;   // cornered at the end of the tile: past it, the other way
    w.st = 'flee'; w.tt = 2.2; SEEN.flees++; return true;
  }
  function carry(w, by) {
    if (w.st === 'gone' || w.A.hid || !by) return false;
    letGo(w); w.go = null; w.st = 'gone'; w.gone = {t: 0, secs: +by.secs || 3, x0: w.x, y0: w.y, pl: w.pl, bx: by.x, by: by.y, out: by.out || null}; SEEN.carries++; return true;
  }
  /** The level nearest a point: where a figure that was set down anywhere finds its feet. */
  function landing(st, x, y, p) {
    let best = st.plats[0], bd = 1e9;
    for (const P of st.plats) { if (P.i && (P.at > p || P.off <= p)) continue; const d = Math.abs(P.y - y) + Math.max(0, P.x1 - x, x - P.x2) * 2; if (d < bd) { bd = d; best = P; } }
    return best;
  }
  function step(st, w, dt, p, c) {
    const a = w.st;
    if (a === 'gone') {
      const G = w.gone; G.t += dt;
      if (G.t < 0.5) { w.x = U.lerp(G.x0, G.bx, G.t * 2); w.y = U.lerp(G.y0, G.by, G.t * 2); }
      else if (G.t > 0.5 + G.secs) {   // back: where it was told, or where it stood
        if (G.out) { w.pl = landing(st, G.out.x, G.out.y, p); w.x = U.clamp(G.out.x, w.pl.x1, w.pl.x2); } else { w.pl = G.pl; w.x = G.x0; }
        w.y = w.pl.y; w.gone = null; plan(st, w, p);
      }
      w.A.hid = !!w.gone && w.gone.t >= 0.5; return;
    }
    if (w.pl.i && w.pl.at > p && a !== 'climb' && a !== 'ride') { w.pl = st.plats[0]; w.y = w.pl.y; plan(st, w, p); }   // the cycle was wound back: this level is not built yet
    if (a !== 'flee') { const th = c.scene.near('threat', w.x, w.y, 120); if (th && Math.abs(th.y - w.y) < 70) scare(w, th); }
    if (w.st === 'flee') { w.ph += dt * 22; w.x = U.clamp(w.x + w.dir * 95 * dt, w.pl.x1, w.pl.x2); if ((w.tt -= dt) <= 0) plan(st, w, p); }
    else if (a === 'walk') {
      const d = w.tx - w.x, v = (w.hold ? 26 : 36) * dt; w.ph += dt * (w.hold ? 8 : 11);
      if (Math.abs(d) > v) { w.x += d < 0 ? -v : v; return; }
      w.x = w.tx; w.ph = 0;
      if (!w.go) { w.st = 'task'; w.hold = 0; w.tt = w.task === 'break' ? 7 + Math.random() * 6 : 3 + Math.random() * 5; }
      else if (w.go.L) { w.st = 'wait'; w.tt = 25; w.dir = w.go.L.x < w.x ? -1 : 1; }
      else { w.st = 'climb'; w.to = w.go.a === w.pl ? w.go.b : w.go.a; SEEN.climbs++; }
    }
    else if (a === 'task') { w.ph += dt * (w.task === 'hammer' ? 9 : 1.1); if ((w.tt -= dt) <= 0) plan(st, w, p); }
    else if (a === 'climb') {
      const d = w.to.y - w.y, v = 24 * dt; w.ph += dt * 9;
      if (Math.abs(d) > v) w.y += d < 0 ? -v : v;
      else { w.pl = w.to; w.y = w.pl.y; w.x = U.clamp(w.x, w.pl.x1, w.pl.x2); plan(st, w, p); }
    }
    else if (a === 'wait') {
      const L = w.go.L;
      if (L.wait > 0.4 && L.cur === w.go.s) { w.st = 'ride'; w.lift = L; do { w.dest = Math.floor(Math.random() * L.stops.length); } while (w.dest === L.cur); SEEN.rides++; }
      else if ((w.tt -= dt) <= 0) plan(st, w, p);   // tired of waiting
    }
    else if (a === 'ride') {
      const L = w.lift; w.x += (L.x - w.x) * Math.min(1, dt * 8); w.y = L.y;
      if (L.wait > 0 && L.wait < 1.6 && L.cur === w.dest) { const ps = L.stops[L.cur].plats; w.pl = ps[Math.floor(Math.random() * ps.length)]; w.y = w.pl.y; w.x = U.clamp(L.x, w.pl.x1, w.pl.x2); w.lift = null; plan(st, w, p); }
    }
  }

  // ---------- the finished building: the people who live in it ----------
  const odds = (a, night) => night ? (a.home ? 0.8 : 0.3) : (a.home ? 0.12 : 0.03);   // how likely a household has its light on
  /** The lift that serves an apartment's floor from below, or null: {L, s}. */
  function rideFor(a) { const P = a.T.plat; if (P) for (const k of P.lifts) if (k.s < k.L.stops.length - 1) return k; return null; }
  function lean(st, q) {
    const ws = q.home.wins, w = q.win = ws[Math.floor(Math.random() * ws.length)];
    q.mode = 'open'; q.o = 0; q.x = w.x + w.w / 2; q.y = w.y + w.h; q.wv = 0; q.find = 1.5; q.solo = 0; q.dir = Math.random() < 0.5 ? -1 : 1;
    if (Math.random() < 0.5) for (const o of st.ten) if (o !== q && o.mode === 'in' && !o.want) { o.want = 'lean'; o.tt = 1 + Math.random() * 2; break; }   // often someone else hears the window and comes to theirs
  }
  /** Someone at a window looks for somebody to wave to: another tenant leaning out or out of doors, else anyone on the ground. */
  function greet(st, q, c) {
    let m = null, bd = 1e9, mx = 0;
    for (const o of st.ten) if (o !== q && !(o.wv > 0) && (o.mode === 'lean' || ((o.mode === 'out' || o.mode === 'come') && o.al >= 1))) { const d = Math.abs(o.x - q.x) + Math.abs(o.y - q.y); if (d < bd) { bd = d; m = o; } }
    if (m) mx = m.x;
    else { const o = c.scene.near('person', q.x, c.h - 2, 600, q.A); if (o && o.y > c.h - 30) mx = o.x; else if (q.solo) return; else mx = q.x + q.dir; }
    q.solo = 1; q.dir = mx < q.x ? -1 : 1; q.wv = m ? 4.8 : 2.4; q.wo = 0; SEEN.waves++; SEEN.x = q.x; SEEN.y = q.y;
    if (m) { q.tt = Math.max(q.tt, 5.5); m.wv = 4.8; m.wo = 1; m.dir = q.x < m.x ? -1 : 1; if (m.mode === 'lean') m.tt = Math.max(m.tt, 5.5); }   // they take turns
  }
  /** A tenant is frightened: one on the ground runs for the door, one at a window ducks in and shuts it. */
  function shoo(st, q) {
    const m = q.mode;
    if (m === 'out' || m === 'come') { q.mode = 'run'; q.tx = st.door.x; q.wv = 0; q.al = 1; SEEN.flees++; return true; }
    if (m === 'open' || m === 'lean') { q.mode = 'shut'; q.wv = 0; SEEN.flees++; return true; }
    return false;
  }
  function dwell(st, q, c, dt, night) {
    const a = q.home, D = st.door, m = q.mode, L = q.lift;
    if (m === 'in') {
      if ((q.tt -= dt) > 0) return;
      const k = q.want || (Math.random() < 0.3 ? 'peek' : Math.random() < 0.5 || !D ? 'lean' : 'out'); q.want = '';
      if (k === 'peek') { q.mode = 'peek'; q.tt = 8 + Math.random() * 14; q.win = a.wins[Math.floor(Math.random() * a.wins.length)]; if (night) a.on = true; }
      else if (k === 'lean') lean(st, q);
      else { const R = rideFor(a); a.on = false; q.mode = R ? 'down0' : 'hall'; q.lift = R ? R.L : null; q.dest = R ? R.s : 0; q.tt = R ? 45 : 3; }
    }
    else if (m === 'peek' || m === 'home') { if ((q.tt -= dt) <= 0) { if (m === 'home') a.on = true; q.mode = 'in'; q.tt = 10 + Math.random() * 30; } }   // home: the light goes on a moment after the lift
    else if (m === 'open') { if ((q.o += dt * 2) >= 1) { q.o = 1; q.mode = 'lean'; q.tt = 9 + Math.random() * 8; } }
    else if (m === 'lean') {
      q.tt -= dt;
      if (q.wv > 0) q.wv -= dt; else if ((q.find -= dt) <= 0) { q.find = 2.5; greet(st, q, c); }
      if (q.tt <= 0 && q.wv <= 0) q.mode = 'shut';
    }
    else if (m === 'shut') { q.wv = 0; if ((q.o -= dt * 3) <= 0) { q.o = 0; q.mode = 'in'; q.tt = 10 + Math.random() * 30; } }
    else if (m === 'down0' || m === 'up0') {   // out of sight, waiting for the cage: at the bottom to go up, at their own floor to go down
      if (L.wait > 0.4 && L.cur === (m === 'up0' ? L.stops.length - 1 : q.dest)) { q.mode = m === 'up0' ? 'up' : 'down'; SEEN.rides++; SEEN.x = L.x; SEEN.y = L.y; }
      else if ((q.tt -= dt) <= 0) { q.mode = m === 'up0' ? 'home' : 'hall'; q.tt = 2; }   // tired of waiting: the stairs
    }
    else if (m === 'down' || m === 'up') {
      q.x = L.x; q.y = L.y - 1;
      if (L.wait > 0 && L.cur === (m === 'up' ? q.dest : L.stops.length - 1)) { q.mode = m === 'up' ? 'home' : 'hall'; q.tt = 1.4; }
    }
    else if (m === 'hall') { if ((q.tt -= dt) <= 0) { q.mode = 'out'; q.x = D.x; q.y = st.py; q.al = -0.6; q.tx = Math.random() < 0.5 ? -24 : c.w + 24; q.item = Math.random() < 0.35 ? 1 + Math.floor(Math.random() * 3) : 0; q.st = 'walk'; q.dir = q.tx < q.x ? -1 : 1; st.hold = 1.6; SEEN.exits++; } }
    else if (m === 'away') { if ((q.tt -= dt) <= 0) { q.mode = 'come'; q.x = Math.random() < 0.5 ? -24 : c.w + 24; q.y = st.py; q.al = 1; q.tx = D.x; q.item = Math.random() < 0.55 ? 1 + Math.floor(Math.random() * 3) : 0; q.st = 'walk'; } }
    else if (m === 'enter') {
      q.st = 'walk'; q.ph += dt * 11;
      if ((q.al -= dt * 2.5) <= 0) { const R = rideFor(a); q.al = 1; q.item = 0; q.mode = R ? 'up0' : 'home'; q.lift = R ? R.L : null; q.dest = R ? R.s : 0; q.tt = R ? 50 : 3; SEEN.entries++; }
    }
    else {   // out of doors: 'out' walking off, 'come' toward the door, 'run' for it
      const run = m === 'run', d = q.tx - q.x, v = (run ? 95 : q.item ? 30 : 36) * dt;
      if (q.al < 1) { q.al = Math.min(1, q.al + dt * 2.5); if (q.al < 0.3) return; }   // still in the doorway
      if (!run) { const th = c.scene.near('threat', q.x, q.y, 120); if (th && Math.abs(th.y - q.y) < 70 && shoo(st, q)) return; }
      if (q.wv > 0 && !run) { q.wv -= dt; q.st = 'wave'; q.ph += dt * 12; return; }
      q.st = run ? 'flee' : 'walk'; q.dir = d < 0 ? -1 : 1; q.ph += dt * (run ? 22 : q.item ? 9 : 11);
      if (m !== 'out' && !q.off && Math.abs(d) < 36) st.hold = Math.max(st.hold, 0.6);
      if (Math.abs(d) > v) q.x += d < 0 ? -v : v;
      else if (m === 'out' || q.off) { q.off = 0; q.mode = 'away'; q.tt = 15 + Math.random() * 40; }
      else { q.x = q.tx; q.mode = 'enter'; st.hold = Math.max(st.hold, 0.9); }
    }
  }
  /** Someone seen through the glass: head and shoulders at the foot of a window, fx of the way across it, arms up if asked. */
  function shade(g, w, fx, col, arms, t, up) {
    const cx = w.x + w.w * fx, cy = w.y + w.h - 11 - up;
    g.fillStyle = col; g.beginPath(); g.arc(cx, cy, 3.2, 0, TAU); g.rect(cx - 5, cy + 3.6, 10, 6.4 + up); g.fill();
    if (arms) { const k = Math.sin(t * 14) * 1.2; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 4.5, cy + 5); g.lineTo(cx - 7, cy - 3 + k); g.moveTo(cx + 4.5, cy + 5); g.lineTo(cx + 7, cy - 3 - k); g.stroke(); }
  }
  /** An open window and whoever leans out of it: casement panes swing out to the sides, a sash goes up. */
  function leanOut(g, q, t) {
    const w = q.win, o = q.o, sy = w.y + w.h, a = q.home;
    g.fillStyle = a.on ? 'rgba(226,180,104,.94)' : 'rgba(14,16,28,.82)';
    if (a.sash) { const top = sy - w.h * 0.56 * o; g.fillRect(w.x + 1, top, w.w - 2, sy - top - 1); g.fillStyle = INK; g.fillRect(w.x + 1, top - 1, w.w - 2, 1.4); }
    else {
      const k = (w.w / 2 - 1) * o; g.fillRect(w.x + w.w / 2 - k, w.y + 1, 2 * k, w.h - 2);
      g.strokeStyle = 'rgba(244,239,230,.85)'; g.lineWidth = 1; g.fillStyle = 'rgba(190,222,246,.32)';
      for (let s = -1; s < 2; s += 2) { const x0 = s < 0 ? w.x : w.x + w.w, x1 = x0 + s * 7 * o; g.beginPath(); g.moveTo(x0, w.y); g.lineTo(x1, w.y + 3 * o); g.lineTo(x1, sy + 3 * o); g.lineTo(x0, sy); g.closePath(); g.fill(); g.stroke(); }
    }
    if (q.mode !== 'lean' && o < 0.7) return;
    const cx = q.x + Math.sin(t * 0.8 + q.x) * 2.2, hx = cx + q.dir * 1.2, hy = sy - 11;
    g.lineCap = 'round';
    g.fillStyle = q.col; g.fillRect(cx - 5.5, sy - 7.5, 11, 6.5);
    g.fillStyle = HALO; g.beginPath(); g.arc(hx, hy, 4.3, 0, TAU); g.fill(); g.fillStyle = INK; g.beginPath(); g.arc(hx, hy, 3.4, 0, TAU); g.fill();
    g.fillStyle = q.hair; g.beginPath(); g.arc(hx, hy - 0.4, 3.6, Math.PI, 0); g.fill(); g.fillStyle = '#222'; g.fillRect(hx + q.dir * 1.7 - 0.5, hy - 0.2, 1, 1.1);
    for (let k = 0; k < 2; k++) {   // folded arms on the sill; one comes up to wave
      g.strokeStyle = k ? INK : HALO; g.lineWidth = k ? 2.2 : 4.4; g.beginPath(); g.moveTo(cx - 6.5, sy - 0.8); g.lineTo(cx + 6.5, sy - 0.8);
      if (q.up) { g.moveTo(cx + q.dir * 5, sy - 6); g.lineTo(cx + q.dir * (9.5 + 2.4 * Math.sin(t * 11)), sy - 17); }
      g.stroke();
    }
  }

  /** The hidden sheet with everything that stands still, painted again only when the work has visibly moved on. */
  function still(st, c, paint) {
    const key = Math.round(c.progress * 250) * 2 + (c.env.night ? 1 : 0) + (st.xmas ? 1000 : 0) + (st.sign && st.sign.flat > 0 ? 2000 : 0);
    if (!st.cv) { st.cv = document.createElement('canvas'); st.cv.width = c.w; st.cv.height = c.h; st.key = -1; }
    if (key !== st.key) { st.key = key; const g = st.cv.getContext('2d'); g.clearRect(0, 0, c.w, c.h); g.save(); paint(g); g.restore(); }
    return st.cv;
  }
  function paintSite(g, st, c, p) {
    const night = !!c.env.night, done = U.span(p, 0.92, 0.96), gy = st.py;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const T of st.tiles) {
      const b = T.b, X = b.x + b.w, Y = b.y + b.h;
      // stakes and string: the plot is marked out before anything is built
      const sv = U.span(p, T.stk, T.stk + 0.02) * (1 - U.span(p, T.at, T.at + 0.04));
      if (sv > 0.02) {
        g.globalAlpha = sv; g.strokeStyle = '#ff9a3c'; g.lineWidth = 1; g.setLineDash([5, 4]); g.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4); g.setLineDash([]);
        for (let k = 0; k < 4; k++) {
          const x = k & 1 ? X + 2 : b.x - 2, y = k & 2 ? Y + 2 : b.y - 2;
          g.strokeStyle = WOOD; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x, y - 6); g.stroke();
          g.fillStyle = '#ff5a3c'; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y - 4); g.lineTo(x, y - 2); g.fill();
        }
      }
      // scaffolding: a bay of poles down each side, rising from the foot of the tile; planks across the top; a ladder in the left bay
      const up = U.span(p, T.at, T.at + 0.1), al = 1 - U.span(p, T.off, T.off + 0.03);
      if (up > 0.02 && al > 0.02) {
        const y0 = Y - up * b.h; g.globalAlpha = al;
        g.strokeStyle = STEEL + '.8)'; g.lineWidth = 1.3; g.beginPath();
        g.moveTo(b.x - 2, Y + 2); g.lineTo(b.x - 2, y0); g.moveTo(b.x + 7, Y + 2); g.lineTo(b.x + 7, y0); g.moveTo(X - 7, Y + 2); g.lineTo(X - 7, y0); g.moveTo(X + 2, Y + 2); g.lineTo(X + 2, y0);
        for (let y = Y - 4; y > y0; y -= 20) { g.moveTo(b.x - 2, y); g.lineTo(b.x + 7, y); g.moveTo(X - 7, y); g.lineTo(X + 2, y); }
        g.stroke();
        g.strokeStyle = STEEL + '.45)'; g.lineWidth = 1; g.beginPath();
        for (let y = Y - 4, k = 0; y - 20 > y0; y -= 20, k++) { g.moveTo(k & 1 ? X - 7 : X + 2, y); g.lineTo(k & 1 ? X + 2 : X - 7, y - 20); }
        g.stroke();
        if (up > 0.97) { g.strokeStyle = WOOD; g.lineWidth = 2.4; g.beginPath(); g.moveTo(b.x - 3, b.y - 1); g.lineTo(X + 3, b.y - 1); g.stroke(); }
        const k = T.lad;
        if (k && k.at <= p) {
          g.strokeStyle = WOOD; g.lineWidth = 1.2; g.beginPath(); g.moveTo(k.x - 3, k.a.y - 5); g.lineTo(k.x - 3, k.b.y); g.moveTo(k.x + 3, k.a.y - 5); g.lineTo(k.x + 3, k.b.y);
          for (let y = k.b.y - 4; y > k.a.y - 4; y -= 5) { g.moveTo(k.x - 3, y); g.lineTo(k.x + 3, y); }
          g.stroke();
        }
      }
    }
    g.globalAlpha = 1;
    // floors, then brickwork: light marks at the edges, clear of the tile's name and symbol
    g.strokeStyle = 'rgba(244,239,230,.3)'; g.lineWidth = 1; g.beginPath();
    for (const f of st.rows) if (f.at <= p) { g.moveTo(f.x0, f.y); g.lineTo(f.x1, f.y); }
    for (const T of st.tiles) if (T.wall && T.win <= p) { g.moveTo(T.wall.x1, T.wall.y1); g.lineTo(T.wall.x2, T.wall.y2); }   // the wall two apartments share
    g.stroke();
    g.strokeStyle = 'rgba(232,150,116,.42)'; g.lineWidth = 1.8; g.beginPath();
    for (const k of st.bricks) if (k.at <= p) for (let row = 0; row < k.n; row++) for (let i = 0; i < 3; i++) { const x = k.x + i * 9 + (row & 1) * 4.5, y = k.y + row * 4; g.moveTo(x, y); g.lineTo(x + 6, y); }
    g.stroke();
    // windows: glass, frames, and once people have moved in, curtains and light
    // (the light itself changes, so it is put on top every frame; the sheet has the dark glass)
    g.fillStyle = night ? 'rgba(16,20,36,.3)' : 'rgba(190,222,246,.17)'; g.beginPath(); for (const a of st.apts) if (a.at + 0.03 <= p) for (const w of a.wins) g.rect(w.x, w.y, w.w, w.h); g.fill();
    if (done > 0.05) {
      g.globalAlpha = done;
      for (let k = 0; k < 3; k++) {
        g.fillStyle = CURT[k]; g.beginPath();
        for (const a of st.apts) if (a.cur === k) for (const w of a.wins) {
          g.moveTo(w.x, w.y); g.lineTo(w.x + w.w * 0.36, w.y); g.quadraticCurveTo(w.x + w.w * 0.3, w.y + w.h * 0.5, w.x, w.y + w.h * 0.84);
          g.moveTo(w.x + w.w, w.y); g.lineTo(w.x + w.w * 0.64, w.y); g.quadraticCurveTo(w.x + w.w * 0.7, w.y + w.h * 0.5, w.x + w.w, w.y + w.h * 0.84);
        }
        g.fill();
      }
      g.globalAlpha = 1;
    }
    g.strokeStyle = 'rgba(244,239,230,.66)'; g.lineWidth = 1.2; g.beginPath();
    for (const a of st.apts) if (a.at <= p) for (const w of a.wins) {
      g.rect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
      if (a.sash) { g.moveTo(w.x + 1, w.y + Math.round(w.h * 0.44) + 0.5); g.lineTo(w.x + w.w - 1, w.y + Math.round(w.h * 0.44) + 0.5); } else { g.moveTo(w.x + Math.round(w.w / 2) + 0.5, w.y + 1); g.lineTo(w.x + Math.round(w.w / 2) + 0.5, w.y + w.h - 1); }
      g.moveTo(w.x - 2.5, w.y + w.h + 2); g.lineTo(w.x + w.w + 2.5, w.y + w.h + 2);
    }
    g.stroke();
    // what makes one apartment differ from the next: flowers under the window, a balcony rail, an air conditioner, and its number
    g.font = '600 8px sans-serif'; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    for (const a of st.apts) {
      if (a.at + 0.05 > p) continue;
      const w = a.wins[0], sy = w.y + w.h + 3;
      if (a.det === 2) {
        const x1 = a.x + a.w - 14, x0 = x1 - Math.min(64, a.w * 0.34), y = a.y + a.h - 1.5;
        g.strokeStyle = 'rgba(244,239,230,.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0, y - 9); g.lineTo(x1, y - 9); for (let x = x0; x <= x1 + 0.5; x += (x1 - x0) / Math.round((x1 - x0) / 5)) { g.moveTo(x, y - 9); g.lineTo(x, y); } g.stroke();
      }
      else if (a.det === 3) { const x = w.x + w.w - 15; g.fillStyle = 'rgba(214,220,228,.8)'; g.fillRect(x, sy, 14, 8); g.fillStyle = 'rgba(40,46,60,.7)'; g.fillRect(x + 1.5, sy + 2, 11, 1); g.fillRect(x + 1.5, sy + 4.5, 11, 1); }
      if (done < 0.05) continue;
      g.globalAlpha = done;
      if (a.det === 1) {
        g.fillStyle = 'rgba(150,96,62,.9)'; g.fillRect(w.x + 1, sy + 0.5, w.w - 2, 4.5);
        for (let x = w.x + 3.5, k = 0; x < w.x + w.w - 2; x += 4.5, k++) { g.fillStyle = k & 1 ? '#6cc070' : BLOOM[a.fl]; g.beginPath(); g.arc(x, sy - (k & 1 ? 0.2 : 1), k & 1 ? 1.5 : 1.9, 0, TAU); g.fill(); }
      }
      if (a.plate) { const l = a.wins[a.wins.length - 1]; g.fillStyle = 'rgba(244,239,230,.42)'; g.fillText(a.num, l.x - 5, l.y + 8); }
      if (st.xmas && a.deck === 1) {   // December: a tree stands in the window, a star on top (its lights are put on each frame)
        const x = w.x + w.w / 2, y = w.y + w.h - 3, h = firH(w);
        g.fillStyle = 'rgba(104,70,48,.95)'; g.fillRect(x - 1.2, y - 0.5, 2.4, 2.5);
        g.fillStyle = FIR; g.strokeStyle = 'rgba(10,36,22,.85)'; g.lineWidth = 1; g.beginPath(); fir(g, w); g.fill(); g.stroke();
        for (let k = 0; k < 6; k++) { g.fillStyle = GLOW[k % 3]; g.fillRect(x + BAUB[k * 2] * h * 0.4 - 0.8, y - h + BAUB[k * 2 + 1] * h - 0.8, 1.6, 1.6); }
        g.strokeStyle = '#ffd84a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 2.6, y - h); g.lineTo(x + 2.6, y - h); g.moveTo(x, y - h - 2.6); g.lineTo(x, y - h + 2.6); g.moveTo(x - 1.6, y - h - 1.6); g.lineTo(x + 1.6, y - h + 1.6); g.moveTo(x + 1.6, y - h - 1.6); g.lineTo(x - 1.6, y - h + 1.6); g.stroke();
      }
      else if (st.xmas && a.deck === 2) {   // or a wreath on the wall beside the window, a red bow at its foot
        const x = w.x + w.w + 8.5, y = w.y + w.h * 0.42;
        g.strokeStyle = HALO; g.lineWidth = 5; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.stroke(); g.strokeStyle = FIR; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.stroke();
        g.fillStyle = '#7ad08a'; for (let k = 0; k < 5; k++) g.fillRect(x + Math.cos(k * 1.26 - 2.4) * 4 - 0.6, y + Math.sin(k * 1.26 - 2.4) * 4 - 0.6, 1.2, 1.2);
        g.fillStyle = '#e0362e'; g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x - 3.6, y + 2.2); g.lineTo(x - 3.6, y + 5.8); g.closePath(); g.moveTo(x, y + 4); g.lineTo(x + 3.6, y + 2.2); g.lineTo(x + 3.6, y + 5.8); g.closePath(); g.moveTo(x, y + 4); g.lineTo(x - 2, y + 8); g.lineTo(x - 0.4, y + 7.6); g.closePath(); g.moveTo(x, y + 4); g.lineTo(x + 2, y + 8); g.lineTo(x + 0.4, y + 7.6); g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
    }
    // lift shafts: two guide rails with ties, built from the ground up, and the winding gear on top
    for (const L of st.lifts) {
      const q = U.span(p, L.at - 0.07, L.at); if (q < 0.02) continue;
      const y0 = U.lerp(L.y2, L.y1 - 22, q);
      g.strokeStyle = STEEL + '.6)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(L.x - 6.5, L.y2); g.lineTo(L.x - 6.5, y0); g.moveTo(L.x + 6.5, L.y2); g.lineTo(L.x + 6.5, y0);
      for (let y = L.y2 - 12; y > y0; y -= 24) { g.moveTo(L.x - 6.5, y); g.lineTo(L.x + 6.5, y); }
      g.stroke();
      if (q > 0.98) { g.fillStyle = STEEL + '.85)'; g.fillRect(L.x - 7.5, y0 - 4, 15, 4); }
    }
    // the tower crane: mast on the highest tile, long jib toward the middle of the screen, counterweight on the short arm
    const K = st.crane, ka = K ? U.span(p, 0.55, 0.61) * (1 - U.span(p, 0.88, 0.92)) : 0;
    if (ka > 0.02) {
      g.globalAlpha = ka; g.strokeStyle = 'rgba(255,198,42,.9)'; g.lineWidth = 1.3; g.beginPath();
      g.moveTo(K.x - 3, K.y); g.lineTo(K.x - 3, K.jy); g.moveTo(K.x + 3, K.y); g.lineTo(K.x + 3, K.jy);
      for (let y = K.y, k = 0; y - 7 > K.jy; y -= 7, k++) { g.moveTo(K.x + (k & 1 ? 3 : -3), y); g.lineTo(K.x + (k & 1 ? -3 : 3), y - 7); }
      const xa = K.x + K.d * K.len, xb = K.x - K.d * 30;
      g.moveTo(xb, K.jy); g.lineTo(xa, K.jy); g.moveTo(xb, K.jy + 4); g.lineTo(xa, K.jy + 4);
      for (let x = Math.min(xa, xb), k = 0; x + 8 <= Math.max(xa, xb); x += 8, k++) { g.moveTo(x, K.jy + (k & 1 ? 4 : 0)); g.lineTo(x + 8, K.jy + (k & 1 ? 0 : 4)); }
      g.moveTo(xa, K.jy); g.lineTo(K.x, K.jy - 5); g.lineTo(xb, K.jy);
      g.stroke();
      g.fillStyle = 'rgba(150,158,170,.9)'; g.fillRect(Math.min(xb, xb + K.d * 10), K.jy + 4, 10, 6);
      g.fillStyle = 'rgba(255,198,42,.9)'; g.fillRect(K.x + (K.d > 0 ? 3 : -11), K.jy + 5, 8, 7);
      g.globalAlpha = 1;
    }
    // finished: a parapet and an aerial on every roof, the front door with its awning, and the sign
    const fin = U.span(p, 0.88, 0.94);
    if (fin > 0.02) {
      g.globalAlpha = fin; g.strokeStyle = 'rgba(244,239,230,.75)'; g.lineWidth = 1.4; g.beginPath();
      for (const T of st.tiles) if (T.roof) {
        const b = T.b, rr = Math.min(b.r || 0, b.w / 2) * 0.5; g.moveTo(b.x + rr, b.y - 2.5); g.lineTo(b.x + b.w - rr, b.y - 2.5);
        if (T.roof > 1) { const x = b.x + b.w * 0.3; g.moveTo(x, b.y - 3); g.lineTo(x, b.y - 17); g.moveTo(x - 4, b.y - 14); g.lineTo(x + 4, b.y - 14); g.moveTo(x - 2.5, b.y - 10.5); g.lineTo(x + 2.5, b.y - 10.5); }
      }
      g.stroke();
      const E = st.door;
      if (E) {
        const x = E.x, t = gy - 30;
        g.fillStyle = night ? 'rgba(255,206,112,.7)' : 'rgba(58,40,30,.62)'; g.fillRect(x - 11, t, 22, 30);
        g.strokeStyle = INK; g.lineWidth = 1.3; g.strokeRect(x - 11, t, 22, 30); g.beginPath(); g.moveTo(x, t + 6); g.lineTo(x, gy); g.moveTo(x - 11, t + 6); g.lineTo(x + 11, t + 6); g.moveTo(x - 17, gy); g.lineTo(x + 17, gy); g.stroke();
        g.fillStyle = INK; g.fillRect(x - 3.5, t + 17, 1.6, 3.4); g.fillRect(x + 1.9, t + 17, 1.6, 3.4);
        for (let k = 0; k < 6; k++) { g.fillStyle = k & 1 ? 'rgba(250,247,238,.92)' : 'rgba(214,58,52,.92)'; g.beginPath(); g.moveTo(x - 15 + k * 5, t - 9); g.lineTo(x - 10 + k * 5, t - 9); g.lineTo(x - 11.5 + k * 6.5, t - 1); g.lineTo(x - 18 + k * 6.5, t - 1); g.fill(); }   // striped awning, wider at its front edge
      }
      paintStreet(g, st, c, night);
      g.globalAlpha = 1;
    }
    const S = st.sign;
    if (S && done > 0.02 && S.flat > 0) {   // trodden flat: it springs back later
      g.globalAlpha = done; g.strokeStyle = WOOD; g.lineWidth = 2.6; g.beginPath(); g.moveTo(S.x - 8, gy - 1.5); g.lineTo(S.x + 30, gy - 1.5); g.stroke();
      g.fillStyle = 'rgba(252,249,240,.97)'; g.fillRect(S.x - 34, gy - 4.5, 52, 4.5); g.strokeStyle = '#c8322c'; g.lineWidth = 1.2; g.strokeRect(S.x - 33.5, gy - 4, 51, 3.5); g.globalAlpha = 1;
    }
    else if (S && done > 0.02) {
      g.globalAlpha = done;
      g.strokeStyle = HALO; g.lineWidth = 4.5; g.beginPath(); g.moveTo(S.x, gy); g.lineTo(S.x, gy - 22); g.stroke();
      g.strokeStyle = WOOD; g.lineWidth = 2.6; g.beginPath(); g.moveTo(S.x, gy); g.lineTo(S.x, gy - 22); g.stroke();
      g.fillStyle = 'rgba(252,249,240,.97)'; g.fillRect(S.x - 26, gy - 38, 52, 17); g.strokeStyle = '#c8322c'; g.lineWidth = 1.6; g.strokeRect(S.x - 25, gy - 37, 50, 15);
      g.fillStyle = '#c8322c'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FOR RENT', S.x, gy - 29);
      g.globalAlpha = 1;
    }
  }

  // ---------- the street: pavement and kerb, shops along the bottom row, parked cars, and the people out on the pavement ----------
  const CARCOL = ['#e8645a', '#5aa9e8', '#e8b84a', '#7cc46a', '#d6d6dc', '#b37ae0'], SHOPS = ['BISTRO', 'BAKERY', 'BOOKS', 'FLOWERS', 'GROCER'], TRIM = ['#d63a34', '#e8b84a', '#5aa9e8', '#ef8fb8', '#7cc46a'], PETS = [WOOD, '#d6d6dc', '#3a2a22'];
  // three cars, nose to the right, wheels on y = 0: the outline, the glass, how far out the wheels sit. Hatchback, van, small truck.
  const CARS = [
    [[-19, -4, -19, -10, -13, -11, -8, -17, 6, -17, 12, -11, 19, -9.5, 19, -4], [-11, -11.5, -7, -15.5, 5, -15.5, 9.5, -11.5], 11],
    [[-22, -4, -22, -18, 10, -18, 16, -12, 22, -10.5, 22, -4], [8, -16.5, 11, -16.5, 15, -12, 8, -12], 14],
    [[-22, -4, -22, -10.5, -2, -10.5, -2, -17.5, 8, -17.5, 13, -11.5, 22, -10, 22, -4], [0, -16, 7, -16, 11, -11.5, 0, -11.5], 14]];
  /** How far across a tile its lettering reaches in the part a shopfront would cover, 0 to 1: measured once from the tile's own element. */
  function textEdge(b) {
    let f = 0; const el = b.el;
    try {
      const R = el.getBoundingClientRect(), tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), rg = document.createRange(); if (!R.width) return 0.55;
      for (let o = tw.nextNode(); o; o = tw.nextNode()) { if (!o.nodeValue.trim()) continue; rg.selectNodeContents(o); const q = rg.getBoundingClientRect(); if (q.width && (q.bottom - R.top) / R.height > 1 - 70 / b.h) f = Math.max(f, (q.right - R.left) / R.width); }
    } catch (e) { return 0.55; }
    return Math.min(f, 1);
  }
  function poly(g, P, sx, sy) { g.beginPath(); g.moveTo(P[0] * sx, P[1] * sy); for (let i = 2; i < P.length; i += 2) g.lineTo(P[i] * sx, P[i + 1] * sy); g.closePath(); }
  /** A car at x with its wheels on y: whole, or flat after something very heavy came down on it (wheels splayed, glass about). */
  function auto(g, k, x, y, al) {
    const M = CARS[k.type], f = k.st === 'flat' || k.st === 'tow', sx = f ? 1.12 : 1, sy = f ? 0.3 : 1;
    g.save(); g.translate(x, y); g.lineJoin = g.lineCap = 'round';
    poly(g, M[0], sx, sy); g.strokeStyle = HALO; g.lineWidth = 3.6; g.stroke(); g.fillStyle = k.col; g.globalAlpha = al * 0.5; g.fill(); g.globalAlpha = al; g.strokeStyle = k.col; g.lineWidth = 1.5; g.stroke();
    poly(g, M[1], sx, sy); g.fillStyle = 'rgba(190,222,246,.6)'; g.fill();
    g.fillStyle = '#20222c'; g.strokeStyle = INK; g.lineWidth = 1;
    for (let d = -1; d < 2; d += 2) { g.beginPath(); if (f) g.ellipse(d * (M[2] + 7), -1.8, 4.4, 1.8, d * 0.3, 0, TAU); else g.arc(d * M[2], -3.2, 3.2, 0, TAU); g.fill(); g.stroke(); }
    if (f) { g.fillStyle = 'rgba(214,238,250,.95)'; for (let i = 0; i < 8; i++) g.fillRect(((i * 37 + k.slot * 13) % 64) - 32, -1.4 - (i % 3) * 0.9, 1.5, 1.2); }
    g.restore();
  }
  /** Something very heavy came down on a car: flat it stays, a minute or two, till the tow truck comes. */
  function squash(st, k) {
    if (k.st !== 'parked' && k.st !== 'in' && k.st !== 'out') return false;
    k.st = 'flat'; k.t = 0; k.hold = 60 + Math.random() * 60; st.carKey++; st.wreck = k; st.gawk = Math.max(st.gawk, 45); SEEN.stomped++; return true;
  }
  /** The street on the sheet: pavement, kerb and road edge, and each shop: door, window with what it sells, sign and awning, and what stands outside. */
  function paintStreet(g, st, c, night) {
    const py = st.py;
    g.lineCap = 'butt';
    g.strokeStyle = 'rgba(244,239,230,.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, py + 0.5); g.lineTo(c.w, py + 0.5); g.stroke();
    g.strokeStyle = 'rgba(244,239,230,.28)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, py + 3.5); g.lineTo(c.w, py + 3.5); for (let x = 13; x < c.w; x += 26) { g.moveTo(x, py + 0.5); g.lineTo(x, py + 3.5); } g.stroke();
    g.setLineDash([12, 9]); g.beginPath(); g.moveTo(0, c.h - 0.5); g.lineTo(c.w, c.h - 0.5); g.stroke(); g.setLineDash([]);
    g.lineCap = 'round';
    for (const S of st.shops) {
      const Y = S.b.y + S.b.h, W = S.win;
      g.fillStyle = night ? 'rgba(255,206,112,.5)' : 'rgba(58,40,30,.5)'; g.fillRect(S.dx - 7, Y - 34, 14, py - Y + 34);
      g.strokeStyle = 'rgba(244,239,230,.72)'; g.lineWidth = 1.1; g.strokeRect(S.dx - 6.5, Y - 33.5, 13, py - Y + 33.5); g.fillStyle = INK; g.fillRect(S.dx + 3, Y - 14, 1.5, 3);
      if (W) {
        g.fillStyle = night ? 'rgba(255,206,112,.36)' : 'rgba(190,222,246,.2)'; g.fillRect(W.x, W.y, W.w, W.h); g.strokeRect(W.x + 0.5, W.y + 0.5, W.w - 1, W.h - 1);
        const by = W.y + W.h - 2;
        for (let x = W.x + 6, k = 0; x < W.x + W.w - 5; x += 8, k++) {   // what it sells, along the foot of the window
          if (S.type === 1) { g.fillStyle = '#d9a35c'; g.beginPath(); g.ellipse(x, by - 2.5, 3.2, 2.2, 0, 0, TAU); g.fill(); }
          else if (S.type === 2) { g.fillStyle = SHIRT[k % 7]; g.fillRect(x - 3, by - 8, 2.6, 8); g.fillStyle = SHIRT[(k + 3) % 7]; g.fillRect(x, by - 6.5, 2.6, 6.5); }
          else if (S.type === 3) { g.fillStyle = '#6cc070'; g.fillRect(x - 0.5, by - 7, 1, 7); g.fillStyle = BLOOM[k % 3]; g.beginPath(); g.arc(x, by - 8, 2.3, 0, TAU); g.fill(); }
          else if (S.type === 4) { g.fillStyle = k & 1 ? '#f0a03c' : '#e0362e'; g.beginPath(); g.arc(x, by - 2.2, 2.4, 0, TAU); g.fill(); }
        }
        if (!S.type) { g.fillStyle = 'rgba(240,232,214,.5)'; g.fillRect(W.x + 1, W.y + W.h * 0.5, W.w - 2, W.h * 0.5 - 1); }   // the bistro: a half curtain
      }
      g.fillStyle = 'rgba(252,249,240,.86)'; g.fillRect(S.sx, Y - 60, S.sw, 10);
      for (let k = 0, m = Math.round(S.sw / 7), d = (S.sw + 4) / m; k < m; k++) { g.fillStyle = k & 1 ? 'rgba(250,247,238,.86)' : TRIM[S.type]; g.fillRect(S.sx - 2 + k * d, Y - 50, d + 0.3, 5.5); }
      g.fillStyle = '#3a2a22'; g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(SHOPS[S.type], S.sx + S.sw / 2, Y - 54.5);
      g.strokeStyle = INK; g.lineWidth = 1.1;
      for (const x of S.tables) {   // the bistro's tables on the pavement, a chair each side
        g.beginPath(); g.moveTo(x - 5, py - 9); g.lineTo(x + 5, py - 9); g.moveTo(x, py - 9); g.lineTo(x, py);
        for (let d = -1; d < 2; d += 2) { g.moveTo(x + d * 13, py - 12); g.lineTo(x + d * 13, py); g.moveTo(x + d * 13, py - 5.5); g.lineTo(x + d * 8.5, py - 5.5); g.lineTo(x + d * 8.5, py); }
        g.stroke();
      }
      if (W && S.type > 2) for (let k = 0; k < 2; k++) {   // the florist's buckets, the grocer's crates
        const x = W.x + 8 + k * 16;
        if (S.type === 3) { g.fillStyle = 'rgba(170,180,194,.95)'; g.beginPath(); g.moveTo(x - 3.5, py - 7); g.lineTo(x + 3.5, py - 7); g.lineTo(x + 2.5, py); g.lineTo(x - 2.5, py); g.fill(); for (let i = 0; i < 3; i++) { g.fillStyle = BLOOM[(i + k) % 3]; g.beginPath(); g.arc(x - 3 + i * 3, py - 9.5 - (i & 1) * 2, 2, 0, TAU); g.fill(); } }
        else { g.fillStyle = WOOD; g.fillRect(x - 6, py - 6, 12, 6); g.strokeStyle = 'rgba(60,40,20,.8)'; g.lineWidth = 0.7; g.strokeRect(x - 6, py - 6, 12, 6); for (let i = 0; i < 4; i++) { g.fillStyle = (i + k) & 1 ? '#f0a03c' : '#7cc46a'; g.beginPath(); g.arc(x - 4.2 + i * 2.8, py - 7, 1.7, 0, TAU); g.fill(); } }
      }
    }
  }
  /** A dog on a lead, a little ahead of whoever walks it. */
  function mutt(g, w) {
    const k0 = Math.sin(w.ph) * 2.2;
    g.save(); g.translate(w.x + w.dir * 14, w.y); g.scale(w.dir, 1); g.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      g.strokeStyle = g.fillStyle = k ? w.pet : HALO; g.lineWidth = k ? 2.4 : 4.2; g.beginPath(); g.moveTo(-4, -5); g.lineTo(3, -5.4); g.lineTo(5.2, -7.6); g.stroke();
      g.lineWidth = k ? 1.1 : 2.6; g.beginPath(); g.moveTo(-3.5, -4.5); g.lineTo(-3.5 - k0, 0); g.moveTo(-2.5, -4.5); g.lineTo(-2.5 + k0, 0); g.moveTo(2.5, -4.5); g.lineTo(2.5 + k0, 0); g.moveTo(3.3, -4.5); g.lineTo(3.3 - k0, 0); g.moveTo(-4, -5.4); g.lineTo(-6.5, -8.5); g.stroke();
      g.beginPath(); g.arc(5.6, -8, k ? 1.9 : 2.7, 0, TAU); g.fill();
    }
    g.strokeStyle = 'rgba(244,239,230,.7)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(4.2, -6.8); g.lineTo(-10.5, -7.8); g.stroke();
    g.restore();
  }
  /** Someone new comes along the pavement from one end of the street. */
  function arrive(st, w, c) {
    const d = Math.random() < 0.5 ? 1 : -1;
    w.on = 1; w.x = d > 0 ? -24 : c.w + 24; w.dir = d; w.al = 1; w.cov = 0; w.col = SHIRT[Math.floor(Math.random() * SHIRT.length)]; w.hair = HAIR[Math.floor(Math.random() * HAIR.length)];
    w.dog = Math.random() < 0.16 ? 1 : 0; w.pet = PETS[Math.floor(Math.random() * 3)]; w.item = !w.dog && Math.random() < 0.3 ? 1 + Math.floor(Math.random() * 3) : 0; mosey(st, w, c);
  }
  /** What someone on the pavement does next: walk on by, stop at a shop window, go into a shop, sit down at the bistro, or go and look at a flattened car. */
  function mosey(st, w, c) {
    const m = st.shops.length, k = Math.random(), S = m ? st.shops[Math.floor(Math.random() * m)] : null, K = st.wreck;
    w.seat = null; w.S = null; w.st = 'walk'; w.do = 'pass';
    if (w.job) {   // the waiter: out to a table with the tray, a word, and back in
      w.srv = !w.srv; w.S = st.bistro; w.item = w.srv ? 5 : 0;
      if (w.srv) { let q = null; for (const o of st.seats) if (!q || (o.who && Math.random() < 0.6)) q = o; w.do = 'window'; w.tx = q ? q.x - q.dir * 6 : w.x; w.tt = 2.5; } else { w.do = 'shop'; w.tx = w.S.dx; }
    }
    else if (st.gawk > 0 && K && K.st === 'flat' && Math.random() < 0.7) { w.do = 'window'; w.tx = U.clamp(K.x + (Math.random() < 0.5 ? -1 : 1) * (28 + Math.random() * 16), 10, c.w - 10); w.tt = 5 + Math.random() * 6; }
    else if (!S || k < 0.25) w.tx = w.dir > 0 ? c.w + 24 : -24;   // keeps going the way it faces
    else if (k < 0.5 && S.win) { w.do = 'window'; w.tx = S.win.x + 4 + Math.random() * (S.win.w - 8); w.tt = 3 + Math.random() * 5; }
    else if (k < 0.8 && !w.dog) { w.do = 'shop'; w.S = S; w.tx = S.dx; }
    else { let q = null; if (!w.dog) for (const o of st.seats) if (!o.who && (!q || Math.random() < 0.5)) q = o; if (q) { q.who = w; w.seat = q; w.do = 'seat'; w.tx = q.x; w.tt = 15 + Math.random() * 30; } else w.tx = w.dir > 0 ? c.w + 24 : -24; }
    w.dir = w.tx < w.x ? -1 : 1;
  }
  /** Someone on the pavement is frightened: into the nearest shop or the front door, away from by if there is a choice. */
  function bolt(st, w, by) {
    if (!w.on || w.do === 'in' || w.do === 'enter' || w.do === 'cover') return false;
    let S = null, bd = 1e9; for (const o of st.doors) { const d = Math.abs(o.dx - w.x) + (by && (o.dx - w.x) * (by.x - w.x) > 0 ? 180 : 0); if (d < bd) { bd = d; S = o; } }
    if (w.seat) { w.seat.who = null; w.seat = null; }
    SEEN.cover++;
    if (!S) { w.do = 'pass'; w.st = 'walk'; w.tx = by && by.x > w.x ? -24 : st.w + 24; return true; }   // nowhere to hide: off down the street
    w.do = 'cover'; w.S = S; w.tx = S.dx; w.cov = 1; return true;
  }
  function stroll(st, w, c, dt) {
    const a = w.do, S = w.S;
    if (!w.on) { if ((w.tt -= dt) <= 0 && st.calm && w.i < st.cap) arrive(st, w, c); return; }
    if (a === 'in') {   // in a shop; nobody comes out while something frightening is about
      if ((w.tt -= dt) > 0 || !st.calm) return;
      if (w.cov) { S.hid--; w.cov = 0; } else if (!w.job) w.item = Math.random() < 0.6 ? 1 : 0;
      w.x = S.dx; w.al = 0; if (S.lobby) st.hold = Math.max(st.hold, 0.8); else S.ajar = 0.8; mosey(st, w, c); return;
    }
    if (a === 'enter') {
      w.ph += dt * 11; if (S.lobby) st.hold = Math.max(st.hold, 0.4); else S.ajar = 0.4;
      if ((w.al -= dt * 3) <= 0) { w.al = 0; w.do = 'in'; if (w.cov) { S.hid++; w.tt = 6 + Math.random() * 8; } else w.tt = w.job ? 14 + Math.random() * 22 : 5 + Math.random() * 12; }
      return;
    }
    w.al = Math.min(1, w.al + dt * 2.5);
    if (a === 'sit' || a === 'wait') { if ((w.tt -= dt) <= 0) { if (w.seat) w.seat.who = null; mosey(st, w, c); } return; }
    const run = a === 'cover', d = w.tx - w.x, v = (run ? 95 : w.item ? 30 : 36) * dt;
    w.st = run ? 'flee' : 'walk'; w.dir = d < 0 ? -1 : 1; w.ph += dt * (run ? 22 : 11);
    if (Math.abs(d) > v) { w.x += d < 0 ? -v : v; return; }
    w.x = w.tx; w.ph = 0;
    if (a === 'pass') { w.on = 0; w.tt = 3 + Math.random() * 10; }
    else if (a === 'shop' || run) w.do = 'enter';
    else if (a === 'seat') { w.do = 'sit'; w.st = 'sit'; w.dir = w.seat.dir; }
    else { w.do = 'wait'; w.st = 'stand'; }
  }
  /** Cars at the kerb: now and then one pulls out or one comes and parks; a flat one blinks its hazard lights, and in the end the tow truck takes it. */
  function traffic(g, st, c, dt, t, la) {
    const y = c.h - 0.5, W = st.tow;
    if ((st.carT -= dt) <= 0) {
      st.carT = 20 + Math.random() * 40; const k = st.cars[Math.floor(Math.random() * st.cars.length)];
      if (k && st.calm && k.st === 'parked' && Math.random() < 0.5) { k.st = 'out'; k.v = 0; st.carKey++; }
      else if (k && st.calm && k.st === 'none' && !(st.bistro && st.bistro.tables.length && k.x0 > st.bistro.tables[0] - 36 && k.x0 < st.bistro.tables[st.bistro.tables.length - 1] + 36)) { k.st = 'in'; k.x = -40; k.type = Math.floor(Math.random() * 3); k.col = CARCOL[Math.floor(Math.random() * CARCOL.length)]; }   // nobody parks in front of the bistro's tables
    }
    for (const k of st.cars) {
      const a = k.st, A = k.A; if (a === 'none') continue;
      if (a === 'out') { k.v = Math.min(110, k.v + 60 * dt); k.x += k.v * dt; if (k.x > c.w + 40) k.st = 'none'; }
      else if (a === 'in') { const d = k.x0 - k.x; k.v = Math.min(100, d * 1.6 + 8); k.x += k.v * dt; if (d < 0.6) { k.x = k.x0; k.st = 'parked'; st.carKey++; } }
      else if (a === 'flat') {
        k.t += dt;
        if (k.t < 6 && Math.floor(t * 2.5) & 1) { g.fillStyle = '#ffb52e'; g.fillRect(k.x - 26, y - 6, 3, 2.4); g.fillRect(k.x + 23, y - 6, 3, 2.4); }
        if (k.t > k.hold && !W.car && st.calm) { W.car = k; W.x = -50; W.ph = 0; }
      }
      if (a === 'in' || a === 'out' || a === 'tow') auto(g, k, k.x, y, la);
      A.x = k.x; A.h = a === 'flat' || a === 'tow' ? 6 : 17; A.stopped = a === 'parked' || a === 'flat'; A.vx = A.stopped ? 0 : a === 'tow' ? 70 : k.v; c.scene.next.push(A);
    }
    if (W.car) {   // the tow truck: stops ahead of the wreck, hooks on, and off they go
      const k = W.car;
      if (!W.ph) { const d = k.x + 52 - W.x; W.x += Math.min(100, d * 1.6 + 8) * dt; if (d < 0.6) { W.ph = 1; W.t = 1.4; k.st = 'tow'; st.carKey++; } }
      else if ((W.t -= dt) <= 0) { W.x += 70 * dt; k.x = W.x - 52; if (k.x > c.w + 44) { k.st = 'none'; W.car = null; } }
      auto(g, W, W.x, y, la);
      if (W.ph) { g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(W.x - 22, y - 9); g.lineTo(k.x + 24, y - 4); g.stroke(); }
      if (Math.floor(t * 3) & 1) { g.fillStyle = '#ff7a2e'; g.fillRect(W.x + 1, y - 20.5, 4, 3); }
    }
  }

  // ---------- holidays: a tree and a wreath in December, and on Thanksgiving the turkey drop ----------
  const firH = w => Math.min(w.h - 8, 22);
  /** A Christmas tree's outline in a window: three tiers, standing on the sill. The same path cuts the tree out of the lamplight. */
  function fir(g, w) {
    const x = w.x + w.w / 2, y = w.y + w.h - 3, h = firH(w), b = h * 0.4;
    g.moveTo(x, y - h); g.lineTo(x + b * 0.45, y - h * 0.62); g.lineTo(x + b * 0.2, y - h * 0.62); g.lineTo(x + b * 0.75, y - h * 0.3); g.lineTo(x + b * 0.4, y - h * 0.3); g.lineTo(x + b, y);
    g.lineTo(x - b, y); g.lineTo(x - b * 0.4, y - h * 0.3); g.lineTo(x - b * 0.75, y - h * 0.3); g.lineTo(x - b * 0.2, y - h * 0.62); g.lineTo(x - b * 0.45, y - h * 0.62); g.closePath();
  }
  /** The radio crew's equipment case, its foot at x, y. */
  function crate(g, x, y) { g.fillStyle = 'rgba(52,58,72,.96)'; g.fillRect(x - 6, y - 8, 12, 8); g.strokeStyle = INK; g.lineWidth = 0.9; g.strokeRect(x - 6, y - 8, 12, 8); g.beginPath(); g.moveTo(x - 2, y - 8); g.lineTo(x - 2, y - 10); g.lineTo(x + 2, y - 10); g.lineTo(x + 2, y - 8); g.stroke(); g.fillStyle = HAT; g.fillRect(x - 4, y - 5, 2, 2); }
  /** The helicopter, nose toward dir: cabin with its sign, tail boom and tail rotor, skids, and the main rotor a disc that flickers. */
  function chopper(g, x, y, dir, t, tilt) {
    const f = Math.floor(t * 12) & 1, bl = Math.cos(t * 40);
    g.save(); g.translate(x, y); g.scale(dir, 1); g.rotate(tilt); g.lineCap = g.lineJoin = 'round';
    for (let k = 0; k < 2; k++) {
      g.strokeStyle = k ? INK : HALO; g.lineWidth = k ? 1.5 : 3.8;
      g.beginPath(); g.moveTo(-15, -3); g.lineTo(-42, -6); g.lineTo(-46, -13); g.moveTo(-8, 8.5); g.lineTo(-9, 13); g.moveTo(8, 8.5); g.lineTo(9, 13); g.moveTo(-15, 13); g.lineTo(15, 13); g.lineTo(18, 10.5); g.moveTo(0, -9); g.lineTo(0, -13.5); g.stroke();
      if (!k) { g.fillStyle = HALO; g.beginPath(); g.ellipse(0, 0, 21.5, 11, 0, 0, TAU); g.fill(); }
    }
    g.fillStyle = '#d8483c'; g.beginPath(); g.ellipse(0, 0, 20, 9.5, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(190,222,246,.92)'; g.beginPath(); g.moveTo(11, -7.9); g.quadraticCurveTo(20.5, -5, 19.6, 1.5); g.lineTo(11, 1.5); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.ellipse(0, 0, 20, 9.5, 0, 0, TAU); g.stroke();
    g.fillStyle = f ? 'rgba(244,239,230,.34)' : 'rgba(244,239,230,.18)'; g.beginPath(); g.ellipse(0, -13.5, 31, 2.5, 0, 0, TAU); g.ellipse(-46, -12, 2, 6, 0, 0, TAU); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-31 * bl, -13.5); g.lineTo(31 * bl, -13.5); g.moveTo(-46, -12 - 6 * bl); g.lineTo(-46, -12 + 6 * bl); g.stroke();
    g.fillStyle = 'rgba(252,249,240,.97)'; g.fillRect(-15, -4.5, 24, 9);
    g.scale(dir, 1);   // the lettering must not be mirrored when it flies to the left
    g.fillStyle = '#c8322c'; g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('WKRP', -3 * dir, 0.5);
    g.restore();
  }
  /** A turkey on its way down: plump, tail fanned, wings out and no use at all. */
  function fowl(g, b, t) {
    const fl = Math.sin(t * 24) * 1.6;
    g.save(); g.translate(b.x, b.y); g.rotate(b.rot); g.lineCap = 'round';
    g.fillStyle = HALO; g.beginPath(); g.ellipse(0, 0, 8.5, 7.5, 0, 0, TAU); g.fill();
    g.fillStyle = FAN; g.beginPath(); g.moveTo(-2, 0); g.arc(-3, 0, 9, Math.PI * 0.62, Math.PI * 1.38); g.fill();
    g.strokeStyle = PLUME[0]; g.lineWidth = 1.2; g.beginPath(); g.arc(-3, 0, 8.4, Math.PI * 0.62, Math.PI * 1.38); g.stroke();
    g.strokeStyle = '#f0a03c'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-1, 4.5); g.lineTo(-2, 8.5); g.moveTo(2, 4.5); g.lineTo(3, 8.5); g.stroke();
    g.fillStyle = '#a8683a'; g.beginPath(); g.ellipse(0.5, -6 - fl, 2.4, 4.6, 0.3, 0, TAU); g.ellipse(0.5, 6 + fl, 2.4, 4.6, -0.3, 0, TAU); g.fill();
    g.fillStyle = FOWL; g.beginPath(); g.ellipse(0, 0, 6.2, 5.2, 0, 0, TAU); g.fill();
    g.strokeStyle = '#a8683a'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(5, -1); g.lineTo(8.6, -3.6); g.stroke();
    g.fillStyle = '#a8683a'; g.beginPath(); g.arc(9.2, -4.2, 2, 0, TAU); g.fill();
    g.fillStyle = '#ffd24a'; g.beginPath(); g.moveTo(10.8, -5); g.lineTo(13.4, -4); g.lineTo(10.8, -3.2); g.fill();
    g.fillStyle = '#e0362e'; g.beginPath(); g.arc(10, -2.2, 1.1, 0, TAU); g.fill(); g.fillStyle = '#222'; g.fillRect(9.2, -5.2, 1, 1);
    g.restore();
  }
  /** One of the radio crew is frightened: a short dash, then back to the spot. */
  function spook(w, by) {
    if (w.st === 'off') return false;
    w.dir = by && by.x > w.x ? -1 : 1; w.st = 'flee'; w.tt = 1.6; SEEN.flees++; return true;
  }
  /** Where the helicopter lets the next one go: anywhere across the screen but over the radio crew. */
  function spot(E, c, keep) { let x = c.w / 2; for (let k = 0; k < 8; k++) { x = c.w * (0.12 + 0.76 * Math.random()); if (Math.abs(x - keep) > 170 && Math.abs(x - E.men[0].hx) > 90 && Math.abs(x - E.x) > 60) break; } return x; }
  /** Thanksgiving, the fourth Thursday of November: a radio crew sets up in a bottom corner, a helicopter comes over and lets
   *  turkeys go one at a time, which do not fly. Feathers, no harm done. Everything here is drawn each frame, and only while it runs. */
  function turkeyDrop(g, st, c, t, dt, hol, la) {
    const E = st.tk, gy = st.py, D = c.env.date, men = E.men;
    if (!E.ph) {   // the day is looked at as we go: the state may be days old
      const day = D && D.getMonth() === 10 && D.getDay() === 4 && D.getDate() > 21 && D.getDate() < 29;
      if (!hol || !(E.sure || day) || (E.wait -= dt) > 0) return;
      E.ph = 'in'; E.t = 0; E.sure = false; E.left = 6 + Math.floor(Math.random() * 5); E.up = 0; E.last = 9; E.gone = 0; E.side = st.door && st.door.x < c.w / 2 ? 1 : -1;
      let top = 1e9; for (const b of c.rects) if (solid(b)) top = Math.min(top, b.y);
      E.y = E.hy = U.clamp(top - 17, 18, 70); E.dir = E.side; E.x = E.side > 0 ? -80 : c.w + 80; E.tx = c.w / 2;
      men.forEach((w, i) => { w.x = (E.side > 0 ? c.w : 0) + E.side * (22 + i * 18); w.hx = w.tx = (E.side > 0 ? c.w : 0) - E.side * (98 - i * 28); w.y = gy; w.st = 'walk'; w.m = w.mt = 0; w.pt = 0; w.item = i === 2 ? 4 : 0; w.lx = 1; w.ly = 0; });
      E.flatC = 0; E.say = 0;
      // the reporter stands where the wall above is clear of a tile's lettering: that is where the speech bubbles go
      let nb = null; const ex0 = E.side > 0 ? c.w : 0; for (const o of st.fronts) if (!nb || Math.abs(o.b.x + o.b.w / 2 - ex0) < Math.abs(nb.b.x + nb.b.w / 2 - ex0)) nb = o;
      if (nb) { const lo = nb.b.x + nb.tr * nb.b.w + 44, hi = nb.b.x + nb.b.w - 44; men[0].hx = men[0].tx = lo > hi ? (lo + hi) / 2 : E.side > 0 ? hi : lo; E.b0 = lo - 39; E.b1 = hi + 56; } else { E.b0 = 4; E.b1 = c.w - 4; }
      SEEN.drops++;
    }
    const ex = E.side > 0 ? c.w : 0, d = -E.side, a = E.ph, kx = ex + d * 18; E.t += dt; E.last += dt;
    g.globalAlpha = la; g.lineCap = 'round';
    // the phases: the crew walks in and sets up, the helicopter comes, drops, leaves; the crew stands a moment, packs up and goes
    if (a === 'in') { if (men[2].st === 'look') E.up = Math.min(1, E.up + dt); if (E.up >= 1 && men[0].st === 'look' && E.t > 3) { E.ph = 'fly'; E.tx = spot(E, c, ex + d * 60); men[1].pt = 1; } }
    else if (a === 'fly' || a === 'drop' || a === 'out') {
      const dx = E.tx - E.x, v = (a === 'drop' ? 45 : 130) * dt, mv = Math.abs(dx) > v;
      if (mv) { E.x += dx < 0 ? -v : v; E.dir = dx < 0 ? -1 : 1; }
      E.y = E.hy + Math.sin(t * 1.7) * 1.5;
      if (a === 'fly' && !mv) { E.ph = 'drop'; E.gap = 1.4; }
      else if (a === 'out' && !mv) { E.ph = 'stand'; E.t = 0; let k = 0; for (const q of st.ten) if (q.mode === 'in' && k < 3) { q.want = 'lean'; q.tt = 1 + 1.5 * k++; } for (const w of men) { w.mt = Math.min(w.mt, 1); w.pt = 0; } }   // a few tenants come to the window to see what that was
      else if (a === 'drop' && (E.gap -= dt) <= 0 && !mv) {
        let b = null, air = 0; for (const o of E.birds) { if (!o.on) b = o; else if (!o.land) air = 1; }
        if (!E.left) { if (!air) { E.ph = 'out'; E.tx = E.side > 0 ? c.w + 90 : -90; E.say = 1; E.sayT = 0; men[0].mt = 1; SEEN.quote++; } }   // the last one is down: the reporter finds words
        else if (b) {
          b.on = 1; b.land = 0; b.t = 0; b.x = E.x; b.y = E.y + 12; b.vy = 20; b.rot = 0; b.sp = Math.random() < 0.5 ? -1 : 1; E.left--; E.gap = 2.5 + Math.random() * 1.5; E.tx = spot(E, c, ex + d * 60); SEEN.turkeys++;
          men[0].mt = Math.max(men[0].mt, 1);
          for (const q of st.ten) {   // tenants out of doors run for the door, or off the screen if that is nearer; those at windows duck in
            if ((q.mode === 'out' || q.mode === 'come') && (!st.door || Math.abs(q.x - st.door.x) > Math.min(q.x, c.w - q.x) + 24)) { q.mode = 'run'; q.off = 1; q.tx = q.x < c.w / 2 ? -24 : c.w + 24; q.wv = 0; q.al = 1; SEEN.flees++; }
            else shoo(st, q);
          }
          for (const w of st.walk) bolt(st, w, b);   // and so does everyone on the pavement
        }
      }
      if (E.x > -60 && E.x < c.w + 60) { chopper(g, E.x, E.y, E.dir, t, mv ? (a === 'drop' ? 0.05 : 0.13) : 0); const A = E.A; A.x = E.x; A.y = E.y; A.vx = mv ? E.dir * v / (dt || 1) : 0; c.scene.next.push(A); }
    }
    else if (a === 'stand') { if (E.t > 3.5 && !E.say) { E.ph = 'pack'; E.t = 0; } }
    else if (a === 'pack') {
      E.up = Math.max(0, E.up - dt);
      if (E.up <= 0 && !E.gone) { E.gone = 1; for (const w of men) { w.tx = ex - d * 30; w.st = 'walk'; w.m = w.mt = 0; } men[2].item = 4; }
      let k = 0; for (const w of men) if (w.st !== 'off') k = 1; for (const b of E.birds) if (b.on) k = 1;
      if (!k && E.gone) { E.ph = ''; E.gone = 0; E.wait = 600 + Math.random() * 900; g.globalAlpha = 1; return; }   // and again later in the day
    }
    // the birds: straight down, tumbling; a flat thud, feathers that drift, and a squashed shape that fades
    let fb = null;
    for (const b of E.birds) {
      if (!b.on) continue;
      b.t += dt;
      if (!b.land) {
        b.vy = Math.min(360, b.vy + 300 * dt); b.y += b.vy * dt; b.rot += dt * 5 * b.sp;
        if (b.y < gy - 4) { fb = b; fowl(g, b, t); const A = b.A; A.x = b.x; A.y = b.y; c.scene.next.push(A); continue; }
        b.land = 1; b.t = 0; b.y = gy; E.last = 0; E.sx = b.x; SEEN.splats++; SEEN.x = b.x; SEEN.y = gy;
        for (let k = 0; k < 28; k += 4) { b.f[k] = b.x + (Math.random() - 0.5) * 8; b.f[k + 1] = gy - 3; b.f[k + 2] = (Math.random() - 0.5) * 90; b.f[k + 3] = -30 - Math.random() * 60; }
        men[0].mt = 2; men[2].mt = 2;
      }
      const al = U.clamp((4.5 - b.t) / 1.5, 0, 1), q = Math.min(1, b.t * 7), x = b.x, f = b.f;
      if (al > 0) {
        g.globalAlpha = la * al;
        g.fillStyle = HALO; g.beginPath(); g.ellipse(x, gy - 1.5, 5 + 8 * q, 5.4 - 2 * q, 0, 0, TAU); g.fill();
        g.fillStyle = FAN; g.beginPath(); g.ellipse(x - 5, gy - 2.5, 7, 4.6, 0, Math.PI, TAU); g.fill();
        g.fillStyle = FOWL; g.beginPath(); g.ellipse(x, gy - 1.5, 4 + 7.5 * q, 4.6 - 2 * q, 0, 0, TAU); g.fill();
        g.fillStyle = '#a8683a'; g.beginPath(); g.arc(x + 12.5, gy - 1.6, 1.9, 0, TAU); g.fill(); g.fillStyle = '#e0362e'; g.fillRect(x + 13.2, gy - 1.2, 1.6, 1.4);
        g.strokeStyle = '#f0a03c'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(x + 1, gy - 3.5); g.lineTo(x, gy - 10); g.lineTo(x - 1.6, gy - 11.4); g.moveTo(x, gy - 10); g.lineTo(x + 1.4, gy - 11.6); g.moveTo(x + 5, gy - 3.5); g.lineTo(x + 7, gy - 9.4); g.lineTo(x + 5.6, gy - 11); g.moveTo(x + 7, gy - 9.4); g.lineTo(x + 8.8, gy - 10.6); g.stroke();   // two legs in the air
        if (b.t < 0.3) { g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 15, gy - 1); g.lineTo(x - 20, gy - 4); g.moveTo(x + 17, gy - 1); g.lineTo(x + 22, gy - 4); g.moveTo(x - 16, gy); g.lineTo(x - 23, gy); g.moveTo(x + 18, gy); g.lineTo(x + 25, gy); g.stroke(); }
      }
      g.globalAlpha = la * U.clamp((5.5 - b.t) / 1.5, 0, 1); g.lineWidth = 1.5;
      for (let k = 0; k < 28; k += 4) {
        f[k + 3] = Math.min(14, f[k + 3] + 90 * dt); f[k + 2] *= 1 - Math.min(1, 1.6 * dt); f[k] += (f[k + 2] + Math.sin(t * 3 + k) * 9) * dt; f[k + 1] = Math.min(gy - 0.5, f[k + 1] + f[k + 3] * dt);
        const s = Math.sin(t * 3 + k) * 2.2; g.strokeStyle = PLUME[(k >> 2) % 3]; g.beginPath(); g.moveTo(f[k] - 2.2, f[k + 1] - s * 0.5); g.lineTo(f[k] + 2.2, f[k + 1] + s * 0.5); g.stroke();
      }
      g.globalAlpha = la;
      if (b.t > 5.5) b.on = 0;
    }
    // the gear in the corner: the case on the ground, the aerial up out of it
    if (E.up > 0) {
      const top = gy - 8 - 32 * E.up;
      const C = E.C; C.x = kx; C.y = gy; c.scene.next.push(C);
      if (E.flatC) { g.fillStyle = 'rgba(52,58,72,.96)'; g.fillRect(kx - 8, gy - 2.5, 16, 2.5); g.strokeStyle = STEEL + '.95)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(kx, gy - 2); g.lineTo(kx + d * 14, gy - 5); g.lineTo(kx + d * 24, gy - 1); g.stroke(); }   // trodden on
      else crate(g, kx, gy);
      if (!E.flatC) for (let k = 0; k < 2; k++) { g.strokeStyle = k ? STEEL + '.95)' : HALO; g.lineWidth = k ? 1.2 : 3; g.beginPath(); g.moveTo(kx, gy - 8); g.lineTo(kx, top); if (E.up > 0.9) { g.moveTo(kx - 4, top + 3); g.lineTo(kx + 4, top + 3); g.moveTo(kx - 2.5, top + 7); g.lineTo(kx + 2.5, top + 7); } g.stroke(); }
      if (E.up >= 1 && !E.flatC && Math.floor(t * 3) & 1) { g.strokeStyle = '#ff5a4a'; g.lineWidth = 1; g.beginPath(); g.arc(kx, top, 4, -2.3, -0.84); g.moveTo(kx + 4.7, top - 5.2); g.arc(kx, top, 7, -0.84, -2.3, true); g.stroke(); }   // on the air
    }
    // the crew: eyes on the helicopter, then on each bird all the way down, a moment on where it landed
    const lx = fb ? fb.x : E.last < 1.2 ? E.sx : E.x, ly = fb ? fb.y : E.last < 1.2 ? gy : E.y, sky = fb || E.last < 1.2 || a === 'fly' || a === 'drop' || a === 'out';
    for (const w of men) {
      if (w.st === 'off') continue;
      if (w.st === 'flee') { w.ph += dt * 22; w.x = U.clamp(w.x + w.dir * 95 * dt, 8, c.w - 8); if ((w.tt -= dt) <= 0) w.st = 'walk'; }
      else if (w.st === 'walk') {
        const dx = w.tx - w.x, v = 36 * dt; w.dir = dx < 0 ? -1 : 1; w.ph += dt * 11;
        if (Math.abs(dx) > v) w.x += dx < 0 ? -v : v; else { w.x = w.tx; w.ph = 0; w.st = E.gone ? 'off' : 'look'; w.dir = d; w.item = 0; }
      }
      else {
        let ux = 1, uy = 0;
        if (sky) { const dx = lx - w.x, dy = ly - (w.y - 18), n = Math.hypot(dx, dy) || 1; w.dir = dx < 0 ? -1 : 1; ux = Math.abs(dx) / n; uy = dy / n; } else w.dir = d;
        if (w.mic && E.say) { ux = 0.5; uy = 0.86; w.dir = d; }   // eyes on the ground
        const k = Math.min(1, dt * 7); w.lx += (ux - w.lx) * k; w.ly += (uy - w.ly) * k; w.m += U.clamp(w.mt - w.m, -2.2 * dt, 2.2 * dt);
      }
      if (w.st === 'off') continue;
      man(g, w); const A = w.A; A.x = w.x; A.y = w.y; A.dir = w.dir; c.scene.next.push(A);
    }
    if (E.say) {   // two speech bubbles, one after the other, about three seconds each
      if ((E.sayT += dt) > 3) { E.sayT = 0; if (++E.say > 2) E.say = 0; else SEEN.quote++; }
      if (E.say) bubble(g, E, men[0].x, gy - 27, E.say === 1 ? 'As God is my' : 'I thought turkeys', E.say === 1 ? 'witness...' : 'could fly.');
    }
    g.globalAlpha = 1;
  }
  /** A speech bubble in two lines, its tail down to x, y, kept between E.b0 and E.b1. */
  function bubble(g, E, x, y, s1, s2) {
    g.font = '600 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = Math.max(g.measureText(s1).width, g.measureText(s2).width) + 12, bx = E.b1 - E.b0 < w ? (E.b0 + E.b1) / 2 : U.clamp(x, E.b0 + w / 2, E.b1 - w / 2);   // between the tile's lettering and the next tile
    BUB.x = bx - w / 2; BUB.y = y - 29; BUB.w = w;
    g.fillStyle = 'rgba(252,249,240,.97)'; g.strokeStyle = '#3a2a22'; g.lineWidth = 1; U.box(g, BUB, 0); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - 3, y - 5.5); g.lineTo(x, y); g.lineTo(x + 3, y - 5.5); g.fill(); g.stroke(); g.fillRect(x - 2.6, y - 6.6, 5.2, 1.6);
    g.fillStyle = '#3a2a22'; g.fillText(s1, bx, y - 22); g.fillText(s2, bx, y - 12.5);
  }
  const BUB = {x: 0, y: 0, w: 0, h: 24, r: 6};

  HP.fx.add('build', {
    label: 'Construction crew', grows: true, days: 7, live: true, fps: 12, z: 1, scale: 0.1, covers: true,
    options: [{key: 'crew', label: 'Crew', type: 'range', min: 3, max: 6, step: 1, default: 4}, {key: 'holidays', label: 'Holidays', type: 'bool', default: true}],
    create(c) {
      const r = c.rand, tiles = [], apts = [], rows = [], bricks = [], lifts = [], crew = [], ten = [];
      const plats = [{i: 0, x1: 8, x2: c.w - 8, y: c.h - 2, at: 0, off: 9, links: [], lifts: []}];   // the ground: the bottom of the screen
      const bs = c.rects.filter(b => solid(b) && b.w > 50 && b.h > 40);
      let top = 1e9, bot = 0; for (const b of bs) { top = Math.min(top, b.y + b.h); bot = Math.max(bot, b.y + b.h); }
      const sizes = bs.map(b => b.w * b.h).sort((a, b) => a - b), med = sizes[sizes.length >> 1] || 1;
      for (const b of bs) {
        const f = (bot - (b.y + b.h)) / (bot - top || 1), X = b.x + b.w, at = 0.1 + 0.28 * f + 0.04 * r();   // the bottom row is built first
        const T = {b, at, off: 0.8 + 0.07 * (1 - f) + 0.02 * r(), stk: 0.005 + 0.06 * r(), win: at + 0.18, lad: null, plat: null, roof: 0, wall: null};
        if (!bs.some(o => o !== b && o.y + o.h <= b.y && b.y - (o.y + o.h) < 60 && o.x < X - 20 && o.x + o.w > b.x + 20)) T.roof = r() < 0.5 ? 2 : 1;   // nothing built on top of it: it gets a roof
        // one apartment to a tile, its windows where the tile is empty: upper right, beyond its symbol and above its name.
        // A tile more than 1.6 times the size of most is two apartments, side by side or one over the other, sharing a wall.
        const two = b.w * b.h > med * 1.6, tall = b.h > b.w, pic = b.type === 'camera' || b.type === 'image';   // a picture keeps its windows small and at the edge
        for (let k = 0; k < (two ? 2 : 1); k++) {
          const side = two && !tall, ax = side ? b.x + k * b.w / 2 : b.x, aw = side ? b.w / 2 : b.w, ay = two && tall ? b.y + k * b.h / 2 : b.y, ah = two && tall ? b.h / 2 : b.h;
          const ww = pic ? 26 : Math.round(28 + r() * 10), wh = pic ? 20 : Math.round(U.clamp(ah - 58, 24, 44)), wy = Math.round(ay + (pic ? 6 : 10)), lim = ax + (side && k ? 12 : Math.max(aw * 0.5, 46)), h = r();
          const A = {T, x: ax, y: ay, w: aw, h: ah, wins: [], at: T.win + 0.05 * r() + (two && tall && !k ? 0.04 : 0), on: false, home: r() < 0.55, hue: h < 0.15 ? 2 : h < 0.4 ? 1 : 0, cur: Math.floor(r() * 4), sash: r() < 0.5, det: Math.floor(r() * 4), fl: Math.floor(r() * 3), plate: !pic, floor: 0, n: 0, num: '', nb: [], who: null, deck: 0, low: ay + ah > bot - 8};
          const n = r() < 0.75 && !pic ? 2 : 1; if (pic) A.det = 0;
          for (let i = 0, x = Math.round(pic && side && !k ? ax + 10 : ax + aw - (pic ? 10 : 16) - ww); i < n && (pic || x >= lim) && ah >= 50; i++, x -= ww + 12) A.wins.push({x, y: wy, w: ww, h: wh});
          if (A.wins.length) apts.push(A);
        }
        if (two) T.wall = tall ? {x1: pic ? X - 40 : b.x + 8, y1: b.y + b.h / 2, x2: X - 8, y2: b.y + b.h / 2} : {x1: b.x + b.w / 2, y1: b.y + 5, x2: b.x + b.w / 2, y2: pic ? b.y + 30 : b.y + b.h - 48};   // stops short of the name
        rows.push({x0: b.x + 12, x1: X - 12, y: b.y + b.h - 2.5, at: T.win - 0.03});   // the floor line along the tile's foot
        if (b.w * 0.5 - 42 > 30) bricks.push({x: b.x + 42 + r() * 4, y: b.y + 5, n: 2, at: T.win + 0.05 * r()});
        bricks.push({x: b.x + 16 + r() * 12, y: b.y + b.h - 9, n: 2, at: T.win + 0.05 * r()});
        if (b.y > 22) plats.push(T.plat = {i: plats.length, x1: b.x + 8, x2: X - 8, y: b.y, at: at + 0.08, off: T.off, links: [], lifts: [], b});
        tiles.push(T);
      }
      // a ladder in each scaffold's left bay, from the tile's top down to whatever level lies under that spot
      for (const T of tiles) if (T.plat) {
        const x = T.b.x + 2.5; let low = plats[0];
        for (const P of plats) if (P.i && P.y > T.b.y + T.b.h - 2 && P.y < low.y && x >= P.x1 - 8 && x <= P.x2 + 8) low = P;
        if (low.y - T.b.y > 320) continue;
        const k = T.lad = {x, a: T.plat, b: low, at: T.at + 0.09, off: T.off}; T.plat.links.push(k); low.links.push(k);
      }
      // the front door: the bottom-row tile nearest the middle, toward its empty right side; the sign stands at that tile's corner
      let door = null, sign = null, E = null;
      for (const b of bs) if (b.y + b.h > bot - 8 && (!E || Math.abs(b.x + b.w / 2 - c.w / 2) < Math.abs(E.x + E.w / 2 - c.w / 2))) E = b;
      if (E) { door = {x: E.x + E.w * 0.66}; sign = {x: Math.min(c.w - 30, E.x + E.w - 12), flat: 0}; }
      // the rest of the bottom row is shops, not apartments: the shopfront goes along a tile's foot, right of its lettering
      const py = c.h - 7, shops = [], fronts = [], seats = [];   // py: the pavement, where feet go once the street is laid
      for (const T of tiles) {
        const b = T.b, X = b.x + b.w, Y = b.y + b.h; if (Y <= bot - 8) continue;
        const tr = textEdge(b), pic = b.type === 'camera' || b.type === 'image'; fronts.push({b, tr});
        if (b === E || b.h < 64) continue;
        for (let i = apts.length; i--;) if (apts[i].T === T && apts[i].low) apts.splice(i, 1);
        if (T.wall && T.wall.x1 === T.wall.x2) T.wall = null;
        const xmin = b.x + Math.max(tr * b.w + 8, b.w * 0.3), x1 = X - 10, wide = !pic && x1 - xmin >= 50, x0 = wide ? Math.max(xmin, x1 - 96) : x1 - 40;
        shops.push({b, type: 0, dx: wide ? x0 + 7 : x1 - 12, win: wide ? {x: x0 + 18, y: Y - 42, w: x1 - x0 - 18, h: 32} : null, sx: x0, sw: x1 - x0, tables: [], hid: 0, ajar: 0, peek: 0});
      }
      shops.sort((a, b) => a.b.x - b.b.x);
      // lifts: channels between tiles that run past more than one level, the longest first, well apart and clear of the sign
      const runs = [], by = {};
      for (const q of c.gaps) if (q.vertical && q.x1 > 20 && q.x1 < c.w - 20) { const k = Math.round(q.x1 / 4); (by[k] = by[k] || []).push(q); }
      for (const k in by) {
        let cur = null;
        for (const q of by[k].sort((a, b) => a.y1 - b.y1)) { if (cur && q.y1 - cur.y2 < 40) cur.y2 = Math.max(cur.y2, q.y2); else runs.push(cur = {x: q.x1, y1: q.y1, y2: q.y2}); }
      }
      for (const R of runs) {
        const stops = [];
        for (const P of plats) if (P.i && P.y >= R.y1 - 6 && P.y < R.y2 - 20 && (Math.abs(P.b.x + P.b.w - R.x) < 12 || Math.abs(P.b.x - R.x) < 12)) { let s = stops.find(o => Math.abs(o.y - P.y) < 4); if (!s) stops.push(s = {y: P.y, plats: []}); s.plats.push(P); }
        if (R.y2 > c.h - 45) { R.y2 = c.h - 2; stops.push({y: c.h - 2, plats: [plats[0]]}); }
        R.stops = stops.sort((a, b) => a.y - b.y); R.score = stops.length * 200 + R.y2 - R.y1 + r() * 60;
      }
      runs.sort((a, b) => b.score - a.score);
      for (const R of runs) {
        if (lifts.length >= 3 || R.stops.length < 2 || (sign && Math.abs(R.x - sign.x) < 34) || lifts.some(L => Math.abs(L.x - R.x) < 140)) continue;
        const n = R.stops.length, L = {x: R.x, y1: R.stops[0].y, y2: R.y2, stops: R.stops, cur: n - 1, to: n - 2, d: -1, y: R.stops[n - 1].y, wait: 1 + r() * 3, at: 0.45 + 0.05 * lifts.length};
        L.A = {kind: 'lift', tags: ['vehicle'], x: L.x, y: L.y, h: 18, stopped: true, vx: 0};
        R.stops.forEach((s, i) => { for (const P of s.plats) P.lifts.push({L, s: i}); });
        lifts.push(L);
      }
      // the crane stands on the highest tile that has room over it
      let crane = null, hb = null;
      for (const P of plats) if (P.i && (!hb || P.y < hb.y || (P.y === hb.y && P.b.w > hb.w))) hb = P.b;
      if (hb) { const x = hb.x + hb.w * 0.72, d = x > c.w / 2 ? -1 : 1; crane = {x, y: hb.y, jy: Math.max(7, hb.y - 46), d, len: Math.min(260, (d > 0 ? c.w - x : x) - 24)}; }
      // unit numbers: floors counted from the ground, letters along each floor; and who lives next door
      apts.sort((a, b) => (b.y + b.h) - (a.y + a.h));
      let fl = 0, base = 1e9; for (const a of apts) { if (base - (a.y + a.h) > 40) { fl++; base = a.y + a.h; } a.floor = fl; }
      apts.sort((a, b) => a.floor - b.floor || a.x - b.x);
      apts.forEach((a, i) => { const o = apts[i - 1], same = o && o.floor === a.floor; a.n = same ? o.n + 1 : 0; a.num = a.floor + String.fromCharCode(65 + a.n % 26); if (same) { a.nb.push(o); o.nb.push(a); } });
      const night = !!c.env.night, now = c.opts.now;   // now: a hidden switch for the test page (rave, wave, turkeys, xmas)
      for (const a of apts) a.on = Math.random() < odds(a, night);
      // the tenants we get to see: each has a home for good, most of them on a floor a lift goes to
      const served = apts.filter(rideFor);
      for (let i = 0; i < Math.min(7, apts.length); i++) {
        let a = null; for (let k = 0; k < 30 && (!a || a.who); k++) { const pool = i < 5 && served.length && k < 15 ? served : apts; a = pool[Math.floor(r() * pool.length)]; }
        if (a.who) continue;
        const q = a.who = {ten: 1, x: 0, y: c.h - 2, dir: 1, st: 'walk', ph: 0, hold: 0, task: '', sc: 0, item: 0, col: SHIRT[i % SHIRT.length], hair: HAIR[Math.floor(r() * HAIR.length)], home: a, win: a.wins[0], mode: 'in', want: '', tt: 6 + Math.random() * 25, o: 0, wv: 0, wo: 0, up: false, find: 0, solo: 0, lift: null, dest: 0, al: 1, tx: 0, off: 0, A: null};
        if (door && i < 2) { q.mode = 'away'; q.tt = 2 + i * 12; a.on = false; }   // two are out and on their way home
        else if (door && i < 4) { q.want = 'out'; q.tt = 4 + (i - 2) * 26; }   // and two are about to leave
        q.A = {kind: 'tenant', tags: ['creature', 'person'], view: 'side', x: 0, y: 0, h: 22, dir: 1, hid: true, scare: () => shoo(st, q)};
        ten.push(q);
      }
      if (now === 'wave') { let bd = 1e9, m = null, n = null; for (const q of ten) for (const o of ten) if (q !== o && q.mode === 'in' && o.mode === 'in') { const d = Math.hypot(q.home.x - o.home.x, q.home.y - o.home.y); if (d < bd) { bd = d; m = q; n = o; } } if (m) { m.want = n.want = 'lean'; m.tt = 2; n.tt = 2.5; } }   // the two who live nearest each other
      // holidays: a tree in a window of two apartments where nobody comes to the glass, a wreath beside a window of three others; the same ones every year
      for (let n = 0, k = 0; k < 80 && n < 5 && apts.length; k++) { const a = apts[Math.floor(r() * apts.length)]; if (a.deck || !a.plate || (n < 2 && a.who && k < 50)) continue; a.deck = n < 2 ? 1 : 2; n++; }
      // which shop is which; the bistro puts tables out. Then the cars at the kerb, and the people of the pavement
      const sorts = [0, 1, 2, 3, 4]; for (let i = 4; i > 0; i--) { const j = Math.floor(r() * (i + 1)), q = sorts[i]; sorts[i] = sorts[j]; sorts[j] = q; }
      if (shops.length && sorts.indexOf(0) >= shops.length) { const j = Math.floor(r() * Math.min(5, shops.length)); sorts[sorts.indexOf(0)] = sorts[j]; sorts[j] = 0; }
      let bistro = null;
      shops.forEach((S, i) => {
        S.type = sorts[i % 5]; if (S.type || bistro) return;
        bistro = S; for (let x = S.b.x + 26; S.tables.length < 3 && x < S.b.x + S.b.w - 18; x += 34) { if (Math.abs(x - S.dx) < 26) continue; S.tables.push(x); seats.push({x: x - 10.5, dir: 1, who: null}, {x: x + 10.5, dir: -1, who: null}); }
      });
      const cars = [], nslot = Math.max(0, Math.floor((c.w - 260) / 104)), walk = [];
      for (let i = 0; i < nslot; i++) {
        const k = {slot: i, x0: 130 + (i + 0.5) * (c.w - 260) / nslot + (r() - 0.5) * 20, x: 0, st: 'none', type: Math.floor(r() * 3), col: CARCOL[Math.floor(r() * CARCOL.length)], t: 0, hold: 0, v: 0, A: null};
        k.A = {kind: 'car', tags: ['vehicle', 'prop'], view: 'side', x: 0, y: c.h - 1, h: 17, stopped: true, vx: 0, stomp: () => squash(st, k)}; cars.push(k);
      }
      for (let m = Math.min(nslot, 3 + Math.floor(r() * 4)), k = 0; m && k < 200; k++) { const o = cars[Math.floor(r() * nslot)]; if (o.st === 'none' && !(bistro && bistro.tables.length && o.x0 > bistro.tables[0] - 36 && o.x0 < bistro.tables[bistro.tables.length - 1] + 36)) { o.st = 'parked'; o.x = o.x0; m--; } }
      for (let i = 0; i < 10; i++) {
        const w = {i, ten: 1, on: 0, x: 0, y: py, dir: 1, st: 'walk', ph: 0, hold: 0, task: '', sc: 0, item: 0, col: '#f4f4f0', hair: HAIR[0], up: false, dog: 0, pet: WOOD, al: 1, do: 'pass', tx: 0, tt: i * 1.5, S: null, seat: null, cov: 0, job: 0, srv: false, A: null};
        w.A = {kind: 'shopper', tags: ['creature', 'person'], view: 'side', x: 0, y: py, h: 22, dir: 1, hid: true, scare: by => bolt(st, w, by)}; walk.push(w);
      }
      // the turkey drop: three of a radio crew (the reporter first), four birds to be used over and over, the helicopter
      const tk = {ph: '', t: 0, wait: now === 'turkeys' ? 1 : 30 + Math.random() * 50, sure: now === 'turkeys', left: 0, gap: 0, up: 0, last: 9, gone: 0, side: 1, x: 0, y: 0, hy: 20, dir: 1, tx: 0, sx: 0, men: [], birds: [], flatC: 0, say: 0, sayT: 0, C: null,
        A: {kind: 'helicopter', tags: ['vehicle', 'wonder', 'threat'], view: 'free', x: 0, y: 0, h: 28, stopped: false, vx: 0}};
      for (let i = 0; i < 3; i++) {
        const w = {ten: 1, x: 0, y: c.h - 2, dir: 1, st: 'off', ph: 0, hold: 0, task: '', sc: 0, item: 0, col: ['#5aa9e8', '#e8b84a', '#7cc46a'][i], hair: HAIR[(i * 2 + 1) % HAIR.length], up: false, mic: i === 0, pt: 0, m: 0, mt: 0, lx: 1, ly: 0, hx: 0, tx: 0, tt: 0, A: null};
        w.A = {kind: 'radiocrew', tags: ['creature', 'person'], view: 'side', x: 0, y: 0, h: 22, dir: 1, scare: by => spook(w, by)}; tk.men.push(w);
      }
      for (let i = 0; i < 4; i++) tk.birds.push({on: 0, land: 0, t: 0, x: 0, y: 0, vy: 0, rot: 0, sp: 1, f: new Float32Array(28), A: {kind: 'turkey', tags: ['threat'], view: 'free', x: 0, y: 0, h: 12}});
      tk.C = {kind: 'radiocase', tags: ['prop'], view: 'side', x: 0, y: 0, h: 10, stomp: () => { if (tk.flatC || tk.up <= 0) return false; tk.flatC = 1; SEEN.stomped++; return true; }};
      const st = {tiles, apts, rows, bricks, plats, lifts, crane, door, sign, crew, ways: [], ten, signA: null, lt: 2, hold: 0, ajar: 0, xmas: false, tk,
        w: c.w, py, shops, fronts, seats, bistro, lobby: door ? {lobby: 1, dx: door.x, win: null, hid: 0} : null, doors: [], cars, carT: 12 + Math.random() * 20, carKey: 1, fg: null, fgKey: 0, tow: {type: 2, col: '#ffc62a', st: 'out', slot: 0, x: 0, ph: 0, t: 0, car: null}, wreck: null,
        walk, cap: 10, thr: [], nthr: 0, quiet: 9, calm: true, big: 0, bigT: 0, gawk: 0,
        rave: {a: null, nb: null, t: 0, dur: 0, wait: now === 'rave' ? 1 : 15 + Math.random() * 30, sure: now === 'rave', A: {kind: 'rave', tags: ['light', 'wonder'], view: 'side', x: 0, y: 0, h: 30}}};
      if (sign) st.signA = {kind: 'rentsign', tags: ['prop', 'wonder'], x: sign.x, y: c.h - 2, h: 38, stomp: () => { if (sign.flat > 0) return false; sign.flat = 40 + Math.random() * 40; SEEN.stomped++; return true; }};
      for (const S of shops) st.doors.push(S); if (st.lobby) st.doors.push(st.lobby);
      // the street starts busy: most are already somewhere along it; the waiter is in the bistro
      for (const w of walk) {
        if (!w.i && bistro && seats.length) { w.job = 1; w.on = 1; w.do = 'in'; w.S = bistro; w.x = bistro.dx; w.al = 0; w.tt = 6 + Math.random() * 10; w.hair = HAIR[3]; }
        else if (w.i < 7) { arrive(st, w, c); w.x = 40 + Math.random() * (c.w - 80); mosey(st, w, c); }
      }
      // the crew starts spread over the levels that are built by now
      const open = plats.filter(P => !P.i || (P.at <= c.progress && P.off > c.progress));
      for (let i = 0, n = U.clamp(Math.round(+c.opts.crew || 4), 3, 6); i < n; i++) {
        const P = open[Math.floor(Math.random() * open.length)], w = {x: P.x1 + Math.random() * (P.x2 - P.x1), y: P.y, pl: P, dir: 1, st: 'task', task: 'hammer', tt: Math.random() * 2, ph: 0, hold: 0, go: null, to: null, lift: null, dest: 0, gone: null, fall: null, A: null};
        w.A = {kind: 'builder', tags: ['creature', 'person'], x: w.x, y: w.y, h: 22, dir: 1, hid: false, scare: by => scare(w, by), carry: by => carry(w, by)};
        crew.push(w);
      }
      return st;
    },
    draw(g, st, c, t, dt) {
      const p = c.progress, next = c.scene.next, night = !!c.env.night;
      dt = Math.min(dt || 0, 0.25);
      const hol = c.opts.holidays !== false && c.opts.holidays !== 0; st.xmas = hol && (c.opts.now === 'xmas' || c.env.month === 12);   // looked at every frame: the month turns while the state lives on
      if (st.sign && st.sign.flat > 0) st.sign.flat -= dt;
      g.drawImage(still(st, c, gg => paintSite(gg, st, c, p)), 0, 0);
      // the crane's trolley runs along the jib and the hook goes up and down with a bundle of planks, as deep as there is room under it
      const K = st.crane, ka = K ? U.span(p, 0.6, 0.63) * (1 - U.span(p, 0.86, 0.88)) : 0;
      if (ka > 0.02) {
        const x = K.x + K.d * (34 + (0.5 + 0.5 * Math.sin(t * 0.13)) * (K.len - 44)); let room = 130;
        for (const b of c.rects) if (solid(b) && x > b.x - 12 && x < b.x + b.w + 12 && b.y + b.h > K.jy) room = Math.min(room, b.y - K.jy - 18);
        const y = K.jy + 4 + Math.max(5, (0.5 + 0.5 * Math.sin(t * 0.31 + 1)) * room);
        g.globalAlpha = ka; g.strokeStyle = STEEL + '.85)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, K.jy + 4); g.lineTo(x, y); g.moveTo(x - 7, y + 6); g.lineTo(x, y); g.lineTo(x + 7, y + 6); g.stroke();
        g.fillStyle = 'rgba(255,198,42,.95)'; g.fillRect(x - 3, K.jy + 2, 6, 3);
        g.strokeStyle = WOOD; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 10, y + 7); g.lineTo(x + 10, y + 7); g.moveTo(x - 10, y + 10); g.lineTo(x + 10, y + 10); g.stroke();
        g.globalAlpha = 1;
      }
      // lifts: up and down between the tile tops, a few seconds at each
      for (const L of st.lifts) {
        if (p < L.at) continue;
        if (L.wait > 0) { if ((L.wait -= dt) <= 0) { if (L.cur + L.d < 0 || L.cur + L.d >= L.stops.length) L.d = -L.d; L.to = L.cur + L.d; } }
        else { const ty = L.stops[L.to].y, d = ty - L.y, v = 40 * dt; if (Math.abs(d) > v) L.y += d < 0 ? -v : v; else { L.y = ty; L.cur = L.to; L.wait = 2.6; } }
        g.strokeStyle = STEEL + '.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(L.x, L.y1 - 22); g.lineTo(L.x, L.y - 19); g.stroke();
        g.fillStyle = night ? 'rgba(255,206,112,.5)' : 'rgba(18,22,34,.45)'; g.fillRect(L.x - 6, L.y - 19, 12, 19);
        g.strokeStyle = HAT; g.lineWidth = 1.4; g.strokeRect(L.x - 6, L.y - 19, 12, 19);
        const A = L.A; A.y = L.y; A.stopped = L.wait > 0; next.push(A);
      }
      // the crew, until the building is handed over
      const ca = 1 - U.span(p, 0.89, 0.92);
      for (const w of st.crew) {
        if (ca < 0.02) { if (w.lift) { w.lift = null; w.st = 'task'; } w.A.hid = true; continue; }
        step(st, w, dt, p, c);
        const A = w.A; A.x = w.x; A.y = w.y; A.dir = w.dir; if (!w.gone) A.hid = false; next.push(A);
        const f = w.fall;
        if (f) { f.t += dt; const y = Math.min(f.fy, f.y + 260 * f.t * f.t); g.globalAlpha = ca * U.clamp(2.5 - f.t, 0, 1); g.strokeStyle = WOOD; g.lineWidth = 2.2; g.beginPath(); g.moveTo(f.x - 11, y); g.lineTo(f.x + 11, y); g.stroke(); if (f.t > 2.5) w.fall = null; }
        if (A.hid) continue;
        g.globalAlpha = ca * (w.gone ? 1 - w.gone.t * 2 : 1); man(g, w);
      }
      g.globalAlpha = 1;
      const la = U.span(p, 0.94, 0.96);
      if (la > 0.02 && st.apts.length) {
        const R = st.rave, D = st.door, gy = st.py, sil = night ? 'rgba(40,30,30,.9)' : 'rgba(250,246,238,.9)';
        // what is frightening near the street just now; and anything a third of the screen tall is a giant going by
        let big = null; st.nthr = 0;
        for (const o of c.scene.actors) if (!o.hid && o.tags.indexOf('threat') >= 0) { const tall = o.h > c.h / 3; if (tall) big = o; if ((tall || o.y > c.h - 150) && st.nthr < 6) st.thr[st.nthr++] = o; }
        st.quiet = st.nthr ? 0 : st.quiet + dt; st.calm = st.quiet > 2; st.cap = night ? 5 : 10;
        if (big) {   // windows shut and lights go out along its way, and the party is over
          st.big = 1;
          if ((st.bigT -= dt) <= 0) { st.bigT = 0.5; for (const q of st.ten) if (Math.abs(q.x - big.x) < 260) shoo(st, q); for (const a of st.apts) if (Math.abs(a.x + a.w / 2 - big.x) < 220) a.on = false; if (R.a) R.t = R.dur; }
        }
        else if (st.big) { st.big = 0; st.gawk = 45; let k = 0; for (const q of st.ten) if (q.mode === 'in' && k < 3) { q.want = 'lean'; q.tt = 2 + 2 * k++; } }   // gone: people come to the windows and out of the shops to see what it did
        if (st.gawk > 0) st.gawk -= dt;
        // households: every few seconds one of them thinks again about its light, so the block changes a window at a time
        if ((st.lt -= dt) <= 0) { st.lt = 1.2 + Math.random() * 2.3; const a = st.apts[Math.floor(Math.random() * st.apts.length)]; if (a !== R.a && a !== R.nb && !(a.who && a.who.mode !== 'in')) a.on = Math.random() < odds(a, night); }
        for (const a of st.apts) {
          if (!a.on || a === R.a) continue;
          g.fillStyle = a.hue === 2 ? TELLY : a.hue ? COOL : WARM;   // warm lamps, cool ones, and the blue of a television that never holds still
          g.globalAlpha = la * (night ? 0.62 : 0.36) * (a.hue === 2 ? 0.62 + 0.38 * Math.sin(t * 9 + a.x) * Math.sin(t * 2.3 + a.y) : 1);
          if (st.xmas && a.deck === 1) { g.beginPath(); for (const w of a.wins) g.rect(w.x + 1, w.y + 1, w.w - 2, w.h - 2); fir(g, a.wins[0]); g.fill('evenodd'); }   // the lamp is behind the tree
          else for (const w of a.wins) g.fillRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
        }
        g.globalAlpha = la;
        // the lights on the Christmas trees twinkle slowly after dark
        if (st.xmas && night) for (const a of st.apts) if (a.deck === 1 && a !== R.a) {
          const w = a.wins[0], x = w.x + w.w / 2, y = w.y + w.h - 3, h = firH(w);
          for (let k = 0; k < 6; k++) { g.globalAlpha = la * (0.2 + 0.8 * (0.5 + 0.5 * Math.sin(t * 1.1 + k * 2.1 + a.x))); g.fillStyle = GLOW[k % 3]; g.beginPath(); g.arc(x + BAUB[k * 2] * h * 0.4, y - h + BAUB[k * 2 + 1] * h, 1.5, 0, TAU); g.fill(); }
          g.globalAlpha = la;
        }
        // the rave: one apartment at a time, a minute or two, its panes flashing in time and the guests bobbing; more likely at night
        if (R.a) {
          const a = R.a, beat = Math.floor(t * 4); R.t += dt;
          for (let i = 0; i < a.wins.length; i++) {
            const w = a.wins[i], hw = (w.w - 2) / 2;
            g.globalAlpha = la * (beat & 1 ? 0.92 : 0.74);
            for (let h = 0; h < 2; h++) { g.fillStyle = RAVE[(beat + i * 2 + h) % 4]; g.fillRect(w.x + 1 + h * hw, w.y + 1, hw, w.h - 2); }
            g.globalAlpha = la;
            for (let k = 0; k < 2; k++) shade(g, w, 0.28 + 0.44 * k, 'rgba(22,12,34,.9)', (beat + k + i) & 1, t + k, Math.abs(Math.sin(t * 7 + k * 1.7 + i)) * 3);
          }
          const nb = R.nb;   // next door: the light goes on, and someone stands at the window with both arms in the air
          if (nb && R.t > 6) { nb.on = true; if ((R.t - 6) % 26 < 13) shade(g, nb.x < a.x ? nb.wins[0] : nb.wins[nb.wins.length - 1], 0.5, sil, 1, t, 0); }
          next.push(R.A);
          if (R.t > R.dur) { a.on = Math.random() < 0.5; R.a = R.nb = null; R.wait = 50 + Math.random() * 70; }
        }
        else if ((R.wait -= dt) <= 0) {
          R.wait = 20;
          if (R.sure || Math.random() < (night ? 0.3 : 0.07)) {
            let a = null; for (let k = 0; k < 12 && !a; k++) { const o = st.apts[Math.floor(Math.random() * st.apts.length)]; if (!o.who && !(st.xmas && o.deck === 1) && (o.wins.length > 1 || k > 7)) a = o; }
            if (a) { const o = a.nb.length ? a.nb[Math.floor(Math.random() * a.nb.length)] : null, w = a.wins[0]; R.a = a; R.nb = o && !o.who && Math.random() < 0.8 ? o : null; R.t = 0; R.dur = 60 + Math.random() * 60; R.sure = false; R.A.x = w.x + w.w / 2; R.A.y = w.y + w.h; SEEN.raves++; SEEN.x = R.A.x; SEEN.y = R.A.y; }
          }
        }
        // the front door stands open while someone is in it
        st.ajar = U.clamp(st.ajar + (st.hold > 0 ? dt : -dt) * 3, 0, 1); if (st.hold > 0) st.hold -= dt;
        if (D && st.ajar > 0.02) {
          const k = st.ajar, tp = gy - 24;
          g.fillStyle = night ? 'rgba(255,226,156,.96)' : 'rgba(20,14,12,.9)'; g.fillRect(D.x - 10 * k, tp + 0.5, 20 * k, 23.5);
          g.fillStyle = 'rgba(104,70,48,.96)'; g.fillRect(D.x - 10.5, tp + 0.5, 1.5 + 2 * k, 23.5); g.fillRect(D.x + 9 - 2 * k, tp + 0.5, 1.5 + 2 * k, 23.5);
        }
        // a shop door stands open while someone is in it; and those who ran inside look out through the window after a moment
        for (const S of st.shops) {
          if (S.ajar > 0) { S.ajar -= dt; g.fillStyle = night ? 'rgba(255,226,156,.96)' : 'rgba(20,14,12,.9)'; g.fillRect(S.dx - 5.5, S.b.y + S.b.h - 32.5, 11, gy - S.b.y - S.b.h + 32); }
          if (S.hid > 0 && S.win) { if ((S.peek += dt) > 1.5) { shade(g, S.win, 0.3, sil, 0, t, 0); if (S.hid > 1) shade(g, S.win, 0.68, sil, 0, t, 0); } } else S.peek = 0;
        }
      // tenants: now and then someone comes to a window, stays a while and goes
        // and they lean out and wave, go out by the lift and the door, and come home the same way
        for (const q of st.ten) {
          dwell(st, q, c, dt, night);
          const m = q.mode, A = q.A, at = m === 'open' || m === 'lean' || m === 'shut', cage = m === 'up' || m === 'down', out = m === 'out' || m === 'come' || m === 'run' || m === 'enter';
          q.up = q.wv > 0 && (Math.floor((4.8 - q.wv) / 1.2) & 1) === q.wo;
          if (m === 'peek') shade(g, q.win, 0.5, sil, 0, t, 0);
          else if (at) leanOut(g, q, t);
          else if (cage) { q.sc = 0.82; q.st = 'stand'; man(g, q); q.sc = 0; }   // small enough to stand in the cage
          else if (out && q.al > 0) { g.globalAlpha = la * Math.min(1, q.al); man(g, q); g.globalAlpha = la; }
          A.hid = !(at || (out && q.al > 0.3));
          if (!A.hid) { A.x = q.x; A.y = q.y; A.dir = q.dir; A.h = at ? 14 : 22; next.push(A); }   // only those out of doors or at an open window are there for others
        }
        // the pavement: at most ten out at once, and they run for cover from anything frightening
        let out = 0; for (const q of st.ten) if (!q.A.hid && q.A.h === 22) out++;
        for (const w of st.walk) {
          stroll(st, w, c, dt);
          const A = w.A; A.hid = !w.on || w.al < 0.3; if (A.hid) continue;
          for (let i = 0; i < st.nthr; i++) if (Math.abs(st.thr[i].x - w.x) < (st.thr[i].h > c.h / 3 ? 200 : 130)) { bolt(st, w, st.thr[i]); break; }
          g.globalAlpha = la * w.al; man(g, w); if (w.dog) mutt(g, w);
          A.x = w.x; A.y = w.y; A.dir = w.dir; next.push(A); out++;
        }
        SEEN.shoppers = out; g.globalAlpha = la;
        // the cars at the kerb stand in front of the people: a strip of their own, painted again only when a car comes, goes or is flattened
        if (!st.fg) { st.fg = document.createElement('canvas'); st.fg.width = c.w; st.fg.height = 24; }
        if (st.fgKey !== st.carKey) { st.fgKey = st.carKey; const gg = st.fg.getContext('2d'); gg.clearRect(0, 0, c.w, 24); for (const k of st.cars) if (k.st === 'parked' || k.st === 'flat') auto(gg, k, k.x, 23.5, 1); }
        g.drawImage(st.fg, 0, c.h - 24); traffic(g, st, c, dt, t, la);
        g.globalAlpha = 1;
        if (la > 0.98 || st.tk.ph) turkeyDrop(g, st, c, t, dt, hol, la);
      }
      if (p > 0.95 && st.signA) next.push(st.signA);
    },
  });
})();
