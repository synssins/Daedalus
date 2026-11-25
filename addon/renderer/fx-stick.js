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
  function goose(sc, f) { let best = null, bd = 1e9; if (sc) for (const a of sc.actors) if (a.kind === 'goose') { const c = a.chasing; if (Math.abs(a.y - f.y) > 60 && !(c && typeof c === 'object' && Math.hypot(c.x - f.x, c.y - f.y) < 90)) continue;  // a goose on another level is no business of this one
    const d = Math.hypot(a.x - f.x, a.y - f.y); if (d < bd) { bd = d; best = a; } } return best && {g: best, d: bd}; }
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
    const g = st.lg, n = P.n, top = P.y - Math.max(P.cap * 1.4, P.hi || 0) - 5;
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
    if (!any) { P.dents.length = 0; return; }
    g.fillStyle = 'rgba(247,251,255,.97)'; g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(120,150,195,.6)'; g.stroke();
    if (P.dents.length) dents(g, P);
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
  function ghost(st, la) { if (st.ghosts.length < 8) st.ghosts.push({x: la.gx, y: la.gy, h: la.gd * la.len / 2, a: 1}); la.d = 0; bump('ghosts'); }
  /** Its ladder lies where it was put down. It is only fetched when the figure has to leave for another level. */
  function fetchLad(st, f) {
    const la = f.lad, C = st.plats[f.pl]; f.fetch = 1;
    // it lies on some other platform (its owner fell, fled or slid away from it): that one is left to fade, and
    // another is carried. A ladder is never seen crossing the screen by itself.
    if (la.d > 0 && !la.on && (Math.abs(C.y - 2 - la.gyT) >= 4 || la.gx < C.x1 - 20 || la.gx > C.x2 + 20)) { ghost(st, la); return; }
    if (la.d > 0.5 && !la.on && Math.abs(C.y - 2 - la.gyT) < 4 && Math.abs(f.x - la.gx) > 30) { f.q.push({a: 'walk', x: U.clamp(la.gx, C.x1 + 2, C.x2 - 2)}); bump('fetches'); }
  }
  /** Queue the way to a platform (and to x on it). False when there is no way. */
  function go(st, f, P, x) {
    if (st.plats[f.pl] !== P) { fetchLad(st, f); if (travel(st, f, P) === undefined) return false; f.q.push({a: 'call', fn: g => { g.fetch = 0; }}); }
    if (x != null) f.q.push({a: 'walk', x: U.clamp(x, P.x1 + 2, P.x2 - 2)});
    return true;
  }
  /** Decide what a figure does next: carry on along the tile it is clearing; when that is done, the deepest snow
   *  it can get to; or rest, or clock off. */
  function plan(st, f) {
    const cur = st.plats[f.pl], q = f.q; let best = null, bx = 0, bs = -1;
    f.fetch = 0; f.hide = null;
    // now and then one of them tramps straight over to where a workmate is busy, and walks into them: that starts a row
    if (!st.row && st.clock > st.rowNext && st.snowing && Math.random() < (st.force === 'brawl' ? 1 : 0.6)) {
      const m = st.crew.filter(o => o !== f && !o.gone && !o.fear && !o.ov && !o.grp && !o.boss && !o.guest && o.act && (o.act.a === 'dig' || o.act.a === 'rest') && st.plats[o.pl].ok)[0];
      if (m) { if (m.pl !== f.pl) fetchLad(st, f); if (travel(st, f, st.plats[m.pl]) !== undefined) { f.job = null; q.push({a: 'walk', x: m.x}); return; } }
    }
    // a job is a whole tile top (along the bottom: a stretch of about 250 px): the nearest heap left on it comes next
    const J = f.job;
    if (J && J === cur && J.ok && !J.away) {
      let bd = 1e9;
      for (let i = 0; i < J.n; i++) { if (J.cols[i] < J.cap * 0.3) continue; const cx = J.x1 + i * J.dx, d = Math.abs(cx - f.x); if (!J.i && Math.abs(cx - f.jx) > 125) continue; if (d < bd) { bd = d; best = J; bx = cx; } }
      if (best) bump('jobStay');
    }
    if (!best) {
      f.job = null;
      for (const P of st.plats) {
        if (!P.ok) continue;
        const far = P === cur ? 0 : 0.06 + Math.abs(P.y - cur.y) / 2500, keen = P.i ? 1 : 0.45;  // the tile tops come first: the ground can wait
        for (let i = 0; i < P.n; i++) {
          const v = P.cols[i] / P.cap; if (v < 0.3) continue;
          const cx = P.x1 + i * P.dx; let sc = v * keen - far - Math.abs(cx - f.x) / 3000 + Math.random() * 0.1;
          for (const o of st.crew) if (o !== f && !o.gone && o.job === P && (P.i || Math.abs(o.jx - cx) < 250)) sc -= 0.5;  // one to a tile; the bottom has room for all
          if (sc > bs) { bs = sc; best = P; bx = cx; }
        }
      }
      if (best && bs > -0.4) { f.job = best; f.jx = bx; bump('jobNew'); } else best = null;
    }
    if (best) {
      if (best !== cur) { fetchLad(st, f); travel(st, f, best); }
      // stand on the outer side and face the tile's middle, so the throw over the shoulder clears the edge
      const d = bx > (best.x1 + best.x2) / 2 ? -1 : 1;
      q.push({a: 'walk', x: U.clamp(bx - d * 20, best.x1 + 2, best.x2 - 2)}, {a: 'dig', dir: d, n: 2 + (Math.random() * 3 | 0)});
      const r = Math.random();
      if (r < S_REST) q.push([{a: 'rest', an: SA.lean, tool: 2, dur: 2.6}, {a: 'rest', an: SA.wipe, tool: 2, dur: 1.6}, {a: 'rest', an: SA.stamp, tool: 0, dur: 1.4}][Math.random() * 3 | 0]);
      else if (r < S_REST + S_BALL) { const m = st.crew.filter(o => o !== f && !o.gone && !o.re && !o.grp && !o.guest && Math.abs(o.x - bx) + Math.abs(o.y - best.y) < 460)[0]; if (m) q.push({a: 'ball', to: m}); }
      return;
    }
    f.job = null;
    if (st.snowing) { q.push({a: 'rest', an: SA.lean, tool: 2, dur: 2 + Math.random() * 2}); return; }
    fetchLad(st, f);
    const left = travel(st, f, st.plats[0]);  // nothing left to clear and the snow has stopped: home, past the time clock
    if (left) q.push({a: 'walk', x: left.xf}, {a: 'grab', link: left, top: false});
    shiftJoin(st, f);
  }
  function react(f, an, len) { f.re = {an, t: 0, len}; f.an = null; play(f, an, 0.1); }
  /** One figure's turn: carry on with what it is doing, or pick the next thing. */
  function crewStep(st, f, dt) {
    f.tool = 0;
    if (f.re) { f.re.t += dt; if (f.re.t < f.re.len && f.an) { tick(f, dt); return; } f.re = null; f.an = null; }  // (a row or a fright may have cut the reaction short)
    let a = f.act;
    if (!a) {
      if (!f.q.length) {
        if (f.grp) f.grp.idle(f.grp, f, st); else if (f.boss) bossPlan(st, f); else if (f.guest) f.q.push({a: 'exit', x: f.x < st.w / 2 ? -50 : st.w + 50, v: 0.5, an: SB.glum}); else plan(st, f);
      }
      a = f.act = f.q.shift(); if (!a) return;
      a.t = 0; a.x0 = f.x; a.y0 = f.y; if (a.a === 'climb') a.u = a.up ? 0 : 0.9;
    }
    a.t += dt; let done = false; const P = st.plats[f.pl];
    if (a.a === 'walk' || a.a === 'exit') {
      const d = a.x - f.x;
      if (Math.abs(d) < 1.5) { done = true; if (a.a === 'exit') f.gone = true; }
      else { f.dir = d > 0 ? 1 : -1; f.x += f.dir * Math.min(Math.abs(d), 46 * f.s * (a.v || 1) * dt); play(f, a.an || SA.walk); }
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
      if (was < 1.0 && ph >= 1.0 && (f.load > 0.3 || a.toss)) {  // over the shoulder (toss: onto something being built behind it)
        if (st.bits.length < 14) st.bits.push({x: f.x - f.dir * 6, y: f.y - f.lift - 40 * f.s, vx: -f.dir * (50 + Math.random() * 50), vy: -150 - Math.random() * 50, amt: a.toss ? 0 : f.load, y0: P.y, r: 2 + Math.min(2.5, f.load * 0.25 + (a.toss ? 1 : 0)), life: a.toss ? 0.75 : 9, by: a.toss ? null : f});
        f.load = 0; if (a.toss) a.toss(f);
      }
      if (a.t >= a.n * 1.6) done = true;
      else if (!a.toss && was < 0 && a.t > 1) { let m = 0; for (let i = 0; i < P.n; i++) if (Math.abs(P.x1 + i * P.dx - bx) < 22) m = Math.max(m, P.cols[i]); if (m < 1.2) done = true; }  // scraped clean: look elsewhere
    } else if (a.a === 'drop') {  // the tile it stood on is gone: down to whatever is below
      f.an = null; for (let j = 0; j < 10; j++) f.p[j] += (O_FLINCH[j] - f.p[j]) * 0.5;
      f.y = a.y0 + 520 * a.t * a.t; if (f.y >= a.y) { f.y = a.y; f.pl = a.pl; done = true; }
    } else if (a.a === 'rest') {
      play(f, a.an); f.tool = a.tool; if (a.dir) f.dir = a.dir; if (a.face) f.dir = a.face.x >= f.x ? 1 : -1;
      if (a.hopH) f.lift = Math.sin(Math.min(1, a.t / a.dur) * Math.PI) * a.hopH;
      done = a.t >= a.dur || (!!a.until && a.until(f)); if (done && a.hopH) f.lift = 0;
    } else if (a.a === 'ball') {
      const m = a.to; f.dir = m.x > f.x ? 1 : -1; play(f, SA.ball);
      if (a.t - dt < 0.45 && a.t >= 0.45) st.balls.push({x0: f.J[20], y0: f.J[21], to: m, by: f, fun: a.fun, t: 0, dur: Math.max(0.3, Math.hypot(m.x - f.x, m.y - f.y) / 330)});
      done = a.t >= 0.9;
    } else if (a.a === 'call') { a.fn(f); done = true; }
    else if (a.a === 'roll') {  // a snowball pushed along: it grows as it goes and leaves a track
      const d = a.x - f.x, b = a.ball; f.dir = d > 0 ? 1 : -1;
      if (Math.abs(d) < 1.5) done = true; else { f.x += f.dir * Math.min(Math.abs(d), 27 * dt); play(f, SB.push); }
      if (!b.on) bump('rolls');
      b.r = a.r0 + (a.r1 - a.r0) * U.clamp(1 - Math.abs(a.x - f.x) / (Math.abs(a.x - a.x0) || 1), 0, 1); b.x = f.x + f.dir * (b.r + 8 * f.s); b.y = f.y - b.r - 4; b.on = 1;
      const j = Math.round((b.x - P.x1) / P.dx); if (j !== a.j && j >= 0 && j < P.n) { a.j = j; P.cols[j] *= 0.45; P.dirty = true; }
    } else if (a.a === 'sled') {  // down the mound, across the tile, off its edge and into the snow below
      const A = a.A, M = A.P, d = A.dir; f.dir = d; f.an = null; f.sled = 1; for (let j = 0; j < 10; j++) f.p[j] += (S_SLED[j] - f.p[j]) * 0.5;
      if (!a.air) {
        a.v = Math.min(250, (a.v || 30) + 300 * dt); f.x += d * a.v * dt; f.y = M.y; f.lift = colH(M, f.x) * 0.85;
        if (d > 0 ? f.x > M.rect.x + M.rect.w + 4 : f.x < M.rect.x - 4) { a.air = 1; a.vy = -30; f.y -= f.lift; f.lift = 0; a.F = below(st, f.x + d * 3, f.y, M); }
      } else {
        a.vy += 520 * dt; if (a.air < 4) { a.air += 14 * dt; f.x += d * 14 * dt; } f.y += a.vy * dt;  // straight down the gap beside the tile, never across the next tile's face
        if (f.y >= a.F.y) {
          f.y = a.F.y; f.pl = a.F.i; f.x = U.clamp(f.x, a.F.x1 + 2, a.F.x2 - 2); f.sled = 0; puff(st, f.x, f.y - 6, 8); if (A.sleds.length < 10) A.sleds.push(f.x + d * 6, f.y);
          ladFix(f); done = true; f.q.unshift({a: 'rest', an: SB.getup, tool: 0, dur: 1.1}); if (a.train) bump('trainEnd');
        }
      }
    } else if (a.a === 'ride') {  // behind the one who steers; the last one falls off half way
      const L = a.lead, la = L.act, A = a.A, d = A.dir; f.dir = d; f.an = null; for (let j = 0; j < 10; j++) f.p[j] += (S_SLED[j] - f.p[j]) * 0.5;
      if (!la || la.a !== 'sled') { if (a.went && L.pl !== f.pl && f.grp === A) { f.pl = L.pl; f.x = U.clamp(L.x - d * 11, st.plats[f.pl].x1 + 2, st.plats[f.pl].x2 - 2); } f.y = st.plats[f.pl].y; f.lift = 0; done = true; f.q.unshift({a: 'rest', an: SB.getup, tool: 0, dur: 1.1}); }
      else {
        a.went = 1; f.x = L.x - d * 9 * a.off; if (la.air) { f.y = L.y - 9; f.x = L.x - d * 2; f.lift = 0; } else { f.y = A.P.y; f.lift = colH(A.P, f.x) * 0.85; }
        if (a.off === 2 && Math.abs(f.x - A.cx) > 50) { f.lift = 0; f.y = A.P.y; done = true; a.fell = 1; bump('felloff'); }
      }
    }
    if (f.an) tick(f, dt);
    if (!f.noLad && !f.lad.on && !f.lad.k && !f.lad.d && (a.a === 'walk' || a.a === 'exit')) { f.p[5] = 24; f.p[6] = 66; }  // the ladder goes under this arm
    if (done) { f.act = null; if (a.a === 'drop' || a.fell) react(f, SA.slip, 2.3); }
  }

  /** A goose is coming: drop everything and run. One on a ladder stays there, clinging and shaking. */
  function fearStart(st, f) {
    endOv(f); if (f.row) rowEnd(st); SEEN.fears++; bail(f);
    const cling = !!f.act && f.act.a === 'climb';
    f.fear = {t: 0, safe: 0, cling, sx: f.x, sy: f.y, pl: f.pl, hx: f.J[4], hy: f.J[5], yelp: 0, hop: 0, run: false, away: 0, flip: 0, hang: null, path: []}; f.re = null; f.load = 0; f.an = null;
    if (!cling) { f.q.length = 0; f.act = null; }
  }
  const SEEN = HP.fx.stickTest = {fears: 0, hangs: 0, climbs: 0, drops: 0, now: ''};  // counted for the self-checks
  const O_DANGLE = pose(0, 8, 14, -8, 14, 174, 4, 168, 6, 0);
  function fearStep(st, f, dt, gz) {
    const fe = f.fear, P = st.plats[f.pl], p = f.p; fe.t += dt; f.tool = 0; fe.run = false;
    if (f.ov) { if (f.ov.k) { ovStep(f, dt, st.crew); return; } endOv(f); }  // a yanked screen still knocks them over
    const near = !!gz && gz.d < 320; fe.safe = near ? 0 : fe.safe + dt; fe.yelp -= dt;
    if (fe.cling) { sample(SA.climb, 0, p); f.x += Math.sin(st.clock * 40) * 0.8; if (fe.safe > 2) f.fear = null; return; }
    if (fe.hang) {
      // over the edge, hanging by the fingers where the goose cannot see; back up once it has been gone a while
      const h = fe.hang, R = P.rect, ex = h.side > 0 ? R.x + R.w : R.x, bx = ex + h.side * 6, by = P.y + 47 * f.s;
      h.t += dt; f.an = null; f.lift = 0; f.dir = -h.side; h.gx = ex - h.side * 4; h.gy = P.y + 5;
      for (let j = 0; j < 10; j++) p[j] += (O_DANGLE[j] - p[j]) * 0.5; p[1] = 8 + Math.sin(st.clock * 7) * 14; p[3] = -8 + Math.sin(st.clock * 7 + 2) * 14;
      if (!h.up) { const u = Math.min(1, h.t / 0.3); f.x = h.x0 + (bx - h.x0) * u; f.y = P.y + (by - P.y) * u * u; h.calm = gz && gz.d < 230 ? 0 : h.calm + dt; if (u >= 1 && h.calm > 1.6) { h.up = 1; h.t = 0; } }
      else { const u = Math.min(1, h.t / 0.7), k = 1 - (1 - u) * (1 - u); f.x = bx + (h.x0 - bx) * u; f.y = by + (P.y - by) * k; p[1] = 60 * (1 - u); p[2] = 80 * (1 - u); if (u >= 1) { fe.hang = null; f.y = P.y; f.x = h.x0; SEEN.climbs++; } }
      return;
    }
    if (near) {
      // away from the goose; the way is only changed when the goose has got round to that side, and not twice in a moment
      const want = f.x >= gz.g.x ? 1 : -1;
      if (!fe.away || (want !== fe.away && Math.abs(gz.g.x - f.x) > 40 && st.clock - fe.flip > 1.5)) { fe.away = want; fe.flip = st.clock; }
      const away = fe.away, end = !P.i ? (away > 0 ? st.w + 40 : -40) : away > 0 ? P.x2 - 3 : P.x1 + 3;
      if (fe.hop > 0) {  // pecked: straight up with a yelp, hands to the backside
        fe.hop -= dt; f.lift = Math.sin(Math.max(0, fe.hop) / 0.6 * Math.PI) * 34; for (let j = 0; j < 10; j++) p[j] += (O_YELP[j] - p[j]) * 0.6;
        f.x += away * Math.min(Math.abs(end - f.x), 90 * dt); f.an = null;
      } else if (gz.d < 28 && fe.yelp <= 0) { fe.hop = 0.6; fe.yelp = 1.5; }
      else if (Math.abs(end - f.x) > 4) { f.lift = 0; f.dir = away; f.x += away * Math.min(Math.abs(end - f.x), 150 * dt); play(f, O_PANIC, 0.05); tick(f, dt); fe.run = true; }
      else if (P.i) {
        // the end of the tile: across the gap to the next one if there is one, otherwise over the edge
        let to = null, tx = 0; for (const L of P.links) if (!L.type && (away > 0 ? L.a === P : L.b === P)) { to = away > 0 ? L.b : L.a; tx = away > 0 ? L.xb : L.xa; }
        if (to && to.ok && !to.away) { fe.path.push({from: f.x, to: tx, y: P.y, pl: P.i}); f.pl = to.i; f.x = tx; f.y = to.y; }
        else { f.lift = 0; SEEN.hangs++; fe.hang = {t: 0, side: away, x0: f.x, calm: 0, up: 0, gx: f.x, gy: P.y}; }
      }
      return;
    }
    // it has gone: peek out, look both ways, and only then go back for the shovel
    f.lift = 0; f.an = null; f.dir = Math.sin(fe.safe * 5) > 0 ? 1 : -1; for (let j = 0; j < 10; j++) p[j] += (O_PEEK[j] - p[j]) * 0.4;
    if (fe.safe > 2) {
      f.fear = null; f.q.length = 0; f.act = null;
      if (!P.i) f.x = U.clamp(f.x, -30, st.w + 30);
      // back the way it came, gap by gap, to where it dropped its shovel
      const home = st.plats[fe.pl], okWay = home && home.ok && !home.away && fe.path.every(c => { const Q = st.plats[c.pl]; return Q.ok && !Q.away; });
      if (okWay && Math.abs(home.y - fe.sy) < 2) { for (let i = fe.path.length - 1; i >= 0; i--) { const c = fe.path[i]; f.q.push({a: 'walk', x: c.to}, {a: 'hop', x: c.from, y: c.y, pl: c.pl}); } f.q.push({a: 'walk', x: U.clamp(fe.sx, home.x1 + 2, home.x2 - 2)}); }
      f.q.push({a: 'rest', an: SA.wipe, tool: 2, dur: 1.4});
    }
  }

  // A tile can be taken away under the crew (a goose drags it off, the tank battle hides them all). Its snow falls,
  // whoever stood on it or was on a ladder against it drops to what is below, and nobody goes there until it is back.
  const awayEl = P => { try { const y = P.rect && P.rect.el && P.rect.el.style; return !!y && (y.visibility === 'hidden' || y.pointerEvents === 'none'); } catch (e) { return false; } };
  function reachable(plats) {
    for (const P of plats) P.ok = false; plats[0].ok = true;
    // (a top too near the screen's top edge has no headroom)
    for (let q = [plats[0]]; q.length;) { const c = q.shift(); for (const L of c.links) { const o = L.a === c ? L.b : L.a; if (!o.ok && !o.away && o.y >= 46) { o.ok = true; q.push(o); } } }
  }
  function below(st, x, y, not) { let F = st.plats[0]; for (const Q of st.plats) if (Q !== not && Q.i && !Q.away && Q.y > y + 10 && x >= Q.x1 - 6 && x <= Q.x2 + 6 && Q.y < F.y) F = Q; return F; }
  function dropFig(st, f, not) {
    if (f.row) rowEnd(st); endOv(f); bail(f); f.fear = null; f.re = null; f.q.length = 0; f.lift = 0; f.load = 0; f.job = null; f.lad.on = false; f.lad.k = 0;
    const Q = below(st, f.x, f.y, not);
    SEEN.drops++;
    f.act = {a: 'drop', t: 0, x0: f.x, y0: f.y, y: Q.y, pl: Q.i}; f.an = null;
  }
  function tileGone(st, P) {
    for (let i = 0; i < P.n; i += 2) if (P.cols[i] > 1 && st.bits.length < 22) st.bits.push({x: P.x1 + i * P.dx, y: P.y - 3, vx: (Math.random() - 0.5) * 40, vy: -20, amt: 0, y0: 1e9, r: 2.2, life: 1.2});
    P.cols.fill(0); P.dirty = true;
    const uses = o => !!o && ((o.link && (o.link.a === P || o.link.b === P)) || o.pl === P.i);
    for (const f of st.crew) {
      if (f.gone) continue;
      const a = f.act, la = f.lad;
      if (a && a.a === 'drop') { if (a.pl === P.i) dropFig(st, f, P); }
      else if (f.pl === P.i || uses(a)) dropFig(st, f, P);
      else if (f.q.some(uses) || f.job === P) { if (a && (a.a === 'hop' || a.a === 'climb')) dropFig(st, f, P); else { f.q.length = 0; f.job = null; } }
      if (la.on && la.link && (la.link.a === P || la.link.b === P)) { la.on = false; la.k = 0; }
      if (la.d && Math.abs(la.gyT - (P.y - 2)) < 3 && la.gx > P.x1 - 80 && la.gx < P.x2 + 80) la.gyT = below(st, la.gx, P.y, P).y - 2;  // a ladder lying on it falls too
    }
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
    bump('rows');
    const row = st.row = {a, b, t: 0, stage: 0, same, brawl: same && (st.force === 'brawl' || Math.random() < S_BRAWL), end: 0, du: {tag: '', last: ''}};
    for (const f of [a, b]) { bail(f); f.row = row; f.q.length = 0; f.act = null; f.re = null; f.an = null; f.cur = null; f.wpn = 0; f.load = 0; }
    a.dir = b.x >= a.x ? 1 : -1; b.dir = -a.dir;
  }
  function rowEnd(st) { const row = st.row; if (!row) return; st.rowNext = st.clock + st.bumpGap * (0.75 + Math.random() * 0.5); for (const f of [row.a, row.b]) { f.row = null; f.q.length = 0; f.cur = null; f.act = null; f.an = null; f.wpn = 0; f.lift = 0; f.pin = 0; f.p[10] = 0; f.y = st.plats[f.pl].y; } st.row = null; }
  function rowStep(st, row, dt) {
    const a = row.a, b = row.b, P = st.plats[a.pl], two = [a, b]; row.t += dt; const t = row.t, ease = (f, q) => { f.an = null; for (let j = 0; j < 10; j++) f.p[j] += (q[j] - f.p[j]) * 0.5; };
    if (row.stage < 3) {
      for (const f of two) if (!f.ov) {
        f.tool = 0;
        if (t < 0.4) { ease(f, O_FLINCH); if (row.same) f.x = U.clamp(f.x - f.dir * 42 * dt, st.plats[f.pl].x1 + 2, st.plats[f.pl].x2 - 2); }  // stagger half a step
        else if (t < 2.4) { if (f === a) { ease(f, R_FIST); f.p[6] = 60 + Math.sin(t * 22) * 22; } else { ease(f, R_WIDE); f.p[9] = -6 + Math.sin(t * 9) * 5; } }  // the fist; "what's your problem?"
        else if (!row.brawl) { if (t > 2.8) f.dir = f === a ? -Math.sign(b.x - a.x) || 1 : Math.sign(b.x - a.x) || 1; ease(f, S_STAND); f.p[5] = 60 + (t - 2.4) * 90; f.p[6] = -30; }  // a wave of the hand and back to work
      }
      if (t >= 2.4 && row.brawl) { bump('brawls'); row.stage = 3; row.end = st.clock + 8 + Math.random() * 7; }
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

  // ======================================================================================================
  // Play: what the crew gets up to besides shovelling. A game (st.acts) borrows figures: while one has f.grp set,
  // the game fills its queue instead of plan(). Nothing here may get stuck: a figure that is frightened, dropped
  // or pulled into a row simply leaves the game (bail), and every game has a time limit after which it is ended.
  // One group game and one small gag run at a time. Counted in HP.fx.stickTest: name = started, nameEnd = over.
  // ======================================================================================================
  const bump = k => { SEEN[k] = (SEEN[k] || 0) + 1; };
  const AIR = {hop: 1, sled: 1, ride: 1, drop: 1}, MOVING = {walk: 1, exit: 1, hop: 1, place: 1, grab: 1, climb: 1, call: 1, roll: 1, sled: 1, ride: 1};
  const rnd = (a, b) => a + Math.random() * (b - a), pickOf = a => a[Math.random() * a.length | 0];
  const S_SLED = pose(-22, 84, 26, 78, 36, 52, 26, 46, 32, -4), S_MUG = pose(2, 6, 2, -6, 2, 38, 100, -8, 10), S_SIP = pose(-4, 6, 2, -6, 2, 62, 128, -8, 10, -10);
  const S_FA = pose(0, 10, 4, 4, 4, 30, 6, 20, 6, 0, -90), S_FB = pose(0, 46, 4, -30, 4, 165, 6, 150, 6, 0, -90);  // flat on the back: arms down and legs together, arms up and legs apart
  const lp = (len, a, b) => anim(len, true, [0, a], [len / 2, b], [len, a]);
  const SB = {
    laugh: lp(0.3, pose(-14, 6, 2, -6, 2, 50, 80, 40, 90, -14), pose(-7, 12, 8, -2, 8, 56, 80, 46, 90, -4)),
    splat: anim(0.7, false, [0, pose(-24, 22, 10, -10, 22, 140, 60, 150, 50, -18)], [0.45, pose(-24, 22, 10, -10, 22, 140, 60, 150, 50, -18)], [0.7, S_STAND]),
    duck: anim(1, false, [0, pose(50, 60, 105, -14, 105, 60, 80, 44, 90, 18)]),
    boo: lp(0.24, pose(8, 34, 30, -30, 24, 160, 14, 172, -14, -8), pose(8, 34, 30, -30, 24, 150, 24, 164, -4, -8)),
    jump: anim(1, false, [0, pose(-18, 40, 70, 20, 80, 120, 50, 140, 40, -16)]),
    getup: anim(1.1, false, [0, S_SIT], [0.45, S_SIT], [1.1, S_STAND]),
    sip: anim(2.4, true, [0, S_MUG], [0.8, S_MUG], [1.1, S_SIP], [1.6, S_SIP], [1.9, S_MUG], [2.4, S_MUG]),
    talk: lp(0.8, pose(4, 6, 2, -6, 2, 38, 100, 60, 50, 6), pose(4, 6, 2, -6, 2, 38, 100, 86, 28, -3)),
    nod: lp(1, S_MUG, pose(5, 6, 2, -6, 2, 38, 100, -8, 10, 13)),
    sitmug: lp(2.2, pose(-10, 84, 62, 78, 84, 44, 96, -40, -10, 4), pose(-12, 84, 62, 78, 84, 62, 122, -40, -10, -6)),
    shoo: lp(0.4, pose(6, 16, 6, -14, 6, 112, 8, 50, 95, 4), pose(6, 16, 6, -14, 6, 78, -18, 50, 95, 4)),
    point: lp(1, pose(8, 10, 4, -10, 4, 62, 4, 50, 95, 10), pose(10, 10, 4, -10, 4, 56, 4, 50, 95, 14)),
    clip: lp(0.3, pose(6, 6, 2, -6, 2, 44, 100, 50, 95, 22), pose(6, 6, 2, -6, 2, 50, 108, 50, 95, 22)),
    proud: lp(1.2, pose(-6, 8, 2, -8, 2, -42, 84, -50, 90, -8), pose(-8, 8, 2, -8, 2, -42, 84, -50, 90, 2)),
    horror: lp(0.2, pose(-22, 26, 30, -4, 40, 150, 45, 158, 40, -14), pose(-22, 20, 22, 2, 46, 150, 45, 158, 40, -14)),
    push: anim(0.7, true, [0, pose(34, 36, 10, -28, 30, 62, 6, 54, 10, 10)], [0.35, pose(34, -20, 30, 34, 12, 62, 6, 54, 10, 10)], [0.7, pose(34, 36, 10, -28, 30, 62, 6, 54, 10, 10)]),
    shove: anim(0.8, false, [0, pose(20, 30, 40, -20, 40, 40, 60, 30, 70, 8)], [0.35, pose(20, 30, 40, -20, 40, 40, 60, 30, 70, 8)], [0.5, pose(42, 40, 30, -40, 10, 82, 0, 74, 4, 8), 1], [0.8, pose(42, 40, 30, -40, 10, 82, 0, 74, 4, 8)]),
    pat: lp(0.44, pose(30, 30, 50, -20, 50, 74, 20, 48, 40, 12), pose(30, 30, 50, -20, 50, 50, 40, 72, 20, 12)),
    lift: anim(0.8, false, [0, pose(30, 30, 50, -20, 50, 60, 20, 50, 30, 10)], [0.6, pose(0, 10, 6, -10, 6, 165, 5, 170, -5, -10)], [0.8, pose(0, 10, 6, -10, 6, 165, 5, 170, -5, -10)]),
    reach: lp(0.6, pose(4, 8, 2, -8, 2, 124, 10, -8, 10, -8), pose(4, 8, 2, -8, 2, 110, 24, -8, 10, -8)),
    angel: anim(4.6, false, [0, S_STAND], [0.35, S_SIT], [0.75, S_FA], [1.15, S_FB], [1.55, S_FA], [1.95, S_FB], [2.35, S_FA], [2.75, S_FB], [3.15, S_FA], [3.55, S_FB], [4, S_FA], [4.6, S_FA]),
    rise: anim(1.1, false, [0, S_FA], [0.5, S_SIT], [1.1, S_STAND]),
    knock: anim(0.5, true, [0, pose(0, 10, 4, -10, 4, 150, 10, 150, 10, -14, 0, 14)], [0.25, pose(-8, 10, 4, -10, 4, 170, 0, 170, 0, -20, 0, -16), 1], [0.5, pose(0, 10, 4, -10, 4, 150, 10, 150, 10, -14, 0, 14)]),
    lick: anim(1, false, [0, S_STAND], [0.6, pose(26, 10, 4, -14, 6, 30, 30, 20, 40, 14)], [1, pose(26, 10, 4, -14, 6, 30, 30, 20, 40, 14)]),
    flail: lp(0.3, pose(26, 20, 20, -30, 10, 160, 10, -60, -20, 14), pose(26, -20, 10, 30, 20, -50, -10, 150, 20, 14)),
    pull: lp(0.5, pose(-14, 30, 20, -20, 10, 72, 14, 62, 24, -8), pose(-30, 40, 30, -10, 10, 78, 6, 68, 14, -12)),
    stuck: lp(0.8, pose(0, 2, 0, -2, 0, 4, 4, -4, 4, -24), pose(0, 2, 0, -2, 0, 4, 4, -4, 4, 24)),
    shake: lp(0.2, pose(10, 6, 2, -6, 2, 30, 40, 20, 60, 8), pose(-6, 6, 2, -6, 2, 12, 30, 38, 44, -6)),
    take: anim(1.6, false, [0, S_STAND], [0.3, pose(4, 6, 2, -6, 2, 80, 10, 70, 20, -4)], [0.9, pose(4, 6, 2, -6, 2, 80, 10, 70, 20, -4)], [1.15, pose(0, 20, 30, -10, 40, 168, 0, 20, 60, -10)], [1.4, pose(0, 20, 30, -10, 40, 168, 0, 20, 60, -10)], [1.6, S_STAND]),
    give: anim(1, false, [0, pose(6, 10, 4, -10, 4, 84, 6, -10, 20, 4)]),
    bag: lp(0.5, pose(-16, 10, 8, -14, 8, 10, 20, -58, -10, -14), pose(-22, 10, 8, -14, 8, 10, 20, -72, -18, -18)),
    glum: anim(0.8, true, [0, pose(18, 18, 6, -14, 14, 6, 6, -2, 8, 28)], [0.4, pose(18, -14, 14, 18, 6, -2, 8, 6, 6, 28)], [0.8, pose(18, 18, 6, -14, 14, 6, 6, -2, 8, 28)]),
    shy: lp(2.4, pose(12, 4, 2, -4, 2, 14, 30, 10, 36, 30), pose(12, 16, 22, -4, 2, 14, 30, 10, 36, 22)),
    nose: lp(0.4, pose(-14, 8, 2, -8, 2, 70, 126, -60, -40, -10), pose(-14, 8, 2, -8, 2, 70, 126, -86, -30, -10)),
    punch: anim(0.7, false, [0, S_STAND], [0.25, pose(6, 10, 4, -10, 4, 88, 4, -8, 10, 2), 1], [0.5, pose(6, 10, 4, -10, 4, 88, 4, -8, 10, 2)], [0.7, S_STAND]),
    hose: lp(0.9, pose(14, 8, 2, -8, 2, 40, 20, 30, 34, 14), pose(16, 8, 2, -8, 2, 36, 20, 28, 34, 16)),
    look: anim(1, false, [0, pose(-2, 6, 2, -6, 2, 8, 10, -8, 10, -6)]),
    hi: lp(0.4, pose(0, 8, 0, -8, 0, 126, 46, -14, 6, 0), pose(0, 8, 0, -8, 0, 112, 18, -14, 6, 0)),
  };
  const rest = (an, dur, o) => Object.assign({a: 'rest', an, tool: 0, dur}, o), call = fn => ({a: 'call', fn});
  const idleRest = (A, f) => { f.q.push(rest(SA.stand, 0.4, {idle: 1})); };
  const colH = (P, x) => { const u = (x - P.x1) / P.dx, i = U.clamp(Math.floor(u), 0, P.n - 2), k = U.clamp(u - i, 0, 1); return P.cols[i] * (1 - k) + P.cols[i + 1] * k; };
  function puff(st, x, y, n) { for (let i = 0; i < n && st.bits.length < 24; i++) st.bits.push({x, y, vx: (Math.random() - 0.5) * 130, vy: -40 - Math.random() * 90, amt: 0, y0: 1e9, r: 1.8, life: 0.6}); }
  /** A ladder left leaning where its owner can no longer be: it falls flat at its foot, to be fetched like any other. */
  function ladFix(f) { const la = f.lad, L = la.link; if (la.on && L && L.a.i !== f.pl && L.b.i !== f.pl) { la.on = false; la.k = 0; la.d = 1; la.gx = L.fx; la.gd = 1; la.gy = la.gyT = L.a.y - 2; } }
  const grounded = (st, f) => Math.abs(f.y - st.plats[f.pl].y) < 1.5 && (!f.act || f.act.a === 'walk' || f.act.a === 'dig' || f.act.a === 'rest' || f.act.a === 'ball' || f.act.a === 'call');
  const spare = (st, f) => !f.gone && !f.boss && !f.guest && !f.fear && !f.row && !f.ov && !f.re && !f.grp && !f.sh && grounded(st, f) && st.plats[f.pl].ok;
  const quiet = f => (!f.act || !!f.act.idle) && !f.q.length;
  /** Whatever game this figure was in, it is out of it. */
  function bail(f) { f.grp = null; f.hide = null; f.sh = 0; f.mug = 0; f.bury = 0; f.tong = null; f.shv = null; f.sled = 0; f.duck = 0; }
  function claim(A, f) { bail(f); f.q.length = 0; f.act = null; f.job = null; f.load = 0; f.ready = 0; f.fetch = 0; f.grp = A; A.m.push(f); }
  function actStart(st, n, def) { const A = Object.assign({n, t: 0, pt: 0, m: [], max: 90, need: 0}, def); st.acts.push(A); bump(n); SEEN.now = st.acts.map(a => a.n).join(','); return A; }
  /** Leave from behind a tile by the nearer side, and only then be drawn in front again. */
  function unhide(st, f) {
    const R = f.hide; if (!R) return;
    const P = st.plats[f.pl], l = R.x - 9, r = R.x + R.w + 9, okL = l > P.x1, okR = r < P.x2;
    if (f.x <= R.x || f.x >= R.x + R.w || (!okL && !okR)) { f.hide = null; return; }
    f.q.push({a: 'walk', x: !okR || (okL && f.x - l < r - f.x) ? l : r}, call(g => { g.hide = null; }));
  }
  function actEnd(st, A, cut) {
    const i = st.acts.indexOf(A); if (i < 0) return;
    st.acts.splice(i, 1); A.over = true; bump(A.n + 'End'); if (cut) bump('cut'); SEEN.now = st.acts.map(a => a.n).join(',');
    if (A.fin) A.fin(A, st);
    for (const f of A.m) if (f.grp === A) {
      f.grp = null; f.mug = 0; f.bury = 0; f.tong = null; f.duck = 0;
      if (grounded(st, f)) { f.q.length = 0; f.act = null; f.lift = 0; f.shv = null; unhide(st, f); }
    }
    if (A.grp) { st.playNext = st.clock + (st.force ? 3 : st.play * rnd(0.6, 1.4)); st.sinceRv++; st.sinceYeti++; } else st.gagNext = st.clock + (st.force ? 3 : st.play * rnd(0.25, 0.55));
  }
  /** The nearest tile to stand behind: c.Q is the platform under tile c.R, c.l and c.r the spots just clear of its sides. */
  function cover(st, f, used, min) {
    let best = null, bd = 1e9;
    for (const c of st.covers) {
      if (c.off || !c.Q.ok || c.Q.away || (c.l == null && c.r == null) || used.indexOf(c) >= 0 || c.xb - c.xa < (min || 0)) continue;
      const d = Math.abs(c.Q.y - f.y) * 1.5 + Math.abs((c.xa + c.xb) / 2 - f.x) + Math.random() * 60; if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  const hidden = f => !!f.duck || (!!f.hide && f.x > f.hide.x + 6 && f.x < f.hide.x + f.hide.w - 6);
  const freeCrew = st => st.crew.filter(f => spare(st, f));
  const nearTo = (list, x, y, not) => { let b = null, bd = 1e9; for (const f of list) { const d = Math.abs(f.x - x) + Math.abs(f.y - y) * 1.5; if (f !== not && d < bd) { bd = d; b = f; } } return b; };
  /** Is this stretch of the bottom strip clear of snowmen, the fort, the time clock and the motorhome? */
  function clearAt(st, x, d) {
    for (const M of st.men) if (Math.abs(M.x - x) < d) return false;
    if (st.fort && Math.abs(st.fort.x - x) < d) return false;
    if (st.shift && Math.abs(st.shift.x - x) < d) return false;
    return !(st.rv && Math.abs(st.rv.x - x) < d + 110);
  }
  function spotOn(st, d) { for (let i = 0; i < 14; i++) { const x = rnd(180, st.w - 180); if (clearAt(st, x, d)) return x; } return null; }

  // ---------- B1: the snowball fight ----------
  function fightJoin(st, A, f) {
    claim(A, f); f.side = A.n2++ & 1; f.cv = null;
    const F = st.fort;
    if (F && F.n >= 9 && !F.melt && f.side === 0 && A.fortN < 2) {  // the fort is one side's cover
      const hx = F.x - 42 - A.fortN * 15; A.fortN++; F.used = 1; bump('fortCover');
      if (go(st, f, st.plats[0], hx)) { f.cv = {fort: 1, hx}; f.q.push(rest(SA.stand, 0.1, {dir: 1}), call(g => { g.duck = 1; g.ready = 1; })); return; }
    }
    const c = cover(st, f, A.used);
    if (c) {
      A.used.push(c); const px = c.l != null && (c.r == null || Math.abs(f.x - c.l) < Math.abs(f.x - c.r)) ? c.l : c.r, hx = px < c.R.x ? c.xa + 6 : c.xb - 6;
      if (go(st, f, c.Q, px)) { f.cv = {px, hx}; f.q.push(call(g => { g.hide = c.R; }), {a: 'walk', x: hx}, call(g => { g.ready = 1; })); return; }
    }
    f.ready = 1;
  }
  function fightIdle(A, f) {
    const cv = f.cv, foes = A.m.filter(o => o.grp === A && o.side !== f.side && o.ready), q = f.q;
    if (!foes.length || !f.ready) { q.push(rest(cv && cv.fort ? SB.duck : SA.stand, 0.5, {idle: 1})); return; }
    const open = foes.filter(o => !hidden(o)), m = pickOf(open.length ? open : foes), w = rnd(0.5, 2.2), b = {a: 'ball', to: m, fun: 1};
    if (cv && cv.fort) q.push(rest(SB.duck, w), call(g => { g.duck = 0; }), b, call(g => { g.duck = 1; }));
    else if (cv) q.push(rest(SA.stand, w), {a: 'walk', x: cv.px}, b, rest(SA.stand, 0.3), {a: 'walk', x: cv.hx});
    else q.push(rest(SA.stand, w), b);
  }
  function fightStep(A, dt, st) {
    let n = 0, r = 0; for (const f of A.m) if (f.grp === A) { n++; if (f.ready) r++; }
    for (const f of st.crew) if (spare(st, f)) fightJoin(st, A, f);  // whoever was up a ladder when it began joins when down
    if (!A.end && (r >= 2 || A.t > 16)) A.end = A.t + rnd(20, 35);
    return n < 2 || (A.end > 0 && A.t > A.end);
  }
  function fightStart(st) {
    if (freeCrew(st).length < 2) return;
    const A = actStart(st, 'fight', {grp: 1, max: 80, n2: 0, fortN: 0, used: [], end: 0, idle: fightIdle, step: fightStep, fin: () => { if (st.fort && st.fort.used) st.fort.life = Math.min(st.fort.life, st.clock + 30); }});
    for (const f of freeCrew(st)) fightJoin(st, A, f);
    return true;
  }

  // ---------- B2: the jump scare ----------
  function booStep(A, dt, st) {
    const J = A.J, V = A.V, Q = A.c.Q, hx = A.hx; A.pt += dt;
    if (A.ph === 0) {
      if (J.ready && V.ready && quiet(J) && quiet(V)) {  // the joker is in place: now the other one happens to walk past
        const far = V.x < hx ? 1 : -1; A.ph = 1; V.act = null;
        if (Math.abs(V.x - hx) < 50) V.q.push({a: 'walk', x: U.clamp(hx - far * 90, Q.x1 + 2, Q.x2 - 2)});
        V.q.push({a: 'walk', x: U.clamp(hx + far * 70, Q.x1 + 2, Q.x2 - 2)});
      }
    } else if (A.ph === 1) {
      if ((Math.abs(V.x - J.x) < 22 && V.q.length < 1) || quiet(V)) {
        if (Math.abs(V.x - J.x) > 90) return true;  // never came near
        const d = V.x >= J.x ? 1 : -1, jx = U.clamp(J.x - d * 100, Q.x1 + 2, Q.x2 - 2); A.ph = 2; bump('boo'); J.hide = null;
        J.act = null; J.q.length = 0; V.act = null; V.q.length = 0; V.shv = {x: V.x + d * 12, y: V.y - 2};
        J.q.push(rest(SB.boo, 1, {face: V, hopH: 12})); V.q.push(rest(SB.jump, 0.9, {face: J, hopH: 16}));
        if (Math.random() < 0.5 && Math.abs(jx - J.x) > 50) { J.q.push({a: 'walk', x: jx, v: 2.7}, rest(SB.laugh, 1.6, {face: V})); V.q.push({a: 'walk', x: jx + d * 24, v: 2.5}, rest(SB.laugh, 1.3, {face: J})); }
        else { J.q.push(rest(SB.laugh, 2, {face: V})); V.q.push(rest(SA.wipe, 0.9), rest(SB.laugh, 1.2, {face: J})); }
        V.q.push({a: 'walk', x: V.shv.x}, call(g => { g.shv = null; }));
      }
    } else return quiet(J) && quiet(V);
  }
  function booStart(st) {
    const fr = freeCrew(st); if (fr.length < 2) return;
    const J = pickOf(fr), c = cover(st, J, [], 60); if (!c) return;
    const px = c.l != null ? c.l : c.r, hx = U.clamp(px + (px < c.R.x ? 24 : -24), c.xa, c.xb), V = nearTo(fr, hx, c.Q.y, J);
    const A = actStart(st, 'scare', {grp: 1, max: 75, need: 2, J, V, c, hx, ph: 0, idle: idleRest, step: booStep});
    claim(A, J); claim(A, V);
    if (!go(st, J, c.Q, px) || !go(st, V, c.Q, null)) { actEnd(st, A, true); return true; }
    J.q.push(call(g => { g.hide = c.R; }), {a: 'walk', x: hx}, call(g => { g.ready = 1; })); V.q.push(call(g => { g.ready = 1; }));
    return true;
  }

  // ---------- B3: the big pile, and sledding down it ----------
  const mound = (A, x) => { const u = Math.abs(x - A.cx) / 46; return u >= 1 ? 0 : 38 * Math.pow(Math.cos(u * Math.PI / 2), 1.3); };
  function sledIdle(A, f) {
    if (A.ph === 0 && f.pl === A.P.i) f.q.push({a: 'dig', dir: A.dir, n: 2, toss: () => {
      const P = A.P; A.mk = Math.min(1, A.mk + 0.075);
      for (let i = 0; i < P.n; i++) { const h = mound(A, P.x1 + i * P.dx) * A.mk; if (P.cols[i] < h) P.cols[i] = h; } P.dirty = true; }});
    else f.q.push(rest(A.ph === 1 && f.pl !== A.P.i ? SA.wave : SA.stand, 0.5, {idle: 1, dir: f.pl === A.P.i ? A.dir : 0}));
  }
  function sledStep(A, dt, st) {
    const P = A.P, d = A.dir, on = A.m.filter(f => f.grp === A); A.pt += dt;
    for (const f of on) if (f.pl === P.i && (!f.act || !AIR[f.act.a]) && Math.abs(f.y - P.y) < 2) f.lift = colH(P, f.x) * 0.85;  // they stand on the pile, not in it
    if (A.ph === 0) {
      if (A.mk >= 1 || A.t > 50) {  // tall enough: queue up behind it
        A.ph = 1; A.cur = null;
        for (const f of on) if (grounded(st, f)) { f.act = null; f.q.length = 0; if (f.pl === P.i) f.q.push({a: 'walk', x: A.cx - d * (16 + f.slot * 12)}); }
      }
    } else if (A.ph === 1) {  // one at a time
      const c = A.cur;
      if (!c || c.grp !== A || c.pl !== P.i || (!c.act && !c.q.length)) {
        const r = on.filter(f => !f.went && f.pl === P.i && grounded(st, f))[0];
        if (r) { A.cur = r; r.went = 1; r.act = null; r.q.length = 0; r.q.push({a: 'walk', x: A.cx}, rest(SA.stand, 0.35, {dir: d}), {a: 'sled', A}); bump('rides'); }
        else if (!on.some(f => f.pl === P.i && !f.went) && A.pt > 1) {
          A.ph = on.length >= 3 ? 2 : 4; A.pt = 0;
          if (A.ph === 2) on.slice(0, 3).forEach((f, k) => { f.tr = k; go(st, f, P, A.cx - d * 9 * k); });  // all three back up for the train
        }
      }
    } else if (A.ph === 2) {
      const T = on.filter(f => f.tr != null).sort((a, b) => a.tr - b.tr);
      if (T.length < 3 || A.pt > 45) { A.ph = 4; A.pt = 0; }
      else if (T.every(f => f.pl === P.i && quiet(f) && Math.abs(f.y - P.y) < 2)) {
        A.ph = 3; A.pt = 0; bump('train'); A.lead = T[0];
        T[0].act = {a: 'sled', A, train: 1, t: 0}; T[1].act = {a: 'ride', A, lead: T[0], off: 1, t: 0}; T[2].act = {a: 'ride', A, lead: T[0], off: 2, t: 0};
      }
    } else if (A.ph === 3) { if (A.pt > 1 && (!A.lead.act || A.lead.act.a !== 'sled')) { A.ph = 4; A.pt = 0; } }
    else return A.pt > 2.2;
  }
  function sledStart(st) {
    let best = null, bd = 0;
    for (const P of st.plats) {
      if (!P.i || !P.ok || P.away || P.x2 - P.x1 < 118 || P.y < 120) continue;
      for (const d of [1, -1]) {
        const ex = d > 0 ? P.rect.x + P.rect.w + 8 : P.rect.x - 8, F = below(st, ex, P.y, P);
        if (!F.ok || F.away || ex < F.x1 + 4 || ex > F.x2 - 4 || F.y - P.y < 40) continue;
        const sc = P.y + Math.random() * 220; if (sc > bd) { bd = sc; best = {P, d}; }
      }
    }
    const fr = freeCrew(st); if (!best || !fr.length) return;
    const P = best.P, d = best.d; fr.sort((a, b) => Math.abs(a.x - P.x1) + Math.abs(a.y - P.y) - Math.abs(b.x - P.x1) - Math.abs(b.y - P.y));
    const A = actStart(st, 'sled', {grp: 1, max: 170, need: 1, P, dir: d, cx: d > 0 ? P.x1 + 44 : P.x2 - 44, mk: 0, ph: 0, sleds: [], idle: sledIdle, step: sledStep, fin: a => { for (const f of a.m) { f.went = 0; f.tr = null; } }});
    P.hi = 48;
    fr.slice(0, 3).forEach((f, k) => { claim(A, f); f.slot = k; f.went = 0; f.tr = null; go(st, f, P, A.cx + d * (34 + k * 20)); });
    return true;
  }

  // ---------- B4: the cocoa break (the foreman ends it) ----------
  function cocoaIdle(A, f) {
    if (f.boss || !f.ready) { f.q.push(rest(SA.stand, 0.5, {idle: 1})); return; }
    const mate = A.m.filter(o => o.grp === A && !o.boss && o !== f).sort((a, b) => Math.abs(a.slot - f.slot) - Math.abs(b.slot - f.slot) + ((a.slot ^ 1) === f.slot ? -1 : 0))[0];
    f.q.push(rest(f.slot % 3 === 2 ? SB.sitmug : pickOf([SB.sip, SB.talk, SB.nod, SB.sip]), rnd(1.6, 3), {face: mate, idle: 1}));
  }
  function cocoaStep(A, dt, st) {
    let n = 0, r = 0; for (const f of A.m) if (f.grp === A && !f.boss) { n++; if (f.ready) r++; }
    A.pt += dt;
    if (A.ph < 2) for (const f of st.crew) if (spare(st, f)) A.join(f);  // whoever was up a ladder comes when down
    if (A.ph === 0) { if ((r >= 2 && (r === n || A.t > 45)) || A.t > 70) { A.ph = 1; A.pt = 0; A.brk = rnd(12, 18); bump('cocoaOn'); } }
    else if (A.ph === 1) {
      if (A.pt > A.brk) {  // that is quite enough: here comes the foreman
        const b = st.boss; A.ph = 2; A.pt = 0;
        if (b && !b.gone && !b.fear && !b.ov && !b.row && !b.grp && grounded(st, b)) { claim(A, b); A.boss = b; if (go(st, b, A.P, A.bx)) b.q.push(call(g => { g.ready = 1; }), rest(SB.shoo, 2.6, {dir: A.bx > (A.P.x1 + A.P.x2) / 2 ? -1 : 1})); else b.grp = null; }
      }
    } else if (A.ph === 2) {
      const b = A.boss;
      if (!b || b.grp !== A || b.ready || A.pt > 30) {
        A.ph = 3; A.pt = 0; if (b && b.ready) bump('shooed');
        for (const f of A.m) if (f.grp === A && !f.boss && f.ready) { f.mug = 0; f.act = null; f.q.length = 0; f.q.push(rest(SB.jump, 0.5, {face: b || f, hopH: 5})); if (f.shv) f.q.push({a: 'walk', x: f.shv.x + 6}, call(g => { g.shv = null; })); }
      }
    } else return A.pt > 9 || (A.pt > 1.5 && A.m.every(f => f.grp !== A || f.boss || quiet(f)));
    return n < 1;
  }
  function cocoaStart(st) {
    const fr = freeCrew(st); if (fr.length < 2) return;
    let P = null, bs = -1e9, my = 0, mx = 0; for (const f of fr) { my += f.y / fr.length; mx += f.x / fr.length; }
    const n = st.crew.length - 1;  // room for everyone, and the foreman at the end
    for (const Q of st.plats) { if (!Q.i || !Q.ok || Q.away || Q.y < 90 || Q.x2 - Q.x1 < 70) continue; const sc = Math.min(n * 26, Q.x2 - Q.x1) * 3 - Math.abs(Q.y - my) - Math.abs((Q.x1 + Q.x2) / 2 - mx) * 0.4 + rnd(0, 40); if (sc > bs) { bs = sc; P = Q; } }
    if (!P) return;
    const sp = Math.min(27, (P.x2 - P.x1 - 8) / (n - 1)), x0 = (P.x1 + P.x2) / 2 - sp * (n - 1) / 2;
    const A = actStart(st, 'cocoa', {grp: 1, max: 160, P, ph: 0, k: 0, bx: x0 + (n - 1) * sp, idle: cocoaIdle, step: cocoaStep});
    // each stands its shovel up in the snow beside its place, blade down, and has both hands for the mug
    A.join = f => { claim(A, f); f.slot = A.k++; const rx = U.clamp(x0 + f.slot * sp - 10, P.x1 + 3, P.x2 - 3); if (go(st, f, P, rx)) f.q.push(call(g => { g.shv = {x: rx, y: P.y, up: 1}; }), {a: 'walk', x: x0 + f.slot * sp}, call(g => { g.ready = 1; g.mug = 1; })); };
    fr.forEach(A.join);
    return true;
  }

  // ---------- B5, B6: snowmen and other things made of snow ----------
  function manStep(A, dt, st) {
    const a = A.a, b = A.b, M = A.man, x0 = A.x0; A.pt += dt;
    if (A.ph === 0) {
      if (A.balls[0].on && A.balls[1].on && quiet(a) && quiet(b)) {
        A.ph = 1; A.pt = 0; A.man = {x: x0, y: st.plats[0].y - 5, type: A.type, k: A.type ? 0 : 1, sy: 1, life: st.force ? 22 : rnd(150, 270), carrot: true, cv: null, stage: 0, done: false, actor: null};
        st.men.push(A.man); a.act = b.act = null;
        if (A.type) { a.q.push(rest(SB.pat, 5.2, {dir: 1})); b.q.push(rest(SB.pat, 5.2, {dir: -1})); }
        else { b.q.push(rest(SB.lift, 0.9, {dir: -1}), rest(SA.stand, 1.2, {dir: -1}), rest(SB.reach, 2.2, {dir: -1})); a.q.push(rest(SA.stand, 0.9, {dir: 1}), rest(SB.pat, 0.8, {dir: 1}), rest(SB.lift, 0.6, {dir: 1}), rest(SA.stand, 2, {dir: 1})); }
      }
    } else if (A.ph === 1) {
      const t = A.pt, B = A.balls;
      if (A.type) { M.k = Math.min(1, t / 5); if (!M.cv) M.cv = sculpt(M.type, 9, true); if (M.k > 0.3) B[0].on = B[1].on = 0; if (t > 5.2) A.ph = 2; }
      else {
        // the middle is lifted on, the head is patted round and set on top, then the hat, the arms and the carrot
        if (t < 0.85) { const u = Math.min(1, t / 0.8); B[1].x = A.bx + (x0 - A.bx) * u; B[1].y = A.by + (M.y - 31 - A.by) * u - Math.sin(u * Math.PI) * 14; }
        const sg = t < 0.85 ? 0 : t < 2.3 ? 2 : t < 3 ? 3 : t < 3.7 ? 4 : t < 4.4 ? 5 : 6;
        if (sg > M.stage) { M.stage = sg; M.cv = sculpt(0, sg, true); B[0].on = B[1].on = 0; }
        if (t > 1.3 && t < 2.3) { const u = Math.min(1, (t - 1.7) / 0.5); B[1].on = 1; B[1].r = 6.5; B[1].x = x0 - 21 + 21 * Math.max(0, u); B[1].y = M.y - 8 - (u > 0 ? 36 * u + Math.sin(u * Math.PI) * 8 : 0); }
        if (t > 4.6) A.ph = 2;
      }
      if (A.ph === 2) {
        M.done = true; bump('built'); const w = A.type ? 104 : 52;
        a.act = b.act = null; a.q.length = b.q.length = 0;
        a.q.push({a: 'walk', x: x0 - w}, rest(SB.proud, 2.8, {dir: 1})); b.q.push({a: 'walk', x: x0 + w + 6}, rest(A.type ? SB.horror : SA.wave, 2.8, {dir: -1}));
      }
    } else return quiet(a) && quiet(b);
  }
  function manStart(st, type) {
    const G = st.plats[0], fr = freeCrew(st); if (fr.length < 2 || st.men.length >= 3) return;
    const x0 = spotOn(st, 170); if (x0 == null) return;
    const a = nearTo(fr, x0 - 125, G.y), b = nearTo(fr, x0 + 125, G.y, a);
    const A = actStart(st, type ? 'tableau' : 'snowman', {grp: 1, max: 130, need: 2, type, x0, a, b, ph: 0, bx: x0 + 27, by: G.y - 13, man: null, balls: [{x: 0, y: 0, r: 0, on: 0}, {x: 0, y: 0, r: 0, on: 0}], idle: idleRest, step: manStep,
      fin: A => { const M = A.man; A.balls[0].on = A.balls[1].on = 0; if (M && !M.done) { M.done = true; M.k = 1; M.stage = 9; M.cv = sculpt(M.type, M.type ? 9 : 6, true); } }});
    if (type) bump('tab' + type);
    claim(A, a); claim(A, b);
    if (go(st, a, G, x0 - 125)) a.q.push({a: 'roll', x: x0 - 13 - 8 * a.s, r0: 3, r1: 13, ball: A.balls[0]});
    if (go(st, b, G, x0 + 125)) b.q.push({a: 'roll', x: x0 + 27 + 9 + 8 * b.s, r0: 3, r1: 9, ball: A.balls[1]});
    return true;
  }
  /** Snowmen stand for a few minutes, then sag and melt away; now and then someone shovels one up first. */
  function menStep(st, g, dt, sc) {
    for (let i = st.men.length - 1; i >= 0; i--) {
      const M = st.men[i];
      if (M.done) {
        M.life -= dt;
        if (M.life < 0) {
          if (!M.tried) {
            M.tried = 1; const f = nearTo(freeCrew(st).filter(o => !o.pl && Math.abs(o.x - M.x) < 420), M.x, M.y);
            if (f && Math.random() < 0.6) { f.q.length = 0; f.act = null; f.job = null; f.q.push({a: 'walk', x: M.x - 22}, {a: 'dig', dir: 1, n: 2, toss: () => { M.sy -= 0.5; puff(st, M.x, M.y - 20, 6); }}); }
          }
          M.sy -= dt / 9;
        }
        if (M.sy < 0.08) { st.men.splice(i, 1); bump('melted'); continue; }
        if (sc && M.carrot && M.life > 0) {
          if (!M.actor) M.actor = {kind: 'snowman', x: M.x, y: M.y, h: 50, carrot: true, take() { if (!M.carrot) return false; M.carrot = this.carrot = false; M.cv = sculpt(M.type, M.type ? 9 : 6, false); bump('carrots'); return true; }};
          sc.next.push(M.actor);
        }
      }
      if (M.cv) { const sh = 100 * M.k, w = 180 * (1 + (1 - M.sy) * 0.25); g.drawImage(M.cv, 0, 100 - sh, 180, sh, M.x - w / 2, M.y + 3 - sh * M.sy, w, sh * M.sy); }
    }
  }

  // ---------- B7: the snow angel ----------
  function angelQ(st, f, P, x, after) {
    f.q.push(call(() => bump('flaps')), rest(SB.angel, 4.6, {dir: 1}), call(g => {
      const cx = (g.J[0] + g.J[2]) / 2; if (P.dents.length < 3) P.dents.push({x: cx, a: 1}); bump('dents');
      for (let i = 0; i < P.n; i++) if (Math.abs(P.x1 + i * P.dx - cx) < 16) P.cols[i] *= 0.8; P.dirty = true; }),
    rest(SB.rise, 1.1), {a: 'walk', x: U.clamp(x + 30, P.x1 + 2, P.x2 - 2)}, rest(SB.proud, 1.5, {dir: -1}), call(after));
  }
  function angelStart(st) {
    const fr = freeCrew(st); if (!fr.length) return;
    const f = pickOf(fr), c = st.plats.filter(Q => { if (!Q.ok || Q.away || Q.x2 - Q.x1 < 90 || Q.dents.length > 1) return false; let s = 0; for (let i = 0; i < Q.n; i++) s += Q.cols[i]; return s / Q.n > Q.cap * 0.4; });
    if (!c.length) return;
    const P = pickOf(c), x = P.i ? rnd(P.x1 + 36, P.x2 - 40) : spotOn(st, 60); if (x == null) return;
    const A = actStart(st, 'angel', {grp: 1, max: 70, need: 1, P, ok: 0, idle: idleRest, step: A => A.ok && quiet(f)});
    claim(A, f); if (!go(st, f, P, x)) { actEnd(st, A, true); return true; }
    angelQ(st, f, P, x, () => { A.ok = 1; });
    return true;
  }

  // ---------- C1: a heap shoved off the edge onto the one below ----------
  function shoveStart(st) {
    const fr = freeCrew(st); if (fr.length < 2) return;
    for (const a of fr) {
      const P = st.plats[a.pl]; if (!P.i) continue;
      for (const sd of [-1, 1]) {
        const R = P.rect, ex = sd < 0 ? R.x : R.x + R.w, lx = ex + sd * 13, F = below(st, lx, P.y, P), dy = F.y - P.y;
        if (!F.ok || F.away || dy < 50 || dy > 330 || lx < F.x1 + 4 || lx > F.x2 - 4) continue;
        const b = nearTo(fr, lx, F.y, a), ax = U.clamp(ex - sd * 12, P.x1 + 2, P.x2 - 2);
        const A = actStart(st, 'shove', {max: 70, need: 2, a, b, heap: null, hit: 0, idle: idleRest, step: (A, dt) => {
          const h = A.heap;
          if (h) {
            h.vy += 600 * dt; h.y += h.vy * dt;
            if (h.y > b.y - 30 * b.s && b.grp === A && b.pl === F.i && Math.abs(b.x - h.x) < 22) {  // buried to the neck
              A.heap = null; A.hit = 1; bump('buried'); b.bury = 1; b.act = null; b.q.length = 0; puff(st, b.x, b.y - 30, 6);
              b.q.push(rest(SB.stuck, 1.8), call(g => { g.bury = 0; puff(st, g.x, g.y - 18, 9); }), rest(SB.shake, 0.7), rest(SA.fist, 0.9, {face: a}));
            } else if (h.y > F.y) { A.heap = null; A.hit = 1; puff(st, h.x, F.y - 4, 8); }
          }
          return A.hit && quiet(a) && quiet(b);
        }});
        claim(A, a); claim(A, b);
        if (!go(st, a, P, ax) || !go(st, b, F, lx)) { actEnd(st, A, true); return true; }
        a.q.push(rest(SA.stand, 40, {dir: sd, until: () => b.ready || b.grp !== A}), rest(SB.shove, 0.8, {dir: sd}), call(() => {
          A.heap = {x: lx, y: P.y - 8, vy: 0}; for (let i = 0; i < P.n; i++) if (Math.abs(P.x1 + i * P.dx - ex) < 34) P.cols[i] *= 0.2; P.dirty = true; }), rest(SB.laugh, 2.6, {dir: sd}));
        b.q.push(call(g => { g.ready = 1; }), rest(SA.lean, 40, {tool: 2, until: () => A.hit}));
        return true;
      }
    }
  }

  // ---------- C2: icicles under the tiles, knocked off with the shovel ----------
  function iceBuild(st) {
    const p = st.iceP = new Path2D(); st.iceDirty = false;
    for (const c of st.ice) if (c.len > 1 && !c.off) { const y = c.R.y + c.R.h - 0.5; p.moveTo(c.x - 1.9, y); p.lineTo(c.x + 1.9, y); p.lineTo(c.x + 0.3, y + c.len); p.closePath(); }
    for (const c of st.stuck) { p.moveTo(c.x - 1.7, c.y - c.len); p.lineTo(c.x + 1.7, c.y - c.len); p.lineTo(c.x, c.y + 1); p.closePath(); }
  }
  function icicleStart(st) {
    const fr = freeCrew(st); if (!fr.length) return;
    const f = pickOf(fr); let best = null, bx = 0, bd = 1e9;
    for (const c of st.covers) {
      if (c.off || !c.Q.ok || c.Q.away) continue;
      for (const ic of st.ice) if (ic.R === c.R && ic.len >= 4 && ic.x > c.Q.x1 + 8 && ic.x < c.Q.x2 - 8) { const d = Math.abs(c.Q.y - f.y) * 1.5 + Math.abs(ic.x - f.x); if (d < bd) { bd = d; best = c; bx = ic.x; } }
    }
    if (!best) return;
    const A = actStart(st, 'icicle', {max: 60, need: 1, ok: 0, idle: idleRest, step: A => A.ok && quiet(f)});
    claim(A, f); if (!go(st, f, best.Q, bx - 7)) { actEnd(st, A, true); return true; }
    f.q.push(call(() => bump('knocks')), rest(SB.knock, 1, {tool: 1, dir: 1}), call(g => {
      for (const ic of st.ice) if (ic.R === best.R && ic.len > 1 && Math.abs(ic.x - g.x) < 32) { if (st.iceF.length < 8) st.iceF.push({x: ic.x, y: ic.R.y + ic.R.h, len: ic.len, vy: 0, gy: best.Q.y - 1}); ic.len = 0; bump('icicles'); }
      st.iceDirty = true; }), rest(SA.stand, 0.8), call(() => { A.ok = 1; }));
    return true;
  }

  // ---------- C3: a tongue frozen to the ladder ----------
  function tongueStart(st) {
    const fr = freeCrew(st); if (fr.length < 2) return;
    const a = fr.filter(f => { const L = f.lad.link; return f.lad.on && L && L.a.ok && !L.a.away && !L.b.away && (f.pl === L.a.i || f.pl === L.b.i); })[0]; if (!a) return;
    const F = a.lad.link.a, b = nearTo(fr, a.x, F.y, a);
    const A = actStart(st, 'tongue', {max: 90, need: 2, a, b, stuck: 0, free: 0, fail: 0, idle: idleRest, step: A => A.fail || (A.stuck && !a.lad.on) || (A.free && quiet(a) && quiet(b))});
    claim(A, a); claim(A, b);
    if (!go(st, a, F, null)) { actEnd(st, A, true); return true; }
    a.q.push(call(g => {
      const L = g.lad.link; if (!g.lad.on || !L || L.a.i !== g.pl) { A.fail = 1; return; }
      const u = Math.min(0.85, 35 * g.s / (L.fy - L.ty)), pt = {x: L.fx + (L.tx - L.fx) * u, y: L.fy - 35 * g.s}, ax = U.clamp(pt.x + L.sd * 19, L.a.x1 + 2, L.a.x2 - 2);
      g.q.push({a: 'walk', x: ax}, rest(SB.lick, 1, {dir: -L.sd}), call(() => { g.tong = pt; A.stuck = 1; A.ax = ax; A.sd = L.sd; bump('licks'); }), rest(SB.flail, 45, {dir: -L.sd, until: () => A.free}));
    }));
    b.q.push(rest(SA.stand, 45, {until: () => A.stuck}), call(g => {
      if (!go(st, g, F, A.ax + A.sd * 13)) { A.fail = 1; return; }
      g.q.push(call(() => bump('pulls')), rest(SB.pull, 2, {dir: -A.sd}), call(() => { A.free = 1; a.tong = null; a.act = null; a.q.length = 0; react(a, SA.slip, 2.3); react(g, SA.slip, 2.3); }));
    }));
    return true;
  }

  // ---------- C5: the snow fort ----------
  function fortStart(st) {
    const fr = freeCrew(st); if (st.fort || fr.length < 2) return;
    const x0 = spotOn(st, 170), G = st.plats[0]; if (x0 == null) return;
    const a = nearTo(fr, x0 - 46, G.y), b = nearTo(fr, x0 + 46, G.y, a), F = st.fort = {x: x0, n: 0, life: 1e9, used: 0, melt: 0, t: 0};
    const A = actStart(st, 'fort', {max: 90, need: 1, idle: (A, f) => {
      if (F.n < 9 && !f.pl && Math.abs(f.x - x0) < 60) f.q.push({a: 'dig', dir: f.x < x0 ? -1 : 1, n: 1, toss: () => { F.n = Math.min(9, F.n + 1); st.fortP = null; }}); else idleRest(A, f); },
      step: () => F.n >= 9, fin: () => { st.fortP = null; if (F.n < 4) st.fort = null; else { F.n = 9; F.life = st.clock + (st.force === 'fort' ? 12 : 240); } }});
    claim(A, a); claim(A, b); go(st, a, G, x0 - 46); go(st, b, G, x0 + 46);
    return true;
  }
  function fortStep(st, g, dt) {
    const F = st.fort, y = st.plats[0].y;
    if (st.clock > F.life) { F.melt = 1; if ((F.t += dt) > 1.2) { F.t = 0; F.n--; st.fortP = null; if (F.n <= 0) { st.fort = null; bump('fortGone'); return; } } }
    if (!st.fortP) { const p = st.fortP = new Path2D(); for (let i = 0; i < F.n; i++) p.rect(i < 5 ? F.x - 30 + i * 12 : F.x - 24 + (i - 5) * 12, i < 5 ? y - 10 : y - 19, 11.4, 8.4); }
    g.fillStyle = 'rgba(247,251,255,.97)'; g.fill(st.fortP); g.lineWidth = 1; g.strokeStyle = 'rgba(110,140,190,.75)'; g.stroke(st.fortP);
  }

  // ---------- C4: clocking off ----------
  function shiftJoin(st, f) {
    let S = st.shift; if (!S) { S = st.shift = {x: U.clamp(st.w * 0.62, 140, st.w - 140), line: [], t: 0, ding: -9, go: false}; bump('shift'); }
    const i = S.line.indexOf(f); if (i >= 0) S.line.splice(i, 1); S.line.push(f); f.sh = 1;
    const out = g => { g.sh = 0; const k = S.line.indexOf(g); if (k >= 0) S.line.splice(k, 1); };
    f.q.push({a: 'walk', x: S.x - 26 - (S.line.length - 1) * 20},
      rest(SA.stand, 45, {dir: 1, sh: 1, until: g => st.snowing || (S.line[0] === g && (S.go || (S.go = S.t > 28 || st.crew.every(o => o.gone || o.boss || o.guest || (o.act && o.act.sh)))))}),
      call(g => { if (st.snowing) { g.q.length = 0; out(g); } }), {a: 'walk', x: S.x - 10}, rest(SB.punch, 0.7, {dir: 1}), call(g => { S.ding = st.clock; out(g); bump('punched'); }), {a: 'exit', x: st.w + 50});
  }
  function shiftStep(st, g, dt) {
    const S = st.shift, y = st.plats[0].y; S.t += dt; SEEN.ax = S.x - 40; SEEN.ay = y;
    while (S.line.length && (S.line[0].gone || !S.line[0].sh)) S.line.shift();
    if (st.crew.every(f => f.gone) || (st.snowing && !S.line.length)) { st.shift = null; bump('shiftEnd'); return; }
    // the time clock: a post, a box, a dial; the card slot blinks when someone punches
    g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.moveTo(S.x, y); g.lineTo(S.x, y - 30); g.stroke();
    g.strokeStyle = '#a97c4e'; g.lineWidth = 2.6; g.stroke();
    g.fillStyle = '#5b6b86'; g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.rect(S.x - 8, y - 46, 16, 17); g.fill(); g.stroke();
    g.fillStyle = '#f4f6fb'; g.beginPath(); g.arc(S.x, y - 39.5, 4.6, 0, 6.3); g.fill();
    g.strokeStyle = '#1b2238'; g.lineWidth = 1; g.beginPath(); g.moveTo(S.x, y - 39.5); g.lineTo(S.x, y - 43); g.moveTo(S.x, y - 39.5); g.lineTo(S.x + 2.6, y - 38.4); g.stroke();
    g.fillStyle = st.clock - S.ding < 0.35 ? '#ffe27a' : '#1b2238'; g.fillRect(S.x - 4, y - 33, 8, 1.8);
  }

  // ---------- C6: the foreman ----------
  function bossPlan(st, f) {
    const q = f.q; f.fetch = 0; f.hide = null;
    if (!st.snowing && !st.work) {  // by the clock, ticking them off; he is the last to leave
      fetchLad(st, f); const left = travel(st, f, st.plats[0]); if (left) q.push({a: 'walk', x: left.xf}, {a: 'grab', link: left, top: false});
      if (!st.shift) { q.push(rest(SB.clip, 1.5, {clip: 1})); return; }
      q.push({a: 'walk', x: st.shift.x + 17}, rest(SB.clip, 90, {dir: -1, clip: 1, until: () => !st.shift || st.snowing || st.crew.every(o => o.gone || o.boss || o.guest)}), call(g => { if (!st.snowing) g.q.push({a: 'exit', x: st.w + 50}); }));
      return;
    }
    const c = st.plats.filter(P => P.ok && !P.away && P.x2 - P.x1 > 60), P = Math.random() < 0.55 ? st.plats[f.pl] : pickOf(c);
    if (P.ok && !P.away) go(st, f, P, rnd(P.x1 + 10, P.x2 - 10));
    const d = Math.random() < 0.5 ? -1 : 1;
    q.push(rest(SB.point, rnd(1.4, 2.2), {dir: d}), rest(SB.clip, rnd(1.8, 3), {dir: d, clip: 1}));
    if (Math.random() < 0.4) q.push(rest(SB.proud, 1.6, {dir: -d}));
  }

  // ---------- D2: the one in the pink bunny suit ----------
  function bunnyStart(st) {
    const f = st.bunny, sd = Math.random() < 0.5 ? -1 : 1; if (!f.gone || (!st.force && Math.random() < 0.85)) return;  // only now and then
    f.gone = false; f.x = sd < 0 ? -30 : st.w + 30; f.y = st.plats[0].y; f.pl = 0; f.lift = 0; f.fear = null; f.ov = null; f.re = null;
    const A = actStart(st, 'bunny', {max: 90, need: 1, k: 0, step: () => f.gone, idle: (A, f) => {
      const G = st.plats[0], q = f.q, fight = st.acts.filter(o => o.n === 'fight')[0], foes = fight ? fight.m.filter(o => o.grp === fight && o.ready) : [];
      if (A.k++) { q.push({a: 'exit', x: f.x < st.w / 2 ? -50 : st.w + 50, v: 0.5, an: SB.glum}); return; }
      // joins in with whatever is going on, without much joy
      if (foes.length) { bump('bunnyJoin'); q.push({a: 'ball', to: pickOf(foes), fun: 1}, rest(SB.shy, 1.2), {a: 'ball', to: pickOf(foes), fun: 1}, rest(SB.shy, 1.5)); }
      else if (st.acts.some(o => o.n === 'cocoa')) { bump('bunnyJoin'); q.push(call(g => { g.mug = 1; }), rest(SB.sip, 5.5), call(g => { g.mug = 0; })); }
      else if (colH(G, f.x) > 5 && Math.random() < 0.7) { bump('bunnyJoin'); angelQ(st, f, G, f.x, () => {}); q.pop(); q.pop(); q.pop(); q.push(rest(SB.shy, 1.5)); }
      else q.push(rest(SB.shy, 2.5));
    }});
    claim(A, f); f.q.push({a: 'walk', x: sd < 0 ? rnd(130, 380) : st.w - rnd(130, 380), v: 0.5, an: SB.glum}, rest(SB.shy, rnd(3.5, 5.5), {dir: -sd}));
    return true;
  }

  SEEN.sculpt = sculpt; SEEN.rv = rvSprite;  // (for the test page, which lays them all out side by side)
  // ---------- the yeti: a big shaggy friend who looks in round the edge of the screen ----------
  function yetiStart(st, ctx) {
    const m = ctx.env.month, F = st.force === 'yeti';
    if (st.yeti || (!F && ((!st.snowing && m !== 12 && m !== 1 && m !== 2) || st.sinceYeti < 3 || Math.random() < 0.5))) return;
    st.yeti = {sd: Math.random() < 0.5 ? -1 : 1, ph: 0, t: 0, k: 0, cocoa: F ? !(st.yetiN++ & 1) : Math.random() < 0.65, f: null, mug: 0, froze: 0, waved: 0, hx: 8, hy: -66};
    st.sinceYeti = 0;
    actStart(st, 'yeti', {grp: 1, max: 110, step: yetiStep, idle: idleRest, fin: () => { st.yeti = null; }});
    return true;
  }
  function yetiStep(A, dt, st) {
    const Y = st.yeti, ex = Y.sd < 0 ? 0 : st.w, G = st.plats[0], go2 = n => { Y.ph = n; Y.t = 0; }, to = k => { Y.k += U.clamp(k - Y.k, -dt * 0.8, dt * 0.8); }; Y.t += dt;
    SEEN.ax = ex - Y.sd * 60; SEEN.ay = G.y - 50;
    if (Y.ph === 0) { to(0.36); if (Y.t > 2.8) go2(1); }  // first a hand and an eye
    else if (Y.ph === 1) {  // then head and shoulders: everyone stops dead
      to(1);
      if (Y.t > 0.3 && !Y.froze) { Y.froze = 1; bump('froze'); for (const c of st.crew) if (canTake(st, c) && !c.re) { react(c, SB.look, 2.6); c.dir = ex >= c.x ? 1 : -1; } }
      if (Y.t > 2.8) {
        const f = Y.cocoa ? nearTo(freeCrew(st), ex, G.y) : null;
        if (f) { claim(A, f); if (go(st, f, G, ex - Y.sd * 60)) { Y.f = f; f.mug = 1; f.q.push(call(g => { g.ready = 1; }), rest(SB.give, 40, {dir: Y.sd, until: () => Y.ph !== 2 && Y.ph !== 3})); } else f.grp = null; }
        if (!Y.f) Y.cocoa = false;
        go2(2);
      }
    } else if (Y.ph === 2) {
      to(1);
      if (Y.cocoa) { const f = Y.f; if (f.grp !== A || Y.t > 50) { Y.cocoa = false; Y.t = 0; } else if (f.ready) go2(3); }  // one of them brings it a mug
      else {  // or it only waves, and one of them waves back
        if (Y.t > 0.4 && !Y.waved) { Y.waved = 1; bump('yetiWave'); const c = nearTo(st.crew.filter(o => canTake(st, o) && !o.guest), ex, G.y); if (c) { react(c, SA.wave, 2.2); c.dir = ex >= c.x ? 1 : -1; } }
        if (Y.t > 3) go2(6);
      }
    } else if (Y.ph === 3) { if (Y.t > 0.9) { Y.mug = 1; if (Y.f.grp === A) Y.f.mug = 0; bump('yetiMug'); go2(4); } }  // takes it between two fingers
    else if (Y.ph === 4) { if (Y.t > 3.4) { const f = Y.f; if (f.grp === A && grounded(st, f)) { f.act = null; f.q.length = 0; f.q.push(rest(SA.wave, 1.8, {dir: Y.sd})); } go2(6); } }  // a sip, a happy shiver
    else { to(0); if (Y.k <= 0.01 && Y.t > 0.5) return true; }
  }
  function yetiDraw(g, st) {
    const Y = st.yeti, c = st.clock, k = Y.k, ph = Y.ph, t = Y.t, shiver = ph === 4 && t > 1.9, hx = -34 + 60 * k + (shiver ? Math.sin(c * 46) * 1.6 : 0), FUR = '#f6f9ff', EDGE = 'rgba(112,142,200,.95)';
    // one shaggy shape: a ring of points, every other one a tuft further out
    const shag = (cx, cy, rx, ry, n) => { g.beginPath(); for (let i = 0; i < n; i++) { const a = i / n * 6.283, r = i & 1 ? 1.11 : 0.97; g.lineTo(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r); } g.closePath(); g.fillStyle = FUR; g.fill(); g.strokeStyle = EDGE; g.lineWidth = 1.4; g.stroke(); };
    g.save(); g.translate(Y.sd < 0 ? 0 : st.w, st.plats[0].y); if (Y.sd > 0) g.scale(-1, 1); g.lineJoin = g.lineCap = 'round';
    shag(hx - 16, -30, 44, 46, 30); shag(hx, -90, 27, 29, 26);
    g.strokeStyle = 'rgba(150,178,228,.9)'; g.lineWidth = 1.5; g.beginPath();  // blue shadows in the fur
    for (const q of [[-30, -40], [-10, -28], [8, -44], [-22, -14], [2, -12], [-38, -22], [-14, -108], [6, -112]]) { g.moveTo(hx + q[0] - 3, q[1] - 3); g.lineTo(hx + q[0], q[1] + 2); g.lineTo(hx + q[0] + 3, q[1] - 3); }
    g.stroke();
    g.fillStyle = '#d5e4f7'; g.beginPath(); g.ellipse(hx + 6, -82, 13, 9, 0, 0, 6.3); g.fill();  // the muzzle
    for (const x of [hx - 4, hx + 14]) {  // big round eyes (shut tight in a happy shiver)
      if (shiver) { g.strokeStyle = '#1b2238'; g.lineWidth = 1.8; g.beginPath(); g.arc(x, -96, 4.5, Math.PI + 0.3, -0.3); g.stroke(); continue; }
      g.fillStyle = '#fff'; g.strokeStyle = '#1b2238'; g.lineWidth = 1.3; g.beginPath(); g.arc(x, -98, 6.4, 0, 6.3); g.fill(); g.stroke(); g.fillStyle = '#1b2238'; g.beginPath(); g.arc(x + 2, -97, 2.8, 0, 6.3); g.fill(); g.fillStyle = '#fff'; g.fillRect(x + 0.6, -99, 1.5, 1.5);
    }
    g.fillStyle = '#4a6aa8'; g.beginPath(); g.ellipse(hx + 7, -87, 3.2, 2.2, 0, 0, 6.3); g.fill();
    g.strokeStyle = '#1b2238'; g.lineWidth = 1.4; g.beginPath(); g.arc(hx + 7, -84, 6.5, 0.35, Math.PI - 0.35); g.stroke();
    // the hand: gripping the edge; or out for the mug, up to the mouth, waving
    let tx = 8, ty = -66; const u = Math.min(1, t / 0.8), e = u * u * (3 - 2 * u);
    if (ph === 2 && !Y.cocoa) { tx = 70 + Math.sin(c * 8) * 9; ty = -108; }
    else if (ph === 3) { tx = 8 + 34 * e; ty = -66 + 40 * e; }
    else if (ph === 4) { const v = t < 2.6 ? e : Math.max(0, 1 - (t - 2.6) / 0.6); tx = 42 + (hx + 15 - 42) * v; ty = -26 + (-74 + 26) * v; }
    Y.hx += (tx - Y.hx) * 0.45; Y.hy += (ty - Y.hy) * 0.45; const px = Y.hx, py = Y.hy, grip = Math.abs(px - 8) < 3 && Math.abs(py + 66) < 3;
    if (grip) { g.beginPath(); for (let i = 0; i < 4; i++) { g.moveTo(-3, -77 + i * 7.5); g.lineTo(12 - (i === 3 ? 3 : 0), -77 + i * 7.5); } g.strokeStyle = EDGE; g.lineWidth = 8.6; g.stroke(); g.strokeStyle = FUR; g.lineWidth = 6.2; g.stroke(); }
    else if (k > 0.5) {
      g.beginPath(); g.moveTo(hx + 12, -46); g.quadraticCurveTo((hx + px) / 2 + 22, (py - 46) / 2 + 12, px, py); g.strokeStyle = EDGE; g.lineWidth = 15; g.stroke(); g.strokeStyle = FUR; g.lineWidth = 12.4; g.stroke();
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + 9, py - 5); g.moveTo(px, py); g.lineTo(px + 9, py + 5); if (!Y.mug) { g.moveTo(px, py); g.lineTo(px + 3, py - 9); } g.strokeStyle = EDGE; g.lineWidth = 7.6; g.stroke(); g.strokeStyle = FUR; g.lineWidth = 5.4; g.stroke();
      if (Y.mug) { g.fillStyle = '#c8553a'; g.fillRect(px + 7, py - 3.2, 5, 6.4); }  // the mug, tiny between two huge fingers
    }
    g.restore();
  }

  const GROUPS = {yeti: yetiStart, fight: fightStart, scare: booStart, sled: sledStart, cocoa: cocoaStart, snowman: st => manStart(st, 0), tableau: st => manStart(st, st.force ? 1 + st.tabN++ % 8 : 1 + (Math.random() * 8 | 0)), angel: angelStart, santa: santaStart, camper: camperStart};
  const GAGS = {shove: shoveStart, icicle: icicleStart, tongue: tongueStart, fort: fortStart, bunny: bunnyStart};
  function tryStart(st, list, ctx) {
    const F = st.force, names = F ? [F] : Object.keys(list).sort(() => Math.random() - 0.5);
    if (!F && list === GROUPS && !st.xmasDone && (ctx.opts.santa || 'xmas') === 'xmas' && xmas(ctx)) { st.xmasDone = 1; names.unshift('santa'); }  // on the two days he is the first thing to happen
    for (const n of names) if (list[n](st, ctx)) return true;
    return false;
  }
  /** Run the games that are on, and start the next when its time has come. */
  function playStep(st, dt, ctx) {
    for (let i = st.acts.length - 1; i >= 0; i--) {
      const A = st.acts[i]; A.t += dt; let n = 0; for (const f of A.m) if (f.grp === A) n++;
      if ((A.P && (A.P.away || !A.P.ok)) || n < A.need || A.t > A.max) actEnd(st, A, true); else if (A.step(A, dt, st)) actEnd(st, A, false);
    }
    if (st.acts.length) { const A = st.acts[st.acts.length - 1], f = st.santa && !st.santa.seat ? st.santa.f : st.rv ? st.rv.f : A.b && A.b.grp === A ? A.b : A.m[A.m.length > 1 && A.m[0].grp !== A ? 1 : 0]; if (f) { SEEN.ax = Math.round(f.x); SEEN.ay = Math.round(f.y); } }  // (where to look, for the test page)
    if (st.shift || !st.crew.some(f => !f.gone && !f.guest)) return;
    const F = st.force; let grp = false, gag = false; for (const A of st.acts) if (A.grp) grp = true; else gag = true;
    if (!grp && !st.row && st.clock > st.playNext && (!F || GROUPS[F])) { st.playNext = st.clock + 2; tryStart(st, GROUPS, ctx); }
    if (!gag && st.clock > st.gagNext && (!F || GAGS[F])) { st.gagNext = st.clock + 2; tryStart(st, GAGS, ctx); }
  }

  // ---------- drawing: things made of snow ----------
  /** A snowman (type 0, built up in stages) or one of the stranger things, drawn once into its own small canvas.
   *  The ground is at y = 97, the middle at x = 90. */
  function sculpt(type, stage, carrot) {
    const c = document.createElement('canvas'); c.width = 180; c.height = 100;
    const g = c.getContext('2d'); g.translate(90, 97); g.lineJoin = g.lineCap = 'round';
    const B = (x, y, r) => { g.fillStyle = 'rgba(247,251,255,.98)'; g.strokeStyle = 'rgba(105,135,188,.85)'; g.lineWidth = 1.1; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); g.stroke(); };
    const dot = (x, y, r) => { g.fillStyle = '#141a2c'; g.beginPath(); g.arc(x, y, r || 1.1, 0, 6.3); g.fill(); };
    const line = (col, w, p) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke(); };
    const twig = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; line('#6b4a2b', 1.7, [x1, y1, x2, y2]); line('#6b4a2b', 1.3, [x2 - dy * 0.28, y2 + dx * 0.28, x1 + dx * 0.68, y1 + dy * 0.68, x2 + dy * 0.28, y2 - dx * 0.28]); };
    const nose = (x, y, d, len) => { if (!carrot) return; g.fillStyle = '#f08a24'; g.beginPath(); g.moveTo(x, y - 1.6); g.lineTo(x + d * len, y + 0.6); g.lineTo(x, y + 1.6); g.fill(); };
    // a face looking toward d: two eyes, the carrot, and a mouth to suit the mood
    const face = (x, y, s, d, mood) => {
      dot(x + d * 0.6 * s, y - 1.8 * s, 1.1 * s); dot(x + d * 3.8 * s, y - 1.8 * s, 1.1 * s); nose(x + d * 3 * s, y + 0.4 * s, d, 7 * s);
      if (mood === 'o') dot(x + d * 2.4 * s, y + 3.3 * s, 1.7 * s);
      else if (mood === 'grr') { line('#141a2c', 1.2 * s, [x - d * 1 * s, y + 3 * s, x + d * 0.5 * s, y + 4.2 * s, x + d * 2 * s, y + 3 * s, x + d * 3.5 * s, y + 4.2 * s, x + d * 5 * s, y + 3 * s]); line('#141a2c', 1.2 * s, [x - d * 1.2 * s, y - 4.6 * s, x + d * 1.6 * s, y - 3.2 * s]); line('#141a2c', 1.2 * s, [x + d * 5.4 * s, y - 4.6 * s, x + d * 3 * s, y - 3.2 * s]); }
      else if (mood === 'x') { line('#141a2c', 1.1 * s, [x - d * 0.2 * s, y + 4 * s, x + d * 2.2 * s, y + 3 * s, x + d * 4.4 * s, y + 4 * s]); }
      else { dot(x + d * 0.4 * s, y + 3 * s, 0.7 * s); dot(x + d * 2.2 * s, y + 3.8 * s, 0.7 * s); dot(x + d * 4 * s, y + 3 * s, 0.7 * s); }
    };
    // an ordinary snowman at x; o.arms: 1 up in alarm, 2 hands to the head, 3 hanging, otherwise out
    const man = (x, s, d, o) => {
      B(x, -11 * s, 12 * s); B(x, -28 * s, 9 * s);
      if (!o.nohead) { B(x, -41.5 * s, 6.5 * s); face(x, -41.5 * s, s, d, o.mood); }
      dot(x + d * 3 * s, -30 * s, 0.9 * s); dot(x + d * 3.4 * s, -25 * s, 0.9 * s);
      const a = o.arms;
      if (a === 1) { twig(x - 7 * s, -31 * s, x - 17 * s, -47 * s); twig(x + 7 * s, -31 * s, x + 17 * s, -47 * s); }
      else if (a === 2) { line('#6b4a2b', 1.7, [x - 7 * s, -30 * s, x - 15 * s, -36 * s, x - 6 * s, -46 * s]); line('#6b4a2b', 1.7, [x + 7 * s, -30 * s, x + 15 * s, -36 * s, x + 6 * s, -46 * s]); }
      else if (a === 3) { twig(x - 7 * s, -30 * s, x - 15 * s, -18 * s); twig(x + 7 * s, -30 * s, x + 15 * s, -18 * s); }
      else if (a !== 4) { twig(x - 7 * s, -31 * s, x - 21 * s, -37 * s); twig(x + 7 * s, -31 * s, x + 21 * s, -37 * s); }
    };
    const tilt = (x, a, fn) => { g.save(); g.translate(x, 0); g.rotate(a); fn(); g.restore(); };
    if (type === 0) {
      if (stage >= 1) B(0, -12, 13);
      if (stage >= 2) B(0, -31, 9.5);
      if (stage >= 3) B(0, -44, 6.5);
      if (stage >= 5) { twig(-8, -33, -23, -41); twig(8, -33, 23, -40); }
      if (stage >= 4) { g.fillStyle = '#1b2238'; g.fillRect(-7.5, -50.5, 15, 2.2); g.fillRect(-5, -60, 10, 10); g.fillStyle = '#c8362e'; g.fillRect(-5, -53.4, 10, 2.4); }
      if (stage >= 6) { face(0, -44, 1, 1); dot(1.5, -34, 1); dot(1.8, -29, 1); line('#c8362e', 2.6, [-6, -38.5, 6, -38.5]); line('#c8362e', 2.4, [4, -38, 7, -30]); }
    } else if (type === 1) {  // carries its own head under its arm
      man(0, 1, 1, {nohead: 1, arms: 4}); g.fillStyle = 'rgba(105,135,188,.5)'; g.beginPath(); g.ellipse(0, -36.5, 4, 1.4, 0, 0, 6.3); g.fill();
      twig(-7, -31, -22, -42); B(15, -22, 6.5); face(15, -22, 1, 1, 'o'); line('#6b4a2b', 1.8, [6, -31, 20, -30, 23, -21, 19, -15]);
    } else if (type === 2) {  // two heads, one opinion each
      B(0, -12, 13); B(0, -31, 9.5); B(-8.5, -45, 6.2); B(8.5, -45, 6.2); dot(2, -33, 1); dot(2, -28, 1);
      face(-9.5, -45, 0.85, 1, 'grr'); face(9.5, -45, 0.85, -1, 'grr');
      twig(-8, -32, -25, -48); twig(8, -32, 25, -48);
    } else if (type === 3) {  // a very big one, and the small ones who have seen it
      man(-44, 1.5, 1, {mood: 'grr', arms: 1});
      tilt(10, 0.22, () => man(0, 0.5, 1, {mood: 'o', arms: 1})); tilt(36, 0.3, () => man(0, 0.46, 1, {mood: 'o', arms: 1})); tilt(62, 0.42, () => man(0, 0.42, 1, {mood: 'o', arms: 1}));
    } else if (type === 4) {  // nearly gone, one arm still reaching up
      B(-9, -9, 7.5); face(-9, -9, 1, 1, 'x'); twig(8, -5, 15, -42); line('#6b4a2b', 1.7, [-34, -4, -18, -7]);
      g.fillStyle = 'rgba(247,251,255,.98)'; g.strokeStyle = 'rgba(105,135,188,.85)'; g.lineWidth = 1.1; g.beginPath(); g.ellipse(0, -2, 38, 6, 0, 0, 6.3); g.fill(); g.stroke();
      tilt(24, 1.2, () => { g.fillStyle = '#1b2238'; g.fillRect(-7, -8, 14, 2); g.fillRect(-4.6, -17, 9.2, 9); }); dot(-22, -3, 1); dot(4, -2, 1); dot(13, -4, 1);
    } else if (type === 5) {  // something is circling
      man(0, 1, 1, {mood: 'o', arms: 1});
      for (const q of [[-50, 1, 20], [46, -1, 15]]) {
        const x = q[0], d = q[1], h = q[2];
        g.fillStyle = 'rgba(247,251,255,.98)'; g.strokeStyle = 'rgba(105,135,188,.85)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(x - d * 10, 0); g.quadraticCurveTo(x - d * 2, -h * 0.6, x + d * 5, -h); g.quadraticCurveTo(x + d * 4, -h * 0.4, x + d * 9, 0); g.closePath(); g.fill(); g.stroke();
        line('rgba(105,135,188,.85)', 1, [x - 20, -1.5, x - 13, -3, x - 6, -1.5]); line('rgba(105,135,188,.85)', 1, [x + 8, -1.5, x + 15, -3, x + 22, -1.5]);
      }
    } else if (type === 6) {  // an accident at work, and a witness
      man(-28, 1, -1, {mood: 'x', arms: 3}); line('#1b2238', 3.6, [-52, -44, -8, -16]); line('#c99a5e', 1.8, [-52, -44, -8, -16]); line('#1b2238', 8, [-9, -17, -3, -13]); line('#b9c6d6', 6, [-9, -17, -3, -13]);
      tilt(34, 0.16, () => man(0, 0.95, -1, {mood: 'o', arms: 2}));
    } else if (type === 7) {  // bowling with its own head
      tilt(-54, 0.3, () => { man(0, 1, 1, {nohead: 1, arms: 4}); twig(7, -30, 22, -14); twig(-7, -31, -20, -40); });
      line('rgba(105,135,188,.85)', 1, [-30, -12, -20, -12]); line('rgba(105,135,188,.85)', 1, [-32, -6, -22, -6]);
      g.save(); g.translate(-8, -7); g.rotate(-0.8); B(0, 0, 6.5); face(0, 0, 1, 1, 'o'); g.restore();
      man(46, 0.36, -1, {arms: 4}); man(58, 0.36, -1, {arms: 4}); tilt(72, 0.6, () => man(0, 0.36, -1, {arms: 4}));
    } else {  // a monster of many snowballs
      for (const q of [[-14, -9, 10], [8, -10, 11], [23, -8, 8], [-4, -25, 11], [15, -27, 9], [-19, -26, 8], [3, -41, 9], [-12, -42, 6], [17, -43, 6.5], [5, -55, 6]]) B(q[0], q[1], q[2]);
      twig(-23, -30, -42, -50); twig(25, -30, 44, -52); twig(-22, -13, -44, -12); twig(28, -11, 48, -17);
      for (const q of [[-8, -28], [2, -30], [14, -30], [-1, -44], [8, -43], [5, -57]]) dot(q[0], q[1], 1.5);
      line('#141a2c', 1.5, [-12, -17, -7, -13, -2, -17, 3, -13, 8, -17, 13, -13, 18, -17]); nose(3, -36, 1, 8);
    }
    return c;
  }
  /** The dents the snow angels leave: paint() draws them on the pile, squashed, as seen from the side. */
  function dents(g, P) {
    for (let i = P.dents.length - 1; i >= 0; i--) {
      const d = P.dents[i], h = colH(P, d.x); if (h < 3 || d.a < 0.06) { P.dents.splice(i, 1); continue; }
      const s = U.clamp(h / 12, 0.6, 1.3), y = P.y - h * 0.42;
      g.fillStyle = 'rgba(112,142,196,' + (0.75 * d.a).toFixed(2) + ')'; g.beginPath();
      g.ellipse(d.x - 8.5 * s, y - 1 * s, 8.5 * s, 3 * s, 0.22, 0, 6.3); g.ellipse(d.x + 8.5 * s, y - 1 * s, 8.5 * s, 3 * s, -0.22, 0, 6.3);
      g.moveTo(d.x, y - 1.5 * s); g.lineTo(d.x + 7 * s, y + 5.6 * s); g.lineTo(d.x - 7 * s, y + 5.6 * s); g.closePath();
      g.moveTo(d.x + 2.5 * s, y - 4.6 * s); g.arc(d.x, y - 4.6 * s, 2.5 * s, 0, 6.3); g.fill();
    }
  }

  // ---------- drawing: figures that are not plain crew ----------
  const RED = '#d5302b';
  /** One figure drawn by itself: the ones in costume, and the ones clipped behind a tile. */
  function inkOne(g, f, col, w, head) {
    const pa = new Path2D(), hd = new Path2D(); limbs(pa, hd, f);
    g.lineCap = g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = w + 2.7; g.stroke(pa); g.lineWidth = 2.8; g.stroke(hd);
    g.strokeStyle = col; g.lineWidth = w; g.stroke(pa); g.fillStyle = head; g.fill(hd);
  }
  function tools(g, shafts, blades) {
    g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 3.6; g.stroke(shafts); g.strokeStyle = '#c99a5e'; g.lineWidth = 1.6; g.stroke(shafts);
    g.lineCap = 'butt'; g.strokeStyle = INK; g.lineWidth = 8; g.stroke(blades); g.strokeStyle = '#b9c6d6'; g.lineWidth = 6; g.stroke(blades);
  }
  /** What is on a head: a woolly hat (one colour each, so the crew can be told apart), the foreman's hard hat,
   *  the bunny's ears, Santa's cap and beard, the trapper hat. */
  function hat(g, f) {
    const J = f.J, s = f.s, x = J[4], y = J[5], d = f.dir, R = HR * s, a = Math.atan2(y - J[3], x - J[2]);
    if (f.look === 'boss') {
      g.fillStyle = '#ffc61a'; g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y - 1.2, R + 1.8, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
      g.lineCap = 'round'; g.strokeStyle = '#ffc61a'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x - d * (R + 1), y - 1.2); g.lineTo(x + d * (R + 6), y - 1.2); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, y - R - 3); g.lineTo(x, y - 2.5); g.stroke();
      // the clipboard, in the back hand
      g.save(); g.translate(J[20], J[21]); g.rotate(d * 0.25); g.fillStyle = '#f4f1e6'; g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.rect(-3.5, -9, 7, 10); g.fill(); g.stroke(); g.fillStyle = '#8b6a44'; g.fillRect(-2, -10, 4, 2); g.restore();
    } else if (f.look === 'bunny') {
      g.fillStyle = f.suit; g.strokeStyle = INK; g.lineWidth = 1.3;
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);  // the ears go with the head: lying down, they lie down too
      g.beginPath(); g.ellipse(-d * 2.2, -R - 7.5, 2.4, 8, -d * 0.12, 0, 6.3); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(d * 3.5, -R - 4.5, 2.4, 7.5, d * 1.05, 0, 6.3); g.fill(); g.stroke();  // one ear will not stay up
      g.restore();
      g.fillStyle = BONE; g.beginPath(); g.arc(x + d * 1.2, y + 0.6, R * 0.62, 0, 6.3); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(J[0] - d * 3.5, J[1] - 2, 2.8, 0, 6.3); g.fill(); g.stroke();
      g.fillStyle = f.suit; g.beginPath(); g.ellipse(J[8] + d * 1.5, J[9] - 0.5, 4, 2.2, 0, 0, 6.3); g.ellipse(J[12] + d * 1.5, J[13] - 0.5, 4, 2.2, 0, 0, 6.3); g.fill();
    } else if (f.look === 'santa') {
      // a red coat over the line body: rounder than the body, belted, white at the hem
      g.save(); g.translate((J[0] + J[2]) / 2, (J[1] + J[3]) / 2); g.rotate(Math.atan2(J[2] - J[0], J[1] - J[3]));
      g.fillStyle = RED; g.strokeStyle = INK; g.lineWidth = 1.3; g.beginPath(); g.ellipse(0, 1, 6.8 * s, TOR * s * 0.5 + 4, 0, 0, 6.3); g.fill(); g.stroke();
      g.lineCap = 'butt'; g.strokeStyle = '#fff'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-5.2 * s, TOR * s * 0.5 + 2.4); g.lineTo(5.2 * s, TOR * s * 0.5 + 2.4); g.stroke();
      g.strokeStyle = '#1b2238'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-6.7 * s, 2.2); g.lineTo(6.7 * s, 2.2); g.stroke(); g.fillStyle = '#ffd94a'; g.fillRect(-1.7, 0.6, 3.4, 3.2);
      g.restore();
      g.fillStyle = '#fff'; g.strokeStyle = 'rgba(105,135,188,.8)'; g.lineWidth = 1; g.beginPath(); g.arc(x + d * 1.4, y + 2.6, R + 0.4, -0.2, Math.PI + 0.2); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = RED; g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.moveTo(x + d * (R + 0.6), y - 1.6); g.quadraticCurveTo(x + d * 2, y - R - 7, x - d * 4, y - R - 3); g.lineTo(x - d * (R + 6.5), y + 0.5); g.lineTo(x - d * (R + 0.6), y - 1.6); g.closePath(); g.fill(); g.stroke();
      g.lineCap = 'round'; g.strokeStyle = '#fff'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(x - d * (R + 0.6), y - 1.8); g.lineTo(x + d * (R + 0.8), y - 1.8); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x - d * (R + 7), y + 1.8, 2.5, 0, 6.3); g.fill();
    } else if (f.look === 'robe') {
      // the bathrobe: over the body, short, belted; then the hat with its ear flaps
      g.fillStyle = '#a9c6ea'; g.strokeStyle = INK; g.lineWidth = 1.3; g.beginPath(); g.moveTo(J[2] - 5, J[3] - 1.5); g.lineTo(J[2] + 5, J[3] - 1.5); g.lineTo(J[0] + 8, J[1] + 7); g.lineTo(J[0] - 8, J[1] + 7); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = '#4d6aa0'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(J[0] - 6.4, J[1] - 2.5); g.lineTo(J[0] + 6.4, J[1] - 2.5); g.moveTo(J[2], J[3]); g.lineTo(J[0] + d * 1.5, J[1] - 2.5); g.stroke();
      g.fillStyle = '#5a3d28'; g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.arc(x, y - 0.8, R + 1.3, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.rect(x - R - 1.8, y - 1.2, 3.4, 7.4); g.rect(x + R - 1.6, y - 1.2, 3.4, 7.4); g.fill(); g.stroke();
      g.fillStyle = '#d9c9a3'; g.fillRect(x - d * 1.2 - 3, y - R - 0.6, 6, 2.2);
    } else {
      g.fillStyle = f.hat; g.beginPath();
      if (f.ov && f.ov.hat) g.arc(J[20], J[21] + 1, R + 0.9, 0, Math.PI);
      else if (f.fear && !f.fear.cling && !f.fear.run) { f.fear.hx = x; f.fear.hy = y; g.arc(x, y, R + 0.9, a - 1.45, a + 1.45); }
      else if (f.fear && !f.fear.cling) { const fe = f.fear; fe.hx += (x - fe.hx) * 0.3; fe.hy += (y - 10 - fe.hy) * 0.3; g.arc(fe.hx, fe.hy, R + 0.9, Math.PI, 0); }  // the hat comes off and follows a moment later
      else { const k = f.row && f.row.stage < 3 ? 0.6 : 0; g.arc(x, y, R + 0.9, a - 1.45 + k, a + 1.45 + k); }
      g.fill();
    }
  }
  /** Walk a loose figure (Santa, the man from the motorhome) toward x. True when it is there. */
  function stepTo(f, x, v, dt) {
    const d = x - f.x; if (Math.abs(d) < 2) return true;
    f.dir = d > 0 ? 1 : -1; f.x += f.dir * Math.min(Math.abs(d), v * dt); play(f, SA.walk); tick(f, dt); return false;
  }
  const ease = (f, q, k) => { f.an = null; for (let j = 0; j < 10; j++) f.p[j] += (q[j] - f.p[j]) * (k || 0.4); };
  /** The stare and the fall, for a loose figure. True while one of them has it. */
  function loose(st, f, dt, S) {
    const rq = st.req; if (rq && S.rq !== rq.id) { S.rq = rq.id; awe(f, rq.x, rq.y, 2, false, false); }
    if (f.ov) { ovStep(f, dt, st.crew); return true; }
    return false;
  }

  // ---------- D1: Santa ----------
  const S_FLOAT = pose(0, 6, 8, -4, 12, 96, 10, -96, -10, -6), S_REINS = pose(-14, 82, 30, 76, 40, 58, 30, 50, 36, -4);
  const xmas = ctx => { const d = ctx.env && ctx.env.date; return !!d && typeof d.getMonth === 'function' && d.getMonth() === 11 && (d.getDate() === 24 || d.getDate() === 25); };
  function santaStart(st, ctx) {
    const mode = ctx.opts.santa || 'xmas';
    if (st.santa || (st.force !== 'santa' && (mode === 'off' || (mode !== 'any' && !xmas(ctx))))) return;
    // he lands on an upper row of tiles, but never the top one
    let top = 1e9, P = null, bs = -1e9; for (const Q of st.plats) if (Q.i && !Q.away && Q.y < top) top = Q.y;
    for (const Q of st.plats) { if (!Q.i || Q.away || Q.y < top + 30 || Q.y < 80) continue; const sc = Math.min(200, Q.x2 - Q.x1) - Q.y * 0.5 + rnd(0, 50); if (sc > bs) { bs = sc; P = Q; } }
    if (!P) return;
    const f = figure(0, 0, 1.08); Object.assign(f, {look: 'santa', ov: null, pl: P.i, gone: false});
    if (!st.glow) {  // the lead reindeer's nose: one soft red dot, made once and stamped
      const c = st.glow = document.createElement('canvas'); c.width = c.height = 32; const q = c.getContext('2d'), gr = q.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,90,60,.95)'); gr.addColorStop(0.35, 'rgba(255,40,30,.5)'); gr.addColorStop(1, 'rgba(255,30,20,0)'); q.fillStyle = gr; q.fillRect(0, 0, 32, 32);
    }
    const S = st.santa = {ph: 0, t: 0, f, P, x: -180, y: 40, x0: -180, y0: 30 + rnd(0, 16), lx: U.clamp((P.x1 + P.x2) / 2 - 67, 30, st.w - 170), ang: 0, todo: [], cur: null, wait: 0, tp: null, sp: [], si: 0, bag: 0, give: 0, seat: 1, snort: 0, hd: new Float32Array(6), rq: st.req ? st.req.id : 0};
    for (let i = 0; i < 48; i++) S.sp.push({x: 0, y: 0, l: 0});
    actStart(st, 'santa', {grp: 1, max: 280, step: santaStep, idle: idleRest, fin: () => { st.santa = null; }});
    return true;
  }
  const twinkle = (S, x, y) => { const p = S.sp[S.si = (S.si + 1) % S.sp.length]; p.x = x; p.y = y; p.l = 1.5; };
  const canTake = (st, c) => !c.gone && !c.fear && !c.row && !c.ov && !c.bury && !c.sled && grounded(st, c);
  function santaStep(A, dt, st) {
    const S = st.santa, f = S.f, P = S.P, px = S.x, py = S.y; S.t += dt;
    if (S.ph === 0) {  // across the top of the screen, then down onto the tile
      const u = Math.min(1, S.t / 6.5), e = 1 - (1 - u) * (1 - u), v = U.clamp((u - 0.4) / 0.6, 0, 1);
      S.x = S.x0 + (S.lx - S.x0) * e; S.y = S.y0 + (P.y - S.y0) * v * v * (3 - 2 * v) + Math.sin(S.t * 3) * 3 * (1 - v);
      S.ang = u < 1 ? Math.atan2(S.y - py, Math.max(0.5, S.x - px)) * 0.8 : 0; twinkle(S, S.x - 28 + rnd(-4, 4), S.y - 6 + rnd(-5, 5));
      if (u >= 1) { S.ph = 1; S.t = 0; }
    } else if (S.ph === 1) {
      if (S.t > 0.9) { S.ph = 2; S.seat = 0; f.x = U.clamp(S.x - 34, P.x1 + 3, P.x2 - 3); f.y = P.y; f.pl = P.i; f.dir = -1; S.todo = st.crew.filter(c => !c.gone && !c.guest); }
    } else if (S.ph === 2 || S.ph === 3) {
      if (loose(st, f, dt, S)) return;
      const tp = S.tp;
      if (tp) {  // by magic: straight up or down, sparkling all the way
        tp.t += dt; const u = Math.min(1, tp.t / tp.dur), e = u * u * (3 - 2 * u); f.x = tp.x0 + (tp.x1 - tp.x0) * e; f.y = tp.y0 + (tp.y1 - tp.y0) * e; ease(f, S_FLOAT);
        twinkle(S, f.x + rnd(-9, 9), f.y - rnd(0, 44)); twinkle(S, f.x + rnd(-9, 9), f.y - rnd(0, 44));
        if (u >= 1) { S.tp = null; f.pl = tp.pl; }
        return;
      }
      const Q = st.plats[f.pl], warp = (T, x) => {
        // along this tile to a spot straight under or over the other one, then off
        const xw = U.clamp(U.clamp(x, T.x1 + 4, T.x2 - 4), Q.x1 + 4, Q.x2 - 4);
        if (Q.away || stepTo(f, xw, 66, dt)) { S.tp = {x0: f.x, y0: f.y, x1: U.clamp(f.x, T.x1 + 4, T.x2 - 4), y1: T.y, pl: T.i, t: 0, dur: Math.max(0.55, Math.abs(T.y - f.y) / 230)}; bump('warps'); }
      };
      // to another tile: straight up or down to its row first (onto whatever tile of that row is over or under him),
      // then along the row, floating over the gaps between neighbours. True once he stands on it.
      const toward = (T, x) => {
        if (T === Q) return true;
        if (Math.abs(T.y - Q.y) >= 6) { let R = T, bd = 1e9; for (const o of st.plats) if (!o.away && Math.abs(o.y - T.y) < 6) { const dd = Math.max(0, o.x1 - f.x, f.x - o.x2); if (dd < bd) { bd = dd; R = o; } } warp(R, f.x); return false; }
        const d = T.x1 > Q.x1 ? 1 : -1; let N = null;
        for (const o of st.plats) if (o !== Q && !o.away && Math.abs(o.y - Q.y) < 6 && (d > 0 ? o.x1 > Q.x1 : o.x1 < Q.x1) && (!N || Math.abs(o.x1 - Q.x1) < Math.abs(N.x1 - Q.x1))) N = o;
        if (!N || (d > 0 ? N.x1 - Q.x2 : Q.x1 - N.x2) > 70) { warp(T, x); return false; }
        if (stepTo(f, d > 0 ? N.x1 + 5 : N.x2 - 5, 66, dt)) f.pl = N.i; else if (f.x > Q.x2 || f.x < Q.x1) twinkle(S, f.x, f.y - rnd(0, 6));
        return false;
      };
      if (S.ph === 3 && P.away) { if (Math.abs(f.y - S.y) < 4 && Math.abs(f.x - S.x + 20) < 6) { S.ph = 4; S.t = 0; S.seat = 1; } else S.tp = {x0: f.x, y0: f.y, x1: S.x - 20, y1: S.y, pl: f.pl, t: 0, dur: 1}; return; }
      if (Q.away) { warp(below(st, f.x, f.y, Q), f.x); return; }  // the tile under him was taken
      if (S.ph === 3) {  // back to the sleigh
        if (toward(P, S.x - 20) && stepTo(f, U.clamp(S.x - 20, P.x1 + 2, P.x2 - 2), 66, dt)) { S.ph = 4; S.t = 0; S.seat = 1; }
        return;
      }
      let c = S.cur; if (c && S.todo.indexOf(c) < 0) c = S.cur = null;
      if (!c) {
        S.todo = S.todo.filter(o => !o.gone);
        if (!S.todo.length || A.t > 200) { S.ph = 3; return; }
        c = S.cur = nearTo(S.todo.filter(o => canTake(st, o)), f.x, f.y) ; S.wait = 0; S.give = 0;
        if (!c) { ease(f, S_STAND); return; }
      }
      if ((S.wait += dt) > 15 && !S.give) { S.todo.push(S.todo.splice(S.todo.indexOf(c), 1)[0]); S.cur = null; return; }  // not now: someone else first
      const T = st.plats[c.pl];
      if (T !== Q) { if (canTake(st, c)) toward(T, c.x); else ease(f, S_STAND); return; }
      const d = c.x >= f.x ? 1 : -1, tx = U.clamp(c.x - d * 19, Q.x1 + 2, Q.x2 - 2);
      if (!S.give && Math.abs(tx - f.x) > 2.5) { stepTo(f, tx, 66, dt); if (Math.abs(tx - f.x) < 80 && canTake(st, c) && !c.re) { react(c, SB.look, 2.5); c.dir = -d; } return; }
      if (!canTake(st, c)) { ease(f, S_STAND); S.give = 0; return; }
      f.dir = d; const was = S.give; S.give += dt;
      if (S.give < 0.8) ease(f, SB.bag.k[0][1]); else ease(f, SB.give.k[0][1]);
      if (was < 0.8 && S.give >= 0.8) { react(c, SB.take, 1.6); c.dir = -d; bump('gives'); }
      if (S.give > 1.7) { c.gift = st.clock; S.todo.splice(S.todo.indexOf(c), 1); S.cur = null; S.give = 0; bump('gifts'); }
    } else {  // a moment to settle in, and away
      const u = Math.max(0, (S.t - 0.9) / 5.5);
      if (u > 0) { S.x = S.lx + (st.w + 240 - S.lx) * u * u; S.y = P.y - 330 * u * u * (3 - 2 * Math.min(1, u)) * 0.6 - 60 * u; S.ang = Math.atan2(S.y - py, Math.max(0.5, S.x - px)) * 0.8; twinkle(S, S.x - 28 + rnd(-4, 4), S.y - 6 + rnd(-5, 5)); }
      if (u >= 1) return true;
    }
  }
  /** Santa's sack: very big, red, with a white fur rim round its mouth. */
  function sack(g, x, y, s, a) {
    g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = '#c4261f'; g.strokeStyle = INK; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-4 * s, -13 * s); g.bezierCurveTo(-17 * s, -6 * s, -15 * s, 13 * s, 0, 13 * s); g.bezierCurveTo(15 * s, 13 * s, 17 * s, -6 * s, 4 * s, -13 * s); g.closePath(); g.fill(); g.stroke();
    // its mouth: the dark opening, and one band of white fur round it with a scalloped edge
    g.fillStyle = '#6e1512'; g.beginPath(); g.ellipse(0, -16.5 * s, 6.5 * s, 2.2 * s, 0, 0, 6.3); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.strokeStyle = 'rgba(150,175,218,.95)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-8.8 * s, -16.4 * s);
    for (let i = 0; i < 4; i++) g.arc((-6.6 + i * 4.4) * s, -16.4 * s, 2.2 * s, Math.PI, 0);
    g.lineTo(8.8 * s, -11.6 * s); for (let i = 3; i >= 0; i--) g.arc((-6.6 + i * 4.4) * s, -11.6 * s, 2.2 * s, 0, Math.PI);
    g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  function santaDraw(g, st, dt, sc) {
    const S = st.santa, f = S.f, c = st.clock, fly = S.ph === 0 || (S.ph === 4 && S.t > 0.9), P = S.P;
    // a goose near the team: the reindeer lower their heads at it and snort
    let gs = false; if (sc && !fly) for (const a of sc.actors) if (a.kind === 'goose' && Math.abs(a.x - S.x - 80) < 280 && Math.abs(a.y - S.y) < 200) gs = true;
    if (gs && (S.snort -= dt) < 0) { S.snort = 0.9; puff(st, S.x + S.hd[4] + 9, S.y + S.hd[5] + 3, 3); bump('snorts'); }
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = '#ffe9a0'; g.lineWidth = 1.4; g.beginPath();
    for (const p of S.sp) if (p.l > 0) { p.l -= dt; const r = (0.8 + 3.4 * Math.abs(Math.sin(p.l * 8 + p.x))) * Math.min(1, p.l * 1.6); g.moveTo(p.x - r, p.y); g.lineTo(p.x + r, p.y); g.moveTo(p.x, p.y - r); g.lineTo(p.x, p.y + r); }
    g.stroke();
    g.save(); g.translate(S.x, S.y + (!fly && P.away ? Math.sin(c * 2) * 2 - 3 : 0)); g.rotate(S.ang);
    g.strokeStyle = '#6b4a2b'; g.lineWidth = 1; g.beginPath(); g.moveTo(24, -17); g.lineTo(140, -22); g.stroke();  // the traces
    // three reindeer in one path: flying they gallop, each a little out of step; parked they stamp, nod and shake
    g.beginPath(); const hd = S.hd;
    for (let i = 0; i < 3; i++) {
      const x = 54 + i * 38, ph = c * 11 + i * 1.3, u = (c * 0.29 + i * 0.37) % 1; let a1 = 0, a2 = 0, k1 = 0, k2 = 0, nk = 0.5, sh = 0;
      if (fly) { a1 = Math.sin(ph) * 0.95; a2 = Math.sin(ph + 2.5) * 0.95; k1 = 0.5 + 0.5 * Math.cos(ph); k2 = 0.5 + 0.5 * Math.cos(ph + 2.5); nk = 0.8; }
      else { if (u < 0.08) { a1 = Math.sin(u / 0.08 * Math.PI) * 0.75; k1 = a1 * 1.6; } if (u > 0.3 && u < 0.5) nk += Math.sin((u - 0.3) / 0.2 * Math.PI) * 1.1; if (u > 0.7 && u < 0.8) sh = Math.sin(c * 42) * 1.8; if (gs) nk = 1.5; }
      g.moveTo(x - 12, -23); g.lineTo(x + 12, -23); g.moveTo(x - 11, -20.5); g.lineTo(x + 11, -20.5); g.moveTo(x - 12, -23); g.lineTo(x - 16, -27);
      for (let j = 0; j < 4; j++) {
        const lx = j < 2 ? x + 10.5 : x - 10.5, a = (j < 2 ? a1 : a2) * (j & 1 ? -0.8 : 1) + (j & 1 ? 0.1 : -0.1), k = (j < 2 ? k1 : k2) * (j & 1 && !fly ? 0 : 1), mx = lx + Math.sin(a) * 10.5, my = -21 + Math.cos(a) * 10.5;
        g.moveTo(lx, -21); g.lineTo(mx, my); g.lineTo(mx + Math.sin(a - k) * 10.5, my + Math.cos(a - k) * 10.5);
      }
      const hx = x + 12 + Math.sin(nk) * 13 + sh, hy = -23 - Math.cos(nk) * 13; hd[i * 2] = hx; hd[i * 2 + 1] = hy;
      g.moveTo(x + 12, -22); g.lineTo(hx, hy); g.lineTo(hx + 8, hy + 3);
    }
    g.strokeStyle = INK; g.lineWidth = 5.4; g.stroke(); g.strokeStyle = '#a8703c'; g.lineWidth = 2.9; g.stroke();
    g.beginPath(); for (let i = 0; i < 6; i += 2) { const x = hd[i], y = hd[i + 1]; g.moveTo(x, y - 1); g.lineTo(x - 4, y - 12); g.moveTo(x - 2, y - 6.5); g.lineTo(x + 3, y - 12); g.moveTo(x - 3.2, y - 9.5); g.lineTo(x - 8, y - 12.5); }
    g.strokeStyle = INK; g.lineWidth = 3; g.stroke(); g.strokeStyle = '#ecdcb4'; g.lineWidth = 1.4; g.stroke();
    // the first one's red nose, glowing
    const nx = hd[4] + 8.6, ny = hd[5] + 3.2, r = 11 + 4 * Math.sin(c * 5);
    g.globalCompositeOperation = 'lighter'; g.drawImage(st.glow, nx - r, ny - r, r * 2, r * 2); g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#ff3b2f'; g.beginPath(); g.arc(nx, ny, 2.6, 0, 6.3); g.fill();
    if (S.seat) { sack(g, -17, -27, 0.95, -0.25); f.x = -1; f.y = -8; f.dir = 1; f.lift = 0; ease(f, S_REINS, 1); solve(f); inkOne(g, f, RED, 2.8, BONE); hat(g, f); }
    // the sleigh: a high curved back, a front that curls over, and runners
    g.fillStyle = '#b3261e'; g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-25, -29); g.quadraticCurveTo(-29, -8, -17, -8); g.lineTo(13, -8); g.quadraticCurveTo(26, -9, 27, -25); g.quadraticCurveTo(27, -31, 21, -29); g.quadraticCurveTo(20, -17, 9, -17); g.lineTo(-13, -17); g.quadraticCurveTo(-18, -18, -20, -29); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#f2c94c'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-22, -13); g.lineTo(18, -13); g.stroke();
    g.beginPath(); g.moveTo(-26, -0.5); g.lineTo(17, -0.5); g.quadraticCurveTo(30, -0.5, 30, -10); g.quadraticCurveTo(30, -14, 25.5, -12.5); g.moveTo(-14, -0.5); g.lineTo(-14, -8); g.moveTo(9, -0.5); g.lineTo(9, -8);
    g.strokeStyle = INK; g.lineWidth = 3.6; g.stroke(); g.strokeStyle = '#dfe4ee'; g.lineWidth = 1.6; g.stroke();
    g.restore();
    if (!S.seat) {
      const d = f.dir, down = S.give > 0 ? 1 : 0; S.bag += (down - S.bag) * Math.min(1, dt * 8);
      solve(f); const J = f.J, bx = J[2] - d * 14 + (f.x - d * 19 - (J[2] - d * 14)) * S.bag, by = J[3] + 4 + (f.y - 15 - (J[3] + 4)) * S.bag;
      sack(g, bx, by, 1.12, -d * 0.35 * (1 - S.bag));
      if (!f.ov && !S.tp) reach(f, 1, bx + d * 2, by - 15);  // one hand on its mouth, always; into it for each present
      inkOne(g, f, RED, 2.8, BONE); hat(g, f); dots(st.wp, f); eye(st.ep, f);
      if (S.give >= 0.8) present(g, J[16] + d * 2, J[17] - 2, 0);
    }
  }
  function present(g, x, y, k) {
    g.fillStyle = k & 1 ? '#3d9a4d' : '#d8362e'; g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.rect(x - 4, y - 3.5, 8, 7); g.fill(); g.stroke();
    g.fillStyle = '#ffd94a'; g.fillRect(x - 0.9, y - 3.5, 1.8, 7); g.fillRect(x - 4, y - 0.9, 8, 1.8);
  }

  // ---------- D3: the old motorhome ----------
  /** A boxy motorhome of the 1970s, well past its best, drawn once. Ground at y = 92, front to the right. */
  function rvSprite() {
    const c = document.createElement('canvas'); c.width = 212; c.height = 96; const g = c.getContext('2d'), DK = '#1b2238'; g.lineJoin = g.lineCap = 'round';
    const box = (x, y, w, h, col, lw) => { g.fillStyle = col; g.beginPath(); g.rect(x, y, w, h); g.fill(); if (lw) { g.strokeStyle = DK; g.lineWidth = lw; g.stroke(); } };
    // the ladder up the back and the rack on the roof
    g.strokeStyle = '#8b94a6'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(5, 18); g.lineTo(5, 70); g.moveTo(10, 16); g.lineTo(10, 70); for (let y = 24; y < 70; y += 8) { g.moveTo(5, y); g.lineTo(10, y); }
    g.moveTo(12, 15); g.lineTo(72, 14); for (let x = 14; x < 74; x += 14) { g.moveTo(x, 15); g.lineTo(x, 21); } g.stroke();
    box(40, 9, 26, 6, '#7c6a4a', 1); box(96, 12, 30, 9, '#cfd4dc', 1.4); g.strokeStyle = DK; g.lineWidth = 1; g.beginPath(); for (let x = 101; x < 124; x += 5) { g.moveTo(x, 14); g.lineTo(x, 19); } g.stroke();
    g.save(); g.translate(156, 80); g.rotate(-0.022); g.translate(-156, -80);  // it sags at the back
    const body = () => { g.beginPath(); g.moveTo(12, 25); g.quadraticCurveTo(12, 21, 16, 21); g.lineTo(172, 21); g.quadraticCurveTo(178, 21, 181, 26); g.lineTo(198, 53); g.quadraticCurveTo(200, 56, 200, 60); g.lineTo(200, 74); g.lineTo(12, 74); g.closePath(); };
    body(); g.fillStyle = '#e9e1c6'; g.fill();
    g.save(); body(); g.clip();
    g.fillStyle = '#c0672f'; g.fillRect(10, 47, 195, 10); g.fillStyle = '#e0a53a'; g.fillRect(10, 59, 195, 2.4);                     // the wide stripe
    box(18, 57, 44, 18, '#8d9c8f', 1); g.fillStyle = '#7d8c80'; g.fillRect(18, 61, 44, 1.5);                                         // a panel off another one
    g.fillStyle = 'rgba(139,75,36,.9)';                                                                                                  // rust
    for (const q of [[38, 70, 9, 5], [70, 73, 12, 3.5], [108, 72, 10, 4], [170, 71, 8, 4.5], [64, 23, 13, 2.6], [15, 44, 4, 7], [140, 72, 5, 3]]) { g.beginPath(); g.ellipse(q[0], q[1], q[2], q[3], 0.2, 0, 6.3); g.fill(); }
    g.fillStyle = 'rgba(168,104,52,.7)'; for (const q of [[44, 66, 4, 2], [104, 68, 5, 2], [66, 26, 6, 1.6], [174, 67, 3, 2]]) { g.beginPath(); g.ellipse(q[0], q[1], q[2], q[3], 0, 0, 6.3); g.fill(); }
    g.restore();
    body(); g.strokeStyle = DK; g.lineWidth = 2; g.stroke();
    // windows: the big windscreen and cab window, the door, two small ones at the back with curtains
    g.fillStyle = '#a9cfe6'; g.strokeStyle = DK; g.lineWidth = 1.4; g.beginPath(); g.moveTo(150, 27); g.lineTo(176, 27); g.lineTo(190, 46); g.lineTo(150, 46); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#cfe7f4'; g.lineWidth = 3.2; g.beginPath(); g.moveTo(181, 27.5); g.lineTo(196.5, 52); g.stroke(); g.strokeStyle = DK; g.lineWidth = 1; g.beginPath(); g.moveTo(183.6, 27); g.lineTo(198.8, 51.5); g.stroke();
    g.strokeStyle = DK; g.lineWidth = 1.2; g.beginPath(); g.rect(118, 27, 24, 46); g.stroke(); box(122, 30, 16, 15, '#a9cfe6', 1.2); g.strokeStyle = DK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(121, 52); g.lineTo(125, 52); g.stroke();
    for (const x of [24, 62]) { box(x, 28, 28, 15, '#a9cfe6', 1.3); g.fillStyle = '#e8b85a'; g.beginPath(); g.moveTo(x + 1, 29); g.lineTo(x + 9, 29); g.lineTo(x + 1, 42); g.moveTo(x + 27, 29); g.lineTo(x + 19, 29); g.lineTo(x + 27, 42); g.fill(); }
    // a dent by the door, a crack of light and shadow
    g.strokeStyle = 'rgba(27,34,56,.6)'; g.lineWidth = 1.3; g.beginPath(); g.arc(106, 36, 7, 0.4, 2.3); g.moveTo(98, 33); g.lineTo(103, 39); g.lineTo(100, 43); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1; g.beginPath(); g.arc(106, 37.5, 7, 0.5, 2.1); g.stroke();
    box(196, 69, 10, 6, '#aab2c0', 1.2); box(4, 69, 10, 6, '#aab2c0', 1.2); box(12, 56, 3, 7, '#d8362e', 0); g.fillStyle = '#fff3b0'; g.strokeStyle = DK; g.lineWidth = 1; g.beginPath(); g.arc(197.5, 62, 3.4, 0, 6.3); g.fill(); g.stroke();
    g.strokeStyle = DK; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 78); g.lineTo(1, 79); g.stroke();  // the exhaust
    g.restore();
    for (const q of [[48, 0], [158, 1]]) {
      g.fillStyle = '#2a3046'; g.beginPath(); g.arc(q[0], 78, 14, Math.PI, 0); g.fill();
      g.fillStyle = DK; g.beginPath(); g.arc(q[0], 81, 11, 0, 6.3); g.fill(); g.fillStyle = q[1] ? '#b9c2d0' : '#4a3a30'; g.beginPath(); g.arc(q[0], 81, q[1] ? 5 : 4, 0, 6.3); g.fill();
    }
    return c;
  }
  function camperStart(st, ctx) {
    if (st.rv || (st.force !== 'camper' && ((ctx.env.month !== 12 && ctx.opts.santa !== 'any') || st.sinceRv < 3 || Math.random() < 0.5))) return;
    const x = spotOn(st, 190); if (x == null) return;
    const f = figure(0, st.plats[0].y, 1); Object.assign(f, {look: 'robe', ov: null, gone: true, pl: 0});
    if (!st.rvCv) st.rvCv = rvSprite();
    st.rv = {ph: 0, t: 0, x: -120, px: U.clamp(x, 330, st.w - 150), f, hose: 0, ex: 0, bub: -1, sm: [], si: 0, smT: 0, rq: st.req ? st.req.id : 0};
    for (let i = 0; i < 7; i++) st.rv.sm.push({x: 0, y: 0, l: 0});
    st.sinceRv = 0;
    actStart(st, 'camper', {grp: 1, max: 140, step: rvStep, idle: idleRest, fin: () => { st.rv = null; }});
    return true;
  }
  function rvStep(A, dt, st) {
    const S = st.rv, f = S.f, G = st.plats[0], port = S.px - 99, spot = port - 84, door = S.px + 24, go = n => { S.ph = n; S.t = 0; }; S.t += dt;
    const moving = S.ph === 0 || S.ph === 9;
    if ((S.smT -= dt) < 0 && (moving || S.ph === 1)) { S.smT = 0.2; const p = S.sm[S.si = (S.si + 1) % S.sm.length]; p.x = S.x - 106; p.y = G.y - 13; p.l = 1.3; }
    if (S.ph === 0) { S.x = Math.min(S.px, S.x + 85 * dt); if (S.x >= S.px) go(1); return; }
    if (S.ph === 9) { if (S.t > 0.8) S.x += Math.min(150, 40 + (S.t - 0.8) * 90) * dt; return S.x > st.w + 130; }
    if (S.ph === 1) { if (S.t > 1) { f.gone = false; f.x = door; f.y = G.y; f.dir = -1; go(2); } return; }
    if (loose(st, f, dt, S)) return;
    if (S.ph === 2) { if (stepTo(f, port + 12, 52, dt)) go(3); }
    else if (S.ph === 3) { ease(f, SB.shove.k[0][1]); f.dir = 1; if (S.t > 0.7) { S.hose = 1; go(4); bump('hose'); } }
    else if (S.ph === 4) { if (stepTo(f, spot + 12, 40, dt)) { go(5); bump('empties'); } }  // drags it over
    else if (S.ph === 5) { f.dir = -1; f.an = null; sample(SB.hose, st.clock, f.p); if (S.t > 3.4) { S.hose = 2; S.ex = f.x - 13; go(6); } }
    else if (S.ph === 6) {
      // turns to the house with a wave; whoever is near stops and stares, and the nearest holds its nose
      play(f, SB.hi); tick(f, dt); f.dir = 1; if (S.bub < 0) {
        S.bub = 0; let first = true; bump('stared');
        for (const c of st.crew.slice().sort((a, b) => Math.abs(a.x - f.x) + Math.abs(a.y - f.y) - Math.abs(b.x - f.x) - Math.abs(b.y - f.y))) {
          if (c.gone || c.fear || c.row || c.ov || Math.hypot(c.x - f.x, c.y - f.y) > 430 || !grounded(st, c)) continue;
          if (first && !c.re) { first = false; react(c, SB.nose, 3); c.dir = f.x >= c.x ? 1 : -1; bump('nose'); } else awe(c, f.x, f.y - 30, c.n || 1, false, c.tool === 1);
        }
      }
      S.bub += dt; if (S.t > 3.2) { S.bub = -2; S.hose = 1; go(7); }
    }
    else if (S.ph === 7) { if (S.t < 0.5) { ease(f, SB.shove.k[0][1]); f.dir = -1; } else if (stepTo(f, port + 12, 52, dt)) { S.hose = 0; go(8); } }
    else if (S.ph === 8) { if (stepTo(f, door, 52, dt)) { f.gone = true; go(9); } }
  }
  function bubble(g, x, y, d, T, w) {
    const s = Math.min(1, 0.4 + T * 6);
    g.save(); g.translate(U.clamp(x + d * 52, 76, w - 76), Math.max(30, y - 78)); g.rotate(-0.06 * d); g.scale(s, s);
    g.fillStyle = '#fff'; g.strokeStyle = '#1b2238'; g.lineWidth = 1.5; g.lineJoin = 'round';
    U.box(g, {x: -68, y: -20, w: 136, h: 40, r: 18}); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-d * 26, 18); g.lineTo(-d * 36, 34); g.lineTo(-d * 8, 19); g.fill(); g.stroke();
    g.fillRect(-d * 17 - 8.5, 16, 17, 3.2);  // the tail joins the bubble without a seam
    g.fillStyle = '#1b2238'; g.font = '800 19px "Arial Rounded MT Bold", "Avenir Next", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('#@$%’s full!', 0, 1);
    g.restore();
  }
  function rvDraw(g, st, dt) {
    const S = st.rv, f = S.f, G = st.plats[0], c = st.clock, moving = S.ph === 0 || (S.ph === 9 && S.t > 0.8), port = S.px - 99;
    g.fillStyle = 'rgba(150,152,165,.5)'; g.beginPath(); for (const p of S.sm) if (p.l > 0) { p.l -= dt; p.x -= 14 * dt; p.y -= 16 * dt; const r = 3 + (1.3 - p.l) * 5; g.moveTo(p.x + r, p.y); g.arc(p.x, p.y, r, 0, 6.3); } g.fill();
    g.drawImage(st.rvCv, Math.round(S.x - 106), Math.round(G.y - 90 + (moving ? Math.sin(c * 37) * 1.3 : S.ph === 1 || S.ph === 9 ? Math.sin(c * 55) * 0.6 : 0)));
    if (f.gone) return;
    solve(f); const J = f.J; let ex = S.ex, ey = G.y - 2;
    if (S.hose === 1) { reach(f, 0, f.x - 11, f.y - 16); reach(f, 1, f.x - 11, f.y - 16); ex = J[16]; ey = J[17]; if (S.ph === 5) { ex = f.x - 13; ey = f.y - 5; reach(f, 0, ex + 3, ey - 9); reach(f, 1, ex + 5, ey - 13); } }
    if (S.hose) {  // the fat hose, lying where it is dragged
      g.lineCap = g.lineJoin = 'round'; g.beginPath(); g.moveTo(port, G.y - 14); g.quadraticCurveTo(port - 9, G.y - 2, Math.min(port - 12, ex + 16), G.y - 2); if (S.hose === 1) g.quadraticCurveTo(ex + 8, G.y - 2, ex, ey); else g.lineTo(ex, ey);
      g.strokeStyle = INK; g.lineWidth = 6.6; g.stroke(); g.strokeStyle = '#6f7d5e'; g.lineWidth = 4; g.stroke();
      if (S.ph === 5) { g.fillStyle = 'rgba(176,160,120,.95)'; const u = (S.t * 1.6) % 1; g.beginPath(); g.arc(ex - 1, ey + 2 + u * 5, 1.5, 0, 6.3); g.fill(); }
    }
    inkOne(g, f, BONE, 2.5, BONE); hat(g, f); dots(st.wp, f); eye(st.ep, f);
    if (S.bub >= 0) bubble(g, f.x, f.y - 40, 1, S.bub, st.w);
  }

  const S_BRAWL = 0.5, S_REST = 0.22, S_BALL = 0.14;  // the chance a row becomes a fight; of a breather after digging; of a snowball instead

  HP.fx.add('snowcrew', {
    label: 'Snow crew',
    live: true, fps: 12,
    options: [{key: 'crew', label: 'Crew', type: 'range', min: 1, max: 6, step: 1, default: 3},
      {key: 'always', label: 'Whatever the weather', type: 'bool', default: false},
      {key: 'bump', label: 'Bump interval', type: 'range', min: 8, max: 300, step: 2, unit: 's', default: 24},
      {key: 'play', label: 'Play interval', type: 'range', min: 20, max: 600, step: 10, unit: 's', default: 60},
      {key: 'santa', label: 'Santa', type: 'select', choices: [['xmas', 'Christmas Eve and Day'], ['any', 'Any time'], ['off', 'Never']], default: 'xmas'}],
    create(ctx) {
      const r = ctx.rand, W = ctx.w, H = ctx.h, plats = ground(ctx);
      for (const P of plats) {
        P.cap = P.i ? Math.min(14, 0.16 * Math.min(P.rect.w, P.rect.h)) : 24;
        P.n = Math.max(3, Math.round((P.x2 - P.x1) / 15) + 1); P.dx = (P.x2 - P.x1) / (P.n - 1);
        P.cols = new Float32Array(P.n); P.links = []; P.ok = false; P.dirty = true; P.pend = 0; P.seen = 0; P.dents = []; P.hi = 0;
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
      for (const P of plats) P.away = false;
      reachable(plats);
      // a panel that wakes while it is snowing shows snow that has been falling for a while
      if (ctx.opts.always || /^snowy/.test(ctx.env.weather || '')) for (const P of plats) { const nz = U.noise(ctx.seed + P.i * 13); for (let i = 0; i < P.n; i++) P.cols[i] = P.cap * (0.3 + 0.55 * (nz(i * 0.37) * 0.5 + 0.5)); }
      const crew = [], n = U.clamp(Math.round(+ctx.opts.crew || 3), 1, 6);
      for (let i = 0; i < n + 2; i++) { const f = figure(0, plats[0].y, 0.9 + r() * 0.2); Object.assign(f, {gone: true, grp: null, hide: null, sh: 0, mug: 0, bury: 0, tong: null, shv: null, sled: 0, duck: 0, gift: 0, ready: 0, slot: 0, side: 0, cv: null, went: 0, tr: null, boss: false, guest: false, look: '', suit: '', noLad: false, noTool: false, q: [], act: null, re: null, job: null, jx: 0, pl: 0, tool: 0, load: 0, hat: HATS[i], n: i * 2 + 1, rq: 0, ov: null, fear: null, row: null, gd: null, cur: null, em: [], wpn: 0, tt: 0, x0: 0, y0: 0, fxi: 0, fetch: 0, lad: {on: false, k: 0, link: null, len: 130, d: 0, gx: 0, gy: 0, gyT: 0, gd: 1}, T: new Float32Array(4)}); crew.push(f); }
      // two who are not shovellers: the foreman (hard hat, clipboard), and now and then someone in a pink bunny suit
      const boss = crew[n], bunny = crew[n + 1]; Object.assign(boss, {boss: true, look: 'boss', noTool: true, s: 1.04}); Object.assign(bunny, {guest: true, look: 'bunny', suit: '#f7a8cb', noTool: true, noLad: true, s: 0.98});
      // where one can stand out of sight: on the platform just under a tile, behind that tile
      const covers = [], ice = [], tileOf = R => { for (const P of plats) if (P.rect === R) return P; return null; };
      for (const R of ctx.rects) {
        if (R.hidden || R.flat) continue; const RP = tileOf(R);
        for (const Q of plats) { const gap = Q.y - (R.y + R.h), xa = Math.max(Q.x1 + 2, R.x + 12), xb = Math.min(Q.x2 - 2, R.x + R.w - 12), l = R.x - 9, rr = R.x + R.w + 9; if (Q.rect === R || gap < 3 || gap > 34 || xb - xa < 24) continue; covers.push({Q, R, RP, xa, xb, l: l > Q.x1 + 2 ? l : null, r: rr < Q.x2 - 2 ? rr : null, off: false}); }
        // icicles: three to a tile, each with its own place and full length
        if (R.y + R.h < H - 10 && R.w > 50) for (let k = 0; k < 3; k++) { const max = 5 + r() * 7; ice.push({R, RP, x: R.x + R.w * (0.14 + 0.72 * (k + r() * 0.8) / 3), len: 0, max, off: false}); }
      }
      const wake = ctx.opts.always || /^snowy/.test(ctx.env.weather || ''); if (wake) for (const c of ice) c.len = c.max * (0.3 + 0.6 * r());
      const play = U.clamp(+ctx.opts.play || 60, 20, 600), force = ctx.opts.force || null;
      const flakes = []; for (let i = 0; i < 38; i++) flakes.push({x: r() * W, y: r() * H, v: 22 + r() * 30, w: 0.6 + r() * 1.2, ph: r() * 6.28, z: 1.4 + r() * 1.4});
      const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
      return {plats, crew, flakes, layer, lg: layer.getContext('2d'), bits: [], balls: [], req: null, quake: 0, row: null, bumpGap: (+ctx.opts.bump || 24), rowNext: (+ctx.opts.bump || 24) * 0.6, force, on: false,
        boss, bunny, covers, ice, iceP: null, iceDirty: true, iceF: [], stuck: [], iceN: 0, acts: [], men: [], ghosts: [], yeti: null, sinceYeti: 0, yetiN: 0, fort: null, fortP: null, shift: null, santa: null, rv: null, rvCv: null, glow: null, wp: null, ep: null,
        play, playNext: force ? 7 : play * 0.5, gagNext: force ? 7 : play * 0.25, tabN: 0, sinceRv: 0, work: true, fz: 0, snowing: false, rr: 0, clock: 0, look: 0, chk: 0, w: W, h: H};
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
      for (const f of st.crew) if (!f.gone && !(f.act && AIR[f.act.a])) topple(f, dir, !!f.act && f.act.a === 'climb');
      const S = st.santa, V = st.rv; if (S && !S.seat && !S.tp) topple(S.f, dir, false); if (V && !V.f.gone) topple(V.f, dir, false);
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
      let snowing = !!ctx.opts.always || /^snowy/.test(ctx.env.weather || ''); const W = st.w, H = st.h, plats = st.plats;
      if (snowing) st.on = true;
      if (st.force === 'shift' && st.clock > 14) { snowing = false; if (!st.fz) { st.fz = 1; for (const P of plats) { P.cols.fill(0); P.dirty = true; } } }  // (the test page: the snow stops and the work is done)
      st.snowing = snowing;
      if (!st.on) return;
      st.clock += dt;
      if ((st.chk -= dt) < 0) {
        st.chk = 0.2; let ch = false;
        for (const P of plats) if (P.i) { const a = awayEl(P); if (a !== P.away) { P.away = a; ch = true; if (a) tileGone(st, P); else P.dirty = true; } }
        if (ch) { reachable(plats); st.iceDirty = true; for (const c of st.covers) c.off = !!c.RP && c.RP.away; for (const c of st.ice) c.off = !!c.RP && c.RP.away; for (const f of st.crew) if (f.hide) for (const c of st.covers) if (c.R === f.hide && c.off) f.hide = null; }
      }
      // snow settles (or, once it has stopped, slowly goes): two platforms a frame, so no frame does them all
      for (let k = 0; k < 2; k++) {
        const P = plats[st.rr = (st.rr + 1) % plats.length], el = st.clock - P.seen; P.seen = st.clock;
        if (P.away) continue;
        const rate = snowing ? P.cap / 150 : -(P.ok ? 0.035 : 0.12);
        for (let i = 0; i < P.n; i++) P.cols[i] = U.clamp(P.cols[i] + rate * el * (0.4 + Math.random() * 1.2), 0, P.cols[i] > P.cap ? P.cols[i] : P.cap);
        P.pend += Math.abs(rate) * el; if (P.pend > 0.5) { P.pend = 0; P.dirty = true; }
        if (snowing) for (const d of P.dents) d.a -= el / 110;  // new snow fills an angel in
      }
      // the crew comes when there is work and goes when there is none
      if ((st.look -= dt) < 0) {
        st.look = 1.5; let work = false, most = 0;
        for (const P of plats) for (let i = 0; i < P.n; i++) { if (P.cols[i] > most) most = P.cols[i]; if (P.ok && P.cols[i] > P.cap * 0.3) work = true; }
        const out = st.crew.every(f => f.gone); st.work = work;
        // icicles grow while it snows; the ones knocked down melt where they stuck
        if (snowing) for (const c of st.ice) c.len = Math.min(c.max, c.len + 0.05 + Math.random() * 0.1);
        for (let i = st.stuck.length - 1; i >= 0; i--) if ((st.stuck[i].t -= 1.5) < 0) { st.stuck.splice(i, 1); st.iceDirty = true; }
        if (++st.iceN % 3 === 0) st.iceDirty = true;
        if (snowing && work) st.crew.forEach((f, i) => { if (f.gone && !f.guest) { f.gone = false; f.x = i % 2 ? W + 24 + (i >> 1) * 60 : -24 - (i >> 1) * 60; f.y = plats[0].y; f.pl = 0; f.q.length = 0; f.act = null; f.lad.on = false; f.lad.k = 0; } });
        else if (!snowing && out && most < 0.4 && !st.bits.length && !st.acts.length && !st.shift) { st.on = false; st.men.length = 0; st.fort = null; st.lg.clearRect(0, 0, W, H); return; }
      }
      if (st.req && (st.req.ttl -= dt) < 0) st.req = null;
      st.quake = Math.max(0, st.quake - dt * 0.8);
      for (let k = 0, n = 0; k < plats.length && n < 3; k++) if (plats[k].dirty) { paint(st, plats[k]); n++; }
      g.drawImage(st.layer, 0, 0);

      // icicles (one path, rebuilt only when one has changed), then the things that stand in the snow
      if (st.iceDirty) iceBuild(st);
      g.fillStyle = 'rgba(214,236,255,.88)'; g.fill(st.iceP); g.lineWidth = 0.8; g.strokeStyle = 'rgba(110,150,205,.75)'; g.stroke(st.iceP);
      const sc = ctx.scene || null;
      if (st.men.length) menStep(st, g, dt, sc);
      if (st.fort) fortStep(st, g, dt);
      if (st.shift) shiftStep(st, g, dt);
      playStep(st, dt, ctx);

      // one walks into another on the same tile top (or backs into one who is digging): a row
      const firm = f => !f.gone && !f.ov && !f.fear && !f.row && !f.re && !f.grp && !f.boss && !f.guest && f.act && (f.act.a === 'walk' || f.act.a === 'dig' || f.act.a === 'rest');
      if (!st.row && st.clock > st.rowNext) for (let i = 0; i < st.crew.length && !st.row; i++) for (let j = i + 1; j < st.crew.length; j++) {
        const a = st.crew[i], b = st.crew[j];
        if (a.pl === b.pl && Math.abs(a.x - b.x) < 15 && firm(a) && firm(b) && (a.act.a === 'walk' || b.act.a === 'walk') && (!a.lad.k || a.lad.on) && (!b.lad.k || b.lad.on)) { rowStart(st, a, b); break; }
      }
      if (st.row) rowStep(st, st.row, dt);
      const rails = new Path2D(), rungs = new Path2D(), pa = new Path2D(), hd = new Path2D(), shafts = new Path2D(), blades = new Path2D(), white = new Path2D(), eyes = new Path2D(), whl = new Path2D(), snow = new Path2D(), mugs = new Path2D();
      let stuckF = null; st.wp = white; st.ep = eyes;
      for (const f of st.crew) {
        if (f.gone) continue;
        // a finger came down: stop (once any hop has landed) and stare
        const rq = st.req, on = f.act && f.act.a;
        if (rq && f.rq !== rq.id && on !== 'hop' && on !== 'sled' && on !== 'ride') { f.rq = rq.id; if (!f.fear) awe(f, rq.x, rq.y, f.n + rq.id, on === 'climb', on === 'climb' || (f.tool === 1 && !f.row)); }
        const gz = goose(sc, f); if (!gz) f.gd = null;
        if (!f.fear && gz && !AIR[on] && scared(f, gz)) fearStart(st, f);
        const row = st.row;
        if (f.fear) fearStep(st, f, dt, gz);
        else if (f.ov) ovStep(f, dt, st.crew);
        else if (f.row) { /* stepped with its opponent, above */ }
        else if (row && row.stage === 3 && firm(f) && !(f.lad.k && !f.lad.on)) {  // a fight: down tools and watch; one of them cheers
          f.dir = row.a.x >= f.x ? 1 : -1; f.tool = f.n % 3 ? 2 : 0; play(f, f.n % 3 ? SA.lean : SA.wave); tick(f, dt);
        }
        else crewStep(st, f, dt);
        if (f.gone) continue;
        const hang = f.fear && f.fear.hang;
        if (sc) sc.next.push({kind: 'stick', role: 'crew', x: f.x, y: f.y, h: 40 * f.s, hid: !!hang});  // hid: out of a goose's sight
        solve(f);
        if (hang) { reach(f, 0, hang.gx, hang.gy); reach(f, 1, hang.gx, hang.gy); }
        const aa = f.act && f.act.a, C = st.plats[f.pl], J = f.J, s = f.s, T = f.T;
        if (!f.noLad) {
          // the ladder: leaning on its tile, under an arm, or swinging between the two
          const la = f.lad, L = la.link, k = la.on ? 1 : la.k, half = la.len / 2, cx = f.J[2], cy = f.J[3] + 7 * f.s;
          let x1 = cx - f.dir * half * 0.97, y1 = cy + half * 0.2, x2 = cx + f.dir * half * 0.97, y2 = cy - half * 0.2;
          // while its owner works, rests or plays, a carried ladder lies on the ground; it stays there until it is fetched
          const far = la.d > 0 && (aa === 'drop' || Math.abs(f.x - la.gx) > 30 || Math.abs(C.y - 2 - la.gyT) > 4);
          const busy = !la.on && !k && (f.re || f.row || f.fear || far || (aa && !MOVING[aa]) || (!f.fetch && (la.d > 0 || f.grp)));
          if (la.d > 0 && k > 0 && far) ghost(st, la);  // (whatever led here: it is not swung across from far away)
          if (busy && !la.d) { la.gx = C.x2 - C.x1 > la.len ? U.clamp(f.x, C.x1 + half - 6, C.x2 - half + 6) : (C.x1 + C.x2) / 2; la.gd = f.dir; la.gy = la.gyT = C.y - 2; }  // all of it on the tile, where there is room
          if (la.d) la.gy += U.clamp(la.gyT - la.gy, -500 * dt, 500 * dt);
          la.d = U.clamp((la.d || 0) + (busy ? 5 : -5) * dt, 0, 1);
          if (la.d) { const gy = la.gy; x1 += (la.gx - la.gd * half - x1) * la.d; x2 += (la.gx + la.gd * half - x2) * la.d; y1 += (gy - y1) * la.d; y2 += (gy - y2) * la.d; }
          if (k > 0) { const ex = (L.tx - L.fx) / L.len * 9, ey = (L.ty - L.fy) / L.len * 9; if (L.sd * f.dir > 0 === x1 < x2) { const a = x1, b = y1; x1 = x2; y1 = y2; x2 = a; y2 = b; } x1 += (L.fx - x1) * k; y1 += (L.fy - y1) * k; x2 += (L.tx + ex - x2) * k + Math.sin(st.clock * 19) * 6 * st.quake * k; y2 += (L.ty + ey - y2) * k; }
          const dl = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / dl * 3.4, ny = (x2 - x1) / dl * 3.4;
          rails.moveTo(x1 + nx, y1 + ny); rails.lineTo(x2 + nx, y2 + ny); rails.moveTo(x1 - nx, y1 - ny); rails.lineTo(x2 - nx, y2 - ny);
          rungs.moveTo(x1, y1); rungs.lineTo(x2, y2);
        }
        // one behind a tile, or in costume, is drawn by itself (clipped to what shows past the tile); the rest all together
        const own = !!f.hide || !!f.suit, PA = own ? new Path2D() : pa, HD = own ? new Path2D() : hd, SH = own ? new Path2D() : shafts, BL = own ? new Path2D() : blades;
        if (!f.noTool) {
          // the shovel: in both hands, planted to lean on, or slung across the back
          if (f.fear && !f.fear.cling) { T[0] = f.fear.sx - 13; T[1] = T[3] = f.fear.sy - 2; T[2] = f.fear.sx + 13; }  // dropped where it stood
          else if (f.shv && f.shv.up) { T[0] = f.shv.x + 5; T[1] = f.shv.y - 28; T[2] = f.shv.x; T[3] = f.shv.y - 4; }  // stood up in the snow, blade down
          else if (f.shv) { T[0] = f.shv.x - 13; T[1] = T[3] = f.shv.y; T[2] = f.shv.x + 13; }                         // dropped in a fright
          else if (f.tool === 1) { const a = (f.p[11] + f.p[10]) * D, vx = f.dir * Math.sin(a), vy = -Math.cos(a); T[0] = J[16] - vx * 11 * s; T[1] = J[17] - vy * 11 * s; T[2] = J[16] + vx * 15 * s; T[3] = J[17] + vy * 15 * s; reach(f, 1, T[0], T[1]); }
          else if (f.ov && f.ov.k && !f.ov.cling && f.ov.t < f.ov.an.len - 0.6) {  // knocked out of the hands: it spins off and lies there until picked up
            const u = Math.min(1, f.ov.t / 0.5), a = u < 1 ? f.ov.t * 15 : 0, mx = f.ov.x0 - f.ov.fd * 34 * u, my = f.y - 2 - 24 * (1 - u) - 70 * u * (1 - u), c = Math.cos(a) * 13, sn = Math.sin(a) * 13;
            T[0] = mx - c; T[1] = my - sn; T[2] = mx + c; T[3] = my + sn;
          }
          else if (f.tool === 2) { T[0] = f.x + f.dir * 10 * s; T[1] = f.y - 26 * s; T[2] = f.x + f.dir * 12 * s; T[3] = f.y - 1; reach(f, 0, T[0], T[1] + 1); if (f.an === SA.lean) reach(f, 1, T[0], T[1] + 1); }
          else { T[0] = J[0] + f.dir * 4 * s; T[1] = J[1] - 1; T[2] = J[2] - f.dir * 7 * s + (J[2] - J[0]) * 0.8; T[3] = J[3] + (J[3] - J[1]) * 0.8; }
          SH.moveTo(T[0], T[1]); SH.lineTo(T[2], T[3]);
          const bl = Math.hypot(T[2] - T[0], T[3] - T[1]) || 1, ux = (T[2] - T[0]) / bl, uy = (T[3] - T[1]) / bl;
          BL.moveTo(T[2] - ux, T[3] - uy); BL.lineTo(T[2] + ux * 5 * s, T[3] + uy * 5 * s);
          if (f.load > 0.3) { white.moveTo(T[2] + 3, T[3] - 2); white.arc(T[2] + ux * 2, T[3] + uy * 2 - 2, 3.2, 0, 6.3); }
        }
        if (f.sled) { const y = f.y - f.lift + 1.5, d = f.dir, x = J[0], bk = f.act && f.act.train ? 30 : 11; SH.moveTo(x - d * bk, y); SH.lineTo(x + d * 11, y); SH.quadraticCurveTo(x + d * 17, y, x + d * 16, y - 6); }
        limbs(PA, HD, f); dots(white, f); eye(eyes, f);
        if (f.fear) marks(white, whl, f, f.fear.run); else if (f.row && f.row.stage < 3 && f.row.t > 0.4) marks(white, whl, f, false);
        if (own) {
          g.save();
          if (f.hide) { const R = f.hide; g.beginPath(); g.rect(0, 0, W, H); g.rect(R.x, R.y, R.w, R.h); g.clip('evenodd'); }
          g.lineCap = g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = f.suit ? 6.6 : 5.2; g.stroke(PA); g.lineWidth = 2.8; g.stroke(HD);
          g.strokeStyle = f.suit || BONE; g.lineWidth = f.suit ? 4.2 : 2.5; g.stroke(PA); g.fillStyle = f.suit || BONE; g.fill(HD);
          if (!f.noTool) tools(g, SH, BL); hat(g, f); g.restore();
        }
        if (f.mug) {  // a steaming mug in the front hand
          const mx = J[16] + f.dir * 1.5, my = J[17] - 3, w = Math.sin(st.clock * 3 + f.n) * 1.6;
          mugs.rect(mx - 2.4, my - 3, 4.8, 6); mugs.rect(mx + f.dir * 2.4 - 0.6, my - 1.6, f.dir * 2.2 + 0.6, 2.6);
          whl.moveTo(mx - 1, my - 5); whl.quadraticCurveTo(mx - 1 + w, my - 8, mx - 1, my - 11); whl.moveTo(mx + 1.6, my - 6); whl.quadraticCurveTo(mx + 1.6 - w, my - 9, mx + 1.6, my - 12);
        }
        if (f.bury) { snow.moveTo(f.x - 20, f.y + 2); snow.bezierCurveTo(f.x - 17, f.y - 41 * s, f.x + 17, f.y - 41 * s, f.x + 20, f.y + 2); snow.closePath(); }
        if (f.tong) stuckF = f;
      }
      // what the games have lying about: snowballs being rolled, a heap in the air, sleds at the bottom of the run
      for (const A of st.acts) {
        if (A.balls) for (const b of A.balls) if (b.on) { snow.moveTo(b.x + b.r, b.y); snow.arc(b.x, b.y, b.r, 0, 6.3); }
        if (A.heap) { const h = A.heap; snow.moveTo(h.x + 9, h.y); snow.arc(h.x, h.y, 9, 0, 6.3); snow.moveTo(h.x - 3, h.y - 9); snow.arc(h.x - 7, h.y - 9, 4, 0, 6.3); snow.moveTo(h.x + 11, h.y - 8); snow.arc(h.x + 7, h.y - 8, 4, 0, 6.3); }
        if (A.sleds) for (let i = 0; i < A.sleds.length; i += 2) { const x = A.sleds[i], y = A.sleds[i + 1] - 1, d = A.dir; shafts.moveTo(x - d * 11, y); shafts.lineTo(x + d * 11, y); shafts.quadraticCurveTo(x + d * 17, y, x + d * 16, y - 6); }
      }
      for (let i = st.ghosts.length - 1; i >= 0; i--) {  // ladders left behind, fading
        const c = st.ghosts[i]; if ((c.a -= dt * 0.9) <= 0) { st.ghosts.splice(i, 1); continue; }
        g.globalAlpha = c.a; g.strokeStyle = '#d6ae72'; g.lineWidth = 1.7; g.beginPath(); g.moveTo(c.x - c.h, c.y - 3.4); g.lineTo(c.x + c.h, c.y - 3.4); g.moveTo(c.x - c.h, c.y + 3.4); g.lineTo(c.x + c.h, c.y + 3.4); g.stroke(); g.globalAlpha = 1;
      }
      g.lineCap = 'round';
      g.strokeStyle = INK; g.lineWidth = 3.4; g.stroke(rails);
      g.strokeStyle = '#d6ae72'; g.lineWidth = 1.7; g.stroke(rails);
      g.lineCap = 'butt'; g.lineWidth = 6.8; g.setLineDash([1.7, 8.3]); g.stroke(rungs); g.setLineDash([]);  // rungs: one dashed stroke down the middle
      ink(g, pa, hd);
      tools(g, shafts, blades);
      for (const f of st.crew) if (!f.gone && !f.hide && !f.suit) hat(g, f);
      for (const f of st.crew) if (f.gift && !f.gone) { if (st.clock - f.gift > 80) f.gift = 0; else present(g, f.J[0] - f.dir * 6, f.J[1] - 5, f.n >> 1); }  // Santa's present, kept under the arm for a while
      if (stuckF && stuckF.tong) { const f = stuckF; g.lineCap = 'round'; g.strokeStyle = '#ff7f96'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(f.J[4] + f.dir * HR * f.s * 0.8, f.J[5] + 1.5); g.lineTo(f.tong.x, f.tong.y); g.stroke(); }
      g.fillStyle = '#c8553a'; g.fill(mugs);
      if (st.yeti) yetiDraw(g, st);
      if (st.rv) rvDraw(g, st, dt);
      if (st.santa) santaDraw(g, st, dt, sc);
      g.fillStyle = 'rgba(247,251,255,.97)'; g.fill(snow); g.lineWidth = 1; g.strokeStyle = 'rgba(110,140,190,.7)'; g.stroke(snow);
      g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.5; g.stroke(whl);
      // icicles on their way down
      for (let i = st.iceF.length - 1; i >= 0; i--) { const c = st.iceF[i]; c.vy += 700 * dt; c.y += c.vy * dt; if (c.y + c.len >= c.gy) { st.iceF.splice(i, 1); if (st.stuck.length < 14) st.stuck.push({x: c.x, y: c.gy, len: c.len, t: 30}); st.iceDirty = true; } else { white.moveTo(c.x - 1.9, c.y); white.lineTo(c.x + 1.9, c.y); white.lineTo(c.x, c.y + c.len); white.closePath(); } }

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
          const a = m.act && m.act.a, ok = !m.re && !m.gone && !m.row && !m.fear && !m.ov && a !== 'climb' && !AIR[a];
          if (b.fun) { if (ok && !hidden(m)) { bump('hits'); react(m, SB.splat, 0.7); const t = b.by; if (t.grp && !t.re && !t.fear && !t.ov && !t.gone) react(t, SB.laugh, 0.9); } }
          else if (ok && !m.bury && !m.sled) { m.dir = b.by.x > m.x ? 1 : -1; react(m, SA.fist, 1.3); }
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
      st.pwNext = st.clock + st.pwGap * (0.6 + Math.random() * 0.8); return true;
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
      if (m.pw) w = !st.powers || st.clock < st.pwNext ? 0 : m.w * 8 * (armed ? 1.5 : 0.8);  // when one is due it is very likely the next move
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
      du.phase = 'fight'; du.n = 6 + (Math.random() * 5 | 0); du.since = 0; du.A = a; du.B = b; du.tag = ''; return;
    }
    if (du.phase === 'fight') {
      if (du.flee) { du.flee = false; if (goLeap(st, du, a, b, false)) return; }
      if (st.petSeen > st.petFirst && st.clock > st.petNext && !st.petting && startPet(st, du, a, b)) return;  // something to stroke has turned up
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
    if (du.phase === 'rest') { a.calm = b.calm = true; du.wait = 1.3; du.phase = 'again'; return; }
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
  function petOff(st, du, shrug) { for (const f of du.f) { f.q.push({tr: shrug ? T_SHRUG : T_NOD, wp: f.had}); f.had = 0; } if (st.petting === du) st.petting = null; st.petNext = st.clock + st.petGap; du.phase = 'salute'; }
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
    du.scare = {safe: 0}; du.pet = null; if (st.petting === du) { st.petting = null; st.petNext = st.clock + st.petGap; }
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
      {key: 'power', label: 'Power move interval', type: 'range', min: 5, max: 300, step: 5, unit: 's', default: 20},
      {key: 'truce', label: 'Petting interval', type: 'range', min: 10, max: 600, step: 10, unit: 's', default: 30}],
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
        powers: ctx.opts.powers !== false && ctx.opts.powers !== 0, pwGap: (+ctx.opts.power || 20), pwNext: (+ctx.opts.power || 20) * (0.3 + r() * 0.4), petGap: (+ctx.opts.truce || 30), petFirst: U.clamp((+ctx.opts.truce || 30) * 0.1, 2, 20), rects: ctx.rects, cuts: CUT, pieces: [], pile: new Float32Array(Math.ceil(ctx.w / 24) + 1), slashes: [], shocks: [], cracks: [], glows: [], gl: [], glow, clock: 0, force: null, scene: {actors: [], next: []}, petSeen: 0, petNext: 0, petting: null};
      // every pair drops in from above onto a tile top of its own
      for (let k = 0; k < nd; k++) {
        const P = spots[k] || plats[0], a = figs[k * 2], b = figs[k * 2 + 1], mid = spots[k] ? (P.x1 + P.x2) / 2 : ctx.w * (k + 1) / (nd + 1);
        a.pl = b.pl = P.i; a.x = mid - 140; b.x = mid + 140; a.y = b.y = -50;
        leapTo(a, P, mid - 28, 1, 0.1 + k * 0.5, false); leapTo(b, P, mid + 28, -1, 0.4 + k * 0.5, true);
        duels.push({f: [a, b], A: a, B: b, phase: 'salute', rq: 0, n: 0, since: 0, last: '', last2: '', tag: '', wait: 0, bow: false, flee: false});
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
