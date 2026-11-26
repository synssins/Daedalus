'use strict';
// Construction crew: stick figures in hard hats turn the tiles into one big apartment block over the cycle. First
// surveyors and stakes, then scaffolding round every tile from the bottom row up, floors and windows, lifts in the
// channels between tiles, a crane on the top row. When it is finished the scaffolds and the crew are gone: curtains,
// lit windows at night, tenants at the windows, a front door with an awning and a FOR RENT sign at ground level.
// Everything that stands still is decided once from the seed and painted to a hidden sheet; only the figures, the
// lift cages and the crane hook are drawn every frame.
(() => {
  const U = HP.fx.util, TAU = Math.PI * 2;
  const solid = r => !r.hidden && !r.flat;
  const INK = '#f4efe6', HALO = 'rgba(14,14,24,.55)', HAT = '#ffc62a', WOOD = '#e2b25e', STEEL = 'rgba(208,216,228,';
  const SEEN = HP.fx.buildTest = {flees: 0, carries: 0, rides: 0, climbs: 0};   // counters for the test page
  const J = new Float32Array(14);   // one figure's joints: head, shoulder, hip, two feet, two hands

  /** Work out a figure's joints for what it is doing, in its own space: feet at 0,0, facing right, about 18 tall. */
  function pose(w) {
    const s = Math.sin(w.ph), c = Math.cos(w.ph), a = w.st;
    let hx = 0, hy = -15, sx = 0, sy = -11.5, px = 0, py = -6, f1x = -2, f1y = 0, f2x = 2, f2y = 0, h1x = -2.5, h1y = -6, h2x = 2.5, h2y = -6;
    if (a === 'walk' || a === 'flee') {
      f1x = s * 3.6; f2x = -s * 3.6; f1y = Math.min(0, c) * 1.4; f2y = Math.min(0, -c) * 1.4; h1x = -s * 3; h2x = s * 3; h1y = h2y = -6.5;
      if (a === 'flee') { sx = 1.5; hx = 2.5; h1x = -2; h1y = -18 + s; h2x = 5; h2y = -18 - s; }
      else if (w.hold) { h1x = 1; h1y = -13.4; h2x = 3.5; h2y = -13.4; }
    }
    else if (a === 'climb') { h1x = -2; h1y = -17 + s * 2; h2x = 2; h2y = -17 - s * 2; f1y = Math.min(0, s * 2.5); f2y = Math.min(0, -s * 2.5); }
    else if (a === 'task' && w.task === 'hammer') { const k = Math.abs(s); px = -1; py = -4; f1x = -5; f2x = 3; sx = 1.5; sy = -9; hx = 3; hy = -12.3; h1x = 6; h1y = -1.5; h2x = 4 + 2 * k; h2y = -4 - 8 * k; }
    else if (a === 'task' && w.task === 'break') { py = -2; sy = -8; hy = -11.5; f1x = 6; f1y = -1; f2x = 6.5; f2y = 0; h1x = 2; h1y = -3.5; h2x = s > 0.9 ? 2.5 : 4.5; h2y = s > 0.9 ? -10 : -5; }
    else if (a === 'task' && w.task === 'survey') { sx = 1; hx = 2.2; hy = -14.6; h2x = 6.5; h2y = -11.5; }
    J[0] = hx; J[1] = hy; J[2] = sx; J[3] = sy; J[4] = px; J[5] = py; J[6] = f1x; J[7] = f1y; J[8] = f2x; J[9] = f2y; J[10] = h1x; J[11] = h1y; J[12] = h2x; J[13] = h2y;
  }
  function man(g, w) {
    pose(w);
    g.save(); g.translate(w.x, w.y); g.scale(w.dir * 1.2, 1.2); g.lineCap = g.lineJoin = 'round';
    for (let k = 0; k < 2; k++) {   // a dark edge first, so the pale figure shows on any backdrop
      g.strokeStyle = g.fillStyle = k ? INK : HALO; g.lineWidth = k ? 1.5 : 3.4;
      g.beginPath(); g.moveTo(J[6], J[7]); g.lineTo(J[4], J[5]); g.lineTo(J[8], J[9]); g.moveTo(J[4], J[5]); g.lineTo(J[2], J[3]); g.moveTo(J[10], J[11]); g.lineTo(J[2], J[3]); g.lineTo(J[12], J[13]); g.stroke();
      g.beginPath(); g.arc(J[0], J[1], k ? 2.7 : 3.6, 0, TAU); g.fill();
    }
    g.fillStyle = HAT; g.beginPath(); g.arc(J[0], J[1] - 0.6, 3.2, Math.PI, 0); g.fill(); g.fillRect(J[0] - 3.2, J[1] - 1.3, 7.8, 1.2);   // hard hat, brim to the front
    if (w.st === 'walk' && w.hold) { g.strokeStyle = WOOD; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-9, -14.6); g.lineTo(12, -14.6); g.stroke(); }
    else if (w.st === 'task' && w.task === 'hammer') { g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.moveTo(J[12], J[13]); g.lineTo(J[12] + 3.5, J[13] - 2.5); g.stroke(); g.fillStyle = '#9aa3ad'; g.fillRect(J[12] + 2.4, J[13] - 4.6, 2.6, 3.6); }
    else if (w.st === 'task' && w.task === 'break') { g.fillStyle = '#fff'; g.fillRect(J[12] + 0.4, J[13] - 2.6, 2.4, 2.8); g.fillStyle = '#d9534a'; g.fillRect(-8, -4.2, 5.5, 4.2); }
    else if (w.st === 'task' && w.task === 'survey') { g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(9, -11); g.lineTo(6, 0); g.moveTo(9, -11); g.lineTo(9.5, 0); g.moveTo(9, -11); g.lineTo(13, 0); g.stroke(); g.fillStyle = HAT; g.fillRect(6.8, -13.8, 4.8, 3.2); }
    g.restore();
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

  /** The hidden sheet with everything that stands still, painted again only when the work has visibly moved on. */
  function still(st, c, paint) {
    const key = Math.round(c.progress * 250) * 2 + (c.env.night ? 1 : 0);
    if (!st.cv) { st.cv = document.createElement('canvas'); st.cv.width = c.w; st.cv.height = c.h; st.key = -1; }
    if (key !== st.key) { st.key = key; const g = st.cv.getContext('2d'); g.clearRect(0, 0, c.w, c.h); g.save(); paint(g); g.restore(); }
    return st.cv;
  }
  function paintSite(g, st, c, p) {
    const night = !!c.env.night, done = U.span(p, 0.92, 0.96), gy = c.h - 2;
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
    for (const f of st.rows) if (f.at <= p) { g.moveTo(f.x0, f.y); g.lineTo(f.x1, f.y); g.moveTo(f.bx, f.y); g.lineTo(f.bx + 7, f.y); }
    g.stroke();
    g.strokeStyle = 'rgba(232,150,116,.42)'; g.lineWidth = 1.8; g.beginPath();
    for (const k of st.bricks) if (k.at <= p) for (let row = 0; row < k.n; row++) for (let i = 0; i < 3; i++) { const x = k.x + i * 9 + (row & 1) * 4.5, y = k.y + row * 4; g.moveTo(x, y); g.lineTo(x + 6, y); }
    g.stroke();
    // windows: glass, frames, and once people have moved in, curtains and light
    const lit = night && done > 0.5;
    g.fillStyle = night ? 'rgba(16,20,36,.3)' : 'rgba(190,222,246,.17)'; g.beginPath(); for (const w of st.wins) if (w.at <= p && !(lit && w.lit)) g.rect(w.x, w.y, 9, 11); g.fill();
    if (lit) { g.fillStyle = 'rgba(255,206,112,.66)'; g.beginPath(); for (const w of st.wins) if (w.lit) g.rect(w.x, w.y, 9, 11); g.fill(); }
    if (done > 0.05) {
      g.globalAlpha = done;
      for (let k = 0; k < 3; k++) {
        g.fillStyle = ['rgba(236,120,110,.62)', 'rgba(120,190,170,.62)', 'rgba(240,232,214,.62)'][k]; g.beginPath();
        for (const w of st.wins) if (w.cur === k) { g.moveTo(w.x, w.y); g.lineTo(w.x + 4, w.y); g.lineTo(w.x, w.y + 9); g.moveTo(w.x + 9, w.y); g.lineTo(w.x + 5, w.y); g.lineTo(w.x + 9, w.y + 9); }
        g.fill();
      }
      g.globalAlpha = 1;
    }
    g.strokeStyle = 'rgba(244,239,230,.62)'; g.lineWidth = 1; g.beginPath();
    for (const w of st.wins) if (w.at <= p) { g.rect(w.x + 0.5, w.y + 0.5, 8, 10); g.moveTo(w.x + 4.5, w.y + 1); g.lineTo(w.x + 4.5, w.y + 10); g.moveTo(w.x - 1, w.y + 12.5); g.lineTo(w.x + 10, w.y + 12.5); }
    g.stroke();
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
      g.globalAlpha = 1;
    }
    const S = st.sign;
    if (S && done > 0.02) {
      g.globalAlpha = done;
      g.strokeStyle = HALO; g.lineWidth = 4.5; g.beginPath(); g.moveTo(S.x, gy); g.lineTo(S.x, gy - 22); g.stroke();
      g.strokeStyle = WOOD; g.lineWidth = 2.6; g.beginPath(); g.moveTo(S.x, gy); g.lineTo(S.x, gy - 22); g.stroke();
      g.fillStyle = 'rgba(252,249,240,.97)'; g.fillRect(S.x - 26, gy - 38, 52, 17); g.strokeStyle = '#c8322c'; g.lineWidth = 1.6; g.strokeRect(S.x - 25, gy - 37, 50, 15);
      g.fillStyle = '#c8322c'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FOR RENT', S.x, gy - 29);
      g.globalAlpha = 1;
    }
  }

  HP.fx.add('build', {
    label: 'Construction crew', grows: true, days: 7, live: true, fps: 12, z: 1, covers: true,
    options: [{key: 'crew', label: 'Crew', type: 'range', min: 3, max: 6, step: 1, default: 4}],
    create(c) {
      const r = c.rand, tiles = [], wins = [], rows = [], bricks = [], lifts = [], crew = [];
      const plats = [{i: 0, x1: 8, x2: c.w - 8, y: c.h - 2, at: 0, off: 9, links: [], lifts: []}];   // the ground: the bottom of the screen
      const bs = c.rects.filter(b => solid(b) && b.w > 50 && b.h > 40);
      let top = 1e9, bot = 0; for (const b of bs) { top = Math.min(top, b.y + b.h); bot = Math.max(bot, b.y + b.h); }
      for (const b of bs) {
        const f = (bot - (b.y + b.h)) / (bot - top || 1), X = b.x + b.w, at = 0.1 + 0.28 * f + 0.04 * r();   // the bottom row is built first
        const T = {b, at, off: 0.8 + 0.07 * (1 - f) + 0.02 * r(), stk: 0.005 + 0.06 * r(), win: at + 0.18, lad: null, plat: null, roof: 0};
        if (!bs.some(o => o !== b && o.y + o.h <= b.y && b.y - (o.y + o.h) < 60 && o.x < X - 20 && o.x + o.w > b.x + 20)) T.roof = r() < 0.5 ? 2 : 1;   // nothing built on top of it: it gets a roof
        // windows where a tile is empty: a full grid down its right-hand third, and one row along the top beyond its symbol
        for (let y = b.y + 8, j = 0; y + 11 < b.y + b.h - 5; y += 18, j++) {
          const wa = T.win + 0.13 * (1 - (y - b.y) / b.h); let x0 = 0;
          for (let x = X - 23; x > b.x + (j ? b.w * 0.66 : Math.max(b.w * 0.5, 46)); x -= 15) { x0 = x; wins.push({x: Math.round(x), y: Math.round(y), at: wa + 0.02 * r(), lit: r() < 0.55, cur: Math.floor(r() * 5)}); }
          if (x0) rows.push({x0: x0 - 3, x1: X - 11, bx: b.x + 1, y: Math.round(y) + 14.5, at: wa - 0.03});
        }
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
      if (E) { door = {x: E.x + E.w * 0.66}; sign = {x: Math.min(c.w - 30, E.x + E.w - 12)}; }
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
      const st = {tiles, wins, rows, bricks, plats, lifts, crane, door, sign, crew, ways: [], ten: [], signA: null};
      if (sign) st.signA = {kind: 'rentsign', tags: ['prop', 'wonder'], x: sign.x, y: c.h - 2, h: 38};
      // the crew starts spread over the levels that are built by now
      const open = plats.filter(P => !P.i || (P.at <= c.progress && P.off > c.progress));
      for (let i = 0, n = U.clamp(Math.round(+c.opts.crew || 4), 3, 6); i < n; i++) {
        const P = open[Math.floor(Math.random() * open.length)], w = {x: P.x1 + Math.random() * (P.x2 - P.x1), y: P.y, pl: P, dir: 1, st: 'task', task: 'hammer', tt: Math.random() * 2, ph: 0, hold: 0, go: null, to: null, lift: null, dest: 0, gone: null, fall: null, A: null};
        w.A = {kind: 'builder', tags: ['creature', 'person'], x: w.x, y: w.y, h: 22, dir: 1, hid: false, scare: by => scare(w, by), carry: by => carry(w, by)};
        crew.push(w);
      }
      for (let i = 0; i < 4; i++) st.ten.push({w: null, tt: 1 + i * 2.5});
      return st;
    },
    draw(g, st, c, t, dt) {
      const p = c.progress, next = c.scene.next, night = !!c.env.night;
      dt = Math.min(dt || 0, 0.25);
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
      // tenants: now and then someone comes to a window, stays a while and goes
      if (p > 0.95 && st.wins.length) {
        for (const q of st.ten) {
          if ((q.tt -= dt) <= 0) { q.w = q.w ? null : st.wins[Math.floor(Math.random() * st.wins.length)]; q.tt = q.w ? 8 + Math.random() * 14 : 2 + Math.random() * 6; }
          const w = q.w; if (!w) continue;
          if (night) { g.fillStyle = 'rgba(255,214,130,.9)'; g.fillRect(w.x + 1, w.y + 1, 7, 9); }
          g.fillStyle = night ? 'rgba(40,30,30,.9)' : 'rgba(250,246,238,.9)'; g.beginPath(); g.arc(w.x + 4.5, w.y + 4.6, 2.2, 0, TAU); g.rect(w.x + 1.5, w.y + 7.4, 6, 3.1); g.fill();
        }
        if (st.signA) next.push(st.signA);
      }
    },
  });
})();
