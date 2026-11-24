'use strict';
// Stick figures: a snow-shovelling crew with ladders, and a wire-work martial arts duel across the tile tops.
// Both use one small skeleton: a pose is a list of joint angles, an animation is a list of timed poses, and one
// player blends between them. At 12 frames a second the poses have to read on their own, so they are drawn big
// in gesture and the fast limbs leave thin streaks.
(() => {
  const U = HP.fx.util, D = Math.PI / 180;
  const TOR = 13, TH = 8.5, SHN = 8.5, UA = 6.5, FA = 6.5, HR = 4.3;  // bone lengths; a figure stands about 40 px tall
  const INK = 'rgba(8,12,26,.62)', BONE = '#f7f9ff';

  // A pose, in degrees: 0 lean, 1-2 front thigh and knee, 3-4 back thigh and knee, 5-6 front arm and elbow,
  // 7-8 back arm and elbow, 9 head, 10 whole-body turn, 11 angle of the thing in the hand (0 up, 90 forward).
  // Limb angles are measured from straight down, positive toward the way the figure faces.
  // 12 step forward, 13 height off the ground, 14 how it is pinned (see solve), 15 drop: used by the fight only.
  const pose = (...a) => { while (a.length < 16) a.push(0); return a; };
  const flip = p => { const q = p.slice(); q[1] = p[3]; q[2] = p[4]; q[3] = p[1]; q[4] = p[2]; q[5] = p[7]; q[6] = p[8]; q[7] = p[5]; q[8] = p[6]; return q; };
  const anim = (len, loop, ...k) => ({k, len, loop, fx: []});

  /** The pose of an animation at time t, written into out. A key is [time, pose, ease]: ease 1 snaps in fast
   *  (a punch landing), 2 is even (flight), anything else eases both ways. */
  function sample(an, t, out) {
    const k = an.k; if (an.loop) t %= an.len;
    let i = 0; while (i < k.length - 2 && t >= k[i + 1][0]) i++;
    const a = k[i], b = k[i + 1] || a, sp = b[0] - a[0];
    let u = sp > 0 ? U.clamp((t - a[0]) / sp, 0, 1) : 1;
    u = b[2] === 1 ? 1 - (1 - u) * (1 - u) * (1 - u) : b[2] === 2 ? u : u * u * (3 - 2 * u);
    const p = a[1], q = b[1];
    for (let j = 0; j < 16; j++) out[j] = p[j] + (q[j] - p[j]) * u;
    out[14] = u < 1 ? p[14] : q[14];
  }
  function figure(x, y, s) { return {x, y, s, dir: 1, lift: 0, pin: 0, p: pose(), from: pose(), an: null, at: 0, bl: 0, blT: 1, J: new Float32Array(22)}; }
  function play(f, an, blend) { if (f.an === an) return; for (let j = 0; j < 12; j++) f.from[j] = f.p[j]; f.an = an; f.at = 0; f.bl = f.blT = blend == null ? 0.16 : blend; }
  function tick(f, dt) {
    f.at += dt; sample(f.an, f.at, f.p);
    if (f.bl > 0) { f.bl -= dt; const u = Math.max(0, f.bl / f.blT); for (let j = 0; j < 12; j++) f.p[j] += (f.from[j] - f.p[j]) * u; }
  }

  /** Where every joint is on screen: hip 0, shoulder 2, head 4, front knee 6 and foot 8, back knee 10 and foot 12,
   *  front elbow 14 and hand 16, back elbow 18 and hand 20. Pinned 0: the lowest point stands on (x, y - lift), so a
   *  crouch or a fall on the back needs no height of its own. 1: the feet are at (x, y), for running up a wall.
   *  2: the middle of the body is the fixed point, for somersaults. */
  function solve(f) {
    const p = f.p, J = f.J, s = f.s, l = p[0] * D; let a = l + p[9] * D;
    J[0] = 0; J[1] = 0; J[2] = Math.sin(l) * TOR; J[3] = -Math.cos(l) * TOR;
    J[4] = J[2] + Math.sin(a) * (HR + 1); J[5] = J[3] - Math.cos(a) * (HR + 1);
    for (let i = 0; i < 2; i++) {
      const o = 6 + i * 4, q = 14 + i * 4;
      a = p[1 + i * 2] * D; J[o] = Math.sin(a) * TH; J[o + 1] = Math.cos(a) * TH;
      a -= p[2 + i * 2] * D; J[o + 2] = J[o] + Math.sin(a) * SHN; J[o + 3] = J[o + 1] + Math.cos(a) * SHN;
      a = p[5 + i * 2] * D; J[q] = J[2] + Math.sin(a) * UA; J[q + 1] = J[3] + Math.cos(a) * UA;
      a += p[6 + i * 2] * D; J[q + 2] = J[q] + Math.sin(a) * FA; J[q + 3] = J[q + 1] + Math.cos(a) * FA;
    }
    const r = p[10] * D, c = Math.cos(r), sn = Math.sin(r); let low = -1e9;
    for (let i = 0; i < 22; i += 2) { const x = J[i], y = J[i + 1] + 8; J[i] = x * c - y * sn; J[i + 1] = x * sn + y * c - 8; if (J[i + 1] > low) low = J[i + 1]; }
    low = Math.max(low, J[5] + HR);
    let ox = f.x, oy;
    if (f.pin === 1) { ox = f.x - f.dir * s * (J[8] + J[12]) / 2; oy = f.y - s * (J[9] + J[13]) / 2; }
    else if (f.pin === 2) oy = f.y - f.lift - 14 * s;
    else oy = f.y - f.lift - low * s;
    for (let i = 0; i < 22; i += 2) { J[i] = ox + f.dir * J[i] * s; J[i + 1] = oy + J[i + 1] * s; }
  }
  /** Bend one arm (0 front, 1 back) so its hand is at a point, or as near as it reaches: two hands on one shaft. */
  function reach(f, i, tx, ty) {
    const J = f.J, q = 14 + i * 4, sx = J[2], sy = J[3], a = UA * f.s, b = FA * f.s;
    let dx = tx - sx, dy = ty - sy; const d = Math.hypot(dx, dy) || 1, m = U.clamp(d, 0.5, a + b - 0.2);
    dx /= d; dy /= d;
    const k = (a * a + m * m - b * b) / (2 * a * m), h = Math.sqrt(Math.max(0, 1 - k * k));
    let ex = sx + a * (k * dx - h * dy), ey = sy + a * (k * dy + h * dx); const ey2 = sy + a * (k * dy - h * dx);
    if (ey2 > ey) { ex = sx + a * (k * dx + h * dy); ey = ey2; }  // the elbow hangs down, not up
    J[q] = ex; J[q + 1] = ey; J[q + 2] = sx + dx * m; J[q + 3] = sy + dy * m;
  }
  function limbs(pa, hd, f) {
    const J = f.J;
    pa.moveTo(J[8], J[9]); pa.lineTo(J[6], J[7]); pa.lineTo(J[0], J[1]); pa.lineTo(J[10], J[11]); pa.lineTo(J[12], J[13]);
    pa.moveTo(J[0], J[1]); pa.lineTo(J[2], J[3]);
    pa.moveTo(J[16], J[17]); pa.lineTo(J[14], J[15]); pa.lineTo(J[2], J[3]); pa.lineTo(J[18], J[19]); pa.lineTo(J[20], J[21]);
    hd.moveTo(J[4] + HR * f.s, J[5]); hd.arc(J[4], J[5], HR * f.s, 0, 6.3);
  }
  /** Every figure in two strokes: a dark one underneath so the white reads on any backdrop. */
  function ink(g, pa, hd) {
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = INK; g.lineWidth = 5.2; g.stroke(pa); g.lineWidth = 2.8; g.stroke(hd);
    g.strokeStyle = BONE; g.lineWidth = 2.5; g.stroke(pa); g.fillStyle = BONE; g.fill(hd);
  }
  /** What there is to stand on: the bottom of the screen (always the first), then every tile's top edge. */
  function ground(ctx) {
    const out = [{i: 0, x1: 0, x2: ctx.w, y: ctx.h - 5, rect: null}];  // a little up, so feet show
    for (const b of ctx.rects) if (!b.hidden && !b.flat && b.w > 60) out.push({i: out.length, x1: b.x + (b.r || 0) * 0.45, x2: b.x + b.w - (b.r || 0) * 0.45, y: b.y, rect: b});
    return out;
  }
  /** Is the finger on this figure, and not over the middle of a tile (which keeps its own tap)? */
  function onFigure(f, x, y, ctx) {
    if (Math.abs(x - f.x) > 15 || y > f.y - f.lift + 5 || y < f.y - f.lift - 46 * f.s) return false;
    const r = U.over(ctx.rects, x, y, -18); return !r || !!r.flat;
  }

  // Two things happen to every figure of either kind, whatever it was doing, so they live here: the stare (a finger
  // came down somewhere: everyone stops and looks at the spot) and the fall (the screen was yanked sideways).
  // While one of them runs, the figure's own business is simply not stepped, so it carries on where it left off.
  const O_FLINCH = pose(-26, 34, 10, -10, 30, 150, 20, 165, -10, -15), O_COWER = pose(24, 70, 95, -10, 95, 150, 70, 140, 82, -20);
  const O_UP = pose(2, 6, 2, -6, 2, 8, 10, -8, 10), O_SIT = pose(-12, 84, 62, 78, 84, -30, -10, -40, -10, 6), O_FLAT = pose(0, 30, 6, 14, 30, 110, 20, 70, 30, 0, -90);
  const O_WIND = [[0.1, pose(-8, 26, 6, -16, 10, 172, 10, -70, -20, -6)], [0.22, pose(-20, 48, 6, 20, 10, -50, -10, 165, 20, -10, -25), 2]];  // arms windmill as the feet go
  const O_DUST = [[0, pose(10, 6, 2, -6, 2, 30, 40, 20, 60, 8)], [0.14, pose(10, 6, 2, -6, 2, 12, 30, 38, 44, 8)], [0.28, pose(10, 6, 2, -6, 2, 30, 40, 20, 60, 8)], [0.42, O_UP]];
  const late = (keys, t0) => keys.map(k => [k[0] + t0, k[1], k[2]]);
  const O_BACK = anim(2.75, false, [0, O_UP], ...O_WIND, [0.4, pose(0, 74, 10, 52, 34, 162, 0, 172, 10, 0, -90), 1], [0.55, pose(0, 96, 44, 62, 10, 150, 10, 165, 10, 10, -90)], [0.8, O_FLAT], [1.55, O_FLAT], [1.9, O_SIT], [2.1, O_SIT], ...late(O_DUST, 2.33));
  const O_SEAT = anim(2.4, false, [0, O_UP], ...O_WIND, [0.4, pose(-20, 88, 50, 80, 70, 150, 30, 160, 20, -8), 1], [0.55, O_SIT], [1.6, O_SIT], ...late(O_DUST, 1.98));
  const O_HANG = anim(1.6, false, [0, pose(4, 20, 30, -10, 30, 172, 6, 166, 8, -6)], [0.3, pose(-14, 40, 20, 24, 30, 176, 4, 170, 6, -10)], [0.6, pose(10, -24, 30, -40, 20, 170, 8, 164, 10, 0)], [0.9, pose(-8, 30, 24, 10, 30, 174, 6, 168, 8, -6)], [1.3, pose(4, 10, 40, -10, 20, 170, 8, 164, 10, -4)], [1.6, pose(8, 56, 78, 8, 8, 160, -26, 100, 40, -8)]);
  const STARE = 2.25, CHAT = 2.8, SHRUG = 3.3;  // when the stare ends, when they stop looking at each other, when they carry on

  /** A finger came down at (x, y). v picks this figure's way of gawping; cling: on a ladder, it only turns its head;
   *  plain: hands are full. A second touch while it stares moves the spot and starts the stare again. */
  function awe(f, x, y, v, cling, plain) {
    if (f.ov && f.ov.k) return;  // already falling over
    const near = !cling && Math.hypot(x - f.x, y - (f.y - f.lift - 20 * f.s)) < 50;
    if (f.ov) { f.ov.px = x; f.ov.py = y; f.ov.t = near ? 0 : Math.min(f.ov.t, 0.45); return; }
    f.ov = {k: 0, t: near ? 0 : 0.45, px: x, py: y, v: v % 5, cling, plain, base: plain ? f.p.slice() : O_UP, dir0: f.dir, x0: f.x, off: 0, hat: false};  // hands full: stay as they are; otherwise straighten up
  }
  /** The ground was yanked toward dir: the feet go with it and the rest does not. */
  function topple(f, dir, cling) {
    if (f.ov && f.ov.k) return;
    const x0 = f.ov ? f.ov.x0 : f.x, dir0 = f.ov ? f.ov.dir0 : f.dir;
    f.ov = {k: 1, t: 0, cling, an: cling ? O_HANG : Math.random() < 0.5 ? O_BACK : O_SEAT, dir0, x0, fd: dir};
    for (let j = 0; j < 12; j++) f.from[j] = f.p[j]; f.bl = f.blT = 0.1;
  }
  function endOv(f) { const o = f.ov; if (!o) return; f.ov = null; f.dir = o.dir0; f.x = o.x0; for (let j = 0; j < 12; j++) f.from[j] = f.p[j]; f.bl = f.blT = 0.2; }
  /** One frame of a stare or a fall. */
  function ovStep(f, dt, all) {
    const o = f.ov, p = f.p; o.t += dt;
    if (o.k) {
      if (o.t >= o.an.len) { endOv(f); return; }
      sample(o.an, o.t, p);
      if (f.bl > 0) { f.bl -= dt; const u = Math.max(0, f.bl / f.blT); for (let j = 0; j < 12; j++) p[j] += (f.from[j] - p[j]) * u; }
      if (!o.cling) { f.dir = o.fd; f.x = o.x0 + o.fd * 9 * Math.min(1, o.t / 0.3); }
      return;
    }
    if (o.t >= SHRUG) { endOv(f); return; }
    let tx = o.px, ty = o.py;
    if (o.t > STARE) {  // "did you see that?": look at whoever is nearest
      let best = 1e9; for (const m of all) if (m !== f && !m.gone) { const d = Math.abs(m.x - o.x0) + Math.abs(m.y - f.y); if (d < best) { best = d; tx = m.x; ty = m.y - m.lift - 34 * m.s; } }
    }
    if (!o.cling) f.dir = tx >= o.x0 ? 1 : -1;
    const el = U.clamp(Math.atan2(f.y - f.lift - 34 * f.s - ty, Math.abs(tx - o.x0) + 1) / D, -70, 85), b = o.base, q = b.slice(), stare = o.t <= STARE;
    q[9] = o.cling && (tx - o.x0) * f.dir < 0 ? -42 : U.clamp(-el * 0.55, -40, 32);  // the head goes back to look up, forward to look down
    q[0] = b[0] * 0.5 - Math.max(0, el) * 0.2; o.hat = false; o.tx = tx; o.ty = ty;
    let off = 0;
    if (o.t < 0.45) { for (let j = 0; j < 10; j++) q[j] = O_FLINCH[j]; off = -11; }  // too close: start back from it
    else if (stare && !o.plain) {
      if (o.v === 1) { q[5] = 118; q[6] = 112; }                                        // shade the eyes
      else if (o.v === 2) { q[5] = 90 + el; q[6] = 0; }                                 // point at it
      else if (o.v === 3 && el > 8) { for (let j = 0; j < 9; j++) q[j] = O_COWER[j]; }  // down on one knee, arms over the head
      else if (o.v === 4) { q[5] = 56; q[6] = 88; q[7] = 56; q[8] = 88; o.hat = true; } // hat off, held to the chest
    } else if (o.t > CHAT) { const w = Math.sin((o.t - CHAT) * 12) * 10; q[0] = 0; q[5] = 46; q[6] = 86 + w; q[7] = -46; q[8] = -86 - w; q[9] = 8; }  // shrug
    const k = Math.min(1, dt * 11); for (let j = 0; j < 10; j++) p[j] += (q[j] - p[j]) * k;
    o.off += (off - o.off) * Math.min(1, dt * 9); if (!o.cling) f.x = o.x0 + f.dir * o.off;
  }
  /** The shared beat of silence: three dots coming up over a staring head. */
  function dots(path, f) {
    const o = f.ov; if (!o || o.k || o.t < 1.3 || o.t > STARE + 0.25) return;
    const n = Math.min(3, 1 + ((o.t - 1.3) / 0.28 | 0)), y = f.J[5] - 11 * f.s;
    for (let i = 0; i < n; i++) path.rect(f.J[4] - 6 + i * 5, y, 2.2, 2.2);
  }
  /** A blank round head cannot look anywhere, so a staring one gets an eye: a dot on the side of the head nearest the spot. */
  function eye(path, f) {
    const o = f.ov; if (!o || o.k || o.tx == null) return;
    const dx = o.tx - f.J[4], dy = o.ty - f.J[5], d = Math.hypot(dx, dy) || 1, x = f.J[4] + dx / d * 2.4 * f.s, y = f.J[5] + dy / d * 2.4 * f.s;
    path.moveTo(x + 1.2, y); path.arc(x, y, 1.2, 0, 6.3);
  }

  // Other kinds' creatures (ctx.scene). A goose is never a friend: any figure it comes for runs in terror.
  const O_PA = pose(38, 70, 50, -55, 80, 172, 8, 160, -10, -8), O_PB = pose(38, -55, 80, 70, 50, 160, -10, 172, 8, -8);  // legs a blur, arms straight up
  const O_YELP = pose(-20, 20, 40, 10, 60, -40, -60, -50, -70, -20), O_PEEK = pose(24, 44, 78, -10, 82, 60, 80, 40, 90, 14);
  const O_PANIC = anim(0.1667, true, [0, O_PA], [0.0833, O_PB], [0.1667, O_PA]);
  function goose(sc, f) { let best = null, bd = 1e9; if (sc) for (const a of sc.actors) if (a.kind === 'goose') { const d = Math.hypot(a.x - f.x, a.y - f.y); if (d < bd) { bd = d; best = a; } } return best && {g: best, d: bd}; }
  /** Is this goose a reason to run: near and coming closer, very near, or making for this very figure? */
  function scared(f, gz) {
    const was = f.gd == null ? 1e9 : f.gd, c = gz.g.chasing; f.gd = gz.d;
    return gz.d < 220 && (gz.d < was - 0.3 || gz.d < 110 || (!!c && typeof c === 'object' && Math.hypot(c.x - f.x, c.y - f.y) < 90));
  }
  /** Terror, drawn: an exclamation mark over the head and, while running, a wheel where the legs should be. */
  function marks(dotP, thinP, f, wheel) {
    dotP.rect(f.J[4] - 1.2, f.J[5] - 19 * f.s, 2.4, 7); dotP.rect(f.J[4] - 1.2, f.J[5] - 10 * f.s, 2.4, 2.4);
    if (wheel) { const y = f.J[1] + 9 * f.s; thinP.moveTo(f.J[0] + 10, y); thinP.arc(f.J[0], y, 10, 0, 6.3); thinP.moveTo(f.J[0] + 6, y); thinP.arc(f.J[0], y, 6, 0, 6.3); }
  }

  // ======================================================================================================
  // Snow crew: it snows, the snow lies on the tile tops and along the bottom, and a crew shovels it off.
  // ======================================================================================================
  const S_STAND = pose(2, 6, 2, -6, 2, 8, 10, -8, 10), S_WA = pose(6, 30, 6, -24, 22, -28, 18, 28, 24), S_WB = pose(4, 8, 2, 6, 58, -6, 12, 6, 14);
  const S_C1 = pose(8, 56, 78, 8, 8, 160, -26, 100, 40, -8), S_ST = pose(4, 50, 85, -4, 4, 30, 112, 40, 105);
  const S_DR = pose(12, 22, 14, -18, 10, 40, 30, 10, 60, 5, 0, 120), S_DS = pose(50, 36, 40, -28, 30, 26, 8, 20, 30, 16, 0, 138);
  const S_DT = pose(-18, 14, 6, -20, 12, 150, 20, 120, 40, -12, 0, -42), S_SIT = pose(-12, 84, 62, 78, 84, -30, -10, -40, -10, 6);
  const SA = {
    stand: anim(1, false, [0, S_STAND]),
    walk: anim(0.56, true, [0, S_WA], [0.14, S_WB], [0.28, flip(S_WA)], [0.42, flip(S_WB)], [0.56, S_WA]),
    climb: anim(0.44, true, [0, S_C1], [0.22, flip(S_C1)], [0.44, S_C1]),
    hold: anim(1, false, [0, pose(4, 12, 6, -12, 6, 118, 22, 100, 34, -6)]),
    hop: anim(1, false, [0, pose(12, 42, 54, -8, 44, -34, 22, 44, 22)]),
    // scoop at 0.4, lift, throw over the shoulder at 1.0
    dig: anim(1.6, true, [0, S_DR], [0.32, S_DS, 1], [0.5, pose(44, 36, 40, -28, 30, 30, 10, 20, 30, 12, 0, 122)], [0.8, pose(8, 20, 14, -16, 10, 60, 40, 20, 70, 0, 0, 96)], [1.0, S_DT, 1], [1.2, S_DT], [1.6, S_DR]),
    lean: anim(2.4, true, [0, pose(14, 6, 2, 22, 10, 60, 60, 50, 70, 8)], [1.2, pose(17, 6, 2, 22, 10, 60, 60, 50, 70, 12)], [2.4, pose(14, 6, 2, 22, 10, 60, 60, 50, 70, 8)]),
    wipe: anim(0.7, true, [0, pose(0, 6, 2, -6, 2, 8, 10, 128, 104, -8)], [0.35, pose(0, 6, 2, -6, 2, 8, 10, 132, 126, -4)], [0.7, pose(0, 6, 2, -6, 2, 8, 10, 128, 104, -8)]),
    stamp: anim(0.4, true, [0, S_ST], [0.2, flip(S_ST)], [0.4, S_ST]),
    wave: anim(0.4, true, [0, pose(0, 6, 2, -6, 2, 172, -24, -8, 10, -6)], [0.2, pose(0, 6, 2, -6, 2, 168, 28, -8, 10, -6)], [0.4, pose(0, 6, 2, -6, 2, 172, -24, -8, 10, -6)]),
    fist: anim(0.3, true, [0, pose(10, 18, 8, -14, 6, 128, 58, -24, 30)], [0.15, pose(10, 18, 8, -14, 6, 128, 98, -24, 30)], [0.3, pose(10, 18, 8, -14, 6, 128, 58, -24, 30)]),
    ball: anim(0.9, false, [0, S_STAND], [0.3, pose(-16, 22, 8, -18, 10, 40, 30, -70, -50, -5)], [0.45, pose(22, -8, 5, 26, 22, -30, 20, 112, 6, 4), 1], [0.9, S_STAND]),
    // feet shoot forward, flat on the back with the legs in the air, sit up, stand
    slip: anim(2.3, false, [0, S_STAND], [0.16, pose(-20, 62, 6, 44, 12, 140, 10, 152, 10, -10, -45)], [0.36, pose(0, 74, 10, 52, 34, 162, 0, 172, 10, 0, -90), 1],
      [0.5, pose(0, 96, 44, 62, 10, 150, 10, 165, 10, 10, -90)], [0.75, pose(0, 30, 6, 14, 30, 110, 20, 70, 30, 0, -90)], [1.3, pose(0, 30, 6, 14, 30, 110, 20, 70, 30, 0, -90)],
      [1.7, S_SIT], [1.95, S_SIT], [2.3, S_STAND]),
  };
  const HATS = ['#e0483e', '#2fa7b8', '#f09a2a', '#8d5fd3', '#4caf50', '#f2cf3a'];

  /** Draw one platform's snow into the hidden layer: a soft mound through the tops of its columns. */
  function paint(st, P) {
    const g = st.lg, n = P.n, top = P.y - P.cap * 1.4 - 5;
    g.clearRect(P.x1 - 7, top, P.x2 - P.x1 + 14, P.y + 10 - top); P.dirty = false;
    let px = P.x1 - 4, py = P.y + (P.i ? 2.5 : 9), any = false; const py0 = py;
    g.beginPath(); g.moveTo(px, py);
    for (let i = 0; i < n; i++) {
      const e = Math.min(i, n - 1 - i), x = P.x1 + i * P.dx, h = P.cols[i] * (e === 0 ? 0.4 : e === 1 ? 0.82 : 1), y = P.y + 1.5 - h;
      if (h > 0.6) any = true;
      if (i) g.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2); else g.lineTo(x, y);
      px = x; py = y;
    }
    g.quadraticCurveTo(px, py, P.x2 + 4, py0); g.closePath();
    if (!any) return;
    g.fillStyle = 'rgba(247,251,255,.97)'; g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(120,150,195,.6)'; g.stroke();
  }
  /** The shortest way from one platform to another, as the list of links to take. */
  function route(a, b) {
    if (a === b) return [];
    const prev = new Map([[a, null]]), q = [a];
    while (q.length) {
      const c = q.shift();
      for (const L of c.links) {
        const o = L.a === c ? L.b : L.a; if (!o.ok || prev.has(o)) continue;
        prev.set(o, [c, L]);
        if (o === b) { const out = []; for (let e = prev.get(o); e; e = prev.get(e[0])) out.unshift(e[1]); return out; }
        q.push(o);
      }
    }
    return null;
  }
  /** Queue the walking, hopping and ladder work that takes a figure to another platform. The ladder comes along:
   *  it is only ever left standing while its owner is on the platform at one of its ends. Returns where it stands. */
  function travel(st, f, to) {
    let cur = st.plats[f.pl], placed = f.lad.on ? f.lad.link : null; const q = f.q, path = route(cur, to);
    if (!path) return undefined;
    const take = () => { if (placed) { const top = placed.b === cur; q.push({a: 'walk', x: top ? placed.xb : placed.xf}, {a: 'grab', link: placed, top}); placed = null; } };
    for (const L of path) {
      if (!L.type) { take(); const fromA = L.a === cur, o = fromA ? L.b : L.a; q.push({a: 'walk', x: fromA ? L.xa : L.xb}, {a: 'hop', x: fromA ? L.xb : L.xa, y: o.y, pl: o.i}); cur = o; continue; }
      const up = L.a === cur;
      if (placed !== L) { take(); q.push({a: 'walk', x: up ? L.xf : L.xb}, {a: 'place', link: L, top: !up}); placed = L; } else q.push({a: 'walk', x: up ? L.xf : L.xb});
      if (!up) q.push({a: 'hop', x: L.fx + (L.tx - L.fx) * 0.9 + L.sd * 5, y: L.fy + (L.ty - L.fy) * 0.9, pl: -1});
      q.push({a: 'climb', link: L, up}); cur = up ? L.b : L.a;
    }
    return placed;
  }
  /** Decide what a figure does next: go to the deepest snow it can get to, or rest, or pack up. */
  function plan(st, f) {
    const cur = st.plats[f.pl], q = f.q; let best = null, bx = 0, bs = -1;
    // now and then one of them tramps straight over to where a workmate is busy, and walks into them: that starts a row
    if (!st.row && st.clock > st.rowNext && st.snowing && Math.random() < (st.force === 'brawl' ? 1 : 0.6)) {
      const m = st.crew.filter(o => o !== f && !o.gone && !o.fear && !o.ov && o.act && (o.act.a === 'dig' || o.act.a === 'rest') && st.plats[o.pl].ok)[0];
      if (m && travel(st, f, st.plats[m.pl]) !== undefined) { f.job = null; q.push({a: 'walk', x: m.x}); return; }
    }
    for (const P of st.plats) {
      if (!P.ok) continue;
      const far = P === cur ? 0 : 0.06 + Math.abs(P.y - cur.y) / 2500, keen = P.i ? 1 : 0.45;  // the tile tops come first: the ground can wait
      for (let i = 0; i < P.n; i++) {
        const v = P.cols[i] / P.cap; if (v < 0.3) continue;
        const cx = P.x1 + i * P.dx; let sc = v * keen - far - Math.abs(cx - f.x) / 3000 + Math.random() * 0.1;
        for (const o of st.crew) if (o !== f && !o.gone && o.job === P && (P.i || Math.abs(o.jx - cx) < 130)) sc -= 0.5;  // one to a tile; the bottom has room for all
        if (sc > bs) { bs = sc; best = P; bx = cx; }
      }
    }
    if (best && bs > -0.4) {
      f.job = best; f.jx = bx; travel(st, f, best);
      // stand on the outer side and face the tile's middle, so the throw over the shoulder clears the edge
      const d = bx > (best.x1 + best.x2) / 2 ? -1 : 1;
      q.push({a: 'walk', x: U.clamp(bx - d * 20, best.x1 + 2, best.x2 - 2)}, {a: 'dig', dir: d, n: 2 + (Math.random() * 3 | 0)});
      const r = Math.random();
      if (r < st.pace.rest) q.push([{a: 'rest', an: SA.lean, tool: 2, dur: 2.6}, {a: 'rest', an: SA.wipe, tool: 2, dur: 1.6}, {a: 'rest', an: SA.stamp, tool: 0, dur: 1.4}][Math.random() * 3 | 0]);
      else if (r < st.pace.rest + st.pace.ball) { const m = st.crew.filter(o => o !== f && !o.gone && !o.re && Math.abs(o.x - bx) + Math.abs(o.y - best.y) < 460)[0]; if (m) q.push({a: 'ball', to: m}); }
      return;
    }
    f.job = null;
    if (st.snowing) { q.push({a: 'rest', an: SA.lean, tool: 2, dur: 2 + Math.random() * 2}); return; }
    const left = travel(st, f, st.plats[0]);  // nothing left to clear and the snow has stopped: home
    if (left) q.push({a: 'walk', x: left.xf}, {a: 'grab', link: left, top: false});
    q.push({a: 'exit', x: f.x < st.w / 2 ? -50 : st.w + 50});
  }
  function react(f, an, len) { f.re = {an, t: 0, len}; f.an = null; play(f, an, 0.1); }
  /** One figure's turn: carry on with what it is doing, or pick the next thing. */
  function crewStep(st, f, dt) {
    f.tool = 0;
    if (f.re) { f.re.t += dt; if (f.re.t < f.re.len && f.an) { tick(f, dt); return; } f.re = null; f.an = null; }  // (a row or a fright may have cut the reaction short)
    let a = f.act;
    if (!a) {
      if (!f.q.length) plan(st, f);
      a = f.act = f.q.shift(); if (!a) return;
      a.t = 0; a.x0 = f.x; a.y0 = f.y; if (a.a === 'climb') a.u = a.up ? 0 : 0.9;
    }
    a.t += dt; let done = false; const P = st.plats[f.pl];
    if (a.a === 'walk' || a.a === 'exit') {
      const d = a.x - f.x;
      if (Math.abs(d) < 1.5) { done = true; if (a.a === 'exit') f.gone = true; }
      else { f.dir = d > 0 ? 1 : -1; f.x += f.dir * Math.min(Math.abs(d), 46 * f.s * dt); play(f, SA.walk); }
    } else if (a.a === 'hop') {
      const u = Math.min(1, a.t / 0.36); if (Math.abs(a.x - a.x0) > 3) f.dir = a.x > a.x0 ? 1 : -1;
      f.x = a.x0 + (a.x - a.x0) * u; f.y = a.y0 + (a.y - a.y0) * u; f.lift = Math.sin(u * Math.PI) * 9; play(f, SA.hop, 0.08);
      if (u >= 1) { f.lift = 0; if (a.pl >= 0) f.pl = a.pl; done = true; }
    } else if (a.a === 'place' || a.a === 'grab') {
      play(f, SA.hold); f.dir = a.top ? a.link.sd : -a.link.sd; f.lad.link = a.link; f.lad.k = a.a === 'place' ? a.t / 0.55 : 1 - a.t / 0.55;
      if (a.t >= 0.55) { f.lad.on = a.a === 'place'; f.lad.k = f.lad.on ? 1 : 0; f.lad.len = a.link.len; done = true; }
    } else if (a.a === 'climb') {
      const L = a.link; f.dir = -L.sd; a.u += (a.up ? 1 : -1) * 42 * dt / L.len; const u = U.clamp(a.u, 0, 0.9);
      f.x = L.fx + (L.tx - L.fx) * u + L.sd * 5; f.y = L.fy + (L.ty - L.fy) * u; play(f, SA.climb);
      if (a.up ? a.u >= 0.9 : a.u <= 0) { done = true; if (a.up) f.q.unshift({a: 'hop', x: L.xb, y: L.b.y, pl: L.b.i}); else { f.pl = L.a.i; f.y = L.a.y; } }
    } else if (a.a === 'dig') {
      f.dir = a.dir; f.tool = 1; play(f, SA.dig); const ph = a.t % 1.6, was = ph - dt, bx = f.x + f.dir * 20 * f.s;
      if (was < 0.4 && ph >= 0.4) {  // the blade goes in: the pile under it goes down
        let sum = 0; for (let i = 0; i < P.n; i++) { const d = Math.abs(P.x1 + i * P.dx - bx); if (d < 22) { const k = Math.min(P.cols[i], 4.6 * (1 - d / 30)); P.cols[i] -= k; sum += k; } }
        f.load = sum; P.dirty = true;
      }
      if (was < 1.0 && ph >= 1.0 && f.load > 0.3) {  // over the shoulder
        if (st.bits.length < 14) st.bits.push({x: f.x - f.dir * 6, y: f.y - 40 * f.s, vx: -f.dir * (50 + Math.random() * 50), vy: -150 - Math.random() * 50, amt: f.load, y0: P.y, r: 2 + Math.min(2.5, f.load * 0.25), life: 9, by: f});
        f.load = 0;
      }
      if (a.t >= a.n * 1.6) done = true;
      else if (was < 0 && a.t > 1) { let m = 0; for (let i = 0; i < P.n; i++) if (Math.abs(P.x1 + i * P.dx - bx) < 22) m = Math.max(m, P.cols[i]); if (m < 1.2) done = true; }  // scraped clean: look elsewhere
    } else if (a.a === 'rest') { play(f, a.an); f.tool = a.tool; done = a.t >= a.dur; }
    else if (a.a === 'ball') {
      const m = a.to; f.dir = m.x > f.x ? 1 : -1; play(f, SA.ball);
      if (a.t - dt < 0.45 && a.t >= 0.45) st.balls.push({x0: f.J[20], y0: f.J[21], to: m, by: f, t: 0, dur: Math.max(0.3, Math.hypot(m.x - f.x, m.y - f.y) / 330)});
      done = a.t >= 0.9;
    }
    if (f.an) tick(f, dt);
    if (!f.lad.on && !f.lad.k && (a.a === 'walk' || a.a === 'exit')) { f.p[5] = 24; f.p[6] = 66; }  // the ladder goes under this arm
    if (done) f.act = null;
  }

  /** A goose is coming: drop everything and run. One on a ladder stays there, clinging and shaking. */
  function fearStart(st, f) {
    endOv(f); if (f.row) rowEnd(st);
    const cling = !!f.act && f.act.a === 'climb';
    f.fear = {t: 0, safe: 0, cling, sx: f.x, sy: f.y, hx: f.J[4], hy: f.J[5], yelp: 0, hop: 0, run: false}; f.re = null; f.load = 0; f.an = null;
    if (!cling) { f.q.length = 0; f.act = null; }
  }
  function fearStep(st, f, dt, gz) {
    const fe = f.fear, P = st.plats[f.pl], p = f.p; fe.t += dt; f.tool = 0; fe.run = false;
    if (f.ov) { if (f.ov.k) { ovStep(f, dt, st.crew); return; } endOv(f); }  // a yanked screen still knocks them over
    const near = !!gz && gz.d < 320; fe.safe = near ? 0 : fe.safe + dt; fe.yelp -= dt;
    if (fe.cling) { sample(SA.climb, 0, p); f.x += Math.sin(st.clock * 40) * 0.8; if (fe.safe > 2) f.fear = null; return; }
    if (near) {
      const away = f.x >= gz.g.x ? 1 : -1, end = away > 0 ? P.x2 - 3 : P.x1 + 3;
      if (fe.hop > 0) {  // pecked: straight up with a yelp, hands to the backside
        fe.hop -= dt; f.lift = Math.sin(Math.max(0, fe.hop) / 0.6 * Math.PI) * 34; for (let j = 0; j < 10; j++) p[j] += (O_YELP[j] - p[j]) * 0.6;
        f.x += away * Math.min(Math.abs(end - f.x), 90 * dt); f.an = null;
      } else if (gz.d < 28 && fe.yelp <= 0) { fe.hop = 0.6; fe.yelp = 1.5; }
      else if (Math.abs(end - f.x) > 4) { f.lift = 0; f.dir = away; f.x += away * Math.min(Math.abs(end - f.x), 150 * dt); play(f, O_PANIC, 0.05); tick(f, dt); fe.run = true; }
      else {
        // the end of the tile: across the gap to the next one if there is one, otherwise cower right here
        let to = null, tx = 0; for (const L of P.links) if (!L.type && (away > 0 ? L.a === P : L.b === P)) { to = away > 0 ? L.b : L.a; tx = away > 0 ? L.xb : L.xa; }
        if (to && to.ok) { f.pl = to.i; f.x = tx; f.y = to.y; }
        else { f.an = null; for (let j = 0; j < 10; j++) p[j] += (O_COWER[j] - p[j]) * 0.5; f.x = end + Math.sin(st.clock * 40) * 0.8; }
      }
      return;
    }
    // it has gone: peek out, look both ways, and only then go back for the shovel
    f.lift = 0; f.an = null; f.dir = Math.sin(fe.safe * 5) > 0 ? 1 : -1; for (let j = 0; j < 10; j++) p[j] += (O_PEEK[j] - p[j]) * 0.4;
    if (fe.safe > 2) { f.fear = null; f.q.length = 0; f.act = null; if (Math.abs(f.y - fe.sy) < 2) f.q.push({a: 'walk', x: U.clamp(fe.sx, P.x1 + 2, P.x2 - 2)}); f.q.push({a: 'rest', an: SA.wipe, tool: 2, dur: 1.4}); }
  }

  // A row between two of the crew. Mostly it is fists and shouting; now and then it turns into a proper fight, which
  // borrows the stick fight's moves and player wholesale (shovels for staffs) and adds a few of its own in the snow.
  const R_FIST = pose(18, 20, 10, -16, 8, 128, 60, -24, 30), R_WIDE = pose(-6, 8, 4, -8, 4, 70, 40, -70, -40, -6), R_PUFF = pose(48, 16, 24, -12, 22, 8, 14, 4, 16, 20);
  let BRAWL = null;
  function brawlMoves() {
    if (BRAWL) return BRAWL;
    const up1 = pose(0, 40, 20, -30, 10, 150, 10, 160, 10), up2 = flip(up1), laugh = pose(-12, 6, 2, -6, 2, 80, 0, -20, 40, -10);
    const wind = pose(-16, 22, 8, -18, 10, 40, 30, -70, -50, -5), chuck = pose(22, -8, 5, 26, 22, -30, 20, 112, 6, 4);
    const A = [[0, K.G]], B = [[0, K.G]];
    for (let i = 0; i < 4; i++) { const t = 0.15 + i * 0.3; A.push([t, wind], [t + 0.12, chuck, {e: 1}], ['ball', t + 0.12]); B.push([t + 0.14, i % 2 ? K.BB : K.BA, {e: 1, x: -2 - i * 2}], ['star', t + 0.2, 4, 0.7]); }
    A.push([1.5, K.G]); B.push([1.5, K.G]);
    BRAWL = MOVES.filter(m => !m.go && !m.sw && !m.end && m.n !== 'disarm' && m.n !== 'midair' && m.n !== 'backflip').concat([
      // kicked head-first into a drift, legs going
      {n: 'buried', w: 2, d: 27, wp: 0, A: track([0, K.G], [0.14, K.CH, {x: 3}], [0.26, K.SK, {e: 1, x: 7}], [0.55, K.SK], [0.8, K.G, {x: 5}], [1.3, laugh], [2.0, laugh], [2.3, K.G]),
        B: track([0, K.G], [0.26, K.G2], [0.33, K.RL, {e: 1, x: -8}], [0.55, K.TK, {c: 2, up: 20, x: -34, rot: -120, e: 2}], [0.8, up1, {x: -56, rot: -180, up: -9, e: 2}], [1.0, up2, {up: -9}], [1.2, up1, {up: -9}], [1.4, up2, {up: -9}], [1.6, up1, {up: -9}],
          [1.95, O_SIT, {rot: -360}], [2.3, K.G], ['dust', 0.8], ['dust', 0.86], ['dust', 1.0], ['dust', 1.4])},
      {n: 'snowballs', w: 2, d: 32, wp: 0, A: track.apply(null, A), B: track.apply(null, B)},   // a flurry at point-blank range
      // the big kick... on ice
      {n: 'slipkick', w: 2, d: 30, wp: 0, A: track([0, K.G], [0.14, K.CH, {x: 3}], [0.26, K.HK, {e: 1, x: 8}], [0.42, pose(0, 74, 10, 52, 34, 162, 0, 172, 10), {rot: -90, e: 1}], [0.6, pose(0, 96, 44, 62, 10, 150, 10, 165, 10, 10)], [1.3, pose(0, 30, 6, 14, 30, 110, 20, 70, 30)], [1.7, O_SIT, {rot: 0}], [2.1, K.G], ['dust', 0.45]),
        B: track([0, K.G], [0.3, K.DK, {e: 1}], [0.6, K.G], [1.0, laugh], [1.7, laugh], [2.1, K.G])},
    ]);
    return BRAWL;
  }
  function rowStart(st, a, b) {
    const same = a.pl === b.pl && Math.abs(a.x - b.x) < 40;
    st.rowNext = 1e9;  // the wait for the next one starts when this one is over
    const row = st.row = {a, b, t: 0, stage: 0, same, brawl: same && (st.force === 'brawl' || Math.random() < st.pace.brawl), end: 0, du: {tag: '', last: ''}};
    for (const f of [a, b]) { f.row = row; f.q.length = 0; f.act = null; f.re = null; f.an = null; f.cur = null; f.wpn = 0; f.load = 0; }
    a.dir = b.x >= a.x ? 1 : -1; b.dir = -a.dir;
  }
  function rowEnd(st) { const row = st.row; if (!row) return; st.rowNext = st.clock + U.lerp(st.pace.bump[0], st.pace.bump[1], Math.random()); for (const f of [row.a, row.b]) { f.row = null; f.q.length = 0; f.cur = null; f.act = null; f.an = null; f.wpn = 0; f.lift = 0; f.pin = 0; f.p[10] = 0; f.y = st.plats[f.pl].y; } st.row = null; }
  function rowStep(st, row, dt) {
    const a = row.a, b = row.b, P = st.plats[a.pl], two = [a, b]; row.t += dt; const t = row.t, ease = (f, q) => { f.an = null; for (let j = 0; j < 10; j++) f.p[j] += (q[j] - f.p[j]) * 0.5; };
    if (row.stage < 3) {
      for (const f of two) if (!f.ov) {
        f.tool = 0;
        if (t < 0.4) { ease(f, O_FLINCH); if (row.same) f.x = U.clamp(f.x - f.dir * 42 * dt, st.plats[f.pl].x1 + 2, st.plats[f.pl].x2 - 2); }  // stagger half a step
        else if (t < 2.4) { if (f === a) { ease(f, R_FIST); f.p[6] = 60 + Math.sin(t * 22) * 22; } else { ease(f, R_WIDE); f.p[9] = -6 + Math.sin(t * 9) * 5; } }  // the fist; "what's your problem?"
        else if (!row.brawl) { if (t > 2.8) f.dir = f === a ? -Math.sign(b.x - a.x) || 1 : Math.sign(b.x - a.x) || 1; ease(f, S_STAND); f.p[5] = 60 + (t - 2.4) * 90; f.p[6] = -30; }  // a wave of the hand and back to work
      }
      if (t >= 2.4 && row.brawl) { row.stage = 3; row.end = st.clock + 8 + Math.random() * 7; }
      else if (t >= 3.2) rowEnd(st);
      return;
    }
    let busyN = 0;
    for (const f of two) {
      if (f.ov) { busyN++; continue; }
      if (advance(st, f, dt)) busyN++; else { play(f, KA.g, 0.15); tick(f, dt); }
      f.tool = f.wpn ? 1 : 0;
      while (f.em.length) {  // what would be sparks and dust in the other fight is snow here
        const e = f.em.shift(), o = f === a ? b : a, n = e[0] === 'ball' ? 1 : 3;
        for (let i = 0; i < n && st.bits.length < 22; i++) st.bits.push(e[0] === 'ball' ? {x: f.J[20], y: f.J[21], vx: f.dir * 260, vy: -40, amt: 0, y0: 1e9, r: 2.3, life: Math.abs(o.x - f.x) / 300}
          : {x: e[0] === 'dust' ? f.x : f.J[16] + f.dir * 8, y: e[0] === 'dust' ? f.y - 4 : f.J[17], vx: (Math.random() - 0.5) * 150, vy: -60 - Math.random() * 110, amt: 0, y0: 1e9, r: 1.8, life: 0.6});
      }
    }
    if (busyN) return;
    const dA = b.x >= a.x ? 1 : -1;
    if (row.stage === 3 && st.clock < row.end) {
      // the next move: any that fits on this tile, shovels out for the staff ones (st.only: the test page asks for one by name)
      const armed = Math.random() < 0.45, A = Math.random() < 0.5 ? a : b, B = A === a ? b : a, d = A === a ? dA : -dA, c = [];
      for (const m of brawlMoves()) if (st.only ? m.n === st.only : (m.wp === 1) === armed && m.n !== row.du.last) { const xa = fit(P, m, A.x, d); if (xa != null) c.push([m, xa]); }
      if (!c.length) { row.end = 0; return; }
      const pick = c[Math.random() * c.length | 0]; a.wpn = b.wpn = pick[0].wp === 1 ? 1 : 0;
      startMove(st, row.du, pick[0], A, B, pick[1], d); row.du.last = pick[0].n;
    } else if (row.stage === 3) {  // out of breath: hands on knees, then a grudging handshake
      a.wpn = b.wpn = 0; for (const f of two) f.q.push({tr: track([0, K.G], [0.3, R_PUFF], [0.9, pose(44, 16, 24, -12, 22, 8, 14, 4, 16, 16)], [1.5, R_PUFF], [1.9, K.STD])});
      const m = {d: 24, A: T_SHAKE, B: T_SHAKE}, xa = fit(P, m, a.x, dA); startMove(st, row.du, m, a, b, xa == null ? a.x : xa, dA); row.stage = 5;
    } else rowEnd(st);
  }

  // "How often": every timed or chance-driven extra in the snow crew, in one place.
  //   bump  seconds from the end of one row between two of the crew to the next (least, most)
  //   brawl the chance that a row turns into a proper fight
  //   rest  the chance of a breather after a spell of digging;  ball  of a snowball at a workmate instead
  const S_PACE = {
    rarely: {bump: [150, 240], brawl: 0.2, rest: 0.1, ball: 0.05},
    sometimes: {bump: [50, 80], brawl: 0.33, rest: 0.18, ball: 0.1},
    often: {bump: [20, 30], brawl: 0.5, rest: 0.22, ball: 0.14},
    constantly: {bump: [8, 8], brawl: 0.9, rest: 0.3, ball: 0.25},
  };

  HP.fx.add('snowcrew', {
    label: 'Snow crew',
    live: true, fps: 12,
    options: [{key: 'crew', label: 'Crew', type: 'range', min: 1, max: 6, step: 1, default: 3},
      {key: 'always', label: 'Whatever the weather', type: 'bool', default: false},
      {key: 'pace', label: 'How often', type: 'select', choices: [['rarely', 'Rarely'], ['sometimes', 'Sometimes'], ['often', 'Often'], ['constantly', 'Constantly']], default: 'often'}],
    create(ctx) {
      const r = ctx.rand, W = ctx.w, H = ctx.h, plats = ground(ctx);
      for (const P of plats) {
        P.cap = P.i ? Math.min(14, 0.16 * Math.min(P.rect.w, P.rect.h)) : 24;
        P.n = Math.max(3, Math.round((P.x2 - P.x1) / 15) + 1); P.dx = (P.x2 - P.x1) / (P.n - 1);
        P.cols = new Float32Array(P.n); P.links = []; P.ok = false; P.dirty = true; P.pend = 0; P.seen = 0;
      }
      const link = (type, a, b, o) => { const L = Object.assign({type, a, b}, o); a.links.push(L); b.links.push(L); };
      for (let i = 1; i < plats.length; i++) {
        const P = plats[i], b = P.rect;
        // neighbours at the same height: a figure just steps across the gap
        for (let j = i + 1; j < plats.length; j++) {
          const Q = plats[j]; if (Math.abs(P.y - Q.y) > 6) continue;
          const l = P.x1 < Q.x1 ? P : Q, o = l === P ? Q : P, gap = o.x1 - l.x2;
          if (gap > 0 && gap < 50) link(0, l, o, {xa: l.x2 - 2, xb: o.x1 + 2});
        }
        // a ladder against either side: its foot stands on whatever is below, a little out from the tile
        for (const sd of [-1, 1]) {
          const sx = sd < 0 ? b.x : b.x + b.w, fx = sx + sd * 22; if (fx < 8 || fx > W - 8) continue;
          let F = null; for (const Q of plats) if (Q !== P && Q.y > P.y + 30 && fx >= Q.x1 && fx <= Q.x2 && (!F || Q.y < F.y)) F = Q;
          if (!F || F.y - P.y > 300) continue;
          link(1, F, P, {sd, fx, fy: F.y, tx: sx + sd * 3, ty: P.y + 3, xb: sd < 0 ? P.x1 + 3 : P.x2 - 3, xf: U.clamp(fx + sd * 6, F.x1 + 2, F.x2 - 2), len: Math.hypot(19, F.y - P.y - 3)});
        }
      }
      // which tops the crew can get to at all (a top too near the screen's top edge has no headroom)
      plats[0].ok = true;
      for (let q = [plats[0]]; q.length;) { const c = q.shift(); for (const L of c.links) { const o = L.a === c ? L.b : L.a; if (!o.ok && o.y >= 46) { o.ok = true; q.push(o); } } }
      // a panel that wakes while it is snowing shows snow that has been falling for a while
      if (ctx.opts.always || /^snowy/.test(ctx.env.weather || '')) for (const P of plats) { const nz = U.noise(ctx.seed + P.i * 13); for (let i = 0; i < P.n; i++) P.cols[i] = P.cap * (0.3 + 0.55 * (nz(i * 0.37) * 0.5 + 0.5)); }
      const crew = [], n = U.clamp(Math.round(+ctx.opts.crew || 3), 1, 6);
      for (let i = 0; i < n; i++) { const f = figure(0, plats[0].y, 0.9 + r() * 0.2); Object.assign(f, {gone: true, q: [], act: null, re: null, job: null, jx: 0, pl: 0, tool: 0, load: 0, hat: HATS[i], n: i * 2 + 1, rq: 0, ov: null, fear: null, row: null, gd: null, cur: null, em: [], wpn: 0, tt: 0, x0: 0, y0: 0, fxi: 0, lad: {on: false, k: 0, link: null, len: 130}, T: new Float32Array(4)}); crew.push(f); }
      const flakes = []; for (let i = 0; i < 38; i++) flakes.push({x: r() * W, y: r() * H, v: 22 + r() * 30, w: 0.6 + r() * 1.2, ph: r() * 6.28, z: 1.4 + r() * 1.4});
      const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
      return {plats, crew, flakes, layer, lg: layer.getContext('2d'), bits: [], balls: [], req: null, quake: 0, row: null, pace: S_PACE[ctx.opts.pace] || S_PACE.often, rowNext: (S_PACE[ctx.opts.pace] || S_PACE.often).bump[0] * 0.6, force: null, on: false, snowing: false, rr: 0, clock: 0, look: 0, w: W, h: H};
    },
    // a finger dragged along a pile brushes it off, as on the plain snow overlay
    drag(st, x, y) {
      if (!st.on) return;
      for (const P of st.plats) {
        if (x < P.x1 - 10 || x > P.x2 + 10 || y < P.y - P.cap - 16 || y > P.y + 16) continue;
        for (let i = 0; i < P.n; i++) if (P.cols[i] > 0.5 && Math.abs(P.x1 + i * P.dx - x) < 22) {
          if (st.bits.length < 20) st.bits.push({x: P.x1 + i * P.dx, y: P.y - 3, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40, amt: 0, y0: 1e9, r: 1.8, life: 0.7});
          P.cols[i] = 0; P.dirty = true;
        }
      }
    },
    touch(st, x, y) { if (st.on) st.req = {x, y, id: (st.req ? st.req.id : 0) + 1, ttl: 1.5}; },
    swipe(st, dir) {
      if (!st.on) return;
      st.quake = 1;
      for (const f of st.crew) if (!f.gone && !(f.act && f.act.a === 'hop')) topple(f, dir, !!f.act && f.act.a === 'climb');
    },
    tap(st, x, y, ctx) {
      if (!st.on) return;
      for (const f of st.crew) if (!f.gone && onFigure(f, x, y, ctx)) {
        endOv(f);  // its own reaction comes first; the others go on staring
        if (f.re) return true;
        const a = f.act && f.act.a, firm = !a || a === 'walk' || a === 'dig' || a === 'rest';  // nobody falls off a ladder
        if (firm && Math.random() < 0.55) react(f, SA.slip, 2.3); else react(f, SA.wave, 1.4);
        return true;
      }
    },
    draw(g, st, ctx, t, dt) {
      const snowing = st.snowing = !!ctx.opts.always || /^snowy/.test(ctx.env.weather || ''), W = st.w, H = st.h, plats = st.plats;
      if (snowing) st.on = true;
      if (!st.on) return;
      st.clock += dt;
      // snow settles (or, once it has stopped, slowly goes): two platforms a frame, so no frame does them all
      for (let k = 0; k < 2; k++) {
        const P = plats[st.rr = (st.rr + 1) % plats.length], el = st.clock - P.seen; P.seen = st.clock;
        const rate = snowing ? P.cap / 150 : -(P.ok ? 0.035 : 0.12);
        for (let i = 0; i < P.n; i++) P.cols[i] = U.clamp(P.cols[i] + rate * el * (0.4 + Math.random() * 1.2), 0, P.cols[i] > P.cap ? P.cols[i] : P.cap);
        P.pend += Math.abs(rate) * el; if (P.pend > 0.5) { P.pend = 0; P.dirty = true; }
      }
      // the crew comes when there is work and goes when there is none
      if ((st.look -= dt) < 0) {
        st.look = 1.5; let work = false, most = 0;
        for (const P of plats) for (let i = 0; i < P.n; i++) { if (P.cols[i] > most) most = P.cols[i]; if (P.ok && P.cols[i] > P.cap * 0.3) work = true; }
        const out = st.crew.every(f => f.gone);
        if (snowing && work) st.crew.forEach((f, i) => { if (f.gone) { f.gone = false; f.x = i % 2 ? W + 24 + (i >> 1) * 60 : -24 - (i >> 1) * 60; f.y = plats[0].y; f.pl = 0; f.q.length = 0; f.act = null; f.lad.on = false; f.lad.k = 0; } });
        else if (!snowing && out && most < 0.4 && !st.bits.length) { st.on = false; st.lg.clearRect(0, 0, W, H); return; }
      }
      if (st.req && (st.req.ttl -= dt) < 0) st.req = null;
      st.quake = Math.max(0, st.quake - dt * 0.8);
      for (let k = 0, n = 0; k < plats.length && n < 3; k++) if (plats[k].dirty) { paint(st, plats[k]); n++; }
      g.drawImage(st.layer, 0, 0);

      // one walks into another on the same tile top (or backs into one who is digging): a row
      const sc = ctx.scene || null, firm = f => !f.gone && !f.ov && !f.fear && !f.row && !f.re && f.act && (f.act.a === 'walk' || f.act.a === 'dig' || f.act.a === 'rest');
      if (!st.row && st.clock > st.rowNext) for (let i = 0; i < st.crew.length && !st.row; i++) for (let j = i + 1; j < st.crew.length; j++) {
        const a = st.crew[i], b = st.crew[j];
        if (a.pl === b.pl && Math.abs(a.x - b.x) < 15 && firm(a) && firm(b) && (a.act.a === 'walk' || b.act.a === 'walk') && (!a.lad.k || a.lad.on) && (!b.lad.k || b.lad.on)) { rowStart(st, a, b); break; }
      }
      if (st.row) rowStep(st, st.row, dt);
      const rails = new Path2D(), rungs = new Path2D(), pa = new Path2D(), hd = new Path2D(), shafts = new Path2D(), blades = new Path2D(), white = new Path2D(), eyes = new Path2D(), whl = new Path2D();
      for (const f of st.crew) {
        if (f.gone) continue;
        // a finger came down: stop (once any hop has landed) and stare
        const rq = st.req, on = f.act && f.act.a;
        if (rq && f.rq !== rq.id && on !== 'hop') { f.rq = rq.id; if (!f.fear) awe(f, rq.x, rq.y, f.n + rq.id, on === 'climb', on === 'climb' || (f.tool === 1 && !f.row)); }
        const gz = goose(sc, f); if (!gz) f.gd = null;
        if (!f.fear && gz && on !== 'hop' && scared(f, gz)) fearStart(st, f);
        const row = st.row;
        if (f.fear) fearStep(st, f, dt, gz);
        else if (f.ov) ovStep(f, dt, st.crew);
        else if (f.row) { /* stepped with its opponent, above */ }
        else if (row && row.stage === 3 && firm(f) && !(f.lad.k && !f.lad.on)) {  // a fight: down tools and watch; one of them cheers
          f.dir = row.a.x >= f.x ? 1 : -1; f.tool = f.n % 3 ? 2 : 0; play(f, f.n % 3 ? SA.lean : SA.wave); tick(f, dt);
        }
        else crewStep(st, f, dt);
        if (sc) sc.next.push({kind: 'stick', role: 'crew', x: f.x, y: f.y, h: 40 * f.s});
        solve(f);
        // the ladder: leaning on its tile, under an arm, or swinging between the two
        const la = f.lad, L = la.link, k = la.on ? 1 : la.k, half = la.len / 2, cx = f.J[2], cy = f.J[3] + 7 * f.s;
        let x1 = cx - f.dir * half * 0.97, y1 = cy + half * 0.2, x2 = cx + f.dir * half * 0.97, y2 = cy - half * 0.2;
        // while its owner digs or rests on the spot, a carried ladder lies on the ground beside them
        const aa = f.act && f.act.a, busy = !la.on && !k && (f.re || f.row || f.fear || aa === 'dig' || aa === 'rest' || aa === 'ball');
        if (busy && !la.d) { la.gx = f.x; la.gd = f.dir; }
        la.d = U.clamp((la.d || 0) + (busy ? 5 : -5) * dt, 0, 1);
        if (la.d) { const gy = st.plats[f.pl].y - 2; x1 += (la.gx - la.gd * half - x1) * la.d; x2 += (la.gx + la.gd * half - x2) * la.d; y1 += (gy - y1) * la.d; y2 += (gy - y2) * la.d; }
        if (k > 0) { const ex = (L.tx - L.fx) / L.len * 9, ey = (L.ty - L.fy) / L.len * 9; if (L.sd * f.dir > 0 === x1 < x2) { const a = x1, b = y1; x1 = x2; y1 = y2; x2 = a; y2 = b; } x1 += (L.fx - x1) * k; y1 += (L.fy - y1) * k; x2 += (L.tx + ex - x2) * k + Math.sin(st.clock * 19) * 6 * st.quake * k; y2 += (L.ty + ey - y2) * k; }
        const dl = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / dl * 3.4, ny = (x2 - x1) / dl * 3.4;
        rails.moveTo(x1 + nx, y1 + ny); rails.lineTo(x2 + nx, y2 + ny); rails.moveTo(x1 - nx, y1 - ny); rails.lineTo(x2 - nx, y2 - ny);
        rungs.moveTo(x1, y1); rungs.lineTo(x2, y2);
        // the shovel: in both hands, planted to lean on, or slung across the back
        const J = f.J, s = f.s, T = f.T;
        if (f.fear && !f.fear.cling) { T[0] = f.fear.sx - 13; T[1] = T[3] = f.fear.sy - 2; T[2] = f.fear.sx + 13; }  // dropped where it stood
        else if (f.tool === 1) { const a = (f.p[11] + f.p[10]) * D, vx = f.dir * Math.sin(a), vy = -Math.cos(a); T[0] = J[16] - vx * 11 * s; T[1] = J[17] - vy * 11 * s; T[2] = J[16] + vx * 15 * s; T[3] = J[17] + vy * 15 * s; reach(f, 1, T[0], T[1]); }
        else if (f.ov && f.ov.k && !f.ov.cling && f.ov.t < f.ov.an.len - 0.6) {  // knocked out of the hands: it spins off and lies there until picked up
          const u = Math.min(1, f.ov.t / 0.5), a = u < 1 ? f.ov.t * 15 : 0, mx = f.ov.x0 - f.ov.fd * 34 * u, my = f.y - 2 - 24 * (1 - u) - 70 * u * (1 - u), c = Math.cos(a) * 13, sn = Math.sin(a) * 13;
          T[0] = mx - c; T[1] = my - sn; T[2] = mx + c; T[3] = my + sn;
        }
        else if (f.tool === 2) { T[0] = f.x + f.dir * 10 * s; T[1] = f.y - 26 * s; T[2] = f.x + f.dir * 12 * s; T[3] = f.y - 1; reach(f, 0, T[0], T[1] + 1); if (f.an === SA.lean) reach(f, 1, T[0], T[1] + 1); }
        else { T[0] = J[0] + f.dir * 4 * s; T[1] = J[1] - 1; T[2] = J[2] - f.dir * 7 * s + (J[2] - J[0]) * 0.8; T[3] = J[3] + (J[3] - J[1]) * 0.8; }
        shafts.moveTo(T[0], T[1]); shafts.lineTo(T[2], T[3]);
        const bl = Math.hypot(T[2] - T[0], T[3] - T[1]) || 1, ux = (T[2] - T[0]) / bl, uy = (T[3] - T[1]) / bl;
        blades.moveTo(T[2] - ux, T[3] - uy); blades.lineTo(T[2] + ux * 5 * s, T[3] + uy * 5 * s);
        if (f.load > 0.3) { white.moveTo(T[2] + 3, T[3] - 2); white.arc(T[2] + ux * 2, T[3] + uy * 2 - 2, 3.2, 0, 6.3); }
        limbs(pa, hd, f); dots(white, f); eye(eyes, f);
        if (f.fear) marks(white, whl, f, f.fear.run); else if (f.row && f.row.stage < 3 && f.row.t > 0.4) marks(white, whl, f, false);
      }
      g.lineCap = 'round';
      g.strokeStyle = INK; g.lineWidth = 3.4; g.stroke(rails);
      g.strokeStyle = '#d6ae72'; g.lineWidth = 1.7; g.stroke(rails);
      g.lineCap = 'butt'; g.lineWidth = 6.8; g.setLineDash([1.7, 8.3]); g.stroke(rungs); g.setLineDash([]);  // rungs: one dashed stroke down the middle
      ink(g, pa, hd);
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.5; g.stroke(whl);
      g.strokeStyle = INK; g.lineWidth = 3.6; g.stroke(shafts); g.strokeStyle = '#c99a5e'; g.lineWidth = 1.6; g.stroke(shafts);
      g.lineCap = 'butt'; g.strokeStyle = INK; g.lineWidth = 8; g.stroke(blades); g.strokeStyle = '#b9c6d6'; g.lineWidth = 6; g.stroke(blades);
      // woolly hats, one colour each, so the crew can be told apart
      for (const f of st.crew) if (!f.gone) { const J = f.J, a = Math.atan2(J[5] - J[3], J[4] - J[2]); g.fillStyle = f.hat; g.beginPath(); if (f.ov && f.ov.hat) g.arc(J[20], J[21] + 1, HR * f.s + 0.9, 0, Math.PI); else if (f.fear && !f.fear.cling) { const fe = f.fear; fe.hx += (J[4] - fe.hx) * 0.3; fe.hy += (J[5] - 10 - fe.hy) * 0.3; g.arc(fe.hx, fe.hy, HR * f.s + 0.9, Math.PI, 0); }  // the hat comes off and follows a moment later
        else { const k = f.row && f.row.stage < 3 ? 0.6 : 0; g.arc(J[4], J[5], HR * f.s + 0.9, a - 1.45 + k, a + 1.45 + k); } g.fill(); }

      g.fillStyle = '#0b1022'; g.fill(eyes);
      // thrown snow, brushed-off puffs, snowballs and the falling flakes: all one white fill
      for (let i = st.bits.length - 1; i >= 0; i--) {
        const c = st.bits[i], py = c.y; c.vy += 480 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt;
        let gone = c.life <= 0 || c.x < -12 || c.x > W + 12 || c.y > H + 12;
        if (c.by && c.vy > 0 && !st.row && st.clock > st.rowNext) for (const f of st.crew) {  // a shovelful lands on a workmate
          if (f === c.by || Math.abs(c.x - f.x) > 10 || Math.abs(c.y - f.y + 30) > 16 || !firm(f) || !firm(c.by)) continue;
          rowStart(st, f, c.by); c.amt = 0; c.life = 0.2; c.by = null; break;
        }
        if (!gone && c.amt && c.vy > 0) for (const P of plats) {
          if ((P.y < c.y0 + 8 && P.i) || c.x < P.x1 || c.x > P.x2 || c.y < P.y - 3 || py > P.y + 4) continue;
          // it lands: on a lower pile it adds to the pile; thrown along the bottom it just scatters
          if (P.y > c.y0 + 8) { const j = Math.round((c.x - P.x1) / P.dx); P.cols[j] = Math.min(P.cap * 1.3, P.cols[j] + c.amt * 0.3); P.dirty = true; }
          c.amt = 0; c.life = 0.25; c.vy = -40; c.vx *= 0.3; c.r = 1.6; break;
        }
        if (gone) st.bits.splice(i, 1); else { white.moveTo(c.x + c.r, c.y); white.arc(c.x, c.y, c.r, 0, 6.3); }
      }
      for (let i = st.balls.length - 1; i >= 0; i--) {
        const b = st.balls[i], m = b.to; b.t += dt; const u = Math.min(1, b.t / b.dur), x = b.x0 + (m.J[4] - b.x0) * u, y = b.y0 + (m.J[5] - b.y0) * u - Math.sin(u * Math.PI) * 26;
        white.moveTo(x + 2.4, y); white.arc(x, y, 2.4, 0, 6.3);
        if (u >= 1) {  // smack: the one who was hit shakes a fist at the thrower
          st.balls.splice(i, 1);
          for (let k = 0; k < 4 && st.bits.length < 20; k++) st.bits.push({x, y, vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 60, amt: 0, y0: 1e9, r: 1.5, life: 0.5});
          const a = m.act && m.act.a; if (!m.re && !m.gone && !m.row && !m.fear && !m.ov && a !== 'climb' && a !== 'hop') { m.dir = b.by.x > m.x ? 1 : -1; react(m, SA.fist, 1.3); }
        }
      }
      for (const f of st.flakes) {
        f.y += f.v * dt; f.x += Math.sin(st.clock * f.w + f.ph) * 9 * dt;
        if (f.y > H + 4) { if (!snowing) continue; f.y = -4; f.x = Math.random() * W; }
        white.rect(f.x, f.y, f.z, f.z);
      }
      g.fillStyle = 'rgba(255,255,255,.92)'; g.fill(white);
    },
  });

  // ======================================================================================================
  // Stick fight: duels in the manner of the old wire-work films. Nobody is hurt; every round ends in a bow.
  //
  // Some moves cut real tiles (HP.chip). The rules for that damage, all of them requirements:
  //   - only corners, never a tile that is flat or hidden, at most two corners of one tile at a time
  //   - each leg of a cut is at least 14 px and at most 30% of that side of the tile and 70 px
  //   - every cut is temporary: it heals by itself after 45 to 75 seconds, and all of them heal at the bow that ends a round
  //   - everything is mended at once when the kind is built again, when a cut tile is pressed, on a swipe, and when
  //     the page is hidden
  //   - every touch of a tile is inside try/catch, and if drawing ever throws, all tiles are mended first:
  //     a fault here must never leave a tile cut
  // ======================================================================================================
  const K = {
    STD: pose(2, 6, 2, -6, 2, 8, 10, -8, 10),
    G: pose(8, 30, 24, -24, 26, 72, 62, 38, 98, 0, 0, 30), G2: pose(6, 26, 34, -28, 34, 78, 56, 32, 104, 2, 0, 34),  // on guard
    JF: pose(18, 34, 24, -30, 14, 94, -2, 30, 112), JB: pose(24, 32, 28, -34, 10, 46, 104, 98, -4, 2),             // punches
    BA: pose(-6, 24, 26, -24, 28, 96, 78, 46, 96, -4), BB: pose(-4, 24, 26, -24, 28, 44, 100, 100, 74, -4),        // forearm blocks
    DK: pose(55, 52, 100, -18, 100, 66, 84, 44, 96, 20),                                                           // duck
    CH: pose(-8, 0, 2, 74, 112, 62, 74, -24, 46), SK: pose(-30, -8, 4, 94, 0, 36, 84, -50, 24, -6), HK: pose(-38, -10, 6, 128, 0, 28, 90, -70, 16, -10),  // knee up, side kick, high kick
    WH: pose(10, -14, 10, 20, 30, 30, 110, 10, 120), FK: pose(-28, 96, 0, 58, 122, -40, -20, 96, 62),              // wound up to spin; flying kick
    RL: pose(-30, 34, 8, -8, 34, 152, 18, 172, -12, -22), SD: pose(26, 50, 70, -52, 4, 60, 40, -40, 20, 8),        // knocked back; braking skid
    KN: pose(18, 70, 95, -10, 95, 32, 22, 4, 4, 14), SA: pose(0, 4, 2, -4, 2, 56, 88, 56, 88), BW: pose(52, 4, 3, -4, 3, 40, 80, 40, 80, 12),  // on one knee; fist in palm; bow
    CR: pose(0, 0, 0, 86, 112, 128, 34, -128, -34), CR2: pose(3, 0, 0, 80, 108, 120, 40, -134, -30, 2),            // crane
    TK: pose(30, 104, 132, 96, 128, 64, 62, 52, 72, 26), LU: pose(12, 62, 74, -42, 52, 112, 18, -74, -18, -6), GL: pose(34, 34, 22, -52, 30, 132, 8, -104, -8, -16),  // tuck, leap, glide
    LD: pose(30, 56, 98, -14, 102, 42, 40, -42, 30, 14), CRH: pose(26, 48, 84, -12, 88, 30, 50, -30, 40, 10),      // landing; crouch to spring
    RA: pose(26, 56, 42, -46, 72, -44, 84, 52, 82, 4),
    SWP: pose(34, 82, 0, 62, 132, 50, 60, -50, -30, 8), JT: pose(6, 82, 112, 72, 122, 122, 32, -62, -28),          // leg sweep; knees up over it
    AP: pose(16, 40, 60, -30, 70, 96, -4, 20, 110), AK: pose(-24, 100, 4, 40, 110, 30, 80, -60, 20, -6), AB: pose(-6, 50, 80, -20, 80, 98, 76, 44, 98, -4),  // in the air
    ST: pose(8, 30, 24, -24, 26, 62, 48, 20, 70, 0, 0, 36), ST2: pose(6, 26, 34, -28, 34, 66, 44, 20, 74, 2, 0, 42),  // weapon at the ready
    SH: pose(-14, 22, 20, -26, 20, 162, 8, 150, 30, -8, 0, -34), SS: pose(24, 38, 28, -30, 12, 82, 8, 60, 30, 4, 0, 78),  // raised; brought down
    SB: pose(-8, 22, 28, -24, 28, 100, 24, 70, 40, 0, 0, 6), SO: pose(-4, 26, 30, -24, 30, 150, 10, 140, 30, -10, 0, 78),  // upright block; overhead block
    SL: pose(40, 52, 82, -30, 62, 48, 10, 30, 40, 10, 0, 118), STH: pose(28, 42, 30, -34, 8, 92, -2, 70, 30, 0, 0, 90),  // low; thrust
    SUP: pose(-6, 28, 22, -24, 22, 120, 10, 90, 30, -6, 0, 20),
    CT: pose(-4, 10, 8, -12, 10, 168, 6, 20, 40, -14), LK: pose(-6, 8, 6, -10, 8, 20, 30, 10, 30, -24), TS: pose(-10, 12, 8, -12, 8, 150, 20, -20, 20, -8, 0, -30),  // catch; look up; toss away
  };
  K.RB = flip(K.RA);
  const KA = {g: anim(0.6, true, [0, K.G], [0.3, K.G2], [0.6, K.G]), s: anim(0.6, true, [0, K.ST], [0.3, K.ST2], [0.6, K.ST]),
    std: anim(2, true, [0, K.STD], [1, pose(3, 6, 3, -6, 3, 9, 12, -7, 12, 2)], [2, K.STD]), crane: anim(1.6, true, [0, K.CR], [0.8, K.CR2], [1.6, K.CR])};
  // "How often": every timed or chance-driven extra in the fight, in one place.
  //   pwRound the chance that a round has power moves at all;  pwMax how many it may have;  pwW how strongly they are picked
  //   petFirst seconds a pettable creature must be on screen before the first truce;  petGap seconds from the end of one truce to the next
  //   rest    the pause between rounds;  flash  how much the long flashy moves (leaps, wall runs, mid-air) are favoured
  const K_PACE = {
    rarely: {pwRound: 0.35, pwMax: 1, pwW: 0.3, petFirst: 20, petGap: 300, rest: 2.0, flash: 0.6},
    sometimes: {pwRound: 1, pwMax: 1, pwW: 0.6, petFirst: 8, petGap: 90, rest: 1.6, flash: 0.8},
    often: {pwRound: 1, pwMax: 2, pwW: 1.4, petFirst: 3, petGap: 30, rest: 1.3, flash: 1},
    constantly: {pwRound: 1, pwMax: 99, pwW: 6, petFirst: 1.5, petGap: 10, rest: 0.7, flash: 1.6},
  };
  const SASH = ['#ff4d4d', '#3aa0ff', '#3ad17a', '#ffc530', '#c77dff', '#ff8a3d'];

  /** One fighter's part in a move. A key is [time, pose, {x: step forward, up: height, rot: turn, wa: weapon angle,
   *  dy: drop to another level, c: pin, e: ease}]; x, dy and rot carry on from the key before. An effect is
   *  ['name', time, ...]; ['arc', from, to, height] adds a floating arc on top. */
  function track(...items) {
    const k = [], fx = []; let x = 0, dy = 0, rot = 0, arc = null;
    for (const it of items) {
      if (typeof it[0] === 'string') { if (it[0] === 'arc') arc = it.slice(1); else fx.push(it); continue; }
      const o = it[2] || {}, p = it[1].slice();
      if (o.x != null) x = o.x; if (o.dy != null) dy = o.dy; if (o.rot != null) rot = o.rot; if (o.wa != null) p[11] = o.wa;
      p[10] += rot; p[12] = x; p[13] = o.up || 0; p[14] = o.c || 0; p[15] = dy; k.push([it[0], p, o.e || 0]);
    }
    fx.sort((a, b) => a[1] - b[1]);
    const xs = k.map(q => q[1][12]);
    return {k, fx, arc, len: k[k.length - 1][0], lo: Math.min.apply(null, xs), hi: Math.max.apply(null, xs)};
  }
  const T_ARM = track([0, K.G], [0.2, K.LK], [0.75, K.LK], [0.9, K.CT, {e: 1}], [1.05, K.CT], [1.45, K.ST, {wa: 396}], [1.6, K.ST, {wa: 396}], ['arm', 0, 0, 0.9]);
  const T_DROP = track([0, K.ST], [0.15, K.TS, {e: 1}], [0.4, K.TS], [0.62, K.G], ['drop', 0.15]);
  const T_SALUTE = track([0, K.STD], [0.25, K.SA], [0.55, K.BW], [1.0, K.BW], [1.3, K.SA], [1.5, K.G]);
  const T_WON = track([0, K.G], [0.3, K.SA], [0.7, K.BW], [1.4, K.BW], [1.8, K.SA], [2.1, K.STD]);
  const T_LOST = track([0, K.KN], [0.45, K.SA], [0.8, K.BW], [1.4, K.BW], [1.8, K.SA], [2.1, K.STD]);
  const T_VIEWER = track([0, K.STD], [0.25, K.SA], [0.55, K.BW], [1.25, K.BW], [1.55, K.SA], [1.75, K.G]);

  // The moves. A attacks, B answers; d is how far apart they start. wp: 1 needs weapons, 0 needs bare hands.
  // tag 'hit' marks a move that sends B back, after: 'hit' one that likes to follow it. Picked by weight (w).
  const MOVES = [
    {n: 'punches', w: 3, d: 22, wp: 0,
      A: track([0, K.G], [0.1, K.JF, {e: 1, x: 2}], [0.2, K.G2], [0.3, K.JB, {e: 1, x: 4}], [0.4, K.G2], [0.5, K.JF, {e: 1, x: 6}], [0.6, K.G2], [0.7, K.JB, {e: 1, x: 8}], [0.8, K.G2], [0.9, K.JF, {e: 1, x: 10}], [1.1, K.G],
        ['star', 0.1, 16, 0.6], ['star', 0.3, 20, 0.6], ['star', 0.5, 16, 0.6], ['star', 0.7, 20, 0.6], ['star', 0.9, 16, 0.8]),
      B: track([0, K.G], [0.1, K.BA, {e: 1, x: -2}], [0.3, K.BB, {e: 1, x: -4}], [0.5, K.BA, {e: 1, x: -6}], [0.7, K.BB, {e: 1, x: -8}], [0.9, K.BA, {e: 1, x: -10}], [1.1, K.G])},
    {n: 'spinkick', w: 2.5, d: 27, wp: 0,
      A: track([0, K.G], [0.14, K.WH, {x: 3}], [0.26, K.CH, {x: 5}], [0.36, K.HK, {e: 1, x: 8}], [0.6, K.HK], [0.82, K.G, {x: 6}], ['sw', 0.34, 1]),
      B: track([0, K.G], [0.2, K.G2], [0.32, K.DK, {e: 1}], [0.62, K.DK], [0.84, K.G])},
    {n: 'kickslide', w: 2.5, d: 27, wp: 0, tag: 'hit',
      A: track([0, K.G], [0.14, K.CH, {x: 3}], [0.26, K.SK, {e: 1, x: 7}], [0.55, K.SK], [0.8, K.G, {x: 5}], [1.22, K.G2], ['star', 0.27, 12, 1.2]),
      B: track([0, K.G], [0.26, K.G2], [0.33, K.RL, {e: 1, x: -8}], [0.5, K.SD, {x: -40, e: 1}], [1.0, K.SD, {x: -72}], [1.22, K.G], ['dust', 0.4], ['dust', 0.5], ['dust', 0.62], ['dust', 0.76], ['dust', 0.9])},
    {n: 'backflip', w: 1.4, d: 30, wp: 0, after: 'hit',
      A: track([0, K.G], [0.18, K.JF, {e: 1, x: 6}], [0.4, K.G2], [0.78, K.G, {x: 10}]),
      B: track([0, K.G], [0.1, K.CRH], [0.22, K.TK, {c: 2, up: 22, x: -14, rot: -100}], [0.4, K.TK, {c: 2, up: 28, x: -34, rot: -250, e: 2}], [0.55, K.LD, {x: -52, rot: -360, e: 2}], [0.78, K.G])},
    {n: 'sweep', w: 2, d: 33, wp: 0,
      A: track([0, K.G], [0.14, K.CRH, {x: 2}], [0.26, K.SWP, {e: 1, x: 6}], [0.5, K.SWP], [0.74, K.G, {x: 4}], ['sw', 0.24, 0]),
      B: track([0, K.G], [0.16, K.CRH], [0.28, K.JT, {up: 22, e: 1}], [0.48, K.JT, {up: 20}], [0.62, K.LD], [0.8, K.G])},
    // both spring up, trade blows while they hang there, and drift down again
    {n: 'midair', w: 2.6, d: 64, wp: 0,
      A: track([0, K.G], [0.12, K.CRH], [0.3, K.LU, {up: 46, x: 20, e: 1}], [0.42, K.AP, {up: 54, x: 22, e: 1}], [0.58, K.AB, {up: 56}], [0.72, K.AK, {up: 55, x: 23, e: 1}], [0.9, K.AP, {up: 52, x: 22, e: 1}], [1.02, K.AB, {up: 48, x: 20}], [1.32, K.LD, {x: 8}], [1.5, K.G],
        ['star', 0.43, 16, 0.8], ['star', 0.73, 8, 1], ['star', 0.91, 16, 0.8]),
      B: track([0, K.G], [0.12, K.CRH], [0.3, K.LU, {up: 46, x: 20, e: 1}], [0.42, K.AB, {up: 54, x: 22, e: 1}], [0.58, K.AK, {up: 56, x: 23, e: 1}], [0.72, K.AB, {up: 55, x: 22}], [0.9, K.AB, {up: 52}], [1.02, K.AP, {up: 48, x: 21, e: 1}], [1.32, K.LD, {x: 8}], [1.5, K.G],
        ['star', 0.59, 8, 1], ['star', 1.03, 16, 0.8])},
    // B takes the corner on one foot and waits; A edges in and gets a snap kick for it
    {n: 'crane', w: 1.6, d: 46, wp: 0, end: true,
      A: track([0, K.G], [0.5, K.G2, {x: 6}], [1.0, K.G, {x: 10}], [1.4, K.G2, {x: 14}], [1.62, K.BA, {e: 1, x: 8}], [1.9, K.BA, {x: 2}], [2.08, K.G]),
      B: track([0, K.G], [0.25, K.CR, {e: 1}], [0.6, K.CR2], [0.95, K.CR], [1.3, K.CR2], [1.5, K.CH], [1.62, K.SK, {e: 1, x: 8, up: 7}], [1.86, K.SK, {x: 10}], [2.08, K.G, {x: 8}], ['star', 1.63, 12, 1])},
    {n: 'clash', w: 3, d: 36, wp: 1,
      A: track([0, K.ST], [0.14, K.SH, {x: 2}], [0.26, K.SS, {e: 1, x: 6}], [0.44, K.SS], [0.56, K.SL, {x: 8}], [0.7, K.SUP, {e: 1, x: 10}], [0.86, K.SUP], [0.96, K.ST], [1.08, K.STH, {e: 1, x: 16}], [1.3, K.STH], [1.5, K.ST, {x: 14}],
        ['spark', 0.27], ['spark', 0.71], ['spark', 1.09]),
      B: track([0, K.ST], [0.14, K.ST2], [0.25, K.SB, {e: 1, x: -2}], [0.5, K.SB], [0.69, K.SL, {e: 1, x: -5, wa: 100}], [0.9, K.ST, {x: -7}], [1.07, K.SB, {e: 1, x: -14, wa: -14}], [1.3, K.SB, {wa: -14}], [1.5, K.ST, {x: -12}])},
    // a low sweep; B goes over it and comes down with an overhead blow that A catches above the head
    {n: 'lowhigh', w: 2.4, d: 36, wp: 1,
      A: track([0, K.ST], [0.14, K.CRH, {wa: 100}], [0.26, K.SL, {e: 1, x: 5}], [0.48, K.SL], [0.64, K.SO, {e: 1, x: 3}], [1.0, K.SO], [1.2, K.ST], ['sw', 0.24, 0]),
      B: track([0, K.ST], [0.16, K.CRH], [0.28, K.JT, {up: 24, e: 1, wa: -20}], [0.5, K.SH, {up: 26}], [0.68, K.SS, {up: 4, e: 1, x: 4}], [0.76, K.SS], [1.0, K.SS], [1.2, K.ST, {x: 2}], ['spark', 0.69])},
    // A knocks B's weapon spinning into the air; B flips back and plucks it out of the air
    {n: 'disarm', w: 1.8, d: 36, wp: 1,
      A: track([0, K.ST], [0.14, K.SL, {x: 3}], [0.26, K.SUP, {e: 1, x: 7}], [0.6, K.SUP], [0.95, K.ST, {x: 5}], [1.6, K.ST2], ['spark', 0.27]),
      B: track([0, K.ST], [0.26, K.ST2], [0.3, K.RL, {e: 1, x: -4}], [0.45, K.LK, {x: -8}], [0.58, K.CRH, {x: -10}], [0.74, K.TK, {c: 2, up: 28, x: -22, rot: -170, e: 2}], [0.92, K.TK, {c: 2, up: 34, x: -34, rot: -330, e: 2}],
        [1.04, K.CT, {up: 24, x: -40, rot: -360, e: 2}], [1.25, K.CT, {x: -44}], [1.6, K.ST, {wa: 396}], ['fling', 0.28, 0, 0.8])},
    {n: 'arm', w: 1, d: 60, wp: 0, sw: 1, A: T_ARM, B: T_ARM},      // weapons come spinning in from above and are caught
    {n: 'unarm', w: 1, d: 40, wp: 1, sw: 1, A: T_DROP, B: T_DROP},  // and are tossed away again
    {n: 'leap', w: 2.2, go: goLeap},
    {n: 'wallrun', w: 3, go: goWall},
    // powers: rare, a few a round at most, and commoner with weapons out
    {n: 'slash', w: 1.1, pw: 1, go: goPower('slash')}, {n: 'cross', w: 0.5, pw: 1, wp: 1, go: goPower('cross')}, {n: 'cyclone', w: 0.5, pw: 1, wp: 1, go: goPower('cyclone')},
    {n: 'cleave', w: 0.6, pw: 1, wp: 1, go: goPower('cleave')}, {n: 'slam', w: 0.4, pw: 1, go: goPower('slam')}, {n: 'palm', w: 0.8, pw: 1, wp: 0, go: goPower('palm')},
  ];
  // the best hit of the round: a flying kick, the world slows down, B goes tumbling and ends on one knee
  const FINISH = {n: 'finish', d: 62,
    A: track([0, K.G], [0.12, K.CRH], [0.26, K.FK, {up: 20, x: 30, e: 1}], [0.5, K.FK, {up: 22, x: 40}], [0.75, K.LD, {x: 46}], [1.0, K.G], [1.9, K.G2], ['big', 0.27, 8]),
    B: track([0, K.G], [0.27, K.G2], [0.32, K.RL, {e: 1, x: -6, up: 6}], [0.55, K.TK, {c: 2, up: 24, x: -40, rot: -200, e: 2}], [0.8, K.SD, {x: -70, rot: -360, e: 2}], [1.15, K.SD, {x: -92}], [1.5, K.KN], [1.9, K.KN],
      ['dust', 0.82], ['dust', 0.92], ['dust', 1.04])};


  // ---- world-shattering powers --------------------------------------------------------------------------
  K.CHG = pose(-6, 44, 50, -40, 30, -30, -30, 30, 90, 4, 0, -115); K.CHG2 = pose(-10, 46, 58, -42, 36, -40, -36, 26, 96, 2, 0, -122);  // drawn back, gathering
  K.SWG = pose(30, 50, 40, -44, 6, 100, 0, 60, 40, 6, 0, 95); K.MTX = pose(-72, 30, 70, 10, 80, -100, -10, -80, -20, -30);            // the swing; bent over backward under it
  K.PALM = pose(26, 46, 36, -40, 6, 92, 0, 96, 0, 4); K.PCH = pose(-4, 40, 46, -38, 28, 40, 90, -40, -60, 2); K.SLAM = pose(40, 56, 90, -20, 96, 60, 20, 40, 40, 12, 0, 135);
  const gather = t1 => [[0, K.G], [0.15, K.CHG], [t1 * 0.5, K.CHG2], [t1, K.CHG]];
  // Every power is charged where it can be seen coming, and every one is evaded. B is the answer used to see whether
  // the move fits on the tile; a slash has several answers and picks one to suit the way the blade of light is going.
  const PW = {
    slash: {d: 84,
      A: track(...gather(1.15), [1.28, K.SWG, {e: 1, x: 8}], [1.7, K.SWG], [2.0, K.G], ['charge', 0.12, 0, 1.1], ['slash', 1.28]),
      B: track([0, K.G], [1.1, K.G2], [1.27, K.SB, {e: 1, x: -4}], [1.6, K.SB], [1.9, K.G], ['spark', 1.3]),            // parried aside: it veers
      lean: track([0, K.G], [1.1, K.G2], [1.26, K.MTX, {e: 1}], [1.7, K.MTX], [2.0, K.G]),                            // bends backward under it
      duck: track([0, K.G], [1.1, K.G2], [1.26, K.DK, {e: 1}], [1.6, K.DK], [1.9, K.G]),
      leap: track([0, K.G], [1.05, K.CRH], [1.24, K.JT, {up: 44, e: 1}], [1.6, K.JT, {up: 40}], [1.85, K.LD], [2.0, K.G])},  // over it
    cross: {d: 84,  // two slashes crossing in an X; B goes over both in a back somersault
      A: track(...gather(1.15), [1.28, K.SWG, {e: 1, x: 6}], [1.4, K.SH], [1.52, K.SS, {e: 1, x: 10}], [1.9, K.SS], [2.15, K.G], ['charge', 0.12, 0, 1.1], ['slash2', 1.28], ['slash', 1.52]),
      B: track([0, K.G], [1.1, K.CRH], [1.26, K.TK, {c: 2, up: 46, x: -10, rot: -120, e: 1}], [1.6, K.TK, {c: 2, up: 52, x: -24, rot: -300, e: 2}], [1.8, K.LD, {x: -34, rot: -360, e: 2}], [2.15, K.G])},
    cyclone: {d: 60,  // a spin that throws three small slashes outward
      A: track(...gather(0.8), [0.92, K.WH, {wa: 0}], [1.35, K.WH, {wa: 1080, e: 2}], [1.55, K.G, {wa: 1110}], ['charge', 0.12, 0, 0.75], ['sw', 0.95, 1], ['cyc', 1.0], ['sw', 1.12, 1], ['sw', 1.28, 1]),
      B: track([0, K.G], [0.85, K.G2], [0.98, K.DK, {e: 1, x: -6}], [1.4, K.DK], [1.6, K.G])},
    cleave: {d: 60,  // straight down: a shockwave runs along the tile top and B hops it
      A: track([0, K.G], [0.2, K.SH], [0.95, K.SH], [1.06, K.SLAM, {e: 1, x: 6}], [1.5, K.SLAM], [1.8, K.G], ['charge', 0.15, 0, 0.85], ['shock', 1.07]),
      B: track([0, K.G], [1.0, K.CRH], [1.16, K.JT, {up: 28, e: 1}], [1.45, K.JT, {up: 24}], [1.65, K.LD], [1.85, K.G])},
    slam: {d: 50,  // a leap and a slam that makes every fallen piece at the bottom of the screen jump
      A: track([0, K.G], [0.15, K.CRH], [0.36, K.SH, {up: 30, e: 1}], [0.7, K.SH, {up: 34}], [0.82, K.SLAM, {e: 1}], [1.3, K.SLAM], [1.6, K.G], ['charge', 0.3, 0, 0.5], ['slam', 0.84], ['dust', 0.84]),
      B: track([0, K.G], [0.8, K.G2], [0.9, K.RL, {up: 10, e: 1}], [1.15, K.LD], [1.4, K.G])},
    palm: {d: 40,  // a ring of force from the open hands; B is pushed sliding, across onto the next tile if there is one
      A: track([0, K.G], [0.15, K.PCH], [0.6, K.PCH, {x: -2}], [1.0, K.PCH, {x: 0}], [1.12, K.PALM, {e: 1, x: 8}], [1.6, K.PALM], [1.9, K.G], ['charge', 0.12, 0, 0.95], ['ring', 1.13]),
      B: track([0, K.G], [1, K.G, {x: -40}])},
  };

  const CUT = [];  // every cut there is in a tile right now, whichever dashboard's fight made it
  const SGN = {tl: [1, 1], tr: [-1, 1], br: [-1, -1], bl: [1, -1]}, FWD = ['tl', 'br'], BACK = ['tr', 'bl'];
  /** Clip a tile, or with no cuts make it whole. The app does it properly; on the test page a clip-path stands in. */
  function chip(el, r, cuts) {
    try {
      if (HP.chip) { HP.chip(el, cuts); return; }
      if (!cuts) { el.style.clipPath = ''; return; }
      const w = r.w, h = r.h, c = cuts, q = [c.tl ? c.tl[0] + 'px 0px' : '0px 0px'];
      if (c.tr) q.push((w - c.tr[0]) + 'px 0px', w + 'px ' + c.tr[1] + 'px'); else q.push(w + 'px 0px');
      if (c.br) q.push(w + 'px ' + (h - c.br[1]) + 'px', (w - c.br[0]) + 'px ' + h + 'px'); else q.push(w + 'px ' + h + 'px');
      if (c.bl) q.push(c.bl[0] + 'px ' + h + 'px', '0px ' + (h - c.bl[1]) + 'px'); else q.push('0px ' + h + 'px');
      if (c.tl) q.push('0px ' + c.tl[1] + 'px');
      el.style.clipPath = 'polygon(' + q.join(',') + ')';
    } catch (e) { /* a tile that cannot be clipped is left as it is */ }
  }
  function sync(el, r) { let o = null; for (const c of CUT) if (c.el === el && !c.dead) { o = o || {}; o[c.key] = [c.a, c.d]; } chip(el, r, o); }
  function mend(c) { if (c.dead) return; c.dead = true; const i = CUT.indexOf(c); if (i >= 0) CUT.splice(i, 1); sync(c.el, c.r); }
  function mendAll() { const els = []; for (const c of CUT) { c.dead = true; if (els.indexOf(c.el) < 0) els.push(c.el); } CUT.length = 0; for (const el of els) chip(el, null, null); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) mendAll(); });

  /** Every corner a slash going this way could take off: a line like "\" takes top-right and bottom-left, "/" the others. */
  function eachCorner(st, ux, uy, fn) {
    for (const r of st.rects) {
      if (!r.el || r.flat || r.hidden) continue;
      const ma = Math.min(r.w * 0.3, 70), md = Math.min(r.h * 0.3, 70); if (ma < 14 || md < 14) continue;
      for (const key of ux * uy > 0 ? BACK : FWD) { const sg = SGN[key]; fn(r, key, sg[0] > 0 ? r.x : r.x + r.w, sg[1] > 0 ? r.y : r.y + r.h, sg, ma, md); }
    }
  }
  /** Does a stretch of the slash's line (from px, py, `step` long) pass through this corner's region? */
  const crosses = (px, py, ux, uy, step, cx, cy, sg, ma, md) => { const bx = cx + sg[0] * ma / 2 - px, by = cy + sg[1] * md / 2 - py, t = bx * ux + by * uy; return t >= 0 && t < step && Math.abs(bx * uy - by * ux) <= (ma * Math.abs(uy) + md * Math.abs(ux)) / 2; };
  const free = (el, key) => { let n = 0; for (const c of CUT) if (c.el === el) { if (c.key === key) return false; n++; } return n < 2 && CUT.length < 8; };
  function aimCount(st, x, y, ux, uy) { let n = 0; eachCorner(st, ux, uy, (r, key, cx, cy, sg, ma, md) => { if (free(r.el, key) && crosses(x, y, ux, uy, 3000, cx, cy, sg, ma, md)) n++; }); return Math.min(n, 3); }
  /** Move a slash on by one frame and cut what it crossed. True when it has left the screen. */
  function slashStep(st, s, dt) {
    const px = s.x, py = s.y, step = s.sp * dt; s.x += s.ux * step; s.y += s.uy * step; s.age += dt;
    if (s.veer && (s.x - s.veer) * s.ux > 0) {  // parried: it glances upward off the block
      const a = Math.atan2(s.uy, s.ux) + (s.ux > 0 ? -0.45 : 0.45); s.ux = Math.cos(a); s.uy = Math.sin(a); s.veer = 0;
      st.fx.push({k: 1, x: s.x, y: s.y, s: 1, t: 0, life: 0.3, a: Math.random() * 6});
    }
    if (s.n > 0) eachCorner(st, s.ux, s.uy, (r, key, cx, cy, sg, ma, md) => {
      if (s.n <= 0 || !free(r.el, key) || !crosses(px, py, s.ux, s.uy, step, cx, cy, sg, ma, md)) return;
      // the cut runs along the slash's own angle, as big as the limits allow
      const k = U.clamp(Math.abs(s.uy / s.ux), 0.15, 4), a0 = Math.min(ma, md / k), a = U.clamp(a0, 14, ma), d = U.clamp(a0 * k, 14, md);
      const c = {el: r.el, r, key, a, d, dead: false, heal: st.clock + 45 + Math.random() * 30}; CUT.push(c); sync(r.el, r); s.n--;
      let col = r.on ? 'rgba(255,196,120,.92)' : '';
      if (!col) { try { col = getComputedStyle(r.el).backgroundColor; } catch (e) { col = ''; } if (!col || /, 0\)$|transparent/.test(col)) col = 'rgba(232,236,255,.3)'; }
      const len = Math.hypot(a, d), dn = sg[1] > 0 ? 1 : -1;  // the piece first slides down along the cut
      st.pieces.push({c, col, sx: sg[0], sy: sg[1], a, d, rr: Math.min(r.r || 0, a * 0.5, d * 0.5), hx: cx + sg[0] * a / 3, hy: cy + sg[1] * d / 3, x: cx + sg[0] * a / 3, y: cy + sg[1] * d / 3,
        dx: -sg[0] * a / len * dn, dy: sg[1] * d / len * dn, vx: 0, vy: 0, rot: 0, vr: (Math.random() - 0.5) * 10, st: 0, t: 0, b: 0, ci: 0, gx: 0, gy: 0, gr: 0});
      st.fx.push({k: 4, x: cx + sg[0] * a, y: cy, x2: cx, y2: cy + sg[1] * d, s: 1, t: 0, life: 1.6});
    });
    return s.x < -60 || s.x > st.w + 60 || s.y < -60 || s.y > st.h + 60;
  }
  /** One cut-off corner: slide, fall, bounce, lie in the heap at the bottom; later float home and fuse. True when done with. */
  function pieceStep(st, p, dt) {
    if (p.c.dead) return true;  // mended at once somewhere else: nothing left to fall
    if (p.st !== 3 && st.clock >= p.c.heal) { if (p.st === 2) st.pile[p.ci] -= 8; p.st = 3; p.t = 0; p.gx = p.x; p.gy = p.y; p.gr = p.rot % 6.283; }
    p.t += dt;
    if (p.st === 0) { p.x += p.dx * 32 * dt; p.y += p.dy * 32 * dt; if (p.t > 0.3) { p.st = 1; p.vx = p.dx * 50; p.vy = p.dy * 50; } }
    else if (p.st === 1) {
      const py = p.y; p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.x < 12) { p.x = 12; p.vx = Math.abs(p.vx); } else if (p.x > st.w - 12) { p.x = st.w - 12; p.vx = -Math.abs(p.vx); }
      if (p.vy > 0 && p.b < 2) for (const P of st.plats) if (P.i && P.y > p.hy + 10 && p.x > P.x1 - 4 && p.x < P.x2 + 4 && py <= P.y - 5 && p.y > P.y - 5) {  // off a tile top below
        p.y = P.y - 5; p.vy *= -0.38; p.vx = p.vx * 0.5 + (Math.random() - 0.5) * 130; p.vr *= -0.7; p.b++;
        st.fx.push({k: 2, x: p.x, y: P.y - 2, s: 1, t: 0, life: 0.4}); break;
      }
      const ci = U.clamp(p.x / 24 | 0, 0, st.pile.length - 1), gy = st.h - 5 - st.pile[ci];
      if (p.y >= gy) { p.y = gy; p.st = 2; p.ci = ci; st.pile[ci] += 8; p.rot = Math.round(p.rot / Math.PI) * Math.PI + (Math.random() - 0.5) * 0.3; st.fx.push({k: 2, x: p.x, y: gy + 3, s: 1, t: 0, life: 0.5}); }
    } else if (p.st === 3) {
      const u = Math.min(1, p.t / 1.2), e = u * u * (3 - 2 * u); p.x = p.gx + (p.hx - p.gx) * e; p.y = p.gy + (p.hy - p.gy) * e; p.rot = p.gr * (1 - e);
      if (u >= 1) { mend(p.c); st.glows.push({x: p.hx, y: p.hy, s: 46, t: 0, life: 0.6}); return true; }
    }
    return false;
  }
  /** What a power move asks for at a given moment. */
  function power(st, f, e) {
    const k = e[0], J = f.J, hx = f.wpn ? f.tip[0] : J[16], hy = f.wpn ? f.tip[1] : J[17];
    const fire = (ux, uy, R, n, sp) => { if (st.slashes.length < 6) st.slashes.push({x: f.x + f.dir * 22, y: f.y - 24 * f.s, ux, uy, R, n, sp, col: f.col, veer: 0, age: 0}); };
    if (k === 'charge') f.chg = {t: 0, dur: e[3]};
    else if (k === 'slash' || k === 'slash2') {
      const a = f.aim || [f.dir * 0.94, -0.34]; fire(a[0], k === 'slash' ? a[1] : -a[1], 27, 3, 1000);
      if (k === 'slash' && f.veer) { st.slashes[st.slashes.length - 1].veer = f.veer; f.veer = 0; }
      st.fx.push({k: 0, x: hx, y: hy, s: 1.4, t: 0, life: 0.25});
    }
    else if (k === 'cyc') for (const a of [-22, -78, -150]) fire(f.dir * Math.cos(a * D), Math.sin(a * D), 15, 1, 800);
    else if (k === 'shock') st.shocks.push({P: st.plats[f.pl], x: f.x + f.dir * 16, d: f.dir});
    else if (k === 'slam') {
      for (const p of st.pieces) if (p.st === 2) { st.pile[p.ci] -= 8; p.st = 1; p.b = 9; p.vy = -220 - Math.random() * 170; p.vx = (Math.random() - 0.5) * 70; p.vr = (Math.random() - 0.5) * 12; }
      st.glows.push({x: f.x, y: f.y - 4, s: 70, t: 0, life: 0.4});
    }
    else if (k === 'ring') st.fx.push({k: 6, x: hx, y: hy, d: f.dir, s: 1, t: 0, life: 0.4});
  }
  /** A power move by name, as the move table wants it: can it be done here, and if so set it going. */
  function goPower(name) {
    return (st, du, A, B, dry) => {
      const m = PW[name], P = st.plats[A.pl], dA = B.x >= A.x ? 1 : -1, xa = fit(P, m, A.x, dA);
      if (xa == null) return false; if (dry) return true;
      let Bt = m.B, Q = null;
      if (name === 'slash' || name === 'cross') {
        // of a few angles tried, take the one whose line meets the most corners
        let best = null, bn = -1;
        for (let i = 0; i < 10; i++) { const an = (12 + Math.random() * 22) * D * (name === 'cross' || i % 2 ? -1 : 1), ux = dA * Math.cos(an), uy = Math.sin(an), n = aimCount(st, xa + dA * 22, P.y - 24, ux, uy); if (n > bn) { bn = n; best = [ux, uy]; } }
        A.aim = best; A.veer = 0;
        if (name === 'slash') { if (best[1] > 0) Bt = m.leap; else if (B.wpn && Math.random() < 0.5) A.veer = xa + dA * (m.d - 18); else Bt = Math.random() < 0.5 ? m.lean : m.duck; }
      } else if (name === 'palm') {
        const xb = xa + dA * m.d, room = Math.abs((dA > 0 ? P.x2 - 4 : P.x1 + 4) - xb);
        for (const N of st.plats) { const gap = dA > 0 ? N.x1 - P.x2 : P.x1 - N.x2; if (N.i && N !== P && Math.abs(N.y - P.y) < 6 && gap > 0 && gap < 50 && N.x2 - N.x1 > 70 && !busy(st, N, du)) Q = N; }
        const far = Q ? room + 62 : Math.min(room, 120), it = [[0, K.G], [1.1, K.G2], [1.18, K.RL, {e: 1, x: -6}], [1.3, K.SD, {x: -Math.min(30, far), e: 1}], [2.0, K.SD, {x: -far}], [2.25, K.G]];
        for (let t = 1.3; t < 2; t += 0.12) it.push(['dust', t]);
        Bt = track.apply(null, it);
      }
      startMove(st, du, {d: m.d, A: m.A, B: Bt}, A, B, xa, dA);
      if (Q) B.q[B.q.length - 1].pl = Q.i;
      du.pwn++; return true;
    };
  }
  /** Under the figures: shockwaves and their cracks, slashes doing their cutting, the fallen corners. */
  function powerUnder(g, st, dt, hot, dot3) {
    for (let i = st.shocks.length - 1; i >= 0; i--) {
      const s = st.shocks[i]; s.x += s.d * 420 * dt;
      if (s.x < s.P.x1 || s.x > s.P.x2) { st.shocks.splice(i, 1); continue; }
      hot.moveTo(s.x - 7, s.P.y); hot.lineTo(s.x, s.P.y - 12); hot.lineTo(s.x + 7, s.P.y);
      if (st.cracks.length < 16 && Math.random() < 0.7) st.cracks.push({x: s.x, y: s.P.y, s: Math.random() < 0.5 ? 1 : -1, t: 0});
      if (st.fx.length < 28) st.fx.push({k: 5, x: s.x, y: s.P.y - 2, vx: (Math.random() - 0.5) * 60, vy: -80 - Math.random() * 70, s: 1, t: 0, life: 0.6});  // pebbles hop
    }
    if (st.cracks.length) {
      g.beginPath();
      for (let i = st.cracks.length - 1; i >= 0; i--) { const c = st.cracks[i]; if ((c.t += dt) > 4) { st.cracks.splice(i, 1); continue; } g.moveTo(c.x, c.y); g.lineTo(c.x + 3 * c.s, c.y + 5); g.lineTo(c.x - 2 * c.s, c.y + 9); g.lineTo(c.x + 2 * c.s, c.y + 14); }
      g.strokeStyle = 'rgba(8,10,24,.75)'; g.lineWidth = 1.3; g.stroke();
    }
    for (let i = st.slashes.length - 1; i >= 0; i--) if (slashStep(st, st.slashes[i], dt)) st.slashes.splice(i, 1);
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.55)';
    for (let i = st.pieces.length - 1; i >= 0; i--) {
      const p = st.pieces[i]; if (pieceStep(st, p, dt)) { st.pieces.splice(i, 1); continue; }
      // a triangle with the tile's own rounded corner, turned about its middle
      const c = Math.cos(p.rot), sn = Math.sin(p.rot), cx = -p.sx * p.a / 3, cy = -p.sy * p.d / 3, ax = cx + p.sx * p.a, by = cy + p.sy * p.d;
      const x0 = p.x + cx * c - cy * sn, y0 = p.y + cx * sn + cy * c, x1 = p.x + ax * c - cy * sn, y1 = p.y + ax * sn + cy * c, x2 = p.x + cx * c - by * sn, y2 = p.y + cx * sn + by * c;
      g.beginPath(); g.moveTo(x1, y1); g.arcTo(x0, y0, x2, y2, p.rr); g.lineTo(x2, y2); g.closePath();
      g.globalAlpha = p.st === 3 ? 0.6 : 1; g.fillStyle = p.col; g.fill(); g.stroke(); g.globalAlpha = 1;
      if (p.st < 2 && p.t < 0.9) { hot.moveTo(x1, y1); hot.lineTo(x2, y2); }  // the cut edge is still hot
    }
  }
  const crescent = (g, x, y, ux, uy, R) => { const ax = x - ux * R * 0.55 - uy * R, ay = y - uy * R * 0.55 + ux * R, bx = x - ux * R * 0.55 + uy * R, by = y - uy * R * 0.55 - ux * R; g.moveTo(ax, ay); g.quadraticCurveTo(x + ux * R * 0.75, y + uy * R * 0.75, bx, by); g.quadraticCurveTo(x + ux * R * 0.05, y + uy * R * 0.05, ax, ay); };
  /** Over the figures: the blades of light with their after-images, and the glows. */
  function powerOver(g, st, dt) {
    for (const s of st.slashes) {
      const lag = s.sp / 24;
      for (let i = 2; i >= 0; i--) { g.globalAlpha = i ? 0.42 / i : 0.95; g.fillStyle = s.col; g.beginPath(); crescent(g, s.x - s.ux * lag * i, s.y - s.uy * lag * i, s.ux, s.uy, s.R * (1 - i * 0.12)); g.fill(); }
      g.fillStyle = '#fff'; g.beginPath(); crescent(g, s.x + s.ux * 2, s.y + s.uy * 2, s.ux, s.uy, s.R * 0.72); g.fill();
    }
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < st.gl.length; i += 4) { g.globalAlpha = st.gl[i + 3]; g.drawImage(st.glow, st.gl[i] - st.gl[i + 2] / 2, st.gl[i + 1] - st.gl[i + 2] / 2, st.gl[i + 2], st.gl[i + 2]); }
    st.gl.length = 0;
    for (let i = st.glows.length - 1; i >= 0; i--) { const o = st.glows[i]; if ((o.t += dt) >= o.life) { st.glows.splice(i, 1); continue; } g.globalAlpha = 1 - o.t / o.life; g.drawImage(st.glow, o.x - o.s / 2, o.y - o.s / 2, o.s, o.s); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  /** Power gathering on a fighter: a glow growing at the blade or the hand, motes rising, a ring on the ground. */
  function chargeFx(st, f, dt, hot, dot3) {
    const c = f.chg; c.t += dt; if (c.t >= c.dur) { f.chg = null; return; }
    const u = c.t / c.dur, x = f.wpn ? f.tip[0] : f.J[16], y = f.wpn ? f.tip[1] : f.J[17];
    st.gl.push(x, y, 14 + 40 * u, 0.55 + 0.45 * u);
    for (let i = 0; i < 6; i++) dot3.rect(f.x + Math.sin(i * 2.4) * 20, f.y - ((c.t * 60 + i * 13) % 48), 2, 2);
    const rx = 9 + 20 * u; hot.moveTo(f.x + rx, f.y - 1); hot.ellipse(f.x, f.y - 1, rx, 2 + 3 * u, 0, 0, 6.3);
  }

  const guard = f => f.wpn ? K.ST : K.G;
  const stepDur = d => d < 3 ? 0 : d < 46 ? 0.14 + d / 170 : 0.32 + d / 330;
  /** Where A must stand for a move to fit on this platform (B is d in front of A), or null if it does not fit. */
  function fit(P, m, xa, dA) {
    const lo0 = dA > 0 ? P.x1 + 3 : -P.x2 + 3, hi0 = dA > 0 ? P.x2 - 3 : -P.x1 - 3;  // the platform as A sees it, forward positive
    const lo = Math.max(lo0 - m.A.lo, lo0 - m.d + m.B.hi), hi = Math.min(hi0 - m.A.hi, hi0 - m.d + m.B.lo);
    if (lo > hi) return null;
    return dA * (m.end ? hi : U.clamp(dA * xa, lo, hi));
  }
  /** Shuffle, or float if it is far, to a spot on the same platform, taking `total` seconds in all. */
  function moveTo(f, x, dir, total) {
    const dist = Math.abs(x - f.x), dx = (x - f.x) * dir, d = stepDur(dist), g0 = guard(f);
    if (d) f.q.push({dir, tr: dist < 46 ? track([0, g0], [d * 0.5, f.wpn ? K.ST2 : K.G2, {x: dx * 0.5, up: 3}], [d, g0, {x: dx}])
      : track([0, K.CRH], [0.1, K.LU, {x: 0}], [d - 0.1, dx < 0 ? K.LU : K.GL, {x: dx, e: 2}], [d, K.LD], ['arc', 0.1, d - 0.1, 12 + dist * 0.12])});
    if (total - d > 0.02 || !d) f.q.push({dir, tr: track([0, g0], [Math.max(0.02, total - d), g0])});
  }
  /** A long floating leap to a spot on another platform, sometimes with a somersault on the way. */
  function leapTo(f, Q, x, face, delay, som) {
    const dx = x - f.x, dy = Q.y - f.y, dist = Math.hypot(dx, dy), ax = Math.abs(dx), d = 0.6 + dist / 400, h = 24 + dist * 0.1 + Math.max(0, -dy) * 0.2, g0 = guard(f), a = 0.12, sp = d - a;
    if (delay) f.q.push({tr: track([0, g0], [delay, K.CRH])});
    const mid = som ? [[a + sp * 0.3, K.TK, {c: 2, rot: -80, x: ax * 0.3, dy: dy * 0.3, e: 2}], [a + sp * 0.72, K.TK, {c: 2, rot: -300, x: ax * 0.72, dy: dy * 0.72, e: 2}]]
      : [[a + sp * 0.5, K.GL, {x: ax * 0.5, dy: dy * 0.5, e: 2}]];
    f.q.push({dir: dx >= 0 ? 1 : -1, pl: Q.i, tr: track([0, K.CRH], [a, K.LU, {x: 0}], ...mid, [d, K.LD, {x: ax, dy, rot: som ? -360 : 0, e: 2}], ['arc', a, d, h])});
    f.q.push({dir: face, tr: track([0, K.LD], [0.16, g0])});
  }
  function busy(st, Q, du) { for (const o of st.duels) if (o !== du && (o.f[0].pl === Q.i || o.f[1].pl === Q.i)) return true; return !!st.spare && st.spare.pl === Q.i; }
  /** Both leap to another tile top, one after the other. */
  function goLeap(st, du, A, B, dry, minW) {
    const P = st.plats[A.pl], c = [];
    for (const Q of st.plats) {
      if (Q === P || Q.y < 52 || Q.x2 - Q.x1 < (minW || 120) || busy(st, Q, du)) continue;
      const d = Math.hypot((Q.x1 + Q.x2) / 2 - A.x, Q.y - A.y); if (minW || (d > 90 && d < 560)) c.push(Q);
    }
    if (!c.length) return false; if (dry) return true;
    const Q = c[Math.random() * c.length | 0], s = A.x <= B.x ? 1 : -1, mid = U.lerp(Q.x1 + 45, Q.x2 - 45, Math.random());
    leapTo(A, Q, mid - s * 27, s, 0, Math.random() < 0.4); leapTo(B, Q, mid + s * 27, -s, 0.3, Math.random() < 0.25);
    du.tag = 'travel'; return true;
  }
  /** A runs up the side of the tile above and either flips onto its top (B floats up after) or flips off again. */
  function goWall(st, du, A, B, dry) {
    const P = st.plats[A.pl]; if (!P.walls.length) return false;
    const near = P.walls.filter(v => (v.wx - A.x) * (B.x - A.x) <= 0), ws = near.length ? near : P.walls;  // rather not run through the other one to get there
    const w = ws[Math.random() * ws.length | 0], Q = w.Q, sd = w.sd, lx = w.wx + sd * 64;
    const over = Q.y >= 52 && Q.x2 - Q.x1 >= 120 && w.bot - w.top < 135 && !busy(st, Q, du);
    if (!over && (lx < P.x1 + 4 || lx > P.x2 - 4)) return false;
    if (dry) return true;
    const rx = U.clamp(w.wx + sd * 8, P.x1 + 2, P.x2 - 2), run = Math.abs(rx - A.x), d = -sd, g0 = guard(A); let T = 0;
    if (run > 4) { const n = Math.max(2, Math.round(run / 19)), it = []; for (let i = 0; i <= n; i++) it.push([i * 0.1, i % 2 ? K.RB : K.RA, {x: run * i / n, e: 2}]); A.q.push({dir: rx > A.x ? 1 : -1, tr: track.apply(null, it)}); T = n * 0.1; }
    // onto the wall: facing it and tipped onto the back, feet pinned to it, running straight up
    const top = Math.max(w.top + 8, w.bot - 105), up = (w.bot - 4 - top) / 200, n = Math.max(2, Math.round(up / 0.167)), y0 = w.bot - 4 - P.y;
    const it = [[0, K.CRH], [0.12, K.RA, {x: (w.wx + sd * 1.5 - rx) * d, dy: y0, rot: -90, c: 1, e: 1}]];
    for (let i = 1; i <= n; i++) it.push([0.12 + up * i / n, i % 2 ? K.RB : K.RA, {dy: y0 + (top - w.bot + 4) * i / n, c: 1, e: 2}]);
    const t1 = 0.12 + up;
    if (over) {
      const som = Math.random() < 0.5, t2 = t1 + (som ? 0.58 : 0.42);
      it.push([t1 + 0.08, K.TK, {c: 2, x: (w.wx + sd * 20 - rx) * d, dy: top + 22 - P.y, e: 2}], [t2, K.LD, {x: (w.wx - sd * 24 - rx) * d, dy: Q.y - P.y, rot: som ? -360 : 0, e: 2}], ['arc', t1 + 0.08, t2, 22]);
      A.q.push({dir: d, pl: Q.i, tr: track.apply(null, it)}, {dir: d, tr: track([0, K.LD], [0.16, g0])});
      leapTo(B, Q, w.wx - sd * 74, sd, Math.max(0.1, T + t2 - 0.45), false);
    } else {
      const t2 = t1 + 0.64;
      it.push([t1 + 0.08, K.TK, {c: 2, x: (w.wx + sd * 22 - rx) * d, dy: top + 22 - P.y, e: 2}], [t1 + 0.4, K.TK, {c: 2, rot: -280, x: (w.wx + sd * 46 - rx) * d, dy: (top + 22 - P.y) * 0.45, e: 2}],
        [t2, K.LD, {x: (lx - rx) * d, dy: 0, rot: -360, e: 2}], ['arc', t1 + 0.08, t2, 14]);
      A.q.push({dir: d, tr: track.apply(null, it)}, {dir: B.x > lx ? 1 : -1, tr: track([0, K.LD], [0.16, g0])});
      B.q.push({dir: lx > B.x ? 1 : -1, tr: track([0, guard(B)], [(T + t2) * 0.5, K.LK], [T + t2, guard(B)])});
    }
    du.tag = 'travel'; return true;
  }
  function startMove(st, du, m, A, B, xa, dA) {
    const xb = xa + dA * m.d, T = Math.max(stepDur(Math.abs(xa - A.x)), stepDur(Math.abs(xb - B.x)));
    moveTo(A, xa, dA, T); moveTo(B, xb, -dA, T);
    if (m.sw && !A.wpn) A.wt = B.wt = Math.random() < 0.5 ? 1 : 2;
    A.q.push({dir: dA, tr: m.A}); B.q.push({dir: -dA, tr: m.B});
    du.tag = m.tag || '';
  }
  /** Pick what happens next in a duel, by weight, from the moves that fit where the two stand. */
  function nextMove(st, du) {
    let A = du.A, B = du.B;
    if (Math.random() < (du.tag === 'hit' ? 0.3 : 0.5)) { const t = A; A = B; B = t; }  // after a hit the same one often presses on
    const P = st.plats[A.pl], dA = B.x >= A.x ? 1 : -1, armed = A.wpn > 0, c = []; let tot = 0;
    for (const m of MOVES) {
      if ((m.wp === 1 && !armed) || (m.wp === 0 && armed)) continue;
      let w = m.w * (m.after && m.after === du.tag ? 4 : 1) * (m.n === du.last ? 0.08 : m.n === du.last2 ? 0.4 : 1), xa = 0;
      if (m.sw) w = du.since >= 3 && (armed || st.weapons) ? 2.6 : 0;
      if (m.pw) w = !st.powers || du.pwn >= du.pwMax ? 0 : m.w * st.pace.pwW * (armed ? 1.5 : 0.8);
      if (m.n === 'leap' || m.n === 'wallrun' || m.n === 'midair') w *= st.pace.flash;
      if (st.force) w = m.n === st.force ? 1e6 : w * 1e-3;  // the test page asks for one move by name
      if (m.after && m.after !== du.tag) w *= 0.4;
      if (!w) continue;
      if (m.go) { if (!m.go(st, du, A, B, true)) continue; } else { xa = fit(P, m, A.x, dA); if (xa == null) continue; }
      c.push([m, w, xa]); tot += w;
    }
    if (!c.length) { moveTo(A, A.x, dA, 0.3); moveTo(B, B.x, -dA, 0.3); return; }
    let r = Math.random() * tot, pick = c[0]; for (const e of c) { if ((r -= e[1]) <= 0) { pick = e; break; } }
    const m = pick[0];
    if (m.go) m.go(st, du, A, B, false); else startMove(st, du, m, A, B, pick[2], dA);
    du.A = A; du.B = B; du.last2 = du.last; du.last = m.n; du.since = m.sw ? 0 : du.since + 1;
  }
  /** Both idle: move the round along. */
  function choose(st, du) {
    const a = du.f[0], b = du.f[1], P = st.plats[a.pl];
    if (a.pl !== b.pl) { leapTo(b, P, U.clamp(a.x + (b.x > a.x ? 50 : -50), P.x1 + 4, P.x2 - 4), b.x > a.x ? -1 : 1, 0, false); return; }
    const dA = b.x >= a.x ? 1 : -1;
    if (du.phase === 'salute') {
      a.calm = b.calm = false; const m = {d: 52, A: T_SALUTE, B: T_SALUTE}, xa = fit(P, m, a.x, dA);
      startMove(st, du, m, a, b, xa == null ? a.x : xa, dA);
      du.phase = 'fight'; du.n = 6 + (Math.random() * 5 | 0); du.since = 0; du.pwn = 0; du.pwMax = Math.random() < st.pace.pwRound ? st.pace.pwMax : 0; du.A = a; du.B = b; du.tag = ''; return;
    }
    if (du.phase === 'fight') {
      if (du.flee) { du.flee = false; if (goLeap(st, du, a, b, false)) return; }
      if (st.petSeen > st.pace.petFirst && st.clock > st.petNext && !st.petting && startPet(st, du, a, b)) return;  // something to stroke has turned up
      if (du.n-- > 0) { nextMove(st, du); return; }
      if (a.wpn) { startMove(st, du, {d: Math.abs(b.x - a.x), A: T_DROP, B: T_DROP}, a, b, a.x, dA); return; }
      // the finishing blow needs room; if this tile is too narrow they take it somewhere wider
      let A = a, B = b, d = dA; if (Math.random() < 0.5) { A = b; B = a; d = -dA; }
      let xa = fit(P, FINISH, A.x, d); if (xa == null) { const t = A; A = B; B = t; d = -d; xa = fit(P, FINISH, A.x, d); }
      if (xa == null) { if (!goLeap(st, du, a, b, false, 210)) du.phase = 'bow'; return; }
      startMove(st, du, FINISH, A, B, xa, d); du.A = A; du.B = B; du.phase = 'bow'; return;
    }
    if (du.phase === 'pet0') {  // hands shaken: go over to it, one to each side
      const act = pettable(st, du.pa), Q = act && Math.hypot(act.x - du.pa.x, act.y - du.pa.y) < 200 ? petSpot(st, act) : null;
      if (!Q) { petOff(st, du, true); return; }
      const off = (act.h || 30) * 0.5 + 16, l = a.x <= b.x ? a : b, r = l === a ? b : a, xl = U.clamp(act.x - off, Q.x1 + 3, Q.x2 - 3), xr = U.clamp(act.x + off, Q.x1 + 3, Q.x2 - 3);
      if (Q.i === a.pl) { const T = Math.max(stepDur(Math.abs(xl - l.x)), stepDur(Math.abs(xr - r.x))); moveTo(l, xl, 1, T); moveTo(r, xr, -1, T); }
      else { leapTo(l, Q, xl, 1, 0, false); leapTo(r, Q, xr, -1, 0.3, false); }
      du.pa = {x: act.x, y: act.y}; du.phase = 'pet1'; return;
    }
    if (du.phase === 'pet1') { du.pet = {t: 0, dur: 5 + Math.random() * 3, heart: 0.5}; du.phase = 'pet2'; return; }
    if (du.phase === 'pet2') { petOff(st, du, du.lost); return; }  // a nod (or a shrug if it left), a few steps apart, a fresh bow
    if (du.phase === 'bow') { du.A.q.push({tr: T_WON}); du.B.q.push({tr: T_LOST}); du.phase = 'rest'; CUT.forEach((c, i) => { c.heal = Math.min(c.heal, st.clock + 0.3 + i * 0.15); }); return; }  // the bow mends every tile
    if (du.phase === 'rest') { a.calm = b.calm = true; du.wait = st.pace.rest; du.phase = 'again'; return; }
    // a new round: if someone is waiting on a corner, the beaten one swaps places with them
    const sp = st.spare, out = du.B;
    if (sp) {
      const S = st.plats[sp.pl], i = du.f.indexOf(out), other = du.f[1 - i];
      leapTo(out, S, sp.x, sp.dir, 0, true); leapTo(sp, P, out.x, other.x > out.x ? 1 : -1, 0.25, true);
      out.watch = true; sp.watch = false; sp.calm = true; du.f[i] = sp; st.spare = out;
    }
    du.phase = 'salute';
  }
  // ---- meeting other kinds' creatures -----------------------------------------------------------------------
  const HS = a => pose(6, 14, 6, -12, 6, a, 8, -10, 14, 2), NOD = pose(2, 6, 2, -6, 2, 8, 10, -8, 10, 24), SHR = pose(0, 6, 2, -6, 2, 46, 86, -46, -86, 8);
  // a small bow, step in, hands meet, two pumps
  const T_SHAKE = track([0, K.STD], [0.3, pose(22, 4, 3, -4, 3, 20, 30, 10, 30, 8)], [0.6, K.STD], [0.8, HS(80), {x: 3}], [0.95, HS(98)], [1.1, HS(66)], [1.25, HS(98)], [1.4, HS(66)], [1.7, K.STD]);
  const T_NOD = track([0, K.STD], [0.3, NOD], [0.5, K.STD], [0.7, NOD], [0.95, K.STD]), T_SHRUG = track([0, K.STD], [0.25, SHR], [0.6, pose(0, 6, 2, -6, 2, 46, 98, -46, -98, 8)], [0.9, K.STD]);
  const T_PEEK = track([0, O_PEEK], [0.35, pose(8, 20, 30, -10, 34, 30, 60, 10, 70, 12)], [0.6, O_PEEK]), T_WIPE = track([0, K.STD], [0.3, pose(0, 6, 2, -6, 2, 8, 10, 128, 104, -8)], [0.5, pose(0, 6, 2, -6, 2, 8, 10, 132, 126, -4)], [0.7, pose(0, 6, 2, -6, 2, 8, 10, 128, 104, -8)], [1.0, K.STD]);
  const T_YELP = track([0, K.CRH], [0.1, O_YELP, {up: 40, x: 14, e: 1}], [0.45, O_YELP, {up: 36, x: 30}], [0.65, K.LD, {x: 36}]), T_YELP0 = track([0, K.CRH], [0.1, O_YELP, {up: 40, e: 1}], [0.45, O_YELP, {up: 36}], [0.65, K.LD]);
  const T_HERO = track([0, K.G], [0.2, pose(-6, 30, 24, -24, 26, 150, 20, -40, -30, -8)], [0.9, pose(-8, 30, 24, -24, 26, 156, 14, -44, -30, -8)], [1.0, K.RL]);  // a heroic stance, for as long as it lasts
  function runTrack(dist) { const n = Math.max(2, Math.round(dist / 270 / 0.0833)), it = []; for (let i = 0; i <= n; i++) it.push([i * 0.0833, i % 2 ? O_PB : O_PA, {x: dist * i / n, e: 2}]); return track.apply(null, it); }

  /** The nearest creature that can be stroked (it has a pet function; a goose never has). */
  function pettable(st, near) { let best = null, bd = 1e9; for (const a of st.scene.actors) if (typeof a.pet === 'function' && a.kind !== 'goose') { const d = Math.hypot(a.x - near.x, a.y - near.y); if (d < bd) { bd = d; best = a; } } return best; }
  function petSpot(st, act) { let Q = null, bd = 40; for (const P of st.plats) if (P.y >= 52 && act.x > P.x1 - 10 && act.x < P.x2 + 10 && Math.abs(P.y - act.y) < bd) { bd = Math.abs(P.y - act.y); Q = P; } return Q; }
  /** A truce: weapons away, a handshake, and off to see the creature. */
  function startPet(st, du, a, b) {
    const act = pettable(st, a), Q = act && petSpot(st, act); if (!Q || busy(st, Q, du)) return false;
    for (const g of st.scene.actors) if (g.kind === 'goose' && Math.hypot(g.x - act.x, g.y - act.y) < 250) return false;
    st.petting = du; du.pa = {x: act.x, y: act.y}; du.lost = false;
    for (const f of du.f) { f.had = f.wpn || f.had; f.wpn = 0; }
    const dA = b.x >= a.x ? 1 : -1, m = {d: 24, A: T_SHAKE, B: T_SHAKE}, xa = fit(st.plats[a.pl], m, a.x, dA);
    startMove(st, du, m, a, b, xa == null ? a.x : xa, dA); du.phase = 'pet0'; return true;
  }
  function petOff(st, du, shrug) { for (const f of du.f) { f.q.push({tr: shrug ? T_SHRUG : T_NOD, wp: f.had}); f.had = 0; } if (st.petting === du) st.petting = null; st.petNext = st.clock + st.pace.petGap * (0.85 + Math.random() * 0.3); du.phase = 'salute'; }
  /** Kneeling either side of it, one hand stroking along its back; it is told about every stroke. */
  function petStep(st, du, dt) {
    const pe = du.pet, act = pettable(st, du.pa), P = st.plats[du.f[0].pl]; pe.t += dt;
    let gone = !act || Math.hypot(act.x - du.pa.x, act.y - du.pa.y) > 60 || Math.abs(act.y - P.y) > 40;
    if (!gone) {
      du.pa.x = act.x; du.pa.y = act.y; const off = (act.h || 30) * 0.5 + 16;
      du.f.forEach((f, i) => {
        const side = f.x <= act.x ? 1 : -1, want = act.x - side * off, w = pe.t * 5 + i * 2, k = Math.min(1, dt * 10); f.dir = side; f.an = null;
        if (Math.abs(want - f.x) > 80) gone = true;  // it has wandered off faster than they can shuffle after it
        f.x = U.clamp(f.x + U.clamp(want - f.x, -60 * dt, 60 * dt), P.x1 + 3, P.x2 - 3);
        for (let j = 0; j < 10; j++) f.p[j] += ((j === 5 ? 64 + Math.sin(w) * 14 : j === 6 ? 16 + Math.cos(w) * 12 : K.KN[j]) - f.p[j]) * k;
        try { act.pet({x: f.J[16], y: f.J[17]}); } catch (e) { /* its business */ }
      });
      if ((pe.heart -= dt) < 0) { pe.heart = 1.2; st.fx.push({k: 7, x: act.x + (Math.random() - 0.5) * 18, y: act.y - (act.h || 30) - 4, s: 1, t: 0, life: 1.5}); }
    }
    if (gone || pe.t >= pe.dur) { du.pet = null; du.lost = gone; for (const f of du.f) f.q.push({tr: track([0, K.KN], [0.4, K.STD])}); }
  }
  /** Goose! Stop everything, drop everything, run. */
  function scareStart(st, du, d) {
    du.scare = {safe: 0}; du.pet = null; if (st.petting === du) { st.petting = null; st.petNext = st.clock + st.pace.petGap; }
    for (const f of du.f) {
      endOv(f); f.q.length = 0; if (calmish(f)) f.cur = null; f.panic = true; f.yelp = 0; f.chg = null;
      if (f.wpn) { f.had = f.wpn; st.proj.push({type: f.wpn, x0: f.J[16], y0: f.J[17], to: null, x1: f.x - f.dir * 24, y1: st.h + 60, t: 0, dur: 1.1, h: 30, spin: 11}); f.wpn = 0; }
    }
    if (d > 130 && Math.random() < 0.35) du.f[0].q.push({tr: T_HERO});
  }
  function scareStep(st, du, dt) {
    const sc = du.scare; let idle = 0, near = false;
    for (const f of du.f) {
      if (f.ov) { if (f.ov.k) { ovStep(f, dt, st.figs); continue; } endOv(f); }
      const gz = goose(st.scene, f); f.yelp -= dt; if (gz && gz.d < 320) near = true;
      if (advance(st, f, dt)) continue;
      if (!gz || gz.d >= 320) { idle++; f.an = null; f.dir = Math.sin(st.clock * 5 + f.n) > 0 ? 1 : -1; for (let j = 0; j < 10; j++) f.p[j] += (O_PEEK[j] - f.p[j]) * 0.4; continue; }  // peeking out
      const P = st.plats[f.pl], away = f.x >= gz.g.x ? 1 : -1, room = Math.abs((away > 0 ? P.x2 - 4 : P.x1 + 4) - f.x);
      if (gz.d < 28 && f.yelp <= 0) { f.yelp = 1.4; f.q.push({dir: away, tr: room > 40 ? T_YELP : T_YELP0}); }  // pecked
      else if (room > 24) f.q.push({dir: away, tr: runTrack(Math.min(room, 160))});
      else {
        // out of tile: leap to whichever tile top is furthest from the goose
        let Q = null, bd = 0;
        for (const N of st.plats) { if (N === P || N.y < 52 || N.x2 - N.x1 < 70 || busy(st, N, du) || Math.hypot((N.x1 + N.x2) / 2 - f.x, N.y - f.y) > 520) continue; const d = Math.hypot((N.x1 + N.x2) / 2 - gz.g.x, N.y - gz.g.y); if (d > bd) { bd = d; Q = N; } }
        if (Q) leapTo(f, Q, U.clamp((Q.x1 + Q.x2) / 2 + away * 20, Q.x1 + 6, Q.x2 - 6), away, 0, false); else f.q.push({tr: track([0, O_COWER], [0.4, O_COWER])});
      }
    }
    sc.safe = near ? 0 : sc.safe + dt;
    if (!near && idle === 2 && sc.safe > 2) {  // gone: look both ways, wipe the brow, take up what was dropped, and bow
      for (const f of du.f) { f.panic = false; f.q.push({dir: 1, tr: T_PEEK}, {dir: -1, tr: T_PEEK}, {tr: T_WIPE, wp: f.had}); f.had = 0; }
      du.scare = null; du.phase = 'salute';
    }
  }

  /** Play a fighter's queued tracks. False when it has nothing to do. */
  function advance(st, f, dt) {
    let s = f.cur;
    if (!s) {
      s = f.cur = f.q.shift(); if (!s) return false;
      f.tt = 0; f.x0 = f.x; f.y0 = f.y; f.fxi = 0; f.an = null; if (s.dir) f.dir = s.dir;
      for (let j = 0; j < 12; j++) f.from[j] = f.p[j]; f.bl = f.blT = 0.09;
    }
    const tr = s.tr; f.tt += dt; sample(tr, f.tt, f.p);
    if (f.bl > 0) { f.bl -= dt; const u = Math.max(0, f.bl / f.blT); for (let j = 0; j < 12; j++) f.p[j] += (f.from[j] - f.p[j]) * u; }
    f.x = f.x0 + f.dir * f.p[12]; f.y = f.y0 + f.p[15]; f.lift = f.p[13]; f.pin = f.p[14];
    if (tr.arc && f.tt > tr.arc[0] && f.tt < tr.arc[1]) { const u = (f.tt - tr.arc[0]) / (tr.arc[1] - tr.arc[0]); f.lift += tr.arc[2] * 4 * u * (1 - u); }
    while (f.fxi < tr.fx.length && tr.fx[f.fxi][1] <= f.tt) f.em.push(tr.fx[f.fxi++]);
    if (f.tt >= tr.len) { f.cur = null; f.p[10] = 0; f.p[11] %= 360; f.lift = 0; f.pin = 0; if (s.pl != null) f.pl = s.pl; if (s.wp != null) f.wpn = s.wp; f.y = st.plats[f.pl].y; }
    return true;
  }
  function idle(f, dt) { play(f, f.watch ? KA.crane : f.calm ? KA.std : f.wpn ? KA.s : KA.g, 0.18); tick(f, dt); }
  const settled = f => f.pin === 0 && f.lift < 1 && Math.abs(f.p[10]) < 5 && !(f.cur && f.cur.pl != null) && !f.q.some(s => s.pl != null);
  const calmish = f => f.pin === 0 && f.lift < 1 && Math.abs(f.p[10]) < 8 && f.y > 0;
  function duelStep(st, du, dt) {
    const a = du.f[0], b = du.f[1];
    // a goose outranks everything: the fight, a stare, a truce
    const ga = goose(st.scene, a), gb = goose(st.scene, b); if (!ga) a.gd = null; if (!gb) b.gd = null;
    if (du.scare) { scareStep(st, du, dt); return; }
    const sa = !!ga && scared(a, ga), sb = !!gb && scared(b, gb);
    if (sa || sb || ((du.pet || du.phase.slice(0, 3) === 'pet') && ((ga && ga.d < 250) || (gb && gb.d < 250)))) { scareStart(st, du, Math.min(ga ? ga.d : 1e9, gb ? gb.d : 1e9)); return; }
    if (du.bow && !a.ov && !b.ov && settled(a) && settled(b)) {  // tapped: drop everything and bow to whoever is watching
      du.bow = false; const d = (a.x + b.x) / 2 < st.w / 2 ? 1 : -1;
      for (const f of du.f) { f.cur = null; f.q.length = 0; f.lift = 0; f.p[10] = 0; f.q.push({dir: d, tr: T_VIEWER}); }
    }
    // a finger came down: both stop together, as soon as both are on their feet
    const rq = st.req;
    if (rq && du.rq !== rq.id && calmish(a) && calmish(b)) { du.rq = rq.id; awe(a, rq.x, rq.y, a.n + rq.id, false, false); awe(b, rq.x, rq.y, b.n + rq.id, false, false); }
    if (a.ov) ovStep(a, dt, st.figs); if (b.ov) ovStep(b, dt, st.figs);
    if (du.pet) { if (!a.ov && !b.ov) petStep(st, du, dt); return; }
    const ra = !!a.ov || advance(st, a, dt), rb = !!b.ov || advance(st, b, dt);
    if (!ra) idle(a, dt); if (!rb) idle(b, dt);
    if (ra || rb) return;
    if (du.wait > 0) { du.wait -= dt; return; }
    choose(st, du);
  }
  /** Sparks, stars and thrown weapons that a move asks for at a given moment. */
  function emit(st, f, e) {
    const J = f.J, k = e[0], fx = st.fx; if (fx.length > 28) fx.shift();
    if (k === 'star' || k === 'big') { fx.push({k: 0, x: J[e[2]] + f.dir * 3, y: J[e[2] + 1], s: k === 'big' ? 1.7 : e[3] || 1, t: 0, life: k === 'big' ? 0.45 : 0.22}); if (k === 'big') st.slow = 1; }
    else if (k === 'spark') fx.push({k: 1, x: f.tip[0], y: f.tip[1], s: 1, t: 0, life: 0.3, a: Math.random() * 6});
    else if (k === 'dust') fx.push({k: 2, x: f.x + f.dir * 8, y: f.y - 2, s: 1, t: 0, life: 0.5});
    else if (k === 'sw') fx.push({k: 3, x: J[0], y: e[2] ? J[1] - 6 : f.y - 5, s: e[2], d: f.dir, t: 0, life: 0.25});
    else if (k === 'arm') st.proj.push({type: f.wt, x0: f.x - f.dir * 110, y0: f.y - 300, to: f, t: 0, dur: e[3], h: 0, spin: 14});
    else if (k === 'fling' && f.wpn) { st.proj.push({type: f.wpn, x0: f.tip[0], y0: f.tip[1], to: f, t: 0, dur: e[3], h: 70, spin: 20}); f.wpn = 0; }
    else if (k === 'drop' && f.wpn) { st.proj.push({type: f.wpn, x0: J[16], y0: J[17], to: null, x1: J[16] - f.dir * 150, y1: J[17] - 420, t: 0, dur: 0.8, h: 0, spin: 16}); f.wpn = 0; }
    else power(st, f, e);
  }

  HP.fx.add('kungfu', {
    label: 'Stick fight',
    live: true, fps: 12,
    options: [{key: 'fighters', label: 'Fighters', type: 'range', min: 2, max: 6, step: 1, default: 2},
      {key: 'weapons', label: 'Weapons', type: 'bool', default: true},
      {key: 'powers', label: 'Powers', type: 'bool', default: true},
      {key: 'pace', label: 'How often', type: 'select', choices: [['rarely', 'Rarely'], ['sometimes', 'Sometimes'], ['often', 'Often'], ['constantly', 'Constantly']], default: 'often'}],
    create(ctx) {
      mendAll();  // new tiles arrive whole; any old ones still held are made whole too
      const r = ctx.rand, plats = ground(ctx), n = U.clamp(Math.round(+ctx.opts.fighters || 2), 2, 6), figs = [], duels = [], nd = n >> 1;
      // walls to run up: the sides of the tiles just above each standing place
      for (const P of plats) {
        P.walls = [];
        for (const Q of plats) {
          const T = Q.rect; if (!T || Q === P) continue;
          const bot = T.y + T.h; if (bot > P.y - 2 || bot < P.y - 48) continue;
          for (const sd of [-1, 1]) { const wx = sd < 0 ? T.x : T.x + T.w, sx = wx + sd * 8; if (sx > P.x1 + 2 && sx < P.x2 - 2 && sx > 30 && sx < ctx.w - 30) P.walls.push({wx, sd, top: T.y, bot, Q}); }
        }
      }
      const spots = plats.filter(P => P.y >= 52 && P.x2 - P.x1 >= 150);
      for (let i = spots.length - 1; i > 0; i--) { const j = r() * (i + 1) | 0, t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
      for (let i = 0; i < n; i++) figs.push(Object.assign(figure(0, -60, 0.95 + r() * 0.13), {col: SASH[i], wpn: 0, wt: 1, pl: 0, q: [], cur: null, tt: 0, x0: 0, y0: 0, fxi: 0, em: [], tip: [0, 0], tr: new Float32Array(8), seen: false, hx: 0, hy: 0, calm: false, watch: false, n: i * 2 + 1, rq: 0, ov: null, had: 0, panic: false, yelp: 0, gd: null}));
      // one soft dot for every glow, stamped where light is wanted
      const glow = document.createElement('canvas'); glow.width = glow.height = 64;
      const gg = glow.getContext('2d'), gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(190,235,255,.7)'); gr.addColorStop(1, 'rgba(120,190,255,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
      const st = {plats, figs, duels, spare: null, req: null, fx: [], proj: [], slow: 0, w: ctx.w, h: ctx.h, weapons: ctx.opts.weapons !== false && ctx.opts.weapons !== 0,
        powers: ctx.opts.powers !== false && ctx.opts.powers !== 0, pace: K_PACE[ctx.opts.pace] || K_PACE.often, rects: ctx.rects, cuts: CUT, pieces: [], pile: new Float32Array(Math.ceil(ctx.w / 24) + 1), slashes: [], shocks: [], cracks: [], glows: [], gl: [], glow, clock: 0, force: null, scene: {actors: [], next: []}, petSeen: 0, petNext: 0, petting: null};
      // every pair drops in from above onto a tile top of its own
      for (let k = 0; k < nd; k++) {
        const P = spots[k] || plats[0], a = figs[k * 2], b = figs[k * 2 + 1], mid = spots[k] ? (P.x1 + P.x2) / 2 : ctx.w * (k + 1) / (nd + 1);
        a.pl = b.pl = P.i; a.x = mid - 140; b.x = mid + 140; a.y = b.y = -50;
        leapTo(a, P, mid - 28, 1, 0.1 + k * 0.5, false); leapTo(b, P, mid + 28, -1, 0.4 + k * 0.5, true);
        duels.push({f: [a, b], A: a, B: b, phase: 'salute', rq: 0, pwn: 0, pwMax: 0, n: 0, since: 0, last: '', last2: '', tag: '', wait: 0, bow: false, flee: false});
      }
      if (n % 2) {  // the odd one out waits on a corner, on one foot, for the next round
        const f = st.spare = figs[n - 1], S = spots[nd] || plats[0];
        f.pl = S.i; f.x = S.x2 - 3; f.y = S.y; f.dir = -1; f.watch = true;
      }
      return st;
    },
    touch(st, x, y) { st.req = {x, y, id: (st.req ? st.req.id : 0) + 1, ttl: 2.5}; },
    // the ground goes from under them; whoever is in the air at that moment never notices
    swipe(st, dir) {
      mendAll();
      for (const f of st.figs) if (calmish(f)) {
        topple(f, dir, false);
        if (f.wpn) { st.proj.push({type: f.wpn, x0: f.J[16], y0: f.J[17], to: f, t: 0, dur: 2.2, h: 46, spin: 9}); f.wpn = 0; }  // the weapon goes up, and comes back to hand as they rise
      }
    },
    tap(st, x, y, ctx) { for (const f of st.figs) if (onFigure(f, x, y, ctx)) { for (const o of st.figs) if (o.ov && !o.ov.k) endOv(o); for (const du of st.duels) du.bow = true; return true; } },
    // the tile they stand on was pressed: they take the fight elsewhere
    // a double tap anywhere: "give me my screen back". Every tile is whole at once, and they bow, a little sheepish
    restore(st) { mendAll(); for (const du of st.duels) du.bow = true; },
    press(st, rect) {
      for (const c of CUT.filter(c => c.el === rect.el)) mend(c);  // a tile being used is whole
      for (const du of st.duels) if (st.plats[du.f[0].pl].rect === rect) du.flee = true;
    },
    draw(g, st, ctx, t, dt) { try { this.paint(g, st, ctx, t, dt); } catch (e) { mendAll(); throw e; } },  // a fault never leaves a tile cut
    paint(g, st, ctx, t, dt) {
      if (st.slow > 0) { st.slow -= dt; dt /= 3; }  // the slow-motion beat
      st.clock += dt;
      const sn = st.scene = ctx.scene || st.scene; let pt = false;
      for (const a of sn.actors) if (typeof a.pet === 'function' && a.kind !== 'goose') pt = true;
      st.petSeen = pt ? st.petSeen + dt : 0;
      for (const du of st.duels) duelStep(st, du, dt);
      if (st.req && (st.req.ttl -= dt) < 0) st.req = null;
      const sp = st.spare, rq = st.req;
      if (sp) {
        if (rq && sp.rq !== rq.id && calmish(sp)) { sp.rq = rq.id; awe(sp, rq.x, rq.y, sp.n + rq.id, false, false); }
        if (sp.ov) ovStep(sp, dt, st.figs); else if (!advance(st, sp, dt)) idle(sp, dt);
      }
      const pa = new Path2D(), hd = new Path2D(), staffs = new Path2D(), swords = new Path2D(), thin = new Path2D(), hot = new Path2D(), dust = new Path2D(), dot3 = new Path2D(), eyes = new Path2D(), hearts = new Path2D();
      for (const f of st.figs) {
        solve(f); const J = f.J, s = f.s;
        if (f.wpn) {
          const a = (f.p[11] + f.p[10]) * D, vx = f.dir * Math.sin(a), vy = -Math.cos(a);
          if (f.wpn === 1) { reach(f, 1, J[16] - vx * 9 * s, J[17] - vy * 9 * s); staffs.moveTo(J[16] - vx * 16 * s, J[17] - vy * 16 * s); staffs.lineTo(J[16] + vx * 29 * s, J[17] + vy * 29 * s); }
          else { swords.moveTo(J[16] - vx * 3, J[17] - vy * 3); swords.lineTo(J[16] + vx * 25 * s, J[17] + vy * 25 * s); swords.moveTo(J[16] + vx * 2 - vy * 3, J[17] + vy * 2 + vx * 3); swords.lineTo(J[16] + vx * 2 + vy * 3, J[17] + vy * 2 - vx * 3); }
          f.tip[0] = J[16] + vx * 20 * s; f.tip[1] = J[17] + vy * 20 * s;
        }
        if (f.chg) chargeFx(st, f, dt, hot, dot3);
        limbs(pa, hd, f);
        // fast hands and feet leave a thin streak: at this frame rate that is what makes a kick look like a kick
        for (let i = 0; i < 4; i++) {
          const x = J[8 + i * 4], y = J[9 + i * 4], T = f.tr;
          if (f.seen) { const dx = x - T[i * 2], dy = y - T[i * 2 + 1], d2 = dx * dx + dy * dy; if (d2 > 120 && d2 < 8000) { thin.moveTo(T[i * 2], T[i * 2 + 1]); thin.lineTo(x - dx * 0.25, y - dy * 0.25); } }
          T[i * 2] = x; T[i * 2 + 1] = y;
        }
        while (f.em.length) emit(st, f, f.em.shift());
        dots(dot3, f); eye(eyes, f); if (f.panic) marks(dot3, thin, f, !!f.cur && f.lift < 1);
        sn.next.push({kind: 'stick', role: 'fighter', x: f.x, y: f.y - f.lift, h: 40 * f.s});
      }
      // dust, swooshes, stars and sparks
      for (let i = st.fx.length - 1; i >= 0; i--) {
        const e = st.fx[i]; e.t += dt; const u = e.t / e.life;
        if (u >= 1) { st.fx.splice(i, 1); continue; }
        if (e.k === 7) { const x = e.x + Math.sin(e.t * 4) * 3, y = e.y - 24 * u; hearts.moveTo(x, y + 3.5); hearts.lineTo(x - 3.6, y - 0.4); hearts.arc(x - 1.8, y - 1, 1.9, Math.PI, 0); hearts.arc(x + 1.8, y - 1, 1.9, Math.PI, 0); hearts.lineTo(x, y + 3.5); continue; }
        if (e.k === 4) { hot.moveTo(e.x, e.y); hot.lineTo(e.x2, e.y2); continue; }  // the seam glowing on a cut tile
        if (e.k === 5) { e.vy += 520 * dt; e.x += e.vx * dt; e.y += e.vy * dt; dot3.rect(e.x, e.y, 2, 2); continue; }
        if (e.k === 6) { e.x += e.d * 520 * dt; const r = 6 + 40 * u; hot.moveTo(e.x + r * 0.4, e.y); hot.ellipse(e.x, e.y, r * 0.4, r, 0, 0, 6.3); continue; }  // the ring of force
        if (e.k === 0) for (let j = 0; j < 6; j++) { const a = j * 1.047 + 0.3, c = Math.cos(a), sn = Math.sin(a), r0 = (3 + 9 * u) * e.s, r1 = (6 + 13 * u) * e.s * (j % 2 ? 0.7 : 1); hot.moveTo(e.x + c * r0, e.y + sn * r0); hot.lineTo(e.x + c * r1, e.y + sn * r1); }
        else if (e.k === 1) for (let j = 0; j < 5; j++) { const a = e.a + j * 1.31, c = Math.cos(a), sn = Math.sin(a), r0 = 3 + 22 * u, y = 30 * u * u; hot.moveTo(e.x + c * r0, e.y + sn * r0 + y); hot.lineTo(e.x + c * (r0 + 5), e.y + sn * (r0 + 5) + y); }
        else if (e.k === 2) { const r = 2 + 4 * u; dust.moveTo(e.x + r, e.y - 5 * u); dust.arc(e.x, e.y - 5 * u, r, 0, 6.3); dust.moveTo(e.x - 6 + r, e.y - 9 * u); dust.arc(e.x - 6, e.y - 9 * u, r * 0.7, 0, 6.3); }
        else if (e.s) { if (e.d > 0) { thin.moveTo(e.x + 25 * Math.cos(1.9), e.y - 25 * Math.sin(1.9)); thin.arc(e.x, e.y, 25, -1.9, 0.25); } else { thin.moveTo(e.x - 25 * Math.cos(0.25), e.y + 25 * Math.sin(0.25)); thin.arc(e.x, e.y, 25, Math.PI - 0.25, Math.PI + 1.9); } }
        else { thin.moveTo(e.x - e.d * 8, e.y + 3); thin.quadraticCurveTo(e.x + e.d * 34, e.y + 6, e.x + e.d * 30, e.y - 5); }
      }
      // weapons in the air, spinning; one that is aimed at a fighter ends in that fighter's hand
      for (let i = st.proj.length - 1; i >= 0; i--) {
        const p = st.proj[i]; p.t += dt; const u = Math.min(1, p.t / p.dur), tx = p.to ? p.to.J[16] : p.x1, ty = p.to ? p.to.J[17] : p.y1;
        const x = p.x0 + (tx - p.x0) * u, y = p.y0 + (ty - p.y0) * u - p.h * 4 * u * (1 - u), a = p.t * p.spin, L = p.type === 1 ? 22 : 13, c = Math.cos(a) * L, sn = Math.sin(a) * L;
        (p.type === 1 ? staffs : swords).moveTo(x - c, y - sn); (p.type === 1 ? staffs : swords).lineTo(x + c, y + sn);
        if (u >= 1) { if (p.to) p.to.wpn = p.type; st.proj.splice(i, 1); }
      }
      g.lineCap = g.lineJoin = 'round';
      powerUnder(g, st, dt, hot, dot3);
      g.fillStyle = 'rgba(236,238,248,.42)'; g.fill(dust); g.fillStyle = BONE; g.fill(dot3);
      g.strokeStyle = 'rgba(255,255,255,.62)'; g.lineWidth = 1.6; g.stroke(thin);
      ink(g, pa, hd);
      g.fillStyle = '#0b1022'; g.fill(eyes);
      // a sash at the waist and a headband with a tail that streams behind, in each fighter's own colour
      g.lineWidth = 2.8;
      for (const f of st.figs) {
        const J = f.J, s = f.s; let ux = J[2] - J[0], uy = J[3] - J[1]; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
        const bx = J[4] + f.dir * uy * HR * s, by = J[5] - f.dir * ux * HR * s, up = f.chg ? 1 : 0, tx = bx - f.dir * (up ? 2 : 9) * s + up * Math.sin(st.clock * 31) * 3, ty = up ? by - 13 : by + 4;  // the tail whips upward while power gathers
        if (!f.seen) { f.hx = tx; f.hy = ty; f.seen = true; }
        f.hx += (tx - f.hx) * 0.45; f.hy += (ty - f.hy) * 0.45;
        const hl = Math.hypot(f.hx - bx, f.hy - by); if (hl > 14) { f.hx = bx + (f.hx - bx) * 14 / hl; f.hy = by + (f.hy - by) * 14 / hl; }
        g.strokeStyle = f.col; g.beginPath();
        g.moveTo(J[0] - uy * 3.2, J[1] + ux * 3.2); g.lineTo(J[0] + uy * 3.2, J[1] - ux * 3.2);
        g.moveTo(2 * J[4] - bx, 2 * J[5] - by); g.lineTo(bx, by); g.lineTo(f.hx, f.hy); g.stroke();
      }
      g.strokeStyle = INK; g.lineWidth = 4.2; g.stroke(staffs); g.lineWidth = 3.4; g.stroke(swords);
      g.strokeStyle = '#e2bf8a'; g.lineWidth = 2.2; g.stroke(staffs);
      g.strokeStyle = '#e9f1fb'; g.lineWidth = 1.5; g.stroke(swords);
      g.strokeStyle = 'rgba(255,238,160,.96)'; g.lineWidth = 1.8; g.stroke(hot);
      g.fillStyle = '#ff6b9d'; g.fill(hearts);
      powerOver(g, st, dt);
    },
  });
})();
