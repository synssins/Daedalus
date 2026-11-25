'use strict';
// Little pixel-art creatures that live on the tops of the tiles: they walk along a tile's top edge, fall off its
// end and land on whatever tile top (or the bottom of the screen) is below.
//
// A creature is DATA, the way desktop-pet programs do it, and one small interpreter (go / fire / step / paint) runs
// any of them. To add a creature: write its `art` (parts and frames as strings, one letter per colour) and its
// table of `states`, then give it a kind with HP.fx.add() like the two at the bottom. No new engine code.
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
// the creature's key (its role for the walkers, night or day for the sheep). 0 means: ignore the event.
// A choice by chance may carry a third item, [name, weight, 'trick']: the weight is then multiplied by what the
// creature's own tag(c, W, 'trick') answers. The sheep uses it to keep its antics to the interval the user set:
// nothing while the time is not up, almost certainly once it is.
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
  const TEST = HP.fx.walkTest = {out: 0, home: 0, splat: 0, boom: 0, guard: 0, round: 0, most: 0, off: 0, cut: 0};  // counts, for checks

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
    const S = W.S, gw = W.gw = Math.ceil(W.w / S), gh = W.gh = Math.ceil(W.h / S), m = W.m = new Uint8Array(gw * gh);
    for (const r of W.tiles) {
      const a = Math.max(0, Math.round(r.x / S)), b = Math.min(gw - 1, Math.round((r.x + r.w) / S) - 1), t = Math.max(0, Math.round(r.y / S)), u = Math.min(gh - 1, Math.round((r.y + r.h) / S) - 1);
      for (let y = t; y <= u; y++) if (b >= a) m.fill(1, y * gw + a, y * gw + b + 1);
    }
    W.cuts = new Map(); W.dug = new Map(); W.dirty = 0; W.bg.clearRect(0, 0, W.w, W.h);
  }
  /** What is at this point: 0 air, 1 tile, 2 brick. Below the screen is floor. */
  function at(W, x, y) { const S = W.S; x = Math.floor(x / S); y = Math.floor(y / S); if (y >= W.gh) return 1; if (x < 0 || x >= W.gw || y < 0) return 0; return W.m[y * W.gw + x]; }
  /** Take the ground out of a box (in pixels), tile and brick alike. */
  function carve(W, x0, y0, x1, y1) {
    const S = W.S, a = Math.max(0, Math.floor(x0 / S)), b = Math.min(W.gw - 1, Math.ceil(x1 / S) - 1), t = Math.max(0, Math.floor(y0 / S)), u = Math.min(W.gh - 1, Math.ceil(y1 / S) - 1);
    if (b < a || u < t) return;
    for (let y = t; y <= u; y++) W.m.fill(0, y * W.gw + a, y * W.gw + b + 1);
    const X = a * S, Y = t * S, w = (b - a + 1) * S, h = (u - t + 1) * S; TEST.cut++;
    W.bg.clearRect(X - 1, Y - 1, w + 2, h + 2);
    for (const r of W.tiles) {
      if (!r.el || X >= r.x + r.w || X + w <= r.x || Y >= r.y + r.h || Y + h <= r.y) continue;
      let k = W.cuts.get(r);
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
    if (!n) return;  // nothing but ground here already
    const g = W.bg; g.fillStyle = INK; g.fillRect(gx * S - 1, gy * S - 1, 2 * S + 2, 2 * S + 2); g.fillStyle = i & 1 ? '#c98a4b' : '#e3ad6b'; g.fillRect(gx * S, gy * S, 2 * S, 2 * S);
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
        on: {notice: 'gawk', jolt: 'slip', edge: {floater: 'glide', builder: 'build', _: 'fall'}, wall: {climber: 'climb', tunneler: 'bash', _: 'turn'}, head: {tunneler: 'bash', _: 'turn'}, bump: 'turn', screen: 'guard', exit: 'hopin'}},
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
      build: {frames: ['build0', 'build1'], ft: .1, hold: 1, enter: 'stair', tick: 'brick', on: {built: 'walk'}},
      // a tile in the way of the stair: out comes the pickaxe, and the stair goes on through it
      pick:  {frames: ['pick0', 'pick1'], ft: .15, hold: 1, tick: 'chip'},
      // the diggers take the tile away a chunk at a time: sideways (tunneler), straight down (digger), down and forward (miner)
      bash:  {frames: ['pick0', 'pick1'], ft: .2, hold: 1, enter: 'job', tick: 'bash'},
      bore:  {frames: ['build0', 'build1'], ft: .12, enter: 'spot', dur: .5, next: {miner: 'mine', _: 'delve'}},
      delve: {frames: ['build0', 'build1'], ft: .25, enter: 'job', tick: 'scoop'},
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
        c.role = 'walker'; c.bn = 0; c.bair = 0; c.dig = c.goal; c.goal = 0; c.force = 0; c.bmax = c.dig ? 500 : 12;  // only a stair sent up to the door goes through tiles, and as far as it must
      },
      brick(c, W) {
        if (c.f) return;
        const S = W.S, h = c.def.half * S, D = W.door;
        if (c.dig) {
          if (c.y <= D.y) { W.leadWait = W.t + 40; fire(c, 'built', W); return; }
          const to = D.x < c.x ? -1 : 1, mg = 9 * S + 8 + h; let dir = Math.abs(D.x - c.x) >= 2 * (c.y - D.y) ? to : -to;
          if (c.force) { dir = c.force; if ((D.x - c.x) * dir < 0) c.force = 0; }  // no room at the screen's side: on past the door, and back
          else if (dir !== to && (c.x + dir * 2 * S < mg || c.x + dir * 2 * S > W.w - mg)) dir = c.force = to;
          c.dir = dir;
        }
        const nx = c.x + c.dir * 2 * S, ny = c.y - S;
        if (c.bn >= c.bmax || nx < 8 + h || nx > W.w - 8 - h || (!c.dig && ny < 14 * S)) { fire(c, 'built', W); return; }
        if (blocked(W, c, nx, ny)) {
          let room = true; for (let k = 1; k <= 3; k++) if (at(W, nx, c.y - k * S) === 1) room = false;
          if (c.dig) go(c, 'pick', W);
          else if (room) {  // a tile close overhead: no stair, but a flat bridge fits under it
            const air = !at(W, nx, c.y); lay(W, nx - S, c.y, c.bn++); c.x = nx;
            if (air) c.bair = 1; else if (c.bair) fire(c, 'built', W);
          } else fire(c, 'built', W);
          return;
        }
        lay(W, nx - S, ny, c.bn++); c.x = nx; c.y = ny;
        // over a gap, then over ground again and too high to be stepped on from the far side: the bridge is done
        let k = 1; while (k <= 16 && at(W, nx, ny + k * S) !== 1) k++;
        if (k > 16) c.bair = 1; else if (c.bair && k > UP + 1 && c.y - W.door.y <= 10) fire(c, 'built', W);
      },
      chip(c, W) {
        if (c.f) return;
        const S = W.S, h = c.def.half * S, T = c.def.tall * S, nx = c.x + c.dir * 2 * S, ny = c.y - S;
        carve(W, Math.min(nx - c.dir * (h + S), nx + c.dir * (h + 5 * S)), ny - T - 4 * S, Math.max(nx - c.dir * (h + S), nx + c.dir * (h + 5 * S)), ny);
        burst(W, nx, ny - T, 4, ['#fff3dc', '#e9dcc6', '#c4b299'], 80, {g: 300});
        c.keep = 1; go(c, 'build', W);
      },
    },
  };

  /** A new round: the tiles whole again, the hatch over any tile of the top row (never the clock, which has no
   *  face to stand behind) and the door on some other tile, both by chance, so no two rounds are the same walk. */
  function deal(W, ctx) {
    const S = W.S, rnd = Math.random, all = ctx.rects.filter(r => !r.hidden), tiles = W.tiles.filter(r => r.type !== 'clock' && r.w >= 16 * S);
    const tops = tiles.filter(r => !all.some(o => o !== r && o.y + o.h <= r.y + 2 && o.x < r.x + r.w - 4 && o.x + o.w > r.x + 4));
    const any = a => a[Math.floor(rnd() * a.length)];
    heal(); terrain(W); W.lead = null; W.leadWait = W.t + 3; W.lastHome = -99;
    W.saved = 0; W.wait = .5; W.left = U.clamp(Math.round(+ctx.opts.count || 40), 3, 200); W.dir = rnd() < .5 ? 1 : -1; TEST.round++;
    if (!tiles.length) { W.hatch = {x: W.w * .3, y: 20}; W.door = {x: W.w * .7, y: W.gh * S, tile: null}; return; }  // a page with no tiles
    const h = W.tiles[ctx.opts.th] || any(tops.length ? tops : tiles), hx = h.x + h.w * (.25 + rnd() * .5);
    let pool = tiles.filter(r => r !== h && r !== W.doorTile && (Math.abs(r.y - h.y) > 6 || Math.abs(r.x + r.w / 2 - hx) > 260));
    if (!pool.length) pool = tiles.filter(r => r !== h); if (!pool.length) pool = tiles;
    const d = W.doorTile = W.tiles[ctx.opts.td] || any(pool);
    W.hatch = {x: hx, y: Math.max(2, h.y - 11 * S)}; W.door = {x: d.x + d.w * (.3 + rnd() * .4), y: Math.round(d.y / S) * S, tile: d};
  }
  /** The hand that gives out the jobs, as the player's did: it looks at one plain walker and, if that would help
   *  it or the ones behind it get to the door, gives it a job. It does not see everything in time. */
  function hand(c, W) {
    const S = W.S, D = W.door, T = c.def.tall * S, h = c.def.half * S, up = c.y - D.y, to = D.x < c.x ? -1 : 1, ahead = c.dir === to;
    if (at(W, c.x, c.y) === 2) return;  // on somebody's bricks: it is on its way
    const near = o => o !== c && Math.abs(o.y - c.y) < T;
    // A blocker is only put where nobody is shut in by it: no other one standing on this level, and nobody beyond it.
    const joined = x2 => {  // unbroken ground from here to there
      for (let x = Math.min(c.x, x2); x <= Math.max(c.x, x2); x += S) { let k = -1; while (k <= UP + 2 && !at(W, x, c.y + k * S)) k++; if (k > UP + 2) return false; }
      return true;
    };
    const post = hold => {
      if (W.posts >= W.maxPosts) return false;
      for (const o of W.list) {
        if (!near(o) || Math.abs(o.x - c.x) > 500 || !joined(o.x)) continue;
        if (!o.s.solid) { if ((o.x - c.x) * c.dir > 0) return false; }  // somebody beyond it would be shut out
        else if (W.list.some(p => near(p) && !p.s.solid && (p.x - c.x) * (p.x - o.x) < 0)) return false;  // somebody between the two would be shut in
      }
      c.hold = hold; W.posts++; return go(c, 'block', W);
    };
    let brink = 0;  // how far ahead the ground ends, if it does soon
    for (let d = S; d <= 14 * S && !brink; d += S) { let k = 0; while (k <= UP && !at(W, c.x + c.dir * d, c.y + k * S)) k++; if (k > UP) brink = d; }
    if (brink) {
      const bx = c.x + c.dir * (brink + S); let drop = 0; while (drop < W.h && !at(W, bx, c.y + drop)) drop += S;
      const low = c.y + drop > D.y + 10;  // going down here would put it below the door
      if (low && up <= 10) {  // not below the door yet: keep it that way
        let foot = false; for (let d = 0; d <= brink + 2 * S && !foot; d += S) if (at(W, c.x + c.dir * d, c.y - S) === 2) foot = true;  // a bridge starts here already
        if (foot || W.list.some(o => near(o) && o.s.hold && (o.x - c.x) * c.dir > 0 && Math.abs(o.x - c.x) < brink + 8 * S)) return;  // or is being built
        if (ahead) { c.role = 'builder'; go(c, 'build', W); }  // bridge it
        else if (!post(60) && !(c.pass > W.t)) go(c, 'turn', W);  // the wrong way: stopped here, or turned back
      } else if (drop > W.hard) { if (!post(40)) c.role = 'floater'; }  // a deadly drop: stop them here, or take the leaf
      return;
    }
    if (up > 10) {  // below the door: one of them builds the stair up to it, and the rest follow
      const L = W.lead, busy = L && !L.dead && (L.st === 'build' || L.st === 'pick');
      if (!busy && W.t > W.leadWait && W.t - W.lastHome > 20 && Math.abs(D.x - c.x) <= 2 * up + 6 * S && !W.list.some(o => at(W, o.x, o.y) === 2)) {  // not while a stair is in use
        let here = 0, below = 0; for (const o of W.list) { if (o.y - D.y > 10) below++; if (Math.abs(o.y - c.y) < T) here++; }
        if (here * 3 >= below) { W.lead = c; W.leadWait = W.t + 8; c.role = 'builder'; c.goal = 1; go(c, 'build', W); return; }
      }
      if (!ahead && Math.abs(D.x - c.x) > 2 * up + 6 * S) post(25);  // walking away from where the stair will start
      return;
    }
    if (up >= -10) {  // level with the door
      if (!ahead && Math.abs(c.x - D.x) > 12 * S) post(30);
      else if (ahead && at(W, c.x + c.dir * (h + 2 * S), c.y - 4 * S) === 1) c.role = 'tunneler';  // a tile in the way: through it
      return;
    }
    // above the door: down through the tile once over the door's own, if nobody has cut a way down there yet
    const d = D.tile, r = W.tiles.find(r => c.x > r.x && c.x < r.x + r.w && c.y > r.y - 2 * S && c.y < r.y + r.h);
    // not straight under a shaft through the tile above: two in a line make a fall nobody lives through
    let open = 0; while (open < 40 && c.y - T - open * S > 0 && !at(W, c.x, c.y - T - open * S)) open++;
    if (d && r && at(W, c.x, c.y) === 1 && (open < 20 || (c.y - T - open * S <= 0 && !W.tiles.some(q => q.y < c.y - 10 && c.x > q.x - 20 * S && c.x < q.x + q.w + 20 * S))) && (!W.dug.has(r) || c.y > r.y + 2 * S) && c.x > d.x + 4 * S && c.x < d.x + d.w - 4 * S && !W.list.some(o => near(o) && (o.st === 'bore' || o.st === 'delve' || o.st === 'mine'))) { W.dug.set(r, 1); c.role = 'digger'; go(c, 'bore', W); }
    else if (!ahead) post(25);
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
    live: true, fps: 12,
    options: [{key: 'count', label: 'How many', type: 'range', min: 3, max: 200, step: 1, default: 40}, SIZE, DROP],
    create(ctx) {
      heal();  // whatever an earlier round cut
      const S = scale(ctx), W = world(ctx, S);
      W.sh = sheet(ACORN_ART, S); W.props = sheet(PROPS_ART, S); W.font = sheet(FONT_ART, 2); prep(ACORN, W.sh);
      W.bcv = document.createElement('canvas'); W.bcv.width = Math.ceil(W.w); W.bcv.height = Math.ceil(W.h); W.bg = W.bcv.getContext('2d');  // the bricks, painted once each
      const hs = W.tiles.map(r => r.h).sort((a, b) => a - b);
      W.hard = hs.length ? 2 * hs[hs.length >> 1] + 4 * S : 230;  // two tiles of this layout, and a little
      W.drop = interval(ctx, DROP); W.leadWait = 0; W.rest = 0; W.live = 0; W.posts = 0; W.fl = 0;
      deal(W, ctx);
      Object.defineProperty(TEST, 'W', {value: W, configurable: true, enumerable: false});  // for the test page's readout
      return W;
    },
    // a double tap anywhere: every tile whole again at once
    restore(W) { heal(); if (W && W.bg) terrain(W); },
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
      W.posts = 0; W.live = 0; W.maxPosts = Math.max(2, W.list.length / 12); W.maxLive = Math.max(2, W.list.length / 20);
      for (const c of W.list) { if (c.st === 'block') W.posts++; else if (c.st === 'build' || c.st === 'pick') W.live++; }
      let n = 0, busy = false;
      for (const c of W.list) {
        if (W.t - c.born > 240 && !c.fuse && !c.s.solid && !c.s.hold) { c.fuse = W.t + 5; c.dud = 1; }  // shut in somewhere: do not pile up for ever
        if (c.fuse && W.t >= c.fuse && !c.s.end && c.st !== 'hopin' && c.st !== 'home' && c.st !== 'splat') { go(c, 'boom', W); continue; }
        if (c.st === 'walk' && c.role === 'climber') flue(c, W);
        if (c.st === 'walk' && (c.role === 'walker' || c.role === 'floater' || c.role === 'climber') && Math.random() < dt * 2) hand(c, W);
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
        if (ctx.scene) ctx.scene.next.push({kind: 'walker', x: c.x, y: c.y, h: c.def.tall * S});  // so other kinds can meet them
      }
      blit(g, W.props, W.props.ix.hatch, 0, W.hatch.x, W.hatch.y + 9 * S);  // over them: they come out from behind its lintel
      drawParts(g, W, dt);
    },
  });

  // =====================================================================================================
  // Sheep: a cream ball of wool with a peach face, two gold horn buds and a rose ear. It arrives as a meteor.
  // =====================================================================================================
  const WOOL = ['...wwwwwww..', '..wwwwwwwww.', '.wwwWwwwwwww', 'WwwwwwwWwwww', '.wwWwwwwwwWw', '..wwwwwwwww.', '...wWwwwWw..'];
  const HEAD = ['.www..', 'yyppp.', 'lpeppp', 'lpepPp', 'pphppp', '.pppp.'], SHUT = ['.www..', 'yyppp.', 'lppppp', 'leepPp', 'pphppp', '.pppp.'];
  const GAPE = ['.www..', 'yyppp.', 'lppppp', 'leekkk', 'ppkkkp', '.pppp.'], EEK = ['.www..', 'yyppp.', 'lpeppp', 'lpepkk', 'pphpkk', '.pppp.'];
  const FACE = ['.wwww.', 'yppppy', 'peppep', 'peppep', 'hpPPph', '.pppp.'], DIZZY = FACE.map(r => r.replace(/e/g, 's'));
  const LEGS = ['P.P...P.P', 'P.P...P.P'], TUCK = [['PP'], 12, 13];
  const SHEEP_ART = {w: 18, h: 14,
    pal: {w: '#fffaf0', W: '#e6d1b3', p: '#f0a878', P: '#c97b52', e: '#3a2233', l: '#c7798d', y: '#f6c64f', h: '#f78f8f', k: '#7a2f3a', s: '#ffe45c'},
    frames: {
      stand: [[WOOL, 1, 5], [HEAD, 11, 3], [LEGS, 4, 12]],
      blink: [[WOOL, 1, 5], [SHUT, 11, 3], [LEGS, 4, 12]],
      walk0: [[WOOL, 1, 5], [HEAD, 11, 3], [['P.P...P.P', 'P.....P..'], 4, 12]],
      walk1: [[WOOL, 1, 5], [HEAD, 11, 3], [['P.P...P.P', '..P.....P'], 4, 12]],
      run0: [[WOOL, 1, 4], [HEAD, 11, 2], [['..P.....P..', '.P.......P.', 'P.........P'], 3, 11]],
      run1: [[WOOL, 1, 5], [HEAD, 11, 4], [['..P...P..', '...P.P...'], 4, 12]],
      graze0: [[WOOL, 1, 5], [LEGS, 4, 12], [HEAD, 12, 8]],
      graze1: [[WOOL, 1, 5], [LEGS, 4, 12], [HEAD, 12, 7]],
      sit: [[WOOL, 1, 7], [HEAD, 11, 5], TUCK],
      sitF: [[WOOL, 1, 7], [FACE, 10, 4], TUCK],
      sitL: [[WOOL, 1, 7], [FACE, 9, 4], TUCK],
      sitR: [[WOOL, 1, 7], [FACE, 11, 4], TUCK],
      dazed: [[WOOL, 1, 7], [DIZZY, 10, 4], TUCK],
      pet0: [[WOOL, 1, 7], [SHUT, 11, 5], TUCK],   // sitting with its eyes shut, being stroked
      pet1: [[WOOL, 1, 6], [SHUT, 11, 5], TUCK],   // ...and a little wriggle of the wool
      sleep0: [[WOOL, 1, 7], [SHUT, 11, 8]],
      sleep1: [[['...wwwwwww..'], 1, 6], [WOOL, 1, 7], [SHUT, 11, 8]],
      yawn: [[WOOL, 1, 5], [GAPE, 11, 2], [LEGS, 4, 12]],
      look: [[WOOL, 1, 5], [FACE, 10, 3], [LEGS, 4, 12]],
      fall0: [[WOOL, 1, 4], [EEK, 11, 2], [['.P.P...P.P.', 'P...P.P...P'], 3, 11]],
      fall1: [[WOOL, 1, 4], [EEK, 11, 2], [['P.P.....P.P', '.P.P...P.P.'], 3, 11]],
      sneeze0: [[WOOL, 1, 5], [SHUT, 10, 1], [LEGS, 4, 12]],
      sneeze1: [[WOOL, 1, 5], [SHUT, 12, 6], [LEGS, 4, 12]],
    }};
  // the speech bubble, the z's of its sleep and the tufts it eats
  const BUBBLE = ['.wwwwwwwwwwwww.'].concat(new Array(5).fill('wwwwwwwwwwwwwww'), ['.wwwwwwwwwwwww.', '...ww..........', '...w...........']);
  const EXTRA_ART = {w: 15, h: 9, pal: {w: '#fffdf6', k: '#3a2233', z: '#e6f0ff', g: '#8fd85a', G: '#4fa63c', r: '#ff6b8a'},
    frames: {
      baa: [[BUBBLE, 0, 0], [glyph('44757', 'k'), 2, 1], [glyph('06357', 'k'), 6, 1], [glyph('06357', 'k'), 10, 1]],
      z: [[glyph('07247', 'z'), 6, 4]],
      Z: [[glyph('71247', 'z'), 6, 4]],
      tuft2: [[['.g..g', 'g.gg.', 'gGgGg'], 5, 6]],
      tuft1: [[['.g.g.', 'gGgGg'], 5, 7]],
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

  const FIRE = ['#fffbe0', '#ffe873', '#ffc93c', '#ffa62b', '#ff8424', '#f4631e', '#d9481c', '#b6361b', '#8c2a1a'];
  // The sheep's two intervals. Return: about how long it is gone before the next meteor brings it back.
  // Trick: about how long between antics while it is here (a run, a look about that ends in a roll or a jump, a yawn,
  // a sneeze, walking off a tile's end, climbing a tile's side); in between it walks, grazes and sits. Each sheep has
  // a time for its next antic (c.next): until then the antics are not among its choices, after it they nearly always
  // win, and doing one sets the next time. At night that time is three intervals off, so it mostly sleeps.
  const AWAY = {key: 'away', label: 'Return interval', type: 'range', min: 3, max: 300, step: 1, unit: 's', default: 15};
  const TRICK = {key: 'trick', label: 'Trick interval', type: 'range', min: 3, max: 120, step: 1, unit: 's', default: 12};
  const SHEEP = {
    tag: (c, W) => W.t >= c.next ? 40 : 0,
    art: SHEEP_ART, half: 6, tall: 9, hard: 250, fall: 'fall',
    key: (c, W) => W.ctx.env.night ? 'night' : 'day',
    on: {tap: 'bleat', grab: 'held'},
    states: {
      away:   {frames: [], hide: 1, move: 'free', enter: 'absent', next: 'meteor', on: {grab: 0}},
      meteor: {frames: [], move: 'fly', speed: 640, enter: 'aim', each: 'sparks', paint: 'meteor', on: {arrive: 'impact', grab: 0}},
      impact: {frames: ['dazed'], ft: .3, enter: 'crater', tick: 'stars', dur: [1.5, 2.3], next: 'shake'},
      shake:  {frames: ['sitL', 'sitF', 'sitR', 'sitF'], ft: .09, dur: 1.08, next: 'idle'},
      idle:   {frames: ['stand', 'stand', 'stand', 'stand', 'stand', 'stand', 'blink'], ft: .3, dur: [1.2, 3.5], enter: 'nosy',
        next: {night: [['sleep', 6], ['sit', 2], ['yawn', 2], ['walk', 1.5], ['look', 1.2, 'trick'], ['run', .8, 'trick'], ['sneeze', .5, 'trick']],
          _: [['walk', 6], ['run', 1.2, 'trick'], ['sit', 1.5], ['look', 1.6, 'trick'], ['yawn', .7, 'trick'], ['sneeze', .5, 'trick'], ['turn', 1], ['sleep', .6]]}},
      turn:   {frames: ['stand'], enter: 'flip', dur: 0, next: 'walk'},
      walk:   {frames: ['walk0', 'stand', 'walk1', 'stand'], ft: .16, vx: 8, dur: [2, 7], next: 'idle',
        on: {edge: [['turn', 3], ['fall', 1.3, 'trick']], wall: [['turn', 3], ['climb', 1.2, 'trick']], screen: [['turn', 2], ['leave', 1]], tuft: [['graze', 4], [0, 1]]}},
      run:    {frames: ['run0', 'run1'], ft: .11, vx: 24, enter: 'antic', dur: [.8, 2.2], next: 'idle', on: {edge: [['fall', 2], ['turn', 1]], wall: 'turn', screen: [['turn', 1], ['leave', 1]]}},
      graze:  {frames: ['graze0', 'graze1'], ft: .22, enter: 'nibble', tick: 'chew', dur: [3, 6], next: 'idle'},
      sit:    {frames: ['sit'], dur: [2.5, 7], next: {night: 'sleep', _: [['idle', 3], ['sleep', 1], ['look', 1]]}},
      sleep:  {frames: ['sleep0', 'sleep1'], ft: 1, tick: 'zzz', enter: 'doze', dur: {night: [40, 120], _: [9, 26]}, next: {night: 'yawn', _: [['yawn', 4], ['launch', 1]]}},
      yawn:   {frames: ['stand', 'yawn', 'yawn', 'yawn', 'stand'], ft: .3, once: 1, enter: 'antic', next: 'idle'},
      look:   {frames: ['look'], dur: [1.5, 3], enter: 'antic', next: [['idle', 2], ['roll', 2], ['jump', 2]]},  // bored: a trick
      roll:   {frames: ['run1'], spin: 1.4, vx: 16, dur: .714, next: 'idle', on: {edge: 'fall', wall: 'idle', screen: 'idle'}},
      jump:   {frames: ['run0'], move: 'air', jump: 330, on: {land: 'idle'}},
      fall:   {frames: ['fall0', 'fall1'], ft: .09, move: 'air', enter: 'antic', on: {land: 'bounce', crash: 'impact'}},
      bounce: {frames: ['fall0'], move: 'air', jump: 190, on: {land: 'idle'}},
      climb:  {frames: ['walk0', 'stand', 'walk1', 'stand'], ft: .14, move: 'climb', rot: -.25, vy: 7, enter: 'antic', on: {top: 'walk'}},
      sneeze: {frames: ['sneeze0', 'sneeze0', 'sneeze0', 'sneeze1', 'sneeze1', 'stand'], ft: .16, once: 1, enter: 'antic', tick: 'spray', next: 'idle'},
      bleat:  {frames: ['yawn'], move: 'air', jump: 300, enter: 'baa', on: {land: 'idle'}},
      held:   {frames: ['fall0', 'fall1'], ft: .1, move: 'held', on: {drop: 'fall', grab: 0}},
      // a finger on the glass: it stops and looks that way for a moment
      gawk:   {frames: ['stand'], enter: 'face', dur: 1.5, next: 'idle'},
      // the screen is pulled away under it: it rolls the other way, sits dazed, shakes its head and gets on with things
      slip:   {frames: ['run1'], spin: 1.4, vx: 20, dur: .7, enter: 'jolt', next: 'dizzy', on: {edge: 'fall', wall: 'dizzy', screen: 'dizzy', tap: 0, grab: 0}},
      dizzy:  {frames: ['dazed'], ft: .3, tick: 'stars', dur: [1.3, 2], next: 'shake'},
      // Somebody is stroking it (another kind calls pet() on what the sheep posts, every frame). It sits where it is
      // with its eyes shut and wriggles; each stroke starts the three seconds again, and when they run out it goes
      // back to its own life. Calm: a tap or a finger on the glass does not make it jump, and it does not leave.
      pet:    {frames: ['pet0', 'pet0', 'pet1', 'pet0'], ft: .3, tick: 'love', dur: 3, next: 'idle', on: {tap: 0, notice: 0, jolt: 0}},
      visit:  {frames: ['walk0', 'stand', 'walk1', 'stand'], ft: .16, vx: 8, dur: [2, 5], next: 'look', on: {edge: 'idle', wall: 'idle', screen: 'idle'}},
      leave:  {frames: ['walk0', 'stand', 'walk1', 'stand'], ft: .16, move: 'free', vx: 10, dur: 5, next: 'away'},
      // after a long nap it sometimes goes back where it came from: straight up, trailing sparks
      launch: {frames: ['fall0', 'fall1'], ft: .08, move: 'free', vy: -170, each: 'sparks', dur: 2.2, next: 'away', on: {tap: 0, grab: 0}},
    },
    acts: {
      flip(c) { c.dir = -c.dir; },
      absent(c, W) { c.dur = about(W.away); },
      doze(c, W) { if (W.ctx.env.night) c.dur /= 3; },
      // that was an antic: when the next one is due. (The yawn on waking at night does not count, or it would never get to anything else.)
      antic(c, W) { const night = W.ctx.env.night; if (!(night && c.st === 'yawn')) c.next = W.t + about(W.trick) * (night ? 3 : 1); },
      face(c, W) { if (Math.abs(W.look.x - c.x) > 6 * W.S) c.dir = W.look.x < c.x ? -1 : 1; },
      jolt(c, W) { c.dir = W.jolt; },
      love(c, W) {
        if (Math.random() < .1) W.parts.push({x: c.x + (Math.random() - .5) * 8 * W.S, y: c.y - 9 * W.S, vx: 0, vy: -14, g: 0, t: 0, life: 1.3, img: W.ex.ix.heart});
        else if (Math.random() < .03) c.say = W.t + 1.1;  // a soft "baa": the bubble only, no jump, no sound
      },
      // Now and then, on coming to rest: is somebody of another kind standing near, on this level? Then go and see.
      nosy(c, W) {
        const sc = W.ctx.scene; if (!sc || Math.random() > .5) return;
        for (const a of sc.actors) if (a.kind !== 'sheep' && Math.abs(a.y - c.y) < 12 && Math.abs(a.x - c.x) < 150 && Math.abs(a.x - c.x) > 14 * W.S) { c.dir = a.x < c.x ? -1 : 1; go(c, 'visit', W); return; }
      },
      // The meteor's target: a spot on a tile top. The first landing comes from the seed, later ones from chance.
      aim(c, W) {
        const tp = W.tp.length ? W.tp : W.plats, first = c.first; c.first = null;
        const p = tp[first ? first[0] % tp.length : Math.floor(Math.random() * tp.length)], fx = first ? first[1] : Math.random();
        c.dir = first ? first[2] : Math.random() < .5 ? -1 : 1;
        const a = Math.max(p.x1 + 26, 20), b = Math.min(p.x2 - 26, W.w - 20);
        c.tx = b > a ? a + (b - a) * fx : (p.x1 + p.x2) / 2; c.tp = p; c.ty = ground(p, c.tx); c.plat = null;
        const d = c.ty + 80, k = .7, m = Math.hypot(k, 1);  // start above the screen, coming in at a slant
        c.x = c.tx - c.dir * d * k; c.y = c.ty - d; c.ux = c.dir * k / m; c.uy = 1 / m;
      },
      sparks(c, W) { if (W.parts.length < 50) W.parts.push({x: c.x + (Math.random() - .5) * 18, y: c.y - 4 * W.S, vx: (Math.random() - .5) * 60, vy: (Math.random() - .5) * 60, g: 0, t: 0, life: .35 + Math.random() * .3, col: FIRE[1 + Math.floor(Math.random() * 5)], sz: W.S}); },
      meteor(c, W, g) {
        const S = W.S, hy = c.y - 4 * S;
        g.globalCompositeOperation = 'lighter'; g.drawImage(W.glow, c.x - 44, hy - 44, 88, 88); g.globalCompositeOperation = 'source-over';
        for (let i = FIRE.length - 1; i >= 0; i--) {  // a tail of squares, hot to dark, loosening toward its end
          const sz = Math.round(6 - i * .5) * S, back = i * (3 + i * .45) * S, wob = i ? (Math.random() - .5) * i * S * .7 : 0;
          g.globalAlpha = 1 - i / 10; g.fillStyle = FIRE[i];
          g.fillRect(Math.round((c.x - c.ux * back + wob - sz / 2) / S) * S, Math.round((hy - c.uy * back - sz / 2) / S) * S, sz, sz);
        }
        g.globalAlpha = 1;
      },
      crater(c, W) {
        burst(W, c.x, c.y - 2 * W.S, 10, ['#efe4d2', '#b9a58c', '#8c7a66'], 150, {g: 520});
        burst(W, c.x, c.y - 6 * W.S, 5, ['#ffe45c', '#fff3a8'], 130, {g: 260, star: 1, life: .9});
        W.marks.push({x: c.x, y: c.y, t: 0});
      },
      stars(c, W) { W.parts.push({x: c.x + (Math.random() - .5) * 12 * W.S, y: c.y - 11 * W.S, vx: (Math.random() - .5) * 30, vy: -18, g: 0, t: 0, life: .7, col: '#ffe45c', sz: W.S, star: 1}); },
      nibble(c) { c.food = c.spot; c.bites = 0; },
      chew(c, W) {
        if (!c.food || ++c.bites % 6) return;
        if (--c.food.n <= 0) { c.food.off = true; c.food.back = W.t + 50 + Math.random() * 80; c.food = null; fire(c, 'done', W); }
      },
      zzz(c, W) { W.parts.push({x: c.x + c.dir * 7 * W.S, y: c.y - 6 * W.S, vx: c.dir * 5, vy: -13, g: 0, t: 0, life: 2.2, img: c.f ? W.ex.ix.Z : W.ex.ix.z}); },
      spray(c, W) { if (c.f === 3) burst(W, c.x + c.dir * 9 * W.S, c.y - 5 * W.S, 5, ['#eaf6ff', '#bfe3ff'], 50, {vx: c.dir * 110, life: .35}); },
      baa(c, W) { c.say = W.t + 1.1; const s = W.ctx.opts.sound; if (s && s !== 'false') bleat(); },
    },
  };

  // which of its moods a finger or a jolt breaks into: the ones with its feet on the ground. A sleeper is not woken
  // by a look, but is thrown out of bed with the rest.
  for (const k of ['idle', 'walk', 'run', 'graze', 'sit', 'yawn', 'look', 'sneeze', 'gawk', 'visit']) SHEEP.states[k].on = Object.assign({notice: 'gawk', jolt: 'slip'}, SHEEP.states[k].on);
  SHEEP.states.sleep.on = {jolt: 'slip'};
  /** May it be petted where it is: standing or sitting on something, not in the air, in a hand, rolling or away. */
  const calm = c => c.plat && !c.s.hide && !c.s.paint && !c.s.move && !c.s.spin && c.st !== 'launch';

  HP.fx.add('sheep', {
    label: 'Sheep',
    live: true, fps: 12,
    options: [{key: 'count', label: 'How many', type: 'range', min: 1, max: 5, step: 1, default: 1}, {key: 'sound', label: 'Sound', type: 'bool', default: false}, SIZE, AWAY, TRICK],
    create(ctx) {
      const S = scale(ctx), W = world(ctx, S), r = ctx.rand;
      W.sh = sheet(SHEEP_ART, S); W.ex = sheet(EXTRA_ART, S); prep(SHEEP, W.sh); W.marks = []; W.grip = null; W.away = interval(ctx, AWAY); W.trick = interval(ctx, TRICK);
      // one soft dot for the meteor's glow, stamped rather than a gradient per frame
      W.glow = document.createElement('canvas'); W.glow.width = W.glow.height = 64;
      const d = W.glow.getContext('2d'), gr = d.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,240,170,.9)'); gr.addColorStop(.35, 'rgba(255,150,40,.45)'); gr.addColorStop(1, 'rgba(255,80,0,0)');
      d.fillStyle = gr; d.fillRect(0, 0, 64, 64);
      // tufts of grass on the tile tops, the same ones every day; an eaten one grows back after a minute or two
      for (const p of W.tp) for (const s of p.segs) {
        const a = s.x1 + s.r + 10, b = s.x2 - s.r - 10;
        for (let k = Math.floor((b - a) / 380) + (r() < .5 ? 1 : 0); k > 0 && b > a && W.spots.length < 24; k--) { const x = a + (b - a) * r(); W.spots.push({x, y: ground(p, x), plat: p, ev: 'tuft', r: 2.5 * S, lead: 8 * S, n: 2}); }
      }
      const n = U.clamp(Math.round(+ctx.opts.count || 1), 1, 5);
      for (let i = 0; i < n; i++) {
        const c = make(SHEEP, W.sh, 0, -200, 1); c.first = [Math.floor(r() * 1000), r(), r() < .5 ? -1 : 1];
        go(c, 'away', W); c.dur = .3 + i * (1.2 + r() * 1.5); c.next = about(W.trick) * .5; W.list.push(c);
      }
      return W;
    },
    tap(W, x, y) {
      const c = under(W, x, y); if (!c) return;
      fire(c, 'tap', W);  // "baa", and a jump
      return true;
    },
    // a finger anywhere: it stops and looks that way ("!"); see "notice" above
    touch(W, x, y) { W.look = {x, y}; for (const c of W.list) if (fire(c, 'notice', W)) c.bang = W.t + 1.2; },
    // the screen slides off to another dashboard: it rolls the other way, as off a tablecloth pulled from under it
    swipe(W, dir) { W.jolt = -dir; for (const c of W.list) fire(c, 'jolt', W); },
    // a finger sliding over it picks it up; it is let go when the finger stops moving or lifts
    drag(W, x, y) {
      let c = W.grip && W.grip.st === 'held' ? W.grip : null;
      if (!c) { c = under(W, x, y); if (!c || !fire(c, 'grab', W)) return; W.grip = c; }
      c.x = U.clamp(x, 8, W.w - 8); c.y = y + c.def.tall * W.S / 2; c.heldT = W.t;
    },
    draw(g, W, ctx, t, dt) {
      const S = W.S; W.t += dt;
      for (const c of W.list) step(c, dt, W);
      g.imageSmoothingEnabled = false;
      let n = 0;
      for (const m of W.marks) {  // the scorch where a meteor came down, fading
        m.t += dt; if (m.t > 5) continue; W.marks[n++] = m;
        g.globalAlpha = .6 * (1 - m.t / 5); g.fillStyle = INK;
        g.fillRect(Math.round(m.x) - 5 * S, m.y, 10 * S, S); g.fillRect(Math.round(m.x) - 3 * S, m.y + S, 2 * S, S); g.fillRect(Math.round(m.x) + 2 * S, m.y + S, S, S);
      }
      W.marks.length = n; g.globalAlpha = 1;
      for (const sp of W.spots) { if (sp.off) { if (W.t > sp.back) { sp.off = false; sp.n = 2; } else continue; } blit(g, W.ex, sp.n > 1 ? W.ex.ix.tuft2 : W.ex.ix.tuft1, 0, sp.x, sp.y); }
      for (const c of W.list) {
        paint(g, c, W); if (c.say > W.t && !c.s.hide) blit(g, W.ex, W.ex.ix.baa, 0, U.clamp(c.x + 6 * S, 8 * S, W.w - 8 * S), c.y - 11 * S);
        if (c.bang > W.t && c.st === 'gawk') blit(g, W.ex, W.ex.ix.bang, 0, c.x, Math.max(8 * S, c.y - 11 * S));  // kept on the screen for one on the top row
        // tell the other kinds where it stands, and let them stroke it
        if (ctx.scene && calm(c)) ctx.scene.next.push({kind: 'sheep', x: c.x, y: c.y, h: c.def.tall * S, pet() { if (c.st === 'pet') c.time = 0; else if (calm(c)) go(c, 'pet', W); }});
      }
      drawParts(g, W, dt);
    },
  });
})();
