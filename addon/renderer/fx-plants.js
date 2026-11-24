'use strict';
// Plants. "vine": a plant that grows between the buttons over a week, in nine species. "mushrooms": clusters along
// the bottom that grow taller and glow at night. Both are slow kinds: drawn rarely, nothing sways.
(() => {
  const U = HP.fx.util, PI = Math.PI, TAU = PI * 2, STEP = 9;
  const shut = {};  // closed flowers outlive a layout rebuild: seed -> {flower number: when it was closed}
  const dots = {};

  /** One soft round glow, drawn once and stamped wherever light is needed. */
  function softDot(rgb) {
    if (dots[rgb]) return dots[rgb];
    const c = document.createElement('canvas'); c.width = c.height = 48;
    const d = c.getContext('2d'), gr = d.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, 'rgba(' + rgb + ',.85)'); gr.addColorStop(0.4, 'rgba(' + rgb + ',.3)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    d.fillStyle = gr; d.fillRect(0, 0, 48, 48); return (dots[rgb] = c);
  }
  const inside = (b, x, y, m) => x > b.x + m && x < b.x + b.w - m && y > b.y + m && y < b.y + b.h - m;
  /** Is the point over the middle of a button: further in than the rim that things may creep over? */
  const middle = (rects, x, y) => rects.some(b => !b.hidden && !b.flat && inside(b, x, y, Math.min(b.w, b.h) * 0.15));

  /** The path a stem follows round one button: its rounded outline, d pixels outside, clockwise, a point every STEP. */
  function ring(b, d) {
    const x = b.x - d, y = b.y - d, w = b.w + 2 * d, h = b.h + 2 * d, rr = Math.max(1, Math.min((b.r || 0) + d, w / 2, h / 2)), out = [];
    const line = (x1, y1, x2, y2, side) => { const len = Math.hypot(x2 - x1, y2 - y1), n = Math.round(len / STEP); for (let i = 0; i < n; i++) out.push({x: x1 + (x2 - x1) * i / n, y: y1 + (y2 - y1) * i / n, tx: (x2 - x1) / len, ty: (y2 - y1) / len, side, arc: false}); };
    const arc = (cx, cy, a0) => { const n = Math.max(2, Math.round(rr * PI / 2 / STEP)); for (let i = 0; i < n; i++) { const a = a0 + PI / 2 * i / n; out.push({x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, tx: -Math.sin(a), ty: Math.cos(a), side: -1, arc: true}); } };
    line(x + rr, y, x + w - rr, y, 0); arc(x + w - rr, y + rr, -PI / 2); line(x + w, y + rr, x + w, y + h - rr, 1); arc(x + w - rr, y + h - rr, 0);
    line(x + w - rr, y + h, x + rr, y + h, 2); arc(x + rr, y + h - rr, PI / 2); line(x, y + h - rr, x, y + rr, 3); arc(x + rr, y + rr, PI);
    return out;
  }

  // What makes each species itself. stem: young, grown, old. L: leaf length. lGap/fGap: pixels of stem per leaf/flower.
  // nL/nF: the most leaves/flowers one drawing may hold. off: how far a flower sits from the stem. fr: flower radius. t0/t1: when in the cycle the flowers open.
  const SPEC = {
    flowers:      {stem: ['#8cc152', '#6a9c3a', '#56722f'], leaf: ['#5fa03a', '#79b84a', '#4a8a38'], shape: 'oval', L: 15, lGap: 24, fGap: 50, nL: 260, nF: 95, off: 7, fr: 7.4, tend: 0.5, t0: 0.6, t1: 0.28, tap: true},
    morningglory: {stem: ['#8cc152', '#6a9c3a', '#56722f'], leaf: ['#4f9a40', '#63ad4c', '#458a3c'], shape: 'heart', L: 15, lGap: 26, fGap: 54, nL: 240, nF: 80, off: 6, fr: 9.5, tend: 0.7, t0: 0.6, t1: 0.28, tap: true},
    moonflower:   {stem: ['#7fb45a', '#5f9048', '#4a6c38'], leaf: ['#3f8a4a', '#4f9c58', '#357a48'], shape: 'heart', L: 17, lGap: 30, fGap: 78, nL: 220, nF: 55, off: 3, fr: 13, tend: 0.6, t0: 0.6, t1: 0.28, tap: true},
    wisteria:     {stem: ['#9aa860', '#8a7a50', '#6e5a40'], leaf: ['#8fc45a', '#a4d06a', '#7ab350'], shape: 'pinnate', L: 15, lGap: 42, fGap: 0, nL: 150, nF: 46, off: 0, fr: 8, tend: 0.15, t0: 0.64, t1: 0.2, tap: true},
    ivy:          {stem: ['#7a8a4a', '#6b6a40', '#5a4a35'], leaf: ['#2f7a3a', '#3d8c44', '#2a6a3a'], shape: 'ivy', L: 15, lGap: 13, fGap: 0, nL: 300, tend: 0},
    roses:        {stem: ['#6f9a40', '#5a7a35', '#4f5a30'], leaf: ['#2f6e36', '#3a7f3e', '#2a6030'], shape: 'oval', L: 13, lGap: 24, fGap: 60, nL: 250, nF: 75, off: 6, fr: 9, tend: 0, t0: 0.76, t1: 0.14, tap: true, thorns: true},
    pumpkin:      {stem: ['#8fc050', '#74a53e', '#5f8a35'], leaf: ['#4f9438', '#5fa444', '#458a34'], shape: 'broad', L: 20, lGap: 44, fGap: 92, nL: 120, nF: 42, off: 9, fr: 13, tend: 1.2, t0: 0.66, t1: 0.2, w0: 2, w1: 3.6},
    flytrap:      {stem: ['#86b84e', '#6a9c3a', '#56722f'], leaf: ['#5fa03a', '#79b84a', '#4a8a38'], shape: 'oval', L: 11, lGap: 30, fGap: 62, nL: 200, nF: 55, off: 5, fr: 12.5, tend: 0.2, t0: 0.6, t1: 0.25, tap: true},
    kelp:         {stem: ['#b0a03a', '#8f8430', '#6e6526'], leaf: ['#9a8f30', '#b3a43c', '#857a2a'], shape: 'blade', L: 27, lGap: 24, fGap: 0, nL: 260, tend: 0, w0: 3.2, w1: 5},
  };
  const AUTUMN = ['#c8402a', '#e07a2a', '#a8301f', '#e0a030'];
  // wildflowers: petal count, petal colour, centre colour, petal width
  const WILD = [[5, '#f08fb4', '#ffd84a', 0.34], [9, '#ffffff', '#f6c21c', 0.17], [5, '#ffd23c', '#e8891a', 0.36], [6, '#b28cf0', '#fff2a8', 0.26], [5, '#6fb6ff', '#fff36a', 0.36], [4, '#ff6a4a', '#3a2418', 0.42]];
  const ROSE = [['#8e1220', '#c21e30', '#e04a55'], ['#c2466f', '#e36f92', '#f7a4bb'], ['#e7b3ae', '#f6d2cc', '#fff0ea']];

  // ---------- shapes, all drawn at the origin pointing along +x ----------
  function leafPath(g, shape, L) {
    const W = L * 0.5;
    g.beginPath();
    if (shape === 'heart') { g.moveTo(L * 0.15, 0); g.bezierCurveTo(-L * 0.22, -W * 1.25, L * 0.55, -W * 1.3, L, 0); g.bezierCurveTo(L * 0.55, W * 1.3, -L * 0.22, W * 1.25, L * 0.15, 0); }
    else if (shape === 'ivy') {  // five pointed lobes with hollow curves between them
      g.moveTo(0, 0);
      for (const s of [-1, 1]) {
        if (s < 0) { g.quadraticCurveTo(-L * 0.18, -W * 0.4, -L * 0.1, -W * 0.95); g.quadraticCurveTo(L * 0.26, -W * 0.5, L * 0.5, -W * 1.1); g.quadraticCurveTo(L * 0.6, -W * 0.42, L, 0); }
        else { g.quadraticCurveTo(L * 0.6, W * 0.42, L * 0.5, W * 1.1); g.quadraticCurveTo(L * 0.26, W * 0.5, -L * 0.1, W * 0.95); g.quadraticCurveTo(-L * 0.18, W * 0.4, 0, 0); }
      }
    } else if (shape === 'broad') {  // a big round leaf with scalloped lobes and a notch at the stalk
      const R = L * 0.55, n = 7;
      for (let i = 0; i <= n; i++) { const a = PI + i / n * TAU, m = a - PI / n, k = i === 0 ? 0.55 : 0.8; if (i === 0) g.moveTo(R + Math.cos(a) * R * k, Math.sin(a) * R * k); else g.quadraticCurveTo(R + Math.cos(m) * R * 1.22, Math.sin(m) * R * 1.22, R + Math.cos(a) * R * (i === n ? 0.55 : k), Math.sin(a) * R * (i === n ? 0.55 : k)); }
    } else if (shape === 'blade') { g.moveTo(0, 0); g.bezierCurveTo(L * 0.25, -L * 0.3, L * 0.6, -L * 0.04, L, -L * 0.06); g.bezierCurveTo(L * 0.62, L * 0.24, L * 0.3, L * 0.06, 0, 0); }
    else { g.moveTo(0, 0); g.bezierCurveTo(L * 0.3, -W, L * 0.7, -W * 0.75, L, 0); g.bezierCurveTo(L * 0.7, W * 0.75, L * 0.3, W, 0, 0); }
    g.closePath();
  }
  /** n petals round the origin as one path. */
  function petals(g, n, R, wr) { g.beginPath(); for (let i = 0; i < n; i++) { const a = i / n * TAU, c = Math.cos(a), s = Math.sin(a); g.moveTo(c * R, s * R); g.ellipse(c * R * 0.52, s * R * 0.52, R * 0.48, R * wr, a, 0, TAU); } }
  /** n round petals as overlapping discs, for roses. */
  function discs(g, n, d, rad) { g.beginPath(); for (let i = 0; i < n; i++) { const a = i / n * TAU, x = Math.cos(a) * d, y = Math.sin(a) * d; g.moveTo(x + rad, y); g.arc(x, y, rad, 0, TAU); } }
  /** A trumpet flower's rim: a circle with n soft corners. */
  function rim(g, n, R) { g.beginPath(); g.moveTo(R * 0.93, 0); for (let i = 1; i <= n; i++) { const a = i / n * TAU, m = a - PI / n; g.quadraticCurveTo(Math.cos(m) * R * 1.13, Math.sin(m) * R * 1.13, Math.cos(a) * R * 0.93, Math.sin(a) * R * 0.93); } }
  function disc(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  /** A closed bud: green cup, coloured tip, pointing away from the stem. */
  function bud(g, r, a, col) { g.rotate(a); r *= 1.4; g.fillStyle = col; g.beginPath(); g.ellipse(r * 0.62, 0, r * 0.5, r * 0.36, 0, 0, TAU); g.fill(); g.fillStyle = '#5c9a3c'; g.beginPath(); g.ellipse(r * 0.2, 0, r * 0.42, r * 0.4, 0, 0, TAU); g.fill(); }
  /** A furled trumpet (morning glory by night, moonflower by day): a twisted spindle. */
  function furled(g, r, a, col, line) {
    g.rotate(a); g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(r * 0.4, -r * 0.38, r * 0.9, -r * 0.3, r * 1.25, 0); g.bezierCurveTo(r * 0.9, r * 0.3, r * 0.4, r * 0.38, 0, 0); g.fill();
    g.strokeStyle = line; g.lineWidth = 0.8; g.beginPath(); g.moveTo(r * 0.25, -r * 0.2); g.lineTo(r * 0.6, r * 0.24); g.moveTo(r * 0.6, -r * 0.27); g.lineTo(r * 0.95, r * 0.18); g.stroke();
  }
  function trumpet(g, f, r, open, c) {  // c: rim, inner ring, star, throat
    const R = r * (0.45 + 0.55 * open); g.rotate(f.rot);
    rim(g, 5, R); g.fillStyle = c[0]; g.fill(); g.strokeStyle = 'rgba(20,20,60,.3)'; g.lineWidth = 0.7; g.stroke();
    disc(g, 0, 0, R * 0.66, c[1]);
    g.strokeStyle = c[2]; g.lineWidth = Math.max(1, R * 0.13); g.lineCap = 'round'; g.beginPath(); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86); } g.stroke();
    disc(g, 0, 0, R * 0.24, c[3]);
  }

  // One drawing routine per species; the canvas is already moved to the flower. b: how grown the bud is, open: 0..1.
  const FLOWER = {
    flowers(g, f, b, open) {
      const k = WILD[f.c % WILD.length], r = f.r * b;
      if (open < 0.12) return bud(g, r, f.a, k[1]);
      const R = r * (0.45 + 0.55 * open); g.rotate(f.rot);
      petals(g, k[0], R, k[3]); g.fillStyle = k[1]; g.fill(); g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 0.6; g.stroke();
      disc(g, 0, 0, R * 0.25, k[2]);
    },
    morningglory(g, f, b, open) {
      const r = f.r * b;
      if (open < 0.12) return furled(g, r * 1.05, f.a, '#8f86e6', '#4a40b0');
      trumpet(g, f, r, open, [f.c % 3 ? '#4a48c8' : '#6a3fc0', f.c % 3 ? '#6f6ae6' : '#8a5fe0', 'rgba(226,170,255,.75)', '#fbf3c4']);
    },
    moonflower(g, f, b, open) {
      const r = f.r * b;
      if (open < 0.12) return furled(g, r * 0.9, f.a, '#e9efd2', '#9fb37c');
      trumpet(g, f, r, open, ['#ecebdc', '#fbfaf0', 'rgba(176,204,140,.8)', '#eef2b8']);
    },
    roses(g, f, b, open) {
      const k = ROSE[f.c % 3], r = f.r * b;
      if (open < 0.12) return bud(g, r, f.a, k[1]);
      const R = r * (0.5 + 0.5 * open); g.rotate(f.rot); g.lineWidth = 0.7; g.strokeStyle = 'rgba(40,0,10,.4)';
      discs(g, 5, R * 0.5, R * 0.52); g.fillStyle = k[0]; g.fill(); g.stroke();
      g.rotate(0.63); discs(g, 4, R * 0.27, R * 0.42); g.fillStyle = k[1]; g.fill(); g.stroke();
      disc(g, 0, 0, R * 0.28, k[2]); g.strokeStyle = k[0]; g.lineWidth = 0.9; g.beginPath(); g.arc(0, 0, R * 0.15, 0.4, 4.9); g.stroke();
    },
    pumpkin(g, f, b, open, p) {
      // a yellow flower first; it withers as the fruit under it swells until the cycle ends
      const fruit = U.span(p, f.tb + 0.08, 1), fl = b * (1 - U.span(fruit, 0.08, 0.35));
      if (fl > 0.05) { g.save(); g.rotate(f.rot); petals(g, 5, f.r * 0.62 * fl, 0.3); g.fillStyle = '#ffc928'; g.fill(); disc(g, 0, 0, f.r * 0.15 * fl, '#e8891a'); g.restore(); }
      if (fruit <= 0.03) return;
      const R = f.r * (0.22 + 0.78 * fruit), H = R * 0.82;
      g.fillStyle = '#6b7a2e'; g.beginPath(); g.moveTo(-R * 0.13, -H * 0.85); g.lineTo(-R * 0.04, -H * 1.3); g.lineTo(R * 0.2, -H * 1.26); g.lineTo(R * 0.13, -H * 0.85); g.fill();
      g.fillStyle = fruit < 0.3 ? '#9aa33a' : fruit < 0.55 ? '#d99a2a' : '#ea7a1c'; g.beginPath(); g.ellipse(0, 0, R, H, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(140,60,10,.55)'; g.lineWidth = 0.9; g.beginPath(); g.ellipse(0, 0, R * 0.62, H, 0, 0, TAU); g.moveTo(R * 0.22, 0); g.ellipse(0, 0, R * 0.22, H, 0, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,225,150,.45)'; g.beginPath(); g.ellipse(-R * 0.42, -H * 0.3, R * 0.16, H * 0.34, 0.3, 0, TAU); g.fill();
    },
    flytrap(g, f, b, open) {
      // seen from the side: two jaws hinged at the stalk, teeth along the mouth; shut, the teeth cross
      const r = f.r * (0.4 + 0.6 * b), ha = 0.07 + 0.6 * open; g.rotate(f.a);
      if (open > 0.3) { g.fillStyle = '#b23a55'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r * 1.02, -ha, ha); g.closePath(); g.fill(); }
      for (const s of [-1, 1]) {
        g.save(); g.rotate(s * ha);
        g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(r * 0.3, s * r * 0.8, r * 1.05, s * r * 0.7, r * 1.15, 0); g.closePath();
        g.fillStyle = s < 0 ? '#7cbc42' : '#63a336'; g.fill(); g.strokeStyle = '#3f6f22'; g.lineWidth = 0.7; g.stroke();
        g.strokeStyle = '#e2f5a8'; g.lineWidth = 0.9; g.beginPath(); for (let k = 0; k < 7; k++) { const x = r * (0.28 + k * 0.135); g.moveTo(x, 0); g.lineTo(x + r * 0.06, -s * r * 0.3); } g.stroke();
        g.restore();
      }
    },
    wisteria(g, f, b, open) {
      // a hanging raceme: florets open from the top down, small dark buds at the tip
      const L = f.L * b, n = Math.max(3, Math.round(L / 3)), rnd = U.rng(f.id * 977 + 5), hw = Math.min(7, f.L * 0.2), cls = [[], [], [], []];
      g.strokeStyle = '#8aa050'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(f.rot + 2.2) * 2.5, L * 0.9); g.stroke();
      for (let k = 0; k < n; k++) {
        const t = k / n, w = hw * (1 - t * 0.78), isOpen = open * 1.25 > t + 0.05;
        for (let j = 0, m = w > 3 ? 2 : 1; j < m; j++) cls[!isOpen ? 2 : t > 0.8 ? 3 : rnd() < 0.5 ? 0 : 1].push([(rnd() - 0.5) * 2 * w + Math.sin(t * 2.4 + f.rot) * 2.5, t * L + 2, isOpen ? 2.8 - t * 1.1 : 1.4]);
      }
      ['#c3a8f2', '#9f82e0', '#8f88a6', '#6a4fb8'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); for (const q of cls[i]) { g.moveTo(q[0] + q[2], q[1]); g.arc(q[0], q[1], q[2], 0, TAU); } g.fill(); });
    },
  };

  HP.fx.add('vine', {
    label: 'Vine',
    grows: true, days: 7,
    options: [{key: 'plant', label: 'Plant', type: 'select', default: 'flowers', choices: [['flowers', 'Wildflowers'], ['morningglory', 'Morning glory'], ['moonflower', 'Moonflower'],
      ['wisteria', 'Wisteria'], ['ivy', 'Ivy'], ['roses', 'Roses'], ['pumpkin', 'Pumpkins'], ['flytrap', 'Flytraps'], ['kelp', 'Kelp']]},
      {key: 'density', label: 'Amount', type: 'range', min: 0.3, max: 1, step: 0.05, default: 0.7}],

    create(ctx) {
      const r = ctx.rand, o = ctx.opts, plant = SPEC[o.plant] ? o.plant : 'flowers', sp = SPEC[plant], kelp = plant === 'kelp';
      const dens = U.clamp(+o.density || 0.7, 0.3, 1), W = ctx.w, H = ctx.h, btn = ctx.rects.filter(b => !b.hidden && !b.flat);
      const st = {plant, sp, stems: [], leaves: [], flowers: [], curls: [], max: 1, closed: shut[ctx.seed] || (shut[ctx.seed] = {}), glow: softDot('235,240,255')};
      if (!btn.length) return st;

      // Stems run down the middle of the gaps: half the narrowest gap away from every button's edge.
      let d = 8;
      for (const gp of ctx.gaps) { const mx = (gp.x1 + gp.x2) / 2, my = (gp.y1 + gp.y2) / 2; for (const b of btn) d = Math.min(d, Math.hypot(Math.max(b.x - mx, 0, mx - b.x - b.w), Math.max(b.y - my, 0, my - b.y - b.h))); }
      d = Math.max(3, d);
      const rings = btn.map(b => ring(b, d)), all = [];
      rings.forEach((R, ri) => R.forEach((q, pi) => { q.ri = ri; q.pi = pi; q.bad = q.x < 2 || q.y < 2 || q.x > W - 2 || q.y > H - 2 || btn.some((b, i) => i !== ri && inside(b, q.x, q.y, 1)); all.push(q); }));
      // outline points sorted into coarse squares, so a stem looking for a neighbour only searches nearby (the tablet is slow)
      const grid = {}, gk = (x, y) => Math.floor(x / 80) + Math.floor(y / 80) * 256;
      for (const q of all) (grid[gk(q.x, q.y)] = grid[gk(q.x, q.y)] || []).push(q);
      const at = (ri, pi) => { const R = rings[ri], n = R.length; return R[(pi % n + n) % n]; };

      // Which stem already grows where, so two stems do not share a gap.
      const occ = {}, CELL = 6, cell = (x, y) => Math.floor(x / CELL) + Math.floor(y / CELL) * 4096;
      const taken = (x, y, s) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const e = occ[cell(x + i * CELL, y + j * CELL)]; if (e && (e.s !== s || e.k < s.pts.length - 6)) return true; } return false; };
      const free = (c, s) => [2, 5].every(k => { const a = at(c.ri, c.pi + c.dir * k); return !a.bad && !taken(a.x, a.y, s); });
      const amp = d * 0.55;
      const put = (s, x, y, tx, ty, under) => {
        const k = s.pts.length, wob = s.nz(k * 0.14 + s.ph) * amp + Math.sin(k * 0.9 + s.ph) * amp * 0.3;  // the gentle wander that stops it reading as a grid
        occ[cell(x, y)] = {s, k}; s.pts.push({x: x + ty * wob, y: y - tx * wob, tx, ty, under});
      };
      const stems = st.stems, newStem = (depth, parent) => { const s = {pts: [], depth, parent, at: parent ? parent.pts.length - 1 : 0, nz: U.noise(ctx.seed + stems.length * 31 + 7), ph: r() * 100, birth: 0}; if (parent) s.pts.push(parent.pts[s.at]); stems.push(s); return s; };
      // where a stem would be heading a little further along a choice: kelp only ever wants up
      const lift = c => -at(c.ri, c.pi + c.dir * 7).ty * c.dir;
      const weight = c => (c.stay ? 1 : c.jump ? 1.6 : 1.1) * (kelp ? 0.05 + Math.pow(Math.max(0, lift(c) + 0.4), 2) * 3 : 1);
      const hop = (w, c) => {  // carry a walker (and its stem) onto another button's outline
        if (c.jump) { const a = w.s.pts[w.s.pts.length - 1], q = at(c.ri, c.pi), sd = (r() - 0.5) * 12; put(w.s, (a.x + q.x) / 2 + q.ty * sd, (a.y + q.y) / 2 - q.tx * sd, q.tx * c.dir, q.ty * c.dir, false); put(w.s, q.x, q.y, q.tx * c.dir, q.ty * c.dir, false); }
        w.ri = c.ri; w.pi = c.pi; w.dir = c.dir; w.grace = 4;
      };

      let walkers = [], born = [];
      const step = w => {
        const s = w.s;
        if (w.lead.length) { const q = w.lead.shift(); put(s, q.x, q.y, q.tx, q.ty, false); return true; }
        const cur = at(w.ri, w.pi);
        if (!cur.arc && !(w.grace > 0)) {
          // A corner or a junction: the stem may turn with its button, cross to the neighbour, or leap the crossing.
          const hx = cur.tx * w.dir, hy = cur.ty * w.dir, turning = at(w.ri, w.pi + w.dir).arc, best = {};
          for (let gi = 0; gi < 9; gi++) for (const q of grid[gk(cur.x + (gi % 3 - 1) * 80, cur.y + (Math.floor(gi / 3) - 1) * 80)] || []) {
            if (q.ri === w.ri || q.arc || q.bad) continue;
            const dx = q.x - cur.x, dy = q.y - cur.y, dd = dx * dx + dy * dy;
            if (dd > 6400) continue;
            const dot = q.tx * hx + q.ty * hy, dir = dot > 0 ? 1 : -1;
            if (dot * dir < 0.7) continue;
            let c = null;
            if (dd < 49) { if (turning || at(q.ri, q.pi + dir).arc) c = {ri: q.ri, pi: q.pi, dir, dd}; }
            else if (turning && dd > 900 && (dx * hx + dy * hy) / Math.sqrt(dd) > 0.9 && !btn.some(b => inside(b, cur.x + dx / 2, cur.y + dy / 2, 0))) c = {ri: q.ri, pi: q.pi, dir, dd, jump: true};
            if (c && (!best[q.ri] || best[q.ri].dd > dd)) best[q.ri] = c;
          }
          const stay = {ri: w.ri, pi: w.pi, dir: w.dir, stay: true}, pool = Object.keys(best).map(k => best[k]).filter(c => free(c, s));
          if (turning && free(stay, s)) pool.push(stay);
          let main = stay;
          if (turning) {
            if (!pool.length) return false;
            let sum = 0, pick; pool.forEach(c => { sum += weight(c); }); pick = r() * sum;
            main = pool[pool.length - 1]; for (const c of pool) { pick -= weight(c); if (pick <= 0) { main = c; break; } }
          }
          const rest = pool.filter(c => c !== main && (!kelp || lift(c) > 0.5));
          if (rest.length && w.left > 90 && stems.length < 70 && r() < [0.85, 0.6, 0.35, 0.15][Math.min(3, s.depth)] * (turning ? 1 : 0.7)) {
            const c = rest[Math.floor(r() * rest.length)], kid = {s: newStem(s.depth + 1, s), ri: w.ri, pi: w.pi, dir: w.dir, left: w.left * (0.4 + r() * 0.35), lead: [], grace: 5, down: 0};
            if (!c.stay) hop(kid, c);
            kid.grace = 5; w.left *= 0.85; born.push(kid);
          }
          if (!main.stay) hop(w, main);
        }
        const nxt = at(w.ri, w.pi + w.dir);
        if (nxt.bad || (!(w.grace > 0) && taken(nxt.x, nxt.y, s))) return false;
        put(s, nxt.x, nxt.y, nxt.tx * w.dir, nxt.ty * w.dir, nxt.side === 2);
        w.pi += w.dir; w.left -= STEP; w.grace--;
        if (kelp) { const v = nxt.ty * w.dir; w.down = v > 0.5 ? w.down + 4 : v > -0.5 ? w.down + 1 : 0; if (w.down > 13) return false; }  // kelp rises: a little sideways, never far, never down
        return w.left > 0;
      };

      // A root: in from a point on the screen's edge to the nearest button, then off along its outline.
      const root = (ex, ey) => {
        let q = null, bd = 170 * 170;
        for (const a of all) if (!a.bad && !a.arc && !taken(a.x, a.y, null)) { const dd = (a.x - ex) * (a.x - ex) + (a.y - ey) * (a.y - ey); if (dd < bd) { bd = dd; q = a; } }
        if (!q) return;
        const len = Math.sqrt(bd), n = Math.max(1, Math.round(len / STEP)), bend = (r() - 0.5) * Math.min(28, len * 0.4), tx = (q.x - ex) / len, ty = (q.y - ey) / len, lead = [];
        for (let i = 0; i < n; i++) { const t = i / n, b = Math.sin(t * PI) * bend; lead.push({x: ex + (q.x - ex) * t + ty * b, y: ey + (q.y - ey) * t - tx * b, tx, ty}); }
        let dir = r() < 0.5 ? 1 : -1;
        if (kelp) dir = lift({ri: q.ri, pi: q.pi, dir: 1}) + lift({ri: q.ri, pi: q.pi + 6, dir: 1}) > lift({ri: q.ri, pi: q.pi, dir: -1}) + lift({ri: q.ri, pi: q.pi - 6, dir: -1}) ? 1 : -1;
        const s = newStem(0, null); s.birth = r() * 220;
        walkers.push({s, ri: q.ri, pi: q.pi, dir, left: (kelp ? 380 + r() * 380 : 520 + r() * 560) * (0.5 + dens), lead, grace: 3, down: 0});
      };
      const nb = kelp ? Math.round(4 + 5 * dens) : Math.round(2 + 2.5 * dens);
      for (let i = 0; i < nb; i++) root(W * (i + 0.2 + r() * 0.6) / nb, H + 5);
      if (!kelp) {
        for (let i = 0, n = Math.round(0.6 + 1.6 * dens); i < n; i++) { root(-5, H * (0.15 + r() * 0.75)); root(W + 5, H * (0.15 + r() * 0.75)); }
        if (dens > 0.45) root(W * (0.2 + r() * 0.6), -5);
      }
      // all the stems grow together, a step each in turn, so no root takes the whole trellis before the others start
      const grow = () => { for (let guard = 0; walkers.length && guard < 3000; guard++) { born = []; walkers = walkers.filter(step).concat(born); } };
      grow();
      // Still thin? More roots come in from the edges until about this share of the gaps carries a stem.
      // Each comes in where the plant is thinnest: of a few random edge points, the one furthest from any stem.
      const want = all.length * STEP / 2 * (kelp ? 0.5 : 1.25) * dens, grown = () => stems.reduce((n, s) => n + s.pts.length, 0) * STEP;
      for (let i = 0; i < 24 && grown() < want; i++) {
        let bx = 0, by = 0, bd = -1;
        for (let j = 0; j < 6; j++) {
          const k = kelp ? 0 : Math.floor(r() * 4), t = 0.08 + r() * 0.84, x = k === 1 ? -5 : k === 2 ? W + 5 : W * t, y = k === 0 ? H + 5 : k === 3 ? -5 : H * t;
          let near = 1e9; for (const s of stems) for (let m = 0; m < s.pts.length; m += 3) near = Math.min(near, Math.abs(s.pts[m].x - x) + Math.abs(s.pts[m].y - y));
          if (near > bd) { bd = near; bx = x; by = y; }
        }
        root(bx, by); grow();
      }

      // Wisteria also runs along the top edge of the screen, so that its flowers have somewhere to hang from.
      if (plant === 'wisteria') for (const sg of [1, -1]) {
        const s = newStem(0, null), n = Math.round(W * (0.42 + r() * 0.14) / 12);
        for (let i = 0; i <= n; i++) s.pts.push({x: (sg > 0 ? -4 : W + 4) + sg * i * 12, y: 10 + s.nz(i * 0.25) * 5, tx: sg, ty: 0, under: true});
      }

      // How long each stem is and when in the plant's life it starts: a branch starts when its parent reaches it.
      for (const s of stems) {
        s.cum = [0]; for (let i = 1; i < s.pts.length; i++) s.cum.push(s.cum[i - 1] + Math.hypot(s.pts[i].x - s.pts[i - 1].x, s.pts[i].y - s.pts[i - 1].y));
        s.len = s.cum[s.cum.length - 1]; if (s.parent) s.birth = s.parent.birth + s.parent.cum[s.at];
        st.max = Math.max(st.max, s.birth + s.len);
      }

      // Leaves, flowers and tendrils: where along which stem, decided once.
      const open = (x, y) => !btn.some(b => inside(b, x, y, 0)), total = stems.reduce((n, s) => n + s.len, 0);
      const lGap = Math.max(sp.lGap, total / (sp.nL || 1)), fGap = sp.fGap && Math.max(sp.fGap, total / sp.nF);  // spacing widens rather than a big plant overloading the tablet
      for (const s of stems) {
        if (s.pts.length < 3) continue;
        const along = (gapPx, from, fn) => { let i = 0; for (let a = from; a < s.len - 3; a += gapPx * (0.65 + r() * 0.7)) { while (s.cum[i] < a) i++; fn(i); } };
        let side = r() < 0.5 ? 1 : -1;
        along(lGap, lGap * (0.3 + r() * 0.5), i => { side = -side; st.leaves.push({s, i, side, sz: 0.75 + r() * 0.5, tw: (r() - 0.5) * 0.5, c: Math.floor(r() * 3), turn: r(), c2: Math.floor(r() * 4)}); });
        const flower = (i, extra) => {
          const P = s.pts[i]; let sd = r() < 0.5 ? 1 : -1;
          if (!open(P.x + P.ty * sd * 16, P.y - P.tx * sd * 16) && open(P.x - P.ty * sd * 16, P.y + P.tx * sd * 16)) sd = -sd;  // toward open ground when there is some
          const nx = P.ty * sd, ny = -P.tx * sd, f = Object.assign({s, i, id: st.flowers.length, jit: r(), r: sp.fr * (0.85 + r() * 0.3), c: Math.floor(r() * 12), rot: r() * TAU, a: Math.atan2(ny, nx), x: P.x + nx * sp.off, y: P.y + ny * sp.off}, extra);
          f.cx = f.x; f.cy = f.y; st.flowers.push(f); return f;
        };
        if (plant === 'wisteria') {
          const chance = Math.min(0.4, sp.nF * 2.6 / stems.reduce((n, q) => n + q.pts.filter(P => P.under).length, 1));  // shared out over the whole plant
          for (let i = 2; i < s.pts.length - 1; i++) {
            const P = s.pts[i]; if (!P.under || r() > chance) continue;
            // how far it may hang: down to the next button, plus the rim it is allowed to cover; less over a button's label
            let room = 64; for (const b of btn) if (P.x > b.x && P.x < b.x + b.w && b.y + b.h > P.y + 6) room = Math.min(room, Math.max(0, b.y - P.y) + Math.min(b.w, b.h) * 0.15);
            if (room < 12) continue;
            const f = flower(i, {L: room * (0.7 + r() * 0.3)}); f.x = P.x; f.y = P.y + 1; f.cx = f.x; f.cy = f.y + f.L / 2; i += 2;
          }
        } else if (fGap) along(fGap, 26 + r() * fGap * 0.6, i => { const f = flower(i); if (plant === 'flytrap') { f.cx += Math.cos(f.a) * f.r * 0.6; f.cy += Math.sin(f.a) * f.r * 0.6; } });
        if (sp.tend) { along(70 / sp.tend, 30 + r() * 40, i => st.curls.push({s, i, side: r() < 0.5 ? 1 : -1, rad: 4.5 + r() * 4})); st.curls.push({s, i: s.pts.length - 1, side: r() < 0.5 ? 1 : -1, rad: 5 + r() * 3}); }
      }
      return st;
    },

    tap(st, x, y, ctx) {
      for (const f of st.flowers) {
        if (!f.open || Math.hypot(x - f.cx, y - f.cy) > Math.max(16, f.r + 4) || middle(ctx.rects, f.cx, f.cy)) continue;
        st.closed[f.id] = Date.now(); ctx.redraw(); setTimeout(ctx.redraw, 60500);  // one more drawing when it opens again
        return true;
      }
    },

    draw(g, st, ctx) {
      const p = ctx.progress, e = ctx.env, sp = st.sp, plant = st.plant, now = Date.now();
      if (p <= 0.003 || !st.stems.length) return;
      // Stems reach full length at 60% of the cycle; the rest of the time belongs to leaves, buds and flowers.
      const reach = st.max * Math.pow(Math.min(1, p / 0.6), 0.75), arrive = (s, i) => 0.6 * Math.pow((s.birth + s.cum[i]) / st.max, 1 / 0.75);
      g.lineCap = 'round'; g.lineJoin = 'round';

      // Stems: a dark line underneath so they hold against any backdrop, then the stem itself, thicker and woodier with age.
      const w0 = sp.w0 || 1.7, w1 = sp.w1 || 3, tips = [];
      for (let pass = 0; pass < 2; pass++) for (const s of st.stems) {
        const vis = Math.min(s.len, reach - s.birth); if (vis < 2 || s.pts.length < 2) continue;
        let m = 0; while (m < s.pts.length - 1 && s.cum[m + 1] <= vis) m++;
        const P = s.pts.slice(0, m + 1);
        if (m < s.pts.length - 1) { const a = s.pts[m], b = s.pts[m + 1], t = (vis - s.cum[m]) / (s.cum[m + 1] - s.cum[m]); P.push({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, tx: b.tx, ty: b.ty}); if (pass) tips.push(P[P.length - 1]); }
        let sx = P[0].x, sy = P[0].y;
        for (let i = 1; i < P.length; i += 4) {
          g.beginPath(); g.moveTo(sx, sy);
          for (let j = i; j < Math.min(P.length, i + 4); j++) {
            if (j === P.length - 1) g.lineTo(P[j].x, P[j].y);
            else { sx = (P[j].x + P[j + 1].x) / 2; sy = (P[j].y + P[j + 1].y) / 2; g.quadraticCurveTo(P[j].x, P[j].y, sx, sy); }
          }
          const age = p - arrive(s, Math.min(i, m)), w = w0 + w1 * age * (s.depth ? 0.8 : 1);
          g.lineWidth = pass ? w : w + 2.2; g.strokeStyle = pass ? sp.stem[age < 0.18 ? 0 : age < 0.45 ? 1 : 2] : 'rgba(12,26,10,.42)'; g.stroke();
        }
        if (pass && sp.thorns) {  // thorns come with the stem, long before any rose
          g.fillStyle = '#8a4a34'; g.beginPath();
          for (let i = 2; i < m; i += 2) { const q = P[i], sd = i % 4 ? 1 : -1, nx = q.ty * sd, ny = -q.tx * sd; g.moveTo(q.x - q.tx * 1.8, q.y - q.ty * 1.8); g.lineTo(q.x + nx * 5.5 + q.tx * 1.5, q.y + ny * 5.5 + q.ty * 1.5); g.lineTo(q.x + q.tx * 1.8, q.y + q.ty * 1.8); }
          g.fill();
        }
      }

      // Tendrils: thin curls reaching off the stem, wound tighter as they age.
      g.strokeStyle = sp.stem[0]; g.lineWidth = 1;
      for (const c of st.curls) {
        const k = U.span(p, arrive(c.s, c.i) + 0.02, arrive(c.s, c.i) + 0.2); if (k <= 0.05) continue;
        const P = c.s.pts[c.i], out = Math.atan2(-P.tx * c.side, P.ty * c.side) + 0.5 * c.side, f0 = out - c.side * PI / 2, ux = Math.cos(f0), uy = Math.sin(f0);
        // a spiral from three half-circles, each smaller and joined end to end; a young tendril has only the first
        let x = P.x + Math.cos(out) * c.rad * 1.5, y = P.y + Math.sin(out) * c.rad * 1.5, sweep = k * 3 * PI, sg = 1;
        g.beginPath(); g.moveTo(P.x, P.y); g.quadraticCurveTo(P.x + Math.cos(out - c.side * 0.6) * c.rad * 0.8, P.y + Math.sin(out - c.side * 0.6) * c.rad * 0.8, x, y);
        for (const rr of [c.rad, c.rad * 0.6, c.rad * 0.33]) {
          const a0 = sg > 0 ? f0 : f0 + PI, cx = x - ux * rr * sg, cy = y - uy * rr * sg, a = Math.min(PI, sweep);
          g.arc(cx, cy, rr, a0, a0 + c.side * a, c.side < 0);
          x = cx - ux * rr * sg; y = cy - uy * rr * sg; sg = -sg; sweep -= PI; if (sweep <= 0) break;
        }
        g.stroke();
      }

      // Leaves: each unfolds a little after the stem reaches its spot.
      const fall = plant === 'ivy' ? ({9: 0.45, 10: 0.85, 11: 1})[e.month] || 0 : 0;
      const leaf = (x, y, ang, L, col, rib) => {
        g.save(); g.translate(x, y); g.rotate(ang);
        if (sp.shape === 'pinnate') {  // wisteria: a spray of small leaflets along a rib
          g.strokeStyle = rib; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.stroke();
          g.fillStyle = col; g.beginPath();
          for (const t of [0.3, 0.55, 0.8]) for (const sd of [-1, 1]) { const a = sd * 0.95, cx = L * t + Math.cos(a) * L * 0.2, cy = Math.sin(a) * L * 0.2; g.moveTo(cx + Math.cos(a) * L * 0.2, cy + Math.sin(a) * L * 0.2); g.ellipse(cx, cy, L * 0.2, L * 0.085, a, 0, TAU); }
          g.moveTo(L * 1.36, 0); g.ellipse(L * 1.16, 0, L * 0.2, L * 0.085, 0, 0, TAU); g.fill();
        } else {
          const stalk = sp.shape === 'heart' || sp.shape === 'broad' ? L * 0.22 : 0;
          g.strokeStyle = rib; g.lineWidth = 0.9;
          if (stalk) { g.beginPath(); g.moveTo(0, 0); g.lineTo(stalk + 2, 0); g.stroke(); g.translate(stalk, 0); }
          leafPath(g, sp.shape, L); g.fillStyle = col; g.fill();
          g.beginPath(); g.moveTo(L * 0.12, 0); g.lineTo(L * 0.86, sp.shape === 'blade' ? -L * 0.03 : 0);
          if (sp.shape === 'ivy' || sp.shape === 'broad') { g.moveTo(L * 0.2, 0); g.lineTo(L * 0.52, -L * 0.34); g.moveTo(L * 0.2, 0); g.lineTo(L * 0.52, L * 0.34); }
          g.stroke();
          if (sp.shape === 'blade') disc(g, 3, 0, 3, '#c9b64a');  // the float at the foot of a kelp blade
        }
        g.restore();
      };
      const rib = plant === 'kelp' ? 'rgba(70,62,20,.6)' : 'rgba(20,60,24,.6)';
      for (const l of st.leaves) {
        const pa = arrive(l.s, l.i), k = U.span(p, pa + 0.004, pa + 0.13); if (k <= 0.08) continue;
        const P = l.s.pts[l.i];
        // kelp blades all lift toward the surface; other leaves point forward and out from the stem
        const ang = plant === 'kelp' ? Math.atan2(-P.tx * l.side * 0.8 - 0.75, P.ty * l.side * 0.8) + l.tw : Math.atan2(P.ty, P.tx) + l.side * (sp.shape === 'broad' ? 0.7 : 0.95) + l.tw;
        leaf(P.x, P.y, ang, sp.L * l.sz * k, l.turn < fall ? AUTUMN[l.c2] : sp.leaf[l.c], l.turn < fall ? 'rgba(90,30,10,.6)' : rib);
      }
      // a growing tip carries a pair of small pale leaves
      if (plant !== 'kelp' && sp.shape !== 'pinnate') for (const t of tips) { const a = Math.atan2(t.ty, t.tx); leaf(t.x, t.y, a + 0.5, 6, sp.stem[0], rib); leaf(t.x, t.y, a - 0.5, 6, sp.stem[0], rib); }

      // Flowers: a bud about mid-cycle, open toward the end, one after another.
      const fn = FLOWER[plant]; if (!fn) return;
      for (const f of st.flowers) {
        const tb = Math.max(arrive(f.s, f.i) + 0.1, 0.36 + f.jit * 0.14), b = U.span(p, tb, tb + 0.12);
        f.open = false; f.tb = tb;
        if (b <= 0.02) continue;
        let open = U.span(p, sp.t0 + f.jit * sp.t1, sp.t0 + f.jit * sp.t1 + 0.1);
        if (plant === 'morningglory' && e.night || plant === 'moonflower' && !e.night) open = 0;
        const c = st.closed[f.id]; if (c) { if (now - c < 60000) open = 0; else delete st.closed[f.id]; }
        f.open = !!sp.tap && open > 0.5;
        const P = f.s.pts[f.i];
        g.strokeStyle = sp.stem[0]; g.lineWidth = plant === 'flytrap' ? 2.4 : 1.4; g.beginPath(); g.moveTo(P.x, P.y); g.lineTo(f.x, f.y); g.stroke();
        if (plant === 'moonflower' && open > 0.5) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.4; g.drawImage(st.glow, f.x - f.r * 2.4, f.y - f.r * 2.4, f.r * 4.8, f.r * 4.8); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
        g.save(); g.translate(f.x, f.y); fn(g, f, b, open, p); g.restore();
      }
    },
  });

  // Mushrooms: clusters along the bottom of the screen and on top of the lowest buttons. They come up as small
  // closed buttons and open into caps over the cycle; after dark the caps glow.
  const CAPS = ['#cf3a2c', '#a9743f', '#e3c690', '#8d7fc0'];
  HP.fx.add('mushrooms', {
    label: 'Mushrooms',
    grows: true, days: 5,
    options: [{key: 'amount', label: 'Amount', type: 'range', min: 0.3, max: 1, step: 0.05, default: 0.7}],
    create(ctx) {
      const r = ctx.rand, amt = U.clamp(+ctx.opts.amount || 0.7, 0.3, 1), btn = ctx.rects.filter(b => !b.hidden && !b.flat), groups = [];
      const group = (x, y, tall, wide) => {
        const kind = Math.floor(r() * CAPS.length), list = [];
        for (let i = 0, n = 3 + Math.floor(r() * 4); i < n; i++) { const h = tall * (0.4 + r() * 0.6); list.push({dx: (r() - 0.5) * wide, h, cw: U.clamp(h * (0.3 + r() * 0.22), 5, 13), lean: (r() - 0.5) * 0.5, kind: r() < 0.85 ? kind : Math.floor(r() * CAPS.length), t0: 0.02 + r() * 0.45}); }
        list.sort((a, b) => b.h - a.h);  // tall ones behind
        const grass = []; for (let i = 0; i < 5; i++) grass.push([(r() - 0.5) * wide * 1.2, 5 + r() * 7, (r() - 0.5) * 6]);
        groups.push({x, y, list, grass});
      };
      // how tall they may get: the free strip above the ground they stand on, plus the rim of the button above
      const room = (x, y) => { let v = 40; for (const b of btn) if (x > b.x && x < b.x + b.w && b.y + b.h <= y + 1) v = Math.min(v, y - b.y - b.h + Math.min(b.w, b.h) * 0.15); return Math.max(12, v); };
      for (let i = 0, n = Math.max(2, Math.round(ctx.w / 150 * (0.4 + amt))); i < n; i++) { const x = ctx.w * (i + 0.2 + r() * 0.6) / n; group(x, ctx.h + 1, room(x, ctx.h), 46); }
      for (const b of btn) {
        if (btn.some(c => c !== b && c.y >= b.y + b.h - 1 && c.x < b.x + b.w && c.x + c.w > b.x) || r() > amt) continue;
        const x = b.x + b.w * (0.2 + r() * 0.6); group(x, b.y + 2, room(x, b.y), Math.min(40, b.w * 0.3));
      }
      return {groups, glow: softDot('120,255,205')};
    },
    draw(g, st, ctx) {
      const p = ctx.progress, night = ctx.env.night;
      g.lineCap = 'round';
      for (const gr of st.groups) {
        const up = U.span(p, 0.02, 0.3);
        if (up > 0.05) { g.strokeStyle = '#4f8f3a'; g.lineWidth = 1.3; g.beginPath(); for (const b of gr.grass) { g.moveTo(gr.x + b[0], gr.y); g.quadraticCurveTo(gr.x + b[0], gr.y - b[1] * up * 0.6, gr.x + b[0] + b[2], gr.y - b[1] * up); } g.stroke(); }
        for (const m of gr.list) {
          const k = U.span(p, m.t0, m.t0 + 0.5); if (k <= 0.02) continue;
          const h = m.h * (0.15 + 0.85 * k), cw = m.cw * (0.5 + 0.5 * k), ch = m.cw * (0.95 - 0.35 * k), x0 = gr.x + m.dx, tx = x0 + m.lean * h, ty = gr.y - h, sw = Math.max(2.5, cw * 0.5);
          g.strokeStyle = 'rgba(30,20,10,.35)'; g.lineWidth = sw + 1.6; g.beginPath(); g.moveTo(x0, gr.y); g.quadraticCurveTo(x0, gr.y - h * 0.5, tx, ty); g.stroke();
          g.strokeStyle = '#efe6cf'; g.lineWidth = sw; g.stroke();
          g.save(); g.translate(tx, ty); g.rotate(m.lean * 0.6);
          g.fillStyle = '#6a4a34'; g.beginPath(); g.ellipse(0, 0, cw * 0.95, ch * 0.3, 0, 0, TAU); g.fill();  // the gills, seen from just below
          g.beginPath(); g.moveTo(-cw, 0); g.bezierCurveTo(-cw, -ch * 1.3, cw, -ch * 1.3, cw, 0); g.quadraticCurveTo(0, ch * 0.12, -cw, 0);
          g.fillStyle = CAPS[m.kind]; g.fill(); g.strokeStyle = 'rgba(30,15,10,.4)'; g.lineWidth = 0.7; g.stroke();
          g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.ellipse(-cw * 0.35, -ch * 0.62, cw * 0.3, ch * 0.16, -0.5, 0, TAU); g.fill();
          if (m.kind === 0) { g.fillStyle = '#fff6ea'; g.beginPath(); for (const q of [[-0.5, -0.38, 0.13], [0.08, -0.7, 0.16], [0.52, -0.33, 0.12]]) { g.moveTo(q[0] * cw + q[2] * cw, q[1] * ch); g.arc(q[0] * cw, q[1] * ch, q[2] * cw, 0, TAU); } g.fill(); }
          g.restore();
          if (night) { const s = cw * 4.6; g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.4 * k; g.drawImage(st.glow, tx - s / 2, ty - ch * 0.5 - s / 2, s, s); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
        }
      }
    },
  });
})();
