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
    label: 'Tendrils', grows: true, days: 7,
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
    draw(g, st, c) {
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
      for (const s of st.strands) { const q = (p - s.at) / s.dur; if (q > 0) strand(g, s, Math.min(1, q), hl, dots); }
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
  HP.fx.add('cobwebs', {
    label: 'Cobwebs', grows: true, days: 14, live: true, fps: 12,
    options: [amount(), {key: 'spider', label: 'Spider', type: 'bool', default: true}],
    create(c) {
      const r = c.rand, amt = c.opts.amount, webs = [];
      const web = (x, y, a0, R, at, big) => {
        const n = big ? 7 + Math.floor(r() * 3) : 4 + Math.floor(r() * 2), nk = big ? 8 + Math.floor(r() * 4) : 3 + Math.floor(r() * 2), rad = [], rings = [], miss = [], loose = [];
        // the two outer spokes run along the edges; the ones between are uneven, as a spider leaves them
        for (let i = 0; i < n; i++) { const edge = !i || i === n - 1; rad.push({a: a0 + Math.PI / 2 * (i + (edge ? 0 : (r() - 0.5) * 0.5)) / (n - 1), len: R * (edge ? 1.05 : 0.72 + r() * 0.4)}); }
        for (let k = 0; k < nk; k++) rings.push((k + 1 + (r() - 0.5) * 0.3) / (nk + 0.4));
        for (let m = 0, M = nk * (n - 1); m < M; m++) miss.push(r() < (m > M * 0.6 ? 0.2 : 0.06));
        if (big) for (let k = 0; k < 3; k++) loose.push({i: 1 + Math.floor(r() * (n - 2)), f: 0.5 + r() * 0.5, len: 14 + r() * 30, dx: (r() - 0.5) * 10});
        webs.push({x, y, rad, rings, miss, loose, at, dur: big ? 0.4 : 0.3});
      };
      const k0 = Math.floor(r() * 4), big = (i, x, y) => web(x, y, i * Math.PI / 2, (i < 2 ? 170 + r() * 110 : 120 + r() * 80) * (0.55 + 0.45 * amt), [0, 0.05, 0.12, 0.2][(i + k0) % 4], true);
      big(0, 0, 0); big(1, c.w, 0); big(2, c.w, c.h); big(3, 0, c.h);
      for (const b of c.rects) if (solid(b)) for (let i = 0; i < 4; i++) if (r() < 0.34 * amt)
        web(i === 0 || i === 3 ? b.x : b.x + b.w, i < 2 ? b.y : b.y + b.h, i * Math.PI / 2, Math.min(0.5 * Math.min(b.w, b.h), 30 + r() * 26), 0.1 + r() * 0.58, false);
      // a few long loose threads strung along the top edge, hanging in a curve
      const drapes = []; for (let i = 0, n = Math.round(5 * amt); i < n; i++) drapes.push({x: r() * c.w * 0.85, span: 80 + r() * 220, sag: 16 + r() * 34, at: 0.3 + r() * 0.5});
      // the spider comes down a gap that starts near the top, so it hangs between buttons and not over one
      const lanes = c.gaps.filter(q => Math.abs(q.x1 - q.x2) < 1 && Math.min(q.y1, q.y2) < c.h * 0.35).map(q => ({x: q.x1, len: U.clamp((q.y1 + q.y2) / 2, 60, c.h * 0.45)}));
      return {webs, drapes, lanes, sp: {on: false}};
    },
    draw(g, st, c, t) {
      g.drawImage(still(st, c, gg => paintWebs(gg, st, c.progress)), 0, 0);
      if (!c.opts.spider || c.progress < 0.06) return;
      const s = st.sp;
      if (st.next == null) st.next = t + 1.2;
      if (!s.on && t >= st.next) {
        const l = st.lanes.length ? st.lanes[Math.floor(Math.random() * st.lanes.length)] : {x: 60 + Math.random() * (c.w - 120), len: 130};
        s.on = true; s.t = t; s.x = l.x; s.len = l.len * (0.6 + Math.random() * 0.4);
      }
      if (!s.on) return;
      const e = t - s.t;
      if (e > 17) { s.on = false; st.next = t + 45 + Math.random() * 30; return; }   // about once a minute
      const k = e < 5 ? U.span(e, 0, 5) : e < 11 ? 1 : 1 - U.span(e, 11, 17), y = s.len * k, x = s.x + Math.sin(t * 1.1) * 3 * k;
      g.strokeStyle = 'rgba(236,240,250,.6)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(s.x, 0); g.lineTo(x, y - 4); g.stroke();
      spider(g, x, y, e < 5 || e > 11 ? t * 7 : t * 0.9);
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Crystals: clusters of hexagonal prisms in the gaps and in the screen's bottom corners. A prism seen from the
  // side shows three long faces and three faces of its point; each gets its own tone of the one hue.
  const GEMS = {amethyst: [[50, 20, 104], [110, 58, 188], [174, 128, 236], [232, 212, 255]], ice: [[36, 84, 128], [92, 156, 204], [168, 218, 244], [238, 250, 255]],
    emerald: [[8, 70, 50], [22, 136, 92], [84, 206, 148], [212, 255, 230]], rose: [[118, 30, 70], [204, 84, 128], [246, 162, 188], [255, 228, 234]]};
  HP.fx.add('crystals', {
    label: 'Crystals', grows: true, days: 10,
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
          if (roll > 0.18 + 0.36 * amt) continue;
          const at = 0.03 + r() * 0.5;
          // a small fan from one foot, like the big ones in the corners: the middle crystal longest, leaning along the channel where there is room
          const main = axis ? (r() < 0.8 ? -Math.PI / 2 : Math.PI / 2) : (r() < 0.5 ? -0.4 : Math.PI + 0.4);
          for (let i = 0, n = 4 + Math.floor(r() * 3); i < n; i++) { const off = (i / (n - 1) - 0.5) * 1.9 + (r() - 0.5) * 0.25; add(e[0], e[1], main + off, (16 + r() * 26) * (1 - Math.abs(off) * 0.5), 7 + r() * 4.5, at + Math.abs(off) * 0.15 + r() * 0.15); }
        }
      }
      for (const side of [1, -1]) {
        const at = r() * 0.15;
        for (let i = 0, n = Math.round(5 + 6 * amt); i < n; i++) add((side > 0 ? 4 : c.w - 4) + side * r() * 14, c.h - 2, -Math.PI / 2 + side * (-0.2 + r() * 1.7), 50 + r() * 140, 12 + r() * 16, at + r() * 0.35);
      }
      list.sort((a, b) => b.L - a.L);   // tall ones behind, short ones in front
      return {list};
    },
    draw(g, st, c) {
      const p = c.progress;
      g.lineJoin = g.lineCap = 'round'; g.lineWidth = 0.8;
      for (const k of st.list) {
        const q = U.span(p, k.at, k.at + 0.35); if (q < 0.03) continue;
        const L = k.L * q, w = k.w * (0.4 + 0.6 * q), S = L - Math.min(L * 0.5, k.tip * w), ca = Math.cos(k.a), sa = Math.sin(k.a);
        const X = (u, v) => k.x + ca * u - sa * v, Y = (u, v) => k.y + sa * u + ca * v, lit = ca - sa > 0;   // which long side faces the light (upper left)
        const e = [-w / 2, -w * 0.17, w * 0.23, w / 2], ax = X(L, k.skew * w), ay = Y(L, k.skew * w), body = lit ? [1, 2, 0] : [0, 2, 1], tips = lit ? [2, 3, 1] : [1, 3, 2];
        for (let i = 0; i < 3; i++) {
          g.fillStyle = k.col[body[i]]; g.beginPath(); g.moveTo(X(0, e[i]), Y(0, e[i])); g.lineTo(X(S, e[i]), Y(S, e[i])); g.lineTo(X(S, e[i + 1]), Y(S, e[i + 1])); g.lineTo(X(0, e[i + 1]), Y(0, e[i + 1])); g.fill();
          g.fillStyle = k.col[tips[i]]; g.beginPath(); g.moveTo(X(S, e[i]), Y(S, e[i])); g.lineTo(X(S, e[i + 1]), Y(S, e[i + 1])); g.lineTo(ax, ay); g.fill();
        }
        const b = lit ? 1 : 2;   // the bright edge is the one between the front face and the lit side
        g.strokeStyle = k.col[3]; g.beginPath(); g.moveTo(X(0, e[b]), Y(0, e[b])); g.lineTo(X(S, e[b]), Y(S, e[b])); g.lineTo(ax, ay); g.stroke();
        if (k.glint && q > 0.9) { const s = 6 * (q - 0.9) * 10, i = s * 0.2; g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.moveTo(ax - s, ay); g.lineTo(ax - i, ay - i); g.lineTo(ax, ay - s); g.lineTo(ax + i, ay - i); g.lineTo(ax + s, ay); g.lineTo(ax + i, ay + i); g.lineTo(ax, ay + s); g.lineTo(ax - i, ay + i); g.fill(); }   // a four-point sparkle on the tip
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Moss: many small soft cushions in several greens along the buttons' lower edges, in the gaps and up from the
  // bottom of the screen, with pale lichen patches. Each cushion is one stamp of a soft dot made once per colour.
  const MOSS = [[28, 58, 22], [44, 86, 32], [68, 118, 42], [107, 154, 50], [155, 187, 76], [150, 172, 140], [186, 196, 170]];   // five greens, two lichens
  function cushion(q, flat) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const d = cv.getContext('2d'); let gr = d.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, rgb(q, 1)); gr.addColorStop(flat ? 0.6 : 0.3, rgb(q, 0.95)); gr.addColorStop(1, rgb(q, 0));
    d.fillStyle = gr; d.fillRect(0, 0, 32, 32);
    // a little light on the upper left of each one makes a pile of them look like cushions and not like spots
    gr = d.createRadialGradient(12, 11, 0, 12, 11, 9); gr.addColorStop(0, 'rgba(255,255,215,' + (flat ? 0.04 : 0.16) + ')'); gr.addColorStop(1, 'rgba(255,255,215,0)');
    d.globalCompositeOperation = 'source-atop'; d.fillStyle = gr; d.fillRect(0, 0, 32, 32);
    return cv;
  }
  HP.fx.add('moss', {
    label: 'Moss', grows: true, days: 60,
    options: [amount()],
    create(c) {
      const r = c.rand, amt = c.opts.amount, nz = U.noise(c.seed + 5), stamps = [], sprouts = [];
      const put = (x, y, size, tone, at) => {
        if (x < -4 || x > c.w + 4 || y < 0 || y > c.h + 4 || buried(c.rects, x, y)) return false;
        stamps.push({x, y, r: size, tone, at: U.clamp(at, 0, 0.9)}); return true;
      };
      // a tuft: one dark cushion underneath and a few small light ones on top, so a patch reads as moss and not as beads
      const tuft = (x, y, size, at) => {
        if (!put(x, y, size * 1.25, r() < 0.5 ? 0 : 1, at)) return;
        for (let i = 0, n = 1 + Math.floor(r() * 2.4); i < n; i++) put(x + (r() - 0.5) * size * 1.4, y - r() * size * 0.8, size * (0.4 + r() * 0.3), 2 + Math.floor(r() * 3), at + 0.02 + r() * 0.05);
      };
      // up from the bottom of the screen: a bank of uneven height, thickest and earliest at the very bottom
      for (let x = 0; x < c.w; x += 8 / amt) {
        const top = 12 + 36 * (0.5 + 0.5 * nz(x / 80));
        for (let i = 0; i < 2; i++) { const up = r() * r() * top; tuft(x + (r() - 0.5) * 8, c.h - 1 - up, 4 + r() * 3.5, 0.02 + up / 55 * 0.6 + r() * 0.12); }
      }
      // along each button's lower edge and a little way up its sides; lower buttons get more, and get it sooner
      c.rects.forEach((b, n) => {
        if (!solid(b)) return;
        const low = (b.y + b.h) / c.h, wgt = amt * (0.2 + 0.8 * low * low), base = 0.55 * (1 - low), cr = creep(b), bot = b.y + b.h;
        rim(b, 7).forEach((q, i) => {
          const patch = 0.5 + 0.5 * nz(i * 0.11 + n * 9.7), up = (bot - q.y) / b.h, want = q.ny > 0.3 ? 1 : q.ny > -0.3 && up < 0.5 ? 1 - up * 2 : 0;
          const dens = U.clamp((patch - 0.7 + 0.7 * wgt) * 4, 0, 1) * want;   // moss comes in patches: thick here, none there
          if (dens <= 0) return;
          for (let j = 0; j < 2; j++) if (r() < dens) {
            const o = 4 - r() * (4 + cr * dens);
            tuft(q.x + q.nx * o + (r() - 0.5) * 5, q.y + q.ny * o + (r() - 0.5) * 3, 3.2 + 2.6 * dens, base + (1 - dens) * 0.25 + up * 0.4 + r() * 0.15);
          }
        });
      });
      for (const q of c.gaps) {
        const len = Math.hypot(q.x2 - q.x1, q.y2 - q.y1);
        for (let d = 0; d < len; d += 7) { const x = U.lerp(q.x1, q.x2, d / len), y = U.lerp(q.y1, q.y2, d / len), low = y / c.h, dens = U.clamp((0.5 + 0.5 * nz(d * 0.025 + q.x1 + q.y1) - 0.8 + 0.5 * amt * (0.15 + 0.85 * low * low)) * 4, 0, 1); if (r() < dens * 0.7) tuft(x + (r() - 0.5) * 7, y + (r() - 0.5) * 7, 3 + r() * 2, 0.2 + 0.55 * (1 - low) + r() * 0.25); }
      }
      const bs = c.rects.filter(solid);
      if (bs.length) for (let i = 0, n = Math.round(16 * amt); i < n; i++) {   // lichen: pale flat patches, on any edge
        const b = pick(r, bs), q = pick(r, rim(b, 6)), at = 0.3 + r() * 0.5, cr = creep(b);
        for (let j = 0, m = 9 + Math.floor(r() * 8); j < m; j++) { const o = 3 - r() * (3 + cr * 0.8), s = (r() - 0.5) * 16; put(q.x + q.nx * o - q.ny * s, q.y + q.ny * o + q.nx * s, 2.4 + r() * 2.2, 5 + Math.floor(r() * 2), at + r() * 0.12); }
      }
      const green = stamps.filter(s => s.tone < 2);
      for (let i = 0, n = Math.round(18 * amt); i < n && green.length; i++) { const s = pick(r, green); sprouts.push({x: s.x, y: s.y - 1, h: 6 + r() * 8, lean: (r() - 0.5) * 0.9, at: U.clamp(s.at + 0.3, 0.7, 0.86) + r() * 0.04}); }
      stamps.sort((a, b) => a.tone - b.tone);   // dark underneath, light on top
      return {stamps, sprouts, dots: MOSS.map((q, i) => cushion(q, i > 4))};
    },
    draw(g, st, c) {
      const p = c.progress;
      for (const s of st.stamps) {
        const k = U.span(p, s.at, s.at + 0.1); if (k < 0.05) continue;
        const R = s.r * (0.35 + 0.65 * k) * 1.35; g.drawImage(st.dots[s.tone], s.x - R, s.y - R, 2 * R, 2 * R);
      }
      g.lineCap = 'round'; g.lineWidth = 1.1; g.strokeStyle = '#86b944'; g.fillStyle = '#b2dc62';
      for (const s of st.sprouts) {
        const k = U.span(p, s.at, s.at + 0.1); if (k < 0.05) continue;
        const h = s.h * k, tx = s.x + s.lean * h, ty = s.y - h;
        g.beginPath(); g.moveTo(s.x, s.y); g.quadraticCurveTo(s.x, s.y - h * 0.6, tx, ty); g.stroke();
        g.beginPath(); g.ellipse(tx - 2 * k, ty - 0.6, 2.5 * k, 1.2 * k, 0.5, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(tx + 2 * k, ty - 0.6, 2.5 * k, 1.2 * k, -0.5, 0, TAU); g.fill();
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Honeycomb: wax cells fill the gaps one at a time, spreading from a few starting points; later about half of
  // them fill with honey and the oldest get a wax cap. A few bees go from cell to cell.
  const HX = [], HY = []; for (let i = 0; i < 6; i++) { HX.push(Math.cos(i * TAU / 6)); HY.push(Math.sin(i * TAU / 6)); }
  function paintComb(g, st, p) {
    const hex = (x, y, R) => { g.moveTo(x + R, y); for (let i = 1; i < 6; i++) g.lineTo(x + HX[i] * R, y + HY[i] * R); g.closePath(); };
    const grown = st.grown = st.cells.filter(k => k.at <= p);
    const fill = (col, test, R) => { g.fillStyle = col; g.beginPath(); for (const k of grown) if (test(k)) hex(k.x, k.y, R(k)); g.fill(); };
    const level = k => 7.9 * (0.45 + 0.55 * U.span(p, k.honey, k.honey + 0.04));   // a cell fills from its middle outward
    fill('rgba(78,40,8,.62)', () => true, () => 9);                                 // the dark inside of an empty cell
    fill('#d9820c', k => k.honey <= p && k.tone < 0.5, level);
    fill('#f0a31c', k => k.honey <= p && k.tone >= 0.5, level);
    fill('#f2d58c', k => k.cap && k.honey + 0.2 <= p, () => 7.9);
    g.lineJoin = 'round';
    g.strokeStyle = '#8f560e'; g.lineWidth = 3.2; g.beginPath(); for (const k of grown) hex(k.x, k.y, 9); g.stroke();   // walls: a dark base
    g.strokeStyle = '#f2c050'; g.lineWidth = 1.4; g.beginPath(); for (const k of grown) hex(k.x, k.y, 9); g.stroke();   // and a bright wax top
    g.fillStyle = 'rgba(255,247,210,.78)'; g.beginPath();
    for (const k of grown) if (k.honey + 0.03 <= p && !(k.cap && k.honey + 0.2 <= p)) { g.moveTo(k.x - 1.1, k.y - 2.8); g.arc(k.x - 2.6, k.y - 2.8, 1.5, 0, TAU); }
    g.fill();
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
    label: 'Honeycomb', grows: true, days: 7, live: true, fps: 12,
    options: [amount(), {key: 'bees', label: 'Bees', type: 'bool', default: true}],
    create(c) {
      const r = c.rand, amt = c.opts.amount, R = 9, dx = R * 1.5, dy = R * Math.sqrt(3), band = 7 + 11 * amt, cells = [], bees = [], gaps = c.gaps, org = [];
      if (!gaps.length) return {cells, bees, grown: []};
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
      for (let i = 0, n = Math.round(2 + 4 * amt); i < n; i++) bees.push({x: null, y: 0, tx: 0, ty: 0, a: 0, wait: 0, ph: r() * TAU});
      return {cells, bees, grown: []};
    },
    draw(g, st, c, t, dt) {
      g.drawImage(still(st, c, gg => paintComb(gg, st, c.progress)), 0, 0);
      const cells = st.grown;
      if (!c.opts.bees || !cells.length) return;
      // a bee prefers a cell not too far off, so it works its way along the comb instead of crossing the whole screen
      const next = b => { let best = null, bd = 1e9; for (let i = 0; i < 4; i++) { const k = cells[Math.floor(Math.random() * cells.length)], d = Math.hypot(k.x - b.x, k.y - b.y); if (d > 25 && d < bd) { bd = d; best = k; } } return best || cells[0]; };
      for (let i = 0, n = Math.min(st.bees.length, Math.ceil(cells.length / 10)); i < n; i++) {
        const b = st.bees[i]; let fly = 0;
        if (b.x == null) { const k = cells[Math.floor(Math.random() * cells.length)]; b.x = b.tx = k.x; b.y = b.ty = k.y; b.wait = Math.random() * 1.5; }
        if (b.wait > 0) { b.wait -= dt; if (b.wait <= 0) { const k = next(b); b.tx = k.x; b.ty = k.y; } }
        else {
          const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
          if (d < 3) b.wait = 1 + Math.random() * 3;
          else { const v = Math.min(d, 60 * dt); b.x += dx / d * v; b.y += dy / d * v; b.a = Math.atan2(dy, dx); fly = Math.min(1, d / 20); }
        }
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
  function paintReef(g, st, p) {
    g.lineCap = g.lineJoin = 'round';
    for (const k of st.corals) {
      const q = U.span(p, k.at, k.at + 0.35); if (q < 0.04) continue;
      g.save(); g.translate(k.x, k.y); g.scale(0.2 + 0.8 * q, 0.2 + 0.8 * q);   // each one swells up from its foot
      if (k.segs) {
        const lines = (s, dx) => { g.beginPath(); for (let i = 0; i < s.length; i += 4) { g.moveTo(s[i] + dx, s[i + 1]); g.lineTo(s[i + 2] + dx, s[i + 3]); } g.stroke(); };
        g.strokeStyle = k.col[0]; k.segs.forEach((s, d) => { if (s.length) { g.lineWidth = [4.2, 3.1, 2.2, 1.6][d] * k.wd; lines(s, 0); } });
        g.strokeStyle = k.col[2]; g.globalAlpha = 0.5; g.lineWidth = 0.9; lines(k.segs[0], -0.9); lines(k.segs[1], -0.7); g.globalAlpha = 1;   // a lit side on the thick stems
        g.fillStyle = k.col[2]; g.beginPath(); for (let i = 0; i < k.tips.length; i += 2) { g.moveTo(k.tips[i] + 1.5, k.tips[i + 1]); g.arc(k.tips[i], k.tips[i + 1], 1.5, 0, TAU); } g.fill();
      } else if (k.ribs) {
        const at = (d, f) => [Math.cos(d.a) * d.len * f, Math.sin(d.a) * d.len * f];
        g.fillStyle = k.col[0]; g.globalAlpha = 0.3; g.beginPath(); g.moveTo(0, 0); for (const d of k.ribs) { const e = at(d, 1); g.lineTo(e[0], e[1]); } g.fill(); g.globalAlpha = 1;
        g.strokeStyle = k.col[0]; g.lineWidth = 1.2; g.beginPath();
        for (const d of k.ribs) { const e = at(d, 1); g.moveTo(0, 0); g.lineTo(e[0], e[1]); }
        for (const f of [0.38, 0.58, 0.78, 0.97]) k.ribs.forEach((d, i) => { const e = at(d, f); if (i) g.lineTo(e[0], e[1]); else g.moveTo(e[0], e[1]); });   // the fan's net
        g.stroke();
        g.strokeStyle = k.col[1]; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 2); g.lineTo(0, -k.ribs[0].len * 0.14); g.stroke();
      } else {
        g.fillStyle = k.col[0]; g.beginPath(); g.ellipse(0, 0, k.rw, k.rh, 0, Math.PI, TAU); g.fill();
        g.strokeStyle = k.col[1]; g.lineWidth = 1.2; g.beginPath();   // the wandering grooves
        for (let j = 1; j <= 3; j++) for (let i = 0; i <= 14; i++) { const th = Math.PI + Math.PI * i / 14, s = j / 3.6 + 0.07 * Math.sin(th * 7 + k.ph + j * 2), x = Math.cos(th) * k.rw * s, y = Math.sin(th) * k.rh * s; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke();
        g.strokeStyle = k.col[2]; g.globalAlpha = 0.6; g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, 0, k.rw * 0.9, k.rh * 0.9, 0, Math.PI * 1.15, Math.PI * 1.5); g.stroke(); g.globalAlpha = 1;
      }
      g.restore();
    }
  }
  HP.fx.add('coral', {
    label: 'Coral reef', grows: true, days: 14, live: true, fps: 12,
    options: [amount(), {key: 'fish', label: 'Fish', type: 'bool', default: true}],
    create(c) {
      const r = c.rand, amt = c.opts.amount, corals = [], lanes = [], schools = [];
      const plant = (x, y) => {
        const room = reach(c, x, y - 2, 0, -1, 80), kind = r(), k = {x, y, col: REEF[Math.floor(r() * 3) % 3], at: U.clamp((c.h - y) / (c.h * 0.6), 0, 1) * 0.5 + r() * 0.15};   // the lowest grow first
        if (room < 10) return;
        if (kind < 0.42) {
          const H = Math.min(room, 20 + r() * 30), segs = [[], [], [], []], tips = [];
          const grow = (x, y, a, len, d) => {
            const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len; segs[d].push(x, y, ex, ey);
            if (d === 3 || len < 3.5) { tips.push(ex, ey); return; }
            for (let i = 0, n = d < 2 && r() < 0.45 ? 3 : 2; i < n; i++) grow(ex, ey, U.clamp(a + (i - (n - 1) / 2) * (0.75 + r() * 0.3) + (r() - 0.5) * 0.3, -2.7, -0.45), len * (0.6 + r() * 0.2), d + 1);
          };
          grow(0, 0, -Math.PI / 2 + (r() - 0.5) * 0.3, H * 0.4, 0); k.segs = segs; k.tips = tips; k.wd = U.clamp(H / 34, 0.7, 1.25);
        } else if (kind < 0.74) {
          const H = Math.min(room, 22 + r() * 26), n = 7 + Math.floor(r() * 3), spread = 1.6 + r() * 0.6; k.ribs = [];
          for (let i = 0; i < n; i++) { const f = i / (n - 1); k.ribs.push({a: -Math.PI / 2 + (f - 0.5) * spread, len: H * (0.7 + 0.3 * Math.sin(Math.PI * f)) * (0.9 + r() * 0.12)}); }
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
      return {corals, lanes, schools};
    },
    // a finger sends the nearby fish darting away; they drift back to their group afterwards
    touch(st, x, y) {
      for (const s of st.schools) for (const f of s.fish) { const dx = f.px - x, dy = f.py - y, d = Math.hypot(dx, dy) || 1; if (d < 150) { const k = 120 + 260 * (1 - d / 150); f.vx += dx / d * k; f.vy += dy / d * k; } }
    },
    draw(g, st, c, t, dt) {
      g.drawImage(still(st, c, gg => paintReef(gg, st, c.progress)), 0, 0);
      if (!c.opts.fish) return;
      const eyes = [], n = Math.ceil(st.schools.length * U.span(c.progress, 0.02, 0.45));   // the fish arrive as the reef does
      for (let i = 0; i < n; i++) {
        const s = st.schools[i]; s.x += s.dir * s.sp * dt;
        if (s.x < -150 || s.x > c.w + 150) {   // gone off one side: come back along another channel
          s.dir = Math.random() < 0.5 ? 1 : -1; s.x = s.dir > 0 ? -140 : c.w + 140; s.y = st.lanes[Math.floor(Math.random() * st.lanes.length)]; s.col = FISH[Math.floor(Math.random() * FISH.length)];
          for (const f of s.fish) f.ox = -s.dir * Math.abs(f.ox);
        }
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
