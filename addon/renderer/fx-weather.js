'use strict';
// Weather and sky overlays: snow that settles on the buttons, rain running down the glass, autumn leaves, aurora,
// fireworks on set nights, and fairy lights. All animated, all gentle: they share the screen with a working dashboard.
(() => {
  const U = HP.fx.util, TAU = Math.PI * 2;
  const amount = {key: 'amount', label: 'Amount', type: 'range', min: 0.2, max: 1, step: 0.05, default: 0.7};
  const solidOf = ctx => ctx.rects.filter(r => !r.hidden && !r.flat);
  /** Is the point over the middle of a tile, further in than the rim an overlay may use? Taps there belong to the tile. */
  const deep = (ctx, x, y) => ctx.rects.some(b => !b.hidden && !b.flat && Math.min(x - b.x, b.x + b.w - x, y - b.y, b.y + b.h - y) > 0.15 * Math.min(b.w, b.h));
  const GLOW = ['light', 'wonder'];  // what every glowing thing here is to the other overlays
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  /** One soft round glow, drawn once and stamped many times: far cheaper than a gradient per light per frame. */
  const glow = (size, stops) => {
    const c = canvas(size, size), d = c.getContext('2d'), gr = d.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(s => gr.addColorStop(s[0], s[1])); d.fillStyle = gr; d.fillRect(0, 0, size, size); return c;
  };

  // ---------- Snow ----------
  // Flakes fall while it snows, and snow builds up on every button's top edge and along the bottom of the screen.
  // The piles are remembered here, outside the state, so a change of layout does not sweep the house clean.
  let piles = {};
  const SNOW = {snowy: 1, 'snowy-rainy': 1};
  HP.fx.add('snow', {
    label: 'Snow',
    live: true, fps: 12, covers: true,
    options: [{key: 'always', label: 'Whatever the weather', type: 'bool', default: false}, amount],
    create(ctx) {
      const r = ctx.rand, flakes = [], ledges = [], old = piles;
      piles = {};
      for (let i = 0; i < 130; i++) flakes.push({x: r() * ctx.w, y: r() * ctx.h, z: (i % 3) / 2, ph: r() * TAU, sp: 0.8 + r() * 0.4});
      // switched on in the middle of a snowfall: some has already settled
      const start = ctx.opts.always || SNOW[ctx.env.weather] ? 0.4 : 0;
      const ledge = (x1, x2, y, cap, drape, taper) => {
        const n = Math.max(3, Math.round((x2 - x1) / 20)), k = [x1 | 0, x2 | 0, y | 0].join(), bump = [];
        let cols = old[k];
        if (!cols || cols.length !== n + 1) { cols = []; for (let i = 0; i <= n; i++) cols.push(start); }
        piles[k] = cols;
        for (let i = 0; i <= n; i++) bump.push(0.6 + r() * 0.5);
        ledges.push({x1, x2, y, cap, drape, taper, cols, bump});
      };
      // on a button the snow sits mostly in the gap above it and only just laps over the edge
      for (const b of solidOf(ctx)) ledge(b.x + (b.r || 0) * 0.45, b.x + b.w - (b.r || 0) * 0.45, b.y, Math.min(12, 0.14 * Math.min(b.w, b.h)), 3, true);
      ledge(0, ctx.w, ctx.h, 24, 0, false);
      return {flakes, ledges, layer: canvas(ctx.w, ctx.h), dirty: true, acc: 0, puffs: [], gx: 0, gy: 0, gk: 0, wind: 0};
    },
    // a finger parts the falling flakes for a moment
    touch(st, x, y) { st.gx = x; st.gy = y; st.gk = 1; },
    // a tap on a deep pile sets it off: the whole of it slides off the nearer end of its ledge
    tap(st, x, y, ctx) {
      if (deep(ctx, x, y)) return;
      for (const L of st.ledges) {
        if (x < L.x1 || x > L.x2 || y < L.y - L.cap - 12 || y > L.y + 6) continue;
        let sum = 0; for (const c of L.cols) sum += c;
        if (sum / L.cols.length < 0.3) continue;
        const n = L.cols.length - 1, dx = (L.x2 - L.x1) / n, dir = x < (L.x1 + L.x2) / 2 ? -1 : 1, every = Math.ceil((n + 1) / 16);
        for (let i = 0; i <= n; i++) {
          if (i % every === 0 && st.puffs.length < 30) st.puffs.push({x: L.x1 + dx * i, y: L.y - 2 - L.cols[i] * L.cap * 0.5, vx: dir * (50 + Math.random() * 90), vy: -15 - Math.random() * 35, life: 1.3});
          L.cols[i] *= 0.06;
        }
        st.dirty = true; return true;
      }
    },
    // a pressed tile shakes: some of the snow on its top hops off
    press(st, rect) {
      for (const L of st.ledges) if (Math.abs(L.y - rect.y) < 1 && L.x1 >= rect.x - 1 && L.x2 <= rect.x + rect.w + 1) {
        const dx = (L.x2 - L.x1) / (L.cols.length - 1);
        for (let i = 0; i < L.cols.length; i++) if (L.cols[i] > 0.08) { if (i % 2 && st.puffs.length < 30) st.puffs.push({x: L.x1 + dx * i, y: L.y - 3, vx: (Math.random() - 0.5) * 70, vy: -50 - Math.random() * 40, life: 1}); L.cols[i] *= 0.7; }
        st.dirty = true;
      }
    },
    swipe(st, dir) { st.wind = -dir; },  // the screen slides away: the flakes are left behind for a moment
    // a finger dragged along a snowy edge brushes it clean, and the snow falls off as a little puff
    drag(st, x, y) {
      for (const L of st.ledges) {
        if (x < L.x1 - 10 || x > L.x2 + 10 || y < L.y - L.cap - 14 || y > L.y + 16) continue;
        const dx = (L.x2 - L.x1) / (L.cols.length - 1);
        for (let i = 0; i < L.cols.length; i++) if (L.cols[i] > 0.03 && Math.abs(L.x1 + dx * i - x) < 24) {
          if (st.puffs.length < 24) st.puffs.push({x: L.x1 + dx * i, y: L.y - 3, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 30, life: 1});
          L.cols[i] = 0; st.dirty = true;
        }
      }
    },
    draw(g, st, ctx, t, dt) {
      const e = ctx.env, o = ctx.opts, snowing = !!(o.always || SNOW[e.weather]);
      // a full pile takes about twenty minutes of snow; it lasts hours in the cold and minutes in a thaw
      const rate = (snowing ? 0.0012 * o.amount : e.cold ? -0.00012 : -0.0012) * dt;
      let left = false;
      for (const L of st.ledges) for (let i = 0; i < L.cols.length; i++) {
        const c = L.cols[i], v = U.clamp(c + rate, 0, 1);
        if (v !== c) { L.cols[i] = v; st.acc += Math.abs(v - c) / 60; }
        if (v > 0.02) left = true;
      }
      if (!snowing && !left && !st.puffs.length) return;
      // the piles change slowly, so they are painted on their own sheet only now and then
      if (st.acc > 0.01) { st.acc = 0; st.dirty = true; }
      if (st.dirty) { st.dirty = false; paintPiles(st); }
      g.drawImage(st.layer, 0, 0);
      if (snowing) {
        const n = Math.min(st.flakes.length, Math.round(110 * o.amount)), wet = e.weather === 'snowy-rainy' ? 1.7 : 1;
        st.gk = st.gk < 0.03 ? 0 : st.gk * Math.exp(-dt * 1.6); st.wind = Math.abs(st.wind) < 0.03 ? 0 : st.wind * Math.exp(-dt * 2.2);
        for (let i = 0; i < n; i++) {
          const f = st.flakes[i];
          if (st.gk) { const dx = f.x - st.gx, dy = f.y - st.gy, d2 = dx * dx + dy * dy; if (d2 < 16900 && d2 > 1) { const d = Math.sqrt(d2), p = (1 - d / 130) * 260 * st.gk * dt; f.x += dx / d * p; f.y += dy / d * p; } }
          if (st.wind) { f.x += st.wind * 280 * dt; if (f.x < -5) f.x = ctx.w + 5; }
          f.y += (20 + f.z * 38) * f.sp * wet * dt; f.x += (Math.sin(t * 0.6 * f.sp + f.ph) * 14 + 5) * dt;
          if (f.y > ctx.h + 5) { f.y = -5; f.x = Math.random() * ctx.w; }
          if (f.x > ctx.w + 5) f.x = -5;
        }
        // three depths: the far flakes small and faint, the near ones larger and brighter
        for (let k = 0; k < 3; k++) {
          const rad = 1.1 + k * 0.85;
          g.fillStyle = 'rgba(255,255,255,' + (0.5 + k * 0.2) + ')'; g.beginPath();
          for (let i = k; i < n; i += 3) { const f = st.flakes[i]; g.moveTo(f.x + rad, f.y); g.arc(f.x, f.y, rad, 0, TAU); }
          g.fill();
        }
      }
      if (st.puffs.length) {
        g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath();
        for (let i = st.puffs.length - 1; i >= 0; i--) {
          const p = st.puffs[i]; p.life -= dt * 1.1; p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.life <= 0) { st.puffs.splice(i, 1); continue; }
          g.moveTo(p.x + 2, p.y); g.arc(p.x, p.y, 1 + p.life * 1.6, 0, TAU);
        }
        g.fill();
      }
    },
  });
  function paintPiles(st) {
    const g = st.layer.getContext('2d');
    g.clearRect(0, 0, st.layer.width, st.layer.height);
    g.fillStyle = '#f5f9ff'; g.strokeStyle = 'rgba(120,150,205,.4)'; g.lineWidth = 1; g.lineJoin = 'round';
    for (const L of st.ledges) {
      const n = L.cols.length - 1, dx = (L.x2 - L.x1) / n, top = [], bot = [];
      let any = false;
      for (let i = 0; i <= n; i++) {
        // toward a button's rounded corners the pile thins to nothing
        const c = L.cols[i] * (L.taper ? Math.pow(Math.max(0, Math.sin(Math.PI * i / n)), 0.6) : 1);
        if (c > 0.02) any = true;
        top.push(L.y - c * L.cap * L.bump[i]); bot.push(L.y + L.drape * Math.min(1, c * 5));
      }
      if (!any) continue;
      g.beginPath(); g.moveTo(L.x1, bot[0]); g.lineTo(L.x1, top[0]);
      for (let i = 1; i <= n; i++) { const xa = L.x1 + dx * (i - 1), xb = L.x1 + dx * i; g.quadraticCurveTo(xa, top[i - 1], (xa + xb) / 2, (top[i - 1] + top[i]) / 2); }
      g.lineTo(L.x2, top[n]);
      for (let i = n; i >= 0; i--) g.lineTo(L.x1 + dx * i, bot[i]);
      g.closePath(); g.fill(); g.stroke();
    }
  }

  // ---------- Rain ----------
  // Rain falls past the dashboard as slanted streaks at three depths: far ones short and faint, near ones long and
  // bright. A near drop lands on a tile's top edge or on the bottom of the screen and leaves a small splash.
  // On the glass itself a few beads gather; in the open spaces some swell until they are too heavy and run down,
  // wobbling and leaving a wet trail. A running drop that lands on a button follows its top edge to the nearer corner
  // and goes down the gap beside it, so no trail is ever drawn across a button's face.
  // Kept cheap for the tablet: each depth is one path stroked once, and beads and splashes are stamped pictures.
  const RAIN = {rainy: 1, pouring: 1.6, lightning: 1.6, 'snowy-rainy': 0.6};
  // far, middle, near: streak length, fall speed, line width, strength
  const DEPTH = [[20, 380, 1, 0.3], [32, 520, 1.4, 0.44], [46, 680, 1.9, 0.62]];
  /** A bead of water on glass: a clear body, a bright rim and a glint. */
  function beadSprite() {
    const c = canvas(24, 24), d = c.getContext('2d');
    d.fillStyle = 'rgba(210,230,255,.28)'; d.strokeStyle = 'rgba(255,255,255,.55)'; d.lineWidth = 1.6;
    d.beginPath(); d.arc(12, 12, 10.5, 0, TAU); d.fill(); d.stroke();
    d.fillStyle = 'rgba(255,255,255,.85)'; d.fillRect(6, 5, 5, 5);
    return c;
  }
  /** A splash seen from the side: a low ring of water thrown up and a few droplets flying off it. */
  function splashSprite() {
    const c = canvas(48, 24), d = c.getContext('2d');
    d.strokeStyle = 'rgba(232,243,255,.9)'; d.lineWidth = 3; d.lineCap = 'round';
    d.beginPath(); d.moveTo(4, 22); d.quadraticCurveTo(9, 12, 15, 21); d.moveTo(44, 22); d.quadraticCurveTo(39, 12, 33, 21); d.moveTo(18, 21); d.lineTo(30, 21); d.stroke();
    d.fillStyle = 'rgba(240,248,255,.95)'; d.beginPath();
    for (const q of [[7, 8, 2.8], [24, 4, 3], [41, 9, 2.8], [16, 11, 2.2], [33, 12, 2.2]]) { d.moveTo(q[0] + q[2], q[1]); d.arc(q[0], q[1], q[2], 0, TAU); }
    d.fill();
    return c;
  }
  /** How hard it is raining as far as this overlay goes (0: not at all). */
  const raining = ctx => RAIN[ctx.env.weather] || (ctx.opts.always ? 1 : 0);
  HP.fx.add('rain', {
    label: 'Rain',
    live: true, fps: 12,
    options: [{key: 'always', label: 'Whatever the weather', type: 'bool', default: false}, amount],
    create(ctx) {
      const drops = [];
      for (let i = 0; i < 110; i++) drops.push({x: Math.random() * ctx.w * 1.2, y: Math.random() * ctx.h, z: i % 3, sp: 0.85 + Math.random() * 0.3, land: ctx.h + 60});
      return {solid: solidOf(ctx), beads: [], runs: [], t: 0, drops, splashes: [], bead: beadSprite(), splash: splashSprite(), odd: false, rips: []};
    },
    // a finger on the wet glass: a ripple spreads from it, the streaks nearby jump aside and the beads it disturbs let go and run
    touch(st, x, y, ctx) {
      if (!raining(ctx)) return;
      st.rips.push({x, y, a: 0}); if (st.rips.length > 4) st.rips.shift();
      for (const f of st.drops) { const dx = f.x - x, dy = f.y - y; if (dx * dx + dy * dy < 10000) f.x += dx < 0 ? -28 : 28; }
      for (let i = st.beads.length - 1; i >= 0 && st.runs.length < 6; i--) {
        const b = st.beads[i]; if (Math.hypot(b.x - x, b.y - y) > 110 || U.over(st.solid, b.x, b.y, 5)) continue;  // one on a tile's face stays: a run never crosses a face
        st.beads.splice(i, 1); st.runs.push({x: b.x, y: b.y, r: b.r + 2, big: 0, v: 90 + Math.random() * 60, ph: Math.random() * TAU, mode: 1, b: null, dir: 1, trail: []});
      }
    },
    // a pressed tile throws a row of splashes off its top edge
    press(st, rect, ctx) {
      if (!raining(ctx)) return;
      const rr = rect.r || 0;
      for (let i = 0; i < 5 && st.splashes.length < 16; i++) st.splashes.push({x: rect.x + rr + (rect.w - 2 * rr) * (i + 0.5) / 5, y: rect.y, a: 0});
    },
    draw(g, st, ctx, t, dt) {
      const hard = RAIN[ctx.env.weather] || (ctx.opts.always ? 1 : 0), w = ctx.w, h = ctx.h;
      if (!hard && !st.beads.length && !st.runs.length && !st.splashes.length && !st.rips.length) return;
      const wantBeads = Math.min(12, Math.round(12 * ctx.opts.amount * hard)), wantRuns = hard ? Math.min(3, Math.round(2 * ctx.opts.amount * hard) + 1) : 0;
      // The streaks. At most 60 in rain and 110 when it pours: that is plenty to read as rain, and each is one line.
      if (hard) {
        const heavy = hard > 1, n = Math.round((heavy ? 110 : 60 * hard) * Math.min(1, ctx.opts.amount / 0.7)), slant = heavy ? 0.24 : 0.14, long = heavy ? 1.3 : 1, step = Math.min(dt, 0.2);
        g.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          const D = DEPTH[k], len = D[0] * long, fall = D[1] * (heavy ? 1.2 : 1) * step;
          g.strokeStyle = 'rgba(214,232,255,' + Math.min(0.8, D[3] * (heavy ? 1.15 : 1)) + ')'; g.lineWidth = D[2]; g.beginPath();
          for (let i = k; i < n; i += 3) {
            const f = st.drops[i];
            f.y += fall * f.sp; f.x -= fall * f.sp * slant;
            if (f.y > f.land) {
              if (f.land <= h && st.splashes.length < 10) st.splashes.push({x: f.x, y: f.land, a: 0});
              // A near drop is aimed at a tile's top edge or at the bottom of the screen, and starts a short fall above it.
              // The others just come round again at the top.
              let x = Math.random() * w, y = h - 1;
              if (k === 2 && st.solid.length && Math.random() < 0.6) { const b = st.solid[Math.floor(Math.random() * st.solid.length)], rr = b.r || 0; x = b.x + rr + Math.random() * (b.w - 2 * rr); y = b.y; }
              const drop = k === 2 ? 160 + Math.random() * 420 : h + len;
              f.land = k === 2 ? y : h + len; f.y = f.land - drop; f.x = (k === 2 ? x : Math.random() * w * 1.2) + drop * slant;
              continue;
            }
            g.moveTo(f.x, f.y); g.lineTo(f.x + len * slant, f.y - len);
          }
          g.stroke();
        }
      }
      if (st.splashes.length) {
        for (let i = st.splashes.length - 1; i >= 0; i--) {
          const s = st.splashes[i], sz = 16 + 24 * s.a;
          g.globalAlpha = 1 - s.a; g.drawImage(st.splash, s.x - sz / 2, s.y - sz / 2 + 1, sz, sz / 2);
          s.a += dt * 3.6; if (s.a >= 1) st.splashes.splice(i, 1);
        }
        g.globalAlpha = 1;
      }
      for (let i = st.rips.length - 1; i >= 0; i--) {
        const r = st.rips[i]; r.a += dt * 1.7; if (r.a >= 1) { st.rips.splice(i, 1); continue; }
        g.strokeStyle = 'rgba(225,238,255,' + (0.6 * (1 - r.a)).toFixed(3) + ')'; g.lineWidth = 1.6;
        g.beginPath(); g.arc(r.x, r.y, 8 + 50 * r.a, 0, TAU); g.moveTo(r.x + 4 + 28 * r.a, r.y); g.arc(r.x, r.y, 4 + 28 * r.a, 0, TAU); g.stroke();
      }
      // new beads arrive a few at a time, never all at once
      st.t += dt * hard * 14;
      while (st.t > 1) {
        st.t -= 1;
        if (st.beads.length < wantBeads) st.beads.push({x: Math.random() * w, y: Math.random() * h, r: 0.4, max: 1.5 + Math.random() * 2.4, life: 6 + Math.random() * 16});
        if (st.runs.length < wantRuns && Math.random() < 0.3) {
          let x = Math.random() * w, y = Math.random() * h;
          for (let i = 0; i < 6 && U.over(st.solid, x, y, 5); i++) { x = Math.random() * w; y = Math.random() * h; }
          if (U.over(st.solid, x, y, 5)) y = Math.random() * 22;  // no open spot found: start on the top border
          st.runs.push({x, y, r: 1.5, big: 4.5 + Math.random() * 2.5, v: (55 + Math.random() * 70) * (hard > 1 ? 1.5 : 1), ph: Math.random() * TAU, mode: 0, b: null, dir: 1, trail: []});
        }
      }
      for (let i = st.beads.length - 1; i >= 0; i--) {
        const b = st.beads[i]; b.life -= dt;
        if (b.life <= 0) { st.beads.splice(i, 1); continue; }
        b.r = Math.min(b.max, b.r + dt * 0.9, b.life * 1.5);  // swells as it lands, shrinks away as it dries
      }
      for (let i = st.runs.length - 1; i >= 0; i--) {
        const f = st.runs[i];
        if (f.mode === 0) { f.r += dt * (0.8 + hard * 0.8); if (f.r >= f.big) f.mode = 1; continue; }
        // a running drop hesitates and hurries, like the real thing
        const v = f.v * (0.6 + 0.4 * Math.sin(t * 1.7 + f.ph));
        if (f.mode === 1) {
          const py = f.y;
          f.y += v * dt; f.x += (Math.sin(t * 2.3 + f.ph) * 16 + Math.sin(t * 5.1 + f.ph * 2) * 8) * dt;
          const b = U.over(st.solid, f.x, f.y, 3);
          if (b && py <= b.y - 2) { f.mode = 2; f.b = b; f.y = b.y - 3; f.dir = f.x < b.x + b.w / 2 ? -1 : 1; }
          else if (b) f.x = f.x < b.x + b.w / 2 ? b.x - 3.1 : b.x + b.w + 3.1;  // wobbled into a button's side: stay in the gap
        } else {
          const b = f.b, rr = b.r || 0;
          f.x += f.dir * v * 0.8 * dt;
          // round the corner with the button
          const past = U.clamp(f.dir < 0 ? b.x + rr - f.x : f.x - (b.x + b.w - rr), 0, rr);
          f.y = b.y - 3 + rr - Math.sqrt(rr * rr - past * past);
          if (f.x < b.x - 3 || f.x > b.x + b.w + 3) f.mode = 1;
        }
        if (st.odd) { f.trail.push(f.x, f.y); if (f.trail.length > 18) f.trail.splice(0, 2); }  // every other frame is enough for a smooth trail
        if (f.y > h + 20) st.runs.splice(i, 1);
      }
      st.odd = !st.odd;
      // wet trails, all in one stroke
      if (st.runs.length) {
        g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = 'rgba(225,238,255,.3)'; g.lineWidth = 2.8; g.beginPath();
        for (const f of st.runs) { const tr = f.trail; if (tr.length < 4) continue; g.moveTo(tr[0], tr[1]); for (let k = 2; k < tr.length; k += 2) g.lineTo(tr[k], tr[k + 1]); g.lineTo(f.x, f.y); }
        g.stroke();
      }
      // the drops themselves, each a stamp of the one bead picture
      for (const b of st.beads) g.drawImage(st.bead, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      for (const f of st.runs) g.drawImage(st.bead, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    },
  });

  // ---------- Falling leaves ----------
  // A handful of leaves drift down, swaying and turning over. A few lie on the button tops and along the bottom of
  // the screen, more of them as autumn goes on. The lying ones are decided by the seed: the same on every tablet.
  const LEAF = [['#c8451b', '#7d2408'], ['#e08a1e', '#99530a'], ['#e8b923', '#a37c0c'], ['#9c3220', '#5c160c'], ['#b06a24', '#6e3c0e']];
  function leafSprite(col, kind) {
    const c = canvas(48, 48), g = c.getContext('2d');
    g.fillStyle = col[0]; g.strokeStyle = col[1]; g.lineWidth = 1.4; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    if (kind) {  // five pointed lobes, like a maple
      const lobes = [[-1.57, 21], [-0.55, 18], [-2.59, 18], [0.45, 12], [-3.59, 12]].sort((a, b) => a[0] - b[0]);
      const pt = (a, d) => g.lineTo(24 + Math.cos(a) * d, 27 + Math.sin(a) * d);
      g.moveTo(24, 36);
      lobes.forEach((l, i) => { if (i) pt((l[0] + lobes[i - 1][0]) / 2, 7.5); pt(l[0] - 0.2, l[1] * 0.66); pt(l[0], l[1]); pt(l[0] + 0.2, l[1] * 0.66); });
      g.closePath();
    } else {  // a plain pointed leaf, like a beech
      g.moveTo(24, 4); g.bezierCurveTo(40, 14, 38, 34, 24, 41); g.bezierCurveTo(10, 34, 8, 14, 24, 4);
    }
    g.fill(); g.stroke();
    g.lineWidth = 1.1; g.beginPath(); g.moveTo(24, kind ? 10 : 8); g.lineTo(24, 46);
    for (let i = 0; i < 3; i++) { const y = 17 + i * 7; g.moveTo(24, y + 4); g.lineTo(24 - 8 + i, y); g.moveTo(24, y + 4); g.lineTo(24 + 8 - i, y); }
    g.stroke();
    return c;
  }
  HP.fx.add('leaves', {
    label: 'Falling leaves',
    live: true, fps: 12,
    options: [{key: 'always', label: 'All year', type: 'bool', default: false}, amount],
    create(ctx) {
      const r = ctx.rand, sprites = [], fall = [], lying = [];
      for (let k = 0; k < 2; k++) for (const col of LEAF) sprites.push(leafSprite(col, k));
      const pick = () => Math.floor(r() * sprites.length);
      for (let i = 0; i < 20; i++) fall.push({x: r() * ctx.w, y: r() * ctx.h, vy: 18 + r() * 24, amp: 18 + r() * 30, f: 0.5 + r() * 0.5, ph: r() * TAU, spin: (r() - 0.5) * 0.5, tum: 0.5 + r() * 0.9, s: 22 + r() * 10, k: pick()});
      // "at" is how far into autumn each lying leaf turns up
      const lie = (x, y) => lying.push({x, y, a: (r() < 0.5 ? 1 : -1) * (1.57 + (r() - 0.5) * 0.9), s: 19 + r() * 7, k: pick(), at: r()});
      for (const b of solidOf(ctx)) { const n = r() < 0.6 ? (r() < 0.3 ? 2 : 1) : 0, rr = b.r || 0; for (let i = 0; i < n; i++) lie(b.x + rr + r() * (b.w - 2 * rr), b.y - 3); }
      for (let i = 0; i < 16; i++) lie(r() * ctx.w, ctx.h - 5 - r() * 7);
      return {sprites, fall, lying, layer: canvas(ctx.w, ctx.h), key: ''};
    },
    // a touch is a gust: the falling leaves near it are blown away from the finger and lifted a little
    touch(st, x, y) {
      for (const f of st.fall) { const dx = f.x - x, dy = f.y - y, d = Math.hypot(dx, dy) || 1; if (d < 220) { const k = (1 - d / 220) * 320; f.gx = dx / d * k; f.gy = dy / d * k - 70; } }
    },
    swipe(st, dir) { for (const f of st.fall) { f.gx = -dir * (160 + Math.random() * 180); f.gy = -30; } },  // the screen slides away under them
    draw(g, st, ctx, t, dt) {
      const o = ctx.opts, m = ctx.env.month;
      if (!o.always && !(m >= 9 && m <= 11)) return;
      const season = o.always ? 1 : m === 9 ? 0.4 : m === 10 ? 0.75 : 1, key = season + '/' + o.amount;
      if (key !== st.key) {  // the lying leaves are still: painted once and kept
        st.key = key;
        const l = st.layer.getContext('2d'); l.setTransform(1, 0, 0, 1, 0, 0); l.clearRect(0, 0, ctx.w, ctx.h);
        for (const f of st.lying) if (f.at < season * (0.35 + o.amount * 0.65)) { l.setTransform(1, 0, 0, 1, 0, 0); l.translate(f.x, f.y); l.rotate(f.a); l.drawImage(st.sprites[f.k], -f.s / 2, -f.s / 2, f.s, f.s); }
      }
      g.drawImage(st.layer, 0, 0);
      const n = Math.round(20 * o.amount);
      for (let i = 0; i < n; i++) {
        const f = st.fall[i];
        f.y += f.vy * dt; if (f.y > ctx.h + 20) { f.y = -20; f.x = Math.random() * ctx.w; }
        if (f.gx || f.gy) { const k = Math.exp(-dt * 2.2); f.x += f.gx * dt; f.y += f.gy * dt; f.gx *= k; f.gy *= k; if (Math.abs(f.gx) + Math.abs(f.gy) < 3) f.gx = f.gy = 0; }
        const sw = t * f.f + f.ph + (f.gx || 0) * 0.02;  // a blown leaf tumbles faster
        g.save(); g.translate(f.x + Math.sin(sw) * f.amp, f.y + Math.abs(Math.cos(sw)) * -6);
        g.rotate(Math.sin(sw + 1) * 0.7 + t * f.spin + f.ph);
        g.scale(0.3 + 0.7 * Math.abs(Math.cos(t * f.tum + f.ph)), 1);  // turning over as it falls
        g.drawImage(st.sprites[f.k], -f.s / 2, -f.s / 2, f.s, f.s); g.restore();
      }
    },
  });

  // ---------- Aurora ----------
  // Curtains of light across the top of the screen: a bright green lower hem fading upward into violet. Each curtain
  // is one soft ray stamped side by side along a slowly waving line, added as light so buttons show through it.
  HP.fx.add('aurora', {
    label: 'Aurora',
    live: true, fps: 8,
    options: [{key: 'always', label: 'By day too', type: 'bool', default: false}, amount],
    create(ctx) {
      const r = ctx.rand, ray = canvas(32, 160), d = ray.getContext('2d');
      const v = d.createLinearGradient(0, 0, 0, 160);
      v.addColorStop(0, 'rgba(140,80,255,0)'); v.addColorStop(0.35, 'rgba(160,95,255,.68)'); v.addColorStop(0.7, 'rgba(50,235,170,.85)');
      v.addColorStop(0.9, 'rgba(130,255,160,1)'); v.addColorStop(1, 'rgba(130,255,160,0)');
      d.fillStyle = v; d.fillRect(0, 0, 32, 160);
      // soft sides, so neighbouring rays melt into one curtain
      const hz = d.createLinearGradient(0, 0, 32, 0); hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(0.5, '#000'); hz.addColorStop(1, 'rgba(0,0,0,0)');
      d.globalCompositeOperation = 'destination-in'; d.fillStyle = hz; d.fillRect(0, 0, 32, 160);
      const bands = [];
      for (let i = 0; i < 2; i++) bands.push({y: ctx.h * (0.24 + i * 0.13 + r() * 0.04), amp: ctx.h * (0.035 + r() * 0.025), f1: 4 + r() * 3, f2: 9 + r() * 5, ph: r() * TAU, sp: 0.09 + r() * 0.06, tall: ctx.h * (0.24 - i * 0.05)});
      return {ray, bands, rips: [], now: 0, post: {kind: 'aurora', tags: GLOW, x: ctx.w / 2, y: bands[0].y - bands[0].tall / 2, h: bands[0].tall}};
    },
    // a touch sends a slow bright ripple out along the curtains, both ways from the finger
    touch(st, x) { st.rips.push({x, t: st.now}); if (st.rips.length > 3) st.rips.shift(); },
    draw(g, st, ctx, t) {
      const e = ctx.env;
      st.now = t; while (st.rips.length && t - st.rips[0].t > 6) st.rips.shift();
      if (!ctx.opts.always && !e.night) return;
      ctx.scene.next.push(st.post);  // something in the sky to look up at
      const strength = ctx.opts.amount * (e.cold ? 0.58 : 0.4);
      g.globalCompositeOperation = 'lighter';
      for (const b of st.bands) {
        const breathe = 0.7 + 0.3 * Math.sin(t * 0.07 + b.ph);
        for (let x = -24; x < ctx.w + 24; x += 24) {
          const u = x / ctx.w, y = b.y + b.amp * (Math.sin(u * b.f1 + t * b.sp + b.ph) + 0.5 * Math.sin(u * b.f2 - t * b.sp * 0.7 + b.ph * 2));
          // the rays flicker along the curtain and the whole curtain thins toward its ends
          const rays = 0.55 + 0.45 * Math.sin(u * 17 + t * 0.5 + b.ph) * Math.sin(u * 8.3 - t * 0.21), a = strength * breathe * rays * (0.35 + 0.65 * Math.sin(Math.PI * U.clamp(u * 0.9 + 0.05 + 0.1 * Math.sin(t * 0.04 + b.ph), 0, 1)));
          if (a < 0.02) continue;
          let lift = 0;
          for (const r of st.rips) { const age = t - r.t, off = Math.abs(Math.abs(x - r.x) - age * 170); if (off < 80) lift += (1 - off / 80) * (1 - age / 6); }
          const tall = b.tall * (0.75 + 0.25 * rays) * (1 + 0.3 * lift);
          g.globalAlpha = Math.min(1, a * (1 + 2 * lift)); g.drawImage(st.ray, x - 24, y - tall, 48, tall);
        }
      }
    },
  });

  // ---------- Fireworks ----------
  // On Independence Day and over New Year, after dark: a rocket climbs, bursts into a ball of sparks, and the sparks
  // sag and fade. A few a minute, with quiet in between.
  const FIRE = ['#ffd27a', '#ff7a9c', '#8dffb0', '#9ad0ff', '#c9a2ff', '#ffb36b'];
  /** Is tonight a night for fireworks? */
  const showNight = ctx => { const e = ctx.env, d = e.date || new Date(), md = (d.getMonth() + 1) * 100 + d.getDate(); return !!(e.night && (ctx.opts.always || md === 704 || md === 1231 || md === 101)); };
  const tint = () => FIRE[Math.floor(Math.random() * FIRE.length)];
  HP.fx.add('fireworks', {
    label: 'Fireworks',
    live: true, fps: 12,
    options: [{key: 'always', label: 'Every night', type: 'bool', default: false}, amount],
    create() {
      return {rockets: [], bursts: [], next: 0.5, flash: glow(64, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,240,200,.5)'], [1, 'rgba(255,220,160,0)']])};
    },
    // A tap on open sky sends a rocket up from the bottom to burst where the finger was. Never over a tile, and the
    // tap is not kept: there is nothing of ours under the finger, and whatever else is there still gets it.
    tap(st, x, y, ctx) {
      if (!showNight(ctx) || U.over(ctx.rects, x, y) || st.rockets.length + st.bursts.length >= 4) return;
      st.rockets.push({x, y: ctx.h, to: Math.min(y, ctx.h - 30), dx: 0, col: tint()});
    },
    // a pressed tile gets a small crackle of sparks off its top edge
    press(st, rect, ctx) {
      if (!showNight(ctx) || st.rockets.length + st.bursts.length >= 4) return;
      const x = rect.x + rect.w / 2, y = rect.y - 3, sparks = [];
      for (let k = 0; k < 18; k++) { const a = -Math.random() * Math.PI, v = 70 + Math.random() * 80; sparks.push({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, inner: k < 6}); }
      st.bursts.push({x, y, col: tint(), sparks, age: 0.3, life: 1.3});  // age 0.3: no white flash for so small a thing
    },
    draw(g, st, ctx, t, dt) {
      const e = ctx.env, d = e.date || new Date(), md = (d.getMonth() + 1) * 100 + d.getDate();
      if (!e.night || !(ctx.opts.always || md === 704 || md === 1231 || md === 101)) return;
      st.next -= dt;
      if (st.next <= 0 && st.rockets.length + st.bursts.length < 3) {
        // about five a minute at the default amount; now and then two go up close together
        st.next = Math.random() < 0.22 ? 0.5 : 8.5 / ctx.opts.amount * (0.5 + Math.random());
        st.rockets.push({x: ctx.w * (0.12 + Math.random() * 0.76), y: ctx.h, to: ctx.h * (0.12 + Math.random() * 0.28), dx: (Math.random() - 0.5) * 40, col: FIRE[Math.floor(Math.random() * FIRE.length)]});
      }
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
      for (let i = st.rockets.length - 1; i >= 0; i--) {
        const r = st.rockets[i], vy = Math.max(160, (r.y - r.to) * 2.4);  // slows as it nears the top
        r.y -= vy * dt; r.x += r.dx * dt;
        g.strokeStyle = 'rgba(255,225,170,.7)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(r.x - r.dx * 0.12, r.y + vy * 0.12); g.stroke();
        if (r.y <= r.to + 4) {
          st.rockets.splice(i, 1);
          const sparks = [], big = 0.8 + Math.random() * 0.5;
          for (let k = 0; k < 56; k++) { const a = Math.random() * TAU, inner = k < 16, v = (inner ? 110 : 215) * big * (0.8 + Math.random() * 0.3); sparks.push({x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, inner}); }
          st.bursts.push({x: r.x, y: r.y, col: r.col, sparks, age: 0, life: 2.2 + Math.random() * 0.6});
        }
      }
      for (let i = st.bursts.length - 1; i >= 0; i--) {
        const b = st.bursts[i]; b.age += dt;
        if (b.age >= b.life) { st.bursts.splice(i, 1); continue; }
        ctx.scene.next.push(b.post || (b.post = {kind: 'firework', tags: GLOW, x: b.x, y: b.y, h: b.sparks.length > 20 ? 220 : 60}));  // for its short life, something to stare at
        const drag = Math.exp(-1.7 * dt), k = b.age / b.life;
        for (const s of b.sparks) { s.vx *= drag; s.vy = s.vy * drag + 38 * dt; s.x += s.vx * dt; s.y += s.vy * dt; }
        if (b.age < 0.3) { g.globalAlpha = 1 - b.age / 0.3; g.drawImage(st.flash, b.x - 45, b.y - 45, 90, 90); }
        g.globalAlpha = 1 - k * k * k; g.lineWidth = 2.4;
        // each spark is a short streak along its own path; the pale inner ring gives the ball some depth
        for (let pass = 0; pass < 2; pass++) {
          g.strokeStyle = pass ? '#fff3cf' : b.col; g.beginPath();
          for (const s of b.sparks) if (s.inner === !!pass) { g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * 0.16 - 0.5, s.y - s.vy * 0.16); }
          g.stroke();
        }
      }
    },
  });

  // ---------- Fairy lights ----------
  // Small soft lights in four pale colours wander the whole screen, each pulsing gently. Most of them like a button
  // that is on and circle its edge; the rest keep to their own corner. A touch scatters them and they drift back.
  //
  // Now and then they gather over a creature that can be carried off, a round portal opens beside it onto a green place
  // under another sky, and the creature goes through: a while later a second portal lets it out on another tile. With
  // nobody to take, the portal still opens, and a frond reaches out for a look round while a leaf blows through.
  //
  // Now and then one light leaves the others, goes down to a creature and leads it a way across the screen (the verb
  // lure). One that has come along for a while may find the portal opening in front of it at the end of the walk.
  const FAIRY = ['255,232,180', '255,150,205', '150,255,205', '200,165,255'];
  const PR = 46;  // the portal's radius for a figure 40 high; P.r is the radius of the one that is open
  /** A fern frond from x, y: heading a, curling by bend along its length. */
  function frond(g, x, y, a, len, bend, col, edge) {
    const n = Math.max(5, Math.round(len / 8)), step = len / n;
    let px = x, py = y, an = a;
    g.fillStyle = col; g.strokeStyle = edge; g.lineWidth = 1; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
    for (let i = 1; i < n; i++) {
      px += Math.cos(an) * step; py += Math.sin(an) * step; an += bend / n;
      const k = i / n, L = len * 0.3 * Math.min(1, k * 3 + 0.25) * (1 - k * 0.85);
      for (let sd = -1; sd <= 1; sd += 2) {
        const la = an + sd * 1.05;
        g.moveTo(px, py); g.quadraticCurveTo(px + Math.cos(la + sd * 0.55) * L * 0.55, py + Math.sin(la + sd * 0.55) * L * 0.55, px + Math.cos(la) * L, py + Math.sin(la) * L);
        g.quadraticCurveTo(px + Math.cos(la - sd * 0.45) * L * 0.6, py + Math.sin(la - sd * 0.45) * L * 0.6, px + Math.cos(an) * step * 0.7, py + Math.sin(an) * step * 0.7);
      }
    }
    g.fill(); g.stroke();
    px = x; py = y; an = a; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y);
    for (let i = 1; i <= n; i++) { px += Math.cos(an) * step; py += Math.sin(an) * step; an += bend / n; g.lineTo(px, py); }
    g.stroke();
  }
  /** One broad leaf standing up from x, y, leaning by a. */
  function bigLeaf(g, x, y, a, len, wid, col, edge) {
    g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.strokeStyle = edge; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(wid, -len * 0.25, wid * 0.9, -len * 0.75, 0, -len); g.bezierCurveTo(-wid * 0.9, -len * 0.75, -wid, -len * 0.25, 0, 0); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -len * 0.92);
    for (let i = 1; i < 5; i++) { const yy = -len * i / 5.5; g.moveTo(0, yy); g.lineTo(wid * 0.55, yy - len * 0.1); g.moveTo(0, yy); g.lineTo(-wid * 0.55, yy - len * 0.1); }
    g.stroke(); g.restore();
  }
  // The other place is painted once, as two sheets (sky and far plants; near plants, which sway) and a rim of light.
  let gate = null;
  function gateArt() {
    const S = 256, back = canvas(S, S), front = canvas(S + 32, S), d = back.getContext('2d'), f = front.getContext('2d');
    const sky = d.createLinearGradient(0, 0, 0, S * 0.66);
    sky.addColorStop(0, '#2b2170'); sky.addColorStop(0.45, '#b4529c'); sky.addColorStop(0.8, '#ffae6e'); sky.addColorStop(1, '#ffe7a6');
    d.fillStyle = sky; d.fillRect(0, 0, S, S);
    d.drawImage(glow(64, [[0, 'rgba(255,255,240,1)'], [0.3, 'rgba(255,250,215,.95)'], [0.36, 'rgba(255,235,170,.45)'], [1, 'rgba(255,220,150,0)']]), 112, 36, 110, 110);
    d.fillStyle = '#3d8f78'; d.beginPath(); d.moveTo(0, 150); d.bezierCurveTo(50, 118, 90, 160, 140, 140); d.bezierCurveTo(190, 120, 220, 150, S, 132); d.lineTo(S, S); d.lineTo(0, S); d.fill();
    d.fillStyle = '#226f42'; d.beginPath(); d.moveTo(0, 176); d.bezierCurveTo(60, 150, 110, 190, 160, 170); d.bezierCurveTo(200, 156, 230, 176, S, 166); d.lineTo(S, S); d.lineTo(0, S); d.fill();
    d.fillStyle = '#114d28'; d.fillRect(0, 214, S, 42);
    bigLeaf(d, 40, 240, -0.5, 146, 38, '#2c9446', '#0c4520'); bigLeaf(d, 214, 244, 0.45, 156, 40, '#2c9446', '#0c4520');
    bigLeaf(d, 100, 252, -0.12, 96, 26, '#37a54c', '#0c4520'); bigLeaf(d, 166, 252, 0.2, 90, 24, '#37a54c', '#0c4520');
    frond(d, 132, 252, -1.5, 110, 0.5, '#48b455', '#0f5226'); frond(d, 74, 252, -1.9, 92, -0.6, '#48b455', '#0f5226');
    bigLeaf(f, 34, 264, -0.6, 156, 44, '#62d052', '#14602a'); bigLeaf(f, 256, 264, 0.6, 156, 44, '#62d052', '#14602a');
    frond(f, 92, 262, -1.85, 158, -0.9, '#86e860', '#1b6a2a'); frond(f, 200, 262, -1.3, 158, 0.9, '#86e860', '#1b6a2a'); frond(f, 146, 264, -1.57, 72, 0.3, '#86e860', '#1b6a2a');
    f.fillStyle = '#ffb0de'; f.beginPath(); for (const q of [[60, 214], [118, 236], [226, 220], [176, 242]]) { f.moveTo(q[0] + 4, q[1]); f.arc(q[0], q[1], 4, 0, TAU); } f.fill();
    // the rim also shades the picture's edge, so the place looks set back behind the hole
    const rim = glow(256, [[0.5, 'rgba(0,30,20,0)'], [0.75, 'rgba(0,30,20,.6)'], [0.79, 'rgba(245,255,245,1)'], [0.85, 'rgba(150,255,205,.5)'], [1, 'rgba(150,255,205,0)']]);
    return {back, front, rim, leaf: leafSprite(['#7fdc58', '#1f6e2c'], 0)};
  }
  function drawGate(g, st, P, t) {
    const A = gate || (gate = gateArt()), e = P.k * P.k * (3 - 2 * P.k), r = P.r * e * (1 + 0.02 * Math.sin(t * 3.1)), z = r / 128;
    g.globalAlpha = 1; g.save(); g.beginPath(); g.arc(P.x, P.y, r, 0, TAU); g.clip();
    g.drawImage(A.back, P.x - r, P.y - r, 2 * r, 2 * r);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.85;
    for (let i = 0; i < 7; i++) { const s = (9 + 5 * Math.sin(t * 1.3 + i)) * e; g.drawImage(st.dots[i & 1 ? 0 : 2], P.x + Math.sin(t * 0.31 + i * 2.4) * r * 0.75 - s / 2, P.y + Math.cos(t * 0.23 + i * 1.7) * r * 0.6 - r * 0.1 - s / 2, s, s); }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.drawImage(A.front, P.x - r - (16 - Math.sin(t * 0.9) * 5) * z, P.y - r, 288 * z, 256 * z);
    g.restore();
    const R2 = r / 0.79 * (1 + 0.03 * Math.sin(t * 2.3));
    g.drawImage(A.rim, P.x - R2, P.y - R2, 2 * R2, 2 * R2);
    if (P.step !== 3 || P.went) return;
    // nobody went through: a frond reaches out and looks about, and a leaf blows out the other way
    const u = P.tm / 7, grow = U.span(u, 0.04, 0.3) * (1 - U.span(u, 0.72, 0.95)), v = P.side, lt = P.tm - 1.5;
    if (grow > 0.02) { g.save(); g.translate(P.x + v * P.r * 0.1, P.y + P.r * 0.5); g.scale(grow, grow); frond(g, 0, 0, -1.57 + v * (0.75 + 0.35 * Math.sin(P.tm * 1.7)), P.r * 1.9, v * (0.9 + 0.5 * Math.sin(P.tm * 1.7 + 1)), '#86e860', '#1b6a2a'); g.restore(); }
    if (lt > 0 && lt < 4.5) {
      const sz = 22 * Math.min(1, 0.4 + lt);
      g.save(); g.globalAlpha = Math.min(1, 4.5 - lt); g.translate(P.x - v * (10 + 48 * lt) + Math.sin(lt * 3) * 8, P.y - 30 * lt + 10 * lt * lt); g.rotate(lt * 2.2); g.scale(0.4 + 0.6 * Math.abs(Math.cos(lt * 2.6)), 1);
      g.drawImage(A.leaf, -sz / 2, -sz / 2, sz, sz); g.restore();
    }
  }
  /** The nearest creature within r pixels, person or animal; verb: only one that offers it ('carry': it can be carried off). */
  const figure = (ctx, x, y, r, verb) => {
    let best = null, bd = r;
    for (const a of ctx.scene.actors) if (!a.hid && a.tags.indexOf('creature') >= 0 && (!verb || typeof a[verb] === 'function')) { const d = Math.hypot(a.x - x, a.y - y); if (d < bd) { bd = d; best = a; } }
    return best;
  };
  /** A place on a tile top with room for a portal over it: {x, y}, y where feet stand. Not on the tile "not" if there is another. */
  function perch(st, ctx, not) {
    const s = st.solid;
    for (let i = 0; i < 12 && s.length; i++) {
      const b = s[Math.floor(Math.random() * s.length)], rr = b.r || 0;
      if ((b === not && i < 10) || (b.y < PR * 2 && i < 8)) continue;
      return {x: U.clamp(b.x + rr + Math.random() * (b.w - 2 * rr), PR + 8, ctx.w - PR - 8), y: b.y};
    }
    return {x: ctx.w * (0.2 + Math.random() * 0.6), y: ctx.h - 6};
  }
  /** One frame of the portal: where the lights are called to (P.lure), how far open it is, who goes through. */
  function portal(g, st, ctx, t, dt) {
    let P = st.P;
    if (!P) {
      // one that has followed the lead light is taken first, and need not wait for the clock: its walk ends at a portal
      st.wait -= dt;
      const L = st.led || (st.L && st.L.won >= 5 && st.wait <= 0 ? st.L : null), led = L ? figure(ctx, L.cx, L.cy, 160, 'carry') : null; st.led = null;
      if (!led && st.wait > 0) return;
      const who = led || figure(ctx, st.mx, st.my, 1e9, 'carry'), at = who || perch(st, ctx);
      // r: sized to what it takes, by its height (one on four legs is about twice as long as it is high); fs: the side to open on (ahead of one that was led), 0 = where there is room
      P = st.P = {step: 0, tm: 0, who: !!who, ax: at.x, ay: at.y, ah: who ? who.h || 40 : 0, r: who ? U.clamp((who.h || 40) * (who.tags.indexOf('animal') >= 0 ? 1.9 : 1.15), PR, 76) : PR, fs: led ? L.dir : 0, x: 0, y: 0, k: 0, lure: 1, tx: at.x, ty: at.y, tr: 22, left: 0, out: null, went: false, side: 1, seen: 0};
    }
    P.tm += dt; if (P.went) P.left -= dt;
    const top = y => Math.max(P.r + 6, y - P.r * 0.85), open = (x, y) => { P.x = P.tx = x; P.y = P.ty = y; P.tr = P.r + 9; P.lure = 2; P.tm = 0; P.step++; };
    if (P.who && P.step < 3) { const a = figure(ctx, P.ax, P.ay, 160, 'carry'); if (a) { P.ax = a.x; P.ay = a.y; P.ah = a.h || 40; } }  // it may walk on: keep over it
    if (P.step < 2) { P.tx = P.ax; P.ty = P.who ? P.ay - P.ah - 16 : top(P.ay); }
    if (P.step === 0) { if ((P.tm > 2 && st.far < 60) || P.tm > 10) { P.step = 1; P.tm = 0; } }  // gathering
    else if (P.step === 1) {  // circling overhead; then the portal opens beside it, on the side with more room
      if (P.tm > (P.who ? 2.5 : 0.8)) { P.side = P.fs || (P.ax < ctx.w / 2 ? 1 : -1); open(U.clamp(P.ax + (P.who ? P.side * (P.r + 14) : 0), P.r + 6, ctx.w - P.r - 6), top(P.ay)); }
    } else if (P.step === 2 || P.step === 6) {
      P.k = Math.min(1, P.k + dt / 1.2);
      if (P.k >= 1) {
        const a = P.step === 2 && P.who ? figure(ctx, P.ax, P.ay, 200, 'carry') : null;
        if (a) { const secs = 20 + Math.random() * 20; P.out = perch(st, ctx, U.over(st.solid, a.x, a.y + 4, 6)); P.went = U.act(a, 'carry', {x: P.x, y: P.y, secs, out: P.out}) === true; P.left = secs; }
        P.step++; P.tm = 0;
      }
    } else if (P.step === 3) { if (P.tm > (P.went ? 3.5 : 7)) P.step = 4; }  // open: time to be drawn in, or for the frond's look round
    else if (P.step === 4 || P.step === 8) {
      P.k = Math.max(0, P.k - dt / 0.9);
      if (P.k <= 0) { if (P.step === 4 && P.went) { P.step = 5; P.lure = 0; } else { st.P = null; st.wait = ctx.opts.now ? 20 : 240 + Math.random() * 360; return; } }
    } else if (P.step === 5) {  // away: the lights go home, then gather where it will come out
      if (P.left < 8) { P.lure = 1; P.tx = P.out.x; P.ty = top(P.out.y); P.tr = 22; }
      if (P.left <= 1.4) open(P.out.x, top(P.out.y));
    } else if (P.step === 7) {  // open until it has stood there a moment, or has left
      if (figure(ctx, P.out.x, P.out.y, 70)) P.seen += dt; else if (P.seen > 0) P.seen = 9;  // it has come out and run off: shut at once, so that it is not frightened again on its way back
      if (P.seen > 2.5 || P.tm > 14) P.step = 8;
    }
    if (P.k <= 0) return;
    ctx.scene.over.push(gg => drawGate(gg, st, P, t));  // in front of every kind, whatever the order they are drawn in
    if (P.k > 0.3) { const q = st.gatePost; q.x = P.x; q.y = P.y; q.h = P.r * 2; ctx.scene.next.push(q); }
  }
  /** One frame of the lead light (st.L): light number L.i goes down to a creature that offers lure, hovers a little ahead of
   *  it and moves off, calling it along. L.x, L.y is where the light is told to be; n is how many lights are out. */
  function leading(st, ctx, n, dt) {
    const acts = ctx.scene.actors, now = ctx.opts.now;
    let L = st.L;
    if (!L) {
      st.lwait -= dt; if (st.lwait > 0) return;
      let a = null, k = 0;  // any one of them, by chance
      for (const o of acts) if (!o.hid && o.tags.indexOf('creature') >= 0 && typeof o.lure === 'function' && Math.random() * ++k < 1) a = o;
      if (!a) { st.lwait = now ? 2 : 15; return; }
      L = st.L = {a, i: n - 1, step: 0, tm: 0, cx: a.x, cy: a.y, ch: a.h || 30, side: a.view !== 'top' && a.view !== 'free', dir: 1, x: a.x, y: a.y, gx: 0, gy: 0, say: 0, no: 0, won: 0, lost: 0, stall: 0, by: {x: 0, y: 0}};
      // where to: one seen from the side only along its own level (its tile top, or the ground); any other anywhere
      if (L.side) { const b = U.over(st.solid, a.x, a.y + 4, 6), lo = b ? b.x + 12 : 30, hi = b ? b.x + b.w - 12 : ctx.w - 30; L.dir = a.x - lo > hi - a.x ? -1 : 1; L.gx = U.clamp(a.x + L.dir * (220 + Math.random() * 200), lo, hi); }
      else { for (let j = 0; j < 5; j++) { L.gx = 60 + Math.random() * (ctx.w - 120); L.gy = 60 + Math.random() * (ctx.h - 120); if (Math.hypot(L.gx - a.x, L.gy - a.y) > 220) break; } L.dir = L.gx < a.x ? -1 : 1; }
    }
    const f = st.lights[L.i], home = () => { st.L = null; st.lwait = now ? 6 : 60 + Math.random() * 120; };
    if (L.i >= n) return home();
    // the same one as before while it is still about; if it is posted anew each frame, the nearest to where it was
    const a = acts.indexOf(L.a) >= 0 && !L.a.hid ? L.a : figure(ctx, L.cx, L.cy, 140, 'lure');
    if (a) { L.a = a; L.cx = a.x; L.cy = a.y; L.ch = a.h || 30; L.lost = 0; } else if ((L.lost += dt) > 3) return home();
    L.tm += dt;
    const hy = L.cy - L.ch * 0.8;
    if (L.step < 2) {  // down to it, then a moment hovering ahead of it
      L.x = L.cx + L.dir * 34; L.y = hy;
      if (L.step === 0 ? Math.hypot(f.x - L.x, f.y - L.y) < 30 || L.tm > 8 : L.tm > 2) { L.step++; L.tm = 0; }
      return;
    }
    // leading: it moves on only while the follower is close behind, and calls about once a second
    const dx = L.gx - L.x, dy = L.side ? 0 : L.gy - L.y, d = Math.hypot(dx, dy);
    if (L.side) L.y = hy;
    if (d > 0 && Math.hypot(L.x - L.cx, L.side ? 0 : L.y - hy) < 70) { const s = Math.min(d, 28 * dt); L.x += dx / d * s; L.y += dy / d * s; L.stall = 0; } else L.stall += dt;
    if ((L.say -= dt) <= 0) {
      L.say = 1; L.by.x = f.x; L.by.y = f.y;
      if (U.act(a, 'lure', L.by) === true) { L.no = 0; L.won++; } else if (++L.no >= 3) return home();  // it will not come: give up
    }
    if (d < 8 || L.stall > 6 || L.tm > 45) {  // the walk is over, or it can come no further: often a portal for one that came along
      if (L.won >= 5 && ctx.opts.portal && (now || Math.random() < 0.6)) st.led = {cx: L.cx, cy: L.cy, dir: L.dir};
      home();
    }
  }
  HP.fx.add('fairylights', {
    events: {portal: {label: 'Portal', run: st => { st.wait = 0; }}, lead: {label: 'Lead light', run: st => { st.lwait = 0; }}},
    label: 'Fairy lights',
    live: true, fps: 12,
    options: [{key: 'count', label: 'How many', type: 'range', min: 6, max: 40, step: 1, default: 16},
      {key: 'always', label: 'By day too', type: 'bool', default: true},
      {key: 'portal', label: 'Portal', type: 'bool', default: true}],
    create(ctx) {
      const r = ctx.rand, lights = [];
      for (let i = 0; i < 40; i++) { const x = r() * ctx.w, y = r() * ctx.h; lights.push({x, y, hx: x, hy: y, vx: 0, vy: 0, nx: U.noise(ctx.seed + i * 5 + 1), ny: U.noise(ctx.seed + i * 5 + 2), ph: r() * TAU, sp: 0.6 + r() * 0.8, k: i % 4, s: 24 + r() * 14, fond: r() < 0.65, look: r(), b: null}); }
      const posts = []; for (let i = 0; i < 4; i++) posts.push({kind: 'fairylight', tags: GLOW, x: 0, y: 0, h: 0});
      // wait: seconds to the next portal (minutes apart; at once when testing); lwait: to the next lead light
      return {lights, posts, gatePost: {kind: 'portal', tags: ['wonder', 'threat'], x: 0, y: 0, h: PR * 2}, solid: solidOf(ctx), P: null, wait: ctx.opts.now ? 1.5 : 120 + Math.random() * 240, L: null, led: null, lwait: ctx.opts.now ? 3 : 40 + Math.random() * 80, far: 0, mx: ctx.w / 2, my: ctx.h / 2, dots: FAIRY.map(c => glow(48, [[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(' + c + ',.9)'], [0.5, 'rgba(' + c + ',.28)'], [1, 'rgba(' + c + ',0)']]))};
    },
    touch(st, x, y) {
      for (const f of st.lights) { const dx = f.x - x, dy = f.y - y, d = Math.hypot(dx, dy) || 1; if (d < 230) { const push = (230 - d) / 230 * 340; f.vx += dx / d * push; f.vy += dy / d * push; } }
    },
    // the lights round a pressed tile flare and twinkle fast for a moment
    press(st, rect) {
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, reach = Math.max(rect.w, rect.h) / 2 + 70;
      for (const f of st.lights) if (f.b === rect || Math.hypot(f.x - cx, f.y - cy) < reach) f.fl = 1;
    },
    swipe(st, dir) { for (const f of st.lights) f.vx -= dir * 260; },  // left behind as the screen slides; they drift home
    draw(g, st, ctx, t, dt) {
      if (!ctx.opts.always && !ctx.env.night) return;
      const n = Math.min(st.lights.length, Math.round(ctx.opts.count));
      if (ctx.opts.portal) portal(g, st, ctx, t, dt); else st.P = null;
      const P = st.P, lure = P ? P.lure : 0;
      if (P) st.L = null; else leading(st, ctx, n, dt);  // a portal calls every light, the lead light too
      const L = st.L;
      let far = 0, mx = 0, my = 0;
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const f = st.lights[i];
        // every second or so a light looks round for the nearest button that is on
        f.look -= dt;
        if (f.look <= 0) {
          f.look = 1 + Math.random(); f.b = null;
          if (f.fond) { let best = 420; for (const b of ctx.rects) if (b.on && !b.hidden) { const d = Math.hypot(b.x + b.w / 2 - f.x, b.y + b.h / 2 - f.y); if (d < best) { best = d; f.b = b; } } }
        }
        const led = L && L.i === i;
        let tx = f.hx, ty = f.hy;
        if (led) { tx = L.x; ty = L.y + Math.sin(t * 3) * 5; }  // the lead light, bobbing
        else if (lure) {  // called to the portal: a flat ring over a head, or round the rim
          const a = f.ph + t * (lure === 2 ? 1.1 : 1.9) * f.sp;
          tx = P.tx + Math.cos(a) * P.tr; ty = P.ty + Math.sin(a) * P.tr * (lure === 2 ? 1 : 0.4); far += Math.abs(tx - f.x) + Math.abs(ty - f.y);
        } else if (f.b && f.b.on) {  // circle just outside the button's edge, never over its label
          const a = f.ph + t * 0.1 * f.sp, b = f.b;
          tx = b.x + b.w / 2 + U.clamp(Math.cos(a) * 1.5, -1, 1) * (b.w / 2 + 9); ty = b.y + b.h / 2 + U.clamp(Math.sin(a) * 1.5, -1, 1) * (b.h / 2 + 9);
        }
        const ease = Math.min(1, dt * (lure || led ? 3 : 1.2)), pull = lure || led ? 2.5 : 0.35, lim = lure ? 170 : led ? 110 : 22;  // they hurry to a portal
        f.vx += (f.nx(t * 0.1 * f.sp) * 12 + U.clamp((tx - f.x) * pull, -lim, lim) - f.vx) * ease;
        f.vy += (f.ny(t * 0.1 * f.sp) * 12 + U.clamp((ty - f.y) * pull, -lim, lim) - f.vy) * ease;
        f.x = U.clamp(f.x + f.vx * dt, -10, ctx.w + 10); f.y = U.clamp(f.y + f.vy * dt, -10, ctx.h + 10);
        const fl = f.fl > 0 ? (f.fl = Math.max(0, f.fl - dt * 1.3)) : 0;
        const pulse = Math.sin(t * 0.8 * f.sp + f.ph), s = f.s * (led ? 1.3 : 1) * (1 + 0.12 * pulse) * (1 + 0.7 * fl * Math.abs(Math.sin(t * 13 + f.ph)));
        g.globalAlpha = Math.min(1, 0.68 + 0.3 * pulse + fl); g.drawImage(st.dots[f.k], f.x - s / 2, f.y - s / 2, s, s);
        mx += f.x; my += f.y;
      }
      st.far = far / n; st.mx = mx / n; st.my = my / n;
      // a few of the lights stand for all of them to the other overlays; gathered at a portal, one is enough
      for (let i = 0, k = lure ? 1 : Math.min(4, n); i < k; i++) { const q = st.posts[i], f = st.lights[i]; q.x = f.x; q.y = f.y; q.h = f.s; ctx.scene.next.push(q); }
    },
  });

  // ---------- UFO ----------
  // At night a small saucer drifts in now and then, hovers over a creature that stands apart from the rest and takes it
  // up in a beam of light. A while later it comes back and sets it down near the same spot. The creature's own overlay
  // draws its going and its coming (the verb carry); the mark 'shorn' is for those with wool to lose. With nothing to
  // take, it hovers a moment, dark, and leaves: the beam comes on only over the one it takes or sets down.
  const UFO_TAGS = ['wonder', 'threat', 'light'];
  // The saucer is painted once at double size (the body is 84 x 44 on screen, its middle at 42, 25; the belly is 9 below).
  let ship = null;
  function shipArt(g) {
    const body = canvas(168, 88), d = body.getContext('2d');
    d.lineWidth = 2; d.strokeStyle = '#232c36';
    d.fillStyle = '#1b232c'; d.beginPath(); d.ellipse(84, 60, 28, 7, 0, 0, TAU); d.fill();  // the belly, which shows below the disc
    d.fillStyle = '#dcfff2'; d.beginPath(); d.ellipse(84, 64, 13, 2.5, 0, 0, TAU); d.fill();
    let gr = d.createLinearGradient(0, 33, 0, 63);
    gr.addColorStop(0, '#e4edf2'); gr.addColorStop(0.5, '#8ea1af'); gr.addColorStop(1, '#3c4957');
    d.fillStyle = gr; d.beginPath(); d.ellipse(84, 48, 76, 15, 0, 0, TAU); d.fill(); d.stroke();
    d.fillStyle = 'rgba(255,255,255,.3)'; d.beginPath(); d.ellipse(84, 44, 50, 8, 0, 0, TAU); d.fill();
    gr = d.createRadialGradient(74, 22, 2, 84, 34, 36);
    gr.addColorStop(0, '#f2fffb'); gr.addColorStop(0.35, '#8fe6d6'); gr.addColorStop(1, '#1f6c80');
    d.fillStyle = gr; d.beginPath(); d.ellipse(84, 42, 30, 30, 0, Math.PI, TAU); d.ellipse(84, 42, 30, 7, 0, 0, Math.PI); d.fill(); d.stroke();
    // the beam's fade is made once too, for a beam 100 long: each frame only stretches it
    const ray = g.createLinearGradient(0, 0, 0, 100);
    ray.addColorStop(0, 'rgba(226,255,242,.62)'); ray.addColorStop(1, 'rgba(226,255,242,.1)');
    return {body, ray, lamp: glow(24, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,214,130,.9)'], [1, 'rgba(255,190,90,0)']]), under: glow(64, [[0, 'rgba(200,255,235,.75)'], [1, 'rgba(200,255,235,0)']])};
  }
  /** The creature that can be carried off and stands furthest from every other creature: the lone one. */
  function lone(ctx) {
    let best = null, bd = -1;
    for (const a of ctx.scene.actors) {
      if (a.hid || a.tags.indexOf('creature') < 0 || typeof a.carry !== 'function' || a.x < 40 || a.x > ctx.w - 40 || a.y < 0 || a.y > ctx.h) continue;  // not one still walking in from outside
      let d = 400;  // beyond this they are all alone, and chance picks
      for (const o of ctx.scene.actors) if (o !== a && !o.hid && o.tags.indexOf('creature') >= 0) d = Math.min(d, Math.hypot(o.x - a.x, o.y - a.y));
      d += Math.random() * 40;
      if (d > bd) { bd = d; best = a; }
    }
    return best;
  }
  HP.fx.add('ufo', {
    label: 'UFO', events: {visit: {label: 'Visit', run: st => { st.wait = 0; st.fire = 1; }}},
    live: true, fps: 12, z: 2,
    options: [{key: 'always', label: 'By day too', type: 'bool', default: false}],
    create(ctx) {
      // S: the saucer while there is one (also while it is away with its catch); wait: seconds to the next visit (many minutes; at once when testing)
      return {S: null, wait: ctx.opts.now ? 2 : 240 + Math.random() * 600, post: {kind: 'ufo', tags: UFO_TAGS, view: 'free', x: 0, y: 0, h: 30}};
    },
    draw(g, st, ctx, t, dt) {
      let S = st.S;
      dt = Math.min(dt, 0.25);
      if (!S) {  // a visit under way is finished even if day breaks; a new one starts only at night
        if (!ctx.opts.always && !ctx.env.night && !st.fire) return;  // (fire: sent for by hand, day or night)
        if ((st.wait -= dt) > 0) return;
        st.fire = 0;
        const a = lone(ctx), left = Math.random() < 0.5;
        // step: 0 coming, 1 over it with the beam on, 2 it is going up, 3 leaving, 4 away, 5 nothing to take: sweeping, 6 coming back, 7 setting it down
        S = st.S = {step: 0, tm: 0, x: left ? -60 : ctx.w + 60, y: 40 + Math.random() * 80, vx: 0, vy: 0, a, ax: a ? a.x : ctx.w * (0.25 + Math.random() * 0.5), ay: a ? a.y : ctx.h * (0.45 + Math.random() * 0.4), ah: a ? a.h || 30 : 30,
          k: 0, on: false, bx: 0, went: false, left: 0, out: null, seen: 0};
      }
      S.tm += dt; if (S.went) S.left -= dt;
      const next = n => { S.step = n; S.tm = 0; };
      if (S.step < 2 && S.a) {  // it may walk on, or run: keep over it. The same one while it is about, else the nearest to where it was
        const a = ctx.scene.actors.indexOf(S.a) >= 0 && !S.a.hid ? S.a : figure(ctx, S.ax, S.ay, 160, 'carry');
        if (a) { S.a = a; S.ax = a.x; S.ay = a.y; S.ah = a.h || 30; }
      }
      const gone = S.step === 3, hx = S.step >= 6 ? S.out.x : S.ax, gy = S.step >= 6 ? S.out.y : S.ay;  // gy: the ground the beam falls on
      let tx = U.clamp(hx, 46, ctx.w - 46), ty = Math.max(40, gy - S.ah - 110);  // all of it on the screen: the beam leans to one at the very edge
      if (gone) { tx = S.x < ctx.w / 2 ? -200 : ctx.w + 200; ty = -90; }
      const near = Math.abs(tx - S.x) < 16 && Math.abs(ty - S.y) < 16;
      if (S.step === 0) { if (near || S.tm > 12) next(S.a ? 1 : 5); }
      else if (S.step === 1) {
        S.on = Math.abs(S.ax - S.x) < 28 && near;  // the beam comes on only once it is right over the one it wants
        if (S.tm > 1.4 && (near || S.tm > 6)) {
          const secs = 20 + Math.random() * 20, here = S.ax > 10 && S.ax < ctx.w - 10;  // one that ran off the screen got away
          S.out = {x: U.clamp(S.ax, 40, ctx.w - 40), y: S.ay}; S.went = here && U.act(S.a, 'carry', {x: S.x, y: S.y + 9, secs, out: S.out, mark: 'shorn'}) === true; S.left = secs;
          if (!S.went) S.ax = S.x;  // the beam straight down for its look round
          next(S.went ? 2 : 5);
        }
      } else if (S.step === 2) { if (S.tm > 2) { S.on = false; next(3); } }
      else if (S.step === 3) {  // off quickly; with a catch it stays out of sight until shortly before the time is up
        if (S.x < -70 || S.x > ctx.w + 70 || S.y < -60) { if (S.went) next(4); else { st.S = null; st.wait = ctx.opts.now ? 8 : 300 + Math.random() * 900; return; } }
      } else if (S.step === 4) { if (S.left < 5) next(6); return; }
      else if (S.step === 5) { S.on = false; S.bx = 0; if (S.tm > 2.5) next(3); }  // nothing to take: it hangs there a moment, dark, and goes
      else if (S.step === 6) { if (near || S.tm > 12) next(7); }
      else {  // the beam on until it stands there again, or a few seconds past its time
        S.on = near || S.k > 0;  // setting it down: on once it is over the spot, and it stays on until done
        if (S.left < 1 && figure(ctx, S.out.x, S.out.y, 70)) S.seen += dt;
        if (S.seen > 1.5 || S.left < -6) { S.on = false; S.went = false; next(3); }
      }
      S.k = U.clamp(S.k + (S.on ? dt / 0.5 : -dt / 0.3), 0, 1);
      const sp = gone ? 760 : 250, e = Math.min(1, dt * 4), pull = gone ? 3 : 2.2, wait = gone && S.k > 0;  // it leaves once the beam is out
      S.vx += ((wait ? 0 : U.clamp((tx - S.x) * pull, -sp, sp)) - S.vx) * e; S.vy += ((wait ? 0 : U.clamp((ty - S.y) * pull, -sp, sp)) - S.vy) * e;
      S.x += S.vx * dt; S.y += S.vy * dt;
      const x = S.x, y = S.y + Math.sin(t * 2.2) * 2.5;
      ctx.scene.over.push(g => {  // the saucer and its beam: in front of every kind, whatever the order they are drawn in
      const A = ship || (ship = shipArt(g));
      if (S.k > 0) {  // the beam: a pale cone from the belly to the ground, and the pool of light where it lands
        const len = Math.max(20, gy - y - 9), half = Math.max(26, S.ah * 0.9), bx = hx - S.x + S.bx;
        g.save(); g.translate(x, y + 9); g.scale(1, len / 100); g.globalAlpha = S.k; g.fillStyle = A.ray;
        g.beginPath(); g.moveTo(-9, 0); g.lineTo(9, 0); g.lineTo(bx + half, 100); g.lineTo(bx - half, 100); g.closePath(); g.fill(); g.restore();
        g.globalAlpha = S.k * 0.3; g.fillStyle = '#e2fff2'; g.beginPath(); g.ellipse(x + bx, y + 9 + len, half, half * 0.3, 0, 0, TAU); g.fill();
      }
      g.save(); g.translate(x, y); g.rotate(U.clamp(S.vx * 0.0007, -0.3, 0.3));
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.45 + 0.15 * Math.sin(t * 3) + 0.4 * S.k; g.drawImage(A.under, -38, 2, 76, 26);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.drawImage(A.body, -42, -25, 84, 44);
      // the ring of lamps goes round the rim (only the near side shows), a brighter one chasing through them
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {
        const th = i / 9 * TAU + t * 1.7, s = Math.sin(th); if (s < -0.3) continue;
        const sz = 7 + 4 * s; g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 7 - i * 2.1); g.drawImage(A.lamp, Math.cos(th) * 33 - sz / 2, s * 5.5 - sz / 2, sz, sz);
      }
      g.restore(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      });
      if (x > -40 && x < ctx.w + 40 && y > -20) { const q = st.post; q.x = x; q.y = y; ctx.scene.next.push(q); }
    },
  });
})();
