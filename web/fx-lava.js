'use strict';
// Lava: it wells up on top of the highest tiles, spreads along the tile's top to both ends, pours off the rounded
// shoulders, falls straight down the gap, splashes onto whatever is below, spreads and pours again, until it reaches
// a shallow band of water along the bottom of the screen, where it steams and piles up as dark rock.
//
// It is a real (small) simulation: a coarse grid of cells with the tiles drawn into it as solid, and grains of lava
// that fall, slide and creep sideways like something thick. The whole cycle is run once in create(), and for every
// cell the moment lava first arrived is remembered. After that nothing is simulated again: the picture at any point
// of the cycle is just "the cells lava had reached by then", so every tablet shows the same lava and the Studio's
// preview slider costs nothing.
(() => {
  const U = HP.fx.util, TAU = Math.PI * 2, STEPS = 3000, KF = 20, NONE = 65535;   // KF: the state of the pools is noted every so many steps
  const FALL = 0.4, SLOT = 0.15, REACH = 16;              // SLOT: slower still between two walls that drag on it; REACH:                           how far along a pool's surface a grain looks for a lower place                                       // heavy: a grain with room below only drops on some of the steps
  const solid = r => !r.hidden && !r.flat;
  const creep = r => 0.15 * Math.min(r.w, r.h);            // how far anything may reach in over a tile's edge
  const PAL = [[40, 13, 8], [150, 30, 6], [236, 92, 12], [255, 176, 44], [255, 246, 196]];   // crust, dark red, orange, yellow, white-hot
  const cache = [];                                        // the last few runs: create() is called again on every layout
  const FRONT_TAGS = ['threat', 'light'];

  /** One soft round dot, made once and stamped wherever something glows or steams. */
  function dot(stops) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const d = cv.getContext('2d'), gr = d.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(s => gr.addColorStop(s[0], s[1]));
    d.fillStyle = gr; d.fillRect(0, 0, 64, 64); return cv;
  }
  const sheet = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };

  /** The whole cycle, run once. Returns what was where and when. */
  function simulate(c) {
    const bs = c.rects.filter(solid), amt = c.opts.amount;
    let cs = 4; while (Math.ceil(c.w / cs) * Math.ceil(c.h / cs) > 60000) cs++;
    const W = Math.ceil(c.w / cs), H = Math.ceil(c.h / cs), N = W * H;
    const kind = new Uint8Array(N);                        // 0 free, 1 tile, 2 rock, 3 water
    const tid = new Uint16Array(N), occ = new Uint8Array(N), wet = new Uint8Array(N), byFall = new Uint8Array(N), nzv = new Uint8Array(N);
    const arr = new Uint16Array(N).fill(NONE), rockAt = new Uint16Array(N).fill(NONE), cnt = new Uint16Array(N), cont = new Uint16Array(W).fill(NONE);
    let sd = c.seed | 0; const rnd = () => { sd = Math.imul(sd, 1664525) + 1013904223 | 0; return (sd >>> 8) / 16777216; };
    for (let i = 0; i < N; i++) nzv[i] = rnd() * 256;
    // the tiles, with their real rounded corners, so lava slides off the shoulders by itself
    bs.forEach((b, n) => {
      const rr = Math.max(0, Math.min(b.r || 0, b.w / 2, b.h / 2));
      for (let y = Math.max(0, Math.floor(b.y / cs)); y < H && y * cs < b.y + b.h; y++) for (let x = Math.max(0, Math.floor(b.x / cs)); x < W && x * cs < b.x + b.w; x++) {
        const px = (x + 0.5) * cs, py = (y + 0.5) * cs, dx = Math.max(b.x + rr - px, 0, px - (b.x + b.w - rr)), dy = Math.max(b.y + rr - py, 0, py - (b.y + b.h - rr));
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h && dx * dx + dy * dy <= rr * rr) { kind[y * W + x] = 1; tid[y * W + x] = n + 1; }
      }
    });
    let low = 0; for (const b of bs) low = Math.max(low, b.y + b.h);
    const wh = c.opts.water ? U.clamp(c.h - low - 3, 10, 26) : 0, wrow = wh ? Math.min(H - 1, Math.round((c.h - wh) / cs)) : H, rtop = wrow - 2;
    for (let i = wrow * W; i < N; i++) if (!kind[i]) kind[i] = 3;
    // vents: on tiles near the top with nothing above them; a second one as far from the first as it can be
    const srcs = [];
    if (bs.length) {
      let cand = bs.map((b, i) => i).filter(i => bs[i].y < c.h * 0.45 && !bs.some(a => a.y + a.h <= bs[i].y && a.x < bs[i].x + bs[i].w && a.x + a.w > bs[i].x));
      if (!cand.length) cand = [bs.reduce((m, b, i) => b.y < bs[m].y ? i : m, 0)];
      const top = Math.min.apply(null, cand.map(i => bs[i].y)), high = cand.filter(i => bs[i].y < top + 60);
      for (let k = 0, n = rnd() < 0.2 + 0.9 * amt ? 2 : 1; k < n && cand.length; k++) {
        const i = k ? cand.reduce((m, j) => Math.abs(bs[j].x + bs[j].w / 2 - srcs[0].px) > Math.abs(bs[m].x + bs[m].w / 2 - srcs[0].px) ? j : m, cand[0]) : high[Math.floor(rnd() * high.length) % high.length];
        const b = bs[i], px = b.x + b.w * (0.3 + 0.4 * rnd()), x = U.clamp(Math.floor(px / cs), 0, W - 1); let y = U.clamp(Math.floor((b.y + b.h / 2) / cs), 0, H - 1);
        cand.splice(cand.indexOf(i), 1);
        while (y >= 0 && kind[y * W + x]) y--;             // the first free cell above the tile's top
        if (y >= 0) srcs.push({i: y * W + x, px: (x + 0.5) * cs, py: (y + 0.5) * cs, acc: 0, ph: rnd() * 6});
      }
    }
    // the grains. Each is a cell and the way it was last heading. A cell holds one grain and a grain only moves into
    // a free cell, so a gap passes only so much: when more arrives than fits through, it backs up and fills the funnel
    // above the gap as a pool, and drains again when less comes. A few grains are followed, to animate beads along later.
    const CAP = 6000, P = new Int32Array(CAP), D = new Int8Array(CAP), T = [], nxt = new Int32Array(CAP), head = new Int32Array(H), tracks = [];
    const last = new Uint16Array(N), came = new Uint16Array(N), cntK = new Uint8Array(N), seen = [], frames = [], stats = {emitted: 0, skin: 0, lost: 0, alive: 0, cells: 0, peak: 0};
    const rate = 0.4 + 1.0 * amt, every = Math.max(1, Math.round(rate * srcs.length * STEPS / 56));
    const free = j => kind[j] === 0 && !occ[j];
    // a slot: free cells with a tile (or the edge of the screen) within three cells on both sides. Lava squeezes down a slot
    // slowly, so a slot passes less than an open fall brings: one stream gets through, two back up
    const slot = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0, since = 0; x < W; x++) { const i = y * W + x; if (kind[i] === 1) { since = 0; continue; } since++; let r = 1; while (r <= 3 && x + r < W && kind[i + r] !== 1) r++; if (since <= 3 && r <= 3) slot[i] = 1; }
    let n = 0;
    for (let step = 1; step <= STEPS; step++) {
      for (const s of srcs) {
        s.acc = Math.min(3, s.acc + rate);
        let i = s.i; for (let q = 0; q < 3 && i >= W && occ[i] && kind[i - W] === 0; q++) i -= W;   // it wells up: onto the lava already standing on the vent
        if (s.acc >= 1 && !occ[i] && n < CAP) {
          s.acc -= 1; occ[i] = 1; came[i] = step; if (arr[i] === NONE) { arr[i] = step; seen.push(i); }
          P[n] = i; D[n] = 0; T[n] = stats.emitted++ % every ? null : (tracks.push({at: step, path: [i]}), tracks[tracks.length - 1]); n++;
        }
      }
      // lowest grains first, so that a column of lava can move down together
      head.fill(-1); for (let k = 0; k < n; k++) { const y = (P[k] / W) | 0; nxt[k] = head[y]; head[y] = k; }
      for (let y = H - 1; y >= 0; y--) for (let k = head[y]; k >= 0; k = nxt[k]) {
        const i = P[k], x = i % W, b = i + W, kb = y === H - 1 ? 1 : kind[b];
        let ni = i, gone = 0, fell = false;
        if (kb === 0 && occ[b] && (x === 0 || kind[i - 1] || occ[i - 1]) && (x === W - 1 || kind[i + 1] || occ[i + 1])) { if (cnt[i] < 65535) cnt[i]++; cntK[i]++; last[i] = step; if (T[k] && T[k].path.length < 1400) T[k].path.push(i); continue; }   // shut in on all sides, deep in a pool: nothing to decide
        if (kb === 3) {
          // into the water: steam, and now and then a lump of rock that sinks to the bottom of that column
          if (cont[x] === NONE) cont[x] = step;
          if (rnd() < 0.22) { let j = (H - 1) * W + x; while (j > i && kind[j] !== 3) j -= W; if (kind[j] === 3) { kind[j] = 2; rockAt[j] = step; } }
          gone = 2;
        } else if (kb === 0 && !occ[b]) { if (rnd() < (slot[b] ? SLOT : FALL)) { ni = b; fell = true; D[k] = 0; } }   // nothing underneath: straight down, and whichever way it splashes when it lands
        else if (kb === 2 && rnd() < 0.05) { if (y >= rtop) { kind[i] = 2; rockAt[i] = step; } gone = 2; }   // lava lying on rock cools into it; at the waterline that raises the mound
        else if (y === H - 1 && wet[i] && rnd() < 0.04) gone = 2;                                 // with no water it lies along the bottom of the screen and slowly sets there
        else if (kb !== 0 && !wet[i]) { wet[i] = 1; gone = 1; }                                   // the first grain onto bare tile or rock stays there as a skin
        else {
          // resting on tile, rock or other lava. On a tile it creeps along, thick and slow. On other lava it moves to any
          // lower place it can reach along the surface, which is what keeps a pool's top level instead of heaped
          const d = D[k] || (rnd() < 0.5 ? -1 : 1), afloat = kb === 0; let slope = false;
          // lava held up only by lava that is itself still on its way down just waits its turn: a stream stays a stream and does not fan out
          if (afloat && step - came[b] < (slot[b] ? 24 : 8)) slope = true;
          for (let q = 0; q < 2 && !slope && y < H - 1; q++) {
            const e = q ? -d : d;
            // a lower place right beside it: it slides off. A lower place further along an open surface of lava: it runs there
            for (let r = 1, j = i + e; r <= (afloat ? REACH : 1); r++, j += e) {
              const xx = x + e * r; if (xx < 0 || xx >= W || !free(j)) break;
              if (free(j + W)) { slope = true; if (r > 1) { if (rnd() < 0.7) { ni = j; D[k] = e; } } else if (rnd() < FALL) { ni = j + W; D[k] = e; } break; }
            }
          }
          if (!slope && rnd() < (afloat ? 0.12 : 0.5)) {
            const xx = x + d, wall = xx < 0 || xx >= W || kind[i + d] !== 0;
            if (!wall && !occ[i + d]) { ni = i + d; D[k] = d; }
            else if ((wall || !D[k] || rnd() < 0.3) && x - d >= 0 && x - d < W && free(i - d)) { ni = i - d; D[k] = -d; }
          }
        }
        if (gone) { occ[i] = 0; P[k] = -1; if (gone === 1) stats.skin++; else stats.lost++; continue; }
        if (ni !== i) { occ[i] = 0; occ[ni] = 1; P[k] = ni; came[ni] = step; if (arr[ni] === NONE) { arr[ni] = step; byFall[ni] = fell ? 1 : 0; seen.push(ni); } }
        if (cnt[ni] < 65535) cnt[ni]++;
        cntK[ni]++; last[ni] = step;
        if (T[k] && T[k].path.length < 1400) T[k].path.push(ni);
      }
      let m = 0; for (let k = 0; k < n; k++) if (P[k] >= 0) { P[m] = P[k]; D[m] = D[k]; T[m] = T[k]; m++; }
      n = m; if (n > stats.peak) stats.peak = n;
      if (step % KF === 0) {
        // two notes per cell: has lava been through lately (a stream), and was it full nearly all the time (a pool)
        const v = new Uint8Array((N >> 3) + 1), f = new Uint8Array((N >> 3) + 1);
        for (const i of seen) { if (step - last[i] <= 160) v[i >> 3] |= 1 << (i & 7); if (cntK[i] >= KF * 0.7) f[i >> 3] |= 1 << (i & 7); cntK[i] = 0; }
        frames.push({v, f});
      }
    }
    stats.alive = n; for (let i = 0; i < N; i++) stats.cells += occ[i];
    // what there is to draw: the skin on every surface lava crossed, and every cell a grain passed through
    const cells = [], rocks = [], hf = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (rockAt[i] !== NONE) rocks.push(i);
      if (arr[i] === NONE || kind[i] === 1) continue;
      cells.push(i); hf[i] = Math.min(255, cnt[i] / (STEPS - arr[i] + 150) * 255 * (wet[i] ? 2 : 5));   // how busy the cell stayed: busy lava stays hot
    }
    // the notes, kept only for the cells that ever held lava
    const M = cells.length, keys = frames.map(q => { const v = new Uint8Array((M >> 3) + 1), f = new Uint8Array((M >> 3) + 1); for (let j = 0; j < M; j++) { const i = cells[j]; if (q.v[i >> 3] >> (i & 7) & 1) v[j >> 3] |= 1 << (j & 7); if (q.f[i >> 3] >> (i & 7) & 1) f[j >> 3] |= 1 << (j & 7); } return {v, f}; });
    // scorch: tile cells that lava lay against, then, later, the cells behind them, as deep as the 15% rule allows
    const depth = new Uint8Array(N), scAt = new Uint16Array(N).fill(NONE), scorch = [], cr = bs.map(creep);
    let ring = [];
    for (const i of cells) {
      const x = i % W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = i + dy * W + dx; if (x + dx < 0 || x + dx >= W || j < 0 || j >= N || kind[j] !== 1 || cr[tid[j] - 1] < cs) continue;
        if (!depth[j]) { depth[j] = 1; ring.push(j); } if (arr[i] < scAt[j]) scAt[j] = arr[i];
      }
    }
    for (let d = 2; ring.length; d++) {
      scorch.push.apply(scorch, ring); const next = [];
      for (const i of ring) for (const j of [i - W, i + W, i - 1, i + 1]) {
        if (j < 0 || j >= N || Math.abs(j % W - i % W) > 1 || kind[j] !== 1 || tid[j] !== tid[i] || d * cs > cr[tid[j] - 1] || (depth[j] && depth[j] < d)) continue;
        if (!depth[j]) { depth[j] = d; next.push(j); } scAt[j] = Math.min(scAt[j], Math.min(STEPS, scAt[i] + 250 + nzv[j]));
      }
      ring = d < 3 ? next : [];
    }
    // where it met the water: neighbouring columns count as one place
    const contacts = [];
    for (let x = 0; x < W; x++) if (cont[x] !== NONE) { const l = contacts[contacts.length - 1]; if (l && x - l.x1 <= 5) { l.x1 = x; l.at = Math.min(l.at, cont[x]); } else contacts.push({x0: x, x1: x, at: cont[x], ph: rnd()}); }
    for (const q of contacts) q.x = (q.x0 + q.x1 + 1) / 2 * cs;
    return {cs, W, H, N, kind, wet, arr, byFall, rockAt, nzv, hf, depth, scAt, cells, keys, rocks, scorch, contacts, srcs, wh, wrow, occ, stats, pm: new Uint8Array(N),
      tracks: tracks.filter(t => t.path.length > 12).map(t => ({at: t.at, path: new Uint16Array(t.path)}))};
  }

  // The early part of the run is shown stretched out (the first rush down to the water takes about a third of
  // the cycle on screen), the long steady pouring afterwards squeezed.
  /** Everything that holds still between two looks at the clock. The lava is painted one grid cell to a pixel,
   *  blown up smoothly, and then its soft edge is hardened, so the cells melt into rounded blobs instead of squares. */
  function paint(g, st, c) {
    const m = st.sim, W = m.W, H = m.H, cs = m.cs, p = c.progress, S = Math.pow(p, 1.5) * STEPS, wh = m.wh, FW = W * cs, FH = H * cs;
    const img = st.img, px = img.data, sc = st.simg, sp = sc.data;
    px.fill(0); sp.fill(0);
    const put = (j, q, a) => { const o = j * 4; if (px[o + 3] < a) { px[o] = q[0]; px[o + 1] = q[1]; px[o + 2] = q[2]; px[o + 3] = a; } };
    const cracks = [], plates = [], rgb = [0, 0, 0], tone = (h, q) => { const f = U.clamp(h, 0, 1) * 4, k = Math.min(3, f | 0), u = f - k; for (let n = 0; n < 3; n++) q[n] = PAL[k][n] + (PAL[k + 1][n] - PAL[k][n]) * u; };
    // which cells hold lava at this moment: the skin stays for good, a stream shows while grains still come through,
    // a pool shows while it is full
    const key = m.keys[U.clamp(Math.ceil(S / KF) - 1, 0, m.keys.length - 1)], pm = m.pm, surf = [];
    pm.fill(0);
    if (key) for (let n = 0; n < m.cells.length; n++) if (key.f[n >> 3] >> (n & 7) & 1 && m.arr[m.cells[n]] <= S) pm[m.cells[n]] = 1;
    // a pool's top is noted a little ragged (a cell that was full most of the time, but not quite); close the one- and two-cell notches
    if (key) for (const i of m.cells) if (!pm[i] && m.kind[i] === 0 && m.arr[i] <= S && i % W > 0 && pm[i - 1] === 1 && (pm[i + 1] === 1 || pm[i + 2] === 1) && i + W < m.N && (pm[i + W] || m.kind[i + W] === 1)) pm[i] = 1;
    if (key) for (let n = 0; n < m.cells.length; n++) {
      const i = m.cells[n], at = m.arr[i], pool = pm[i]; if (at > S || !(m.wet[i] || pool || key.v[n >> 3] >> (n & 7) & 1)) continue;
      // colour by age: white-hot when it has just arrived, then orange, red, dark crust; but lava that stays busy stays hot
      const x = i % W, y = (i / W) | 0, a = (S - at) / STEPS, fresh = 1 - U.span(a, 0.01, 0.3), flow = m.hf[i] / 255, nz = m.nzv[i], blotch = m.nzv[(y >> 1) * W + (x >> 2)];
      let h = (pool ? Math.max(fresh, 0.5 + 0.2 * flow) : m.wet[i] ? Math.max(fresh, 0.12 + 0.5 * flow) : Math.max(fresh, 0.14 + 0.7 * flow)) + (blotch - 128) / 255 * 0.2;
      if (h < 0.34) { if (nz < 20) h = 0.72; else if (nz > 236) cracks.push(i); }   // glowing breaks in old crust
      tone(h, rgb); put(i, rgb, 255);
      if (pool) {   // a pool fills its hollow from wall to wall, with a cooler crust where it touches the tiles, and has a level top
        const edge = (x > 0 && m.kind[i - 1] === 1) || (x < W - 1 && m.kind[i + 1] === 1) || (i + W < m.N && m.kind[i + W] === 1);
        if (edge) { tone(h * 0.55, rgb); put(i, rgb, 255); px[i * 4] = rgb[0]; px[i * 4 + 1] = rgb[1]; px[i * 4 + 2] = rgb[2]; }
        for (const j of [i - 1, i + 1, i + W]) if (j >= 0 && j < m.N && Math.abs(j % W - x) <= 1 && m.kind[j] === 1) put(j, rgb, 130);
        if (i >= W && m.kind[i - W] === 0 && !pm[i - W]) surf.push(x, y);
        continue;
      }
      if (!m.wet[i]) { for (const j of [i - 1, i + 1]) if (j >= 0 && j < m.N && Math.abs(j % W - x) <= 1 && m.kind[j] === 1) put(j, rgb, 110); }   // a stream squeezing down between tiles touches both
      if (m.wet[i] && h < 0.62 && nz > 128 && nz < 128 + (0.75 - h) * 150 && plates.length < 1500) plates.push(x, y, nz);
      if (m.wet[i]) {   // lava lying on a surface is thicker than a falling stream: it swells up and sideways with a cooler skin, and laps a little over the edge it sits on
        tone(h * 0.6, rgb);
        if (i >= W && m.kind[i - W] === 0) put(i - W, rgb, 210);
        if (x > 0 && m.kind[i - 1] === 0) put(i - 1, rgb, 160);
        if (x < W - 1 && m.kind[i + 1] === 0) put(i + 1, rgb, 160);
        if (i + W < m.N && m.kind[i + W] === 1) put(i + W, rgb, 150);
      }
    }
    const ROCK = [27, 19, 16];
    for (const i of m.rocks) if (m.rockAt[i] <= S) { const o = i * 4, k = 0.8 + m.nzv[i] / 640; px[o] = ROCK[0] * k; px[o + 1] = ROCK[1] * k; px[o + 2] = ROCK[2] * k; px[o + 3] = 255; if (i >= W && m.kind[i - W] === 0) put(i - W, ROCK, 110); }
    const emb = st.emb = [];
    for (const i of m.scorch) {
      const at = m.scAt[i]; if (at >= S) continue;
      const d = m.depth[i], nz = m.nzv[i], k = U.span((S - at) / STEPS, 0.01, 0.16 + nz / 1600) * [0, 0.86, 0.62, 0.36][d] * (0.6 + nz / 640), o = i * 4;
      sp[o] = 9; sp[o + 1] = 6; sp[o + 2] = 4; sp[o + 3] = 255 * k;
      if (d === 1 && nz < 14 && k > 0.5 && emb.length < 80) emb.push((i % W + 0.5) * cs, ((i / W | 0) + 0.5) * cs);
    }
    st.mc.getContext('2d').putImageData(img, 0, 0); st.sc.getContext('2d').putImageData(sc, 0, 0);
    // blow the lava up to twice the grid, then harden the edge: squaring the coverage and laying it over itself, twice
    const A = st.A, T = st.T, a = A.getContext('2d'), t = T.getContext('2d'), copy = () => { t.globalCompositeOperation = 'copy'; t.drawImage(A, 0, 0); };
    a.globalCompositeOperation = 'copy'; a.drawImage(st.mc, 0, 0, A.width, A.height); a.globalCompositeOperation = 'source-over';
    a.drawImage(st.mc, 0, 0, A.width, A.height); a.drawImage(st.mc, 0, 0, A.width, A.height);
    for (let n = 0; n < 2; n++) { copy(); a.globalCompositeOperation = 'destination-in'; a.drawImage(T, 0, 0); copy(); a.globalCompositeOperation = 'source-over'; a.drawImage(T, 0, 0); }
    copy(); t.globalCompositeOperation = 'source-in'; t.fillStyle = '#220a05'; t.fillRect(0, 0, T.width, T.height);   // the same shape in crust colour, for the dark rim
    const gl = st.gl.getContext('2d'); gl.globalCompositeOperation = 'copy'; gl.drawImage(st.mc, 0, 0, st.gl.width, st.gl.height);   // and a blurred small copy, for the heat glow

    g.lineCap = g.lineJoin = 'round';
    const hit = st.hit = [];
    if (wh) {
      const k = U.span(p, 0, 0.1), y = c.h - wh, top = () => { for (let x = 0; x <= c.w; x += 16) g.lineTo(x, y + 1.5 * st.nz(x * 0.03)); };
      if (k > 0.02) {
        const gr = g.createLinearGradient(0, y, 0, c.h); gr.addColorStop(0, 'rgba(104,196,230,.72)'); gr.addColorStop(1, 'rgba(12,44,96,.88)');
        g.globalAlpha = k; g.fillStyle = gr; g.beginPath(); g.moveTo(0, c.h); top(); g.lineTo(c.w, c.h); g.fill();
        g.strokeStyle = 'rgba(220,246,255,.85)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, y); top(); g.stroke(); g.globalAlpha = 1;
      }
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.85;
      for (const q of m.contacts) if (q.at <= S) { hit.push(q); g.drawImage(st.glow, q.x - 70, c.h - wh * 1.7, 140, wh * 2.4); }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    g.drawImage(st.sc, 0, 0, FW, FH);                                                              // scorch, soft as a stain should be
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55; g.drawImage(st.gl, 0, 0, FW, FH); g.drawImage(st.gl, -3, -3, FW + 6, FH + 6); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    for (let n = 0; n < 8; n++) g.drawImage(T, Math.cos(n * TAU / 8) * 2.4, Math.sin(n * TAU / 8) * 2.4, FW, FH);   // crust rim all round
    g.drawImage(A, 0, 0, FW, FH);
    // plates of crust riding on lava that has cooled a little, more of them the cooler it is
    g.fillStyle = 'rgba(30,10,6,.82)'; g.beginPath();
    for (let n = 0; n < plates.length; n += 3) { const x = (plates[n] + 0.5) * cs + (plates[n + 2] % 5) - 2, y = (plates[n + 1] + 0.5) * cs - 2 - plates[n + 2] % 4, R = 2.2 + plates[n + 2] % 3; g.moveTo(x + R * 1.6, y); g.ellipse(x, y, R * 1.6, R * 0.55, 0, 0, TAU); }
    g.fill();
    g.strokeStyle = 'rgba(255,150,44,.9)'; g.lineWidth = 1; g.beginPath();
    for (let n = 0; n < cracks.length && n < 260; n++) { const i = cracks[n], x = (i % W + 0.5) * cs, y = ((i / W | 0) + 0.5) * cs, nz = m.nzv[(i + 7) % m.N] / 255 * TAU; g.moveTo(x - Math.cos(nz) * 3, y - Math.sin(nz) * 2); g.lineTo(x + Math.cos(nz + 0.6) * 3, y + Math.sin(nz + 0.6) * 2); }
    g.stroke();
    // the level top of each pool: one bright line along every run of surface cells
    g.strokeStyle = 'rgba(255,240,176,.85)'; g.lineWidth = 1.6; g.beginPath();
    for (let n = 0; n < surf.length;) { let e = n; while (e + 2 < surf.length && surf[e + 3] === surf[n + 1] && surf[e + 2] === surf[e] + 1) e += 2; if (e - n >= 4) { g.moveTo(surf[n] * cs + 2, surf[n + 1] * cs - 0.5); g.lineTo((surf[e] + 1) * cs - 2, surf[n + 1] * cs - 0.5); } n = e + 2; }
    g.stroke();
    // the vents: a dark rim with the brightest lava on the screen inside it
    const k = 0.4 + 0.6 * U.span(p, 0, 0.06);
    for (const s of m.srcs) for (const e of [['#260c07', 15, 8.5], ['#d8400a', 12, 6.6], ['#ffb62e', 8.5, 4.4], ['#fff3b4', 4.4, 2]]) { g.fillStyle = e[0]; g.beginPath(); g.ellipse(s.px, s.py, e[1] * k, e[2] * k, 0, 0, TAU); g.fill(); }
    // beads to animate: the followed grains whose journey has begun by now, the latest first
    const act = st.act = [];
    for (let n = m.tracks.length - 1; n >= 0 && act.length < 20; n--) { const q = m.tracks[n], len = Math.min(q.path.length - 1, S - q.at); if (len > 12) act.push({q, len}); }
    // the leading edge, for the others on the dashboard: the cell lava reached last, and, if a second stream is
    // on the move well away from it, the newest cell there too
    st.nf = 0;
    for (let k = 0; k < 2; k++) {
      let best = -1; const f0 = st.front[0];
      for (const i of m.cells) {
        if (m.arr[i] > S || (best >= 0 && m.arr[i] <= m.arr[best])) continue;
        if (k && (S - m.arr[i] > 200 || Math.hypot((i % W + 0.5) * cs - f0.x, ((i / W | 0) + 0.5) * cs - f0.y) < 160)) continue;
        best = i;
      }
      if (best < 0) break;
      st.front[k].x = (best % W + 0.5) * cs; st.front[k].y = ((best / W | 0) + 0.5) * cs; st.nf = k + 1;
    }
  }

  HP.fx.add('lava', {
    label: 'Lava', grows: true, days: 5, live: true, fps: 12, covers: true,
    options: [{key: 'amount', label: 'Amount', type: 'range', min: 0.3, max: 1, step: 0.05, default: 0.7},
      {key: 'water', label: 'Water', type: 'bool', default: true}],
    create(c) {
      // same seed, same tiles, same options: same lava, so a run is kept and used again
      const key = [c.seed, c.w, c.h, c.opts.amount, c.opts.water].concat(c.rects.filter(solid).map(b => [b.x, b.y, b.w, b.h, b.r || 0].map(Math.round).join(','))).join('|');
      let hitc = null; for (const e of cache) if (e.key === key) hitc = e;
      if (!hitc) { hitc = {key, sim: simulate(c)}; cache.push(hitc); if (cache.length > 3) cache.shift(); }
      const m = hitc.sim, st = {sim: m, nz: U.noise(c.seed + 11), emb: [], hit: [], act: [], nf: 0, front: [0, 1].map(() => ({kind: 'lava', tags: FRONT_TAGS, x: 0, y: 0, h: 14, quiet: 0}))};
      st.mc = sheet(m.W, m.H); st.sc = sheet(m.W, m.H); st.gl = sheet(Math.ceil(m.W / 2), Math.ceil(m.H / 2)); st.A = sheet(m.W * 2, m.H * 2); st.T = sheet(m.W * 2, m.H * 2);
      st.img = st.mc.getContext('2d').createImageData(m.W, m.H); st.simg = st.sc.getContext('2d').createImageData(m.W, m.H);
      st.glow = dot([[0, 'rgba(255,236,150,1)'], [0.3, 'rgba(255,140,30,.55)'], [1, 'rgba(255,60,0,0)']]);
      st.puff = dot([[0, 'rgba(244,246,250,.85)'], [0.5, 'rgba(232,236,244,.4)'], [1, 'rgba(225,230,240,0)']]);
      return st;
    },
    draw(g, st, c, t) {
      // the still picture is painted again only when the cycle has visibly moved on; create() runs again when the layout changes
      if (!st.cv) { st.cv = sheet(c.w, c.h); st.cp = -1; }
      if (Math.abs(c.progress - st.cp) > 0.005) { st.cp = c.progress; const s = st.cv.getContext('2d'); s.clearRect(0, 0, c.w, c.h); s.save(); paint(s, st, c); s.restore(); }
      g.drawImage(st.cv, 0, 0);
      // the front is said to the others: something to keep off, and it glows. A creature right at it is frightened.
      // After a fright that front keeps quiet for four seconds, so no creature is scared more often than that.
      const sc = c.scene;
      if (sc && sc.next) for (let k = 0; k < st.nf; k++) {
        const q = st.front[k]; sc.next.push(q);
        if (t < q.quiet) continue;
        for (const a of sc.actors || []) if (!a.hid && a.tags && a.tags.indexOf('creature') >= 0 && Math.hypot(a.x - q.x, a.y - q.y) < 30) { q.quiet = t + 4; c.util.act(a, 'scare', q); }
      }
      const m = st.sim, W = m.W, cs = m.cs, wh = m.wh, hit = st.hit;
      const stamp = (cv, x, y, R, a) => { g.globalAlpha = a; g.drawImage(cv, x - R, y - R, 2 * R, 2 * R); };
      g.globalCompositeOperation = 'lighter';
      for (const s of m.srcs) stamp(st.glow, s.px, s.py, 20 + 16 * U.span(c.progress, 0, 0.1), 0.5 + 0.25 * Math.sin(t * 1.7 + s.ph));
      // bright beads that go the way real grains went: slow drifting patches where it lies, quick drops where it pours
      for (let n = 0; n < st.act.length; n++) for (let j = 0; j < 2; j++) {
        const e = st.act[n], path = e.q.path, u = (t * 22 + n * 37 + j * e.len / 2) % e.len, i = u | 0, f = u - i, a = path[i], b = path[i + 1], drop = b - a === W;
        const x = (a % W + (b % W - a % W) * f + 0.5) * cs, y = ((a / W | 0) + ((b / W | 0) - (a / W | 0)) * f + 0.5) * cs;
        stamp(st.glow, x, y, drop ? 7 : 12, (drop ? 1 : 0.75) * Math.min(1, u / 8, (e.len - u) / 8));
      }
      for (let k = 0, n = st.emb.length / 2; k < 10 && k < n; k++) { const u = t * 0.6 + k * 0.37, j = (k * 37 + Math.floor(u) * 13) % n; stamp(st.glow, st.emb[j * 2], st.emb[j * 2 + 1], 4.5, 0.8 * Math.sin(Math.PI * (u % 1))); }
      for (let i = 0; i < hit.length && i < 8; i++) { const q = hit[i]; g.globalAlpha = 0.3 + 0.2 * Math.sin(t * 3.1 + q.ph * 20); g.drawImage(st.glow, q.x - 50, c.h - wh * 1.5, 100, wh * 2); }
      g.globalCompositeOperation = 'source-over';
      // where lava meets water: bubbles rising through the band, and steam above it
      g.globalAlpha = 1; g.strokeStyle = 'rgba(255,236,206,.8)'; g.lineWidth = 0.9; g.beginPath();
      for (let i = 0; i < hit.length && i < 8; i++) for (let j = 0; j < 4; j++) {
        const q = hit[i], u = (t * (0.5 + j * 0.13) + q.ph + j * 0.31) % 1, x = q.x + Math.sin(j * 2.4 + q.ph * 30) * 22 + Math.sin(u * 9 + j) * 1.5, y = c.h - 2 - u * (wh - 4), R = 1 + (j % 3) * 0.5;
        g.moveTo(x + R, y); g.arc(x, y, R, 0, TAU);
      }
      g.stroke();
      for (let i = 0; i < hit.length && i < 8; i++) for (let j = 0; j < 6; j++) {
        const q = hit[i], u = (t * 0.26 + j / 6 + q.ph) % 1, x = q.x + Math.sin(u * 5 + j * 2.1 + q.ph * 9) * (4 + 13 * u), y = c.h - wh - u * (84 + 12 * (j % 3));
        stamp(st.puff, x, y, 9 + 22 * u, 0.7 * Math.sin(Math.PI * Math.pow(u, 0.7)));
      }
      g.globalAlpha = 1;
    },
  });
})();
