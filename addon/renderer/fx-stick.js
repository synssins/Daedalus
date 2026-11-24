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
      if (r < 0.22) q.push([{a: 'rest', an: SA.lean, tool: 2, dur: 2.6}, {a: 'rest', an: SA.wipe, tool: 2, dur: 1.6}, {a: 'rest', an: SA.stamp, tool: 0, dur: 1.4}][Math.random() * 3 | 0]);
      else if (r < 0.34) { const m = st.crew.filter(o => o !== f && !o.gone && !o.re && Math.abs(o.x - bx) + Math.abs(o.y - best.y) < 460)[0]; if (m) q.push({a: 'ball', to: m}); }
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
    if (f.re) { f.re.t += dt; if (f.re.t < f.re.len) { tick(f, dt); return; } f.re = null; f.an = null; }
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
        if (st.bits.length < 14) st.bits.push({x: f.x - f.dir * 6, y: f.y - 40 * f.s, vx: -f.dir * (50 + Math.random() * 50), vy: -150 - Math.random() * 50, amt: f.load, y0: P.y, r: 2 + Math.min(2.5, f.load * 0.25), life: 9});
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

  HP.fx.add('snowcrew', {
    label: 'Snow crew',
    live: true, fps: 12,
    options: [{key: 'crew', label: 'Crew', type: 'range', min: 1, max: 6, step: 1, default: 3},
      {key: 'always', label: 'Whatever the weather', type: 'bool', default: false}],
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
      for (let i = 0; i < n; i++) { const f = figure(0, plats[0].y, 0.9 + r() * 0.2); Object.assign(f, {gone: true, q: [], act: null, re: null, job: null, jx: 0, pl: 0, tool: 0, load: 0, hat: HATS[i], lad: {on: false, k: 0, link: null, len: 130}, T: new Float32Array(4)}); crew.push(f); }
      const flakes = []; for (let i = 0; i < 38; i++) flakes.push({x: r() * W, y: r() * H, v: 22 + r() * 30, w: 0.6 + r() * 1.2, ph: r() * 6.28, z: 1.4 + r() * 1.4});
      const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
      return {plats, crew, flakes, layer, lg: layer.getContext('2d'), bits: [], balls: [], on: false, snowing: false, rr: 0, clock: 0, look: 0, w: W, h: H};
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
    tap(st, x, y, ctx) {
      if (!st.on) return;
      for (const f of st.crew) if (!f.gone && onFigure(f, x, y, ctx)) {
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
      for (let k = 0, n = 0; k < plats.length && n < 3; k++) if (plats[k].dirty) { paint(st, plats[k]); n++; }
      g.drawImage(st.layer, 0, 0);

      const rails = new Path2D(), rungs = new Path2D(), pa = new Path2D(), hd = new Path2D(), shafts = new Path2D(), blades = new Path2D(), white = new Path2D();
      for (const f of st.crew) {
        if (f.gone) continue;
        crewStep(st, f, dt); solve(f);
        // the ladder: leaning on its tile, under an arm, or swinging between the two
        const la = f.lad, L = la.link, k = la.on ? 1 : la.k, half = la.len / 2, cx = f.J[2], cy = f.J[3] + 7 * f.s;
        let x1 = cx - f.dir * half * 0.97, y1 = cy + half * 0.2, x2 = cx + f.dir * half * 0.97, y2 = cy - half * 0.2;
        // while its owner digs or rests on the spot, a carried ladder lies on the ground beside them
        const aa = f.act && f.act.a, busy = !la.on && !k && (f.re || aa === 'dig' || aa === 'rest' || aa === 'ball');
        if (busy && !la.d) { la.gx = f.x; la.gd = f.dir; }
        la.d = U.clamp((la.d || 0) + (busy ? 5 : -5) * dt, 0, 1);
        if (la.d) { const gy = st.plats[f.pl].y - 2; x1 += (la.gx - la.gd * half - x1) * la.d; x2 += (la.gx + la.gd * half - x2) * la.d; y1 += (gy - y1) * la.d; y2 += (gy - y2) * la.d; }
        if (k > 0) { const ex = (L.tx - L.fx) / L.len * 9, ey = (L.ty - L.fy) / L.len * 9; if (L.sd * f.dir > 0 === x1 < x2) { const a = x1, b = y1; x1 = x2; y1 = y2; x2 = a; y2 = b; } x1 += (L.fx - x1) * k; y1 += (L.fy - y1) * k; x2 += (L.tx + ex - x2) * k; y2 += (L.ty + ey - y2) * k; }
        const dl = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / dl * 3.4, ny = (x2 - x1) / dl * 3.4;
        rails.moveTo(x1 + nx, y1 + ny); rails.lineTo(x2 + nx, y2 + ny); rails.moveTo(x1 - nx, y1 - ny); rails.lineTo(x2 - nx, y2 - ny);
        rungs.moveTo(x1, y1); rungs.lineTo(x2, y2);
        // the shovel: in both hands, planted to lean on, or slung across the back
        const J = f.J, s = f.s, T = f.T;
        if (f.tool === 1) { const a = (f.p[11] + f.p[10]) * D, vx = f.dir * Math.sin(a), vy = -Math.cos(a); T[0] = J[16] - vx * 11 * s; T[1] = J[17] - vy * 11 * s; T[2] = J[16] + vx * 15 * s; T[3] = J[17] + vy * 15 * s; reach(f, 1, T[0], T[1]); }
        else if (f.tool === 2) { T[0] = f.x + f.dir * 10 * s; T[1] = f.y - 26 * s; T[2] = f.x + f.dir * 12 * s; T[3] = f.y - 1; reach(f, 0, T[0], T[1] + 1); if (f.an === SA.lean) reach(f, 1, T[0], T[1] + 1); }
        else { T[0] = J[0] + f.dir * 4 * s; T[1] = J[1] - 1; T[2] = J[2] - f.dir * 7 * s + (J[2] - J[0]) * 0.8; T[3] = J[3] + (J[3] - J[1]) * 0.8; }
        shafts.moveTo(T[0], T[1]); shafts.lineTo(T[2], T[3]);
        const bl = Math.hypot(T[2] - T[0], T[3] - T[1]) || 1, ux = (T[2] - T[0]) / bl, uy = (T[3] - T[1]) / bl;
        blades.moveTo(T[2] - ux, T[3] - uy); blades.lineTo(T[2] + ux * 5 * s, T[3] + uy * 5 * s);
        if (f.load > 0.3) { white.moveTo(T[2] + 3, T[3] - 2); white.arc(T[2] + ux * 2, T[3] + uy * 2 - 2, 3.2, 0, 6.3); }
        limbs(pa, hd, f);
      }
      g.lineCap = 'round';
      g.strokeStyle = INK; g.lineWidth = 3.4; g.stroke(rails);
      g.strokeStyle = '#d6ae72'; g.lineWidth = 1.7; g.stroke(rails);
      g.lineCap = 'butt'; g.lineWidth = 6.8; g.setLineDash([1.7, 8.3]); g.stroke(rungs); g.setLineDash([]);  // rungs: one dashed stroke down the middle
      ink(g, pa, hd);
      g.strokeStyle = INK; g.lineWidth = 3.6; g.stroke(shafts); g.strokeStyle = '#c99a5e'; g.lineWidth = 1.6; g.stroke(shafts);
      g.lineCap = 'butt'; g.strokeStyle = INK; g.lineWidth = 8; g.stroke(blades); g.strokeStyle = '#b9c6d6'; g.lineWidth = 6; g.stroke(blades);
      // woolly hats, one colour each, so the crew can be told apart
      for (const f of st.crew) if (!f.gone) { const J = f.J, a = Math.atan2(J[5] - J[3], J[4] - J[2]); g.fillStyle = f.hat; g.beginPath(); g.arc(J[4], J[5], HR * f.s + 0.9, a - 1.45, a + 1.45); g.fill(); }

      // thrown snow, brushed-off puffs, snowballs and the falling flakes: all one white fill
      for (let i = st.bits.length - 1; i >= 0; i--) {
        const c = st.bits[i], py = c.y; c.vy += 480 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt;
        let gone = c.life <= 0 || c.x < -12 || c.x > W + 12 || c.y > H + 12;
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
          const a = m.act && m.act.a; if (!m.re && !m.gone && a !== 'climb' && a !== 'hop') { m.dir = b.by.x > m.x ? 1 : -1; react(m, SA.fist, 1.3); }
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
  ];
  // the best hit of the round: a flying kick, the world slows down, B goes tumbling and ends on one knee
  const FINISH = {n: 'finish', d: 62,
    A: track([0, K.G], [0.12, K.CRH], [0.26, K.FK, {up: 20, x: 30, e: 1}], [0.5, K.FK, {up: 22, x: 40}], [0.75, K.LD, {x: 46}], [1.0, K.G], [1.9, K.G2], ['big', 0.27, 8]),
    B: track([0, K.G], [0.27, K.G2], [0.32, K.RL, {e: 1, x: -6, up: 6}], [0.55, K.TK, {c: 2, up: 24, x: -40, rot: -200, e: 2}], [0.8, K.SD, {x: -70, rot: -360, e: 2}], [1.15, K.SD, {x: -92}], [1.5, K.KN], [1.9, K.KN],
      ['dust', 0.82], ['dust', 0.92], ['dust', 1.04])};

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
      if (du.n-- > 0) { nextMove(st, du); return; }
      if (a.wpn) { startMove(st, du, {d: Math.abs(b.x - a.x), A: T_DROP, B: T_DROP}, a, b, a.x, dA); return; }
      // the finishing blow needs room; if this tile is too narrow they take it somewhere wider
      let A = a, B = b, d = dA; if (Math.random() < 0.5) { A = b; B = a; d = -dA; }
      let xa = fit(P, FINISH, A.x, d); if (xa == null) { const t = A; A = B; B = t; d = -d; xa = fit(P, FINISH, A.x, d); }
      if (xa == null) { if (!goLeap(st, du, a, b, false, 210)) du.phase = 'bow'; return; }
      startMove(st, du, FINISH, A, B, xa, d); du.A = A; du.B = B; du.phase = 'bow'; return;
    }
    if (du.phase === 'bow') { du.A.q.push({tr: T_WON}); du.B.q.push({tr: T_LOST}); du.phase = 'rest'; return; }
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
    if (f.tt >= tr.len) { f.cur = null; f.p[10] = 0; f.p[11] %= 360; f.lift = 0; f.pin = 0; if (s.pl != null) f.pl = s.pl; f.y = st.plats[f.pl].y; }
    return true;
  }
  function idle(f, dt) { play(f, f.watch ? KA.crane : f.calm ? KA.std : f.wpn ? KA.s : KA.g, 0.18); tick(f, dt); }
  const settled = f => f.pin === 0 && f.lift < 1 && Math.abs(f.p[10]) < 5 && !(f.cur && f.cur.pl != null) && !f.q.some(s => s.pl != null);
  function duelStep(st, du, dt) {
    const a = du.f[0], b = du.f[1];
    if (du.bow && settled(a) && settled(b)) {  // tapped: drop everything and bow to whoever is watching
      du.bow = false; const d = (a.x + b.x) / 2 < st.w / 2 ? 1 : -1;
      for (const f of du.f) { f.cur = null; f.q.length = 0; f.lift = 0; f.p[10] = 0; f.q.push({dir: d, tr: T_VIEWER}); }
    }
    const ra = advance(st, a, dt), rb = advance(st, b, dt);
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
  }

  HP.fx.add('kungfu', {
    label: 'Stick fight',
    live: true, fps: 12,
    options: [{key: 'fighters', label: 'Fighters', type: 'range', min: 2, max: 6, step: 1, default: 2},
      {key: 'weapons', label: 'Weapons', type: 'bool', default: true}],
    create(ctx) {
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
      for (let i = 0; i < n; i++) figs.push(Object.assign(figure(0, -60, 0.95 + r() * 0.13), {col: SASH[i], wpn: 0, wt: 1, pl: 0, q: [], cur: null, tt: 0, x0: 0, y0: 0, fxi: 0, em: [], tip: [0, 0], tr: new Float32Array(8), seen: false, hx: 0, hy: 0, calm: false, watch: false}));
      const st = {plats, figs, duels, spare: null, fx: [], proj: [], slow: 0, w: ctx.w, h: ctx.h, weapons: ctx.opts.weapons !== false && ctx.opts.weapons !== 0};
      // every pair drops in from above onto a tile top of its own
      for (let k = 0; k < nd; k++) {
        const P = spots[k] || plats[0], a = figs[k * 2], b = figs[k * 2 + 1], mid = spots[k] ? (P.x1 + P.x2) / 2 : ctx.w * (k + 1) / (nd + 1);
        a.pl = b.pl = P.i; a.x = mid - 140; b.x = mid + 140; a.y = b.y = -50;
        leapTo(a, P, mid - 28, 1, 0.1 + k * 0.5, false); leapTo(b, P, mid + 28, -1, 0.4 + k * 0.5, true);
        duels.push({f: [a, b], A: a, B: b, phase: 'salute', n: 0, since: 0, last: '', last2: '', tag: '', wait: 0, bow: false, flee: false});
      }
      if (n % 2) {  // the odd one out waits on a corner, on one foot, for the next round
        const f = st.spare = figs[n - 1], S = spots[nd] || plats[0];
        f.pl = S.i; f.x = S.x2 - 3; f.y = S.y; f.dir = -1; f.watch = true;
      }
      return st;
    },
    tap(st, x, y, ctx) { for (const f of st.figs) if (onFigure(f, x, y, ctx)) { for (const du of st.duels) du.bow = true; return true; } },
    // the tile they stand on was pressed: they take the fight elsewhere
    press(st, rect) { for (const du of st.duels) if (st.plats[du.f[0].pl].rect === rect) du.flee = true; },
    draw(g, st, ctx, t, dt) {
      if (st.slow > 0) { st.slow -= dt; dt /= 3; }  // the slow-motion beat
      for (const du of st.duels) duelStep(st, du, dt);
      const sp = st.spare; if (sp && !advance(st, sp, dt)) idle(sp, dt);
      const pa = new Path2D(), hd = new Path2D(), staffs = new Path2D(), swords = new Path2D(), thin = new Path2D(), hot = new Path2D(), dust = new Path2D();
      for (const f of st.figs) {
        solve(f); const J = f.J, s = f.s;
        if (f.wpn) {
          const a = (f.p[11] + f.p[10]) * D, vx = f.dir * Math.sin(a), vy = -Math.cos(a);
          if (f.wpn === 1) { reach(f, 1, J[16] - vx * 9 * s, J[17] - vy * 9 * s); staffs.moveTo(J[16] - vx * 16 * s, J[17] - vy * 16 * s); staffs.lineTo(J[16] + vx * 29 * s, J[17] + vy * 29 * s); }
          else { swords.moveTo(J[16] - vx * 3, J[17] - vy * 3); swords.lineTo(J[16] + vx * 25 * s, J[17] + vy * 25 * s); swords.moveTo(J[16] + vx * 2 - vy * 3, J[17] + vy * 2 + vx * 3); swords.lineTo(J[16] + vx * 2 + vy * 3, J[17] + vy * 2 - vx * 3); }
          f.tip[0] = J[16] + vx * 20 * s; f.tip[1] = J[17] + vy * 20 * s;
        }
        limbs(pa, hd, f);
        // fast hands and feet leave a thin streak: at this frame rate that is what makes a kick look like a kick
        for (let i = 0; i < 4; i++) {
          const x = J[8 + i * 4], y = J[9 + i * 4], T = f.tr;
          if (f.seen) { const dx = x - T[i * 2], dy = y - T[i * 2 + 1], d2 = dx * dx + dy * dy; if (d2 > 120 && d2 < 8000) { thin.moveTo(T[i * 2], T[i * 2 + 1]); thin.lineTo(x - dx * 0.25, y - dy * 0.25); } }
          T[i * 2] = x; T[i * 2 + 1] = y;
        }
        while (f.em.length) emit(st, f, f.em.shift());
      }
      // dust, swooshes, stars and sparks
      for (let i = st.fx.length - 1; i >= 0; i--) {
        const e = st.fx[i]; e.t += dt; const u = e.t / e.life;
        if (u >= 1) { st.fx.splice(i, 1); continue; }
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
      g.lineCap = 'round';
      g.fillStyle = 'rgba(236,238,248,.42)'; g.fill(dust);
      g.strokeStyle = 'rgba(255,255,255,.62)'; g.lineWidth = 1.6; g.stroke(thin);
      ink(g, pa, hd);
      // a sash at the waist and a headband with a tail that streams behind, in each fighter's own colour
      g.lineWidth = 2.8;
      for (const f of st.figs) {
        const J = f.J, s = f.s; let ux = J[2] - J[0], uy = J[3] - J[1]; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
        const bx = J[4] + f.dir * uy * HR * s, by = J[5] - f.dir * ux * HR * s, tx = bx - f.dir * 9 * s, ty = by + 4;
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
    },
  });
})();
