'use strict';
// Tank battle: a screensaver. When the panel has been left alone for a while, the tiles turn into a pixel landscape
// and a few little tanks drop onto it and shell each other, blowing real holes in the tiles. One tap ends it.
//
// SAFETY RULES (this kind hides the real tiles, so these are requirements, not style):
//   - Every element hidden is made visible again on tap, whenever create() runs (the engine calls it on any layout
//     or dashboard change), and when the page becomes hidden.
//   - Every touch of a real element is wrapped in try/catch. If anything in a battle frame throws, the tiles are
//     restored and the kind goes back to idle.
//   - While idle the kind costs nothing: draw() returns after one comparison.
//   - A battle runs at most 10 minutes, then the view is restored: a wall panel is never left unreadable by a stuck game.
(() => {
  const U = HP.fx.util;
  const GRAV = 60, VMAX = 200, MAXMS = 600000;  // cells per second squared; a full power bar in cells per second
  const GROUND = [[76, 176, 80], [38, 166, 154], [214, 120, 60], [140, 110, 220], [226, 190, 90], [70, 130, 220]], LIT = [255, 196, 60], HILL = [60, 170, 90];
  const TANKS = [['RED', [255, 77, 77]], ['CYAN', [63, 224, 255]], ['LIME', [182, 255, 60]], ['PINK', [255, 106, 213]], ['WHITE', [244, 244, 244]], ['ORANGE', [255, 154, 46]]];
  // our own 3 by 5 pixel letters: five rows a glyph, each row a digit whose three bits are the three pixels
  const FONT = {A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227', J: '11152', K: '55655', L: '44447', M: '57555',
    N: '57775', O: '25552', P: '65644', Q: '25573', R: '65655', S: '34216', T: '72222', U: '55557', V: '55552', W: '55775', X: '55255', Y: '55222', Z: '71247',
    0: '75557', 1: '26227', 2: '61247', 3: '61216', 4: '55711', 5: '74616', 6: '34757', 7: '71222', 8: '75757', 9: '75716'};
  const css = (c, k) => { k = k == null ? 1 : k; return 'rgb(' + Math.min(255, c[0] * k | 0) + ',' + Math.min(255, c[1] * k | 0) + ',' + Math.min(255, c[2] * k | 0) + ')'; };
  /** Pixel text: every lit pixel is a square of px. Characters we have no glyph for come out as a space. */
  function text(g, s, x, y, px) {
    for (let i = 0; i < s.length; i++) { const f = FONT[s[i]]; if (f) for (let r = 0; r < 5; r++) for (let b = 0; b < 3; b++) if (f[r] & (4 >> b)) g.fillRect(x + (i * 4 + b) * px, y + r * px, px, px); }
  }

  let cur = null, hid = [];  // the state on screen, and every element we hid with the inline value it had
  /** Give every hidden tile back. Safe to call at any time, any number of times. */
  function restore() {
    for (const h of hid) { try { h.el.style.visibility = h.v; } catch (e) { /* the element is gone: nothing to give back */ } }
    hid = [];
    try { if (HP.cut) HP.cut(); } catch (e) {}  // the tiles' frosted patches come back with them
  }
  function idleMs(st) { return (+st.ctx.opts.idle || 5) * 60000; }
  /** Stop the battle, show the dashboard, start waiting again. */
  function end(st) { restore(); st.game = null; st.at = Date.now() + idleMs(st); }
  document.addEventListener('visibilitychange', () => { if (document.hidden && cur && cur.game) end(cur); });

  // ---------- the ground ----------
  /** A tile's own colour if it has a solid one, lifted if too dark to read as ground; otherwise null. */
  function tileColour(el) {
    try {
      const cs = getComputedStyle(el);
      for (const v of [cs.backgroundColor, cs.getPropertyValue('--fill-base')]) {
        const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/.exec(v || ''), h = /^\s*#([0-9a-f]{6})\s*$/i.exec(v || '');
        let c = m && (m[4] == null || +m[4] >= 0.6) ? [+m[1], +m[2], +m[3]] : h ? [parseInt(h[1].slice(0, 2), 16), parseInt(h[1].slice(2, 4), 16), parseInt(h[1].slice(4), 16)] : null;
        if (c) { const mx = Math.max(c[0], c[1], c[2], 1); if (mx < 130) c = c.map(x => x * 130 / mx + 20); return c; }
      }
    } catch (e) { /* fall back to our palette */ }
    return null;
  }
  /** The rows of a rounded block in cells: calls f(row, firstCell, lastCell). */
  function rows(x0, y0, x1, y1, r, f) {
    r = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
    for (let y = y0; y <= y1; y++) {
      const d = Math.max(r - (y - y0) - 0.5, r - (y1 - y) - 0.5, 0), ins = d > 0 ? Math.round(r - Math.sqrt(Math.max(0, r * r - d * d))) : 0;
      if (x1 - ins >= x0 + ins) f(y, x0 + ins, x1 - ins);
    }
  }
  /** Paint the landscape afresh: hills along the bottom, then every tile as a solid block. Mask and picture are
   *  written together, row by row, so they always agree and the picture never has to be read back. */
  function terrain(G) {
    const W = G.W, H = G.H, S = G.S, tg = G.tg, m = G.mask, r = G.rng, n = U.noise(G.seed + G.round * 7);
    m.fill(0); tg.clearRect(0, 0, W, H);
    for (let x = 0; x < W; x++) {
      const top = Math.round(H - H * (0.07 + 0.035 * (n(x / 28) + 0.5 * n(x / 9 + 40))));
      for (let y = top; y < H; y++) m[y * W + x] = 1;
      tg.fillStyle = css(HILL, 0.75); tg.fillRect(x, top, 1, H - top); tg.fillStyle = css(HILL, 1.25); tg.fillRect(x, top, 1, 2);
    }
    for (const t of G.tiles) {
      const c = t.col, cl = (v, hi) => v < 0 ? 0 : v > hi ? hi : v;
      rows(t.x0, t.y0, t.x1, t.y1, t.r, (y, a, b) => { if (y < 0 || y >= H) return; a = cl(a, W - 1); b = cl(b, W - 1); m.fill(1, y * W + a, y * W + b + 1); tg.fillStyle = css(c, 0.45); tg.fillRect(a, y, b - a + 1, 1); });
      rows(t.x0 + 1, t.y0 + 1, t.x1 - 1, t.y1 - 1, t.r - 1, (y, a, b) => { tg.fillStyle = css(c, y < t.y0 + 3 ? 1.3 : 1); tg.fillRect(a, y, b - a + 1, 1); });
      // a few darker specks so a big tile is not one flat slab
      tg.fillStyle = css(c, 0.8);
      for (let i = (t.x1 - t.x0) * (t.y1 - t.y0) / 50 | 0; i > 0; i--) { const x = t.x0 + 2 + r() * (t.x1 - t.x0 - 4) | 0, y = t.y0 + 4 + r() * (t.y1 - t.y0 - 6) | 0; if (x >= 0 && x < W - 1 && y >= 0 && y < H && m[y * W + x] && m[y * W + x + 1]) tg.fillRect(x, y, 2, 1); }
      // the tile's name, as much of it as fits; left out when that would be under three letters
      const fit = Math.min(t.name.length, (t.x1 - t.x0 - 7) / 4 | 0);
      if (fit >= 3 && t.y1 - t.y0 > 14) { tg.fillStyle = css(c, 0.4); text(tg, t.name.slice(0, fit), t.x0 + 4, t.y0 + 5, 1); }
    }
  }
  function solid(G, x, y) { x |= 0; y |= 0; if (y >= G.H) return 1; if (x < 0 || x >= G.W || y < 0) return 0; return G.mask[y * G.W + x]; }  // the screen's bottom edge is a floor
  /** Blow a round hole: the same rows cleared in the mask and in the picture. */
  function cut(G, cx, cy, R) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let dy = -R; dy <= R; dy++) {
      const y = cy + dy; if (y < 0 || y >= G.H) continue;
      const half = Math.sqrt(R * R - dy * dy + R * 0.8) | 0, a = Math.max(0, cx - half), b = Math.min(G.W - 1, cx + half);
      if (b >= a) { G.mask.fill(0, y * G.W + a, y * G.W + b + 1); G.tg.clearRect(a, y, b - a + 1, 1); }
    }
  }
  function colourAt(G, x, y) { for (const t of G.tiles) if (x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1) return t.col; return HILL; }

  // ---------- a battle ----------
  /** Hide the tiles, build their destructible copy, start round one. */
  function begin(st) {
    const ctx = st.ctx, S = ctx.w > 1400 ? 4 : 3, W = Math.ceil(ctx.w / S), H = Math.ceil(ctx.h / S);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const G = {S, W, H, cv, tg: cv.getContext('2d'), mask: new Uint8Array(W * H), tiles: [], seed: ctx.seed, round: 0, n: U.clamp(Math.round(+ctx.opts.tanks || 3), 2, 6)};
    const pick = U.rng(ctx.seed);
    ctx.rects.forEach(r => {
      if (r.hidden || r.flat || !r.el) return;
      // hide first: a tile we cannot hide is not painted, or it would show twice
      try { hid.push({el: r.el, v: r.el.style.visibility}); r.el.style.visibility = 'hidden'; } catch (e) { return; }
      const name = String((r.tile && r.tile.name) || '').toUpperCase();
      G.tiles.push({x0: Math.round(r.x / S), y0: Math.round(r.y / S), x1: Math.round((r.x + r.w) / S) - 1, y1: Math.round((r.y + r.h) / S) - 1, r: (r.r || 0) / S,
        col: tileColour(r.el) || (r.on ? LIT : GROUND[pick() * GROUND.length | 0]), name});
    });
    try { if (HP.cut) HP.cut(); } catch (e) {}  // hidden tiles leave no frosted patch behind the landscape
    st.game = G; st.at = 0; st.end = Date.now() + MAXMS;
    round(G);
  }
  function round(G) {
    G.round++; G.rng = U.rng(G.seed + G.round * 977);
    terrain(G);
    G.tanks = []; G.shells = []; G.blasts = []; G.parts = []; G.pend = []; G.trail = [];
    G.wind = (G.rng() * 2 - 1) * 8; G.turn = -1; G.phase = 'settle'; G.pt = 0.6; G.pow = 0; G.win = null;
    const r = G.rng, W = G.W, H = G.H, order = TANKS.slice().sort(() => r() - 0.5);
    for (let i = 0; i < G.n; i++) {
      let x = 0, y = 0, ok = false;
      for (let k = 0; k < 300 && !ok; k++) {
        x = 8 + r() * (W - 16) | 0;
        if (G.tanks.some(t => Math.abs(t.x - x) < (k < 150 ? W / (G.n * 1.6) : 14))) continue;
        // the first ground under open sky in this column: a tile's top or a hill, never a channel between two tiles
        for (y = 0; y < H && !solid(G, x, y); y++);
        ok = y >= 8 && y < H;
        for (let dy = 1; dy <= 7 && ok; dy++) for (let dx = -4; dx <= 4; dx++) if (solid(G, x + dx, y - dy)) ok = false;
      }
      if (ok) y = Math.max(5, y - 30);  // it drops in from above
      else { x = 12 + r() * (W - 24) | 0; y = 12 + r() * (H * 0.5) | 0; cut(G, x, y, 8); }  // a dashboard with no open top anywhere: blast a pocket to land in
      G.tanks.push({x, y, hp: 100, name: order[i][0], col: order[i][1], a: Math.PI / 2, ga: 0, gp: 0, fy: 0, vy: 0, fell: 0, fresh: true, dead: false, mem: null});
    }
  }
  function alive(G) { return G.tanks.filter(t => !t.dead); }
  /** Where a plain shell fired at this angle and power would come down, and how far that is from the target. */
  function trace(G, t, a, v, who) {
    let x = t.x + 0.5 + Math.cos(a) * 6, y = t.y - 4 - Math.sin(a) * 6, vx = Math.cos(a) * v, vy = -Math.sin(a) * v;
    for (let i = 0; i < 900; i++) {
      const h = 1 / Math.max(40, Math.abs(vx) + Math.abs(vy));  // about a cell a step
      vy += GRAV * h; vx += G.wind * h; x += vx * h; y += vy * h;
      if (Math.abs(x - who.x - 0.5) <= 4.5 && y >= who.y - 4 && y <= who.y + 1) return 0;
      if (x < -30 || x > G.W + 30 || solid(G, x, y)) break;
    }
    return Math.hypot(x - who.x, y - who.y);
  }
  /** The aiming, like a person finding the range: the tank works out the shot that would land closest, then is off
   *  by a fair bit on its first try at a target and by less each time after, so a hit takes two or three shells. */
  function plan(G, t) {
    const r = G.rng, foes = alive(G).filter(o => o !== t);
    let m = t.mem;
    if (!m || m.who.dead) { let who = foes[0]; for (const f of foes) if (Math.abs(f.x - t.x) < Math.abs(who.x - t.x)) who = f; if (r() < 0.3) who = foes[r() * foes.length | 0]; m = t.mem = {who, shots: 0}; }
    const dir = m.who.x < t.x ? -1 : 1, k0 = r() * 3 | 0;
    let best = 1e9, el = 1.2, v = 100;
    for (let k = 0; k < 3; k++) { const e = [1, 1.2, 1.42][(k + k0) % 3]; for (let p = 30; p <= VMAX; p += 6) { const d = trace(G, t, dir > 0 ? e : Math.PI - e, p, m.who); if (d < best) { best = d; el = e; v = p; } } }
    const off = [0.2, 0.08, 0.03, 0.012][Math.min(3, m.shots++)];
    v = U.clamp(v * (1 + (r() < 0.5 ? -1 : 1) * off * (0.5 + r() * 0.5)), 25, VMAX);
    t.ga = dir > 0 ? el : Math.PI - el; t.gp = v / VMAX;
  }
  function next(G) {
    const n = G.tanks.length;
    for (let i = 1; i <= n; i++) { const k = (G.turn + i) % n; if (!G.tanks[k].dead) { if (k <= G.turn) G.wind = (G.rng() * 2 - 1) * 8; G.turn = k; break; } }  // new wind every time round
    plan(G, G.tanks[G.turn]); G.phase = 'aim'; G.pow = 0;
  }
  function fire(G, t) {
    const k = G.rng(), kind = k < 0.76 ? 'shell' : k < 0.84 ? 'big' : k < 0.92 ? 'cluster' : 'digger', v = t.gp * VMAX;
    G.trail = [];
    G.shells.push({x: t.x + 0.5 + Math.cos(t.a) * 6, y: t.y - 4 - Math.sin(t.a) * 6, vx: Math.cos(t.a) * v, vy: -Math.sin(t.a) * v, kind, age: 0, by: t, dig: 0, tr: 0});
  }
  function dust(G, x, y, n, col) {
    for (let i = 0; i < n && G.parts.length < 60; i++) { const a = Math.random() * 6.28, v = 15 + Math.random() * 45; G.parts.push({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.5 + Math.random() * 0.7, col}); }
  }
  function boom(G, x, y, R, dmg) {
    const tg = G.tg, col = colourAt(G, x | 0, y | 0);
    // scorch what will be the crater's rim, then cut
    tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = 'rgba(0,0,0,.4)'; tg.beginPath(); tg.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, R + 2.5, 0, 6.3); tg.fill(); tg.globalCompositeOperation = 'source-over';
    cut(G, x, y, R);
    G.blasts.push({x, y, R, t: 0, dur: 0.3 + R * 0.02});
    dust(G, x, y, R, css(col, 0.9)); dust(G, x, y, 3, '#ffd23c');
    for (const t of G.tanks) if (!t.dead) {
      const d = Math.hypot(t.x - x, t.y - 2 - y);
      if (d < R + 5) hurt(G, t, dmg * (1 - d / (R + 5)));
    }
  }
  function hurt(G, t, n) { t.hp -= n; if (t.hp <= 0 && !t.dead) { t.dead = true; t.hp = 0; G.pend.push({x: t.x, y: t.y - 1, R: 13, dmg: 35, t: 0.3}); } }
  function hitTank(G, s) { for (const t of G.tanks) if (!t.dead && Math.abs(s.x - t.x - 0.5) <= 4.5 && s.y >= t.y - 4 && s.y <= t.y + 1 && (t !== s.by || s.age > 0.25)) return t; return null; }
  /** Move one shell for dt, in steps of a cell at most so nothing is skipped. Returns false when it is spent. */
  function fly(G, s, dt) {
    const sp = s.dig ? 45 : Math.hypot(s.vx, s.vy), n = Math.max(1, Math.ceil(sp * dt)), h = dt / n;
    for (let i = 0; i < n; i++) {
      if (!s.dig) { s.vy += GRAV * h; s.vx += G.wind * h; }
      s.x += s.vx * h; s.y += s.vy * h; s.age += h;
      if ((s.tr += sp * h) > 4) { s.tr = 0; G.trail.push(s.x, s.y); if (G.trail.length > 120) G.trail.splice(0, 2); }
      if (s.x < -30 || s.x > G.W + 30 || s.y < -3000) { return false; }
      const tank = hitTank(G, s);
      if (s.dig) {  // the digger: bores on in a straight line, then goes off
        cut(G, s.x, s.y, 2); s.dig -= sp * h;
        if (tank || s.dig <= 0 || s.y >= G.H) { boom(G, s.x, s.y, 8, 50); return false; }
        continue;
      }
      if (s.kind === 'cluster' && s.vy > 0 && s.age > 0.3) {  // the cluster: breaks into four over the top of its arc
        for (let k = 0; k < 4; k++) G.shells.push({x: s.x, y: s.y, vx: s.vx + (k - 1.5) * 13, vy: s.vy, kind: 'mini', age: 1, by: s.by, dig: 0, tr: 0});
        return false;
      }
      if (tank || solid(G, s.x, s.y)) {
        if (s.kind === 'digger' && !tank && s.y < G.H) { const v = Math.hypot(s.vx, s.vy) || 1; s.vx *= 45 / v; s.vy *= 45 / v; s.dig = 30; dust(G, s.x, s.y, 4, css(colourAt(G, s.x | 0, s.y | 0))); return true; }
        if (s.kind === 'big') boom(G, s.x, s.y, 16, 80); else if (s.kind === 'mini') boom(G, s.x, s.y, 6, 30); else boom(G, s.x, s.y, 9, 55);
        return false;
      }
    }
    return true;
  }
  function update(G, dt) {
    let still = true;
    for (const t of G.tanks) if (!t.dead) {  // a tank with nothing under its middle falls, and a long fall hurts
      let held = false; for (let dx = -2; dx <= 2; dx++) if (solid(G, t.x + dx, t.y + 1)) { held = true; break; }
      if (held) { if (t.fell > 6 && !t.fresh) hurt(G, t, (t.fell - 6) * 2); t.fell = 0; t.vy = 0; t.fy = 0; t.fresh = false; continue; }
      still = false; t.vy += 110 * dt; t.fy += t.vy * dt;
      while (t.fy >= 1) { t.fy--; let h2 = false; for (let dx = -2; dx <= 2; dx++) if (solid(G, t.x + dx, t.y + 1)) h2 = true; if (h2) { t.fy = 0; break; } t.y++; t.fell++; }
    }
    for (let i = G.pend.length - 1; i >= 0; i--) { const p = G.pend[i]; if ((p.t -= dt) <= 0) { G.pend.splice(i, 1); boom(G, p.x, p.y, p.R, p.dmg); } }
    for (let i = G.blasts.length - 1; i >= 0; i--) if ((G.blasts[i].t += dt) >= G.blasts[i].dur) G.blasts.splice(i, 1);
    for (let i = G.parts.length - 1; i >= 0; i--) { const p = G.parts[i]; p.vy += GRAV * 1.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if ((p.life -= dt) <= 0 || (p.vy > 0 && solid(G, p.x, p.y))) G.parts.splice(i, 1); }
    const t = G.tanks[G.turn];
    if (G.phase === 'settle') {
      if (still && !G.blasts.length && !G.pend.length && (G.pt -= dt) <= 0) {
        const a = alive(G);
        if (a.length <= 1) { G.win = a[0] || null; G.phase = 'win'; G.pt = 4; } else next(G);
      }
    } else if (G.phase === 'aim') {
      const d = t.ga - t.a, step = 1.8 * dt;
      if (Math.abs(d) <= step) { t.a = t.ga; G.phase = 'charge'; } else t.a += d < 0 ? -step : step;
    } else if (G.phase === 'charge') {
      if ((G.pow += 0.9 * dt) >= t.gp) { G.pow = t.gp; fire(G, t); G.phase = 'fly'; }
    } else if (G.phase === 'fly') {
      for (let i = G.shells.length - 1; i >= 0; i--) if (!fly(G, G.shells[i], dt)) G.shells.splice(i, 1);
      if (!G.shells.length) { G.phase = 'settle'; G.pt = 0.5; }
    } else if ((G.pt -= dt) <= 0) round(G);  // the banner has been up long enough: fresh ground, new tanks
  }

  // ---------- drawing ----------
  function paint(g, G, ctx, t) {
    const S = G.S, px = (x, y, w, h) => g.fillRect(Math.round(x) * S, Math.round(y) * S, w * S, h * S);
    g.fillStyle = 'rgba(6,8,24,.62)'; g.fillRect(0, 0, ctx.w, ctx.h);  // dusk over the backdrop so the bright pixels carry
    g.imageSmoothingEnabled = false; g.drawImage(G.cv, 0, 0, G.W * S, G.H * S);
    const now = G.tanks[G.turn];
    for (const k of G.tanks) if (!k.dead) {
      const x = k.x, y = k.y;
      g.fillStyle = '#e8ecff'; for (let i = 1; i <= 6; i++) px(x + Math.cos(k.a) * i, y - 4 - Math.sin(k.a) * i, 1, 1);
      g.fillStyle = css(k.col); px(x - 4, y - 1, 9, 1); px(x - 4, y - 2, 9, 1); px(x - 2, y - 3, 5, 1); px(x - 1, y - 4, 3, 1);
      g.fillStyle = css(k.col, 1.4); px(x - 4, y - 2, 9, 1); px(x - 1, y - 4, 2, 1);
      g.fillStyle = '#10121e'; px(x - 4, y, 9, 1); g.fillStyle = css(k.col, 0.55); px(x - 3, y, 1, 1); px(x - 1, y, 1, 1); px(x + 1, y, 1, 1); px(x + 3, y, 1, 1);
      const up = y < 24 ? 0 : 1;  // right under the top edge there is no room above the tank: the marks go beside it
      g.fillStyle = '#10121e'; px(x - 5, y - 10, 11, 3);
      g.fillStyle = k.hp > 50 ? '#5dff6a' : k.hp > 25 ? '#ffd23c' : '#ff4d4d'; px(x - 4, y - 9, Math.max(1, Math.round(k.hp / 100 * 9)), 1);
      if (k === now && (G.phase === 'aim' || G.phase === 'charge')) {
        const mx = up ? x : x + 12, my = up ? y - 15 : y - 4;
        if (t * 3 % 1 < 0.6) { g.fillStyle = css(k.col); px(mx - 2, my, 5, 1); px(mx - 1, my + 1, 3, 1); px(mx, my + 2, 1, 1); }  // whose turn it is
        if (G.phase === 'charge') { g.fillStyle = '#10121e'; px(mx - 6, my - 4 + (up ? 0 : 8), 13, 3); g.fillStyle = '#ffffff'; px(mx - 5, my - 3 + (up ? 0 : 8), Math.max(1, Math.round(G.pow * 11)), 1); }
      }
    }
    g.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < G.trail.length; i += 2) px(G.trail[i], G.trail[i + 1], 1, 1);
    for (const s of G.shells) {
      const big = s.kind === 'big' ? 3 : 2;
      g.fillStyle = s.kind === 'shell' ? '#ffffff' : s.kind === 'digger' ? '#5dff6a' : s.kind === 'big' ? '#ff9a2e' : '#ffd23c';
      if (s.y < 0) { px(s.x - 2, 3, 5, 1); px(s.x - 1, 2, 3, 1); px(s.x, 1, 1, 1); }  // above the screen: a mark on the top edge follows it
      else px(s.x - 1, s.y - 1, big, big);
    }
    for (const p of G.parts) { g.fillStyle = p.col; px(p.x, p.y, 1, 1); }
    for (const b of G.blasts) {
      const k = b.t / b.dur, r = b.R * (0.45 + 0.75 * k);
      const disc = (rr, c) => { g.fillStyle = c; for (let dy = -rr; dy < rr; dy += 2) { const half = Math.round(Math.sqrt(rr * rr - (dy + 1) * (dy + 1)) / 2) * 2; if (half > 0) px(b.x - half, b.y + dy, half * 2, 2); } };
      g.globalAlpha = k > 0.75 ? 0.6 : 1;
      disc(Math.round(r), '#ff5a1e'); if (k < 0.8) disc(Math.round(r * 0.68), '#ffd23c'); if (k < 0.5) disc(Math.round(r * 0.36), '#ffffff');
      g.globalAlpha = 1;
    }
    // the wind: an arrow at the top, longer when it blows harder
    const cx = G.W / 2 | 0, len = Math.round(Math.abs(G.wind) * 2.2) + 2, dir = G.wind < 0 ? -1 : 1, tip = cx + dir * len;
    g.fillStyle = '#10121e'; px(cx - 22, 3, 45, 9); g.fillStyle = '#cfe6ff'; px(Math.min(cx, tip), 7, len + 1, 1); px(tip - dir, 6, 1, 3); px(tip - dir * 2, 5, 1, 5);
    if (G.phase === 'win') {
      const s = G.win ? G.win.name + ' WINS' : 'NO ONE LEFT', c = G.win ? css(G.win.col) : '#cfe6ff', p = 6, w = (s.length * 4 - 1) * p, x = Math.round((ctx.w - w) / 2), y = Math.round(ctx.h * 0.4);
      g.fillStyle = c; g.fillRect(x - 30, y - 30, w + 60, 5 * p + 60); g.fillStyle = '#10121e'; g.fillRect(x - 24, y - 24, w + 48, 5 * p + 48);
      g.fillStyle = c; text(g, s, x, y, p);
    }
  }

  const wake = st => { if (!st.game) st.at = Date.now() + idleMs(st); };  // any finger puts the battle off again
  HP.fx.add('tanks', {
    label: 'Tank battle',
    live: true, fps: 12,
    options: [{key: 'idle', label: 'Starts after', type: 'select', choices: [[1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes']], default: 5},
      {key: 'tanks', label: 'Tanks', type: 'range', min: 2, max: 6, step: 1, default: 3}],
    create(ctx) {
      restore();  // a new layout: whatever we hid comes back, and we start waiting from scratch
      const st = {ctx, game: null, at: 0, end: 0};
      st.at = ctx.opts.now ? Date.now() + 1000 : Date.now() + idleMs(st);  // "now" is for the Studio's preview and the test page
      cur = st;
      return st;
    },
    draw(g, st, ctx, t, dt) {
      if (Date.now() < st.at) return;  // idle: nothing drawn, nothing touched
      try {
        if (!st.game) begin(st);
        if (Date.now() > st.end) { end(st); return; }
        update(st.game, dt);
        paint(g, st.game, ctx, t);
      } catch (e) {
        end(st); try { g.clearRect(0, 0, ctx.w, ctx.h); } catch (e2) { /* the canvas itself is what failed */ }
        console.error('tanks: ' + (e && e.message));
      }
    },
    tap(st) { if (st.game) { end(st); return true; } wake(st); },
    touch: wake, drag: wake, press: wake,
  });
  /** Start a battle on the next frame, without waiting for the idle time. */
  HP.fx.tanksNow = () => { if (cur && !cur.game) cur.at = 0; };
})();
