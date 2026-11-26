'use strict';
// Little pixel-art creatures that live on the tops of the tiles: they walk along a tile's top edge, fall off its
// end and land on whatever tile top (or the bottom of the screen) is below. (The sheep, at the bottom of this file,
// are the exception: the whole screen is their field.)
//
// A creature is DATA, the way desktop-pet programs do it, and one small interpreter (go / fire / step / paint) runs
// any of them. To add a creature: write its `art` (parts and frames as strings, one letter per colour) and its
// table of `states`, then give it a kind with HP.fx.add() like the walkers below. No new engine code.
//
// A state: {
//   frames: ['walk0', 'walk1'],   names from the art; ft: seconds per frame
//   move:   'ground' (default: on a tile top, vx sprite-pixels a second) | 'air' (gravity; jump, vmax, soft) |
//           'climb' (up the tile side it bumped into, vy) | 'fly' (straight to c.tx, c.ty at speed) |
//           'free' (vx, vy, nothing in the way) | 'held' (under a finger)
//   dur:    seconds, or [from, to]; when it is over, or after one pass of the frames with once: 1, comes `next`
//   next:   where it leads; on: {event: where}. Events: edge, wall, bump (a creature in a `solid` state), screen,
//           land, crash (a long fall), top, arrive, tap, grab, drop, and the name of any spot it walks up to.
//   enter / tick / each: the name of an act to run on entering / on every new frame / on every step
//   also:   fade (per second), spin (turns a second), rot (fixed part of a turn), hide, paint (an act draws it), end
// }
// "Where" is a state name, or [[name, weight], ...] to choose by chance, or {key: where, _: where} to choose by
// the creature's key (its role for the walkers). 0 means: ignore the event.
// A choice by chance may carry a third item, [name, weight, 'trick']: the weight is then multiplied by what the
// creature's own tag(c, W, 'trick') answers.
//
// Two events come from outside: "notice" (a finger went down somewhere on the glass) and "jolt" (the screen starts
// to slide to another dashboard). A state takes part by naming where they lead; the rest carry on undisturbed.
// Creatures also tell the other kinds where they are (ctx.scene), so that, say, a stick figure can come and pet the sheep.
(() => {
  const U = HP.fx.util;

  // ---------- pixel art ----------
  // A frame is a list of [part, x, y]; a part is rows of letters, '.' is empty. Every frame is drawn once, at its
  // final size, into a hidden canvas (second row: mirrored, for facing left), with a thin dark line around it so
  // it reads on a bright backdrop as well as a dark one. Drawing a creature is then one drawImage.
  const INK = '#2a1b2e';
  function sheet(art, S) {
    const fw = art.w, fh = art.h, names = Object.keys(art.frames), cw = fw * S + 2, ch = fh * S + 2, ix = {};
    const c = document.createElement('canvas'); c.width = cw * names.length; c.height = ch * 2;
    const d = c.getContext('2d');
    names.forEach((name, i) => {
      ix[name] = i;
      const grid = []; for (let y = 0; y < fh; y++) grid.push(new Array(fw).fill('.'));
      for (const l of art.frames[name]) l[0].forEach((row, j) => { for (let k = 0; k < row.length; k++) if (row[k] !== '.' && grid[l[2] + j] && l[1] + k >= 0 && l[1] + k < fw) grid[l[2] + j][l[1] + k] = row[k]; });
      for (let flip = 0; flip < 2; flip++) for (let pass = 0; pass < 2; pass++) for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const k = grid[y][flip ? fw - 1 - x : x]; if (k === '.') continue;
        const px = i * cw + 1 + x * S, py = flip * ch + 1 + y * S;
        if (pass) { d.fillStyle = art.pal[k]; d.fillRect(px, py, S, S); } else { d.fillStyle = INK; d.fillRect(px - 1, py - 1, S + 2, S + 2); }
      }
    });
    return {c, cw, ch, ix};
  }
  /** Draw frame i with the middle of its bottom edge (the feet) at x, y. */
  function blit(g, sh, i, flip, x, y) { g.drawImage(sh.c, i * sh.cw, flip ? sh.ch : 0, sh.cw, sh.ch, Math.round(x - sh.cw / 2), Math.round(y - sh.ch + 1), sh.cw, sh.ch); }
  /** A 3 by 5 letter from five hex digits, one per row. */
  const glyph = (code, ch) => code.split('').map(d => { const n = parseInt(d, 16); return (n & 4 ? ch : '.') + (n & 2 ? ch : '.') + (n & 1 ? ch : '.'); });
  const DIGITS = ['75557', '26227', '71747', '71717', '55711', '74717', '74757', '71122', '75757', '75717'];

  // ---------- the world the creatures walk on ----------
  // Tile tops are the platforms. Tiles side by side at the same height with only a small gap count as one
  // platform, so a creature strolls along a whole row; the screen's bottom edge is the floor under everything.
  function world(ctx, S) {
    const tiles = ctx.rects.filter(r => !r.hidden && !r.flat), plats = [], of = new Map();
    for (const r of tiles.slice().sort((a, b) => a.x - b.x)) {
      const seg = {x1: r.x, x2: r.x + r.w, y: r.y, r: Math.min(r.r || 0, r.w / 2, r.h / 2), rect: r};
      let p = null;
      for (const q of plats) { const l = q.segs[q.segs.length - 1], gap = seg.x1 - l.x2; if (Math.abs(l.y - seg.y) <= 6 && gap > -4 && gap <= 22) { p = q; break; } }
      if (!p) plats.push(p = {segs: [], x1: seg.x1, x2: seg.x2, dip: 2 * S});
      p.segs.push(seg); p.x2 = seg.x2; of.set(r, p);
    }
    const floor = {segs: [{x1: -300, x2: ctx.w + 300, y: ctx.h, r: 0}], x1: -300, x2: ctx.w + 300, dip: 0};
    return {ctx, S, w: ctx.w, h: ctx.h, t: 0, tiles, tp: plats.slice(), plats: plats.concat([floor]), of, floor, list: [], parts: [], spots: []};
  }
  /** Height of the walking line at x: flat along a tile, dipping a little at its rounded corners; steps on a stair. */
  function ground(p, x) {
    if (p.stair) return p.y0 - (U.clamp(Math.floor((x - p.x0) * p.dir / p.bw), 0, Math.max(0, p.n - 1)) + 1) * p.bh;
    let s = null, best = 1e9;
    for (const q of p.segs) { const d = x < q.x1 ? q.x1 - x : x > q.x2 ? x - q.x2 : 0; if (d < best) { best = d; s = q; } }
    const dx = Math.min(x - s.x1, s.x2 - x);
    if (dx >= s.r) return s.y;
    const k = s.r - Math.max(0, dx);
    return s.y + Math.min(p.dip, s.r - Math.sqrt(Math.max(0, s.r * s.r - k * k)));
  }
  /** The tile whose side the creature would walk into on the way to nx, if any. */
  function wallAhead(c, nx, W) {
    const h = c.def.half * W.S, was = c.x + c.dir * h, lead = nx + c.dir * h;
    for (const r of W.tiles) {
      if (r.y > c.y - 8 || r.y + r.h < c.y - 2 * W.S) continue;  // its top is a step, not a wall; or it hangs overhead
      const side = c.dir > 0 ? r.x : r.x + r.w;
      if ((side - was) * c.dir >= -2 && (side - lead) * c.dir < 0) return r;
    }
    return null;
  }
  /** Is this point over the middle of a tile (where its label is)? Creatures there are left alone by taps. */
  function deep(W, x, y) { for (const r of W.tiles) { const m = Math.min(r.w, r.h) * .15; if (x > r.x + m && x < r.x + r.w - m && y > r.y + m && y < r.y + r.h - m) return true; } return false; }

  // ---------- the interpreter ----------
  function pick(t, c, W) {
    for (let n = 0; n < 4 && t && typeof t !== 'string'; n++) {
      if (Array.isArray(t)) {
        const wt = o => o[1] * (o[2] && c && c.def.tag ? c.def.tag(c, W, o[2]) : 1);
        let sum = 0; for (const o of t) sum += wt(o); let r = Math.random() * sum, got = t[0][0]; for (const o of t) { r -= wt(o); if (r < 0) { got = o[0]; break; } } t = got;
      }
      else { const k = c.def.key(c, W); t = t[k] !== undefined ? t[k] : t._; }
    }
    return typeof t === 'string' ? t : null;
  }
  function go(c, name, W) {
    const s = c.def.states[name], was = c.s; if (!s) return false;
    c.st = name; c.s = s; c.f = 0; c.ft = 0; c.time = 0; c.rot = 0;
    let d = s.dur; if (d && typeof d === 'object' && !Array.isArray(d)) { const k = c.def.key(c, W); d = d[k] !== undefined ? d[k] : d._; }
    c.dur = d == null ? Infinity : typeof d === 'number' ? d : d[0] + Math.random() * (d[1] - d[0]);
    if (!s.fade) c.alpha = 1;
    if (s.move === 'air') {
      if (s.jump) { c.vy = -s.jump * W.S / 3; c.y0 = c.y; } else if (!was || was.move !== 'air') { c.vy = 0; c.y0 = c.y; }
      c.plat = null;
    } else c.skip = null;
    if (s.move === 'climb' && s.rot) c.y -= c.def.half * W.S;  // lying against the wall: its middle, not its feet, is at c.y
    if (s.end) c.dead = true;
    if (s.enter) c.def.acts[s.enter](c, W);
    if (c.s === s && c.dur <= 0) fire(c, 'done', W);
    return true;
  }
  /** Something happened to the creature: look up where that leads from its state (or from the creature's own table). */
  function fire(c, ev, W) {
    const s = c.s, own = ev === 'done' ? s.next : s.on && s.on[ev];
    const name = pick(own !== undefined ? own : ev === 'done' ? null : c.def.on && c.def.on[ev], c, W);
    return name ? go(c, name, W) : false;
  }
  function step(c, dt, W) {
    const s = c.s, S = W.S, def = c.def, m = s.move || 'ground';
    c.time += dt; c.ft += dt;
    if (s.fade) c.alpha = U.clamp(c.alpha + s.fade * dt, 0, 1);
    if (s.spin) c.rot = c.time * s.spin * 6.2832 * c.dir;
    if (s.each) def.acts[s.each](c, W);
    if (W.m) { if (gmove(c, dt, W)) return; }
    else if (m === 'ground') {
      const p = c.plat;
      if (!p || p.dead) { c.skip = p; if (!fire(c, 'edge', W) || c.s.move !== 'air') go(c, def.fall, W); return; }
      if (s.vx) {
        const nx = c.x + c.dir * s.vx * S * dt;
        const mg = (def.edge || 0) * S + 4; if (c.dir < 0 ? nx < mg : nx > W.w - mg) { fire(c, 'screen', W); return; }  // coming to the side of the screen
        const r = wallAhead(c, nx, W); if (r) { c.wall = r; fire(c, 'wall', W); return; }
        for (const o of W.list) if (o !== c && o.s.solid && o.plat === p && (o.x - c.x) * c.dir > 0 && Math.abs(o.x - nx) < def.half * 2 * S) { fire(c, 'bump', W); return; }
        if (nx < p.x1 || nx > p.x2) { fire(c, 'edge', W); if (c.s.move === 'air') { c.skip = p; c.x = nx + c.dir * S; } return; }
        // walking onto the foot of a stair somebody built here
        for (const q of W.plats) if (q.stair && q.base === p && q.dir === c.dir && q.n > 1 && (q.x0 - c.x) * c.dir >= -4 && (q.x0 - nx) * c.dir < 0) c.plat = q;
        c.x = nx; c.y = ground(c.plat, nx);
        for (const sp of W.spots) {
          if (!sp.off && sp.plat === c.plat && Math.abs(sp.x - c.x - c.dir * sp.lead) < sp.r) { if (c.spot !== sp) { c.spot = sp; if (fire(c, sp.ev, W)) return; } }
          else if (c.spot === sp) c.spot = null;
        }
      }
    } else if (m === 'air') {
      c.vy = Math.min(s.vmax || 420, c.vy + 1100 * dt);
      const ny = c.y + c.vy * dt, mg = (def.edge || 0) * S + 4, nx = U.clamp(c.x + c.dir * (s.vx || 0) * S * dt, mg, W.w - mg);
      if (c.vy > 0) {
        let hit = null, hy = 1e9; const tol = def.half * S * .8;  // a near miss of a tile's corner still lands on it
        for (const p of W.plats) {
          if (p === c.skip || p.dead || nx < p.x1 - tol || nx > p.x2 + tol) continue;
          const gy = ground(p, U.clamp(nx, p.x1 + 1, p.x2 - 1));
          if (gy >= c.y - 1 && gy <= ny && gy < hy) { hit = p; hy = gy; }
        }
        if (hit) {
          c.plat = hit; c.skip = null; c.vy = 0; c.x = U.clamp(nx, hit.x1 + 2, hit.x2 - 2); c.y = ground(hit, c.x);
          if (!(c.y - c.y0 > (W.hard || def.hard) && !s.soft && fire(c, 'crash', W))) fire(c, 'land', W);
          return;
        }
      }
      c.x = nx; c.y = ny;
    } else if (m === 'climb') {
      const r = c.wall, side = c.dir > 0 ? r.x : r.x + r.w;
      c.y -= s.vy * S * dt; c.x = side - c.dir * (s.off || 0) * S;
      if (c.y <= r.y + 2) { c.plat = W.of.get(r) || null; c.x = side + c.dir * 8; if (c.plat) c.y = ground(c.plat, c.x); fire(c, 'top', W); return; }
    } else if (m === 'fly') {
      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy), v = s.speed * dt;
      if (d <= v) { c.x = c.tx; c.y = c.ty; c.plat = c.tp; fire(c, 'arrive', W); return; }
      c.x += dx / d * v; c.y += dy / d * v;
    } else if (m === 'free') { c.x += c.dir * (s.vx || 0) * S * dt; c.y += (s.vy || 0) * S * dt; }
    else if (m === 'held' && W.t - c.heldT > .3) { fire(c, 'drop', W); return; }
    while (s.ix.length && c.ft >= s.ft) {
      c.ft -= s.ft; c.f++;
      if (c.f >= s.ix.length) { if (s.once) { c.f = s.ix.length - 1; fire(c, 'done', W); return; } c.f = 0; }
      if (s.tick) { def.acts[s.tick](c, W); if (c.s !== s) return; }
    }
    if (c.time >= c.dur && !fire(c, 'done', W)) c.time = 0;
  }
  function paint(g, c, W) {
    const s = c.s, S = W.S;
    if (s.hide) return;
    if (s.paint) { c.def.acts[s.paint](c, W, g); return; }
    const i = s.ix[c.f], rot = c.rot || (s.rot ? s.rot * 6.2832 * c.dir : 0);
    if (i == null) return;
    g.globalAlpha = c.alpha;
    if (rot) {
      const lift = s.spin ? c.def.tall * S / 2 : 0;  // a roll turns about its middle, a climb about its feet
      g.save(); g.translate(Math.round(c.x), Math.round(c.y - lift)); g.rotate(rot); blit(g, c.sh, i, c.dir < 0, 0, lift); g.restore();
    } else blit(g, c.sh, i, c.dir < 0, c.x, c.y);
    g.globalAlpha = 1;
  }
  function make(def, sh, x, y, dir) { return {def, sh, x, y, dir, vy: 0, alpha: 1, plat: null, skip: null, wall: null, spot: null, rot: 0, y0: y}; }
  /** Turn the frame names in a creature's states into places on its sheet. */
  function prep(def, sh) { for (const k in def.states) { const s = def.states[k]; s.ix = s.frames.map(n => sh.ix[n]); s.ft = s.ft || .15; } }

  // ---------- bits of dust, stars and sparks: square, and on the creatures' pixel grid ----------
  function burst(W, x, y, n, cols, speed, more) {
    for (let i = 0; i < n && W.parts.length < 60; i++) {
      const a = Math.random() * 6.2832, v = speed * (.4 + Math.random() * .6);
      W.parts.push(Object.assign({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * .5, g: 0, t: 0, life: .45 + Math.random() * .4, col: cols[i % cols.length], sz: W.S}, more));
    }
  }
  function drawParts(g, W, dt) {
    const S = W.S; let n = 0;
    for (const p of W.parts) {
      p.t += dt; if (p.t >= p.life) continue;
      W.parts[n++] = p; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      g.globalAlpha = Math.min(1, 2 * (1 - p.t / p.life));
      const x = Math.round(p.x / S) * S, y = Math.round(p.y / S) * S;
      if (p.img != null) blit(g, W.ex, p.img, 0, x, y);
      else { g.fillStyle = p.col; if (p.star) { g.fillRect(x - p.sz, y, p.sz * 3, p.sz); g.fillRect(x, y - p.sz, p.sz, p.sz * 3); } else g.fillRect(x, y, p.sz, p.sz); }
    }
    W.parts.length = n; g.globalAlpha = 1;
  }
  /** The creature under the finger, if it may be touched there. */
  function under(W, x, y) {
    const S = W.S;
    for (let i = W.list.length - 1; i >= 0; i--) {
      const c = W.list[i], hw = (c.def.half + 3) * S;
      if (c.s.hide || c.s.paint || x < c.x - hw || x > c.x + hw || y < c.y - (c.def.tall + 3) * S || y > c.y + S) continue;
      if (!deep(W, c.x, c.y - c.def.tall * S / 2)) return c;
    }
    return null;
  }
  const scale = ctx => +ctx.opts.size === 2 ? 2 : 3;
  const SIZE = {key: 'size', label: 'Size', type: 'select', choices: [[2, 'Small'], [3, 'Large']], default: 3};
  // Nobody stands and watches a wall panel: the special things happen often by default, and how often is the user's
  // choice, as an interval in seconds.
  const interval = (ctx, opt) => { const v = +ctx.opts[opt.key]; return v > 0 ? U.clamp(v, opt.min, opt.max) : opt.default; };
  /** A time about so long: 35% either way. */
  const about = s => s * (0.65 + Math.random() * 0.7);
  /** Has the user switched this off? (An option that is on unless it says otherwise.) */
  const off = v => v === false || v === 'false' || v === 0 || v === '0';

  // =====================================================================================================
  // Walkers: acorn folk. A russet acorn cap with a stalk, a cream face, red boots. They drop out of a hatch
  // and try to walk home to a little door; each has a job that changes how it gets there.
  // =====================================================================================================
  const CAP = ['...s....', '..cccc..', '.cCcCcc.', 'cccccccc'], CAP2 = ['....s...'].concat(CAP.slice(1));
  const SIDE = ['ffffff', 'ffefef', 'ffffff', '.ffff.'], FRONT = ['ffffff', 'feffef', 'ffffff', '.ffff.'], OOH = ['ffffff', 'feffef', 'ffmmff', '.ffff.'];
  const FEET = ['.o..o.'], LEAF = ['...ggggg....', '.ggggGgggg..', 'gggGGggggggg', '.gg..G..ggg.', '.....G......'];
  const ACORN_ART = {w: 12, h: 14,
    pal: {s: '#7a4a22', c: '#c8742c', C: '#eba653', f: '#fbe7b8', e: '#3b2418', o: '#e2543a', a: '#f2c88a', m: '#8a2f2f', g: '#86d058', G: '#3f9a3c', b: '#e3ad6b', k: '#cfd3da'},
    frames: {
      walk0: [[CAP, 2, 5], [SIDE, 3, 9], [FEET, 3, 13]],
      walk1: [[CAP2, 2, 4], [SIDE, 3, 8], [['..oo..', '..oo..'], 3, 12]],
      fall0: [[CAP, 2, 5], [OOH, 3, 9], [['a..........a', '.a........a.'], 0, 7], [['o....o'], 3, 13]],
      fall1: [[CAP2, 2, 5], [OOH, 3, 9], [['.a........a.', '.a........a.'], 0, 7], [FEET, 3, 13]],
      glide0: [[LEAF, 0, 0], [CAP, 2, 5], [FRONT, 3, 9], [FEET, 3, 13]],
      glide1: [[LEAF.slice(0, 3).concat(['gg...G...ggg', '.....G......']), 0, 0], [CAP, 2, 5], [FRONT, 3, 9], [['..oo..'], 3, 13]],
      climb0: [[CAP, 3, 5], [SIDE, 4, 9], [['aa'], 10, 9], [['o'], 10, 12], [['o'], 5, 13]],
      climb1: [[CAP, 3, 5], [SIDE, 4, 9], [['aa'], 10, 11], [['o'], 9, 13], [['o'], 5, 12]],
      block0: [[CAP, 2, 5], [FRONT, 3, 9], [['aa......aa'], 1, 10], [['o....o'], 3, 13]],
      block1: [[CAP, 2, 5], [FRONT, 3, 9], [['a........a', '.a......a.'], 1, 9], [['o....o'], 3, 13]],
      build0: [[CAP, 2, 5], [SIDE, 3, 9], [['a'], 9, 11], [['bb'], 10, 10], [FEET, 3, 13]],
      build1: [[CAP, 2, 6], [SIDE, 3, 10], [['a'], 9, 12], [['bb'], 10, 13], [FEET, 3, 13]],
      wave0: [[CAP, 2, 5], [FRONT, 3, 9], [['.a', 'a.'], 9, 8], [['a'], 2, 11], [FEET, 3, 13]],
      wave1: [[CAP, 2, 5], [FRONT, 3, 9], [['aa'], 9, 10], [['a'], 2, 11], [FEET, 3, 13]],
      flat: [[['..s.....', 'cccccccc'], 2, 11], [['offffffo'], 2, 13]],
      sit0: [[CAP, 2, 4], [SIDE, 3, 8], [['kk', 'kk'], 9, 9], [['oo'], 8, 12]],
      sit1: [[CAP, 2, 4], [SIDE, 3, 8], [['k.', 'kk'], 9, 9], [['oo'], 8, 12]],
      pick0: [[CAP, 2, 5], [SIDE, 3, 9], [['.kkk', '..s.', '.s..'], 8, 6], [['a'], 9, 9], [FEET, 3, 13]],
      pick1: [[CAP, 2, 6], [SIDE, 3, 10], [['..k', 'ssk', '..k'], 9, 10], [FEET, 3, 13]],
    }};
  // the hatch they drop from and the door they are looking for: a hollow stump with a lantern inside
  const PROPS_ART = {w: 12, h: 9, pal: {t: '#a8693a', T: '#d9a066', k: '#2a1826', y: '#ffd978', g: '#86d058'},
    frames: {
      door: [[['...g.g....', '..tTTTTt..', '.tTkkkkTt.', '.Tkkkkkkt.', '.TkkkkkkT.', '.Tkkkyykt.', '.TkkkyykT.', '.tkkkkkkt.', 'tttkkkkttt'], 1, 0]],
      hatch: [[['TTTTTTTTTTTT', 'tkkkkkkkkkkt', 'T..........T', 'T..........T', '.t........t.'], 0, 0]],
    }};
  const FONT_ART = {w: 3, h: 5, pal: {x: '#ffe9a8'}, frames: {}};
  DIGITS.forEach((d, i) => { FONT_ART.frames['d' + i] = [[glyph(d, 'x'), 0, 0]]; });
  FONT_ART.frames.bang = [[glyph('22202', 'x'), 0, 0]];  // "!", after the digits so their places on the sheet stay

  // The jobs, after the classic eight: floater (leaf umbrella), climber (up a tile's side, or up a gap), builder (a
  // stair of bricks, with a pickaxe through any tile in its way), tunneler (straight through a tile), blocker (stands
  // and turns the others back), digger (straight down), miner (down and forward), bomber (counts down and bursts).
  const ROLES = [['walker', 80], ['floater', 10], ['climber', 6], ['bomber', 4]];  // what one is born as; the working jobs are only given out by the hand (or by a tap)
  const JOBS = [['floater', 12], ['climber', 8], ['builder', 10], ['tunneler', 6], ['blocker', 6], ['digger', 5], ['miner', 4], ['bomber', 5]];
  const DROP = {key: 'drop', label: 'Drop interval', type: 'range', min: 0.3, max: 10, step: 0.1, unit: 's', default: 1.5};  // about this long between two walkers leaving the hatch
  const TEST = HP.fx.walkTest = {out: 0, home: 0, splat: 0, boom: 0, guard: 0, round: 0, most: 0, off: 0, cut: 0, shy: 0, hail: 0};  // counts, for checks

  // ---------- the walkers' ground: solid cells, one walker pixel each ----------
  // 0 air, 1 tile, 2 brick. A tile is solid all round. A brick only holds what comes down on it or steps up it:
  // a walker that meets bricks too high to step on passes behind them. What is dug out of a tile is cut out of the
  // real tile (a mask on its element, and a hole in the frosted layer behind it) until the next round.
  //
  // SAFETY RULES (this kind cuts the real tiles):
  //   - Every tile cut is made whole again at each new round, whenever create() runs, on a double tap (restore),
  //     and when the overlays are rebuilt without this kind (fx.js calls restore on what it drops).
  //   - Every touch of a real element is wrapped in try/catch. A tile never stops taking touches.
  const UP = 2, SCR = 6;  // cells a walker steps up or down without noticing; cells of tile it scrambles up
  let holed = [];  // every element we cut
  function heal() {
    for (const el of holed) { try { const st = el.style; st.webkitMaskImage = st.maskImage = st.webkitMaskSize = st.maskSize = st.webkitMaskRepeat = st.maskRepeat = ''; delete el.hpHoles; } catch (e) { /* the element is gone */ } }
    const n = holed.length; holed = [];
    if (n) { try { if (HP.cut) HP.cut(); } catch (e) {} }
  }
  function terrain(W) {
    const S = W.S, gw = W.gw = Math.ceil(W.w / S), gh = W.gh = Math.ceil(W.h / S), m = W.m = new Uint8Array(gw * gh); W.k = new Uint8Array(gw * gh);  // k: cells that are never cut
    for (const r of W.tiles) {
      const a = Math.max(0, Math.round(r.x / S)), b = Math.min(gw - 1, Math.round((r.x + r.w) / S) - 1), t = Math.max(0, Math.round(r.y / S)), u = Math.min(gh - 1, Math.round((r.y + r.h) / S) - 1);
      for (let y = t; y <= u; y++) if (b >= a) m.fill(1, y * gw + a, y * gw + b + 1);
    }
    W.cuts = new Map(); W.dug = new Map(); W.dirty = 0; W.bg.clearRect(0, 0, W.w, W.h);
  }
  /** What is at this point: 0 air, 1 tile, 2 brick. Below the screen is floor. */
  function at(W, x, y) { const S = W.S; x = Math.floor(x / S); y = Math.floor(y / S); if (y >= W.gh) return 1; if (x < 0 || x >= W.gw || y < 0) return 0; return W.m[y * W.gw + x]; }
  /** Take the ground out of a box (in pixels), tile and brick alike; never out of cells that are kept (W.k). */
  function carve(W, x0, y0, x1, y1) {
    const S = W.S, gw = W.gw, a = Math.max(0, Math.floor(x0 / S)), b = Math.min(gw - 1, Math.ceil(x1 / S) - 1), t = Math.max(0, Math.floor(y0 / S)), u = Math.min(W.gh - 1, Math.ceil(y1 / S) - 1);
    if (b < a || u < t) return;
    let free = true; for (let y = t; y <= u && free; y++) for (let x = a; x <= b; x++) if (W.k[y * gw + x]) { free = false; break; }
    if (free) { cut(W, a, t, b, u); return; }
    for (let y = t; y <= u; y++) for (let x = a; x <= b; x++) { if (W.k[y * gw + x]) continue; let e = x; while (e < b && !W.k[y * gw + e + 1]) e++; cut(W, x, y, e, y); x = e; }  // row by row, what is left of it
  }
  function cut(W, a, t, b, u) {
    const S = W.S;
    for (let y = t; y <= u; y++) W.m.fill(0, y * W.gw + a, y * W.gw + b + 1);
    const X = a * S, Y = t * S, w = (b - a + 1) * S, h = (u - t + 1) * S; TEST.cut++;
    W.bg.clearRect(X - 1, Y - 1, w + 2, h + 2);
    for (const r of W.tiles) if (r.el && X < r.x + r.w && X + w > r.x && Y < r.y + r.h && Y + h > r.y) pierce(W, r, X, Y, w, h);
  }
  /** A hole in the real tile's picture (shown at the next flush). */
  function pierce(W, r, X, Y, w, h) {
    const S = W.S; let k = W.cuts.get(r);
    if (!k) {
      const cv = document.createElement('canvas'); cv.width = Math.ceil(r.w); cv.height = Math.ceil(r.h);
      k = {cv, g: cv.getContext('2d')}; k.g.fillRect(0, 0, cv.width, cv.height); W.cuts.set(r, k);
      if (holed.indexOf(r.el) < 0) holed.push(r.el);
    }
    // a cut that comes within a cell of the tile's edge goes right to it: no sliver is left standing
    let p = X - r.x, q = Y - r.y, p2 = p + w, q2 = q + h;
    if (p < S) p = 0; if (q < S) q = 0; if (p2 > r.w - S) p2 = r.w; if (q2 > r.h - S) q2 = r.h;
    k.g.clearRect(p, q, p2 - p, q2 - q); k.dirty = W.dirty = 1;
  }
  /** Show the cuts made since last time on the real tiles. */
  function flush(W) {
    const S = W.S, gw = W.gw;
    for (const [r, k] of W.cuts) {
      if (!k.dirty) continue; k.dirty = 0;
      try {
        const st = r.el.style;
        st.webkitMaskImage = st.maskImage = 'url(' + k.cv.toDataURL() + ')'; st.webkitMaskSize = st.maskSize = '100% 100%'; st.webkitMaskRepeat = st.maskRepeat = 'no-repeat';
        // the same holes for the frosted layer: boxes that do not overlap, read off the cells
        const a = Math.max(0, Math.round(r.x / S)), b = Math.min(gw - 1, Math.round((r.x + r.w) / S) - 1), t = Math.max(0, Math.round(r.y / S)), u = Math.min(W.gh - 1, Math.round((r.y + r.h) / S) - 1), out = [];
        let open = [];
        for (let y = t; y <= u + 1; y++) {
          const runs = [];
          if (y <= u) for (let x = a; x <= b; x++) if (W.m[y * gw + x] !== 1) { let e = x; while (e < b && W.m[y * gw + e + 1] !== 1) e++; runs.push([x, e]); x = e; }
          const next = [];
          for (const o of open) { const j = runs.findIndex(v => v[0] === o[0] && v[1] === o[1]); if (j >= 0) { runs.splice(j, 1); next.push(o); } else out.push([o[0] * S - r.x, o[2] * S - r.y, (o[1] + 1) * S - r.x, y * S - r.y]); }
          for (const v of runs) next.push([v[0], v[1], y]);
          open = next;
        }
        r.el.hpHoles = out.slice(0, 150);
      } catch (e) { /* this tile stays whole */ }
    }
    try { if (HP.cut) HP.cut(); } catch (e) {}
  }
  /** A brick: two cells wide, its top at y. */
  function lay(W, x, y, i) {
    const S = W.S, gx = Math.floor(x / S), gy = Math.floor(y / S);
    let n = 0; for (let k = 0; k < 2; k++) { const cx = gx + k; if (cx >= 0 && cx < W.gw && gy >= 0 && gy < W.gh && !W.m[gy * W.gw + cx]) { W.m[gy * W.gw + cx] = 2; n++; } }
    if (!n) return false;  // nothing but ground here already
    const g = W.bg; g.fillStyle = INK; g.fillRect(gx * S - 1, gy * S - 1, 2 * S + 2, 2 * S + 2); g.fillStyle = i & 1 ? '#c98a4b' : '#e3ad6b'; g.fillRect(gx * S, gy * S, 2 * S, 2 * S);
    return true;
  }
  /** Is a tile in the way of a body standing at x, y? */
  function blocked(W, c, x, y) {
    const S = W.S, h = c.def.half * S, T = c.def.tall * S;
    for (let dx = -h; dx <= h; dx += S) for (let yy = y - T - S; yy < y; yy += S) if (at(W, x + dx, yy) === 1) return true;
    return false;
  }
  /** One frame of moving about on the cells. True: its state changed, or it was stopped. */
  function gmove(c, dt, W) {
    const s = c.s, S = W.S, def = c.def, m = s.move || 'ground', T = def.tall * S, h = def.half * S, mg = (def.edge || 0) * S + 4;
    if (m === 'ground') {
      let k = 0; while (at(W, c.x, c.y - S) === 1 && k++ < 400) c.y -= S;  // the tile it was inside is whole again: up on top of it
      k = 0; while (k <= UP && !at(W, c.x, c.y + k * S)) k++;
      if (k > UP) { if (!fire(c, 'edge', W) || c.s.move !== 'air') go(c, def.fall, W); return true; }  // the ground under it is gone
      c.y += k * S;
      let left = (s.vx || 0) * S * dt;
      while (left > 0) {
        const d = Math.min(S, left), nx = c.x + c.dir * d; left -= d;
        if (c.dir < 0 ? nx < mg : nx > W.w - mg) { fire(c, 'screen', W); return true; }  // coming to the side of the screen
        for (const o of W.list) if (o !== c && (o.s.solid || o.s.hold) && Math.abs(o.y - c.y) < T && (o.x - c.x) * c.dir > 0 && Math.abs(o.x - nx) < 2 * h) { if (o.s.solid && c.pass > W.t && o.st !== 'guard') continue; if (o.s.solid) fire(c, 'bump', W); return true; }  // a blocker turns it; one at work makes it wait
        // a bank of tile is scrambled up (the side of a crater, a chunk left by a digger): up to SCR cells; bricks only a step
        let ny = c.y; k = 0; while (k < SCR && at(W, nx, ny - S)) { ny -= S; k++; }
        let over = at(W, nx, ny - S);
        if (k > UP && !over) for (let y = ny; y < c.y; y += S) if (at(W, nx, y) === 2) { over = 2; break; }
        const lx = nx + c.dir * (h - S);
        if (over === 2) ny = c.y;  // bricks too high to step on: behind them
        if (over === 1 || (at(W, lx, ny - (SCR + 1) * S) === 1 && at(W, lx, ny - 4 * S) === 1 && at(W, lx, ny - S) === 1)) { fire(c, 'wall', W); return true; }  // a wall stands on the ground; what only hangs overhead is for the head to find
        // Something overhead is too low: it turns round. Where there is still room to duck under (a low gap between two
        // rows of tiles), it does that at the second bump, or when it is under there already.
        let head = at(W, lx, ny - T + S) === 1, low = false, duck = c.duck > W.t;
        for (let y = ny - T + S; y < ny; y += S) { if (at(W, nx, y) === 1) { head = true; if (y >= ny - 3 * S) low = true; } if (!duck && at(W, c.x, y) === 1) duck = true; }
        if (low || (head && !duck)) { if (!low) { if (W.t - (c.bonk || -9) < 2.5) c.duck = W.t + 8; c.bonk = W.t; } fire(c, 'head', W); return true; }
        k = 0; while (k <= UP && !at(W, nx, ny + k * S)) k++;
        if (k > UP) {
          let turn = false; if (at(W, c.x, c.y) === 2) for (let d = 1; d <= 5 && !turn; d++) if (at(W, c.x - c.dir * d * S, c.y - S) === 2) turn = true;
          if (turn && fire(c, 'bump', W)) return true;
          fire(c, 'edge', W);
          if (c.s.move === 'air') { c.x = nx; for (let g = S; g < 40; g += S) if (at(W, nx + c.dir * g, c.y + S) === 1) { c.x = nx + c.dir * (g - S) / 2; break; } }  // down the middle of a gap
          return true;
        }
        c.x = nx; c.y = ny + k * S;
        if (W.door && Math.abs(c.x - W.door.x) < 3 * S && Math.abs(c.y - W.door.y) <= 2 * S && fire(c, 'exit', W)) return true;
      }
    } else if (m === 'air') {
      c.vy = Math.min(s.vmax || 420, c.vy + 1100 * dt);
      let ny = c.y + c.vy * dt, nx = U.clamp(c.x + c.dir * (s.vx || 0) * S * dt, mg, W.w - mg);
      if (nx !== c.x) { const lx = nx + c.dir * (h - S); if (at(W, lx, c.y - S) === 1 || at(W, lx, c.y - T) === 1) nx = c.x; }  // a tile's side
      if (c.vy < 0 && at(W, nx, ny - T) === 1) { c.vy = 0; ny = c.y; }  // its head on an underside
      if (c.vy > 0) for (let y = Math.ceil(c.y / S) * S; y <= ny; y += S) if (at(W, nx, y)) {
        c.x = nx; c.y = y; c.vy = 0;
        if (!(c.y - c.y0 > W.hard && !s.soft && fire(c, 'crash', W))) fire(c, 'land', W);
        return true;
      }
      c.x = nx; c.y = ny;
    } else if (m === 'climb') {
      const px = c.x + c.dir * 2 * S;
      c.y -= s.vy * S * dt;
      if (at(W, c.x, c.y - T - S) === 1) { c.dir = -c.dir; c.role = 'walker'; go(c, def.fall, W); return true; }  // an underside: it lets go, turned round, and has had enough of climbing
      if (at(W, px, c.y - S) === 1) c.grip = 1;
      else if (c.grip) { c.x = px + c.dir * S; c.y = Math.ceil(c.y / S) * S; fire(c, 'top', W); return true; }
      else if (c.cy - c.y > T + 20 * S) { c.role = 'walker'; go(c, def.fall, W); return true; }  // nothing to hold on to
    }
    return false;
  }

  const ACORN = {
    art: ACORN_ART, half: 4, tall: 9, hard: 230, fall: 'fall', edge: 7,
    key: c => c.role,
    on: {tap: 'wave'},
    states: {
      drop:  {frames: ['fall0', 'fall1'], ft: .12, move: 'air', soft: 1, fade: 5, on: {land: 'walk', tap: 0}},
      walk:  {frames: ['walk0', 'walk1'], ft: .16, vx: 10, dur: [3, 8], enter: 'stride', next: {blocker: 'block', builder: 'build', digger: 'bore', miner: 'bore', _: 'walk'},
        on: {notice: 'gawk', jolt: 'slip', edge: {floater: 'glide', builder: 'build', _: 'fall'}, wall: {climber: 'climb', tunneler: 'bash', _: 'turn'}, head: {tunneler: 'bash', _: 'turn'}, bump: 'turn', screen: 'turn', exit: 'hopin'}},
      turn:  {frames: ['walk0'], enter: 'flip', dur: 0, next: 'walk'},
      // a fall of more than two tiles ends badly, unless it has the leaf
      fall:  {frames: ['fall0', 'fall1'], ft: .12, move: 'air', each: 'chute', on: {land: 'walk', crash: 'splat'}},
      glide: {frames: ['glide0', 'glide1'], ft: .4, move: 'air', vmax: 42, vx: 2.5, soft: 1, on: {land: 'walk'}},
      climb: {frames: ['climb0', 'climb1'], ft: .2, move: 'climb', vy: 7, enter: 'cling', on: {top: 'walk'}},
      block: {frames: ['block0', 'block1'], ft: .5, solid: 1, enter: 'plain', dur: [9, 16], next: 'walk', on: {jolt: 'slip'}},
      // the first one to come to the side of the screen stays there and sends the rest back
      guard: {frames: ['block0', 'block1'], ft: .5, solid: 1, enter: 'post'},
      // a finger on the glass: stop, turn to look at it, then turn back and carry on
      gawk:  {frames: ['walk0'], enter: 'face', dur: 1.5, next: 'back', on: {notice: 'gawk', jolt: 'slip'}},
      back:  {frames: ['walk0'], enter: 'unface', dur: 0, next: 'walk'},
      // the screen is pulled away under it: it tumbles the other way, sits seeing stars, then gets up and goes on
      slip:  {frames: ['fall0', 'fall1'], ft: .1, spin: 1.3, vx: 16, dur: .6, enter: 'jolt', next: 'daze', on: {edge: 'fall', wall: 'daze', head: 'daze', bump: 'daze', screen: 'daze', tap: 0}},
      daze:  {frames: ['fall0'], ft: .3, tick: 'stars', dur: 1.3, next: 'back', on: {tap: 0}},
      // something to run from: it hurries the other way for a moment, then turns back and goes on as before. An edge, a wall
      // or a blocker ends it at once, so it never leaves the ground it was on.
      flee:  {frames: ['walk0', 'walk1'], ft: .09, vx: 18, dur: [.7, 1], next: 'back', on: {jolt: 'slip', edge: 'back', wall: 'back', head: 'back', bump: 'back', screen: 'back', exit: 'hopin'}},
      // somebody of another kind on two legs goes by: a wave, or only a look, and on
      hail:  {frames: ['wave0', 'wave1', 'wave0', 'wave1'], ft: .14, once: 1, next: 'back', on: {jolt: 'slip'}},
      peer:  {frames: ['walk0'], dur: .5, next: 'back', on: {jolt: 'slip'}},
      // carried off by another kind: pulled toward it and out of sight, then set down again, softly
      taken: {frames: ['fall0', 'fall1'], ft: .1, move: 'free', fade: -2.5, each: 'pull', dur: .5, next: 'gone', on: {tap: 0}},
      gone:  {frames: [], hide: 1, move: 'free', enter: 'stow', next: 'put', on: {tap: 0}},
      put:   {frames: ['fall0', 'fall1'], ft: .12, move: 'air', soft: 1, fade: 5, enter: 'unstow', on: {land: 'back', tap: 0}},
      build:{frames: ['build0', 'build1'], ft: .1, hold: 1, enter: 'stair', tick: 'brick', on: {built: 'walk'}},
      // a tile in the way of the stair: out comes the pickaxe, and the stair goes on through it
      pick:  {frames: ['pick0', 'pick1'], ft: .15, hold: 1, tick: 'chip'},
      // the diggers take the tile away a chunk at a time: sideways (tunneler), straight down (digger), down and forward (miner)
      bash:  {frames: ['pick0', 'pick1'], ft: .2, hold: 1, enter: 'job', tick: 'bash'},
      bore:  {frames: ['build0', 'build1'], ft: .12, hold: 1, enter: 'spot', dur: .5, next: {miner: 'mine', _: 'delve'}},
      delve: {frames: ['build0', 'build1'], ft: .25, hold: 1, enter: 'job', tick: 'scoop'},
      mine:  {frames: ['pick0', 'pick1'], ft: .22, hold: 1, enter: 'job', tick: 'hew'},
      // thrown by a bomber going off next to it
      blown: {frames: ['fall0', 'fall1'], ft: .1, move: 'air', jump: 230, vx: 14, spin: 1.4, on: {land: 'daze', crash: 'splat', tap: 0}},
      wave:  {frames: ['wave0', 'wave1', 'wave0', 'wave1', 'wave0', 'wave1'], ft: .16, once: 1, enter: 'reroll', next: {blocker: 'block', builder: 'build', digger: 'bore', miner: 'bore', _: 'walk'}},
      hopin: {frames: ['walk1'], move: 'air', jump: 200, soft: 1, enter: 'atdoor', on: {land: 'home', tap: 0}},
      home:  {frames: ['walk0'], fade: -5, dur: .25, enter: 'saved', next: 'out', on: {tap: 0}},
      splat: {frames: ['flat'], fade: -.9, dur: 1.1, enter: 'squash', next: 'out', on: {tap: 0}},
      boom:  {frames: [], hide: 1, enter: 'bang', end: 1},
      out:   {frames: [], hide: 1, end: 1},
    },
    acts: {
      flip(c, W) { c.dir = -c.dir; if (W.t - (c.flipT || -9) < 3) c.pass = W.t + 4; c.flipT = W.t; },
      // "was" is the way it was walking before something turned its head; forgotten once it walks on
      stride(c) { c.was = 0; },
      face(c, W) { if (!c.was) c.was = c.dir; if (Math.abs(W.look.x - c.x) > 4 * W.S) c.dir = W.look.x < c.x ? -1 : 1; },
      unface(c) { if (c.was) c.dir = c.was; },
      jolt(c, W) { if (!c.was) c.was = c.dir; c.dir = W.jolt; },
      stars(c, W) { if (W.parts.length < 60) W.parts.push({x: c.x + (Math.random() - .5) * 10 * W.S, y: c.y - 11 * W.S, vx: (Math.random() - .5) * 30, vy: -18, g: 0, t: 0, life: .7, col: '#ffe45c', sz: W.S, star: 1}); },
      pull(c) { c.x += (c.tx - c.x) * .3; c.y += (c.ty - c.y) * .3; },
      stow(c) { c.dur = c.secs; },
      unstow(c, W) { const mg = 7 * W.S + 4; c.x = U.clamp(c.ox, mg, W.w - mg); c.y = c.y0 = U.clamp(c.oy, c.def.tall * W.S, W.gh * W.S); c.vy = 0; c.alpha = 0; },
      // "hold" is how long it was asked to stand there; without one it stands as long as it likes
      plain(c) { c.role = 'walker'; if (c.hold) { c.dur = about(c.hold); c.hold = 0; } },
      // one is enough: a second that comes down beyond the first is sent back in
      post(c, W) {
        c.role = 'walker';
        const o = W.list.find(o => o !== c && o.st === 'guard' && Math.abs(o.y - c.y) < c.def.tall * W.S && Math.abs(o.x - c.x) < 16 * W.S);
        if (o) { c.dir = -c.dir; c.x = o.x + c.dir; go(c, 'walk', W); } else TEST.guard++;
      },
      reroll(c, W) { let r; do r = pick(JOBS); while (r === c.role); c.role = r; if (r === 'bomber') c.fuse = W.t + 5; },
      chute(c, W) { if (c.role === 'floater' && c.y - c.y0 > 10 * W.S) go(c, 'glide', W); },  // the leaf opens a little way down
      squash(c, W) { TEST.splat++; TEST.last = Math.round(c.x) + ',' + Math.round(c.y0) + '>' + Math.round(c.y) + ' ' + c.role; burst(W, c.x, c.y - 2 * W.S, 9, ['#fffaf0', '#f3e2c4', '#c8742c'], 90, {g: 300}); },
      atdoor(c, W) { c.x = W.door.x; },
      saved(c, W) { TEST.home++; W.lastHome = W.t; W.saved = (W.saved + 1) % 1000; burst(W, c.x, c.y - 9 * W.S, 3, ['#ffe45c'], 50, {star: 1, life: .7}); },
      // up against the wall it walked into; one that goes up a gap from underneath has nothing to press against yet
      cling(c, W) {
        c.grip = 0; c.cy = c.y;
        if (c.loose) { c.loose = 0; return; }
        for (let k = 0; k < 2 * c.def.half && at(W, c.x + c.dir * 2 * W.S, c.y - 2 * W.S) !== 1; k++) c.x += c.dir * W.S;
      },
      job(c) { c.role = 'walker'; },  // the job is used up once the digging starts
      spot(c, W) { if (!at(W, c.x, c.y) || c.y >= W.gh * W.S) { c.role = 'walker'; go(c, 'walk', W); } },  // nothing here to go down through
      scoop(c, W) {
        if (c.f) return;
        const S = W.S, h = c.def.half * S;
        if (c.y >= W.gh * S) { go(c, 'walk', W); return; }  // the bottom of the screen
        carve(W, c.x - h - S, c.y, c.x + h + S, c.y + 2 * S);
        burst(W, c.x, c.y - S, 3, ['#fff3dc', '#e9dcc6', '#c4b299'], 70, {g: 300});
      },
      hew(c, W) {
        if (c.f) return;
        const S = W.S, h = c.def.half * S, T = c.def.tall * S, nx = c.x + c.dir * 2 * S, ny = c.y + S, mg = 9 * S + 8;
        if (nx < mg || nx > W.w - mg || ny >= W.gh * S) { go(c, 'walk', W); return; }
        carve(W, nx - h - S, ny - T - 2 * S, nx + h + S, ny); c.x = nx; c.y = ny;
        burst(W, c.x + c.dir * 3 * S, c.y - S, 3, ['#fff3dc', '#e9dcc6', '#c4b299'], 70, {g: 300});
      },
      bash(c, W) {
        if (c.f) return;
        const S = W.S, h = c.def.half * S, T = c.def.tall * S, fx = c.x + c.dir * (h + 3 * S), mg = 9 * S + 8; let any = false;
        for (let x = S; x <= h + 3 * S && !any; x += S) for (let y = c.y - T - S; y < c.y; y += S) if (at(W, c.x + c.dir * x, y) === 1) { any = true; break; }
        if (!any || fx < mg || fx > W.w - mg) { go(c, 'walk', W); return; }  // through, or nothing but the screen's edge beyond
        carve(W, Math.min(c.x, fx), c.y - T - 2 * S, Math.max(c.x, fx), c.y); c.x += c.dir * 2 * S;
        burst(W, c.x + c.dir * 5 * S, c.y - 3 * S, 3, ['#fff3dc', '#e9dcc6', '#c4b299'], 80, {g: 300});
      },
      // It bursts: a round hole in whatever is there, tile or brick, and whoever stood close is thrown clear.
      bang(c, W) {
        const S = W.S, R = 7 * S, cy = c.y - 3 * S; TEST.boom++;
        burst(W, c.x, c.y - 4 * S, 16, ['#fffaf0', '#ffd978', '#ff8a3c', '#e2543a'], 170, {g: 300});
        if (!c.dud) for (let dy = -R; dy < R; dy += S) { const hw = Math.sqrt(R * R - (dy + S / 2) * (dy + S / 2)); carve(W, c.x - hw, cy + dy, c.x + hw, cy + dy + S); }
        for (const o of W.list) if (o !== c && !o.dead && !o.s.hide && o.st !== 'hopin' && o.st !== 'home' && o.st !== 'splat' && Math.hypot(o.x - c.x, o.y - c.y) < 16 * S) { o.dir = o.x < c.x ? -1 : 1; if (o.role !== 'floater') o.role = 'walker'; go(o, 'blown', W); }
      },
      // A stair of little bricks, up and forward, one up for two along: as high as the door when that is higher,
      // otherwise twelve bricks, or as many as it takes to get over a gap.
      stair(c, W) {
        if (c.keep) { c.keep = 0; return; }  // back from the pickaxe: the same stair
        c.role = 'walker'; c.bn = 0; c.bair = 0; c.dig = c.goal; c.goal = 0; c.force = 0; c.fn = 0; c.stuck = 0; c.bmax = c.dig ? 2000 : 12;  // only a stair sent up to the door goes through tiles, and as far as it must
      },
      brick(c, W) {
        if (c.f) return;
        const S = W.S, h = c.def.half * S, D = W.door;
        let flat = false;
        if (c.dig) {
          if (c.y <= D.y) { fire(c, 'built', W); return; }
          const X = c.tx, to = X < c.x ? -1 : 1, run = Math.abs(X - c.x), need = 2 * (c.y - D.y), mg = 9 * S + 8 + h; let dir = run >= need ? to : -to;
          if (c.fn > 0) { dir = c.fdir; c.fn--; flat = true; }  // round something that may not be cut
          else if (c.force) { dir = c.force; if ((X - c.x) * dir < 0) c.force = 0; }  // no room at the screen's side: on past the door, and back
          else if (dir !== to && (c.x + dir * 2 * S < mg || c.x + dir * 2 * S > W.w - mg)) dir = c.force = to;
          else if (run > need + 2 * S) flat = true;  // far off still: along the ground first, over what gaps there are
          c.dir = dir;
        }
        const nx = c.x + c.dir * 2 * S, ny = flat ? c.y : c.y - S;
        if (c.bn >= c.bmax || nx < 8 + h || nx > W.w - 8 - h) { fire(c, 'built', W); return; }
        const mark = (put, row) => { const j = c.site; if (put && j && j.job === 'bridge' && !j.fx) { j.fx = nx - S + 1; j.fy = row + 1; } };
        if (flat) {
          let low = false; for (let k = 1; k <= 3; k++) if (at(W, nx, c.y - k * S) === 1) low = true;
          if (low) { c.pflat = 1; go(c, 'pick', W); return; }
          lay(W, nx - S, c.y, c.bn++); c.x = nx; return;
        }
        if (blocked(W, c, nx, ny) || (!c.dig && ny < 14 * S)) {  // a tile in the way, or the top of the screen
          let room = true; for (let k = 1; k <= 3; k++) if (at(W, nx, c.y - k * S) === 1) room = false;
          if (c.dig) { c.pflat = 0; go(c, 'pick', W); }
          else if (room) {  // a tile close overhead: no stair, but a flat bridge fits under it
            const air = !at(W, nx, c.y); mark(lay(W, nx - S, c.y, c.bn++), c.y); c.x = nx;
            if (air) c.bair = 1; else if (c.bair) fire(c, 'built', W);
          } else fire(c, 'built', W);
          return;
        }
        mark(lay(W, nx - S, ny, c.bn++), ny); c.x = nx; c.y = ny;
        // over a gap, then over ground again and too high to be stepped on from the far side: the bridge is done
        let k = 1; while (k <= 16 && at(W, nx, ny + k * S) !== 1) k++;
        if (k > 16) c.bair = 1; else if (c.bair && k > UP + 1 && c.y - W.door.y <= 10) fire(c, 'built', W);
      },
      chip(c, W) {
        if (c.f) return;
        const S = W.S, h = c.def.half * S, T = c.def.tall * S, nx = c.x + c.dir * 2 * S, ny = c.pflat ? c.y : c.y - S;
        carve(W, Math.min(nx - c.dir * (h + S), nx + c.dir * (h + 5 * S)), ny - T - 4 * S, Math.max(nx - c.dir * (h + S), nx + c.dir * (h + 5 * S)), ny);
        burst(W, nx, ny - T, 4, ['#fff3dc', '#e9dcc6', '#c4b299'], 80, {g: 300});
        let stuck = false; if (c.pflat) { for (let k = 1; k <= 3; k++) if (at(W, nx, c.y - k * S) === 1) stuck = true; } else stuck = blocked(W, c, nx, ny);
        if (stuck) { if ((c.stuck = (c.stuck || 0) + 1) > 5) { go(c, 'walk', W); return; } c.fdir = -c.dir; c.fn = 10; }  // the door's ground or a furnished tile: round it
        c.keep = 1; go(c, 'build', W);
      },
    },
  };

  // ---------- meeting the other kinds ----------
  // All of it is brief, and only for a plain walker out walking: never one with a job, a leaf or a fuse, never in the
  // air. Each ends in "back", which turns it the way it was going, so the round's plan is not disturbed.
  const WALKER_TAGS = ['creature', 'person'];
  const strolling = c => c.st === 'walk' && c.role === 'walker' && !c.fuse;
  /** Frightened by something at `by`: off the other way for a moment. Not again for ten seconds, so nothing can pen them in. */
  function shy(c, W, by) {
    if (!by || !strolling(c) || W.t < (c.shyT || 0)) return false;
    c.was = c.dir; c.dir = by.x < c.x ? 1 : -1; c.shyT = W.t + 10; TEST.shy++;
    return go(c, 'flee', W);
  }
  /** Carried off toward `by` for by.secs seconds; set down at by.out, or where it was. Its time away does not count against it. */
  function taken(c, W, by) {
    if (!by || !strolling(c)) return false;
    const o = by.out; c.secs = U.clamp(+by.secs || 3, .5, 30); c.born += c.secs;
    c.was = c.dir; c.tx = isFinite(by.x) ? +by.x : c.x; c.ty = isFinite(by.y) ? +by.y : c.y; c.ox = o && isFinite(o.x) ? +o.x : c.x; c.oy = o && isFinite(o.y) ? +o.y : c.y;
    return go(c, 'taken', W);
  }
  /** What a walker shows the other kinds: made once, moved each frame. */
  const card = (c, W) => ({kind: 'walker', tags: WALKER_TAGS, x: c.x, y: c.y, h: c.def.tall * W.S, dir: c.dir, scare: by => shy(c, W, by), carry: by => taken(c, W, by)});
  /** Who of the other kinds is about: a threat close by sends a walker off, a figure on two legs gets a wave or a look. */
  function meet(W, sc) {
    const T = W.thr, P = W.ppl; T.length = P.length = 0;
    for (const a of sc.actors) { if (a.hid || a.kind === 'walker' || !a.tags) continue; if (a.tags.indexOf('threat') >= 0) T.push(a); else if (a.tags.indexOf('person') >= 0) P.push(a); }
    if (!T.length && !P.length) return;
    for (const c of W.list) {
      if (!strolling(c)) continue;
      for (const a of T) if (Math.abs(a.x - c.x) < 70 && Math.abs(a.y - c.y) < 36 && shy(c, W, a)) break;
      if (c.st !== 'walk' || W.t < (c.hiT || 0)) continue;
      for (const a of P) if (Math.abs(a.x - c.x) < 40 && Math.abs(a.y - c.y) < 30) {
        c.hiT = W.t + 20; c.was = c.dir; if (Math.abs(a.x - c.x) > 2 * W.S) c.dir = a.x < c.x ? -1 : 1; TEST.hail++;
        go(c, Math.random() < .5 ? 'hail' : 'peer', W); break;
      }
    }
  }

  // ---------- furnished tiles ----------
  // Each round two tiles get a little room cut into them, shut all round: a living room, a bedroom, a bathroom or a
  // kitchen, with one of the acorn folk at home in it. They are only there to be looked at. Nobody digs, builds or
  // bursts a hole in such a tile, and the way to the door goes round it. The tile's own name hangs on the back wall.
  const RW = 34, RH = 18;  // a room, in walker pixels
  const LETTERS = {A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227', J: '11152', K: '55655', L: '44447', M: '57555',
    N: '57775', O: '25552', P: '65644', Q: '25573', R: '65655', S: '34216', T: '72222', U: '55557', V: '55552', W: '55775', X: '55255', Y: '55222', Z: '71247',
    0: '75557', 1: '26227', 2: '61247', 3: '61216', 4: '55711', 5: '74616', 6: '34757', 7: '71222', 8: '75757', 9: '75716'};
  function letters(g, s, x, y, px) { for (let i = 0; i < s.length; i++) { const f = LETTERS[s[i]]; if (f) for (let r = 0; r < 5; r++) for (let b = 0; b < 3; b++) if (f[r] & (4 >> b)) g.fillRect(x + (i * 4 + b) * px, y + r * px, px, px); } }
  const BOOKS = ['#e2543a', '#4a90d9', '#86d058', '#ffd978', '#c58af9', '#f3ead8'];
  // what stands in each room (painted once), and where its resident is
  const ROOMS = {
    living(R) {
      R('#7a4a2a', 0, 16, 34, 2); R('#b0413e', 8, 16, 15, 1); R('#d9a066', 9, 16, 1, 1); R('#d9a066', 21, 16, 1, 1);
      R('#6b4226', 26, 4, 8, 12); R('#3a2418', 27, 5, 6, 10);
      for (let s = 0; s < 3; s++) { for (let i = 0; i < 6; i++) R(BOOKS[(i * 2 + s * 3) % 6], 27 + i, 5 + s * 3 + (i === 4 - s ? 1 : 0), 1, i === 4 - s ? 1 : 2); R('#6b4226', 27, 7 + s * 3, 6, 1); }
      R('#cfd3da', 4, 9, 1, 7); R('#8f96a3', 3, 15, 3, 1); R('#ffd978', 3, 6, 3, 1); R('#ffe9a8', 2, 7, 5, 2);
      R('#7d4fb8', 11, 8, 2, 8); R('#9a6bd6', 11, 13, 8, 3); R('#7d4fb8', 18, 12, 1, 4); R('#5f3a94', 12, 15, 1, 1); R('#5f3a94', 17, 15, 1, 1);
    },
    bed(R) {
      R('#6a5a7a', 0, 16, 34, 2); R('#4a74c9', 22, 16, 8, 1);
      R('#1b2350', 27, 2, 6, 6); R('#6b4226', 27, 2, 6, 1); R('#6b4226', 27, 7, 6, 1); R('#6b4226', 27, 2, 1, 6); R('#6b4226', 32, 2, 1, 6); R('#6b4226', 30, 3, 1, 4); R('#fff6c8', 28, 4, 1, 2); R('#fff6c8', 29, 3, 1, 1);
      R('#6b4226', 2, 8, 1, 8); R('#6b4226', 3, 14, 18, 1); R('#6b4226', 3, 15, 1, 1); R('#6b4226', 20, 13, 1, 3);
      R('#f3ead8', 3, 12, 17, 2); R('#ffffff', 3, 11, 6, 1);
      R('#6b4226', 22, 11, 4, 5); R('#8a5a34', 22, 11, 4, 1); R('#d9a066', 24, 13, 1, 1); R('#8f96a3', 24, 10, 1, 1); R('#77718f', 23, 8, 3, 2);
    },
    bath(R) {
      for (let x = 1; x < 34; x += 4) R('rgba(190,228,238,.28)', x, 0, 1, 16); for (let y = 3; y < 16; y += 4) R('rgba(190,228,238,.28)', 0, y, 34, 1);
      R('#8fa9bd', 0, 16, 34, 2); R('#86d058', 23, 16, 8, 1);
      R('#cfd3da', 25, 3, 1, 13); R('#cfd3da', 22, 3, 4, 1); R('#8f96a3', 21, 4, 3, 1);
      R('#cfd3da', 28, 7, 5, 1); R('#e2543a', 29, 8, 3, 5); R('#f3ead8', 29, 11, 3, 1);
      R('#f4f7fb', 3, 11, 18, 5); R('#cfd3da', 3, 15, 18, 1); R('#8f96a3', 4, 16, 1, 1); R('#8f96a3', 19, 16, 1, 1);
    },
    kitchen(R) {
      for (let x = 0; x < 34; x += 2) { R('#d8d2c4', x, 16, 1, 1); R('#8a8478', x + 1, 16, 1, 1); R('#8a8478', x, 17, 1, 1); R('#d8d2c4', x + 1, 17, 1, 1); }
      R('#dfe6ee', 27, 4, 7, 12); R('#aab4c2', 27, 8, 7, 1); R('#8f96a3', 28, 6, 1, 1); R('#8f96a3', 28, 10, 1, 2);
      R('#8a5a34', 11, 12, 15, 4); R('#e9dcc6', 11, 11, 15, 1); R('#6b4226', 14, 13, 1, 3); R('#d9a066', 12, 14, 1, 1);
      R('#3a3a44', 17, 12, 8, 4); R('#20202a', 18, 13, 6, 2); R('#ff8a3c', 20, 14, 2, 1);
      R('#cfd3da', 19, 9, 4, 2); R('#8f96a3', 18, 9, 1, 1); R('#8f96a3', 23, 9, 1, 1);
      R('#6b4226', 12, 8, 6, 1); R('#e2543a', 12, 6, 1, 2); R('#86d058', 14, 6, 1, 2); R('#ffd978', 16, 7, 1, 1);
    },
  };
  // where the tile's name hangs in each room: its left end, and how wide it may be (walker pixels)
  const SIGN = {living: [9, 16], bed: [3, 22], bath: [3, 17], kitchen: [2, 24]};
  const KINDS = Object.keys(ROOMS);
  /** Cut the two rooms of this round and furnish them. h and d are the hatch's and the door's tiles: not those. */
  function furnish(W, h, d) {
    const S = W.S, gw = W.gw, rnd = Math.random;
    W.rooms = []; W.roomOf = new Map();
    const fit = W.tiles.filter(r => r !== h && r !== d && r.el && r.w >= (RW + 8) * S && r.h >= (RH + 6) * S && ['camera', 'image', 'clock', 'media', 'assistant'].indexOf(r.type) < 0);
    const kinds = KINDS.slice();
    for (let n = 0; n < 2 && fit.length && W.tiles.length >= 6; n++) {
      const ft = W.tiles[String(W.opts.rt == null ? '' : W.opts.rt).split(',')[n] || -1], fk = String(W.opts.rk || '').split(',')[n];
      const r = ft || fit.splice(Math.floor(rnd() * fit.length), 1)[0], kind = ROOMS[fk] ? fk : kinds.splice(Math.floor(rnd() * kinds.length), 1)[0];
      // the whole tile is left alone from now on
      const a = Math.max(0, Math.round(r.x / S) - 1), b = Math.min(gw - 1, Math.round((r.x + r.w) / S)), t = Math.max(0, Math.round(r.y / S) - 1), u = Math.min(W.gh - 1, Math.round((r.y + r.h) / S));
      for (let y = t; y <= u; y++) W.k.fill(1, y * gw + a, y * gw + b + 1);
      // the room: in the corner away from the tile's own writing
      const cx = Math.round((r.x + r.w) / S) - RW - 4, cy = Math.round((r.y + r.h) / S) - RH - 3, X = cx * S, Y = cy * S;
      for (let y = cy; y < cy + RH; y++) W.m.fill(3, y * gw + cx, y * gw + cx + RW);  // 3: the inside of a room (nobody gets there)
      pierce(W, r, X, Y, RW * S, RH * S);
      const g = W.bg, R = (col, x, y, w, hh) => { g.fillStyle = col; g.fillRect(X + x * S, Y + y * S, w * S, hh * S); };
      R('rgba(24,14,34,.5)', 0, 0, RW, RH);
      ROOMS[kind](R);
      if (kind === 'living') { const q = g.createRadialGradient(X + 4.5 * S, Y + 8 * S, S, X + 4.5 * S, Y + 8 * S, 13 * S); q.addColorStop(0, 'rgba(255,225,130,.5)'); q.addColorStop(1, 'rgba(255,225,130,0)'); g.fillStyle = q; g.fillRect(X, Y, 20 * S, RH * S); }
      // the tile's name on the back wall, lit when the tile is on
      const px = Math.max(1, S - 1), at0 = SIGN[kind][0], room = SIGN[kind][1];
      const name = String((r.tile && r.tile.name) || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, Math.floor((room * S - 4) / (4 * px)));
      if (name.trim().length >= 2) {
        const w = name.length * 4 * px + 3, hh = 5 * px + 4, x = X + at0 * S, y = Y + S;
        g.fillStyle = '#6b4226'; g.fillRect(x, y, w, hh); g.fillStyle = '#2a1826'; g.fillRect(x + 1, y + 1, w - 2, hh - 2);
        g.fillStyle = r.on ? '#ffd978' : '#aeb6d2'; letters(g, name, x + 2, y + 2, px);
      }
      W.rooms.push({kind, X, Y}); W.roomOf.set(r, kind);
    }
  }
  /** The ones at home, and what moves in their rooms. */
  function residents(g, W) {
    const S = W.S, sh = W.sh, t = W.t;
    for (const o of W.rooms) {
      const X = o.X, Y = o.Y, R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(X + x * S, Y + y * S, w * S, h * S); };
      if (o.kind === 'living') blit(g, sh, sh.ix[t % 5 < .5 ? 'sit1' : 'sit0'], 0, X + 15 * S, Y + 16 * S - 1);  // reading; now and then a page is turned
      else if (o.kind === 'kitchen') { blit(g, sh, sh.ix[t % 1 < .5 ? 'build0' : 'build1'], 0, X + 6 * S, Y + 16 * S - 1); for (let i = 0; i < 3; i++) { const p = (t * .6 + i / 3) % 1; g.globalAlpha = .7 * (1 - p); R('#ffffff', 20 + (i % 2), 8 - p * 4, 1, 1); } g.globalAlpha = 1; }
      else if (o.kind === 'bath') {
        g.save(); g.beginPath(); g.rect(X, Y, RW * S, 12 * S); g.clip(); blit(g, sh, sh.ix.walk0, 0, X + 9 * S, Y + 15 * S - 1); g.restore();
        R('#7cc7e8', 4, 12, 16, 1); for (let i = 0; i < 5; i++) R('#ffffff', 5 + i * 3 + (Math.floor(t * 1.5 + i) % 2), 11, 1, 1);  // water and suds
        R('#ffd978', 16, 10, 2, 2); R('#ff8a3c', 18, 11, 1, 1); R('#3b2418', 17, 10, 1, 1);  // the duck
      } else {  // asleep: its head on the pillow, the blanket going up and down
        R('#c8742c', 3, 9, 1, 2); R('#eba653', 4, 8, 1, 1); R('#fbe7b8', 4, 9, 4, 2); R('#3b2418', 5, 10, 2, 1);
        R('#4a74c9', 9, Math.floor(t / 1.6) % 2 ? 10 : 11, 11, 3); R('#3a5aa8', 9, 13, 11, 1);
        g.fillStyle = '#ffe9a8'; for (let i = 0; i < 3; i++) { const p = (t * .35 + i / 3) % 1; g.globalAlpha = Math.sin(p * 3.1416); letters(g, 'Z', X + (9 + p * 7) * S, Y + (9 - p * 3) * S, Math.max(1, S - 1)); } g.globalAlpha = 1;
      }
    }
  }

  // ---------- the plan ----------
  // Each round the way from the hatch to the door is worked out once, over the tiles as they stand: along a tile's
  // top, off its end and down, over a gap by a bridge, down through a tile by a shaft, turned round by a blocker,
  // or up to the door by a stair. The way with the fewest jobs wins. Those jobs are its sites, and a site is given
  // to the first walker that comes to it. Nobody else is given anything: no second stair, no second blocker.
  function route(W) {
    const S = W.S, D = W.door, G = D.tile, mg = 7 * S + 4, FL = {x1: 0, x2: W.w, y: W.gh * S, bot: W.gh * S, floor: 1, i: 0}, surf = [FL];
    for (const r of W.tiles) surf.push({r, x1: r.x, x2: r.x + r.w, y: Math.round(r.y / S) * S, bot: r.y + r.h, i: surf.length});
    const Gs = surf.find(s => s.r === G), Hs = surf.find(s => s.r === W.hatchTile), none = {steps: [], low: FL.y, dir: Math.random() < .5 ? 1 : -1};
    if (!Gs || !Hs) return none;
    const below = (x, y) => { let b = FL; for (const s of surf) if (s.r && x > s.x1 && x < s.x2 && s.y >= y && s.y < b.y) b = s; return b; };
    const best = new Map(), open = [];
    const push = (s, x, d, cost, prev, step) => { const k = s.i * 2 + (d > 0 ? 1 : 0) + ':' + Math.round(x / (8 * S)); if (best.has(k) && best.get(k) <= cost) return; best.set(k, cost); open.push({s, x, d, cost, prev, step}); };
    push(Hs, W.hatch.x, 1, 0, null, null); push(Hs, W.hatch.x, -1, .01, null, null);
    let goal = null, turns = 0;
    while (open.length && turns++ < 4000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
      const n = open.splice(bi, 1)[0], A = n.s, d = n.d;
      if (n.fin || (A === Gs && (D.x - n.x) * d > 0)) { goal = n; break; }
      const spot = U.clamp(n.x + d * 10 * S, A.x1 + 5 * S, A.x2 - 5 * S);
      if (A === Gs) { push(A, n.x, -d, n.cost + 1.3, n, {job: 'block', s: A, x: spot, d}); continue; }  // past the door: turned back to it
      const end = d > 0 ? A.x2 : A.x1;
      if (A.floor || (d > 0 ? end > W.w - mg : end < mg)) push(A, d > 0 ? W.w - mg : mg, -d, n.cost + .05, n, null);  // the screen's side turns them
      else {
        let side = null, nb = null;
        for (const q of surf) {
          if (!q.r || q === A) continue;
          const gap = d > 0 ? q.x1 - end : end - q.x2; if (gap < -S || gap > 40 * S) continue;
          if (q.y < A.y + 2 * S && q.bot > A.y + 2 * S && gap < 14 * S && (side == null || gap < side)) side = gap;
          if (q.y >= A.y - 2 * S && q.y <= A.y + 12 * S && (!nb || gap < nb.gap)) nb = {q, gap};
        }
        const xf = end + d * (side != null ? Math.max(S, side / 2) : 2 * S), land = below(xf, A.y + S);
        if (land.y - A.y <= W.hard) push(land, xf, d, n.cost + .1, n, null);  // off the end and down
        if (nb) push(nb.q, (d > 0 ? nb.q.x1 : nb.q.x2) + d * 6 * S, d, n.cost + 1, n, {job: 'bridge', s: A, d});
      }
      push(A, n.x, -d, n.cost + 1.3, n, {job: 'block', s: A, x: spot, d});
      if (A.r && !W.roomOf.has(A.r)) for (const C of surf) {  // down through it, onto whatever lies under
        if (C === A || C.y <= A.y) continue;
        let a = Math.max(A.x1, C.x1) + 7 * S, b = Math.min(A.x2, C.x2) - 7 * S; if (d > 0) a = Math.max(a, n.x + 12 * S); else b = Math.min(b, n.x - 12 * S);
        if (b < a) continue;
        const x = U.clamp(C === Gs ? D.x - d * 14 * S : (a + b) / 2, a, b), land = below(x, A.bot - S);
        if (land !== C || land.y - A.y > W.hard || (C === Gs && Math.abs(x - D.x) < 9 * S)) continue;
        push(C, x, d, n.cost + 1.6, n, {job: 'dig', s: A, x, d});
      }
      if (A.y > Gs.y + 10) open.push({fin: 1, s: A, x: n.x, d, cost: n.cost + 4 + (A.y - Gs.y) / (20 * S), prev: n, step: {job: 'stair', s: A}});  // up to it
    }
    if (!goal) return none;
    const steps = []; let low = Gs.y, dir = goal.d;
    for (let n = goal; n; n = n.prev) {
      if (n.step) {
        steps.unshift(n.step);
        // the stair's foot is kept in a pen, so the rest are there to go up it
        if (n.step.job === 'stair' && !n.s.floor) { if (n.s.x1 >= mg) steps.push({job: 'block', s: n.s, x: n.s.x1 + 5 * S, d: -1}); if (n.s.x2 <= W.w - mg) steps.push({job: 'block', s: n.s, x: n.s.x2 - 5 * S, d: 1}); }
      }
      if (n.s.y > low) low = n.s.y; dir = n.d;
    }
    for (const j of steps) { j.who = null; j.done = 0; j.tries = 0; }
    return {steps, low, dir};
  }
  /** The one sent to build the stair up to the door. It comes out on the door's tile a little to one side. */
  function lead(c, W, j) {
    const S = W.S, D = W.door, G = D.tile; let s = c.x < D.x ? -1 : 1, tx = D.x + s * 14 * S;
    if (G) { const a = G.x + 5 * S, b = G.x + G.w - 5 * S; if (tx < a || tx > b) { s = -s; tx = D.x + s * 14 * S; if (tx < a || tx > b) tx = D.x; } }
    c.tx = tx; c.site = j; j.who = c; c.role = 'builder'; c.goal = 1; go(c, 'build', W);
  }
  /** Give out the plan's jobs: each site to the first plain walker that comes to it, one builder and one digger at a time. */
  function direct(W) {
    const S = W.S, D = W.door, P = W.plan;
    let builder = false, digger = false;
    for (const c of W.list) { if (c.st === 'build' || c.st === 'pick') builder = true; else if (c.st === 'bore' || c.st === 'delve') digger = true; }
    const plain = c => c.st === 'walk' && !c.fuse && (c.role === 'walker' || c.role === 'floater' || c.role === 'climber');
    for (const j of P.steps) {
      const w = j.who, s = j.s, working = w && !w.dead && (j.job === 'block' ? w.st === 'block' : j.job === 'dig' ? w.st === 'bore' || w.st === 'delve' : w.st === 'build' || w.st === 'pick');
      if (w && !working) {  // it finished, or something stopped it
        if (j.job === 'bridge') { if (w.bair || ++j.tries > 3) j.done = 1; }
        else if (j.job === 'stair') {
          if (!w.dead && w.y <= D.y + S) { j.done = 1; if (w.dir !== (D.x < w.x ? -1 : 1) && D.tile) P.steps.push({job: 'block', s: {x1: D.tile.x, x2: D.tile.x + D.tile.w, y: D.y}, x: w.x + w.dir * 10 * S, d: w.dir, who: null, done: 0, tries: 0}); }  // out on the wrong side of the door: the next one stops there and turns the rest
          else if (++j.tries > 2) j.done = 1; else j.wait = W.t + 5;
        }
        j.who = null;
      }
      if (j.job === 'dig' && !j.done && at(W, j.x, s.bot - 2 * S) !== 1) j.done = 1;  // the shaft is through
      if (j.job === 'bridge' && j.done && j.tries <= 3 && j.fx && at(W, j.fx, j.fy) !== 2) { j.done = 0; j.fx = 0; }  // blown away: once more
      if (j.done || j.who || j.wait > W.t || (builder && (j.job === 'bridge' || j.job === 'stair')) || (digger && j.job === 'dig')) continue;
      for (const c of W.list) {
        if (!plain(c) || c.x <= s.x1 || c.x >= s.x2) continue;
        const on = Math.abs(c.y - s.y) <= 2 * S;
        if (j.job === 'block') { if (!on || c.dir !== j.d || (c.x - j.x) * j.d < 0 || (c.x - j.x) * j.d > 8 * S) continue; c.hold = 1e6; c.site = j; j.who = c; go(c, 'block', W); }
        else if (j.job === 'bridge') {
          if (!on || c.dir !== j.d) continue;
          let brink = 0; for (let d = S; d <= 14 * S && !brink; d += S) { let k = 0; while (k <= UP && !at(W, c.x + c.dir * d, c.y + k * S)) k++; if (k > UP) brink = d; }
          if (!brink) continue;
          j.fx = 0; c.site = j; j.who = c; c.role = 'builder'; go(c, 'build', W); builder = true;
        }
        else if (j.job === 'dig') { if (c.y < s.y - 2 * S || c.y >= s.bot || Math.abs(c.x - j.x) > 2 * S || at(W, c.x, c.y) !== 1) continue; c.site = j; j.who = c; c.role = 'digger'; go(c, 'bore', W); digger = true; }
        else { if (!on) continue; lead(c, W, j); builder = true; }
        break;
      }
    }
    // The ones that fell off the way and lie below it: when there are enough of them, one stair is built up from where most are.
    if (!P.rescue && !builder && (!W.left || P.steps.every(j => j.done || j.who))) {
      const lost = W.list.filter(c => plain(c) && c.y > P.low + 3 * S), need = W.left ? Math.max(3, W.list.length / 4) : 1;
      if (lost.length >= need) {
        const by = {}; let top = null; for (const c of lost) { const k = Math.round(c.y / (4 * S)); (by[k] = by[k] || []).push(c); if (!top || by[k].length > by[top].length) top = k; }
        P.steps.push(P.rescue = {job: 'stair', s: {x1: 0, x2: W.w, y: by[top][0].y, bot: by[top][0].y}, who: null, done: 0, tries: 0});
      }
    }
  }

  /** A new round: the tiles whole again, the hatch over any tile of the top row (never the clock, which has no
   *  face to stand behind) and the door on some other tile, both by chance, so no two rounds are the same walk. */
  function deal(W, ctx) {
    const S = W.S, rnd = Math.random, all = ctx.rects.filter(r => !r.hidden), wide = n => W.tiles.filter(r => r.type !== 'clock' && r.w >= n * S), tiles = wide(38).length > 1 ? wide(38) : wide(16);  // room beside the door for a stair to come out
    const tops = tiles.filter(r => !all.some(o => o !== r && o.y + o.h <= r.y + 2 && o.x < r.x + r.w - 4 && o.x + o.w > r.x + 4));
    const any = a => a[Math.floor(rnd() * a.length)];
    heal(); terrain(W); W.rooms = []; W.roomOf = new Map();
    W.saved = 0; W.wait = .5; W.left = U.clamp(Math.round(+ctx.opts.count || 40), 3, 200); W.dir = rnd() < .5 ? 1 : -1; TEST.round++;
    if (!tiles.length) { W.hatch = {x: W.w * .3, y: 20}; W.door = {x: W.w * .7, y: W.gh * S, tile: null}; W.plan = {steps: [], low: W.gh * S, dir: W.dir}; return; }  // a page with no tiles
    const h = W.hatchTile = W.tiles[ctx.opts.th] || any(tops.length ? tops : tiles), hx = h.x + h.w * (.25 + rnd() * .5);
    let pool = tiles.filter(r => r !== h && r !== W.doorTile && (Math.abs(r.y - h.y) > 6 || Math.abs(r.x + r.w / 2 - hx) > 260));
    if (!pool.length) pool = tiles.filter(r => r !== h); if (!pool.length) pool = tiles;
    const clear = (r, x) => { const y = Math.round(r.y / S) * S; for (let dx = -7; dx <= 7; dx++) for (let k = 1; k <= 10; k++) if (at(W, x + dx * S, y - k * S)) return false; return true; };
    let d = null, dx = 0;
    for (let n = 0; n < 40 && !d; n++) { const r = W.tiles[ctx.opts.td] || any(pool), x = r.x + r.w * (.3 + rnd() * .4); if (clear(r, x) || n === 39) { d = r; dx = x; } }
    W.doorTile = d;
    W.hatch = {x: hx, y: Math.max(2, h.y - 11 * S)}; W.door = {x: dx, y: Math.round(d.y / S) * S, tile: d};
    // the ground the door stands on is never cut away
    { const a = Math.max(0, Math.floor(W.door.x / S) - 7), b = Math.min(W.gw - 1, Math.floor(W.door.x / S) + 7), t = W.door.y / S; for (let y = t; y < Math.min(W.gh, t + 5); y++) W.k.fill(1, y * W.gw + a, y * W.gw + b + 1); }
    furnish(W, h, d);
    W.plan = route(W); W.dir = W.plan.dir;
  }
  /** A climber passing under a gap in the row above goes up it, along the side of the tile beyond. */
  function flue(c, W) {
    const S = W.S, T = c.def.tall * S, px = c.x + c.dir * 2 * S;
    if (at(W, px, c.y - T - 2 * S) !== 1 || at(W, px, c.y - S)) return;
    for (let y = c.y - T - S; y > c.y - T - 12 * S; y -= S) if (at(W, c.x, y) === 1) return;  // no way up here
    c.loose = 1; go(c, 'climb', W);
  }

  HP.fx.add('walkers', {
    label: 'Walkers',
    live: true, z: 1, fps: 12,
    options: [{key: 'count', label: 'How many', type: 'range', min: 3, max: 200, step: 1, default: 40}, SIZE, DROP, {key: 'meet', label: 'React to others', type: 'bool', default: true}],
    create(ctx) {
      heal();  // whatever an earlier round cut
      const S = scale(ctx), W = world(ctx, S); W.opts = ctx.opts;
      W.sh = sheet(ACORN_ART, S); W.props = sheet(PROPS_ART, S); W.font = sheet(FONT_ART, 2); prep(ACORN, W.sh);
      W.bcv = document.createElement('canvas'); W.bcv.width = Math.ceil(W.w); W.bcv.height = Math.ceil(W.h); W.bg = W.bcv.getContext('2d');  // the bricks, painted once each
      const hs = W.tiles.map(r => r.h).sort((a, b) => a - b);
      W.hard = hs.length ? 2 * hs[hs.length >> 1] + 4 * S : 230;  // two tiles of this layout, and a little
      W.drop = interval(ctx, DROP); W.rest = 0; W.fl = 0;
      W.meet = !off(ctx.opts.meet); W.scan = 0; W.thr = []; W.ppl = [];
      deal(W, ctx);
      Object.defineProperty(TEST, 'W', {value: W, configurable: true, enumerable: false});  // for the test page's readout
      return W;
    },
    // a double tap anywhere: every tile whole again at once
    restore(W) { heal(); if (W && W.bg) { terrain(W); W.rooms = []; W.roomOf = new Map(); W.plan = {steps: [], low: W.gh * W.S, dir: W.dir}; } },  // the rooms come back with the next round
    tap(W, x, y) {
      const c = under(W, x, y); if (!c) return;
      if (c.was) c.dir = c.was;  // it had only turned to look at the finger
      fire(c, 'tap', W);  // a wave, then a new job
      return true;
    },
    // a finger anywhere: the ones out walking stop and look that way for a moment; the first two are startled ("!")
    touch(W, x, y) { W.look = {x, y}; let n = 0; for (const c of W.list) if (fire(c, 'notice', W) && n++ < 2) c.bang = W.t + 1.2; },
    // the screen slides off to another dashboard: they are thrown the other way, as off a tablecloth pulled from under them
    swipe(W, dir) { W.jolt = -dir; for (const c of W.list) fire(c, 'jolt', W); },
    draw(g, W, ctx, t, dt) {
      const S = W.S;
      W.t += dt; W.wait -= dt;
      if (W.rest > 0) { W.rest -= dt; if (W.rest <= 0) deal(W, ctx); }  // everybody is in or gone: the next round, somewhere else
      else if (W.wait <= 0 && W.left > 0) {
        const c = make(ACORN, W.sh, W.hatch.x, W.hatch.y + 6 * S, W.dir);
        c.role = pick(ROLES); c.alpha = 0; c.born = W.t; if (c.role === 'bomber') c.fuse = W.t + 5 + Math.random() * 12;
        go(c, 'drop', W); W.list.push(c); W.left--; W.wait = about(W.drop); TEST.out++;
      }
      direct(W);
      if (W.meet && ctx.scene && (W.scan -= dt) <= 0) { W.scan = .25; meet(W, ctx.scene); }  // a few times a second is enough
      let n = 0, busy = false;
      for (const c of W.list) {
        if (W.t - c.born > 240 && !c.fuse && !c.s.solid && !c.s.hold) { c.fuse = W.t + 5; c.dud = 1; }  // shut in somewhere: do not pile up for ever
        if (c.fuse && W.t >= c.fuse && !c.s.end && c.st !== 'hopin' && c.st !== 'home' && c.st !== 'splat') { go(c, 'boom', W); continue; }
        if (c.st === 'walk' && c.role === 'climber') flue(c, W);
        step(c, dt, W); if (c.dead) continue;
        W.list[n++] = c; if (!c.s.solid) busy = true;
        if (c.x < 0 || c.x > W.w) TEST.off++;
      }
      W.list.length = n; if (n > TEST.most) TEST.most = n;
      if (!W.left && !busy && W.rest <= 0) {  // only the ones standing guard are left: they go off one after another
        if (!n) W.rest = 2.5; else W.list.forEach((c, i) => { if (!c.fuse) { c.fuse = W.t + 1.5 + i * .3; c.dud = 1; } });
      }
      W.fl -= dt; if (W.dirty && W.fl <= 0) { W.dirty = 0; W.fl = .25; flush(W); }  // the real tiles get their new holes a few times a second
      g.imageSmoothingEnabled = false;
      g.drawImage(W.bcv, 0, 0, W.w, W.h);
      residents(g, W);
      blit(g, W.props, W.props.ix.door, 0, W.door.x, W.door.y);
      if (W.saved) {  // the count of those who got home, small, over the door
        const y = W.door.y - 9 * S - 1, s = String(W.saved);
        for (let i = 0; i < s.length; i++) blit(g, W.font, +s[i], 0, W.door.x + (i - (s.length - 1) / 2) * 8, y);
      }
      for (const c of W.list) {
        paint(g, c, W);
        if (c.s.hide) continue;
        const left = c.fuse ? Math.ceil(c.fuse - W.t) : 0, top = Math.max(12, c.y - 10 * S - 2);  // kept on the screen for one on the top row
        if (left > 0 && left <= 5) blit(g, W.font, left, 0, c.x, top);  // a bomber's count
        else if (c.bang > W.t && c.st === 'gawk') blit(g, W.font, W.font.ix.bang, 0, c.x, top);
        if (ctx.scene && c.st !== 'taken') { const p = c.post || (c.post = card(c, W)); p.x = c.x; p.y = c.y; p.dir = c.dir; ctx.scene.next.push(p); }  // so other kinds can meet them
      }
      blit(g, W.props, W.props.ix.hatch, 0, W.hatch.x, W.hatch.y + 9 * S);  // over them: they come out from behind its lintel
      drawParts(g, W, dt);
    },
  });

  // =====================================================================================================
  // Sheep: a cream ball of wool with a peach face, two gold horn buds and a rose ear. The whole screen is its
  // pasture: it walks anywhere on it, over the tiles too, and is drawn from the side, the front, the back or at
  // an angle, whichever way it is going. A sheep is a point on a field: it does not use the interpreter above.
  // =====================================================================================================
  const WOOL = ['...wwwwwww..', '..wwwwwwwww.', '.wwwWwwwwwww', 'WwwwwwwWwwww', '.wwWwwwwwwWw', '..wwwwwwwww.', '...wWwwwWw..'];
  const HEAD = ['.www..', 'yyppp.', 'lpeppp', 'lpepPp', 'pphppp', '.pppp.'], SHUT = ['.www..', 'yyppp.', 'lppppp', 'leepPp', 'pphppp', '.pppp.'];
  const FACE = ['.wwww.', 'yppppy', 'peppep', 'peppep', 'hpPPph', '.pppp.'], FSHUT = ['.wwww.', 'yppppy', 'pppppp', 'eeppee', 'hpPPph', '.pppp.'];
  const LEGS = ['P.P...P.P', 'P.P...P.P'], TUCK = [['PP'], 12, 13];
  // seen from the front or the back the body is a short round ball; at an angle it is between that and the side
  const FB = ['..wwwwww..', '.wwwWwwww.', 'wwwwwwwwWw', 'wwWwwwwwww', 'wwwwwwwwww', 'wwwwwwwWww', 'wWwwwwwwww', '.wwwwwwww.', '..wwwwww..'];
  const AB = ['..wwwwwww..', '.wwwWwwwww.', 'wwwwwwwwwWw', 'wwWwwwwwwww', 'wwwwwwwWwww', 'wwwwwwwwwww', '.wwWwwwwww.', '...wwwwww..'];
  // the face three quarters on; the top of the head from behind, and from behind at an angle (an ear and the edge of a cheek)
  const Q = ['.wwww.', 'lypppy', 'lpepep', 'ppepep', '.pphPp', '..ppp.'], POLL = ['.ywwy.', 'lwwwwl', '.wwww.'], QB = ['..wwy.', '.wwwwy', 'lwwwwp', '.wwwpp', '..ww..'];
  const TAIL = ['.WW.', 'WWWW', '.WW.', '.PP.'];
  // legs standing and at each of the two steps: four from the side and at an angle, two from the front and the back
  const L4 = [LEGS, ['P.P...P.P', 'P.....P..'], ['P.P...P.P', '..P.....P']], L3 = [['P.P..P.P', 'P.P..P.P'], ['P.P..P.P', 'P....P..'], ['P.P..P.P', '..P....P']];
  const L2 = [['P....P', 'P....P'], ['P....P', 'P.....'], ['P....P', '.....P']];
  // The five drawn facings: east (side on), south-east, south (toward the viewer), north-east, north (away from the
  // viewer). West, south-west and north-west are the mirrored row of the sheet.
  const DIRS = ['E', 'SE', 'S', 'NE', 'N'];
  /** The frames of one facing, from its parts. d: {b: body, h: head, t: tail, back: the head is beyond the body, lx, ly: where the legs go,
   *  L: the legs, g: how far the head moves to graze, c: and to charge (the ram)}. */
  function facing(o, F, d) {
    const at = m => [d.h[0], d.h[1] + m[0], d.h[2] + m[1]];
    const fr = (head, legs) => { const a = [d.b]; if (d.t) a.push(d.t); a.push([legs, d.lx, d.ly]); if (d.back) a.unshift(head); else a.push(head); return a; };
    o['stand' + F] = fr(d.h, d.L[0]); o['walk0' + F] = fr(d.h, d.L[1]); o['walk1' + F] = fr(d.h, d.L[2]);
    o['graze0' + F] = fr(at(d.g), d.L[0]); o['graze1' + F] = fr(at([d.g[0], d.g[1] - 1]), d.L[0]);
    if (d.c) { o['charge0' + F] = fr(at(d.c), d.L[1]); o['charge1' + F] = fr(at([d.c[0], d.c[1] + 1]), d.L[2]); }
  }
  const SHEEP_ART = {w: 18, h: 14,
    pal: {w: '#fffaf0', W: '#e6d1b3', p: '#f0a878', P: '#c97b52', e: '#3a2233', l: '#c7798d', y: '#f6c64f', h: '#f78f8f'},
    frames: {
      // lying down, from the side and from the front; asleep; and being stroked (eyes shut, a little wriggle of the wool)
      lieE: [[WOOL, 1, 7], [HEAD, 11, 5], TUCK],
      sleep0E: [[WOOL, 1, 7], [SHUT, 11, 8]],
      sleep1E: [[['...wwwwwww..'], 1, 6], [WOOL, 1, 7], [SHUT, 11, 8]],
      pet0E: [[WOOL, 1, 7], [SHUT, 11, 5], TUCK],
      pet1E: [[WOOL, 1, 6], [SHUT, 11, 5], TUCK],
      lieS: [[FB, 4, 5], [FACE, 6, 8]],
      sleep0S: [[FB, 4, 5], [FSHUT, 6, 8]],
      sleep1S: [[['..wwwwww..'], 4, 4], [FB, 4, 5], [FSHUT, 6, 8]],
    }};
  facing(SHEEP_ART.frames, 'E', {b: [WOOL, 1, 5], h: [HEAD, 11, 3], lx: 4, ly: 12, L: L4, g: [1, 5]});
  facing(SHEEP_ART.frames, 'SE', {b: [AB, 2, 4], h: [Q, 10, 6], lx: 4, ly: 12, L: L3, g: [1, 2]});
  facing(SHEEP_ART.frames, 'S', {b: [FB, 4, 3], h: [FACE, 6, 6], lx: 6, ly: 12, L: L2, g: [0, 2]});
  facing(SHEEP_ART.frames, 'NE', {b: [AB, 2, 4], h: [QB, 10, 1], t: [['W', 'W'], 1, 8], back: 1, lx: 4, ly: 12, L: L3, g: [1, 3]});
  facing(SHEEP_ART.frames, 'N', {b: [FB, 4, 3], h: [POLL, 6, 1], t: [TAIL, 7, 7], back: 1, lx: 6, ly: 12, L: L2, g: [0, 3]});
  // The ram: the same animal a size up, with curled horns, and a frame or two of its own in every facing for going
  // at something head down.
  const RWOOL = ['....wwwwwwww...', '..wwwwwwwwwwww.', '.wwwwWwwwwwwwww', 'wwwwwwwwwwWwwww', 'WwwwwwwwwwwwwWw', 'wwwwWwwwwwwwwww', '.wwwwwwwWwwwwww', '..wwwwwwwwwwww.', '....wWwwwwWww..'];
  const rhead = (a, b, c) => ['..www...', '.yyypp..', 'yHHyppp.', a, b, c, '....pppp', '....ppp.'];
  const RHEAD = rhead('yHlypepp', 'yHyypePp', '.yy.phpp'), RSHUT = rhead('yHlypppp', 'yHyyeePp', '.yy.phpp');
  const RFACE = ['..wwww..', 'yyyppyyy', 'yHppppHy', 'yyeppeyy', '.yeppey.', '..hPPh..', '..pppp..', '...pp...'], RFSHUT = ['..wwww..', 'yyyppyyy', 'yHppppHy', 'yyppppyy', '.eeppee.', '..hPPh..', '..pppp..', '...pp...'];
  const RFB = ['...wwwwwww...', '.wwwwWwwwwww.', 'wwwwwwwwwwWww', 'wwWwwwwwwwwww', 'wwwwwwwwWwwww', 'wwwwwwwwwwwww', 'wWwwwwwwwwwWw', '.wwwwwwwwwww.', '.wwwWwwwwwww.', '..wwwwwwwww..'];
  const RAB = ['...wwwwwwww...', '.wwwwWwwwwwww.', 'wwwwwwwwwwwWww', 'wwWwwwwwwwwwww', 'wwwwwwwWwwwwww', 'wwwwwwwwwwwwww', 'wWwwwwwwwwWwww', '.wwwwwwwwwwwww', '..wwwWwwwwwww.', '....wwwwwwww..'];
  const RQ = ['..wwww..', '.yyppyyy', 'yHHpppHy', 'yHypepey', '.yypepe.', '...phPp.', '...pppp.', '....pp..'];
  const RPOLL = ['.yy.ww.yy.', 'yHHwwwwHHy', 'yHywwwwyHy', '.yywwwwyy.'], RQB = ['..wwyy..', '.wwwyHy.', 'lwwwyHyp', '.wwwwyyp', '..wwwpp.'];
  const RL3 = [['P.P....P.P', 'P.P....P.P'], ['P.P....P.P', 'P......P..'], ['P.P....P.P', '..P......P']], RL2 = [['P.......P', 'P.......P'], ['P.......P', 'P........'], ['P.......P', '........P']];
  const RTUCK = [['PP'], 15, 16];
  const RAM_ART = {w: 23, h: 17, pal: Object.assign({H: '#a9762c'}, SHEEP_ART.pal),
    frames: {
      lieE: [[RWOOL, 1, 8], [RHEAD, 14, 6], RTUCK],
      sleep0E: [[RWOOL, 1, 8], [RSHUT, 14, 9]],
      sleep1E: [[['....wwwwwwww...'], 1, 7], [RWOOL, 1, 8], [RSHUT, 14, 9]],
      pet0E: [[RWOOL, 1, 8], [RSHUT, 14, 6], RTUCK],
      pet1E: [[RWOOL, 1, 7], [RSHUT, 14, 6], RTUCK],
      lieS: [[RFB, 5, 7], [RFACE, 7, 9]],
      sleep0S: [[RFB, 5, 7], [RFSHUT, 7, 9]],
      sleep1S: [[['...wwwwwww...'], 5, 6], [RFB, 5, 7], [RFSHUT, 7, 9]],
    }};
  facing(RAM_ART.frames, 'E', {b: [RWOOL, 1, 6], h: [RHEAD, 14, 4], lx: 6, ly: 15, L: L4, g: [1, 5], c: [1, 3]});
  facing(RAM_ART.frames, 'SE', {b: [RAB, 2, 5], h: [RQ, 13, 7], lx: 5, ly: 15, L: RL3, g: [1, 2], c: [1, 2]});
  facing(RAM_ART.frames, 'S', {b: [RFB, 5, 5], h: [RFACE, 7, 7], lx: 7, ly: 15, L: RL2, g: [0, 2], c: [0, 2]});
  facing(RAM_ART.frames, 'NE', {b: [RAB, 2, 5], h: [RQB, 13, 2], t: [['W', 'W'], 1, 10], back: 1, lx: 5, ly: 15, L: RL3, g: [1, 4], c: [1, 3]});
  facing(RAM_ART.frames, 'N', {b: [RFB, 5, 5], h: [RPOLL, 6, 2], t: [TAIL, 9, 10], back: 1, lx: 7, ly: 15, L: RL2, g: [0, 4], c: [0, 2]});
  const POSES = ['stand', 'walk0', 'walk1', 'graze0', 'graze1', 'charge0', 'charge1', 'lie', 'sleep0', 'sleep1', 'pet0', 'pet1'];
  /** A flock animal's sheet, and for every pose the frame of each drawn facing. What is drawn from the side and the front only is borrowed by the others. */
  function herd(art, S) {
    const sh = sheet(art, S); sh.at = {};
    for (const p of POSES) sh.at[p] = DIRS.map(F => { for (const k of [F, F === 'SE' ? 'S' : 'E', 'E']) if (sh.ix[p + k] != null) return sh.ix[p + k]; return sh.ix.standE; });
    return sh;
  }
  // the speech bubble, the z's of its sleep and the tufts it eats
  const BUBBLE = ['.wwwwwwwwwwwww.'].concat(new Array(5).fill('wwwwwwwwwwwwwww'), ['.wwwwwwwwwwwww.', '...ww..........', '...w...........']);
  const EXTRA_ART = {w: 15, h: 9, pal: {w: '#fffdf6', k: '#3a2233', z: '#e6f0ff', g: '#8fd85a', G: '#4fa63c', r: '#ff6b8a'},
    frames: {
      baa: [[BUBBLE, 0, 0], [glyph('44757', 'k'), 2, 1], [glyph('06357', 'k'), 6, 1], [glyph('06357', 'k'), 10, 1]],
      z: [[glyph('07247', 'z'), 6, 4]],
      Z: [[glyph('71247', 'z'), 6, 4]],
      tuft2: [[['.g..g', 'g.gg.', 'gGgGg'], 5, 6]],
      tuft1: [[['.g.g.', 'gGgGg'], 5, 7]],
      stub: [[['G.G.G'], 5, 8]],
      bang: [[glyph('22202', 'w'), 6, 3]],
      heart: [[['r.r', 'rrr', '.r.'], 6, 5]],
    }};

  let audio = null;
  /** A short bleat: a buzzy note that sags, with the quick wobble that makes it a "baa" rather than a beep. */
  function bleat() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      audio = audio || new AC(); if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime, o = audio.createOscillator(), l = audio.createOscillator(), lg = audio.createGain(), f = audio.createBiquadFilter(), v = audio.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(420 + Math.random() * 70, t); o.frequency.linearRampToValueAtTime(330, t + .5);
      l.frequency.value = 11; lg.gain.value = 24; l.connect(lg); lg.connect(o.frequency);
      f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.2;
      v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(.16, t + .04); v.gain.setValueAtTime(.16, t + .34); v.gain.linearRampToValueAtTime(0, t + .55);
      o.connect(f); f.connect(v); v.connect(audio.destination); o.start(t); l.start(t); o.stop(t + .6); l.stop(t + .6);
    } catch (e) { /* no sound on this device: the bubble still shows */ }
  }

  // Trick: about how long between a sheep's frolics (a short run with a skip in it); in between it walks, grazes and
  // lies down. Each sheep has a time for its next one (c.next). None at night.
  const TRICK = {key: 'trick', label: 'Trick interval', type: 'range', min: 3, max: 120, step: 1, unit: 's', default: 12};
  const FLOCK = HP.fx.sheepTest = {flee: 0, charges: 0, butts: 0, won: 0, bites: 0, W: null};  // counts, for checks
  const WALK = 24, RUN = 84, CHARGE = 170;  // pixels a second at the large size
  const SHADE = 'rgba(8,6,18,.16)';
  // for each eighth of the compass, from east round by south: which drawn facing, and whether it is the mirrored one
  const OCT = [[0, 0], [1, 0], [2, 0], [1, 1], [0, 1], [3, 1], [4, 0], [3, 0]];
  const span = (a, b) => a + Math.random() * (b - a);
  const mood = (c, m, dur) => { c.mode = m; c.T = 0; c.dur = dur || 0; };
  /** On the grass where others can meet it: not in a hand, not carried off. */
  const calm = c => c.mode !== 'held' && c.mode !== 'taken' && c.mode !== 'gone' && c.mode !== 'back';
  /** The ram about its business with a threat. */
  const duty = c => c.mode === 'charge' || c.mode === 'stamp' || c.mode === 'ward';
  /** Doing something a finger, a stroke or a new plan may break into. */
  const idle = c => c.mode === 'idle' || c.mode === 'walk' || c.mode === 'graze' || c.mode === 'lie' || c.mode === 'munch' || c.mode === 'gawk';
  /** Give up the tuft it had its eye on. */
  const release = c => { if (c.spot) { c.spot.by = null; c.spot = null; } };
  /** Turn to look along dx, dy. The facing is kept until the way has clearly swung into the next eighth, so it does not flicker between two. */
  function turn(c, dx, dy) {
    if (dx * dx + dy * dy < 1) return;
    const a = Math.atan2(dy, dx); let d = a - c.o * .7854; d -= Math.round(d / 6.2832) * 6.2832;
    if (Math.abs(d) > .55) c.o = Math.round(a / .7854) & 7;
    if (Math.abs(dx) > Math.abs(dy) * .4) c.dir = dx < 0 ? -1 : 1;
  }
  /** A step toward x, y at v pixels a second. True once it is there. */
  function stride(c, x, y, v, dt, noturn) {
    const dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy); if (d < 3) return true;
    if (!noturn) turn(c, dx, dy);
    const st = Math.min(d, v * dt); c.x += dx / d * st; c.y += dy / d * st; return false;
  }
  /** Set off for x, y at a walk. */
  function head(c, W, x, y) { c.tx = U.clamp(x, W.x1, W.x2); c.ty = U.clamp(y, W.y1, W.y2); mood(c, 'walk', Math.hypot(c.tx - c.x, c.ty - c.y) / (WALK * W.S / 3) + 2); }
  /** A tuft of grass somewhere on the field, at fx, fy of its width and height. n: 3 full, 1 bitten short, 0 stubble. */
  const tuft = (W, fx, fy) => ({x: W.x1 + 10 + (W.x2 - W.x1 - 20) * fx, y: W.y1 + (W.y2 - W.y1) * fy, n: 3, back: 0, by: null});

  /** What to do next, on coming to rest. */
  function choose(c, W) {
    const k = W.S / 3, sc = W.ctx.scene, r = Math.random();
    if (W.ctx.env.night) {
      // night: to its own place in the huddle, and down. A few stay on their feet.
      const a = c.i * 2.4, rad = 26 * Math.sqrt(c.i + 1) * k, x = W.rx + Math.cos(a) * rad * 1.3, y = W.ry + Math.sin(a) * rad * .8;
      if (Math.hypot(x - c.x, y - c.y) > 30 * k && c.tries < 2) { c.tries++; head(c, W, x, y); }  // twice at most: if the others are in the way, here will do
      else if (c.wake) { if (r < .3) c.o = Math.floor(Math.random() * 8); mood(c, 'idle', span(3, 8)); }
      else mood(c, 'lie', span(2, 5));
      return;
    }
    c.tries = 0;
    if (W.t >= c.next) { c.next = W.t + about(W.trick); c.tx = U.clamp(c.x + span(-150, 150) * k, W.x1, W.x2); c.ty = U.clamp(c.y + span(-100, 100) * k, W.y1, W.y2); mood(c, 'frolic', span(1, 2)); return; }
    // something to eat right beside it, that lets itself be taken: sometimes a bite
    const f = sc && Math.random() < .25 ? sc.near('food', c.x, c.y, 60) : null;
    if (f && U.act(f, 'take', c.post)) { turn(c, f.x - c.x, f.y - c.y); mood(c, 'munch', span(2, 3.2)); return; }
    if (r < .15) {  // the nearest tuft nobody else is at
      let sp = null, bd = 400 * k;
      for (const s of W.spots) { const d = Math.hypot(s.x - c.x, s.y - c.y); if (s.n > 0 && !s.by && d < bd) { bd = d; sp = s; } }
      if (sp) { c.spot = sp; sp.by = c; head(c, W, sp.x + (c.x < sp.x ? -8 : 8) * W.S, sp.y + 2); return; }
    }
    if (r < .75) {  // a stroll: anywhere about, but back toward the middle of the flock if it has drifted far from it
      const far = Math.hypot(W.cx - c.x, W.cy - c.y) > 220 * k ? .7 : .25, a = Math.random() * 6.2832, rad = span(40, 170) * k;
      head(c, W, c.x + (W.cx - c.x) * far + Math.cos(a) * rad, c.y + (W.cy - c.y) * far + Math.sin(a) * rad * .7);
    }
    else if (r < .85) mood(c, 'graze', span(3, 6));
    else if (r < .91) mood(c, 'lie', span(5, 12));
    else { c.o = Math.floor(Math.random() * 8); mood(c, 'idle', span(1.5, 4)); }  // a look about
  }

  // ---------- the ram ----------
  // One to a flock. It lives as the sheep do, and keeps watch: when something the others run from (tag "threat") comes
  // within 450 px of any of the flock, it turns to it, puts its head down and goes straight at it across the field.
  // Where it gets to, whatever it is is told to be off (its scare verb). If that does nothing, the ram plants itself
  // between the thing and the flock, glares, and goes again every couple of seconds.
  function guard(c, W, dt) {
    const k = W.S / 3, sc = W.ctx.scene;
    if (c.mode === 'stamp') { if (c.T > 1.2) head(c, W, W.cx, W.cy); return; }
    // the threat it is after, found again near where it last was (its kind may post a new actor every frame)
    const f = c.foe = c.foe && sc && sc.near('threat', c.foe.x, c.foe.y, 120) || null;
    if (!f || Math.hypot(f.x - W.cx, f.y - W.cy) > 700) { c.wary = W.t + 1; head(c, W, W.cx, W.cy); return; }  // gone, or far off: back to the flock
    const dx = f.x - c.x, dy = f.y - c.y, d = Math.hypot(dx, dy);
    turn(c, dx, dy);
    if (c.mode === 'charge') {
      if (c.T < .25) return;  // a breath with its head down first
      if (d > 60) { const st = Math.min(d - 50, CHARGE * k * dt); c.x += dx / d * st; c.y += dy / d * st; return; }
      FLOCK.butts++; burst(W, c.x + dx / (d || 1) * 10 * W.S, c.y - 5 * W.S, 4, ['#fffdf6', '#ffe45c'], 80, {star: 1, life: .4});
      if (U.act(f, 'scare', c.post) === true) { FLOCK.won++; c.say = W.t + 1.1; c.wary = W.t + 4; mood(c, 'stamp'); }  // it is off: a stamp and a "baa" after it
      else mood(c, 'ward');
      return;
    }
    const bx = W.cx - f.x, by = W.cy - f.y, b = Math.hypot(bx, by) || 1, r = Math.min(70, b / 2);
    stride(c, U.clamp(f.x + bx / b * r, W.x1, W.x2), U.clamp(f.y + by / b * r, W.y1, W.y2), 150 * k, dt, true);
    if (c.T > 2) mood(c, 'charge');
  }

  /** One frame of an animal's life. */
  function live(c, W, dt) {
    const S = W.S, k = S / 3, sc = W.ctx.scene, night = !!W.ctx.env.night;
    c.T += dt; c.f += dt; if (c.hop > 0) c.hop -= dt;
    let m = c.mode;
    if (m === 'held') { if (W.t - c.heldT > .3) mood(c, 'idle', 1); return; }  // let go when the finger stops moving or lifts
    // carried off by another kind: toward it, shrinking out of sight; and after a while back where it was, or where it was told
    if (m === 'taken') { stride(c, c.tx, c.ty, 260, dt); c.k = Math.max(0, 1 - c.T / .7); if (c.T >= .7) mood(c, 'gone', c.secs); return; }
    if (m === 'gone') { if (c.T > c.dur) { c.x = U.clamp(c.ox, W.x1, W.x2); c.y = U.clamp(c.oy, W.y1, W.y2); mood(c, 'back'); } return; }
    if (m === 'back') { c.k = Math.min(1, c.T / .4); if (c.T >= .4) { c.k = 1; mood(c, 'idle', 1); } return; }
    if (c.ram) { if (duty(c)) { guard(c, W, dt); return; } }
    else {
      // something the flock runs from, wherever on the field it is: off, for as long as it is near
      const f = sc ? sc.near('threat', c.x, c.y, m === 'flee' ? 270 : 220) : null;
      if (f) { c.fx = f.x; c.fy = f.y; if (c.fear < .4) c.fear = .4; if (m !== 'flee') { release(c); mood(c, 'flee'); FLOCK.flee++; m = 'flee'; } }
    }
    if (m === 'flee') {
      if ((c.fear -= dt) <= 0) { mood(c, 'idle', span(1, 2.5)); return; }
      // away from it and toward the others (a flock bunches as it runs), and in from a fence it would run along
      let ax = c.x - c.fx, ay = c.y - c.fy; const d = Math.hypot(ax, ay) || 1, bx = W.cx - c.x, by = W.cy - c.y, b = Math.hypot(bx, by);
      ax /= d; ay /= d; if (b > 30 * k) { ax += .7 * bx / b; ay += .7 * by / b; }
      if (c.x < W.x1 + 60) ax += 1 - (c.x - W.x1) / 60; else if (c.x > W.x2 - 60) ax -= 1 - (W.x2 - c.x) / 60;
      if (c.y < W.y1 + 60) ay += 1 - (c.y - W.y1) / 60; else if (c.y > W.y2 - 60) ay -= 1 - (W.y2 - c.y) / 60;
      const n = Math.hypot(ax, ay) || 1; turn(c, ax, ay); c.x += ax / n * RUN * k * dt; c.y += ay / n * RUN * k * dt;
    }
    else if (m === 'idle') { if (c.T > c.dur) choose(c, W); }
    else if (m === 'walk') {
      if (stride(c, c.tx, c.ty, WALK * k, dt) || c.T > c.dur) {
        const sp = c.spot;
        if (sp && sp.n > 0 && Math.hypot(sp.x - c.x, sp.y - c.y) < 14 * S) { c.o = sp.x < c.x ? 4 : 0; c.dir = sp.x < c.x ? -1 : 1; c.bite = 2.5; mood(c, 'graze', 12); }
        else { release(c); mood(c, 'idle', span(1.2, 3.5)); }
      }
    }
    else if (m === 'graze') {
      const sp = c.spot;
      // a tuft is eaten down to stubble in three bites, and grows back after a minute or two
      if (sp && (c.bite -= dt) <= 0) { c.bite = 2.5; FLOCK.bites++; if (--sp.n <= 0) { sp.n = 0; sp.back = W.t + span(45, 95); c.dur = 0; } }
      if (c.T > c.dur) { release(c); mood(c, 'idle', span(1, 3)); }
    }
    else if (m === 'frolic') { if (stride(c, c.tx, c.ty, RUN * k, dt) || c.T > c.dur) mood(c, 'idle', span(1, 2)); }
    else if (m === 'lie') { if (c.T > c.dur) { if (night ? !c.wake : Math.random() < .3) mood(c, 'sleep', span(9, 26)); else mood(c, 'idle', span(1, 3)); } }
    else if (m === 'sleep') {
      if ((c.z -= dt) <= 0) { c.z = 2; W.parts.push({x: c.x + c.dir * 7 * S, y: c.y - 6 * S, vx: c.dir * 5, vy: -13, g: 0, t: 0, life: 2.2, img: Math.floor(c.T) & 1 ? W.ex.ix.Z : W.ex.ix.z}); }
      if (c.T > c.dur && !night) mood(c, 'idle', span(1, 2));
    }
    else if (m === 'pet') {
      // Somebody is stroking it (another kind calls pet() on what the sheep posts, every frame). It sits where it is
      // with its eyes shut and wriggles; each stroke starts the three seconds again, and when they run out it goes
      // back to its own life.
      if (Math.random() < dt / 3) W.parts.push({x: c.x + (Math.random() - .5) * 8 * S, y: c.y - 9 * S, vx: 0, vy: -14, g: 0, t: 0, life: 1.3, img: W.ex.ix.heart});
      else if (Math.random() < dt / 10) c.say = W.t + 1.1;  // a soft "baa": the bubble only, no jump, no sound
      if (c.T > 3) mood(c, 'idle', 1);
    }
    else if (c.T > (m === 'gawk' ? 1.5 : c.dur)) mood(c, 'idle', span(.5, 1.5));  // a look at the finger, or a chew, is over
  }

  /** Draw one animal: a soft shadow on the grass, and over it the frame for what it is doing and which way it faces. */
  function show(g, c, W) {
    const m = c.mode; if (m === 'gone') return;
    const S = W.S, sh = c.sh, o = OCT[c.o], f = c.f; let p = 'stand', lift = 0;
    if (m === 'walk') p = ['walk0', 'stand', 'walk1', 'stand'][Math.floor(f / .16) & 3];
    else if (m === 'flee' || m === 'frolic' || m === 'held' || m === 'taken' || m === 'ward') p = Math.floor(f / .1) & 1 ? 'walk1' : 'walk0';
    else if (m === 'graze' || m === 'munch') p = Math.floor(f / .22) & 1 ? 'graze1' : 'graze0';
    else if (m === 'charge' || m === 'stamp') p = Math.floor(f / (m === 'stamp' ? .16 : .1)) & 1 ? 'charge1' : 'charge0';
    else if (m === 'lie') p = 'lie';
    else if (m === 'sleep') p = Math.floor(c.T) & 1 ? 'sleep1' : 'sleep0';
    else if (m === 'pet') p = (Math.floor(f / .3) & 3) === 2 ? 'pet1' : 'pet0';
    if (c.hop > 0) lift = Math.sin(3.1416 * (1 - c.hop / .5)) * 6 * S; else if (m === 'frolic') lift = Math.abs(Math.sin(f * 9)) * 3 * S;
    const slim = o[0] === 2 || o[0] === 4, rx = (c.ram ? 8.5 : 7) * S * (slim ? .75 : 1) * c.k, ry = 2.2 * S * c.k, i = sh.at[p][o[0]];
    g.globalAlpha = c.k; g.fillStyle = SHADE;
    g.beginPath(); g.ellipse(c.x, c.y - S, rx, ry, 0, 0, 6.2832); g.fill();  // two plain fills, the inner one smaller: a soft edge without a blur
    g.beginPath(); g.ellipse(c.x, c.y - S, rx * .72, ry * .62, 0, 0, 6.2832); g.fill();
    if (c.k < 1) g.drawImage(sh.c, i * sh.cw, o[1] ? sh.ch : 0, sh.cw, sh.ch, Math.round(c.x - sh.cw * c.k / 2), Math.round(c.y - sh.ch * c.k), sh.cw * c.k, sh.ch * c.k);
    else blit(g, sh, i, o[1], c.x, c.y - lift);
    g.globalAlpha = 1;
  }
  /** The animal under the finger: the one in front first. */
  function hit(W, x, y) {
    for (let i = W.list.length - 1; i >= 0; i--) { const c = W.list[i], hw = (c.ram ? 9 : 7) * W.S; if (calm(c) && x >= c.x - hw && x <= c.x + hw && y >= c.y - (c.ram ? 14 : 11) * W.S && y <= c.y + W.S) return c; }
    return null;
  }

  // ---------- what the flock shows the other kinds ----------
  const SHEEP_TAGS = ['creature', 'animal'], RAM_TAGS = ['creature', 'animal', 'guard'];
  /** Frightened off from `by`: a run the other way. */
  function bolt(c, by) {
    if (!by || !calm(c)) return false;
    c.fx = isFinite(by.x) ? +by.x : c.x - c.dir; c.fy = isFinite(by.y) ? +by.y : c.y; c.fear = 1.5;
    if (c.mode !== 'flee') { release(c); mood(c, 'flee'); }
    return true;
  }
  /** Carried off toward `by` for by.secs seconds; set down at by.out, or where it was. */
  function borne(c, by) {
    if (!by || !calm(c)) return false;
    const o = by.out; c.secs = U.clamp(+by.secs || 3, .5, 120);
    c.tx = isFinite(by.x) ? +by.x : c.x; c.ty = isFinite(by.y) ? +by.y : c.y; c.ox = o && isFinite(o.x) ? +o.x : c.x; c.oy = o && isFinite(o.y) ? +o.y : c.y;
    release(c); mood(c, 'taken'); return true;
  }
  /** Made once for each, moved each frame. The ram stands its ground and is too heavy to carry: it offers neither. */
  function flockCard(c, W) {
    const p = {kind: c.ram ? 'ram' : 'sheep', tags: c.ram ? RAM_TAGS : SHEEP_TAGS, view: 'top', x: c.x, y: c.y, h: (c.ram ? 11 : 9) * W.S, dir: c.dir, hid: false,
      pet() { if (c.mode === 'pet') c.T = 0; else if (idle(c) || c.mode === 'sleep') { release(c); mood(c, 'pet'); } }};
    if (!c.ram) { p.scare = by => bolt(c, by); p.carry = by => borne(c, by); }
    return p;
  }

  HP.fx.add('sheep', {
    label: 'Sheep',
    live: true, z: 1, fps: 12, covers: true,
    options: [{key: 'count', label: 'How many', type: 'range', min: 1, max: 20, step: 1, default: 6}, {key: 'sound', label: 'Sound', type: 'bool', default: false}, SIZE, TRICK, {key: 'ram', label: 'Ram', type: 'bool', default: true}],
    create(ctx) {
      const S = scale(ctx), k = S / 3, r = ctx.rand, W = FLOCK.W = {ctx, S, w: ctx.w, h: ctx.h, t: 0, list: [], parts: [], spots: [], grip: null, ram: null, scan: 0, grow: 12, dark: false};
      // the field: the whole screen, less a margin so that nobody stands half off it
      W.x1 = 10 * S; W.x2 = ctx.w - 10 * S; W.y1 = 18 * S; W.y2 = ctx.h - 2 * S;
      W.sh = herd(SHEEP_ART, S); W.ex = sheet(EXTRA_ART, S); W.trick = interval(ctx, TRICK);
      // tufts of grass anywhere on the field: the first ones the same on every tablet, later ones by chance
      for (let i = 0; i < 10; i++) W.spots.push(tuft(W, r(), r()));
      const n = U.clamp(Math.round(+ctx.opts.count || 6), 1, 20), ram = !off(ctx.opts.ram);
      W.cx = W.rx = ctx.w * (.35 + .3 * r()); W.cy = W.ry = ctx.h * (.4 + .25 * r());
      for (let i = 0; i < n + (ram ? 1 : 0); i++) {
        const c = {ram: i === n, sh: W.sh, i, x: U.clamp(W.cx + (r() - .5) * 560 * k, W.x1, W.x2), y: U.clamp(W.cy + (r() - .5) * 380 * k, W.y1, W.y2), o: Math.floor(r() * 8), dir: 1, mode: 'idle', T: 0, dur: r() * 3, f: r(), k: 1,
          tx: 0, ty: 0, fx: 0, fy: 0, fear: 0, spot: null, bite: 0, z: 0, hop: 0, say: 0, bang: 0, next: about(W.trick) * (.5 + i), wake: i === n || i % 5 === 4, secs: 0, ox: 0, oy: 0, heldT: 0, tries: 0, foe: null, wary: 0, post: null};
        if (c.ram) { c.sh = W.rsh = herd(RAM_ART, S); W.ram = c; }
        c.dir = OCT[c.o][1] ? -1 : 1; c.post = flockCard(c, W); W.list.push(c);
      }
      return W;
    },
    tap(W, x, y) {
      // a sheep that stands on a tile does not take the tile's tap: the dashboard comes first
      if (W.ctx.rects.some(r => !r.hidden && !r.flat && x > r.x + r.w * .15 && x < r.x + r.w * .85 && y > r.y + r.h * .15 && y < r.y + r.h * .85)) return;
      const c = hit(W, x, y); if (!c) return;
      if (c.mode !== 'pet' && !duty(c)) {  // "baa", and a jump
        c.say = W.t + 1.1; c.hop = .5; const s = W.ctx.opts.sound; if (s && s !== 'false') bleat();
        if (idle(c) || c.mode === 'sleep') { release(c); mood(c, 'idle', 1); }
      }
      return true;
    },
    // a finger anywhere: it stops and looks that way ("!")
    touch(W, x, y) { for (const c of W.list) if (idle(c)) { release(c); turn(c, x - c.x, y - c.y); mood(c, 'gawk'); c.bang = W.t + 1.2; } },
    // the screen slides off to another dashboard: they run the other way
    swipe(W, dir) { for (const c of W.list) if (!c.ram || !duty(c)) bolt(c, {x: c.x + dir * 100, y: c.y}); },
    // a finger sliding over it picks it up; it is let go when the finger stops moving or lifts
    drag(W, x, y) {
      let c = W.grip && W.grip.mode === 'held' ? W.grip : null;
      if (!c) { c = hit(W, x, y); if (!c || duty(c)) return; release(c); mood(c, 'held'); W.grip = c; }
      c.x = U.clamp(x, 8, W.w - 8); c.y = y + (c.ram ? 11 : 9) * W.S / 2; c.heldT = W.t;
    },
    draw(g, W, ctx, t, dt) {
      const S = W.S, k = S / 3, L = W.list, ram = W.ram, sc = ctx.scene, night = !!ctx.env.night; W.t += dt;
      // the middle of the flock: what they drift toward, bunch on when frightened, and what the ram stands in front of
      let n = 0, sx = 0, sy = 0;
      for (const c of L) if (!c.ram && calm(c)) { n++; sx += c.x; sy += c.y; }
      if (n) { W.cx = sx / n; W.cy = sy / n; } else if (ram) { W.cx = ram.x; W.cy = ram.y; }
      // night falls: where they are is where they gather
      if (night && !W.dark) { W.rx = U.clamp(W.cx, W.x1 + 100 * k, W.x2 - 100 * k); W.ry = U.clamp(W.cy, W.y1 + 60 * k, W.y2 - 60 * k); for (const c of L) if (c.mode === 'idle') c.dur = Math.min(c.dur, c.T + span(0, 3)); }
      W.dark = night;
      // the ram's watch, a few times a second: is there a threat within 260 px of any of the flock?
      if (ram && sc && (W.scan -= dt) <= 0) {
        W.scan = .3;
        if (calm(ram) && !duty(ram) && W.t >= ram.wary) for (const c of L) {
          const f = calm(c) ? sc.near('threat', c.x, c.y, 260) : null;
          // it has to notice first: a few seconds of trouble among the flock before it goes, so the goose gets its fun
          if (f) { if (!ram.seen) ram.seen = W.t + span(4, 8); else if (W.t >= ram.seen) { ram.seen = 0; ram.wary = W.t + 3; release(ram); ram.foe = f; mood(ram, 'charge'); FLOCK.charges++; } ram.near = W.t; break; }
        }
        if (ram.seen && W.t - (ram.near || 0) > 3) ram.seen = 0;  // the trouble went away by itself
      }
      for (const c of L) live(c, W, dt);
      // a body's width apart: one on the move is eased off whoever it comes too close to. (Up and down the screen is into the distance: closer is fine.)
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j], am = a.mode === 'walk' || a.mode === 'flee' || a.mode === 'frolic' || a.mode === 'ward', bm = b.mode === 'walk' || b.mode === 'flee' || b.mode === 'frolic' || b.mode === 'ward';
        if (!calm(a) || !calm(b)) continue;
        let dx = b.x - a.x, dy = (b.y - a.y) * 1.6; const sep = (a.ram || b.ram ? 18 : 15) * S, d = Math.hypot(dx, dy); if (d >= sep) continue;
        if (d < .01) { dx = 1; dy = 0; } else { dx /= d; dy /= d; }
        if (!am && !bm) {  // two that have come to rest on top of each other: one with nothing to do steps aside
          if (d < sep * .6) { if (a.mode === 'idle') head(a, W, a.x - dx * sep, a.y - dy * sep * .6); else if (b.mode === 'idle') head(b, W, b.x + dx * sep, b.y + dy * sep * .6); }
          continue;
        }
        const push = Math.min(sep - d, 60 * k * dt) / (am && bm ? 2 : 1);
        if (am) { a.x -= dx * push; a.y -= dy * push; } if (bm) { b.x += dx * push; b.y += dy * push; }
      }
      for (const c of L) if (calm(c)) { c.x = U.clamp(c.x, W.x1, W.x2); c.y = U.clamp(c.y, W.y1, W.y2); }
      // one lower on the screen is nearer: drawn later, so in front. (Nearly sorted from the frame before: a few swaps.)
      for (let i = 1; i < L.length; i++) { const c = L[i]; let j = i - 1; while (j >= 0 && L[j].y > c.y) { L[j + 1] = L[j]; j--; } L[j + 1] = c; }
      g.imageSmoothingEnabled = false;
      // the grass: a new tuft now and then up to eighteen, and the eaten ones growing back. Faint, so that a tile's words still read.
      if ((W.grow -= dt) <= 0) { W.grow = span(12, 30); if (W.spots.length < 18) W.spots.push(tuft(W, Math.random(), Math.random())); }
      g.globalAlpha = .6;
      for (const sp of W.spots) { if (sp.n < 3 && !sp.by && W.t > sp.back) { sp.n = sp.n ? 3 : 1; sp.back = W.t + 20; } blit(g, W.ex, sp.n > 1 ? W.ex.ix.tuft2 : sp.n ? W.ex.ix.tuft1 : W.ex.ix.stub, 0, sp.x, sp.y); }
      g.globalAlpha = 1;
      for (const c of L) show(g, c, W);
      for (const c of L) {
        if (c.mode !== 'gone') {
          if (c.say > W.t) blit(g, W.ex, W.ex.ix.baa, 0, U.clamp(c.x + 6 * S, 8 * S, W.w - 8 * S), c.y - (c.ram ? 14 : 11) * S);
          if (c.bang > W.t && c.mode === 'gawk') blit(g, W.ex, W.ex.ix.bang, 0, c.x, c.y - (c.ram ? 14 : 11) * S);
        }
        // tell the other kinds where it stands, and let them stroke it
        if (sc) { const p = c.post; p.x = c.x; p.y = c.y; p.dir = c.dir; p.hid = !calm(c); sc.next.push(p); }
      }
      drawParts(g, W, dt);
    },
  });
})();
