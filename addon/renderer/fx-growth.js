'use strict';
// Overlays that grow over days: two for Halloween (tendrils, cobwebs) and four natural ones (crystals, moss,
// honeycomb, coral reef). Everything is decided once from the seed in create(); drawing only asks "how far along?",
// so every tablet shows the same growth and a panel that slept wakes up where the clock says it should be.
(() => {
  const U = HP.fx.util, TAU = Math.PI * 2;
  const amount = () => ({key: 'amount', label: 'Amount', type: 'range', min: 0.3, max: 1, step: 0.05, default: 0.7});
  const solid = r => !r.hidden && !r.flat;                 // a real button: something to grow on and to keep usable
  const creep = r => 0.15 * Math.min(r.w, r.h);            // how far anything may reach in over a button's edge
  const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
  const rgb = (q, a) => 'rgba(' + q[0] + ',' + q[1] + ',' + q[2] + ',' + a + ')';

  /** Is this point further inside a button than things are allowed to creep? */
  function buried(rects, x, y) {
    for (const r of rects) if (solid(r) && Math.min(x - r.x, r.x + r.w - x, y - r.y, r.y + r.h - y) > creep(r)) return true;
    return false;
  }
  /** How far something can grow from here in this direction before it would bury a button or leave the screen. */
  function reach(c, x, y, dx, dy, max) {
    let l = 0;
    for (; l < max; l += 4) { const px = x + dx * (l + 4), py = y + dy * (l + 4); if (px < 0 || py < 0 || px > c.w || py > c.h || buried(c.rects, px, py)) break; }
    return Math.min(l, max);
  }
  /** Points round a button's real (rounded) outline, clockwise from the top-left, with the outward direction at each. */
  function rim(b, step) {
    const rr = Math.max(0, Math.min(b.r || 0, b.w / 2, b.h / 2)), out = [], x = b.x, y = b.y, X = b.x + b.w, Y = b.y + b.h;
    const line = (x1, y1, x2, y2, nx, ny) => { const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / step)); for (let i = 0; i < n; i++) out.push({x: x1 + (x2 - x1) * i / n, y: y1 + (y2 - y1) * i / n, nx, ny}); };
    const arc = (cx, cy, a0) => { const n = Math.max(1, Math.round(rr * 1.57 / step)); for (let i = 0; i < n; i++) { const a = a0 + Math.PI / 2 * i / n; out.push({x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, nx: Math.cos(a), ny: Math.sin(a)}); } };
    line(x + rr, y, X - rr, y, 0, -1); arc(X - rr, y + rr, -Math.PI / 2); line(X, y + rr, X, Y - rr, 1, 0); arc(X - rr, Y - rr, 0);
    line(X - rr, Y, x + rr, Y, 0, 1); arc(x + rr, Y - rr, Math.PI / 2); line(x, Y - rr, x, y + rr, -1, 0); arc(x + rr, y + rr, Math.PI);
    return out;
  }
  /** Neighbouring buttons and the two edges that face each other: a's edge at p, b's at q, shared stretch s..e. */
  function pairs(bs) {
    const out = [];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (oy > 24) { const l = a.x < b.x ? i : j, r = l === i ? j : i, gap = bs[r].x - (bs[l].x + bs[l].w); if (gap >= 0 && gap < 40) out.push({a: l, b: r, v: true, p: bs[l].x + bs[l].w, q: bs[r].x, s: Math.max(a.y, b.y), e: Math.min(a.y + a.h, b.y + b.h)}); }
      if (ox > 24) { const t = a.y < b.y ? i : j, u = t === i ? j : i, gap = bs[u].y - (bs[t].y + bs[t].h); if (gap >= 0 && gap < 40) out.push({a: t, b: u, v: false, p: bs[t].y + bs[t].h, q: bs[u].y, s: Math.max(a.x, b.x), e: Math.min(a.x + a.w, b.x + b.w)}); }
    }
    return out;
  }
  /** The still part of a live kind, kept in a hidden canvas and painted again only when growth has visibly moved. */
  function still(st, c, paint) {
    if (!st.cv) { st.cv = document.createElement('canvas'); st.cv.width = c.w; st.cv.height = c.h; st.cp = -1; }
    if (Math.abs(c.progress - st.cp) > 0.005) { st.cp = c.progress; const g = st.cv.getContext('2d'); g.clearRect(0, 0, c.w, c.h); g.save(); paint(g); g.restore(); }
    return st.cv;
  }

  /** The slow kinds here are drawn only when asked. For a short reaction to a finger the drawing is asked for a few
   *  times a second until it is over: a handful of extra drawings, then quiet again. */
  function run(st, c, ms, every) {
    st.until = Date.now() + ms; c.redraw();
    if (!st.timer) st.timer = setInterval(() => { c.redraw(); if (Date.now() > st.until) { clearInterval(st.timer); st.timer = 0; } }, every || 130);
  }
  /** Something was taken and grows back over a minute: a slow kind is drawn every two seconds until it has. */
  function mend(st, c, ms) {
    st.mendTo = Date.now() + ms;
    if (!st.mender) st.mender = setInterval(() => { c.redraw(); if (Date.now() > st.mendTo) { clearInterval(st.mender); st.mender = 0; } }, 2000);
  }
  /** Up to "max" of these, none within "gap" pixels of one already chosen: what a kind posts sparsely. Fills "out". */
  function sparse(list, ok, gap, max, out) {
    out.length = 0;
    for (const k of list) {
      if (out.length >= max) break;
      if (!ok(k)) continue;
      let clear = true; for (const o of out) if (Math.hypot(o.x - k.x, o.y - k.y) < gap) { clear = false; break; }
      if (clear) out.push(k);
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Tendrils: wet black strands that start at one or two buttons, reach across the gaps, stick, thicken, and end up
  // webbing over the buttons' edges. Each strand first reaches out as a pointed feeler, then lands and fattens.
  function strand(g, s, q, hl, dots) {
    const N = 5, joined = !s.drip && q >= 0.45, tmax = s.drip ? 1 : Math.min(1, q / 0.45), fat = s.w * (0.4 + 0.6 * U.span(q, 0.3, 1));
    const x2 = s.drip ? s.x1 : s.x2, y2 = s.drip ? s.y1 + (s.y2 - s.y1) * U.span(q, 0, 1) : s.y2;
    // it sags most just after it lands, then pulls tighter: that is what makes it look elastic
    const cx = (s.x1 + x2) / 2, cy = (s.y1 + y2) / 2 + s.sag * (joined ? 2 - q : 0.3), L = [], R = [], h = [];
    let ex = s.x1, ey = s.y1;
    for (let i = 0; i <= N; i++) {
      const t = tmax * i / N, a = 1 - t, px = a * a * s.x1 + 2 * a * t * cx + t * t * x2, py = a * a * s.y1 + 2 * a * t * cy + t * t * y2;
      let tx = 2 * a * (cx - s.x1) + 2 * t * (x2 - cx), ty = 2 * a * (cy - s.y1) + 2 * t * (y2 - cy); const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const f = 1 - i / N, wd = fat / 2 * (joined ? 0.32 + 0.68 * Math.pow(Math.abs(2 * t - 1), 1.6) : s.drip ? 0.3 + 0.7 * f * f : 0.12 + 0.88 * f);
      L.push(px - ty * wd, py + tx * wd); R.push(px + ty * wd, py - tx * wd);
      let nx = -ty, ny = tx; if (ny > 0.01 || (Math.abs(ny) <= 0.01 && nx > 0)) { nx = -nx; ny = -ny; }   // the light comes from the upper left
      if (i > 0 && i < N) h.push(px + nx * wd * 0.5, py + ny * wd * 0.5);
      ex = px; ey = py;
    }
    g.beginPath(); g.moveTo(L[0], L[1]);
    for (let i = 2; i < L.length; i += 2) g.lineTo(L[i], L[i + 1]);
    for (let i = R.length - 2; i >= 0; i -= 2) g.lineTo(R[i], R[i + 1]);
    g.closePath(); g.fill();
    dots.push([s.x1, s.y1, fat * 0.62]);
    if (joined) dots.push([x2, y2, fat * 0.62]); else if (s.drip) dots.push([ex, ey, 0.6 + fat * 0.4 * U.span(q, 0.3, 1)]);
    if (fat > 3) hl.push(h);
  }
  HP.fx.add('tendrils', {
    label: 'Tendrils', grows: true, days: 7, covers: true,
    options: [amount()],
    create(c) {
      const r = c.rand, amt = c.opts.amount, bs = c.rects.filter(solid), strands = [];
      if (!bs.length) return {info: [], strands};
      const mid = b => [b.x + b.w / 2, b.y + b.h / 2], o1 = mid(pick(r, bs)), o2 = r() < 0.6 ? mid(pick(r, bs)) : o1, far = Math.hypot(c.w, c.h) * 0.7;
      // every button: when the goo reaches it (by distance from where it started), and its own lumpy rim
      const info = bs.map((b, n) => {
        const m = mid(b), d1 = Math.hypot(m[0] - o1[0], m[1] - o1[1]), d2 = Math.hypot(m[0] - o2[0], m[1] - o2[1]), o = d1 < d2 ? o1 : o2, d = Math.min(d1, d2);
        const nz = U.noise(c.seed + n * 31), from = d < 1 ? r() * TAU : Math.atan2(o[1] - m[1], o[0] - m[0]);
        const pts = rim(b, 14).map((q, i) => {
          let da = Math.abs(Math.atan2(q.y - m[1], q.x - m[0]) - from) % TAU; if (da > Math.PI) da = TAU - da;
          return {x: q.x, y: q.y, nx: q.nx, ny: q.ny, lump: U.clamp(0.3 + 0.75 * nz(i * 0.36) + 0.35 * nz(i * 1.1 + 40), 0, 1), late: da / Math.PI * 0.6};  // the side facing the source goes first
        });
        return {b, side: Math.min(b.w, b.h), pts, at: Math.min(0.68, d / far * 0.8), wrap: d < 1 || r() < 0.16};
      });
      const add = (x1, y1, x2, y2, at, drip) => strands.push({x1, y1, x2, y2, at: Math.min(0.78, at), dur: 0.14 + r() * 0.08, w: 4 + r() * 5,
        sag: drip ? 0 : (4 + r() * 9) * Math.min(1, Math.hypot(x2 - x1, y2 - y1) / 50), drip});
      for (const pr of pairs(bs)) {
        const A = info[pr.a], B = info[pr.b], len = pr.e - pr.s, n = Math.round(len / 46 * amt * (0.5 + r()));
        for (let k = 0; k < n; k++) {
          const u = pr.s + 6 + r() * (len - 12), v = U.clamp(u + (r() < 0.5 ? -1 : 1) * (10 + r() * 55), pr.s + 4, pr.e - 4), i1 = 2 + r() * 6, i2 = 2 + r() * 6;
          let p1 = pr.v ? [pr.p - i1, u] : [u, pr.p - i1], p2 = pr.v ? [pr.q + i2, v] : [v, pr.q + i2];
          if (B.at < A.at) { const s = p1; p1 = p2; p2 = s; }   // it reaches out from whichever button the goo got to first
          add(p1[0], p1[1], p2[0], p2[1], Math.min(A.at, B.at) + 0.03 + r() * 0.2);
        }
      }
      for (const f of info) {
        const b = f.b, rr = Math.min(b.r || 0, f.side / 2), late = Math.max(f.at + 0.25, 0.45);
        // a wrapped button gets strands strung across each corner; its middle stays clear
        if (f.wrap) for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) {
          const sx = k === 0 || k === 3 ? 1 : -1, sy = k < 2 ? 1 : -1, cx = sx > 0 ? b.x : b.x + b.w, cy = sy > 0 ? b.y : b.y + b.h;
          const a1 = rr * 0.9 + (0.05 + r() * 0.2) * f.side, a2 = rr * 0.9 + (0.05 + r() * 0.2) * f.side;
          add(cx + sx * a1, cy + sy * 2, cx + sx * 2, cy + sy * a2, late + r() * 0.25);
        }
        for (let k = 0, n = Math.round((f.wrap ? 4 : 1.5) * amt * r() * 1.6); k < n; k++) { const x = b.x + rr + r() * (b.w - 2 * rr), y = b.y + b.h - 2; add(x, y, x, y + 6 + r() * 11, late + r() * 0.3, true); }
      }
      return {info, strands};
    },
    // It does not like to be touched: the strands by the finger snap back to where they came from, then creep out
    // and take hold again over three seconds.
    touch(st, x, y, c) {
      const now = Date.now(); let any = false;
      for (const s of st.strands) if (c.progress > s.at && Math.hypot((s.x1 + s.x2) / 2 - x, (s.y1 + s.y2) / 2 - y) < 75) { s.rc = now; any = true; }
      if (any) run(st, c, 3200, 180);
    },
    draw(g, st, c) {
      const now = Date.now(), back = s => { const e = (now - s.rc) / 3000; if (e >= 1) { s.rc = 0; return 1; } return 0.25 + 0.75 * e * e; };
      const p = c.progress, hl = [], dots = [], half = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      g.fillStyle = '#060508';
      for (const f of st.info) {
        const q = (p - f.at) / 0.3; if (q <= 0) continue;
        const thick = f.side * (0.08 + (f.wrap ? 0.07 : 0.03) * U.span(p, Math.max(f.at + 0.25, 0.45), 1)), n = f.pts.length, inn = [];
        for (const t of f.pts) { const d = thick * t.lump * U.span(q, t.late, t.late + 0.4) - 2.5; inn.push([t.x - t.nx * d, t.y - t.ny * d, d]); }
        // a ring: the button's own outline outside, a lumpy line inside
        U.box(g, f.b, 2.5);
        const s = half(inn[n - 1], inn[0]); g.moveTo(s[0], s[1]);
        for (let i = 0; i < n; i++) { const e = half(inn[i], inn[(i + 1) % n]); g.quadraticCurveTo(inn[i][0], inn[i][1], e[0], e[1]); }
        g.closePath(); g.fill('evenodd');
        let run = null;
        for (let i = 0; i < n; i++) { const t = f.pts[i], d = inn[i][2]; if (d > 3.5 && t.nx + t.ny < -0.25) { if (!run) hl.push(run = []); run.push(t.x - t.nx * d * 0.45, t.y - t.ny * d * 0.45); } else run = null; }
      }
      for (const s of st.strands) { const q = (p - s.at) / s.dur; if (q > 0) strand(g, s, Math.min(1, q) * (s.rc ? back(s) : 1), hl, dots); }
      g.beginPath(); for (const d of dots) { g.moveTo(d[0] + d[2], d[1]); g.arc(d[0], d[1], d[2], 0, TAU); } g.fill();
      // the wet look: one thin pale line along the lit side of everything
      g.strokeStyle = 'rgba(214,226,246,.5)'; g.lineWidth = 1; g.lineCap = g.lineJoin = 'round'; g.beginPath();
      for (const l of hl) if (l.length > 3) { g.moveTo(l[0], l[1]); for (let i = 2; i < l.length; i += 2) g.lineTo(l[i], l[i + 1]); }
      g.stroke();
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Cobwebs: quarter webs in the screen's corners and across buttons' corners. The spokes go up first, then the
  // spiral threads between them, one at a time. A spider comes down from the top edge now and then.
  function paintWebs(g, st, p) {
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(238,241,250,.62)'; g.lineWidth = 1; g.beginPath();
    for (const w of st.webs) {
      const q = w.q = (p - w.at) / w.dur, n = w.rad.length; if (q <= 0) continue;
      w.rad.forEach((d, i) => { const l = d.len * U.span(q / 0.4, i / n * 0.5, i / n * 0.5 + 0.5); if (l > 1) { g.moveTo(w.x, w.y); g.lineTo(w.x + Math.cos(d.a) * l, w.y + Math.sin(d.a) * l); } });
    }
    g.stroke();
    g.strokeStyle = 'rgba(232,236,248,.5)'; g.lineWidth = 0.7; g.beginPath();
    for (const w of st.webs) {
      if (w.q <= 0.4) continue;
      const n = w.rad.length - 1, M = w.rings.length * n, show = Math.floor(U.clamp((w.q - 0.4) / 0.6, 0, 1) * M);
      for (let m = 0; m < show; m++) {
        if (w.miss[m]) continue;   // an old web has holes
        const k = Math.floor(m / n), i = k % 2 ? n - 1 - m % n : m % n, f = w.rings[k], A = w.rad[i], B = w.rad[i + 1];
        const ax = w.x + Math.cos(A.a) * A.len * f, ay = w.y + Math.sin(A.a) * A.len * f, bx = w.x + Math.cos(B.a) * B.len * f, by = w.y + Math.sin(B.a) * B.len * f;
        g.moveTo(ax, ay); g.quadraticCurveTo(U.lerp((ax + bx) / 2, w.x, 0.13), U.lerp((ay + by) / 2, w.y, 0.13) + f * 2.5, bx, by);   // each thread sags toward the hub and a little downward
      }
      if (w.q >= 1) for (const l of w.loose) { const A = w.rad[l.i], x = w.x + Math.cos(A.a) * A.len * l.f, y = w.y + Math.sin(A.a) * A.len * l.f; g.moveTo(x, y); g.quadraticCurveTo(x + l.dx, y + l.len * 0.6, x + l.dx * 0.6, y + l.len); }
    }
    for (const d of st.drapes) { const k = U.span(p, d.at, d.at + 0.15); if (k > 0.02) { g.moveTo(d.x, 0); g.quadraticCurveTo(d.x + d.span * k / 2, d.sag * 2 * k, d.x + d.span * k, 0); } }
    g.stroke();
  }
  function spider(g, x, y, ph) {
    const leg = w => { g.lineWidth = w; g.beginPath();
      for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 4; i++) {
        const a = (-58 + i * 37) * Math.PI / 180 + Math.sin(ph + i * 1.7 + s) * 0.13, bx = x + s * 2, by = y - 1 + i * 0.9;
        const kx = bx + s * Math.cos(a - 0.5) * 6, ky = by + Math.sin(a - 0.5) * 6;
        g.moveTo(bx, by); g.lineTo(kx, ky); g.lineTo(kx + s * Math.cos(a + 0.55) * 6.5, ky + Math.sin(a + 0.55) * 6.5);
      }
      g.stroke(); };
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(225,228,240,.3)'; leg(2.6);   // a faint pale edge so a black spider still shows on a dark backdrop
    g.strokeStyle = '#0b090d'; leg(1.25);
    g.fillStyle = '#0b090d'; g.beginPath(); g.ellipse(x, y + 4.5, 4.6, 5.6, 0, 0, TAU); g.moveTo(x + 2.9, y - 2); g.arc(x, y - 2, 2.9, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(225,228,240,.32)'; g.lineWidth = 0.8; g.beginPath(); g.ellipse(x, y + 4.5, 4.6, 5.6, 0, Math.PI * 0.9, Math.PI * 1.6); g.stroke();
    g.fillStyle = 'rgba(190,28,28,.95)'; g.beginPath(); g.arc(x, y + 5.5, 1.3, 0, TAU); g.fill();
  }
  // What others may meet: a web is something to look at, and it sticks. One that holds somebody is only a trap.
  const WEB_OPEN = ['wonder', 'trap'], WEB_BUSY = ['trap'], STUCK = [0, 0, -6, 11, 7, 19, -4, 27];
  /** Sticky threads over whatever the web holds at hx, hy (a head, with the body below it): from the hub and the
   *  ends of three spokes across to the far side of it, and three turns round it. */
  function sticky(g, w) {
    const x = w.hx, y = w.hy, n = w.rad.length;
    g.lineCap = 'round'; g.strokeStyle = 'rgba(240,243,252,.8)'; g.lineWidth = 0.9; g.beginPath();
    for (let i = 0; i < 4; i++) {
      const d = w.rad[i === 1 ? 0 : i === 2 ? n >> 1 : n - 1], ax = i ? w.x + Math.cos(d.a) * d.len : w.x, ay = i ? w.y + Math.sin(d.a) * d.len : w.y;
      const tx = x + STUCK[i * 2] + (x - ax > 0 ? 6 : -6), ty = y + STUCK[i * 2 + 1];
      g.moveTo(ax, ay); g.quadraticCurveTo((ax + tx) / 2, (ay + ty) / 2 + 5, tx, ty);
    }
    for (let i = 0; i < 3; i++) { const yy = y + 5 + i * 9; g.moveTo(x - 8, yy - 2); g.quadraticCurveTo(x, yy + 4, x + 8, yy - 1); }
    g.stroke();
  }
  function webPost(st, w) {
    const post = {kind: 'cobweb', tags: WEB_OPEN, x: w.mx, y: w.my, h: w.R,
      trap(by) { if (w.held) return false; w.held = true; w.hx = by && by.x != null ? by.x : w.mx; w.hy = by && by.y != null ? by.y : w.my; w.heldAt = st.now; post.tags = WEB_BUSY; st.shake = st.now; return true; },
      free() { if (!w.held) return; w.held = false; w.let = st.now; post.tags = WEB_OPEN; st.shake = st.now; },
      paint(g) { if (w.held) sticky(g, w); }};
    return post;
  }
  HP.fx.add('cobwebs', {
    label: 'Cobwebs', grows: true, days: 14, live: true, fps: 12, covers: true,
    options: [amount(), {key: 'spider', label: 'Spider', type: 'bool', default: true}],
    create(c) {
      const r = c.rand, amt = c.opts.amount, webs = [];
      const web = (x, y, a0, R, at, big) => {
        const mid = big === 2, n = mid ? 6 : big ? 7 + Math.floor(r() * 3) : 4 + Math.floor(r() * 2), nk = mid ? 5 + Math.floor(r() * 2) : big ? 8 + Math.floor(r() * 4) : 3 + Math.floor(r() * 2), rad = [], rings = [], miss = [], loose = [];
        // the two outer spokes run along the edges; the ones between are uneven, as a spider leaves them
        for (let i = 0; i < n; i++) { const edge = !i || i === n - 1; rad.push({a: a0 + Math.PI / 2 * (i + (edge ? 0 : (r() - 0.5) * 0.5)) / (n - 1), len: R * (edge ? 1.05 : 0.72 + r() * 0.4)}); }
        for (let k = 0; k < nk; k++) rings.push((k + 1 + (r() - 0.5) * 0.3) / (nk + 0.4));
        for (let m = 0, M = nk * (n - 1); m < M; m++) miss.push(r() < (m > M * 0.6 ? 0.2 : 0.06));
        if (big === true) for (let k = 0; k < 3; k++) loose.push({i: 1 + Math.floor(r() * (n - 2)), f: 0.5 + r() * 0.5, len: 14 + r() * 30, dx: (r() - 0.5) * 10});
        // its middle (where a caught head would be) and its top (where the spider's thread hangs from)
        webs.push({x, y, rad, rings, miss, loose, at, dur: big === true ? 0.4 : 0.3, R, mx: x + Math.cos(a0 + Math.PI / 4) * R * 0.45, my: y + Math.sin(a0 + Math.PI / 4) * R * 0.45, top: Math.min(y, y + Math.sin(a0 + Math.PI / 4) * R * 1.4)});
      };
      const k0 = Math.floor(r() * 4), big = (i, x, y) => web(x, y, i * Math.PI / 2, (i < 2 ? 170 + r() * 110 : 120 + r() * 80) * (0.55 + 0.45 * amt), [0, 0.05, 0.12, 0.2][(i + k0) % 4], true);
      big(0, 0, 0); big(1, c.w, 0); big(2, c.w, c.h); big(3, 0, c.h);
      for (const b of c.rects) if (solid(b)) for (let i = 0; i < 4; i++) if (r() < 0.34 * amt)
        web(i === 0 || i === 3 ? b.x : b.x + b.w, i < 2 ? b.y : b.y + b.h, i * Math.PI / 2, Math.min(0.5 * Math.min(b.w, b.h), 30 + r() * 26), 0.1 + r() * 0.58, false);
      // a few long loose threads strung along the top edge, hanging in a curve
      const drapes = []; for (let i = 0, n = Math.round(5 * amt); i < n; i++) drapes.push({x: r() * c.w * 0.85, span: 80 + r() * 220, sag: 16 + r() * 34, at: 0.3 + r() * 0.5});
      // the spider comes down a gap that starts near the top, so it hangs between buttons and not over one
      const lanes = c.gaps.filter(q => Math.abs(q.x1 - q.x2) < 1 && Math.min(q.y1, q.y2) < c.h * 0.35).map(q => ({x: q.x1, len: U.clamp((q.y1 + q.y2) / 2, 60, c.h * 0.45)}));
      // A larger web in a lower corner of some tiles that have a tile below: whoever stands on that one has its head in
      // the web. Made last, so the webs above stay as the seed had them before.
      const bs = c.rects.filter(solid);
      for (const b of bs) {
        const i = r() < 0.5 ? 2 : 3, x = i === 2 ? b.x + b.w : b.x, y = b.y + b.h, R = Math.min(0.5 * Math.min(b.w, b.h), 44 + r() * 16), at = 0.1 + r() * 0.4, mx = x + (i === 2 ? -1 : 1) * R * 0.32;
        if (r() < 0.25 + 0.3 * amt && bs.some(o => o.y > y && o.y - y < 26 && mx > o.x && mx < o.x + o.w) && !webs.some(w => w.x === x && w.y === y)) web(x, y, i * Math.PI / 2, R, at, 2);
      }
      return {webs, drapes, lanes, sp: {on: false}, run: null, shake: -9, now: 0, posts: [], pp: -1};
    },
    // The larger grown webs are there for others to look at and to get caught in.
    actors(st, c) {
      if (st.pp !== c.progress) { st.pp = c.progress; st.posts.length = 0; for (const w of st.webs) if (w.R >= 38 && c.progress - w.at >= w.dur * 0.9) st.posts.push(w.post || (w.post = webPost(st, w))); }
      return st.posts;
    },
    // A finger on a web: every thread trembles, and a spider runs out from the web's corner to see what it caught,
    // waits, and walks home again.
    touch(st, x, y, c) {
      for (const w of st.webs) {
        if (!(w.q > 0.3)) continue;
        const dx = x - w.x, dy = y - w.y, A = w.rad[0], B = w.rad[w.rad.length - 1];
        if (Math.hypot(dx, dy) > A.len || Math.cos(A.a) * dx + Math.sin(A.a) * dy < -3 || Math.cos(B.a) * dx + Math.sin(B.a) * dy < -3) continue;  // not in this web's quarter
        st.shake = st.now;
        if (c.opts.spider && !(st.run && st.run.hang != null)) st.run = {w, x: st.run ? st.run.x : w.x, y: st.run ? st.run.y : w.y, tx: x, ty: y, home: false, wait: 0.9, hang: null};
        return;
      }
    },
    // a tap on a spider: it lets go and drops on a thread, then climbs back up
    tap(st, x, y, c) {
      const s = st.sp, r = st.run;
      if (r && r.hang == null && Math.hypot(x - r.x, y - r.y - 3) < 16 && !buried(c.rects, r.x, r.y)) { r.hang = st.now; return true; }
      if (s.on && Math.hypot(x - s.px, y - s.py - 3) < 16 && !buried(c.rects, s.px, s.py)) { s.drop = st.now; return true; }
    },
    draw(g, st, c, t, dt) {
      st.now = t;
      const sh = t - st.shake < 0.6 ? (1 - (t - st.shake) / 0.6) * 1.7 : 0, fall = e => 70 * U.span(e, 0, 0.3) * (1 - U.span(e, 1.2, 2.6));
      g.drawImage(still(st, c, gg => paintWebs(gg, st, c.progress)), sh ? Math.sin(t * 61) * sh : 0, sh ? Math.cos(t * 47) * sh : 0);
      const r = st.run;
      if (r && r.hang != null) {  // tapped: down on a thread from where it stood, a pause, and up again
        const e = t - r.hang, y = Math.min(c.h - 14, r.y + fall(e));
        g.strokeStyle = 'rgba(236,240,250,.6)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(r.x, y - 4); g.stroke();
        spider(g, r.x, y, e < 0.3 || e > 1.2 ? t * 7 : t * 0.9);
        if (e > 2.6) { r.hang = null; r.home = true; }
      } else if (r) {
        const tx = r.home ? r.w.x : r.tx, ty = r.home ? r.w.y : r.ty, dx = tx - r.x, dy = ty - r.y, d = Math.hypot(dx, dy), v = (r.home ? 80 : 270) * dt;
        if (d > v) { r.x += dx / d * v; r.y += dy / d * v; }
        else { r.x = tx; r.y = ty; if (r.home) st.run = null; else if ((r.wait -= dt) <= 0) r.home = true; }
        if (st.run) spider(g, r.x, r.y, d > v ? t * (r.home ? 9 : 22) : t * 0.9);
      }
      // a web that holds somebody: a small spider comes down its thread for a look, and goes back up when the web
      // lets go. Nobody came to free it in half a minute: the web lets go by itself.
      for (const w of st.webs) {
        if (w.heldAt == null) continue;
        if (w.held && t - w.heldAt > 30) w.post.free();
        const k = w.held ? U.span(t - w.heldAt, 0.5, 2.4) : Math.min(U.span(w.let - w.heldAt, 0.5, 2.4), 1 - U.span(t - w.let, 0, 1.8));
        if (!w.held && k <= 0) { w.heldAt = null; continue; }
        if (!c.opts.spider) continue;
        const x = w.hx + 11, y1 = w.hy - 9, y0 = Math.min(w.top, y1 - 26), y = y0 + (y1 - y0) * k;
        g.strokeStyle = 'rgba(236,240,250,.6)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y - 3); g.stroke();
        g.save(); g.translate(x, y); g.scale(0.7, 0.7); spider(g, 0, 0, k > 0 && k < 1 ? t * 7 : t * 0.9); g.restore();
      }
      if (!c.opts.spider || c.progress < 0.06) return;
      const s = st.sp;
      if (st.next == null) st.next = t + 1.2;
      if (!s.on && t >= st.next) {
        const l = st.lanes.length ? st.lanes[Math.floor(Math.random() * st.lanes.length)] : {x: 60 + Math.random() * (c.w - 120), len: 130};
        s.on = true; s.t = t; s.x = l.x; s.len = l.len * (0.6 + Math.random() * 0.4); s.drop = null;
      }
      if (!s.on) return;
      const e = t - s.t;
      if (e > 17) { s.on = false; st.next = t + 45 + Math.random() * 30; return; }   // about once a minute
      const k = e < 5 ? U.span(e, 0, 5) : e < 11 ? 1 : 1 - U.span(e, 11, 17), y = Math.min(c.h - 14, s.len * k + (s.drop != null ? fall(t - s.drop) : 0)), x = s.x + Math.sin(t * 1.1) * 3 * k;
      s.px = x; s.py = y;  // where a finger finds it
      g.strokeStyle = 'rgba(236,240,250,.6)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(s.x, 0); g.lineTo(x, y - 4); g.stroke();
      spider(g, x, y, e < 5 || e > 11 ? t * 7 : t * 0.9);
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Crystals: clusters of hexagonal prisms in the gaps and in the screen's bottom corners. A prism seen from the
  // side shows three long faces and three faces of its point; each gets its own tone of the one hue.
  /** The grown crystal whose shaft passes within "slack" pixels of the point, if any. */
  function crystalAt(st, c, x, y, slack) {
    let best = null, bd = slack;
    for (const k of st.list) {
      const q = U.span(c.progress, k.at, k.at + 0.35); if (q < 0.3) continue;
      const ux = Math.cos(k.a), uy = Math.sin(k.a), s = U.clamp((x - k.x) * ux + (y - k.y) * uy, 0, k.L * q), d = Math.hypot(k.x + ux * s - x, k.y + uy * s - y) - k.w / 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  const GEMS = {amethyst: [[50, 20, 104], [110, 58, 188], [174, 128, 236], [232, 212, 255]], ice: [[36, 84, 128], [92, 156, 204], [168, 218, 244], [238, 250, 255]],
    emerald: [[8, 70, 50], [22, 136, 92], [84, 206, 148], [212, 255, 230]], rose: [[118, 30, 70], [204, 84, 128], [246, 162, 188], [255, 228, 234]]};
  const GEM_TAGS = ['wonder', 'light'], FOOD = ['food'], BEE_TAGS = ['creature'], FISH_TAGS = ['creature', 'animal'];
  HP.fx.add('crystals', {
    label: 'Crystals', grows: true, days: 10, covers: true,
    options: [{key: 'colour', label: 'Colour', type: 'select', choices: [['amethyst', 'Amethyst'], ['ice', 'Ice'], ['emerald', 'Emerald'], ['rose', 'Rose']], default: 'amethyst'}, amount()],
    create(c) {
      const r = c.rand, amt = c.opts.amount, pal = GEMS[c.opts.colour] || GEMS.amethyst, list = [], seen = {};
      const add = (x, y, a, want, w, at) => {
        const L = reach(c, x, y, Math.cos(a), Math.sin(a), want), k = 0.82 + r() * 0.34;   // cut short where it would bury a button
        if (L < 10) return;
        list.push({x, y, a, L, w: Math.min(w, L * 0.55), at, tip: 0.8 + r() * 0.7, skew: (r() - 0.5) * 0.35, glint: r() < 0.1,
          col: pal.map((q, i) => rgb(q.map(v => Math.min(255, Math.round(v * k))), i === 3 ? 0.85 : 0.92))});
      };
      for (const q of c.gaps) {
        const axis = Math.abs(q.x2 - q.x1) < Math.abs(q.y2 - q.y1) ? Math.PI / 2 : 0;
        for (const e of [[q.x1, q.y1], [q.x2, q.y2]]) {
          const key = Math.round(e[0] / 16) + ':' + Math.round(e[1] / 16), roll = r();
          if (seen[key]) continue; seen[key] = 1;
          if (roll > 0.18 + 0.36 * amt + Math.max(0, amt - 0.7) * 1.5) continue;   // at the top of the slider: every corner
          const at = 0.03 + r() * 0.5;
          // a small fan from one foot, like the big ones in the corners: the middle crystal longest, leaning along the channel where there is room
          const main = axis ? (r() < 0.8 ? -Math.PI / 2 : Math.PI / 2) : (r() < 0.5 ? -0.4 : Math.PI + 0.4);
          for (let i = 0, n = 4 + Math.floor(r() * 3); i < n; i++) { const off = (i / (n - 1) - 0.5) * 1.9 + (r() - 0.5) * 0.25; add(e[0], e[1], main + off, (16 + r() * 26) * (1 + amt) * (1 - Math.abs(off) * 0.5), (7 + r() * 4.5) * (0.8 + 0.6 * amt), at + Math.abs(off) * 0.15 + r() * 0.15); }
        }
      }
      // above the middle of the slider they also stand along the tops of the buttons, up to three clumps on each
      for (const b of c.rects) if (solid(b)) for (let k = 0, m = Math.round(Math.max(0, amt - 0.6) * 7.5); k < m; k++) {
        const rr = Math.min(b.r || 0, b.w / 2), x = b.x + rr + r() * Math.max(1, b.w - 2 * rr), at = 0.1 + r() * 0.5;
        for (let i = 0, n = 3 + Math.floor(r() * 3); i < n; i++) { const off = (i / (n - 1) - 0.5) * 1.5 + (r() - 0.5) * 0.25; add(x, b.y + 1, -Math.PI / 2 + off, (14 + r() * 24) * (1 - Math.abs(off) * 0.4), 6 + r() * 5, at + Math.abs(off) * 0.15 + r() * 0.15); }
      }
      for (const side of [1, -1]) {
        const at = r() * 0.15;
        for (let i = 0, n = Math.round(5 + 14 * amt); i < n; i++) add((side > 0 ? 4 : c.w - 4) + side * r() * 14, c.h - 2, -Math.PI / 2 + side * (-0.2 + r() * 1.7), 50 + r() * 140, 12 + r() * 16, at + r() * 0.35);
      }
      list.sort((a, b) => b.L - a.L);   // tall ones behind, short ones in front
      return {list, ring: null, big: [], posts: [], pp: -1, shard: null};
    },
    // The largest few grown crystals, well apart, are there to be looked at, and a shard can be broken off one: it
    // rings, stands shorter for half a minute and grows back. Posted at the middle of the shaft, where a head reaches.
    actors(st, c) {
      if (st.pp !== c.progress) {
        st.pp = c.progress; st.posts.length = 0;
        for (const k of sparse(st.list, k => U.span(c.progress, k.at, k.at + 0.35) > 0.9, 140, 6, st.big)) st.posts.push(k.post || (k.post = {kind: 'crystal', tags: GEM_TAGS, x: k.x + Math.cos(k.a) * k.L / 2, y: k.y + Math.sin(k.a) * k.L / 2, h: k.L,
          take(by) {
            const now = Date.now(); if (k.cut) return false;
            const tx = k.x + Math.cos(k.a) * k.L, ty = k.y + Math.sin(k.a) * k.L;
            k.cut = now; st.ring = {k, at: now}; st.shard = {x: tx, y: ty, vx: by && by.x != null && by.x < tx ? 34 : -34, col: k.col[2], at: now};
            run(st, c, 1100, 110); mend(st, c, 62000); return true;
          }}));
      }
      return st.posts;
    },
    // A finger on or near a crystal rings it: its tip flashes and the flash runs out across its neighbours.
    // The tap is kept only when the finger is right on a crystal, so the tile beside it is not pressed by mistake.
    touch(st, x, y, c) { const k = crystalAt(st, c, x, y, 24); if (k) { st.ring = {k, at: Date.now()}; run(st, c, 1000, 110); } },
    tap(st, x, y, c) { const k = crystalAt(st, c, x, y, 4); if (!k || buried(c.rects, x, y)) return; st.ring = {k, at: Date.now()}; run(st, c, 1000, 110); return true; },
    draw(g, st, c) {
      const now = Date.now(), p = c.progress, ring = st.ring, re = ring ? (now - ring.at) / 1000 : 9;
      const star = (x, y, s) => { const i = s * 0.2; g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x - i, y - i); g.lineTo(x, y - s); g.lineTo(x + i, y - i); g.lineTo(x + s, y); g.lineTo(x + i, y + i); g.lineTo(x, y + s); g.lineTo(x - i, y + i); g.fill(); };
      g.lineJoin = g.lineCap = 'round'; g.lineWidth = 0.8;
      for (const k of st.list) {
        const q = U.span(p, k.at, k.at + 0.35); if (q < 0.03) continue;
        let cut = 1; if (k.cut) { const e = (now - k.cut) / 1000; if (e > 60) k.cut = 0; else cut = 0.6 + 0.4 * U.span(e, 30, 60); }   // a shard was taken: shorter, then back
        const L = k.L * q * cut, w = k.w * (0.4 + 0.6 * q), S = L - Math.min(L * 0.5, k.tip * w), ca = Math.cos(k.a), sa = Math.sin(k.a);
        const X = (u, v) => k.x + ca * u - sa * v, Y = (u, v) => k.y + sa * u + ca * v, lit = ca - sa > 0;   // which long side faces the light (upper left)
        const e = [-w / 2, -w * 0.17, w * 0.23, w / 2], ax = X(L, k.skew * w), ay = Y(L, k.skew * w), body = lit ? [1, 2, 0] : [0, 2, 1], tips = lit ? [2, 3, 1] : [1, 3, 2];
        for (let i = 0; i < 3; i++) {
          g.fillStyle = k.col[body[i]]; g.beginPath(); g.moveTo(X(0, e[i]), Y(0, e[i])); g.lineTo(X(S, e[i]), Y(S, e[i])); g.lineTo(X(S, e[i + 1]), Y(S, e[i + 1])); g.lineTo(X(0, e[i + 1]), Y(0, e[i + 1])); g.fill();
          g.fillStyle = k.col[tips[i]]; g.beginPath(); g.moveTo(X(S, e[i]), Y(S, e[i])); g.lineTo(X(S, e[i + 1]), Y(S, e[i + 1])); g.lineTo(ax, ay); g.fill();
        }
        const b = lit ? 1 : 2;   // the bright edge is the one between the front face and the lit side
        g.strokeStyle = k.col[3]; g.beginPath(); g.moveTo(X(0, e[b]), Y(0, e[b])); g.lineTo(X(S, e[b]), Y(S, e[b])); g.lineTo(ax, ay); g.stroke();
        if (k.glint && q > 0.9) star(ax, ay, 6 * (q - 0.9) * 10);   // a four-point sparkle on the tip
        if (re < 1) {   // rung: the same sparkle, passing outward at a walking pace
          const d = Math.hypot(k.x - ring.k.x, k.y - ring.k.y), e = re - d / 320;
          if (d < 230 && e > 0 && e < 0.4) star(ax, ay, (k === ring.k ? 12 : 7.5) * Math.sin(e / 0.4 * Math.PI) * (1 - d / 300));
        }
      }
      const s = st.shard, se = s ? (now - s.at) / 1000 : 9;
      if (se < 1) {   // the piece that broke off: it tumbles away and falls
        g.save(); g.translate(s.x + s.vx * se, s.y - 50 * se + 190 * se * se); g.rotate(se * 9); g.globalAlpha = 1 - se * se;
        g.fillStyle = s.col; g.strokeStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.moveTo(-5, 2); g.lineTo(0, -6); g.lineTo(4, 3); g.closePath(); g.fill(); g.stroke();
        g.restore();
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Moss: ragged velvety patches that creep over the tiles' lower edges and corners, into the gaps and up from the
  // bottom of the screen, with pale lichen and, late on, a few spore stalks. A patch is many small overlapping
  // tufts, dark ones underneath and lighter ones on top; each tuft is a stamp of a tiny picture drawn once in create().
  const MOSS = [[26, 52, 20], [36, 68, 24], [50, 90, 28], [76, 120, 36], [112, 150, 46], [160, 188, 78], [150, 170, 140], [198, 206, 172]];   // six greens from deep shade to lit tips, two lichens
  /** One tuft, 40 pixels square. Kind 0: a dark lumpy cushion with a frayed edge. 1: a fan of short leafy strokes.
   *  2: a sprinkle of lit tips. 3: a lobed lichen crust. None of them is round, so a pile of them never looks like beads. */
  function tuft(q, kind, r) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 40;
    const d = cv.getContext('2d'), tone = k => rgb(q.map(v => Math.round(U.clamp(v * k, 0, 255))), 1);
    d.lineCap = 'round';
    if (kind === 0 || kind === 3) {   // lumps of uneven size round an off-centre middle
      d.fillStyle = tone(1); d.beginPath();
      for (let i = 0, n = kind ? 7 : 9; i < n; i++) { const a = r() * TAU, e = r() * 8, R = kind ? 2.5 + r() * 3.5 : 3.5 + r() * 4.5, x = 20 + Math.cos(a) * e, y = 20 + Math.sin(a) * e * 0.8; d.moveTo(x + R, y); d.arc(x, y, R, 0, TAU); }
      d.fill();
    }
    if (kind === 3) {   // lichen: paler lobes on top and a few dark dots, the way a crust looks close up
      d.globalCompositeOperation = 'source-atop';
      d.fillStyle = tone(1.14); d.beginPath(); for (let i = 0; i < 5; i++) { const x = 12 + r() * 12, y = 11 + r() * 10; d.moveTo(x + 3, y); d.arc(x, y, 2 + r() * 2.5, 0, TAU); } d.fill();
      d.fillStyle = tone(0.62); d.beginPath(); for (let i = 0; i < 6; i++) { const x = 12 + r() * 16, y = 13 + r() * 14; d.moveTo(x + 1, y); d.arc(x, y, 0.8 + r() * 0.7, 0, TAU); } d.fill();
      return cv;
    }
    for (let i = 0, n = [26, 22, 9][kind]; i < n; i++) {
      const a = r() * TAU, e = Math.sqrt(r()) * [11, 9, 10][kind], x = 20 + Math.cos(a) * e, y = 20 + Math.sin(a) * e * 0.85;
      const b = kind ? -Math.PI / 2 + (r() - 0.5) * 2.4 : a, l = [3, 4.5, 3][kind] * (0.5 + r());   // the cushion frays outward; leaves and tips reach up
      d.strokeStyle = tone(0.78 + r() * 0.5); d.lineWidth = [3.2, 2.6, 2][kind];
      d.beginPath(); d.moveTo(x, y); d.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l); d.stroke();
    }
    return cv;
  }
  HP.fx.add('moss', {
    label: 'Moss', grows: true, days: 60, covers: true,
    options: [amount()],
    create(c) {
      const r = c.rand, amt = c.opts.amount, nz = U.noise(c.seed + 5), stamps = [], sprouts = [], seen = {};
      const put = (x, y, size, tone, at) => {
        if (x < -4 || x > c.w + 4 || y < 0 || y > c.h + 4 || buried(c.rects, x, y)) return false;
        const v = Math.floor(r() * 3) % 3;
        stamps.push({x, y, r: size, tone, sp: tone < 6 ? tone * 3 + v : 18 + (tone - 6) * 2 + v % 2, sq: 0.72 + r() * 0.5, at: U.clamp(at, 0, 0.9)}); return true;
      };
      // a clump: a dark cushion low down, leafy tufts over it, and often a few lit tips toward the light (upper left)
      const clump = (x, y, size, at) => {
        if (!put(x + 0.8, y + 1.2, size * 1.3, r() < 0.55 ? 0 : 1, at)) return;
        for (let i = 0, n = 1 + Math.floor(r() * 2); i < n; i++) put(x + (r() - 0.5) * size * 1.3, y + (r() - 0.6) * size, size * (0.7 + r() * 0.4), r() < 0.5 ? 2 : 3, at + 0.02 + r() * 0.05);
        if (r() < 0.65) put(x - size * 0.3 + (r() - 0.5) * size, y - size * 0.45, size * (0.5 + r() * 0.35), r() < 0.65 ? 4 : 5, at + 0.05 + r() * 0.06);
      };
      // up from the bottom of the screen: a bank of uneven height, thickest and earliest at the very bottom
      for (let x = 0; x < c.w; x += 10 / amt) {
        const top = 10 + 40 * (0.5 + 0.5 * nz(x / 70)) * (0.6 + 0.4 * nz(x / 17 + 30));
        for (let i = 0; i < 2; i++) { const up = r() * r() * top; clump(x + (r() - 0.5) * 12, c.h - 1 - up, 3 + r() * 4.5, 0.02 + up / 55 * 0.6 + r() * 0.12); }
      }
      // over each tile's lower edge and a little way up its sides, in patches of uneven depth; the lower corners hold
      // the damp and get the most. Lower tiles get more, and get it sooner.
      c.rects.forEach((b, n) => {
        if (!solid(b)) return;
        const low = (b.y + b.h) / c.h, wgt = amt * (0.2 + 0.8 * low * low), base = 0.55 * (1 - low), cr = creep(b), bot = b.y + b.h;
        rim(b, 7).forEach((q, i) => {
          const corner = q.ny > 0 ? Math.min(1, Math.abs(q.nx * q.ny) * 2.4) : 0, patch = 0.5 + 0.5 * nz(i * 0.105 + n * 9.7), fine = 0.5 + 0.5 * nz(i * 0.55 + n * 3.1);
          const up = (bot - q.y) / b.h, want = q.ny > 0.3 ? 1 : q.ny > -0.3 && up < 0.55 ? 1 - up * 1.8 : 0;
          const dens = U.clamp((patch - 0.72 + 0.7 * wgt + 0.35 * corner) * 3.5, 0, 1) * want;   // moss comes in patches: thick here, none there
          if (dens <= 0) return;
          for (let j = 0; j < 2; j++) if (r() < dens * (0.5 + 0.5 * fine)) {
            const o = 5 - r() * (5 + cr * dens * fine), s = (r() - 0.5) * 9;   // from just outside the edge to as far in as this patch is thick
            clump(q.x + q.nx * o - q.ny * s, q.y + q.ny * o + q.nx * s, 2.6 + 3.8 * dens * (0.4 + 0.6 * fine) + r() * 1.2, base + (1 - dens) * 0.25 + up * 0.4 + r() * 0.15);
          }
        });
      });
      for (const q of c.gaps) {
        const len = Math.hypot(q.x2 - q.x1, q.y2 - q.y1);
        for (let d = 0; d < len; d += 7) { const x = U.lerp(q.x1, q.x2, d / len), y = U.lerp(q.y1, q.y2, d / len), low = y / c.h, dens = U.clamp((0.5 + 0.5 * nz(d * 0.025 + q.x1 + q.y1) - 0.8 + 0.5 * amt * (0.15 + 0.85 * low * low)) * 4, 0, 1); if (r() < dens * 0.7) clump(x + (r() - 0.5) * 9, y + (r() - 0.5) * 9, 2.5 + r() * 3, 0.2 + 0.55 * (1 - low) + r() * 0.25); }
        // where channels meet, a thicker knot of it
        for (const e of [[q.x1, q.y1], [q.x2, q.y2]]) {
          const key = Math.round(e[0] / 14) + ':' + Math.round(e[1] / 14), low = e[1] / c.h; if (seen[key]) continue; seen[key] = 1;
          if (r() < amt * (0.15 + 0.85 * low * low)) for (let i = 0, m = 3 + Math.floor(r() * 4); i < m; i++) clump(e[0] + (r() - 0.5) * 20, e[1] + (r() - 0.5) * 20, 3 + r() * 3.5, 0.15 + 0.5 * (1 - low) + r() * 0.25);
        }
      }
      const bs = c.rects.filter(solid);
      if (bs.length) for (let i = 0, n = Math.round(16 * amt); i < n; i++) {   // lichen: pale flat crusts, on any edge, late
        const b = pick(r, bs), q = pick(r, rim(b, 6)), at = 0.45 + r() * 0.4, cr = creep(b);
        for (let j = 0, m = 6 + Math.floor(r() * 6); j < m; j++) { const o = 3 - r() * (3 + cr * 0.8), s = (r() - 0.5) * 22; put(q.x + q.nx * o - q.ny * s, q.y + q.ny * o + q.nx * s, 3.2 + r() * 3, 6 + Math.floor(r() * 2), at + r() * 0.12); }
      }
      const green = stamps.filter(s => s.tone < 2);
      for (let i = 0, n = Math.round(18 * amt); i < n && green.length; i++) { const s = pick(r, green); sprouts.push({x: s.x, y: s.y - 1, h: 6 + r() * 8, lean: (r() - 0.5) * 0.9, at: U.clamp(s.at + 0.3, 0.7, 0.86) + r() * 0.04}); }
      stamps.sort((a, b) => a.tone - b.tone);   // dark underneath, light on top
      const sr = U.rng(c.seed + 77), dots = [];
      MOSS.forEach((q, i) => { for (let v = 0, n = i < 6 ? 3 : 2; v < n; v++) dots.push(tuft(q, i < 2 ? 0 : i < 4 ? 1 : i < 6 ? 2 : 3, sr)); });
      return {stamps, sprouts, dots, puff: null, bites: [], posts: [], pp: -1};
    },
    // A few thick cushions, well apart, are there to be eaten: a bite leaves the patch thin, and it grows back in a minute.
    actors(st, c) {
      if (st.pp !== c.progress) {
        st.pp = c.progress; st.posts.length = 0;
        for (const s of sparse(st.stamps, s => s.tone < 2 && s.r > 6 && c.progress > s.at + 0.1, 180, 8, st.bites)) st.posts.push(s.post || (s.post = {kind: 'moss', tags: FOOD, x: s.x, y: s.y, h: s.r * 2,
          take() {
            const now = Date.now(); if (s.bit) return false;
            for (const o of st.stamps) if (Math.abs(o.x - s.x) < 15 && Math.abs(o.y - s.y) < 15) o.bit = now;
            st.puff = {x: s.x, y: s.y, at: now, bug: 0}; run(st, c, 1500, 140); mend(st, c, 62000); return true;
          }}));
      }
      return st.posts;
    },
    // Pressed, a cushion of moss lets go a few spores that drift up; sometimes a small beetle that was under it runs off.
    touch(st, x, y, c) {
      for (const s of st.stamps) if (Math.abs(s.x - x) < 16 && Math.abs(s.y - y) < 16 && c.progress > s.at + 0.05) {
        st.puff = {x: s.x, y: s.y, at: Date.now(), bug: Math.random() < 0.4 ? (s.x < c.w / 2 ? 1 : -1) : 0};
        run(st, c, 1500, 140); return;
      }
    },
    draw(g, st, c) {
      const now = Date.now(), p = c.progress, f = st.puff, e = f ? (now - f.at) / 1000 : 9;
      for (const s of st.stamps) {
        let k = U.span(p, s.at, s.at + 0.1); if (k < 0.05) continue;
        if (s.bit) { const b = (now - s.bit) / 1000; if (b > 60) s.bit = 0; else k *= 0.25 + 0.75 * U.span(b, 15, 60); }   // nibbled: small, then back
        const R = s.r * (0.35 + 0.65 * k) * 1.5; g.drawImage(st.dots[s.sp], s.x - R, s.y - R * s.sq, 2 * R, 2 * R * s.sq);
      }
      // spore stalks: a hair-thin stem with a small capsule nodding at the top
      g.lineCap = 'round'; g.lineWidth = 0.8; g.strokeStyle = '#a9743a'; g.fillStyle = '#d6a052';
      for (const s of st.sprouts) {
        const k = U.span(p, s.at, s.at + 0.1); if (k < 0.05) continue;
        const h = s.h * k, tx = s.x + s.lean * h, ty = s.y - h;
        g.beginPath(); g.moveTo(s.x, s.y); g.quadraticCurveTo(s.x, s.y - h * 0.7, tx, ty); g.stroke();
        g.beginPath(); g.ellipse(tx + s.lean * 1.2, ty, 1.9 * k, 0.9 * k, s.lean, 0, TAU); g.fill();
      }
      if (e < 1.5) {
        g.fillStyle = 'rgba(236,230,150,' + (0.9 * (1 - e / 1.5)).toFixed(3) + ')'; g.beginPath();
        for (let i = 0; i < 6; i++) { const x = f.x + (i - 2.5) * 3 + Math.sin(i * 2.4 + e * 3) * (4 + 9 * e), y = f.y - 4 - e * (14 + i * 5); g.moveTo(x + 1.3, y); g.arc(x, y, 1.3, 0, TAU); }
        g.fill();
        if (f.bug && e < 1.2) {   // the beetle: a dark bean on six quick legs, gone again in a second
          const x = f.x + f.bug * 64 * e, y = f.y + 1, a = Math.min(1, (1.2 - e) * 4);
          g.strokeStyle = 'rgba(20,14,10,' + a + ')'; g.lineWidth = 0.8; g.beginPath();
          for (let i = -1; i <= 1; i++) { const sw = Math.sin(e * 40 + i * 2) * 1.2; g.moveTo(x + i * 2.2 + sw, y - 3.4); g.lineTo(x + i * 2.2 - sw, y + 3.4); }
          g.stroke();
          g.fillStyle = 'rgba(28,20,14,' + a + ')'; g.beginPath(); g.ellipse(x, y, 3.6, 2.2, 0, 0, TAU); g.fill();
          g.fillStyle = 'rgba(150,190,120,' + (a * 0.7) + ')'; g.fillRect(x - 1.8, y - 1.4, 2.2, 0.9);   // a glint on its back
        }
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Honeycomb: wax cells fill the gaps one at a time, spreading from a few starting points; later about half of
  // them fill with honey and the oldest get a wax cap. A few bees go from cell to cell.
  const HX = [], HY = []; for (let i = 0; i < 6; i++) { HX.push(Math.cos(i * TAU / 6)); HY.push(Math.sin(i * TAU / 6)); }
  function paintComb(g, st, p) {
    const hex = (x, y, R) => { g.moveTo(x + R, y); for (let i = 1; i < 6; i++) g.lineTo(x + HX[i] * R, y + HY[i] * R); g.closePath(); };
    const grown = st.grown = st.cells.filter(k => k.at <= p), now = Date.now();
    // a cell whose honey was taken: empty for a few seconds, then it fills again (0 empty to 1 full)
    const left = k => { if (!k.took) return 1; const e = (now - k.took) / 1000; if (e > 45) { k.took = 0; return 1; } return U.span(e, 8, 45); };
    const fill = (col, test, R) => { g.fillStyle = col; g.beginPath(); for (const k of grown) if (test(k)) hex(k.x, k.y, R(k)); g.fill(); };
    const level = k => 7.9 * (0.45 + 0.55 * U.span(p, k.honey, k.honey + 0.04)) * left(k);   // a cell fills from its middle outward
    fill('rgba(78,40,8,.62)', () => true, () => 9);                                 // the dark inside of an empty cell
    fill('#d9820c', k => k.honey <= p && k.tone < 0.5, level);
    fill('#f0a31c', k => k.honey <= p && k.tone >= 0.5, level);
    fill('#f2d58c', k => k.cap && k.honey + 0.2 <= p && !k.took, () => 7.9);
    g.lineJoin = 'round';
    g.strokeStyle = '#8f560e'; g.lineWidth = 3.2; g.beginPath(); for (const k of grown) hex(k.x, k.y, 9); g.stroke();   // walls: a dark base
    g.strokeStyle = '#f2c050'; g.lineWidth = 1.4; g.beginPath(); for (const k of grown) hex(k.x, k.y, 9); g.stroke();   // and a bright wax top
    g.fillStyle = 'rgba(255,247,210,.78)'; g.beginPath();
    for (const k of grown) if (k.honey + 0.03 <= p && !k.took && !(k.cap && k.honey + 0.2 <= p)) { g.moveTo(k.x - 1.1, k.y - 2.8); g.arc(k.x - 2.6, k.y - 2.8, 1.5, 0, TAU); }
    g.fill();
    // a few full cells, well apart, are there to be robbed
    st.posts.length = 0;
    for (const k of sparse(grown, k => k.honey + 0.05 <= p && !k.took, 170, 8, st.full)) st.posts.push(k.post || (k.post = {kind: 'honey', tags: FOOD, x: k.x, y: k.y, h: 16, take: by => st.rob(k, by)}));
  }
  function bee(g, x, y, a, fly, t) {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = fly && Math.sin(t * 40) > 0 ? 'rgba(235,244,255,.28)' : 'rgba(235,244,255,.6)';   // wings blur while flying
    g.beginPath(); g.ellipse(-0.5, -3.6, 4, 2, -0.5, 0, TAU); g.fill(); g.beginPath(); g.ellipse(-0.5, 3.6, 4, 2, 0.5, 0, TAU); g.fill();
    g.fillStyle = '#f6bd22'; g.beginPath(); g.ellipse(-0.5, 0, 5, 3, 0, 0, TAU); g.fill();
    g.strokeStyle = '#2a1904'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-2.6, -2.3); g.lineTo(-2.6, 2.3); g.moveTo(0.2, -2.8); g.lineTo(0.2, 2.8); g.stroke();
    g.fillStyle = '#2a1904'; g.beginPath(); g.arc(4.4, 0, 2.1, 0, TAU); g.fill();
    g.restore();
  }
  HP.fx.add('honeycomb', {
    label: 'Honeycomb', grows: true, days: 7, live: true, fps: 12, covers: true,
    options: [amount(), {key: 'bees', label: 'Bees', type: 'bool', default: true}],
    create(c) {
      const r = c.rand, amt = c.opts.amount, R = 9, dx = R * 1.5, dy = R * Math.sqrt(3), band = 7 + 11 * amt, cells = [], bees = [], gaps = c.gaps, org = [];
      if (!gaps.length) return {cells, bees, grown: [], posts: [], full: []};
      for (let i = 0; i < 3; i++) { const q = pick(r, gaps), f = r(); org.push([U.lerp(q.x1, q.x2, f), U.lerp(q.y1, q.y2, f)]); }   // where the colony starts building
      const off = (q, x, y) => { const vx = q.x2 - q.x1, vy = q.y2 - q.y1, t = U.clamp(((x - q.x1) * vx + (y - q.y1) * vy) / (vx * vx + vy * vy || 1), 0, 1); return Math.hypot(x - q.x1 - vx * t, y - q.y1 - vy * t); };
      let far = 1;
      // one honeycomb lattice over the whole screen; keep the cells that lie in or beside a gap
      for (let i = 0; i * dx < c.w + R; i++) for (let j = 0; j * dy < c.h + dy; j++) {
        const x = i * dx, y = j * dy + (i & 1 ? dy / 2 : 0), ragged = 0.65 + 0.35 * r(); let d = 1e9, od = 1e9;
        for (const q of gaps) d = Math.min(d, off(q, x, y));
        if (d > band * ragged || buried(c.rects, x, y)) continue;
        for (const o of org) od = Math.min(od, Math.hypot(x - o[0], y - o[1]));
        far = Math.max(far, od); cells.push({x, y, od, j: r(), h: r(), tone: r()});
      }
      for (const k of cells) { k.at = 0.01 + 0.72 * Math.pow(k.od / far, 0.85) + k.j * 0.05; k.honey = k.h < 0.55 ? k.at + 0.1 + k.h * 0.45 : 9; k.cap = k.h < 0.12; }
      for (let i = 0, n = Math.round(2 + 4 * amt); i < n; i++) bees.push({x: null, y: 0, tx: 0, ty: 0, a: 0, wait: 0, ph: r() * TAU, post: {kind: 'bee', tags: BEE_TAGS, x: 0, y: 0, h: 8}});
      const st = {cells, bees, grown: [], px: 0, py: 0, posts: [], full: [], foe: null, stung: false, dry: 0, rp: 0};
      // Honey is taken from a cell: it is empty at once. The bees go for the thief for a few seconds; the first to
      // reach it frightens it off, if it can be frightened.
      st.rob = (k, by) => {
        if (k.took) return false;
        k.took = Date.now(); st.dry = k.took + 46000; st.cp = -1;
        if (by && by.x != null) { st.foe = by; st.stung = false; for (const b of bees) if (b.x != null) b.nosy = 4 + Math.random() * 2; }
        return true;
      };
      return st;
    },
    actors(st) { return st.posts; },
    // the bees within reach come to see what touched the comb: they circle the spot for a few seconds and go back to work
    touch(st, x, y) {
      st.px = x; st.py = y; st.foe = null;
      for (const b of st.bees) if (b.x != null && Math.hypot(b.x - x, b.y - y) < 420) b.nosy = 3 + Math.random() * 1.5;
    },
    draw(g, st, c, t, dt) {
      if (st.dry && t - st.rp > 1.5) { st.rp = t; st.cp = -1; if (Date.now() > st.dry) st.dry = 0; }   // a robbed cell is filling: paint the comb again now and then
      g.drawImage(still(st, c, gg => paintComb(gg, st, c.progress)), 0, 0);
      const cells = st.grown, foe = st.foe;
      if (!c.opts.bees || !cells.length) return;
      if (foe) { st.px = foe.x; st.py = foe.y - (foe.h || 0) / 2; }   // the thief may walk off: they follow
      // a bee prefers a cell not too far off, so it works its way along the comb instead of crossing the whole screen
      const next = b => { let best = null, bd = 1e9; for (let i = 0; i < 4; i++) { const k = cells[Math.floor(Math.random() * cells.length)], d = Math.hypot(k.x - b.x, k.y - b.y); if (d > 25 && d < bd) { bd = d; best = k; } } return best || cells[0]; };
      for (let i = 0, n = Math.min(st.bees.length, Math.ceil(cells.length / 10)); i < n; i++) {
        const b = st.bees[i]; let fly = 0;
        if (b.x == null) { const k = cells[Math.floor(Math.random() * cells.length)]; b.x = b.tx = k.x; b.y = b.ty = k.y; b.wait = Math.random() * 1.5; }
        if (b.nosy > 0) {
          const a = t * 3.2 + b.ph, dx = st.px + Math.cos(a) * 24 - b.x, dy = st.py + Math.sin(a) * 24 - b.y, d = Math.hypot(dx, dy) || 1, v = Math.min(d, (foe ? 190 : 130) * dt);
          b.x += dx / d * v; b.y += dy / d * v; b.a = Math.atan2(dy, dx); fly = 1;
          if (foe && !st.stung && d < 30) { st.stung = true; U.act(foe, 'scare', b.post); }
          if ((b.nosy -= dt) <= 0) { b.wait = 0.01; st.foe = null; }   // then on to a cell near by, as usual
        }
        else if (b.wait > 0) { b.wait -= dt; if (b.wait <= 0) { const k = next(b); b.tx = k.x; b.ty = k.y; } }
        else {
          const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
          if (d < 3) b.wait = 1 + Math.random() * 3;
          else { const v = Math.min(d, 60 * dt); b.x += dx / d * v; b.y += dy / d * v; b.a = Math.atan2(dy, dx); fly = Math.min(1, d / 20); }
        }
        b.post.x = b.x; b.post.y = b.y; c.scene.next.push(b.post);
        const wob = Math.sin(t * 6 + b.ph) * 5 * fly;
        bee(g, b.x - Math.sin(b.a) * wob, b.y + Math.cos(b.a) * wob, b.a + Math.cos(t * 6 + b.ph) * 0.3 * fly, fly, t);
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Coral reef: branching, fan and brain coral on the top edges of the lower buttons and along the bottom of the
  // screen, each only as tall as the room above it allows. Small fish swim along the gaps and dart from a finger.
  const REEF = [['#f0607c', '#b23a58', '#ffc4cc'], ['#ff9448', '#c9601e', '#ffdcae'], ['#9c70e8', '#6744b4', '#dcc8ff']];   // coral pink, orange, violet: main, shade, light
  const FISH = ['#ffd43a', '#3db8ff', '#ff7b2c', '#ff62ae', '#34e2c6'];
  const WEED = ['#1f8f6c', '#3fb27a', '#167a80'];   // sea grass: two greens and a teal
  function paintReef(g, st, p, c) {
    g.lineCap = g.lineJoin = 'round';
    // the sea bed: a low bank of pale sand with a rippled top, along the bottom of the screen
    const sand = 13 * U.span(p, 0, 0.25);
    if (sand > 1) {
      g.fillStyle = 'rgba(232,212,164,.9)'; g.beginPath(); g.moveTo(0, c.h);
      for (let x = 0; x <= c.w + 16; x += 16) g.lineTo(x, c.h - sand * (0.55 + 0.45 * Math.sin(x * 0.021 + st.ph) * Math.sin(x * 0.0057 + 1)));
      g.lineTo(c.w, c.h); g.fill();
      g.fillStyle = 'rgba(176,150,104,.7)'; g.beginPath(); for (const d of st.grit) { g.moveTo(d[0] + 1, c.h - d[1]); g.arc(d[0], c.h - d[1], 0.8, 0, TAU); } g.fill();
    }
    for (const k of st.corals) {
      if (k.ribs) continue;   // the fans sway: they are drawn every frame
      const q = U.span(p, k.at, k.at + 0.35); if (q < 0.04) continue;
      g.save(); g.translate(k.x, k.y); g.scale(0.2 + 0.8 * q, 0.2 + 0.8 * q);   // each one swells up from its foot
      if (k.segs) {
        const lines = (s, dx) => { g.beginPath(); for (let i = 0; i < s.length; i += 4) { g.moveTo(s[i] + dx, s[i + 1]); g.lineTo(s[i + 2] + dx, s[i + 3]); } g.stroke(); };
        g.strokeStyle = k.col[0]; k.segs.forEach((s, d) => { if (s.length) { g.lineWidth = [4.2, 3.1, 2.2, 1.6][d] * k.wd; lines(s, 0); } });
        g.strokeStyle = k.col[2]; g.globalAlpha = 0.5; g.lineWidth = 0.9; lines(k.segs[0], -0.9); lines(k.segs[1], -0.7); g.globalAlpha = 1;   // a lit side on the thick stems
      } else {
        g.fillStyle = k.col[0]; g.beginPath(); g.ellipse(0, 0, k.rw, k.rh, 0, Math.PI, TAU); g.fill();
        g.strokeStyle = k.col[1]; g.lineWidth = 1.2; g.beginPath();   // the wandering grooves
        for (let j = 1; j <= 3; j++) for (let i = 0; i <= 14; i++) { const th = Math.PI + Math.PI * i / 14, s = j / 3.6 + 0.07 * Math.sin(th * 7 + k.ph + j * 2), x = Math.cos(th) * k.rw * s, y = Math.sin(th) * k.rh * s; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke();
        g.strokeStyle = k.col[2]; g.globalAlpha = 0.6; g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, 0, k.rw * 0.9, k.rh * 0.9, 0, Math.PI * 1.15, Math.PI * 1.5); g.stroke(); g.globalAlpha = 1;
      }
      g.restore();
    }
    // a starfish or two lying over a tile's top edge: five blunt arms, a paler ridge along each
    for (const s of st.stars) {
      const q = U.span(p, s.at, s.at + 0.2); if (q < 0.05) continue;
      g.save(); g.translate(s.x, s.y); g.rotate(s.rot); g.scale(q, q);
      g.fillStyle = s.col[0]; g.strokeStyle = s.col[0]; g.lineWidth = 3.4; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = i * TAU / 10 - Math.PI / 2, R = i % 2 ? s.R * 0.4 : s.R; if (i) g.lineTo(Math.cos(a) * R, Math.sin(a) * R); else g.moveTo(Math.cos(a) * R, Math.sin(a) * R); }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = s.col[2]; g.beginPath();
      for (let i = 0; i < 5; i++) for (let j = 1; j <= 3; j++) { const a = i * TAU / 5 - Math.PI / 2, d = s.R * j * 0.27; g.moveTo(Math.cos(a) * d + 1, Math.sin(a) * d); g.arc(Math.cos(a) * d, Math.sin(a) * d, 1.15 - j * 0.15, 0, TAU); }
      g.fill();
      g.restore();
    }
  }
  /** One sea fan, swaying on its foot: the net of ribs and cross threads, with a faint web of colour behind. */
  function fan(g, k, q, lean) {
    const R = k.ribs, n = R.length, s = 0.2 + 0.8 * q;
    g.save(); g.translate(k.x, k.y); g.rotate(lean); g.scale(s, s);
    g.fillStyle = k.col[0]; g.globalAlpha = 0.3; g.beginPath(); g.moveTo(0, 0); for (let i = 0; i < n; i++) g.lineTo(R[i].ex, R[i].ey); g.fill(); g.globalAlpha = 1;
    g.strokeStyle = k.col[0]; g.lineWidth = 1.2; g.beginPath();
    for (let i = 0; i < n; i++) { g.moveTo(0, 0); g.lineTo(R[i].ex, R[i].ey); }
    for (let j = 0; j < 4; j++) { const f = 0.38 + j * 0.2; for (let i = 0; i < n; i++) { if (i) g.lineTo(R[i].ex * f, R[i].ey * f); else g.moveTo(R[i].ex * f, R[i].ey * f); } }   // the fan's net
    g.stroke();
    g.strokeStyle = k.col[1]; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 2); g.lineTo(0, -R[0].len * 0.14); g.stroke();
    g.restore();
  }
  /** The fish of a school within reach of the point dart away from it. */
  function flee(s, x, y, reach) {
    for (const f of s.fish) { const dx = f.px - x, dy = f.py - y, d = Math.hypot(dx, dy) || 1; if (d < reach) { const k = 120 + 260 * (1 - d / reach); f.vx += dx / d * k; f.vy += dy / d * k; } }
  }
  HP.fx.add('coral', {
    label: 'Coral reef', grows: true, days: 14, live: true, fps: 12, covers: true,
    options: [amount(), {key: 'fish', label: 'Fish', type: 'bool', default: true}, {key: 'light', label: 'Sunlight', type: 'bool', default: true}, {key: 'water', label: 'Water tint', type: 'bool', default: true}],
    create(c) {
      const r = c.rand, amt = c.opts.amount, corals = [], lanes = [], schools = [];
      const plant = (x, y) => {
        const room = reach(c, x, y - 2, 0, -1, 80), kind = r(), k = {x, y, col: REEF[Math.floor(r() * 3) % 3], at: U.clamp((c.h - y) / (c.h * 0.6), 0, 1) * 0.5 + r() * 0.15};   // the lowest grow first
        if (room < 10) return;
        if (kind < 0.42) {
          const H = Math.min(room, 20 + r() * 30), segs = [[], [], [], []];
          const grow = (x, y, a, len, d) => {
            const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len; segs[d].push(x, y, ex, ey);
            if (d === 3 || len < 3.5) return;
            for (let i = 0, n = d < 2 && r() < 0.45 ? 3 : 2; i < n; i++) grow(ex, ey, U.clamp(a + (i - (n - 1) / 2) * (0.75 + r() * 0.3) + (r() - 0.5) * 0.3, -2.7, -0.45), len * (0.6 + r() * 0.2), d + 1);
          };
          grow(0, 0, -Math.PI / 2 + (r() - 0.5) * 0.3, H * 0.4, 0); k.segs = segs; k.wd = U.clamp(H / 34, 0.7, 1.25);
        } else if (kind < 0.74) {
          const H = Math.min(room, 22 + r() * 26), n = 7 + Math.floor(r() * 3), spread = 1.6 + r() * 0.6; k.ribs = [];
          for (let i = 0; i < n; i++) { const f = i / (n - 1), a = -Math.PI / 2 + (f - 0.5) * spread, len = H * (0.7 + 0.3 * Math.sin(Math.PI * f)) * (0.9 + r() * 0.12); k.ribs.push({a, len, ex: Math.cos(a) * len, ey: Math.sin(a) * len}); }
          k.ph = k.x * 0.37;   // its own beat, without another roll of the seed (the reef stays as it was)
        } else { k.rw = 9 + r() * 10; k.rh = Math.min(room, k.rw * (0.7 + r() * 0.25)); k.ph = r() * 6; }
        corals.push(k);
      };
      for (const b of c.rects) if (solid(b) && b.y > c.h * 0.4) { const rr = Math.min(b.r || 0, b.w / 2); for (let i = 0, n = Math.round(b.w / 36 * amt * (0.6 + r() * 0.8)); i < n; i++) plant(b.x + rr * 0.7 + r() * (b.w - rr * 1.4), b.y + 3); }
      for (let x = 8 + r() * 20; x < c.w - 8; x += (16 + r() * 22) / amt) plant(x, c.h - 1);
      // fish keep to the level channels between rows of buttons, and to the strip along the bottom
      for (const q of c.gaps) if (Math.abs(q.y1 - q.y2) < 1 && lanes.indexOf(Math.round(q.y1)) < 0) lanes.push(Math.round(q.y1));
      lanes.push(c.h - 10);
      for (let i = 0; i < 3; i++) {
        const dir = r() < 0.5 ? 1 : -1, s = {x: r() * c.w, y: pick(r, lanes), dir, sp: 22 + r() * 16, col: FISH[(i * 2 + corals.length) % FISH.length], fish: []};
        for (let j = 0, n = 3 + Math.floor(r() * 3); j < n; j++) s.fish.push({ox: -dir * j * (13 + r() * 9), oy: (r() - 0.5) * 9, ph: r() * 6, s: 1.05 + r() * 0.45, dx: 0, dy: 0, vx: 0, vy: 0, px: -999, py: -999});
        schools.push(s);
      }
      // A few anemones on the sea bed. They wave, so they are drawn every frame and not on the still sheet; a finger
      // near one makes it pull its arms in. Made last, so the corals and fish above stay as the seed had them before.
      const nems = [];
      for (let i = 0, n = Math.round(2 + 3 * amt); i < n; i++) {
        const x = 24 + r() * (c.w - 48), room = reach(c, x, c.h - 3, 0, -1, 30), a = {x, y: c.h - 1, len: Math.min(room, 15 + r() * 9), col: REEF[Math.floor(r() * 3) % 3], ph: r() * 6, n: 6 + Math.floor(r() * 3), at: 0.2 + r() * 0.3, shy: 0};
        if (room >= 12) nems.push(a);
      }
      // What says "under water", made after everything above so that stays as it was: sea grass that sways, more
      // anemones on the tiles, a starfish or two, grit in the sand, and bubbles that rise now and then.
      const weeds = [], stars = [], grit = [], bubbles = [], tops = c.rects.filter(b => solid(b) && b.y > c.h * 0.3);
      const grass = (x, y, max) => {
        const room = reach(c, x, y - 2, 0, -1, max); if (room < 16) return;
        for (let i = 0, n = 3 + Math.floor(r() * 3); i < n; i++) weeds.push({x: x + (i - (n - 1) / 2) * 3.5, y, len: room * (0.5 + r() * 0.5), wd: 2 + r() * 1.6, lean: (r() - 0.5) * 0.3, ph: r() * 6, col: Math.floor(r() * 3) % 3, at: U.clamp((c.h - y) / c.h, 0, 1) * 0.4 + r() * 0.2});
      };
      for (let x = 20 + r() * 40; x < c.w - 20; x += (70 + r() * 90) / amt) grass(x, c.h - 1, 110);
      for (const b of tops) {
        const rr = Math.min(b.r || 0, b.w / 2), on = () => b.x + rr + r() * Math.max(1, b.w - 2 * rr);
        if (r() < 0.55 * amt) grass(on(), b.y + 3, 60);
        if (r() < 0.3 * amt) { const x = on(), room = reach(c, x, b.y, 0, -1, 30); if (room >= 12) nems.push({x, y: b.y + 3, len: Math.min(room, 13 + r() * 8), col: REEF[Math.floor(r() * 3) % 3], ph: r() * 6, n: 6 + Math.floor(r() * 3), at: 0.2 + r() * 0.3, shy: 0}); }
      }
      for (let i = 0; i < 2 && tops.length; i++) { const b = pick(r, tops), rr = Math.min(b.r || 0, b.w / 2); stars.push({x: b.x + rr + r() * Math.max(1, b.w - 2 * rr), y: b.y + 1, R: 11 + r() * 4, rot: (r() - 0.5) * 1.2, col: REEF[i], at: 0.3 + r() * 0.3}); }
      for (let i = 0; i < 60; i++) grit.push([r() * c.w, 1 + r() * 5]);
      for (let i = 0; i < 14; i++) bubbles.push({x: 0, y: -9, r: 2, ph: 0, v: 0});
      for (const s of schools) {
        s.post = {kind: 'fish', tags: FISH_TAGS, x: s.x, y: s.y, h: 12, dir: s.dir, hid: true, scare: by => { if (!by || by.x == null) return false; flee(s, by.x, by.y, 260); return true; }};
      }
      return {corals, lanes, schools, nems, weeds, stars, grit, bubbles, ph: r() * 6, nb: 0};
    },
    // a finger sends the nearby fish darting away; they drift back to their group afterwards
    touch(st, x, y) {
      for (const a of st.nems) if (Math.hypot(a.x - x, a.y - a.len / 2 - y) < 80) a.shy = 1;
      for (const s of st.schools) flee(s, x, y, 150);
    },
    draw(g, st, c, t, dt) {
      if (c.opts.light !== false && !c.env.night) HP.fx.rays(g, c.w, c.h, t);
      const p = c.progress;
      if (c.opts.water !== false) {   // the blue of deep water over everything, thicker toward the sea bed
        if (st.tg !== g) { st.tg = g; st.tint = g.createLinearGradient(0, 0, 0, c.h); st.tint.addColorStop(0, 'rgba(0,96,150,.05)'); st.tint.addColorStop(1, 'rgba(0,70,130,.24)'); }
        g.fillStyle = st.tint; g.fillRect(0, 0, c.w, c.h);
      }
      // sea grass behind the reef: each blade a thin leaf that bends with the swell, more toward its tip
      for (let k = 0; k < 3; k++) {
        g.fillStyle = WEED[k]; g.beginPath();
        for (const w of st.weeds) {
          if (w.col !== k) continue;
          const q = U.span(p, w.at, w.at + 0.3); if (q < 0.05) continue;
          const L = w.len * q, sw = Math.sin(t * 0.9 + w.ph + w.x * 0.012) + 0.35 * Math.sin(t * 2.1 + w.ph * 2), tx = w.x + (w.lean + sw * 0.22) * L, ty = w.y - L, mx = w.x + (w.lean * 0.3 + sw * 0.05) * L, my = w.y - L * 0.55;
          g.moveTo(w.x - w.wd, w.y); g.quadraticCurveTo(mx - w.wd, my, tx, ty); g.quadraticCurveTo(mx + w.wd, my, w.x + w.wd, w.y);
        }
        g.fill();
      }
      g.drawImage(still(st, c, gg => paintReef(gg, st, c.progress, c)), 0, 0);
      for (const k of st.corals) if (k.ribs) { const q = U.span(p, k.at, k.at + 0.35); if (q >= 0.04) fan(g, k, q, Math.sin(t * 0.9 + k.ph + k.x * 0.012) * 0.09); }
      g.lineCap = 'round';
      for (const a of st.nems) {
        const q = U.span(c.progress, a.at, a.at + 0.3); if (q < 0.05) continue;
        a.shy = Math.max(0, a.shy - dt * 0.25);   // four seconds to come all the way out again
        const open = 1 - 0.78 * U.span(a.shy, 0, 0.7), L = a.len * q * open, tips = [];
        g.strokeStyle = a.col[0]; g.lineWidth = 2.3; g.beginPath();
        for (let i = 0; i < a.n; i++) {
          const f = i / (a.n - 1) - 0.5, ex = a.x + f * a.len * 1.5 * q * open + Math.sin(t * 1.4 + a.ph + i * 0.8) * 3 * open, ey = a.y - L * (1 - f * f * 0.9);
          g.moveTo(a.x + f * 6, a.y - 2); g.quadraticCurveTo(a.x + f * 7, a.y - L * 0.65, ex, ey); tips.push(ex, ey);
        }
        g.stroke();
        g.fillStyle = a.col[2]; g.beginPath(); for (let i = 0; i < tips.length; i += 2) { g.moveTo(tips[i] + 1.6, tips[i + 1]); g.arc(tips[i], tips[i + 1], 1.6, 0, TAU); } g.fill();
        g.fillStyle = a.col[1]; g.beginPath(); g.ellipse(a.x, a.y - 1, 5.5 * q, (3 + 3 * (1 - open)) * q, 0, 0, TAU); g.fill();   // the foot, fatter when it has pulled in
      }
      // bubbles: every few seconds a short string of them leaves a coral and wobbles up to the surface
      if (t >= st.nb && st.corals.length && p > 0.1) {
        const k = st.corals[Math.floor(Math.random() * st.corals.length)]; let n = 3 + Math.floor(Math.random() * 3), i = 0;
        for (const b of st.bubbles) if (b.y < -8 && n > 0) { b.x = k.x + (Math.random() - 0.5) * 6; b.y = k.y - 12 + i * 9; b.r = 1.8 + Math.random() * 2.6; b.ph = Math.random() * 6; b.v = 30 + Math.random() * 14; n--; i++; }
        st.nb = t + 2.5 + Math.random() * 5;
      }
      g.strokeStyle = 'rgba(232,250,255,.8)'; g.lineWidth = 1; g.beginPath();
      for (const b of st.bubbles) if (b.y >= -8) { b.y -= b.v * dt; const x = b.x + Math.sin(t * 3 + b.ph) * 2.5; g.moveTo(x + b.r, b.y); g.arc(x, b.y, b.r, 0, TAU); }
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath();
      for (const b of st.bubbles) if (b.y >= -8) { const x = b.x + Math.sin(t * 3 + b.ph) * 2.5 - b.r * 0.35; g.moveTo(x + 0.6, b.y - b.r * 0.35); g.arc(x, b.y - b.r * 0.35, 0.6, 0, TAU); }
      g.fill();
      if (!c.opts.fish) return;
      const eyes = st.eyes || (st.eyes = []), n = Math.ceil(st.schools.length * U.span(c.progress, 0.02, 0.45));   // the fish arrive as the reef does
      eyes.length = 0;
      for (let i = 0; i < n; i++) {
        const s = st.schools[i]; s.x += s.dir * s.sp * dt;
        if (s.x < -150 || s.x > c.w + 150) {   // gone off one side: come back along another channel
          s.dir = Math.random() < 0.5 ? 1 : -1; s.x = s.dir > 0 ? -140 : c.w + 140; s.y = st.lanes[Math.floor(Math.random() * st.lanes.length)]; s.col = FISH[Math.floor(Math.random() * FISH.length)];
          for (const f of s.fish) f.ox = -s.dir * Math.abs(f.ox);
        }
        s.post.x = s.x; s.post.y = s.y; s.post.dir = s.dir; s.post.hid = s.x < 0 || s.x > c.w; c.scene.next.push(s.post);   // the whole school is one creature to others
        g.fillStyle = s.col;
        for (const f of s.fish) {
          f.vx += (-f.dx * 3 - f.vx * 2.4) * dt; f.vy += (-f.dy * 3 - f.vy * 2.4) * dt; f.dx += f.vx * dt; f.dy += f.vy * dt;
          const x = f.px = s.x + f.ox + f.dx, y = f.py = s.y + f.oy + Math.sin(t * 1.3 + f.ph) * 2.2 + f.dy;
          const hx = s.dir * s.sp + f.vx, hy = f.vy, l = Math.hypot(hx, hy) || 1, ux = hx / l, uy = hy / l, z = f.s, wag = Math.sin(t * 9 + f.ph) * 1.6 * z;
          g.beginPath(); g.ellipse(x, y, 6 * z, 2.7 * z, Math.atan2(uy, ux), 0, TAU);
          g.moveTo(x - ux * 4.5 * z, y - uy * 4.5 * z); g.lineTo(x - ux * 9.5 * z - uy * (3.2 * z + wag), y - uy * 9.5 * z + ux * (3.2 * z + wag)); g.lineTo(x - ux * 9.5 * z + uy * (3.2 * z - wag), y - uy * 9.5 * z - ux * (3.2 * z - wag));
          g.closePath(); g.fill();
          eyes.push(x + ux * 3.4 * z, y + uy * 3.4 * z - 0.6 * z, x - ux * 2 * z, y - uy * 2 * z, x + ux * 2.4 * z, y + uy * 2.4 * z);
        }
      }
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1; g.beginPath(); for (let i = 0; i < eyes.length; i += 6) { g.moveTo(eyes[i + 2], eyes[i + 3] + 0.8); g.lineTo(eyes[i + 4], eyes[i + 5] + 0.8); } g.stroke();   // a pale belly line
      g.fillStyle = '#10131c'; g.beginPath(); for (let i = 0; i < eyes.length; i += 6) { g.moveTo(eyes[i] + 0.9, eyes[i + 1]); g.arc(eyes[i], eyes[i + 1], 0.9, 0, TAU); } g.fill();
    },
  });
})();
