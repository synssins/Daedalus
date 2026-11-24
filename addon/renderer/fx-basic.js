'use strict';
// Two small overlays that also serve as the pattern for the others: one drawn rarely (frost), one animated (fireflies).
(() => {
  const U = HP.fx.util;

  // Frost: ice ferns creep in from the screen's corners and from the buttons' corners when it is freezing outside.
  // The colder it is, the further they reach; by day they retreat. Nothing is remembered: the picture follows the
  // thermometer, so every tablet shows the same frost.
  HP.fx.add('frost', {
    label: 'Frost',
    options: [{key: 'amount', label: 'Amount', type: 'range', min: 0.2, max: 1, step: 0.05, default: 0.7},
      {key: 'always', label: 'Whatever the weather', type: 'bool', default: false}],
    create(ctx) {
      // every fern is decided once, from the seed: where it starts, which way it leans, how it branches
      const r = ctx.rand, ferns = [], corner = (x, y, ax, ay) => { for (let i = 0; i < 5; i++) ferns.push({x, y, a: Math.atan2(ay, ax) + (r() - 0.5) * 1.3, len: 90 + r() * 170, seed: r() * 1e9}); };
      corner(0, 0, 1, 1); corner(ctx.w, 0, -1, 1); corner(0, ctx.h, 1, -1); corner(ctx.w, ctx.h, -1, -1);
      for (const b of ctx.rects) if (!b.hidden && !b.flat) { ferns.push({x: b.x + 4, y: b.y + 4, a: Math.PI * 0.25 + (r() - 0.5), len: 26 + r() * 46, seed: r() * 1e9}); ferns.push({x: b.x + b.w - 4, y: b.y + b.h - 4, a: Math.PI * 1.25 + (r() - 0.5), len: 26 + r() * 46, seed: r() * 1e9}); }
      return {ferns};
    },
    draw(g, st, ctx) {
      const e = ctx.env, o = ctx.opts;
      // how hard it is freezing, 0 to 1: five degrees below freezing is full frost; daylight halves it
      const freezing = e.freezing == null ? 32 : e.freezing;
      let amt = o.always ? 1 : e.temp == null ? 0 : U.clamp((freezing - e.temp) / 5 + 0.25, 0, 1) * (e.cold ? 1 : 0);
      if (!o.always && !e.night) amt *= 0.5;
      amt *= o.amount;
      if (amt <= 0.01) return;
      // Ice grows as feathers: a rib, a few smaller ribs off it, and short straight barbs down both sides of each that
      // shrink toward the tip. Every line goes into one of four lots by how fine it is, and a lot is drawn in one go.
      // A rib's last stretch goes into the next finer lot, so tips fade out instead of stopping.
      const lots = [[], [], [], []];
      let room = 4000;  // the most path segments one drawing may spend: the tablet is slow
      const rib = (x, y, a, len, lot, rnd) => {
        const n = Math.max(2, Math.round(len / 8)), sl = len / n, curl = (rnd() - 0.5) * 0.05;
        let line = [x, y]; lots[lot].push(line);
        for (let i = 1; i <= n && room > 0; i++) {
          a += curl + (rnd() - 0.5) * 0.14; x += Math.cos(a) * sl; y += Math.sin(a) * sl; line.push(x, y); room--;
          if (i === Math.ceil(n * 0.6)) { line = [x, y]; lots[lot + 1].push(line); }
          const k = 1 - i / (n + 1);
          for (const s of [-1, 1]) {
            const bl = len * 0.17 * k * (0.5 + rnd()), ba = a + s * (0.85 + rnd() * 0.3);
            if (bl > 2.5) { lots[Math.min(3, lot + 2)].push([x, y, x + Math.cos(ba) * bl, y + Math.sin(ba) * bl]); room--; }
          }
          if (!lot && i % 4 === 0 && i < n) rib(x, y, a + (rnd() < 0.5 ? 1 : -1) * (0.75 + rnd() * 0.3), len * (0.44 - i / n * 0.26), 1, rnd);
        }
      };
      for (const f of st.ferns) rib(f.x, f.y, f.a, f.len * amt, 0, U.rng(f.seed));
      g.lineCap = 'round';
      [[1.1, 0.52], [0.8, 0.44], [0.6, 0.36], [0.45, 0.26]].forEach((s, i) => {
        g.lineWidth = s[0]; g.strokeStyle = 'rgba(228,244,255,' + s[1] + ')'; g.beginPath();
        for (const l of lots[i]) { g.moveTo(l[0], l[1]); for (let j = 2; j < l.length; j += 2) g.lineTo(l[j], l[j + 1]); }
        g.stroke();
      });
      // a pale bloom over the whole glass, stronger toward the corners
      const v = g.createRadialGradient(ctx.w / 2, ctx.h / 2, Math.min(ctx.w, ctx.h) * 0.25, ctx.w / 2, ctx.h / 2, Math.max(ctx.w, ctx.h) * 0.75);
      v.addColorStop(0, 'rgba(220,240,255,0)'); v.addColorStop(1, 'rgba(220,240,255,' + (0.20 * amt).toFixed(3) + ')');
      g.fillStyle = v; g.fillRect(0, 0, ctx.w, ctx.h);
    },
  });

  // Fireflies: after dusk, a few lights drift about, each blinking to its own slow rhythm. More on warm nights.
  HP.fx.add('fireflies', {
    label: 'Fireflies',
    live: true, fps: 12,
    options: [{key: 'count', label: 'How many', type: 'range', min: 4, max: 40, step: 1, default: 16},
      {key: 'always', label: 'By day too', type: 'bool', default: false}],
    create(ctx) {
      const r = ctx.rand, flies = [];
      for (let i = 0; i < 40; i++) flies.push({x: r() * ctx.w, y: r() * ctx.h, nx: U.noise(ctx.seed + i * 7 + 1), ny: U.noise(ctx.seed + i * 7 + 2), ph: r() * 6.28, sp: 0.6 + r() * 0.8, hue: 55 + r() * 30});
      // one soft dot, drawn once and stamped for every fly: far cheaper than a gradient per fly per frame
      const dot = document.createElement('canvas'); dot.width = dot.height = 48;
      const d = dot.getContext('2d'), gr = d.createRadialGradient(24, 24, 0, 24, 24, 24);
      gr.addColorStop(0, 'rgba(255,255,210,1)'); gr.addColorStop(0.25, 'rgba(230,255,120,.75)'); gr.addColorStop(1, 'rgba(160,255,60,0)');
      d.fillStyle = gr; d.fillRect(0, 0, 48, 48);
      return {flies, dot, shy: 0, sx: 0, sy: 0};
    },
    touch(st, x, y) { st.shy = 1; st.sx = x; st.sy = y; },  // a finger scares the nearby ones away for a moment
    draw(g, st, ctx, t, dt) {
      const e = ctx.env;
      if (!ctx.opts.always && !e.night) return;
      const warm = e.temp == null || e.freezing == null ? 1 : U.clamp((e.temp - e.freezing) / 30, 0.25, 1);
      const n = Math.round(ctx.opts.count * warm);
      st.shy = Math.max(0, st.shy - dt * 0.8);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n && i < st.flies.length; i++) {
        const f = st.flies[i];
        f.x += f.nx(t * 0.12 * f.sp) * 26 * dt; f.y += f.ny(t * 0.12 * f.sp) * 22 * dt;
        if (st.shy) { const dx = f.x - st.sx, dy = f.y - st.sy, d = Math.hypot(dx, dy) || 1; if (d < 220) { f.x += dx / d * 240 * st.shy * dt; f.y += dy / d * 240 * st.shy * dt; } }
        if (f.x < -20) f.x = ctx.w + 20; if (f.x > ctx.w + 20) f.x = -20; if (f.y < -20) f.y = ctx.h + 20; if (f.y > ctx.h + 20) f.y = -20;
        const blink = Math.max(0, Math.sin(t * 0.9 * f.sp + f.ph)); g.globalAlpha = blink * blink * 0.95;
        if (g.globalAlpha > 0.02) g.drawImage(st.dot, f.x - 12, f.y - 12, 24, 24);
      }
    },
  });
})();
