'use strict';
// Weather and sky overlays: snow that settles on the buttons, rain running down the glass, autumn leaves, aurora,
// fireworks on set nights, and fairy lights. All animated, all gentle: they share the screen with a working dashboard.
(() => {
  const U = HP.fx.util, TAU = Math.PI * 2;
  const amount = {key: 'amount', label: 'Amount', type: 'range', min: 0.2, max: 1, step: 0.05, default: 0.7};
  const solidOf = ctx => ctx.rects.filter(r => !r.hidden && !r.flat);
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
    live: true, fps: 12,
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
      return {flakes, ledges, layer: canvas(ctx.w, ctx.h), dirty: true, acc: 0, puffs: []};
    },
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
        for (let i = 0; i < n; i++) {
          const f = st.flakes[i];
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
        const c = L.cols[i] * (L.taper ? Math.pow(Math.sin(Math.PI * i / n), 0.6) : 1);
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
  // Small beads gather on the glass. In the open spaces some swell until they are too heavy and run down, wobbling
  // and leaving a wet trail. A running drop that lands on a button follows its top edge to the nearer corner and
  // goes down the gap beside it, so no trail is ever drawn across a button's face.
  const RAIN = {rainy: 1, pouring: 1.6, lightning: 1.6, 'snowy-rainy': 0.6};
  HP.fx.add('rain', {
    label: 'Rain',
    live: true, fps: 12,
    options: [{key: 'always', label: 'Whatever the weather', type: 'bool', default: false}, amount],
    create(ctx) { return {solid: solidOf(ctx), beads: [], runs: [], t: 0}; },
    draw(g, st, ctx, t, dt) {
      const hard = RAIN[ctx.env.weather] || (ctx.opts.always ? 1 : 0), w = ctx.w, h = ctx.h;
      if (!hard && !st.beads.length && !st.runs.length) return;
      const wantBeads = Math.min(44, Math.round(44 * ctx.opts.amount * hard)), wantRuns = hard ? Math.round(6 * ctx.opts.amount * hard) + 1 : 0;
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
        f.trail.push(f.x, f.y); if (f.trail.length > 44) f.trail.splice(0, 2);
        if (f.y > h + 20) st.runs.splice(i, 1);
      }
      // wet trails: the whole length faint, the newer half a little stronger
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = pass ? 'rgba(225,238,255,.26)' : 'rgba(225,238,255,.18)'; g.lineWidth = pass ? 3.4 : 2; g.beginPath();
        for (const f of st.runs) { const tr = f.trail, from = pass ? ((tr.length * 0.6) >> 1) * 2 : 0; if (tr.length - from < 4) continue; g.moveTo(tr[from], tr[from + 1]); for (let k = from + 2; k < tr.length; k += 2) g.lineTo(tr[k], tr[k + 1]); }
        g.stroke();
      }
      // the drops themselves: a clear body with a bright rim, and a glint on the larger ones
      g.fillStyle = 'rgba(210,230,255,.26)'; g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 0.8; g.beginPath();
      for (const b of st.beads) { g.moveTo(b.x + b.r, b.y); g.arc(b.x, b.y, b.r, 0, TAU); }
      for (const f of st.runs) { g.moveTo(f.x + f.r, f.y); g.arc(f.x, f.y, f.r, 0, TAU); }
      g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath();
      for (const b of st.beads) if (b.r > 2) g.rect(b.x - b.r * 0.5, b.y - b.r * 0.55, b.r * 0.45, b.r * 0.45);
      for (const f of st.runs) g.rect(f.x - f.r * 0.5, f.y - f.r * 0.55, f.r * 0.4, f.r * 0.4);
      g.fill();
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
        const sw = t * f.f + f.ph;
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
      return {ray, bands};
    },
    draw(g, st, ctx, t) {
      const e = ctx.env;
      if (!ctx.opts.always && !e.night) return;
      const strength = ctx.opts.amount * (e.cold ? 0.58 : 0.4);
      g.globalCompositeOperation = 'lighter';
      for (const b of st.bands) {
        const breathe = 0.7 + 0.3 * Math.sin(t * 0.07 + b.ph);
        for (let x = -24; x < ctx.w + 24; x += 24) {
          const u = x / ctx.w, y = b.y + b.amp * (Math.sin(u * b.f1 + t * b.sp + b.ph) + 0.5 * Math.sin(u * b.f2 - t * b.sp * 0.7 + b.ph * 2));
          // the rays flicker along the curtain and the whole curtain thins toward its ends
          const rays = 0.55 + 0.45 * Math.sin(u * 17 + t * 0.5 + b.ph) * Math.sin(u * 8.3 - t * 0.21), a = strength * breathe * rays * (0.35 + 0.65 * Math.sin(Math.PI * U.clamp(u * 0.9 + 0.05 + 0.1 * Math.sin(t * 0.04 + b.ph), 0, 1)));
          if (a < 0.02) continue;
          const tall = b.tall * (0.75 + 0.25 * rays);
          g.globalAlpha = a; g.drawImage(st.ray, x - 24, y - tall, 48, tall);
        }
      }
    },
  });

  // ---------- Fireworks ----------
  // On Independence Day and over New Year, after dark: a rocket climbs, bursts into a ball of sparks, and the sparks
  // sag and fade. A few a minute, with quiet in between.
  const FIRE = ['#ffd27a', '#ff7a9c', '#8dffb0', '#9ad0ff', '#c9a2ff', '#ffb36b'];
  HP.fx.add('fireworks', {
    label: 'Fireworks',
    live: true, fps: 12,
    options: [{key: 'always', label: 'Every night', type: 'bool', default: false}, amount],
    create() {
      return {rockets: [], bursts: [], next: 0.5, flash: glow(64, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,240,200,.5)'], [1, 'rgba(255,220,160,0)']])};
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
  const FAIRY = ['255,232,180', '255,150,205', '150,255,205', '200,165,255'];
  HP.fx.add('fairylights', {
    label: 'Fairy lights',
    live: true, fps: 12,
    options: [{key: 'count', label: 'How many', type: 'range', min: 6, max: 40, step: 1, default: 16},
      {key: 'always', label: 'By day too', type: 'bool', default: true}],
    create(ctx) {
      const r = ctx.rand, lights = [];
      for (let i = 0; i < 40; i++) { const x = r() * ctx.w, y = r() * ctx.h; lights.push({x, y, hx: x, hy: y, vx: 0, vy: 0, nx: U.noise(ctx.seed + i * 5 + 1), ny: U.noise(ctx.seed + i * 5 + 2), ph: r() * TAU, sp: 0.6 + r() * 0.8, k: i % 4, s: 24 + r() * 14, fond: r() < 0.65, look: r(), b: null}); }
      return {lights, dots: FAIRY.map(c => glow(48, [[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(' + c + ',.9)'], [0.5, 'rgba(' + c + ',.28)'], [1, 'rgba(' + c + ',0)']]))};
    },
    touch(st, x, y) {
      for (const f of st.lights) { const dx = f.x - x, dy = f.y - y, d = Math.hypot(dx, dy) || 1; if (d < 230) { const push = (230 - d) / 230 * 340; f.vx += dx / d * push; f.vy += dy / d * push; } }
    },
    draw(g, st, ctx, t, dt) {
      if (!ctx.opts.always && !ctx.env.night) return;
      const n = Math.min(st.lights.length, Math.round(ctx.opts.count));
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const f = st.lights[i];
        // every second or so a light looks round for the nearest button that is on
        f.look -= dt;
        if (f.look <= 0) {
          f.look = 1 + Math.random(); f.b = null;
          if (f.fond) { let best = 420; for (const b of ctx.rects) if (b.on && !b.hidden) { const d = Math.hypot(b.x + b.w / 2 - f.x, b.y + b.h / 2 - f.y); if (d < best) { best = d; f.b = b; } } }
        }
        let tx = f.hx, ty = f.hy;
        if (f.b && f.b.on) {  // circle just outside the button's edge, never over its label
          const a = f.ph + t * 0.1 * f.sp, b = f.b;
          tx = b.x + b.w / 2 + U.clamp(Math.cos(a) * 1.5, -1, 1) * (b.w / 2 + 9); ty = b.y + b.h / 2 + U.clamp(Math.sin(a) * 1.5, -1, 1) * (b.h / 2 + 9);
        }
        const ease = Math.min(1, dt * 1.2);
        f.vx += (f.nx(t * 0.1 * f.sp) * 12 + U.clamp((tx - f.x) * 0.35, -22, 22) - f.vx) * ease;
        f.vy += (f.ny(t * 0.1 * f.sp) * 12 + U.clamp((ty - f.y) * 0.35, -22, 22) - f.vy) * ease;
        f.x = U.clamp(f.x + f.vx * dt, -10, ctx.w + 10); f.y = U.clamp(f.y + f.vy * dt, -10, ctx.h + 10);
        const pulse = Math.sin(t * 0.8 * f.sp + f.ph), s = f.s * (1 + 0.12 * pulse);
        g.globalAlpha = 0.68 + 0.3 * pulse; g.drawImage(st.dots[f.k], f.x - s / 2, f.y - s / 2, s, s);
      }
    },
  });
})();
