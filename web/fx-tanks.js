'use strict';
// Tank battle: a screensaver. When the panel has been left alone for a while, the tiles turn into a pixel landscape
// and a few little tanks drop onto it and shell each other, blowing real holes in the tiles. One tap ends it.
// The weapons are a table of data (DEF) run by one small physics step (advance): to add one, add a row.
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
  const GRAV = 60, VMAX = 200, MAXMS = 600000, CAP = 120;  // cells per second squared; a full power bar in cells per second
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
  /** What is at this cell: 0 air, 1 ground, 2 ice, 3 tar, 4 rubber. The screen's bottom edge is a floor. */
  function solid(G, x, y) { x = Math.floor(x); y = Math.floor(y); if (y >= G.H) return 1; if (x < 0 || x >= G.W || y < 0) return 0; return G.mask[y * G.W + x]; }
  function colourAt(G, x, y) { for (const t of G.tiles) if (x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1) return t.col; return HILL; }

  // ---------- changing the ground ----------
  /** Note that the ground whose lowest cell is (x, y) may have lost its footing. */
  function hang(G, x, y) { if (x >= 0 && x < G.W && y >= 0 && y < G.H - 1 && G.mask[y * G.W + x] && !G.mask[(y + 1) * G.W + x] && G.loose.length < 2400) G.loose.push(x, y); }
  /** Loose ground falls: each column of ground left hanging over a hole drops a few rows a frame until it rests.
   *  The picture's column is copied down onto itself, so it never has to be read back. */
  function settle(G) {
    const L = G.loose, W = G.W, m = G.mask, n = Math.min(L.length, 44);
    for (let i = 0; i < n; i += 2) {
      const x = L.shift(), y = L.shift();
      if (!m[y * W + x]) continue;
      let k = 0; while (k < 6 && y + k + 1 < G.H && !m[(y + k + 1) * W + x]) k++;
      if (!k) continue;
      let ys = y; while (ys > 0 && m[(ys - 1) * W + x]) ys--;
      for (let yy = y; yy >= ys; yy--) m[(yy + k) * W + x] = m[yy * W + x];
      for (let yy = ys; yy < ys + k; yy++) m[yy * W + x] = 0;
      G.tg.drawImage(G.cv, x, ys, 1, y - ys + 1, x, ys + k, 1, y - ys + 1); G.tg.clearRect(x, ys, 1, k);
      for (const t of G.tanks) if (!t.dead && Math.abs(t.x - x) <= 4 && y + k >= t.y - 4 && y <= t.y) hurt(G, t, 1, true);  // what comes down on a tank hurts it
      L.push(x, y + k);
    }
  }
  /** Blow a hole, round or flattened (ry): the same rows cleared in the mask and in the picture. What was resting on
   *  the removed ground is left to fall, unless hold is set (a bored tunnel keeps its roof). */
  function cut(G, cx, cy, R, ry, hold) {
    cx = Math.round(cx); cy = Math.round(cy); ry = ry || R;
    for (let dy = -ry; dy <= ry; dy++) {
      const y = cy + dy; if (y < 0 || y >= G.H) continue;
      const half = R / ry * Math.sqrt(ry * ry - dy * dy + ry * 0.8) | 0, a = Math.max(0, cx - half), b = Math.min(G.W - 1, cx + half);
      if (b >= a) { G.mask.fill(0, y * G.W + a, y * G.W + b + 1); G.tg.clearRect(a, y, b - a + 1, 1); }
    }
    if (!hold) for (let x = cx - R; x <= cx + R; x++) for (let y = Math.min(cy, G.H - 1); y >= cy - ry - 2; y--) if (solid(G, x, y)) { hang(G, x, y); break; }
  }
  /** A blast big enough shakes everything near it loose: every overhang in its area falls, tunnels and channels too. */
  function shake(G, cx, cy, R) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let x = Math.max(0, cx - R - 4); x <= Math.min(G.W - 1, cx + R + 4); x++) for (let y = Math.max(0, cy - R - 12); y <= Math.min(G.H - 2, cy + R + 4); y++) hang(G, x, y);
  }
  function cutBox(G, x0, y0, x1, y1, hold) {
    x0 = Math.max(0, Math.round(x0)); x1 = Math.min(G.W - 1, Math.round(x1)); y0 = Math.max(0, Math.round(y0)); y1 = Math.min(G.H - 1, Math.round(y1));
    if (x1 < x0 || y1 < y0) return;
    for (let y = y0; y <= y1; y++) G.mask.fill(0, y * G.W + x0, y * G.W + x1 + 1);
    G.tg.clearRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    if (!hold) for (let x = x0; x <= x1; x++) hang(G, x, y0 - 1);
  }
  /** New ground in a row of cells, only where there is air: kind 1 dirt, 4 rubber. */
  function addRow(G, y, a, b, kind, col) {
    a = Math.max(0, a); b = Math.min(G.W - 1, b); if (y < 0 || y >= G.H || b < a) return;
    for (let x = a; x <= b; x++) if (!G.mask[y * G.W + x]) G.mask[y * G.W + x] = kind;
    const tg = G.tg; tg.globalCompositeOperation = 'destination-over'; tg.fillStyle = col; tg.fillRect(a, y, b - a + 1, 1); tg.globalCompositeOperation = 'source-over';
  }
  function addBox(G, x0, y0, x1, y1, kind, c) {
    x0 = Math.round(x0); x1 = Math.round(x1); y0 = Math.round(y0); y1 = Math.round(y1);
    for (let y = y0; y <= y1; y++) addRow(G, y, x0, x1, kind, css(c, y === y0 ? 1.3 : 0.85 + (y * 7 % 5) * 0.06));
    for (let x = x0; x <= x1; x++) hang(G, x, y1);
  }
  function addDisc(G, cx, cy, R, c) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let dy = -R; dy <= R; dy++) { const half = Math.sqrt(R * R - dy * dy + R * 0.8) | 0; addRow(G, cy + dy, cx - half, cx + half, 1, css(c, 0.85 + ((cy + dy) * 7 % 5) * 0.06)); }
    for (let x = cx - R; x <= cx + R; x++) { const b = cy + (Math.sqrt(R * R - (x - cx) * (x - cx)) | 0); hang(G, x, b); hang(G, x, b - 1); }
  }
  /** Turn the ground inside a disc into ice (2) or tar (3): same ground, different surface. */
  function coat(G, cx, cy, R, kind, tint) {
    cx = Math.round(cx); cy = Math.round(cy);
    const tg = G.tg, m = G.mask; tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = tint;
    for (let dy = -R; dy <= R; dy++) {
      const y = cy + dy; if (y < 0 || y >= G.H) continue;
      const half = Math.sqrt(R * R - dy * dy) | 0, a = Math.max(0, cx - half), b = Math.min(G.W - 1, cx + half);
      for (let x = a; x <= b; x++) if (m[y * G.W + x]) m[y * G.W + x] = kind;
      if (b >= a) tg.fillRect(a, y, b - a + 1, 1);
    }
    tg.globalCompositeOperation = 'source-over';
  }

  // ---------- the arsenal ----------
  // Every weapon is a row of data. A row with wt (how often it is picked) is a weapon; one without is something a
  // weapon turns into (a bomblet, a rock). What a projectile does in flight comes from its numbers; what it does
  // when it goes off is its "hit" list, each entry the name of an effect below and its arguments.
  //   col, sz, shape   its look: colour, size in cells, 'dot' | 'diamond' | 'ring' | 'bar' | 'cross'
  //   trail            'dot' (default) | 'line' | 'smoke' | 'spark' | 'none'
  //   g, wind, drag    gravity and wind as multiples of the world's (default 1), air drag per second (default 0)
  //   v, els           launch speed as a multiple of the power bar; the elevations the gunner may choose from
  //   bounce, nb       how much speed survives a bounce, and how many bounces before it goes off; hop: skips like a stone
  //   roll             lands and rolls along the ground, faster downhill, until it stops, drops into a pit or meets a tank
  //   fuse             goes off after this many seconds whatever happens;  apex: goes off at the top of its arc
  //   prox             goes off this many cells above ground on the way down
  //   home, late, wob  steers toward the nearest enemy (late: only on the way down), wobbling as it goes
  //   chute            opens a parachute at the top of its arc;  float: seconds it rises under a balloon first
  //   bore             [way, cells, radius]: on reaching ground it tunnels ('fwd', 'down' or 'side') before going off
  //   inst             no projectile at all: 'laser', 'rise', 'shield', 'riot';  once: a tank may use it once a round
  //   flat             worth trying from under a roof;  tool: never picked by chance, the gunner reaches for it when it must;  n: the effect's own numbers
  //   reach            how far its tunnelling warheads go on after it lands (for the gunner's aim);  tracer: a ranging shot
  // The list and the sizes relative to each other follow the classic artillery game: blast radius there times 0.6 here.
  const DEF = {
    baby:     {wt: 7, col: '#ffffff', sz: 1, hit: [['boom', 6, 35]]},
    missile:  {wt: 6, col: '#ffffff', sz: 2, hit: [['boom', 12, 60]]},
    nukeS:    {wt: 3, col: '#b6ff3c', sz: 3, shape: 'ring', hit: [['nuke', 24, 100]]},
    nuke:     {wt: 2, col: '#b6ff3c', sz: 4, hit: [['nuke', 45, 140]]},
    // three blasts one after another, each bigger, hopping forward
    leap:     {wt: 3, col: '#5dff6a', sz: 2, shape: 'diamond', hit: [['boom', 12, 50], ['frog', 'leap2']]},
    leap2:    {col: '#5dff6a', sz: 2, shape: 'diamond', hit: [['boom', 15, 55], ['frog', 'leap3']]},
    leap3:    {col: '#5dff6a', sz: 2, shape: 'diamond', hit: [['boom', 18, 60]]},
    // a chain of blasts in every colour, scattered round where it came down
    funky:    {wt: 3, col: '#ff6ad5', sz: 3, shape: 'cross', hit: [['scatter', 'funk', 8, 60]]},
    funk:     {col: '#ff6ad5', sz: 2, trail: 'none', hit: [['cboom', 10, 35]]},
    // splits at the top of its arc; one that meets something on the way up is a dud
    mirv:     {wt: 3, col: '#ff9a2e', sz: 3, shape: 'diamond', apex: 1, hit: [['split', 'warhead', 5, 18, 0]]},
    warhead:  {col: '#ff9a2e', sz: 2, hit: [['boom', 12, 55]]},
    mirv9:    {wt: 2, col: '#ff4d4d', sz: 4, shape: 'diamond', apex: 1, hit: [['split', 'bighead', 9, 16, 0]]},
    bighead:  {col: '#ff4d4d', sz: 3, hit: [['boom', 21, 75]]},
    napalm:   {wt: 3, col: '#ff5a1e', sz: 2, trail: 'spark', hit: [['boom', 3, 10], ['fire', 34, 1, 60]]},
    napalmH:  {wt: 2, col: '#ffd23c', sz: 3, trail: 'spark', hit: [['boom', 4, 12], ['fire', 55, 2, 95]]},
    tracer:   {wt: 1, col: '#ffffff', sz: 1, trail: 'line', tracer: 1, hit: [['mark']]},
    smoke:    {wt: 1, col: '#ff6ad5', sz: 1, trail: 'smoke', tracer: 1, hit: [['mark']]},
    roll1:    {wt: 2, col: '#b6ff3c', sz: 1, roll: 1, flat: 1, hit: [['boom', 6, 35]]},
    roll2:    {wt: 2, col: '#b6ff3c', sz: 2, shape: 'ring', roll: 1, flat: 1, hit: [['boom', 12, 60]]},
    roll3:    {wt: 1.5, col: '#b6ff3c', sz: 4, roll: 1, flat: 1, hit: [['boom', 27, 95]]},
    // a cone of ground gone in front of the barrel, only so far: n is [range, half angle]
    riot1:    {wt: 1, tool: 1, col: '#ffffff', sz: 2, shape: 'cross', inst: 'riot', n: [22, 0.35]},
    riot2:    {wt: 1, tool: 1, col: '#ffffff', sz: 3, shape: 'diamond', inst: 'riot', n: [36, 0.5]},
    riotB:    {wt: 2, col: '#ffffff', sz: 2, shape: 'ring', hit: [['clear', 18]]},
    riotH:    {wt: 1.5, col: '#ffffff', sz: 3, shape: 'ring', hit: [['clear', 27]]},
    // tunnels on along the way it was flying, harming nothing
    dig1:     {wt: 1.5, col: '#5dff6a', sz: 1, bore: ['fwd', 30, 1], hit: []},
    dig2:     {wt: 1.5, col: '#5dff6a', sz: 2, bore: ['fwd', 45, 2], hit: []},
    dig3:     {wt: 1, col: '#5dff6a', sz: 3, bore: ['fwd', 65, 3], hit: []},
    // lands and sends several tunnelling warheads fanning on, each with a charge at its end
    hog1:     {wt: 2, col: '#ffd23c', sz: 2, shape: 'bar', reach: 25, hit: [['hogs', 'hogw', 2, 0.4]]},
    hog2:     {wt: 2, col: '#ffd23c', sz: 3, shape: 'bar', reach: 30, hit: [['hogs', 'hogw', 4, 0.3]]},
    hog3:     {wt: 1, col: '#ffd23c', sz: 4, shape: 'bar', reach: 45, hit: [['hogs', 'hogW', 6, 0.25]]},
    hogw:     {col: '#ffd23c', sz: 1, bore: ['fwd', 30, 1], hit: [['boom', 6, 35]]},
    hogW:     {col: '#ffd23c', sz: 2, bore: ['fwd', 48, 2], hit: [['boom', 10, 50]]},
    clod:     {wt: 1, col: '#c08a52', sz: 2, hit: [['dirt', 8]]},
    ball:     {wt: 1, col: '#c08a52', sz: 3, hit: [['dirt', 14]]},
    ton:      {wt: 1, col: '#c08a52', sz: 4, hit: [['dirt', 26]]},
    slurry:   {wt: 1, col: '#c08a52', sz: 2, shape: 'ring', hit: [['mud', 110]]},
    dirtfan:  {wt: 0.7, col: '#c08a52', sz: 2, shape: 'cross', inst: 'dirtfan'},
    lump:     {col: '#c08a52', sz: 2, trail: 'none', hit: [['dirt', 4]]},
    // everything left hanging near it comes down
    quake:    {wt: 1.5, col: '#a98bff', sz: 2, shape: 'cross', hit: [['quake', 34]]},
    plasma:   {wt: 1, tool: 1, col: '#3fe0ff', sz: 3, shape: 'ring', inst: 'plasma'},
    laser:    {wt: 2.5, col: '#ff4d4d', sz: 2, shape: 'bar', inst: 'laser', n: [1, 400, 45, 0]},
    shield:   {wt: 1, col: '#3fe0ff', sz: 2, shape: 'ring', inst: 'shield', once: 1},
    rock:     {col: '#ff9a2e', sz: 2, trail: 'spark', hit: [['boom', 7, 30]]},
  };
  const PICK = Object.keys(DEF).filter(n => DEF[n].wt), DIRT = [176, 122, 69];
  Object.keys(DEF).forEach(n => { DEF[n].name = n; });

  function alive(G) { return G.tanks.filter(t => !t.dead); }
  function nearest(G, p) { let best = null, bd = 1e9; for (const t of G.tanks) if (!t.dead && t !== p.by) { const d = Math.abs(t.x - p.x) + Math.abs(t.y - p.y); if (d < bd) { bd = d; best = t; } } return best; }
  function hitTank(G, p) { for (const t of G.tanks) if (!t.dead && Math.abs(p.x - t.x - 0.5) <= 4.5 && p.y >= t.y - 4 && p.y <= t.y + 1 && (t !== p.by || p.free || p.age > 0.25)) return t; return null; }
  function shot(d, x, y, vx, vy, by, free) { return {d, x, y, vx, vy, by, free, age: 0, nb: 0, rub: 0, tr: 0, ph: Math.random() * 6.28, roll: 0, rv: 0, acc: 0, rt: 0, bore: 0, bored: 0, dug: 0, open: 0, tank: null, col: null}; }
  function launch(t, d, a, v) { v *= d.v || 1; return shot(d, t.x + 0.5 + Math.cos(a) * 6, t.y - 4 - Math.sin(a) * 6, Math.cos(a) * v, -Math.sin(a) * v, t, false); }

  /** The one physics step every projectile takes, real or imagined by a gunner taking aim (sim): forces, then
   *  what it ran into. It changes only the projectile. Returns 0 carry on, 1 it goes off here, 2 it left the
   *  world, 3 it skipped off the ground. */
  function advance(G, p, h, sim) {
    const d = p.d;
    if (p.roll) return rolling(G, p, h);
    let g = d.g == null ? 1 : d.g, wind = d.wind == null ? 1 : d.wind, drag = d.drag || 0;
    if (d.chute && p.vy > 0) p.open = 1;
    if (p.open) { g = 0.4; drag = 1.2; wind = 4; }
    if (d.float && p.age < d.float) { g = -0.5; drag = 0.8; wind = 3; }
    let ax = G.wind * wind, ay = GRAV * g;
    if (d.home && (!d.late || p.vy > 0)) {
      const q = nearest(G, p);
      if (q) {
        const dx = q.x - p.x, dy = q.y - 2 - p.y, l = Math.hypot(dx, dy) || 1; ax += dx / l * d.home; ay += dy / l * d.home;
        if (d.wob) { const s = Math.sin(p.age * 9 + p.ph) * d.wob; ax -= dy / l * s; ay += dx / l * s; }
      }
    }
    p.vx += (ax - p.vx * drag) * h; p.vy += (ay - p.vy * drag) * h;
    const ox = p.x, oy = p.y; p.x += p.vx * h; p.y += p.vy * h; p.age += h;
    if (p.x < -40 || p.x > G.W + 40 || p.y < -4000 || p.age > 20) return 2;
    if (d.fuse && p.age >= d.fuse) return 1;
    if (!sim && d.apex && p.vy > 0 && p.age > 0.25) return 1;  // a gunner aims a splitting round as if it stayed whole
    if (d.prox && p.vy > 0 && solid(G, p.x, p.y + d.prox)) return 1;
    const tank = hitTank(G, p); if (tank) { p.tank = tank; return 1; }
    const m = solid(G, p.x, p.y);
    if (!m) return 0;
    const rubber = m === 4 && p.rub < 6;  // rubber throws anything back
    if (m !== 3 && (rubber || p.nb < (d.nb || 0)) && !solid(G, ox, oy)) {
      const e = rubber ? 0.9 : d.bounce;
      if (rubber) p.rub++; else p.nb++;
      if (d.hop && !rubber) { p.vy = -Math.abs(p.vy) * e - 14; p.vx *= 0.88; }
      else {
        // which way the ground faces here: away from the solid cells around the point of contact
        let nx = 0, ny = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (solid(G, p.x + dx, p.y + dy)) { nx -= dx; ny -= dy; }
        const l = Math.hypot(nx, ny); if (l < 0.01) { nx = 0; ny = -1; } else { nx /= l; ny /= l; }
        const dot = p.vx * nx + p.vy * ny;
        if (dot < 0) { p.vx = (p.vx - (1 + e) * dot * nx) * 0.94; p.vy = (p.vy - (1 + e) * dot * ny) * 0.94; }
      }
      p.x = ox; p.y = oy;
      return d.hop && !rubber ? 3 : 0;
    }
    if (d.roll && m !== 3 && !solid(G, ox, oy)) { p.roll = 1; p.x = Math.floor(ox); p.y = Math.floor(oy); p.rv = U.clamp(p.vx, -70, 70); if (Math.abs(p.rv) < 12) p.rv = p.vx < 0 ? -12 : 12; return 0; }
    return 1;
  }
  /** A roller follows the surface a cell at a time: it gains speed going down, loses it going up, turns back at a wall. */
  function rolling(G, p, h) {
    if ((p.rt += h) > 5) return 1;
    p.age += h; p.acc += Math.abs(p.rv) * h;
    while (p.acc >= 1) {
      p.acc--;
      const dir = p.rv < 0 ? -1 : 1, nx = p.x + dir; let y = p.y;
      if (nx < 1 || nx > G.W - 2) return 1;
      if (solid(G, nx, y)) {
        if (!solid(G, nx, y - 1)) { y--; p.rv -= dir * 5; } else if (!solid(G, nx, y - 2)) { y -= 2; p.rv -= dir * 10; } else { p.rv = -p.rv * 0.5; continue; }
      } else {
        let drop = 0; while (drop < 30 && !solid(G, nx, y + 1)) { y++; drop++; }
        if (drop > 6) { p.x = nx; p.y = y; return 1; }  // it fell into a pit
        p.rv += dir * drop * 5;
      }
      p.x = nx; p.y = y; p.rv *= 0.97;
      if (solid(G, nx, y + 1) === 3) return 1;  // tar holds it
      const tank = hitTank(G, p); if (tank) { p.tank = tank; return 1; }
    }
    return Math.abs(p.rv) < 4 ? 1 : 0;
  }

  // ---------- particles and passing sights ----------
  // kinds: 0 dirt and sparks (fall, vanish in the ground), 1 fire (flows downhill, burns), 2 smoke (drifts), 3 firework (floats down),
  //        4 liquid dirt (flows to the lowest place it can reach and sets there as ground)
  function part(G, k, x, y, vx, vy, life, col) {
    const P = G.parts, q = {k, x, y, vx, vy, life, col, d: vx < 0 ? -1 : 1, air: 1, tar: 0, h: 1, sp: 8};
    if (P.length < CAP) P.push(q);
    else if (k === 1 || k === 4) for (let i = 0; i < P.length; i++) if (P[i].k !== 1 && P[i].k !== 4) { P[i] = q; break; }  // fire and mud matter: they push out a speck of dust
    return q;
  }
  function dust(G, x, y, n, col) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = 15 + Math.random() * 45; part(G, 0, x, y, Math.cos(a) * v, Math.sin(a) * v - 30, 0.5 + Math.random() * 0.7, col); } }
  function later(G, t, f) { G.pend.push({t, f}); }
  function hurt(G, t, n, slow) {
    if (t.dead) return;
    if (t.shield && !slow) { t.shield = 0; G.fx.push({k: 'pop', x: t.x, y: t.y - 2, t: 0.3, T: 0.3}); return; }  // the bubble takes one hit and bursts
    if (!slow && G.firer && G.firer !== t) t.foe = G.firer;  // it remembers who did that
    t.hp -= n;
    if (t.hp <= 0) { t.dead = true; t.hp = 0; later(G, 0.3, () => boom(G, t.x, t.y - 1, 13, 35)); }
  }
  /** A round hole from a blast. Ground only comes down when the blast lands on top of it: a hole made from the side
   *  or from below leaves its roof hanging, so a tank can be undermined. A hit on top then brings down whatever
   *  thin crust is left over a hollow underneath, and a big one shakes loose everything near. */
  function crater(G, x, y, R) {
    const top = !solid(G, x, y - 2);
    cut(G, x, y, R, R, !top);
    if (!top) return;
    if (R >= 16) shake(G, x, y, R);
    x = Math.round(x); y = Math.round(y);
    for (let c = x - R; c <= x + R; c++) {
      let yy = y + (Math.sqrt(R * R - (c - x) * (c - x)) | 0) + 1, n = 0;
      if (!solid(G, c, yy)) continue;
      while (n < 14 && solid(G, c, yy + 1)) { yy++; n++; }
      if (n < 14) hang(G, c, yy);
    }
  }
  function boom(G, x, y, R, dmg, style, cols) {
    const tg = G.tg, col = colourAt(G, x | 0, y | 0);
    // scorch what will be the crater's rim, then cut
    tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = 'rgba(0,0,0,.4)'; tg.beginPath(); tg.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, R + 2.5, 0, 6.3); tg.fill(); tg.globalCompositeOperation = 'source-over';
    crater(G, x, y, R);
    G.blasts.push({x, y, R, ry: R, t: 0, dur: 0.3 + R * 0.02, s: style || 'fire', c: cols});
    dust(G, x, y, Math.min(R, 12), css(col, 0.9)); dust(G, x, y, 3, '#ffd23c');
    for (const t of G.tanks) if (!t.dead) { const d = Math.hypot(t.x - x, t.y - 2 - y); if (d < R + 5) hurt(G, t, dmg * (1 - d / (R + 5))); }
  }

  // ---------- what a weapon does when it goes off: f(G, x, y, projectile, ...the row's arguments) ----------
  const FX = {
    boom(G, x, y, p, R, dmg) { boom(G, x, y, R, dmg); },
    /** Break into n of another row, fanned out sideways and tossed up a little. */
    split(G, x, y, p, name, n, spread, up) {
      for (let i = 0; i < n; i++) G.shells.push(shot(DEF[name], x, y, p.vx + (i - (n - 1) / 2) * spread * (0.8 + Math.random() * 0.4), p.vy - up * (0.5 + Math.random()), p.by, true));
    },
    /** The next warhead of a chain hops on the way the last one was going. */
    frog(G, x, y, p, name) { G.shells.push(shot(DEF[name], x, y - 3, (p.vx < 0 ? -1 : 1) * 30, -50, p.by, true)); },
    /** n tunnelling warheads fan on through the ground from where it landed. */
    hogs(G, x, y, p, name, n, fan) {
      const a0 = Math.atan2(p.vy, p.vx), d = DEF[name];
      for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * fan, q = shot(d, x, y, Math.cos(a) * 50, Math.sin(a) * 50, p.by, true); q.bored = 1; q.bore = d.bore[1] * (0.7 + Math.random() * 0.6); G.shells.push(q); }
      dust(G, x, y, 6, d.col);
    },
    /** A mound of fresh dirt: it buries whatever is there. */
    dirt(G, x, y, p, R) { addDisc(G, x, y - R * 0.4, R, DIRT); G.blasts.push({x, y, R: R * 0.8, ry: R * 0.8, t: 0, dur: 0.25, s: 'dirt'}); dust(G, x, y - R, 8, css(DIRT)); },
    /** Liquid fire: thrown out as drops that run downhill, pool and burn. */
    fire(G, x, y, p, n, heat, wide) { for (let i = 0; i < n; i++) part(G, 1, x, y - 2, (Math.random() - 0.5) * wide, -10 - Math.random() * 35, 3 + Math.random() * 1.5, '').h = heat; },
    /** The big one: a white flash, a huge fireball that takes its time, a very large crater, sparks of fallout, and a
     *  cloud that climbs and leans with the wind. Whoever fired it had better be far away. */
    nuke(G, x, y, p, R, dmg) {
      boom(G, x, y, R, dmg); G.blasts[G.blasts.length - 1].dur = 1.5;
      G.fx.push({k: 'flash', t: 0.16, T: 0.16}, {k: 'cloud', x, y, y0: y, R: R * 0.45, t: 4.5, T: 4.5});
      for (let i = 0; i < 26; i++) { const a = -Math.random() * 3.14, v = 40 + Math.random() * 70; part(G, 3, x, y, Math.cos(a) * v, Math.sin(a) * v, 1.5 + Math.random() * 1.5, i % 2 ? '#b6ff3c' : '#ffd23c'); }
    },
    /** Bursts into n of another row, each its own bright colour, thrown every which way. */
    scatter(G, x, y, p, name, n, speed) {
      cut(G, x, y, 3, 3, true);
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = speed * (0.5 + Math.random()), q = shot(DEF[name], x, y - 1, Math.cos(a) * v, -Math.abs(Math.sin(a)) * v - 20, p.by, true); q.col = css(TANKS[i % 6][1]); G.shells.push(q); }
    },
    /** A blast in the projectile's own colour. */
    cboom(G, x, y, p, R, dmg) { boom(G, x, y, R, dmg, 'fire', [p.col || p.d.col, '#ffffff', '#ffffff']); },
    /** Liquid dirt, poured out in waves: it runs to the lowest ground it can find and fills it level. */
    mud(G, x, y, p, n) { for (let w = 0; w < 6; w++) later(G, w * 0.25, () => { for (let i = 0; i < n / 6; i++) part(G, 4, x + Math.random() * 6 - 3, y - 3, (Math.random() - 0.5) * 40, -10 - Math.random() * 20, 8, css(DIRT)); }); },
    /** A big round bite out of the ground and nothing else: no heat, no harm. */
    clear(G, x, y, p, R) { crater(G, x, y, R); G.fx.push({k: 'pop', x, y, t: 0.4, T: 0.4, R}); dust(G, x, y, 10, '#ffffff'); },
    /** Everything left hanging within reach comes down. */
    quake(G, x, y, p, R) { shake(G, x, y, R); G.fx.push({k: 'pop', x, y, t: 0.5, T: 0.5, R}); dust(G, x, y, 12, '#a98bff'); },
    /** Only shows where it came down. */
    mark(G, x, y) { G.fx.push({k: 'mark', x, y, t: 0.9, T: 0.9}); },
  };
  /** The weapons that are not thrown at all. */
  const INST = {
    /** A straight beam, at once: it burns a channel through the ground, tiles and all, and anything in its way.
     *  n: [half width, cells of ground it can burn, damage, recoil]. */
    laser(G, t) {
      const n = t.w.n, cx = Math.cos(t.a), cy = -Math.sin(t.a), x0 = t.x + 0.5 + cx * 7, y0 = t.y - 4 + cy * 7, seen = [];
      let x = x0, y = y0, burn = n[1];
      for (let i = 0; i < 500; i++) {
        x += cx; y += cy; if (x < 0 || x >= G.W || y < 0 || y >= G.H) break;
        if (solid(G, x, y)) { if (burn-- <= 0) break; cut(G, x, y, n[0], n[0], true); }
        for (const o of G.tanks) if (!o.dead && o !== t && seen.indexOf(o) < 0 && Math.abs(x - o.x - 0.5) <= 4.5 && y >= o.y - 4 && y <= o.y + 1) { seen.push(o); hurt(G, o, n[2]); }
      }
      G.fx.push({k: 'ray', x: x0, y: y0, x2: x, y2: y, w: n[0], c: t.w.col, t: 0.4, T: 0.4}); dust(G, x, y, 6, t.w.col);
      if (n[3]) t.vx = (cx < 0 ? 1 : -1) * n[3];
    },
    /** A cone of ground gone, the way the barrel points and only so far. What is above it stays up. n: [range, half angle]. */
    riot(G, t) {
      const R = t.w.n[0], half = t.w.n[1], cx = Math.cos(t.a), cy = -Math.sin(t.a), x0 = t.x + 0.5, y0 = t.y - 4, k = Math.tan(half);
      cutBox(G, t.x - 5, t.y - 5, t.x + 5, t.y, true);
      for (let s = 2; s <= R; s += 2) { const w = Math.max(2, Math.round(2 + s * k)); cut(G, x0 + cx * s, y0 + cy * s, w, w, true); }
      G.fx.push({k: 'wedge', x: x0, y: y0, a: t.a, half, R, t: 0.4, T: 0.4}); dust(G, x0 + cx * R * 0.5, y0 + cy * R * 0.5, 10, '#ffffff');
    },
    /** A fan of dirt lumps thrown the way the barrel points. */
    dirtfan(G, t) { for (let i = 0; i < 7; i++) G.shells.push(launch(t, DEF.lump, t.a + (i - 3) * 0.12, 70 + Math.random() * 40)); },
    /** A burst of energy all round the gunner, a different size every time: it harms every other tank it reaches. */
    plasma(G, t) {
      const R = 8 + (G.rng() * 30 | 0), x = t.x, y = t.y - 2;
      G.blasts.push({x, y, R, ry: R, t: 0, dur: 0.6, s: 'ice'});
      for (const o of G.tanks) if (!o.dead && o !== t) { const d = Math.hypot(o.x - x, o.y - 2 - y); if (d < R + 5) hurt(G, o, 70 * (1 - d / (R + 5))); }
    },
    /** A bubble round the gunner that soaks up the next hit. */
    shield(G, t) { t.shield = 1; G.fx.push({k: 'pop', x: t.x, y: t.y - 2, t: 0.3, T: 0.3, R: 9}); },
  };

  // ---------- a battle ----------
  /** Hide the tiles, build their destructible copy, start round one. */
  function begin(st) {
    const ctx = st.ctx, S = ctx.w > 1400 ? 4 : 3, W = Math.ceil(ctx.w / S), H = Math.ceil(ctx.h / S);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const G = {S, W, H, cv, tg: cv.getContext('2d'), mask: new Uint8Array(W * H), tiles: [], seed: ctx.seed, round: 0, opts: ctx.opts, shots: 0, n: U.clamp(Math.round(+ctx.opts.tanks || 3), 2, 6)};
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
    G.loose = []; terrain(G);
    G.tanks = []; G.shells = []; G.blasts = []; G.parts = []; G.pend = []; G.trail = []; G.fx = [];
    G.wind = (G.rng() * 2 - 1) * 8; G.turn = -1; G.phase = 'settle'; G.pt = 0.6; G.pow = 0; G.win = null; G.age = 0;
    const r = G.rng, W = G.W, H = G.H, order = TANKS.slice().sort(() => r() - 0.5);
    // every place a tank could stand, on any level: tile tops under open sky, tile tops inside the channels between
    // rows of tiles, the hills. Sorted into levels so the tanks are spread over them.
    const levels = {};
    for (let x = 8; x < W - 8; x += 3) for (let y = 8; y < H; y++) if (solid(G, x, y) && !solid(G, x, y - 1)) {
      let free = true; for (let dy = 1; dy <= 6 && free; dy++) for (let dx = -4; dx <= 4; dx++) if (solid(G, x + dx, y - dy)) { free = false; break; }
      if (free) (levels[y / 14 | 0] = levels[y / 14 | 0] || []).push(x, y);
    }
    const keys = Object.keys(levels).sort(() => r() - 0.5);
    for (let i = 0; i < G.n; i++) {
      let x = 0, y = 0, ok = false;
      for (let k = 0; k < 60 && keys.length && !ok; k++) {
        const L = levels[keys[(i + (k / 12 | 0)) % keys.length]], j = (r() * L.length / 2 | 0) * 2;
        x = L[j]; y = L[j + 1];
        ok = !G.tanks.some(t => Math.abs(t.x - x) < 22 && Math.abs(t.y - y) < 40);
      }
      if (ok) { let up = 0; while (up < 30 && y - 7 - up > 2 && !solid(G, x, y - 7 - up)) up++; y = y - 1 - up; }  // it drops in from as high as there is room
      else { x = 12 + r() * (W - 24) | 0; y = 12 + r() * (H * 0.5) | 0; cut(G, x, y, 8, 8, true); }  // a dashboard with no open top anywhere: blast a pocket to land in
      // the hull is drawn once, here, and stamped every frame
      const col = order[i][1], spr = document.createElement('canvas'); spr.width = 9; spr.height = 5;
      const sg = spr.getContext('2d'); sg.fillStyle = css(col); sg.fillRect(0, 3, 9, 1); sg.fillRect(2, 1, 5, 1); sg.fillRect(3, 0, 3, 1); sg.fillStyle = css(col, 1.4); sg.fillRect(0, 2, 9, 1); sg.fillRect(3, 0, 2, 1);
      sg.fillStyle = '#10121e'; sg.fillRect(0, 4, 9, 1); sg.fillStyle = css(col, 0.55); for (let k = 1; k < 9; k += 2) sg.fillRect(k, 4, 1, 1);
      G.tanks.push({x, y, hp: 100, name: order[i][0], col, spr, w: DEF.baby, a: Math.PI / 2, ga: 0, gp: 0, fy: 0, vy: 0, vx: 0, sx: 0, fell: 0, slip: 40, fresh: true, dead: false, shield: 0, seen: {}, used: {}, foe: null});
    }
  }
  /** Which weapon this shot: any of the whole list, by its weight. The gunner swaps it when the place calls for a tool. */
  function choose(G, t) {
    const f = G.opts.w, r = G.rng;
    if (f != null && f !== '') { const d = DEF[f] || DEF[PICK[+f]]; if (d) return d; }  // the test page's "every shot is this one"
    const pool = PICK.filter(n => !DEF[n].tool && !t.used[n]);
    let sum = 0; for (const n of pool) sum += DEF[n].wt;
    let at = r() * sum, j = 0; while (j < pool.length - 1 && (at -= DEF[pool[j]].wt) > 0) j++;
    const d = DEF[pool[j]]; if (d.once) t.used[d.name] = 1;
    return d;
  }
  /** Where this weapon's projectile would end up, fired at this angle and power, and how far that is from the target.
   *  It runs the very same step the real projectile will. The end point is left in G.ex, G.ey. */
  function trace(G, t, d, a, v, who) {
    const p = launch(t, d, a, v);
    let e = 0;
    for (let i = 0; i < 1400; i++) { e = advance(G, p, 1 / Math.max(40, Math.abs(p.vx) + Math.abs(p.vy), Math.abs(p.rv)), true); if (e === 1 || e === 2) break; }
    if (e === 1 && (d.bore || d.reach) && !p.tank) {  // a burrower goes on from where it meets the ground
      const way = d.bore ? d.bore[0] : 'fwd', n = d.bore ? d.bore[1] : d.reach, l = Math.hypot(p.vx, p.vy) || 1;
      if (way === 'fwd') { p.x += p.vx / l * n; p.y += p.vy / l * n; } else if (way === 'side') p.x += p.vx < 0 ? -n : n; else p.y += way === 'up' ? -n : n;
    }
    G.ex = p.x; G.ey = p.y;
    return p.tank === who ? 0 : Math.hypot(p.x - who.x, p.y - who.y);
  }
  /** The best this weapon can do against this target from here: tries the elevations roughly, then closer around the best. */
  function range(G, t, d, who, dir, els) {
    const k0 = G.rng() * els.length | 0, a = {score: 1e9, el: els[0], v: 100, ex: t.x, ey: t.y};
    const tryIt = (e, p) => { const q = trace(G, t, d, dir > 0 ? e : Math.PI - e, p, who); if (q < a.score) { a.score = q; a.el = e; a.v = p; a.ex = G.ex; a.ey = G.ey; } };
    for (let k = 0; k < els.length; k++) for (let p = 30; p <= VMAX; p += 10) tryIt(els[(k + k0) % els.length], p);
    for (let p = Math.max(25, a.v - 7), top = Math.min(VMAX, a.v + 8), e = a.el; p <= top; p += 3) tryIt(e, p);
    return a;
  }
  /** How far a weapon's blast reaches, its children's included. */
  function blastR(d) {
    let R = 0;
    for (const h of d.hit || []) { const k = h[0]; if (k === 'boom' || k === 'nuke' || k === 'cboom' || k === 'burst') R = Math.max(R, h[1]); else if (k === 'split' || k === 'scatter') R = Math.max(R, blastR(DEF[h[1]])); }
    return R;
  }
  /** How many cells of air a tank has over its head: 99 for open sky. */
  function roof(G, t) { for (let n = 0; n < 60; n++) { if (t.y - 5 - n < 0) return 99; if (solid(G, t.x, t.y - 5 - n)) return n; } return 99; }
  /** Dirt on top of it, or dirt right through it: not merely standing in a dip. */
  function buried(G, t) { return !!(solid(G, t.x, t.y - 2) || (solid(G, t.x, t.y - 5) && (solid(G, t.x - 3, t.y - 3) || solid(G, t.x + 3, t.y - 3)))); }
  /** The gunner. Every turn it picks who to shoot at afresh (leaning toward the weak, the near and whoever hit it
   *  last) and a weapon from the whole list, then finds the shot that would land closest, the way a person finds the
   *  range: off by a fair bit on its first try at a target and by less each time after. Under dirt it first blows
   *  the dirt off. When the shot cannot get there, it goes through the ground instead: a beam straight at the
   *  target, a cone of ground cleared toward it, or something that tunnels. It mostly will not fire something whose
   *  blast would take it in as well. Mostly. */
  function plan(G, t) {
    const r = G.rng, foes = alive(G).filter(o => o !== t), forced = G.opts.w != null && G.opts.w !== '';
    let who = foes[0], best = -1;
    for (const f of foes) { const s = r() * 2 + (100 - f.hp) / 60 + (f === t.foe ? 1 : 0) + (Math.hypot(f.x - t.x, f.y - t.y) < 90 ? 0.5 : 0); if (s > best) { best = s; who = f; } }
    const seen = t.seen[who.name] || 0; t.seen[who.name] = seen + 1;
    let dir = who.x < t.x ? -1 : 1; const off = [0.2, 0.08, 0.03, 0.012][Math.min(3, seen)] * (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5);
    const boxed = roof(G, t) < 45, low = [0.2, 0.5, 0.9, 1.3], high = [1, 1.2, 1.42], under = buried(G, t);
    let toward = Math.atan2(t.y - who.y, who.x - t.x), up = toward < 0.2 && toward > -1.5708 ? 0.2 : toward < 0.2 || toward > 2.94 ? 2.94 : toward;  // at the target; "up" never points below level
    const again = t.w && t.w.inst === 'riot', dig = () => DEF[['dig1', 'dig2', 'dig3', 'hog1', 'hog2', 'hog3'][r() * 6 | 0]];
    const point = (d, a) => { t.w = d; t.ga = a < 0 ? a + 6.2832 : a; t.gp = 0.5; };
    let d = choose(G, t);
    if (!forced) {
      if (under && !again) d = DEF[r() < 0.6 ? 'riot1' : 'riot2'];
      else if (r() < 0.5 && foes.some(f => Math.hypot(f.x - t.x, f.y - t.y) < 36)) d = DEF.plasma;  // someone is right here
    }
    if (d.inst) return point(d, d.inst === 'laser' ? toward + off * 0.6 : d.inst === 'riot' ? up : d.inst === 'dirtfan' ? up : t.a);
    const els = d.els || (boxed ? low.concat(high) : high);
    let a = range(G, t, d, who, dir, els);
    if (!forced && a.score > 30 && foes.length > 1) {  // out of reach: is someone else in reach?
      let o = null; for (const f of foes) if (f !== who && (!o || Math.abs(f.x - t.x) + Math.abs(f.y - t.y) < Math.abs(o.x - t.x) + Math.abs(o.y - t.y))) o = f;
      const od = o.x < t.x ? -1 : 1, b = range(G, t, d, o, od, els);
      if (b.score < a.score) { a = b; who = o; dir = od; toward = Math.atan2(t.y - who.y, who.x - t.x); up = toward < 0.2 && toward > -1.5708 ? 0.2 : toward < 0.2 || toward > 2.94 ? 2.94 : toward; }
    }
    // a shot that falls short is still fired; one that cannot even leave where the tank sits goes through the ground instead
    if (!forced && a.score > 30 && Math.hypot(a.ex - t.x, a.ey - t.y) < 32) {
      const k = r();
      if (k < 0.2) return point(DEF.laser, toward + off * 0.6);
      if (k < 0.55 && !again) return point(DEF[r() < 0.5 ? 'riot1' : 'riot2'], up);
      d = dig();
      a = range(G, t, d, who, dir, low.concat(high));
    }
    const R = blastR(d), close = Math.hypot(a.ex - t.x, a.ey - t.y + 2) < R + 5;
    if (!forced && close && r() > (boxed ? 0.33 : 0.17)) {  // that blast would reach the gunner itself: think again (it does not always)
      if (boxed && !again) return point(DEF.riot1, up);
      if (boxed) { d = dig(); a = range(G, t, d, who, dir, low.concat(high)); }
      else {
      const b = range(G, t, DEF.baby, who, dir, high); if (Math.hypot(b.ex - t.x, b.ey - t.y + 2) >= 11) { d = DEF.baby; a = b; } }
    }
    t.w = d;
    if (d.tracer) t.seen[who.name] = 3;  // a ranging shot: the next one, fired for real, is close
    t.ga = dir > 0 ? a.el : Math.PI - a.el; t.gp = U.clamp(a.v * (1 + off), 25, VMAX) / VMAX;
  }
  function next(G) {
    const n = G.tanks.length;
    for (let i = 1; i <= n; i++) { const k = (G.turn + i) % n; if (!G.tanks[k].dead) { if (k <= G.turn) G.wind = (G.rng() * 2 - 1) * 8; G.turn = k; break; } }  // new wind every time round
    for (const t of G.tanks) t.slip = 40;
    plan(G, G.tanks[G.turn]); G.phase = 'aim'; G.pow = 0;
    if (G.age > 200) {  // a round that will not end: rocks come down on someone every turn, from just under whatever roof it has
      const a = alive(G), v = a[G.rng() * a.length | 0], over = roof(G, v);
      for (let i = 0; i < 2; i++) later(G, i * 0.35, () => G.shells.push(shot(DEF.rock, v.x + (Math.random() - 0.5) * 6, over > 60 ? -6 : v.y - 4 - over, 0, 80, null, true)));
    }
  }
  function fire(G, t) {
    G.trail = []; G.shots++; G.firer = t;
    if (t.w.inst) INST[t.w.inst](G, t); else G.shells.push(launch(t, t.w, t.a, t.gp * VMAX));
  }
  function go(G, p) { for (const f of p.d.hit) FX[f[0]](G, p.x, p.y, p, f[1], f[2], f[3], f[4]); }
  /** Move one projectile for dt, in steps of a cell at most so nothing is skipped. Returns false when it is spent. */
  function fly(G, p, dt) {
    const d = p.d, sp = p.bore > 0 ? 50 : p.roll ? Math.abs(p.rv) : Math.hypot(p.vx, p.vy), n = U.clamp(Math.ceil(sp * dt), 1, 60), h = dt / n, tr = d.trail || 'dot';
    for (let i = 0; i < n; i++) {
      if (p.bore > 0) {  // boring through the ground in a straight line, until its length is used up or it comes out into the air
        p.x += p.vx * h; p.y += p.vy * h; p.bore -= 50 * h; p.dug += 50 * h;
        if (d.bore[2]) cut(G, p.x, p.y, d.bore[2], d.bore[2], true); else cutBox(G, p.x, p.y, p.x, p.y + 1, true);
        if ((p.tr += 50 * h) > 3) { p.tr = 0; part(G, 0, p.x, p.y, -p.vx * 0.3 + (Math.random() - 0.5) * 20, -p.vy * 0.3 - 10, 0.4, css(colourAt(G, p.x | 0, p.y | 0), 1.2)); }
        const out = p.dug > 8 && !solid(G, p.x + p.vx * 0.06, p.y + p.vy * 0.06) && !solid(G, p.x + p.vx * 0.1, p.y + p.vy * 0.1);
        if (p.bore <= 0 || out || hitTank(G, p) || p.x < 2 || p.x > G.W - 3 || p.y > G.H - 3 || p.y < 2) { go(G, p); return false; }
        continue;
      }
      const e = advance(G, p, h, false);
      if (e === 2) return false;
      if (e === 3) { boom(G, p.x, p.y + 1, 3, 12); continue; }  // each skip bites the ground
      if (e === 1) {
        if (d.bore && !p.bored && !p.tank && solid(G, p.x, p.y) && p.y < G.H - 3) {
          const v = Math.hypot(p.vx, p.vy) || 1, way = d.bore[0];
          p.bored = 1; p.bore = d.bore[1]; p.vx = way === 'fwd' ? p.vx * 50 / v : way === 'side' ? (p.vx < 0 ? -50 : 50) : 0; p.vy = way === 'fwd' ? p.vy * 50 / v : way === 'down' ? 50 : way === 'up' ? -50 : 0;
          dust(G, p.x, p.y, 4, css(colourAt(G, p.x | 0, p.y | 0))); continue;
        }
        if (d.apex && p.vy < 0 && !p.tank) { dust(G, p.x, p.y, 6, d.col); return false; }  // it met something on the way up: a dud
        go(G, p); return false;
      }
      if (tr !== 'none' && (p.tr += sp * h) > (tr === 'line' ? 1.5 : tr === 'dot' ? 2.5 : 6)) {
        p.tr = 0;
        if (tr === 'smoke') part(G, 2, p.x, p.y, (Math.random() - 0.5) * 8, d.tracer ? 0 : -4, d.tracer ? 5 : 0.6, d.tracer ? d.col : '#9aa3b8');
        else if (tr === 'spark') part(G, 0, p.x, p.y, (Math.random() - 0.5) * 10, 0, 0.35, '#ffd23c');
        else { G.trail.push(p.x, p.y, tr === 'line' ? 1 : 0); if (G.trail.length > 180) G.trail.splice(0, 3); }
      }
    }
    return true;
  }
  /** What is under a tank's middle: 0 nothing, else the kind of ground. */
  function under(G, x, y) { for (let dx = -2; dx <= 2; dx++) { const m = solid(G, x + dx, y + 1); if (m) return m; } return 0; }
  function depth(G, x, y) { let n = 0; while (n < 8 && !solid(G, x, y + 1 + n)) n++; return n; }
  function update(G, dt) {
    let still = true, fires = 0;
    G.age += dt;
    for (const t of G.tanks) if (!t.dead) {
      const m = under(G, t.x, t.y);
      if (m) {
        if (t.fell > 6 && !t.fresh && m !== 4) hurt(G, t, (t.fell - 6) * 2);  // a long fall hurts, unless it ends on rubber
        t.fell = 0; t.vy = 0; t.fy = 0; t.fresh = false;
        if (m === 3) t.vx = 0;  // stuck in tar
        else if (!t.vx && t.slip > 0) {  // one end hanging well below the other: it slides that way, far sooner on ice; only so far in one turn, so two tanks never wait on a seesaw
          const dl = depth(G, t.x - 4, t.y), dr = depth(G, t.x + 4, t.y), lim = m === 2 ? 2 : 5;
          if (dl - dr >= lim) t.vx = -14; else if (dr - dl >= lim) t.vx = 14;
        }
      } else {  // nothing under its middle: it falls
        still = false; t.vy += 110 * dt; t.fy += t.vy * dt;
        while (t.fy >= 1) { t.fy--; if (under(G, t.x, t.y)) { t.fy = 0; break; } t.y++; t.fell++; }
      }
      if (t.vx) {
        still = false; t.sx += t.vx * dt;
        while (Math.abs(t.sx) >= 1) {
          const dir = t.sx < 0 ? -1 : 1, nx = t.x + dir; let y = t.y, up = 0; t.sx -= dir;
          const stuck = () => { for (let dx = -2; dx <= 2; dx++) if (solid(G, nx + dx, y)) return true; return false; };
          while (up < 3 && stuck()) { y--; up++; }
          if (nx < 5 || nx > G.W - 6 || y < 6 || stuck()) { t.vx = 0; t.sx = 0; t.slip = 0; break; }  // a wall, or the screen's edge
          t.x = nx; t.y = y; t.slip--;
        }
        t.vx *= !m ? 0.97 : m === 2 ? 0.98 : 0.8; if (Math.abs(t.vx) < 3) t.vx = 0;
      }
    }
    for (let i = G.pend.length - 1; i >= 0; i--) { const p = G.pend[i]; if ((p.t -= dt) <= 0) { G.pend.splice(i, 1); p.f(); } }
    settle(G);
    for (let i = G.blasts.length - 1; i >= 0; i--) if ((G.blasts[i].t += dt) >= G.blasts[i].dur) G.blasts.splice(i, 1);
    for (let i = G.fx.length - 1; i >= 0; i--) { const f = G.fx[i]; if (f.k === 'cloud') { f.y -= 13 * dt; f.x += G.wind * 0.7 * dt; } if ((f.t -= dt) <= 0) G.fx.splice(i, 1); }
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const p = G.parts[i]; p.life -= dt;
      if (p.k === 1) {
        fires++;
        if (p.air) {  // still in the air
          p.vy += GRAV * dt; const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
          if (solid(G, nx, ny) || ny >= G.H - 1) { p.air = 0; p.x = Math.floor(p.x); p.y = Math.floor(p.y); if (solid(G, p.x, p.y)) p.life = 0; } else { p.x = nx; p.y = ny; }
        } else for (let k = 0; k < 3; k++) {  // on the ground: down if it can, else diagonally down, else it stays and burns
          const x = p.x, y = p.y, d = p.d;
          if (!solid(G, x, y + 1)) p.y++;
          else if (solid(G, x, y + 1) === 3 && !p.tar) { p.tar = 1; p.life += 3; break; }  // tar burns long
          else if (!solid(G, x + d, y) && !solid(G, x + d, y + 1)) { p.x += d; p.y++; }
          else if (!solid(G, x - d, y) && !solid(G, x - d, y + 1)) { p.x -= d; p.y++; p.d = -d; }
          else break;
        }
        if (p.x < 0 || p.x >= G.W) p.life = 0;
        for (const t of G.tanks) if (!t.dead && Math.abs(p.x - t.x) <= 5 && Math.abs(p.y - t.y + 2) <= 5) hurt(G, t, 0.45 * p.h * dt, true);
        if (p.life <= 0 && !p.air && p.y + 1 < G.H && solid(G, p.x, p.y + 1)) cutBox(G, p.x, p.y + 1, p.x, p.y + 1, true);  // it burns away the bit it sat on
      } else if (p.k === 4) {
        fires++;
        if (p.air) {
          p.vy += GRAV * dt; const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
          if (solid(G, nx, ny) || ny >= G.H - 1) { p.air = 0; p.x = Math.floor(p.x); p.y = Math.floor(p.y); } else { p.x = nx; p.y = ny; }
        } else for (let k = 0; k < 4 && p.life > 0; k++) {  // down, else diagonally down, else along the flat for a while, else it sets
          const x = p.x, y = p.y, d = p.d;
          if (!solid(G, x, y + 1)) p.y++;
          else if (!solid(G, x + d, y) && !solid(G, x + d, y + 1)) { p.x += d; p.y++; }
          else if (!solid(G, x - d, y) && !solid(G, x - d, y + 1)) { p.x -= d; p.y++; p.d = -d; }
          else if (!solid(G, x + d, y) && p.sp-- > 0) p.x += d;
          else p.life = 0;
        }
        if (p.x < 1 || p.x >= G.W - 1) p.life = 0;
        if (p.life <= 0 && !p.air) addBox(G, p.x - 1, p.y - 1, p.x + 1, p.y, 1, DIRT);
      } else if (p.k === 2) { p.x += p.vx * dt; p.y += p.vy * dt; }
      else if (p.k === 3) { p.vy += GRAV * 0.35 * dt; p.vx *= 0.9; p.vy *= 0.9; p.x += p.vx * dt; p.y += p.vy * dt; }
      else { p.vy += GRAV * 1.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.vy > 0 && solid(G, p.x, p.y)) p.life = 0; }
      if (p.life <= 0) G.parts.splice(i, 1);
    }
    for (let i = G.shells.length - 1; i >= 0; i--) if (!fly(G, G.shells[i], dt)) G.shells.splice(i, 1);
    const t = G.tanks[G.turn];
    if (G.phase === 'settle') {
      if (still && !G.shells.length && !G.blasts.length && !G.pend.length && !G.loose.length && !G.fx.length && !fires && (G.pt -= dt) <= 0) {
        const a = alive(G);
        if (a.length <= 1) { G.win = a[0] || null; G.phase = 'win'; G.pt = 4; } else next(G);
      }
    } else if (G.phase === 'aim') {
      const d = t.ga - t.a, step = 1.8 * dt;
      if (Math.abs(d) <= step) { t.a = t.ga; G.phase = 'charge'; } else t.a += d < 0 ? -step : step;
    } else if (G.phase === 'charge') {
      if ((G.pow += 0.9 * dt) >= t.gp) { G.pow = t.gp; fire(G, t); G.phase = 'fly'; }
    } else if (G.phase === 'fly') {
      if (!G.shells.length) { G.phase = 'settle'; G.pt = 0.5; }
    } else if ((G.pt -= dt) <= 0) round(G);  // the banner has been up long enough: fresh ground, new tanks
  }

  // ---------- drawing ----------
  const BLAST = {fire: ['#ff5a1e', '#ffd23c', '#ffffff'], flat: ['#ffd23c', '#ffffff', '#ffffff'], ice: ['#3fe0ff', '#cfe6ff', '#ffffff'], dirt: ['#7a5230', '#c08a52', '#c08a52'], in: ['#a98bff', '#3a2c50', '#10121e']};
  const TRAILS = ['rgba(255,255,255,.55)', '#ff9a9a'];
  function paint(g, G, ctx, t) {
    const S = G.S, px = (x, y, w, h) => g.fillRect(Math.round(x) * S, Math.round(y) * S, w * S, h * S);
    /** A projectile's own little shape; also used as the weapon's icon by the power bar. */
    const sprite = (d, x, y, wide, col) => {
      const z = d.sz || 2, sh = d.shape || 'dot'; g.fillStyle = col || d.col;
      if (sh === 'dot') px(x - (z >> 1), y - (z >> 1), z, z);
      else if (sh === 'diamond') { px(x - z, y, z * 2 + 1, 1); px(x, y - z, 1, z * 2 + 1); if (z > 1) px(x - 1, y - 1, 3, 3); }
      else if (sh === 'ring') { px(x - 1, y - 2, 3, 1); px(x - 1, y + 2, 3, 1); px(x - 2, y - 1, 1, 3); px(x + 2, y - 1, 1, 3); }
      else if (sh === 'bar') { if (wide) px(x - 2, y, 5, z > 1 ? 2 : 1); else px(x, y - 2, z > 1 ? 2 : 1, 5); }
      else { px(x, y, 1, 1); px(x - 1, y - 1, 1, 1); px(x + 1, y - 1, 1, 1); px(x - 1, y + 1, 1, 1); px(x + 1, y + 1, 1, 1); if (z > 1) { px(x - 2, y - 2, 1, 1); px(x + 2, y + 2, 1, 1); px(x + 2, y - 2, 1, 1); px(x - 2, y + 2, 1, 1); } }
    };
    const disc = (x, y, rx, ry, c) => { if (rx < 1 || ry < 1) return; const q = rx > 26 ? 4 : 2; g.fillStyle = c; for (let dy = -ry; dy < ry; dy += q) { const half = Math.round(rx / ry * Math.sqrt(Math.max(0, ry * ry - (dy + q / 2) * (dy + q / 2))) / q) * q; if (half > 0) px(x - half, y + dy, half * 2, q); } };  // a very big one is drawn in bigger blocks
    const ring = (x, y, r, c) => { g.fillStyle = c; const n = U.clamp(r * 1.2 | 0, 8, 28); for (let i = 0; i < n; i++) { const a = i / n * 6.283; px(x + Math.cos(a) * r, y + Math.sin(a) * r, 2, 2); } };
    g.fillStyle = 'rgba(6,8,24,.62)'; g.fillRect(0, 0, ctx.w, ctx.h);  // dusk over the backdrop so the bright pixels carry
    g.imageSmoothingEnabled = false; g.drawImage(G.cv, 0, 0, G.W * S, G.H * S);
    const now = G.tanks[G.turn];
    for (const k of G.tanks) if (!k.dead) {
      const x = k.x, y = k.y;
      g.fillStyle = '#e8ecff'; for (let i = 1; i <= 6; i++) px(x + Math.cos(k.a) * i, y - 4 - Math.sin(k.a) * i, 1, 1);
      g.drawImage(k.spr, (x - 4) * S, (y - 4) * S, 9 * S, 5 * S);
      if (k.shield) ring(x, y - 2, 8, t * 4 % 1 < 0.5 ? '#3fe0ff' : '#cfe6ff');
      const up = y < 24 ? 0 : 1;  // right under the top edge there is no room above the tank: the marks go beside it
      g.fillStyle = '#10121e'; px(x - 5, y - 10, 11, 3);
      g.fillStyle = k.hp > 50 ? '#5dff6a' : k.hp > 25 ? '#ffd23c' : '#ff4d4d'; px(x - 4, y - 9, Math.max(1, Math.round(k.hp / 100 * 9)), 1);
      if (k === now && (G.phase === 'aim' || G.phase === 'charge')) {
        const mx = up ? x : x + 12, my = up ? y - 15 : y - 4, by = my - 4 + (up ? 0 : 8);
        if (t * 3 % 1 < 0.6) { g.fillStyle = css(k.col); px(mx - 2, my, 5, 1); px(mx - 1, my + 1, 3, 1); px(mx, my + 2, 1, 1); }  // whose turn it is
        g.fillStyle = '#10121e'; px(mx - 6, by, 13, 3); px(mx + 8, by - 2, 7, 7);
        if (G.phase === 'charge') { g.fillStyle = '#ffffff'; px(mx - 5, by + 1, Math.max(1, Math.round(G.pow * 11)), 1); }
        sprite(k.w, mx + 11, by + 1, true);  // what it is about to fire
      }
    }
    for (let i = 0; i < G.trail.length; i += 3) { g.fillStyle = TRAILS[G.trail[i + 2]]; px(G.trail[i], G.trail[i + 1], 1, 1); }
    for (const p of G.shells) {
      const d = p.d;
      if (p.y < 0) { g.fillStyle = d.col; px(p.x - 2, 3, 5, 1); px(p.x - 1, 2, 3, 1); px(p.x, 1, 1, 1); continue; }  // above the screen: a mark on the top edge follows it
      sprite(d, p.x, p.y, Math.abs(p.vx) > Math.abs(p.vy), p.col);
      if (p.open) { g.fillStyle = '#ffffff'; px(p.x - 3, p.y - 7, 7, 1); px(p.x - 4, p.y - 6, 9, 2); g.fillStyle = '#9aa3b8'; px(p.x - 4, p.y - 4, 1, 2); px(p.x + 4, p.y - 4, 1, 2); }  // its parachute
      else if (d.float && p.age < d.float) { g.fillStyle = '#ff6ad5'; px(p.x - 2, p.y - 9, 5, 5); px(p.x - 1, p.y - 10, 3, 7); g.fillStyle = '#ffffff'; px(p.x - 1, p.y - 8, 1, 1); px(p.x, p.y - 3, 1, 2); }  // its balloon
    }
    for (const p of G.parts) {
      if (p.k === 1) { const f = Math.random() * (p.h > 1 ? 5 : 3) | 0; g.fillStyle = f ? (p.h > 1 ? '#ffd23c' : '#ff5a1e') : (p.h > 1 ? '#ffffff' : '#ffd23c'); px(p.x, p.y - f, 1, f + 1); }  // a flame licks up and down; the hotter kind burns taller and paler
      else if (p.k === 4) { g.fillStyle = p.col; px(p.x - 1, p.y - 1, 3, 2); }
      else { g.fillStyle = p.col; px(p.x, p.y, p.k === 2 ? 2 : 1, p.k === 2 ? 2 : 1); }
    }
    for (const b of G.blasts) {
      const k = b.t / b.dur, c = b.c || BLAST[b.s], grow = b.s === 'in' ? 1.1 - k : 0.45 + 0.75 * k, rx = Math.round(b.R * grow), ry = Math.round(b.ry * grow);
      g.globalAlpha = k > 0.75 ? 0.6 : 1;
      if (b.s === 'in') { ring(b.x, b.y, rx, c[0]); disc(b.x, b.y, Math.round(b.R * 0.5 * k), Math.round(b.R * 0.5 * k), c[1]); }
      else { disc(b.x, b.y, rx, ry, c[0]); if (k < 0.8) disc(b.x, b.y, Math.round(rx * 0.68), Math.round(ry * 0.68), c[1]); if (k < 0.5) disc(b.x, b.y, Math.round(rx * 0.36), Math.round(ry * 0.36), c[2]); }
      g.globalAlpha = 1;
    }
    for (const f of G.fx) {
      const k = 1 - f.t / f.T;
      if (f.k === 'flash') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, ctx.w, ctx.h); }
      else if (f.k === 'cloud') {  // a stalk and a cap in a few big blocks: hot at first, then smoke
        const s = Math.round(f.R * (0.6 + 0.4 * Math.min(1, k * 3))), hot = k < 0.3;
        g.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1;
        g.fillStyle = hot ? '#ff9a2e' : '#6b7286'; px(f.x - s * 0.22, f.y, Math.max(2, Math.round(s * 0.44)), Math.max(1, Math.round(f.y0 - f.y)));
        g.fillStyle = hot ? '#ff5a1e' : '#6b7286'; px(f.x - s, f.y - s * 0.35, s * 2, Math.round(s * 0.55));
        g.fillStyle = hot ? '#ffd23c' : '#9aa3b8'; px(f.x - s * 0.72, f.y - s * 0.75, Math.round(s * 1.44), Math.round(s * 0.5)); px(f.x - s * 0.35, f.y - s, Math.round(s * 0.7), Math.round(s * 0.3));
        g.fillStyle = hot ? '#ffffff' : '#cfd6ee'; px(f.x - s * 0.5, f.y - s * 0.68, Math.round(s * 0.5), Math.max(1, Math.round(s * 0.14)));
        g.globalAlpha = 1;
      }
      else if (f.k === 'wedge') {  // the cone a riot charge clears: its two edges and its front, running outward
        const R = f.R * (0.3 + 0.7 * k); g.fillStyle = '#ffffff';
        for (let i = 2; i <= R; i += 2) for (const s of [-1, 1]) px(f.x + Math.cos(f.a + s * f.half) * i, f.y - Math.sin(f.a + s * f.half) * i, 1, 1);
        for (let i = -4; i <= 4; i++) px(f.x + Math.cos(f.a + i / 4 * f.half) * R, f.y - Math.sin(f.a + i / 4 * f.half) * R, 2, 2);
      }
      else if (f.k === 'pop') ring(f.x, f.y, (f.R || 9) * (0.3 + 0.7 * k), '#ffffff');
      else if (f.k === 'bolt') { for (let i = 0; i < f.pts.length; i += 2) { g.fillStyle = (i + (t * 20 | 0)) % 4 ? '#3fe0ff' : '#ffffff'; px(f.pts[i], f.pts[i + 1], 2, 2); if (i) px((f.pts[i] + f.pts[i - 2]) / 2, (f.pts[i + 1] + f.pts[i - 1]) / 2, 2, 2); } }
      else if (f.k === 'mark') { if (t * 8 % 1 < 0.5) { g.fillStyle = '#ff4d4d'; px(f.x - 3, f.y - 1, 7, 1); px(f.x, f.y - 4, 1, 7); } }
      else if (f.k === 'col') { g.globalAlpha = 1 - k * 0.7; g.fillStyle = f.c; px(f.x - f.w, f.y0, f.w * 2 + 1, Math.round(f.y - f.y0)); g.fillStyle = '#ffffff'; px(f.x - (f.w >> 1), f.y0, (f.w >> 1) * 2 + 1, Math.round(f.y - f.y0)); g.globalAlpha = 1; }
      else {  // the laser: the one thing here that is a line, not blocks
        g.globalAlpha = 1 - k * 0.8; g.lineCap = 'butt';
        for (const w of [[S * (f.w * 2 + 1), f.c], [S * f.w, '#ffffff']]) { g.strokeStyle = w[1]; g.lineWidth = w[0]; g.beginPath(); g.moveTo(f.x * S, f.y * S); g.lineTo(f.x2 * S, f.y2 * S); g.stroke(); }
        g.globalAlpha = 1;
      }
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

  // ---------- what the others on the dashboard may meet (ctx.scene) ----------
  // Tanks, shells in flight and blasts, in screen pixels. Each keeps its one actor for as long as it lives, so nothing is built per frame.
  const TANK_TAGS = ['vehicle', 'threat'], SHOT_TAGS = ['threat'];
  function post(G, ctx) {
    const sc = ctx.scene, S = G.S; if (!sc || !sc.next) return;
    for (const k of G.tanks) if (!k.dead) {
      const q = k.post || (k.post = {kind: 'tank', tags: TANK_TAGS, x: 0, y: 0, h: 5 * S, dir: 1});
      q.x = (k.x + 0.5) * S; q.y = (k.y + 1) * S; q.dir = Math.cos(k.a) < 0 ? -1 : 1; sc.next.push(q);
    }
    for (const p of G.shells) { const q = p.post || (p.post = {kind: 'shell', tags: SHOT_TAGS, x: 0, y: 0, h: 2 * S, hid: false}); q.x = p.x * S; q.y = p.y * S; q.hid = p.y < 0; sc.next.push(q); }  // above the screen: out of sight
    for (const b of G.blasts) {
      if (!b.post) {
        // it has just gone off: every creature inside it is frightened, once
        const q = b.post = {kind: 'blast', tags: SHOT_TAGS, x: b.x * S, y: b.y * S, h: 2 * b.R * S};
        for (const a of sc.actors || []) if (!a.hid && a.tags && a.tags.indexOf('creature') >= 0 && Math.hypot(a.x - q.x, a.y - q.y) < b.R * S) ctx.util.act(a, 'scare', q);
      }
      sc.next.push(b.post);
    }
  }

  const wake = st => { if (!st.game) st.at = Date.now() + idleMs(st); };  // any finger puts the battle off again
  HP.fx.add('tanks', {
    events: {battle: {label: 'Battle', run: st => { if (!st.game) st.at = Date.now() + 500; }}},
    label: 'Tank battle',
    live: true, z: 1, fps: 15,
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
        post(st.game, ctx);
      } catch (e) {
        end(st); try { g.clearRect(0, 0, ctx.w, ctx.h); } catch (e2) { /* the canvas itself is what failed */ }
        console.error('tanks: ' + (e && e.message));
      }
    },
    tap(st) { if (st.game) { end(st); return true; } wake(st); },
    touch: wake, drag: wake, press: wake,
    swipe(st) { if (st.game) end(st); },  // the dashboard is sliding away: its tiles must not slide away hidden
    restore(st) { if (st.game) end(st); },  // a double tap anywhere: give the screen back
    weapons: PICK,  // for the test page and the self-check: opt w:NAME (or a number) makes every shot that weapon
  });
  /** Start a battle on the next frame, without waiting for the idle time. */
  HP.fx.tanksNow = () => { if (cur && !cur.game) cur.at = 0; };
})();
