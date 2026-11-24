'use strict';
// Overlays that live in the channels between the buttons: circuit traces, koi, ants, a toy train, flowing water or
// lava, constellations and a string of lights. Most of them share one idea: the gaps between the buttons, plus a line
// around the screen's border, joined up into a network of points and links that things can travel along.
(() => {
  const U = HP.fx.util, TAU = Math.PI * 2;

  // ---------- the network ----------
  // ctx.gaps are loose pieces: one centre line per pair of neighbours, each stopping a few pixels short of the next.
  // Here they are joined end to end, stretched until they meet the line they point at, and cut at every crossing.
  // Result: nodes {x, y, e: [edge numbers], core: [edge numbers]} and edges {a, b, len, v (vertical), wid, core}.
  // "core" edges are the ones on a loop; walkers keep to them so nobody has to turn round in a dead end.
  // Edges always run a -> b rightwards or downwards.
  function network(ctx) {
    const W = ctx.w, H = ctx.h, solid = ctx.rects.filter(r => !r.hidden && !r.flat);
    const hit = (x, y, d) => U.over(solid, x, y, d || 0);
    // the border line sits half way into the narrowest margin
    // shortcut: a button flush against the screen edge ends up with the border line across its rim; give such layouts their own inset if they turn up
    let m = 18;
    for (const r of solid) m = Math.min(m, r.x / 2, r.y / 2, (W - r.x - r.w) / 2, (H - r.y - r.h) / 2);
    m = U.clamp(m, 5, 18);
    const raw = (ctx.gaps || []).map(g => Math.abs(g.x1 - g.x2) < Math.abs(g.y1 - g.y2)
      ? {v: true, c: (g.x1 + g.x2) / 2, a: Math.min(g.y1, g.y2), b: Math.max(g.y1, g.y2)}
      : {v: false, c: (g.y1 + g.y2) / 2, a: Math.min(g.x1, g.x2), b: Math.max(g.x1, g.x2)});
    raw.sort((p, q) => (p.v - q.v) || (Math.round(p.c) - Math.round(q.c)) || (p.a - q.a));
    const hitAt = (s, k) => s.v ? hit(s.c, k) : hit(k, s.c);
    // pieces of the same channel become one line (but never across a button that stands in the way)
    const all = [];
    for (const s of raw) {
      const p = all[all.length - 1];
      if (p && p.v === s.v && Math.abs(p.c - s.c) < 3 && s.a - p.b < 36 && !(s.a > p.b && hitAt(p, (p.b + s.a) / 2))) p.b = Math.max(p.b, s.b); else all.push(s);
    }
    const inner = all.length;
    all.push({v: false, c: m, a: m, b: W - m}, {v: false, c: H - m, a: m, b: W - m}, {v: true, c: m, a: m, b: H - m}, {v: true, c: W - m, a: m, b: H - m});
    // each loose end reaches forward to the nearest line across its way
    const ext = [];
    for (let i = 0; i < inner; i++) for (let dir = -1; dir <= 1; dir += 2) {
      const s = all[i], end = dir < 0 ? s.a : s.b; let to = null, bd = 60;
      for (const q of all) if (q.v !== s.v) { const dist = dir * (q.c - end); if (dist > -2 && dist < bd && s.c > q.a - 24 && s.c < q.b + 24) { bd = dist; to = q; } }
      if (to && !hitAt(s, end + dir * bd / 2)) ext.push([s, dir, to.c]);
    }
    for (const e of ext) if (e[1] < 0) e[0].a = e[2]; else e[0].b = e[2];

    let nodes = [], edges = [];
    const node = (x, y) => { for (let i = 0; i < nodes.length; i++) if (Math.abs(nodes[i].x - x) < 2.5 && Math.abs(nodes[i].y - y) < 2.5) return i; nodes.push({x, y}); return nodes.length - 1; };
    for (const s of all) {
      const cuts = [s.a, s.b];
      for (const q of all) if (q.v !== s.v && q.c > s.a - 1 && q.c < s.b + 1 && s.c > q.a - 1 && s.c < q.b + 1) cuts.push(q.c);
      cuts.sort((x, y) => x - y);
      let prev = -1;
      for (const k of cuts) {
        const n = s.v ? node(s.c, k) : node(k, s.c);
        if (prev >= 0 && n !== prev && !edges.some(E => E.a === prev && E.b === n)) edges.push({a: prev, b: n, v: s.v, len: Math.hypot(nodes[n].x - nodes[prev].x, nodes[n].y - nodes[prev].y)});
        prev = n;
      }
    }
    // stubs a few pixels long (a line that overshot its crossing) are noise: drop them
    const degrees = list => { const d = nodes.map(() => 0); for (const E of list) { d[E.a]++; d[E.b]++; } return d; };
    for (let again = true; again;) { const d = degrees(edges), n0 = edges.length; edges = edges.filter(E => !(E.len < 12 && (d[E.a] === 1 || d[E.b] === 1))); again = edges.length < n0; }
    // peel dead ends off, layer by layer: what is left is the loops
    let core = edges.slice();
    for (let again = true; again;) { const d = degrees(core), n0 = core.length; core = core.filter(E => d[E.a] > 1 && d[E.b] > 1); again = core.length < n0; }
    for (const E of edges) E.core = core.indexOf(E) >= 0;
    // how wide the channel is at each edge: twice the distance to the nearest button or screen edge
    for (const E of edges) {
      const A = nodes[E.a], B = nodes[E.b], mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2; let d = E.v ? Math.min(mx, W - mx) : Math.min(my, H - my);
      for (const r of solid) if (E.v ? (my > r.y && my < r.y + r.h) : (mx > r.x && mx < r.x + r.w)) { const q = E.v ? Math.max(r.x - mx, mx - r.x - r.w) : Math.max(r.y - my, my - r.y - r.h); if (q >= 0 && q < d) d = q; }
      E.wid = U.clamp(d * 2, 4, 16);
    }
    for (const n of nodes) { n.e = []; n.core = []; }
    edges.forEach((E, i) => { nodes[E.a].e.push(i); nodes[E.b].e.push(i); if (E.core) { nodes[E.a].core.push(i); nodes[E.b].core.push(i); } });
    const coreList = []; edges.forEach((E, i) => { if (E.core) coreList.push(i); });
    /** The spot on the network closest to a point: {e (edge number), s (distance from the edge's a end), d (how far away)}. */
    const nearest = (x, y) => {
      let best = null;
      edges.forEach((E, i) => { const A = nodes[E.a], B = nodes[E.b], s = U.clamp(((x - A.x) * (B.x - A.x) + (y - A.y) * (B.y - A.y)) / E.len, 0, E.len), d = Math.hypot(A.x + (B.x - A.x) * s / E.len - x, A.y + (B.y - A.y) * s / E.len - y); if (!best || d < best.d) best = {e: i, s, d}; });
      return best;
    };
    return {nodes, edges, coreList, hit, solid, nearest, m};
  }
  const other = (E, n) => E.a === n ? E.b : E.a;

  // ---------- walking the network ----------
  // A walker is a route (a list of points with running distances) that grows ahead and is cut off behind. Where it is
  // drawn is a distance along the route, so a body made of several distances (a fish's spine, a train's wagons) follows
  // the same path round every corner and cannot slide sideways.
  function start(net, e, fwd, core, die) {
    const E = net.edges[e], a = fwd ? E.a : E.b, b = fwd ? E.b : E.a, A = net.nodes[a], B = net.nodes[b];
    return {net, core, die, end: false, p: [{x: A.x, y: A.y, n: a, back: b}, {x: B.x, y: B.y, n: b, back: a}], c: [0, E.len]};
  }
  /** Make sure the route reaches at least `ahead` beyond distance d, choosing a way on at each junction (never straight back unless stuck). */
  function grow(w, d, ahead) {
    const p = w.p, c = w.c, N = w.net;
    while (!w.end && c[c.length - 1] - d < ahead) {
      const L = p[p.length - 1], P = p[p.length - 2], nd = N.nodes[L.n];
      let es = (w.core ? nd.core : nd.e).filter(i => other(N.edges[i], L.n) !== L.back);
      if (!es.length) { if (w.die) { w.end = true; break; } es = nd.e; }
      let way = es[Math.floor(Math.random() * es.length)];
      if (w.want) { let bd = 1e9; for (const i of es) { const q = N.nodes[other(N.edges[i], L.n)], dd = Math.hypot(q.x - w.want.x, q.y - w.want.y); if (dd < bd) { bd = dd; way = i; } } }  // a walker with somewhere to be takes the way that leads nearer to it
      const E = N.edges[way], n = other(E, L.n), Q = N.nodes[n], l1 = c[c.length - 1] - c[c.length - 2] || 1;
      L.sharp = ((L.x - P.x) * (Q.x - L.x) + (L.y - P.y) * (Q.y - L.y)) / (l1 * E.len) < 0.3;
      p.push({x: Q.x, y: Q.y, n, back: L.n}); c.push(c[c.length - 1] + E.len);
    }
  }
  /** Forget the route more than `behind` back from distance d. Returns how much was cut: take it off every distance kept. */
  function trim(w, d, behind) {
    let k = 0; while (k < w.p.length - 3 && w.c[k + 1] < d - behind - 24) k++;  // 24: room for the corner's curve
    if (!k) return 0;
    const cut = w.c[k]; w.p.splice(0, k); w.c.splice(0, k); for (let i = 0; i < w.c.length; i++) w.c[i] -= cut; return cut;
  }
  function bez(x0, y0, x1, y1, x2, y2, t, o) {
    const u = 1 - t; o.x = u * u * x0 + 2 * u * t * x1 + t * t * x2; o.y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
    const dx = u * (x1 - x0) + t * (x2 - x1), dy = u * (y1 - y0) + t * (y2 - y1); if (dx * dx + dy * dy > 1e-6) o.a = Math.atan2(dy, dx);
  }
  /** Position and heading at distance d along the route, into o {x, y, a}. Corners are rounded with radius R. */
  function at(w, d, R, o) {
    const p = w.p, c = w.c; let i = 0; d = U.clamp(d, 0, c[c.length - 1]);
    while (i < p.length - 2 && c[i + 1] <= d) i++;
    const A = p[i], B = p[i + 1], L = c[i + 1] - c[i] || 1, u = d - c[i], v = L - u, dx = (B.x - A.x) / L, dy = (B.y - A.y) / L; let r;
    if (i > 0 && (r = Math.min(R, L / 2, (c[i] - c[i - 1]) / 2)) > 0.01 && u < r) {
      const P = p[i - 1], lp = c[i] - c[i - 1]; bez(A.x - (A.x - P.x) / lp * r, A.y - (A.y - P.y) / lp * r, A.x, A.y, A.x + dx * r, A.y + dy * r, 0.5 + u / (2 * r), o);
    } else if (i < p.length - 2 && (r = Math.min(R, L / 2, (c[i + 2] - c[i + 1]) / 2)) > 0.01 && v < r) {
      const Q = p[i + 2], ln = c[i + 2] - c[i + 1]; bez(B.x - dx * r, B.y - dy * r, B.x, B.y, B.x + (Q.x - B.x) / ln * r, B.y + (Q.y - B.y) / ln * r, 0.5 - v / (2 * r), o);
    } else { o.x = A.x + dx * u; o.y = A.y + dy * u; o.a = Math.atan2(dy, dx); }
    return o;
  }
  /** Turn the walker round where it is, by a tight hairpin just ahead of it. False when there is no room to do it cleanly. */
  function turnBack(w, d, R) {
    const p = w.p, c = w.c; let i = 0; while (i < p.length - 2 && c[i + 1] <= d) i++;
    const A = p[i], B = p[i + 1], L = c[i + 1] - c[i], u = d - c[i];
    if (A.n < 0 || B.n < 0 || u < R + 2 || L - u < R + 24) return false;
    const dx = (B.x - A.x) / L, dy = (B.y - A.y) / L, f = u + 16, x = A.x + dx * f, y = A.y + dy * f, x2 = x - dy * 5, y2 = y + dx * 5;
    p.length = c.length = i + 1; w.end = false;
    p.push({x, y, n: -1, sharp: true}, {x: x2, y: y2, n: -1}, {x: A.x, y: A.y, n: A.n, back: B.n});
    c.push(c[i] + f, c[i] + f + 5, c[i] + f + 5 + Math.hypot(x2 - A.x, y2 - A.y));
    return true;
  }

  // ---------- small drawing helpers ----------
  /** A soft round dot on its own little canvas, to stamp wherever light is wanted. */
  function dot(size, stops) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const d = c.getContext('2d'), h = size / 2, gr = d.createRadialGradient(h, h, 0, h, h, h);
    for (const s of stops) gr.addColorStop(s[0], s[1]);
    d.fillStyle = gr; d.fillRect(0, 0, size, size); return c;
  }
  /** A hidden canvas the size of the screen, for the part of a picture that does not move. */
  function sheet(ctx) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(ctx.w)); c.height = Math.max(1, Math.round(ctx.h)); return c; }
  /** A closed smooth outline through n points held as [x0, y0, x1, y1, ...]. */
  function blob(g, q, n, ox, oy) {
    g.moveTo((q[2 * n - 2] + q[0]) / 2 + ox, (q[2 * n - 1] + q[1]) / 2 + oy);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; g.quadraticCurveTo(q[2 * i] + ox, q[2 * i + 1] + oy, (q[2 * i] + q[2 * j]) / 2 + ox, (q[2 * i + 1] + q[2 * j + 1]) / 2 + oy); }
  }
  function rbox(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  /** A number 0..1 from a whole number, the same every time: gives each ripple its own shape without remembering it. */
  function hash(n) { n = Math.imul(n ^ n >>> 15, 0x2c1b3c6d); n = Math.imul(n ^ n >>> 12, 0x297a2d39); return ((n ^ n >>> 15) >>> 0) / 4294967296; }
  /** Is the point over the middle of a tile, further in than the rim an overlay may use? Taps there belong to the tile. */
  const deep = (ctx, x, y) => ctx.rects.some(b => !b.hidden && !b.flat && Math.min(x - b.x, b.x + b.w - x, y - b.y, b.y + b.h - y) > 0.15 * Math.min(b.w, b.h));
  const AMOUNT = {key: 'amount', label: 'Amount', type: 'range', min: 0.2, max: 1, step: 0.05, default: 0.6};

  // ---------- Circuit ----------
  // Dim traces along every channel with pads where they join; now and then a bright pulse runs along them, and a
  // pressed button sends pulses out along the traces beside it.
  const TRACE = {cyan: '90,230,255', green: '110,255,150', amber: '255,190,80', violet: '190,140,255'};
  HP.fx.add('circuit', {
    label: 'Circuit', live: true, fps: 12,
    options: [{key: 'colour', label: 'Colour', type: 'select', choices: [['cyan', 'Cyan'], ['green', 'Green'], ['amber', 'Amber'], ['violet', 'Violet']], default: 'cyan'}, AMOUNT],
    create(ctx) {
      const net = network(ctx), rgb = TRACE[ctx.opts.colour] || TRACE.cyan, r = ctx.rand, N = net.nodes, still = sheet(ctx), g = still.getContext('2d');
      const bend = n => n.e.length === 2 && net.edges[n.e[0]].v !== net.edges[n.e[1]].v;
      // a trace stops short of a plain corner, so the corner can be cut at 45 degrees like on a real board
      const stop = (E, n) => { const A = N[n], B = N[other(E, n)], k = bend(A) && E.len > 14 ? 5 / E.len : 0; return [A.x + (B.x - A.x) * k, A.y + (B.y - A.y) * k]; };
      g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 1.4; g.strokeStyle = 'rgba(' + rgb + ',.42)';
      g.beginPath();
      for (const E of net.edges) { const p = stop(E, E.a), q = stop(E, E.b); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
      N.forEach((n, i) => { if (bend(n)) { const p = stop(net.edges[n.e[0]], i), q = stop(net.edges[n.e[1]], i); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); } });
      // side stubs ending in a via, only where there is room (the margins and open areas)
      const vias = [];
      for (const E of net.edges) for (let s = 30 + r() * 80; s < E.len - 20; s += 60 + r() * 90) {
        const A = N[E.a], side = r() < 0.5 ? 1 : -1, len = 6 + r() * 7, x = A.x + (E.v ? 0 : s), y = A.y + (E.v ? s : 0), x2 = x + (E.v ? side * len : 0), y2 = y + (E.v ? 0 : side * len);
        if (x2 < 4 || y2 < 4 || x2 > ctx.w - 4 || y2 > ctx.h - 4 || net.hit(x2, y2, 4)) continue;
        g.moveTo(x, y); g.lineTo(x2, y2); vias.push(x2, y2);
      }
      g.stroke();
      g.fillStyle = 'rgba(' + rgb + ',.6)'; g.beginPath();
      for (let i = 0; i < vias.length; i += 2) { g.moveTo(vias[i] + 1.8, vias[i + 1]); g.arc(vias[i], vias[i + 1], 1.8, 0, TAU); }
      N.forEach(n => { if (n.e.length === 1) { g.moveTo(n.x + 2.5, n.y); g.arc(n.x, n.y, 2.5, 0, TAU); } });
      g.fill();
      // a small part soldered across some of the longer traces
      g.fillStyle = 'rgba(8,14,22,.9)'; g.strokeStyle = 'rgba(' + rgb + ',.6)'; g.lineWidth = 1;
      for (const E of net.edges) if (E.len > 70 && r() < 0.3) {
        const A = N[E.a], s = E.len * (0.3 + r() * 0.4), x = A.x + (E.v ? 0 : s), y = A.y + (E.v ? s : 0), w = E.v ? 4.6 : 9, h = E.v ? 9 : 4.6;
        g.beginPath(); g.rect(x - w / 2, y - h / 2, w, h); g.fill(); g.stroke();
      }
      // pads where three or four traces meet
      g.lineWidth = 1.3; g.beginPath();
      N.forEach(n => { if (n.e.length > 2) { g.moveTo(n.x + 3.3, n.y); g.arc(n.x, n.y, 3.3, 0, TAU); } });
      g.fill(); g.stroke();
      return {net, rgb, still, glow: dot(32, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(' + rgb + ',.75)'], [1, 'rgba(' + rgb + ',0)']]), pulses: [], flash: [], sparks: [], o: {x: 0, y: 0, a: 0}};
    },
    // a finger near the board: the nearest junction sparks and sends a pulse down every trace that leaves it
    touch(st, x, y) {
      const net = st.net; let n = -1, bd = 130;
      net.nodes.forEach((q, i) => { const d = Math.hypot(q.x - x, q.y - y); if (d < bd && q.e.length) { bd = d; n = i; } });
      if (n < 0 || st.pulses.length > 14) return;
      for (const e of net.nodes[n].e) st.pulses.push({w: start(net, e, net.edges[e].a === n, false, true), d: 0, sp: 260, life: 230, size: 18});
      st.sparks.push({x: net.nodes[n].x, y: net.nodes[n].y, t: 0}); if (st.sparks.length > 4) st.sparks.shift();
    },
    press(st, rect) {
      // one pulse each way along the nearest trace on every side of the button
      const mids = [[rect.x + rect.w / 2, rect.y], [rect.x + rect.w, rect.y + rect.h / 2], [rect.x + rect.w / 2, rect.y + rect.h], [rect.x, rect.y + rect.h / 2]];
      for (const m of mids) {
        const hit = st.net.nearest(m[0], m[1]); if (!hit || hit.d > 45) continue;
        const L = st.net.edges[hit.e].len;
        for (let k = 0; k < 2; k++) st.pulses.push({w: start(st.net, hit.e, !k, false, true), d: k ? L - hit.s : hit.s, sp: 300, life: 300, size: 20});
      }
      st.flash.push({r: rect, t: 0});
    },
    draw(g, st, ctx, t, dt) {
      const amt = ctx.opts.amount, E = st.net.edges, o = st.o;
      g.drawImage(st.still, 0, 0, ctx.w, ctx.h);
      if (st.pulses.length < 2 + amt * 8 && Math.random() < dt * (0.2 + amt * 1.1))
        st.pulses.push({w: start(st.net, Math.floor(Math.random() * E.length), Math.random() < 0.5, false, true), d: 0, sp: 120 + Math.random() * 70, life: 300 + Math.random() * 500, size: 15});
      g.globalCompositeOperation = 'lighter';
      for (let i = st.pulses.length - 1; i >= 0; i--) {
        const p = st.pulses[i], w = p.w;
        p.d += p.sp * dt; p.life -= p.sp * dt; grow(w, p.d, 20); p.d -= trim(w, p.d, 50);
        const total = w.c[w.c.length - 1], a = Math.min(1, p.life / 90, w.end ? (total - p.d) / 30 + 0.1 : 1);
        if (p.life <= 0 || (w.end && p.d >= total)) { st.pulses.splice(i, 1); continue; }
        for (let k = 0; k < 6; k++) {  // a bright head and a fading tail
          at(w, p.d - k * 7, 3, o); const s = p.size - k * 1.7; g.globalAlpha = a * Math.pow(1 - k / 6, 1.5);
          g.drawImage(st.glow, o.x - s / 2, o.y - s / 2, s, s);
        }
      }
      for (let i = st.sparks.length - 1; i >= 0; i--) {  // the spark at a touched junction: a quick bright bloom
        const f = st.sparks[i]; f.t += dt; if (f.t > 0.4) { st.sparks.splice(i, 1); continue; }
        const s = 18 + 70 * f.t; g.globalAlpha = 1 - f.t / 0.4; g.drawImage(st.glow, f.x - s / 2, f.y - s / 2, s, s);
      }
      for (let i = st.flash.length - 1; i >= 0; i--) {  // the pressed button's outline lights up for a moment
        const f = st.flash[i]; f.t += dt; if (f.t > 0.45) { st.flash.splice(i, 1); continue; }
        g.globalAlpha = 0.8 * (1 - f.t / 0.45); g.strokeStyle = 'rgb(' + st.rgb + ')'; g.lineWidth = 2; U.box(g, f.r, 1.5); g.stroke();
      }
    },
  });

  // ---------- Koi pond ----------
  // Koi seen from above cruise the channels and the screen's edge. Each is a spine of seven points on its route, so the
  // body bends round the corners; the tail waves faster the faster it swims.
  const KOI = [  // body, patches, fins, line down the back
    {body: '#f6f1e8', patch: '#ee5a1e', fin: 'rgba(250,236,215,.6)', back: 'rgba(190,150,120,.35)'},
    {body: '#f27a1c', patch: null, fin: 'rgba(255,170,90,.6)', back: 'rgba(170,60,10,.5)'},
    {body: '#f4f1ec', patch: null, fin: 'rgba(240,242,250,.55)', back: 'rgba(170,165,160,.45)'}];
  const KOI_W = [0.05, 0.105, 0.125, 0.11, 0.075, 0.04];  // half width along the body, as a share of its length
  HP.fx.add('koi', {
    label: 'Koi pond', live: true, fps: 12,
    options: [{key: 'count', label: 'How many', type: 'range', min: 2, max: 10, step: 1, default: 5}],
    create(ctx) {
      const net = network(ctx), r = ctx.rand, fish = [], n = U.clamp(Math.round(ctx.opts.count), 2, 10);
      for (let i = 0; i < n; i++) {
        const len = 50 + r() * 16, kind = [0, 1, 2, 0, 1, 0, 2, 1, 0, 1][i], w = start(net, net.coreList[Math.floor(r() * net.coreList.length)], r() < 0.5, true), patches = [];
        if (kind === 0) for (let k = 0, m = 2 + Math.floor(r() * 2); k < m; k++) patches.push({k: 0.5 + (k + r() * 0.8) * 3.4 / m, off: (r() - 0.5) * 0.5, rx: 0.07 + r() * 0.06, ry: 0.45 + r() * 0.3});
        w.d = len + 20 + r() * 120; grow(w, w.d, 40);
        fish.push({w, len, kind, patches, sp: 20 + r() * 14, ph: r() * TAU, nz: U.noise(ctx.seed + i * 13 + 5), burst: 0, x: 0, y: 0, a: 0});
      }
      const sp = []; for (let k = 0; k < 7; k++) sp.push({x: 0, y: 0, a: 0, nx: 0, ny: 0});
      return {net, fish, rings: [], sp, q: new Array(26), food: null, now: 0};
    },
    // A tap on open water is a pinch of food: rings where it lands, and a moment later the fish near by come for it
    // and nose about the spot. Never over a tile, and the tap is not kept: nothing of the pond is under the finger.
    tap(st, x, y, ctx) {
      if (U.over(ctx.rects, x, y)) return;
      st.food = {x, y, t: st.now}; st.rings.push({x, y, t: 0}, {x, y, t: -0.3});
    },
    touch(st, x, y) {
      // the near ones dart off; one that was heading for the finger whips round first
      for (const f of st.fish) {
        const dx = x - f.x, dy = y - f.y, d = Math.hypot(dx, dy); if (d > 230) continue;
        f.burst = Math.max(f.burst, 60 + 150 * (1 - d / 230));
        if (Math.cos(f.a) * dx + Math.sin(f.a) * dy > 0) turnBack(f.w, f.w.d, 14);
      }
    },
    draw(g, st, ctx, t, dt) {
      const S = st.sp, q = st.q;
      st.now = t; if (st.food && t - st.food.t > 10) st.food = null;
      const food = st.food && t - st.food.t > 1 ? st.food : null;  // they need a moment to notice
      // rings on the water, under the fish
      g.lineWidth = 1.2;
      for (let i = st.rings.length - 1; i >= 0; i--) {
        const r = st.rings[i]; r.t += dt; if (r.t > 1.6) { st.rings.splice(i, 1); continue; }
        if (r.t < 0) continue;  // a second ring, still to come
        g.strokeStyle = 'rgba(232,244,255,' + (0.3 * (1 - r.t / 1.6)).toFixed(3) + ')';
        g.beginPath(); g.arc(r.x, r.y, 5 + r.t * 20, 0, TAU); g.moveTo(r.x + 2 + r.t * 11, r.y); g.arc(r.x, r.y, 2 + r.t * 11, 0, TAU); g.stroke();
      }
      for (const f of st.fish) {
        const w = f.w, L = f.len, K = KOI[f.kind];
        f.burst *= Math.exp(-dt * 1.5);  // calming down
        let v = f.sp * (0.8 + 0.3 * f.nz(t * 0.25)) + f.burst;
        const fd = food ? Math.hypot(food.x - f.x, food.y - f.y) : 1e9;
        if (fd < 420) {
          if (!w.want && Math.cos(f.a) * (food.x - f.x) + Math.sin(f.a) * (food.y - f.y) < 0) turnBack(w, w.d, 14);  // heading away: round it comes
          w.want = food; v = fd < 50 ? v * 0.25 : v + 60;  // hurries over, then dawdles at the food
        } else if (w.want) w.want = null;
        w.d += v * dt; f.ph += dt * (2.2 + v * 0.11);
        grow(w, w.d, 30); w.d -= trim(w, w.d, L + 10);
        for (let k = 1; k < w.p.length - 1; k++) { const c = w.p[k]; if (c.sharp && !c.done && w.c[k] <= w.d) { c.done = true; if (st.rings.length < 8) st.rings.push({x: c.x, y: c.y, t: 0}); } }
        for (let k = 0; k < 7; k++) {
          const o = at(w, w.d - k * L / 6, 14, S[k]), sway = Math.sin(f.ph - k * 0.8) * L * 0.055 * Math.pow(k / 6, 1.6) * (1 + f.burst / 130);
          o.nx = -Math.sin(o.a); o.ny = Math.cos(o.a); o.x += o.nx * sway; o.y += o.ny * sway;
        }
        const h = S[0], cx = Math.cos(h.a), cy = Math.sin(h.a); f.x = h.x; f.y = h.y; f.a = h.a;
        // outline: nose, down the left side, back up the right
        q[0] = h.x + cx * L * 0.035; q[1] = h.y + cy * L * 0.035;
        for (let k = 0; k < 6; k++) { const o = S[k], hw = KOI_W[k] * L; q[2 + 2 * k] = o.x + o.nx * hw; q[3 + 2 * k] = o.y + o.ny * hw; q[24 - 2 * k] = o.x - o.nx * hw; q[25 - 2 * k] = o.y - o.ny * hw; }
        g.fillStyle = 'rgba(0,0,25,.22)'; g.beginPath(); blob(g, q, 13, 2.5, 3.5); g.fill();  // its shadow on the pond floor
        // tail and side fins, see-through
        const T = S[5], Z = S[6], fw = L * 0.12, flap = 0.85 + 0.15 * Math.sin(f.ph * 0.5), b1 = S[1], b2 = S[2], reach = L * 0.14 * flap;
        g.fillStyle = K.fin; g.beginPath();
        g.moveTo(T.x, T.y); g.quadraticCurveTo((T.x + Z.x) / 2 + Z.nx * fw * 0.9, (T.y + Z.y) / 2 + Z.ny * fw * 0.9, Z.x + Z.nx * fw, Z.y + Z.ny * fw);
        g.lineTo(T.x + (Z.x - T.x) * 0.7, T.y + (Z.y - T.y) * 0.7); g.lineTo(Z.x - Z.nx * fw, Z.y - Z.ny * fw);
        g.quadraticCurveTo((T.x + Z.x) / 2 - Z.nx * fw * 0.9, (T.y + Z.y) / 2 - Z.ny * fw * 0.9, T.x, T.y);
        for (let sd = -1; sd <= 1; sd += 2) {
          const hw = KOI_W[1] * L * 0.8, bx = b1.x + b1.nx * sd * hw, by = b1.y + b1.ny * sd * hw, tx = b2.x + b2.nx * sd * (KOI_W[2] * L + reach), ty = b2.y + b2.ny * sd * (KOI_W[2] * L + reach);
          g.moveTo(bx, by); g.quadraticCurveTo(b1.x + b1.nx * sd * (hw + reach * 1.2), b1.y + b1.ny * sd * (hw + reach * 1.2), tx, ty);
          g.lineTo(b2.x + b2.nx * sd * KOI_W[2] * L * 0.8, b2.y + b2.ny * sd * KOI_W[2] * L * 0.8); g.closePath();
        }
        g.fill();
        g.fillStyle = K.body; g.strokeStyle = 'rgba(70,35,10,.4)'; g.lineWidth = 0.8; g.beginPath(); blob(g, q, 13, 0, 0); g.fill(); g.stroke();
        if (K.patch) {
          g.fillStyle = K.patch; g.beginPath();
          for (const pt of f.patches) {
            const i = Math.min(4, Math.floor(pt.k)), fr = pt.k - i, A = S[i], B = S[i + 1], hw = U.lerp(KOI_W[i], KOI_W[i + 1], fr) * L, ry = hw * pt.ry, off = pt.off * (hw - ry) * 1.6;
            const x = U.lerp(A.x, B.x, fr) + A.nx * off, y = U.lerp(A.y, B.y, fr) + A.ny * off, rx = pt.rx * L;
            g.moveTo(x + Math.cos(A.a) * rx, y + Math.sin(A.a) * rx); g.ellipse(x, y, rx, ry, A.a, 0, TAU);
          }
          g.fill();
        }
        g.strokeStyle = K.back; g.lineWidth = 1.1; g.beginPath(); g.moveTo(S[1].x, S[1].y); g.quadraticCurveTo(S[2].x, S[2].y, S[3].x, S[3].y); g.lineTo(S[4].x, S[4].y); g.stroke();
        g.fillStyle = '#1b1410'; g.beginPath();
        for (let sd = -1; sd <= 1; sd += 2) { const ex = U.lerp(h.x, b1.x, 0.45) + h.nx * sd * L * 0.058, ey = U.lerp(h.y, b1.y, 0.45) + h.ny * sd * L * 0.058; g.moveTo(ex + 1, ey); g.arc(ex, ey, 1, 0, TAU); }
        g.fill();
      }
    },
  });

  // ---------- Ants ----------
  // Ants walk the channels in loose lines: each line shares one route, every ant keeps a little behind the one in front.
  // Legs step with the distance walked, so an ant that stops stands still.
  HP.fx.add('ants', {
    label: 'Ants', live: true, fps: 12,
    options: [{key: 'count', label: 'How many', type: 'range', min: 6, max: 40, step: 1, default: 18}],
    create(ctx) {
      const net = network(ctx), r = ctx.rand, n = U.clamp(Math.round(ctx.opts.count), 6, 40), lines = [], ants = [], nl = Math.max(2, Math.round(n / 5));  // several short lines, so lines cross paths and meet
      for (let i = 0; i < nl; i++) lines.push({w: start(net, net.coreList[Math.floor(r() * net.coreList.length)], r() < 0.5, true), ants: [], sp: 20 + r() * 9});
      for (let i = 0; i < n; i++) { const a = {line: i % nl, d: 0, v: 0, pause: 0, cool: 0, hurry: 0, leg: r() * TAU, ph: r() * TAU, lane: 1.6 + r() * 1.2, x: -99, y: -99, a: 0, ox: 0, oy: 0}; lines[a.line].ants.push(a); ants.push(a); }
      for (const l of lines) { let d = 30 + l.ants.length * 26; grow(l.w, d, 60); for (const a of l.ants) { a.d = d; d -= 15 + r() * 16; } }
      return {net, lines, ants, o: {x: 0, y: 0, a: 0}};
    },
    touch(st, x, y) {
      // the ants right by the finger break out of line, away from it, and run; the line closes up again as they calm down
      for (const a of st.ants) { const dx = a.x - x, dy = a.y - y, d = Math.hypot(dx, dy) || 1; if (d < 75) { const k = 6 + 16 * (1 - d / 75); a.ox = dx / d * k; a.oy = dy / d * k; a.hurry = 1; a.pause = 0; } }
      // a finger on an ant sends it and its neighbours running (the tap itself still goes to whatever is underneath)
      if (!st.ants.some(a => Math.hypot(a.x - x, a.y - y) < 22)) return;
      for (const a of st.ants) if (Math.hypot(a.x - x, a.y - y) < 140) { a.hurry = 1; a.pause = 0; }
    },
    draw(g, st, ctx, t, dt) {
      const o = st.o, A = st.ants, k = 1.25;
      for (const l of st.lines) {
        grow(l.w, l.ants[0].d, 40);
        for (let i = 0; i < l.ants.length; i++) {
          const a = l.ants[i], front = i ? l.ants[i - 1] : null, room = front ? front.d - a.d : 99;
          a.hurry = Math.max(0, a.hurry - dt * 0.55); a.pause -= dt; a.cool -= dt;
          if (a.pause <= 0 && !a.hurry && Math.random() < dt * 0.05) a.pause = 0.5 + Math.random() * 1.6;  // stops to look about
          let want = a.pause > 0 ? 0 : l.sp * (1 + 0.14 * Math.sin(t * 0.3 + a.ph)) * (1 + 2.8 * a.hurry);
          if (room < 13) want = 0; else if (room < 22) want = Math.min(want, front.v);
          a.v += (want - a.v) * Math.min(1, dt * 6);  // eases to a stop and away again
          a.d += a.v * dt; a.leg += a.v * dt * 0.6;
          if (a.ox || a.oy) { const k = Math.exp(-dt * 1.2); a.ox *= k; a.oy *= k; if (Math.abs(a.ox) + Math.abs(a.oy) < 0.4) a.ox = a.oy = 0; }
          at(l.w, a.d, 6, o); a.a = o.a; a.x = o.x - Math.sin(o.a) * a.lane + a.ox; a.y = o.y + Math.cos(o.a) * a.lane + a.oy;  // keeps to its own side, like traffic
        }
        const cut = trim(l.w, l.ants[l.ants.length - 1].d, 20); if (cut) for (const a of l.ants) a.d -= cut;
      }
      // two from different lines meeting head on stop and touch feelers
      for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
        const a = A[i], b = A[j];
        if (a.line !== b.line && a.cool <= 0 && b.cool <= 0 && Math.abs(a.x - b.x) < 14 && Math.abs(a.y - b.y) < 14 && Math.cos(a.a - b.a) < -0.6 && !a.hurry && !b.hurry) { a.pause = b.pause = 0.7 + Math.random() * 0.9; a.cool = b.cool = 6; }
      }
      // all legs and feelers in one path, all bodies in another
      g.lineCap = 'round'; g.lineWidth = 0.9; g.strokeStyle = '#22140c'; g.beginPath();
      for (const a of A) {
        const c = Math.cos(a.a) * k, s = Math.sin(a.a) * k, feel = Math.sin(t * 9 + a.ph) * (a.v < 3 ? 0.7 : 0.25);
        for (let j = 0; j < 3; j++) for (let sd = -1; sd <= 1; sd += 2) {
          const sw = Math.sin(a.leg + ((j + (sd > 0 ? 1 : 0)) % 2) * Math.PI) * 1.25, rx = 1 - j, fx = 3.4 - j * 3.5 + sw, fy = sd * (4.3 + (j === 1 ? 0.5 : 0));
          g.moveTo(a.x + rx * c - sd * 0.7 * s, a.y + rx * s + sd * 0.7 * c); g.lineTo(a.x + fx * c - fy * s, a.y + fx * s + fy * c);
        }
        for (let sd = -1; sd <= 1; sd += 2) { const fy = sd * (2 + feel); g.moveTo(a.x + 3.6 * c - sd * 0.5 * s, a.y + 3.6 * s + sd * 0.5 * c); g.lineTo(a.x + 6 * c - fy * s, a.y + 6 * s + fy * c); }
      }
      g.stroke();
      g.beginPath();
      for (const a of A) {
        const c = Math.cos(a.a), s = Math.sin(a.a);
        for (let j = 0; j < 3; j++) {
          const f = [-3.9, -0.3, 2.9][j] * k, rx = [2.9, 1.8, 1.5][j] * k, ry = [2, 1.25, 1.45][j] * k, x = a.x + f * c, y = a.y + f * s;
          g.moveTo(x + c * rx, y + s * rx); g.ellipse(x, y, rx, ry, a.a, 0, TAU);
        }
      }
      g.strokeStyle = 'rgba(255,236,205,.3)'; g.lineWidth = 1.5; g.stroke();  // a pale rim so they show on a dark backdrop
      g.fillStyle = '#2a1710'; g.fill();
    },
  });

  // ---------- Train ----------
  // Toy trains on a little railway of thin track: one circuit, or a network with points and crossings. The track is
  // drawn once; each car sits on two points of the route (its two axles), so it swings round the curves the way a real
  // one does.
  // The track is cut into sections, as on a real railway. A train holds every section and junction its length covers
  // and may only run on when everything up to the next place it can stand is free; otherwise it brakes, stands at the
  // signal and pulls away when the way clears. Two trains never hold the same thing, so they can never touch.
  const WAGON = ['#e2483d', '#f0b429', '#3b82d6', '#4caf6a'], BOILER = ['#2f9e5e', '#3b6fd6', '#8a4fc9', '#d9822b'];
  const STOP = 22, CLEAR = 30;  // a train stands this far short of the end of its track; a section is given back once the tail is this far past it
  /** One closed circuit through the network, chosen from the seed: its corners and junctions in order, as node numbers.
   *  Several are tried; the winner runs partly round the border and partly through the gaps, with a handful of bends. */
  function circuit(net, ctx) {
    const N = net.nodes, E = net.edges, r = ctx.rand, m = net.m;
    const rim = e => { const A = N[e.a]; return e.v ? Math.abs(A.x - m) < 3 || Math.abs(A.x - ctx.w + m) < 3 : Math.abs(A.y - m) < 3 || Math.abs(A.y - ctx.h + m) < 3; };
    const P = 2 * (ctx.w + ctx.h) - 8 * m, lo = P * 0.7, hi = P * 1.2;
    let best = null, bs = -1e9;
    for (let k = 0; k < 14; k++) {
      const s = E[net.coreList[Math.floor(r() * net.coreList.length)]].a, path = [s], via = [], used = new Set(path); let len = 0, steps = 0;
      // wander without crossing the own trail (straight on more often than not), back up from dead ends, stop on getting home
      const go = n => {
        if (++steps > 2500) return false;
        const last = via.length ? E[via[via.length - 1]] : null, es = N[n].core.map(i => [i, r() - (last && E[i].v === last.v ? 0.7 : 0)]).sort((a, b) => a[1] - b[1]);
        for (const x of es) {
          const i = x[0], e = E[i], q = other(e, n);
          if (last === e) continue;
          if (q === s) { if (path.length > 3 && len + e.len >= lo) { via.push(i); len += e.len; return true; } continue; }
          if (used.has(q) || len + e.len > hi) continue;
          used.add(q); path.push(q); via.push(i); len += e.len;
          if (go(q)) return true;
          used.delete(q); path.pop(); via.pop(); len -= e.len;
        }
        return false;
      };
      if (!go(s)) continue;
      let inner = 0, bends = 0, tight = 0;
      via.forEach((i, j) => {
        const e = E[i], b0 = E[via[(j + via.length - 1) % via.length]].v !== e.v, b1 = E[via[(j + 1) % via.length]].v !== e.v;
        if (!rim(e)) inner += e.len; if (b1) bends++; if (b0 && b1 && e.len < 60) tight++;
      });
      const score = -Math.abs(inner / len - 0.45) * 12 - Math.abs(bends - 8) * 0.4 - tight * 4;
      if (score > bs) { bs = score; best = path.slice(); }
    }
    if (best) return best;
    // nothing found in the gaps: once round the border, which is always a loop
    const path = []; let n = E[net.coreList.filter(i => rim(E[i]))[0]].a, prev = -1;
    do { path.push(n); const here = n, i = N[n].core.find(j => rim(E[j]) && j !== prev); if (i == null) break; prev = i; n = other(E[i], here); } while (n !== path[0] && path.length < 400);
    return path;
  }
  /** The track plan. Starts from the circuit; a network then gets a few branches: each leaves the track at points,
   *  runs through gaps nobody uses yet (straight over a line in its way: a diamond crossing) and joins the track again
   *  somewhere else, so nothing is a dead end. All track is one way, so two trains never meet head on.
   *  The track between two junctions is a "line". A line long enough is cut into sections a whole train (length T) can
   *  stand in; a shorter one is a single section that trains only pass through.
   *  Returns null when there is no room for a train to stand in at least two places, or some track could never be left. */
  function railway(net, ctx, path, T, loop) {
    const N = net.nodes, E = net.edges, r = ctx.rand, out = N.map(() => []), inn = N.map(() => []), taken = new Set(), cross = {};
    const link = (a, b) => { out[a].push(b); inn[b].push(a); taken.add(N[a].core.find(i => other(E[i], a) === b)); };
    path.forEach((n, i) => link(n, path[(i + 1) % path.length]));
    const plain = n => out[n].length === 1 && inn[n].length === 1;
    if (!loop) {
      let total = 0, len = 0, crossings = 0; for (const i of net.coreList) { total += E[i].len; if (taken.has(i)) len += E[i].len; }
      for (let tries = 0, left = 2 + Math.floor(r() * 2); tries < 60 && left; tries++) {
        const cand = []; N.forEach((_, i) => { if (plain(i)) cand.push(i); });
        const u = cand[Math.floor(r() * cand.length)], nodes = [u], via = [], xs = [], min = 140, max = Math.min(1400, total * 0.6 - len); let l = 0, steps = 0;
        const go = n => {
          if (++steps > 400) return false;
          const last = via.length ? E[via[via.length - 1]] : null, es = N[n].core.filter(i => !taken.has(i) && E[i] !== last).map(i => [i, r() - (last && E[i].v === last.v ? 0.5 : 0)]).sort((a, b) => a[1] - b[1]);
          for (const x of es) {
            const i = x[0], e = E[i], q = other(e, n);
            if (nodes.indexOf(q) >= 0) continue;
            if (!out[q].length) { if (l + e.len > max) continue; nodes.push(q); via.push(i); l += e.len; if (go(q)) return true; nodes.pop(); via.pop(); l -= e.len; continue; }
            if (!plain(q)) continue;
            // a line in the way: where it runs straight across, sometimes carry on over it; otherwise join it, if the branch is long enough
            const A = N[inn[q][0]], B = N[out[q][0]], Q = N[q], across = e.v ? Math.abs(A.y - Q.y) < 1 && Math.abs(B.y - Q.y) < 1 : Math.abs(A.x - Q.x) < 1 && Math.abs(B.x - Q.x) < 1;
            const i2 = across && crossings + xs.length < 2 && r() < 0.9 ? N[q].core.find(j => j !== i && E[j].v === e.v && !taken.has(j) && !out[other(E[j], q)].length && nodes.indexOf(other(E[j], q)) < 0) : null;
            if (i2 != null && l + e.len + E[i2].len <= max) {
              const add = e.len + E[i2].len; nodes.push(q, other(E[i2], q)); via.push(i, i2); xs.push(q); l += add;
              if (go(nodes[nodes.length - 1])) return true;
              nodes.length -= 2; via.length -= 2; xs.pop(); l -= add;
            }
            if (l + e.len >= min) { nodes.push(q); via.push(i); l += e.len; return true; }
          }
          return false;
        };
        if (max < min || !go(u)) continue;
        for (let i = 0; i < nodes.length - 1; i++) link(nodes[i], nodes[i + 1]);
        for (const x of xs) cross[x] = true;
        crossings += xs.length; len += l; left--;
      }
    }
    // lines: from each junction (or, on a plain loop, from its first point) along the track to the next one
    const starts = [], at0 = {}, from = {}, into = {}, segs = [];
    N.forEach((_, i) => { if (out[i].length + inn[i].length > 2) starts.push(i); });
    if (!starts.length) starts.push(path[0]);
    starts.forEach((n, i) => { at0[n] = i + 1; from[n] = []; into[n] = []; });
    let S = 0, M = 0;
    for (const n of starts) for (const m of out[n]) {
      const p = [{x: N[n].x, y: N[n].y}], c = [0]; let cur = m;
      for (;;) { const P = N[cur], l = p[p.length - 1]; c.push(c[c.length - 1] + Math.hypot(P.x - l.x, P.y - l.y)); p.push({x: P.x, y: P.y}); if (at0[cur]) break; cur = out[cur][0]; }
      const len = c[c.length - 1], q = p.length - 1, l1 = len - c[q - 1], k = Math.min(Math.floor(len / (T + 60)), Math.max(2, Math.floor(len / 300)));
      // ox, oy: which way it leaves its first point; ix, iy: which way it arrives at its last; l0, l1: the lengths of those two legs
      from[n].push(segs.length); into[cur].push(segs.length);
      segs.push({a: n, b: cur, p, c, len, k, s0: S, l0: c[1], l1, ox: (p[1].x - p[0].x) / c[1], oy: (p[1].y - p[0].y) / c[1], ix: (p[q].x - p[q - 1].x) / l1, iy: (p[q].y - p[q - 1].y) / l1, used: 0, routes: []});
      S += Math.max(1, k); M += k;
    }
    /** May a train go from line X on to line Y? Always at points; on a diamond crossing only straight over. */
    const ok = (X, Y) => !cross[Y.a] || X.ix * Y.ox + X.iy * Y.oy > 0.9;
    // routes: from the end of each line a train can stand on, every way on to the next line it can stand on, with all
    // it has to hold on the way: each junction passed (numbered after the sections) and each section
    const next = segs.map(() => []);
    segs.forEach((X, xi) => {
      if (!X.k) return;
      const go = (W, list, seen) => {
        for (const o of from[W.b]) {
          const Y = segs[o]; if (X.routes.length >= 12 || !ok(W, Y)) continue;
          if (Y.k) { const all = list.concat(o), ids = []; for (const i of all) ids.push(S + at0[segs[i].a] - 1, segs[i].s0); X.routes.push({segs: all, ids}); if (next[xi].indexOf(o) < 0) next[xi].push(o); }
          else if (list.length < 8 && seen.indexOf(Y.b) < 0) go(Y, list.concat(o), seen.concat(Y.b));
        }
      };
      go(X, [], [X.b]);
    });
    // every standing place must lead to every other one, or a train could be shut in
    const stand = []; segs.forEach((X, i) => { if (X.k) stand.push(i); });
    const reach = fwd => { const seen = [stand[0]]; for (let i = 0; i < seen.length; i++) for (const j of stand) if (seen.indexOf(j) < 0 && (fwd ? next[seen[i]].indexOf(j) >= 0 : next[j].indexOf(seen[i]) >= 0)) seen.push(j); return seen.length; };
    if (M < 2 || reach(true) < stand.length || reach(false) < stand.length) return null;
    return {segs, S, M, starts, at0, from, into, cross, ok, own: new Array(S + starts.length).fill(-1), go: new Array(S).fill(-1)};
  }
  /** Where line X runs on into line Y through their junction: the three points of the curve the cars follow there. */
  function join(N, X, Y, R) {
    const n = N[Y.a], e1 = Math.min(R, X.l1 / 2), e0 = Math.min(R, Y.l0 / 2);
    return [n.x - X.ix * e1, n.y - X.iy * e1, n.x, n.y, n.x + Y.ox * e0, n.y + Y.oy * e0];
  }
  /** Train T (number ti) wants more track. In the middle of a line that is the next section; at the end of a line it is
   *  a whole route: the junctions, any short sections and the next section it can stand in, all free, taken together.
   *  So a train never stops across a junction, and a train that stands holds one section only. With more standing
   *  places than trains somebody can always move: no jam. Returns true when the train got its track. */
  function ahead(st, T, ti) {
    const own = st.own, X = st.segs[T.seg], w = T.w, sig = X.s0 + T.j;
    if (T.j < X.k - 1) {
      if (own[sig + 1] >= 0) return false;
      own[sig + 1] = ti; T.j++; T.sig.push(sig, T.end); st.go[sig] = ti; T.end += X.len / X.k; T.held.push(sig + 1, T.end); return true;
    }
    // of the routes that are free, mostly the one used longest ago, so trains get round all of the track.
    // A place another train has been waiting longer for is left to that train, or one on a side line might never get out.
    let best = null, bs = 1e18;
    for (const R of X.routes) {
      const to = R.segs[R.segs.length - 1];
      if (R.ids.some(id => own[id] >= 0) || st.trains.some(V => V !== T && !V.off && V.wait > T.wait && V.j === st.segs[V.seg].k - 1 && st.segs[V.seg].routes.some(Q => Q.segs[Q.segs.length - 1] === to))) continue;
      let s = Math.random() * 3; for (const i of R.segs) s += st.segs[i].used / R.segs.length;
      if (s < bs) { bs = s; best = R; }
    }
    if (!best) return false;
    T.sig.push(sig, T.end); st.go[sig] = ti; st.tick++;
    let prev = X;
    for (const i of best.segs) {
      const Y = st.segs[i], c0 = w.c[w.c.length - 1], node = st.S + st.at0[Y.a] - 1;
      own[node] = own[Y.s0] = ti; T.held.push(node, c0); Y.used = st.tick;
      if (st.pts[Y.a]) st.pts[Y.a] = join(st.N, prev, Y, st.R);  // the points go over for this train
      for (let q = 1; q < Y.p.length; q++) { w.p.push(Y.p[q]); w.c.push(c0 + Y.c[q]); }
      if (Y.k) { T.seg = i; T.j = 0; T.end = c0 + Y.len / Y.k; }
      T.held.push(Y.s0, Y.k ? T.end : c0 + Y.len); prev = Y;
    }
    return true;
  }
  // ----- a train that has been pulled off the track -----
  // Another kind (the goose) can grab a train, haul it away and dump it. T.off says where the train is: 0 on the track,
  // 1 being hauled, 2 lying where it was dropped, 3 on its way back. Off the track it has no part in the sections at all.
  function sparks(st, x, y, n) { for (; n > 0 && st.puffs.length < 70; n--) st.puffs.push({x, y, t: 0, hot: true, life: 0.3 + Math.random() * 0.3, r: 0, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.8) * 90}); }
  /** Grabbed: off the rails with a jolt, and everything it held is given back at once so the others carry on. */
  function derail(st, T) {
    if (T.off) return false;
    for (let i = 0; i < T.held.length; i += 2) st.own[T.held[i]] = -1;
    for (let i = 0; i < T.sig.length; i += 2) st.go[T.sig[i]] = -1;
    T.held = []; T.sig = []; T.off = 1; T.v = 0; T.idle = 0; T.toot = 5;  // toot: a burst of steam
    T.cars.forEach((c, i) => { c.a += (Math.random() - 0.5) * (i ? 1.6 : 0.7); c.x += (Math.random() - 0.5) * 7; c.y += (Math.random() - 0.5) * 7; c.flip = i && Math.random() < 0.5 ? 1 : 0; sparks(st, c.x, c.y, 3); });
    return true;
  }
  /** Hauled by the nose to x, y: each car is pulled along by the one in front, like a chain, wagging as it goes. */
  function haul(st, T, x, y) {
    if (T.off !== 1) return;
    T.idle = 0; let px = x, py = y, gap = 12;
    T.cars.forEach((c, i) => {
      const dx = px - c.x, dy = py - c.y, d = Math.hypot(dx, dy) || 1;
      if (d > gap) { c.x = px - dx / d * gap; c.y = py - dy / d * gap; c.a = Math.atan2(dy, dx) + (i ? Math.sin(c.x * 0.09 + c.y * 0.07 + i) * 0.3 : 0); if (Math.random() < 0.04) sparks(st, c.x, c.y, 1); }
      px = c.x; py = c.y; gap = i ? 20 : 23.5;
    });
  }
  /** Let go: it stays in a heap where it is, the engine on its side, one car on its back. It gets up again after a while. */
  function dump(st, T) {
    if (T.off !== 1) return;
    T.off = 2; T.lie = 0; T.wake = 40 + Math.random() * 30;
    const e = T.cars[0], up = 1 + Math.floor(Math.random() * (T.cars.length - 1));
    T.cars.forEach((c, i) => { if (i) { c.x += (e.x - c.x) * 0.3 + (Math.random() - 0.5) * 8; c.y += (e.y - c.y) * 0.3 + (Math.random() - 0.5) * 8; } c.a += (Math.random() - 0.5) * 1.2; c.flip = i === up ? 2 : !i || Math.random() < 0.6 ? 1 : 0; });
  }
  /** One frame of a train that is off the track. Getting back on goes by the railway's own rule: it waits for a
   *  standing place nobody holds, takes it like any train would, and only then do the cars right themselves and hop
   *  over, one after the other. Once the last one has clicked on, it is an ordinary standing train again. */
  function rescue(st, T, ti, dt) {
    if (T.off === 1) { if ((T.idle += dt) > 3) dump(st, T); return; }  // whoever had it has gone away
    if (T.off === 2) { if ((T.lie += dt) > T.wake) { T.off = 3; T.hop = -1; } return; }
    if (T.hop < 0) {
      const e = T.cars[0]; let best = null, bd = 1e9;
      for (const s of st.sig) if (st.own[s.id] < 0) { const d = Math.hypot(s.x - e.x, s.y - e.y); if (d < bd) { bd = d; best = s; } }
      for (const c of T.cars) c.z = Math.abs(Math.sin(st.t * 7 + c.back)) * 2;  // fidgeting while it waits
      if (!best) return;
      const X = st.segs[best.seg], bl = X.len / X.k;
      st.own[best.id] = ti; T.seg = best.seg; T.j = best.j; T.end = (best.j + 1) * bl; T.w = {p: X.p.slice(), c: X.c.slice()}; T.d = T.end - STOP - (bl - T.len - 60) / 2; T.held = [best.id, T.end]; T.hop = 0;
      for (const c of T.cars) {
        const a = at(T.w, T.d - c.back + c.len * 0.32, st.R, st.o1), b = at(T.w, T.d - c.back - c.len * 0.32, st.R, st.o2), ta = Math.atan2(a.y - b.y, a.x - b.x);
        c.fx = c.x; c.fy = c.y; c.fa = c.a; c.tx = (a.x + b.x) / 2; c.ty = (a.y + b.y) / 2; c.da = ta - c.a - Math.round((ta - c.a) / TAU) * TAU; c.flip = 0;
      }
      return;
    }
    T.hop += dt; let done = true;
    T.cars.forEach((c, i) => {
      const u = U.clamp((T.hop - i * 0.3) / 1.4, 0, 1), s = u * u * (3 - 2 * u); if (u < 1) done = false;
      c.x = c.fx + (c.tx - c.fx) * s; c.y = c.fy + (c.ty - c.fy) * s; c.a = c.fa + c.da * s; c.z = Math.abs(Math.sin(u * Math.PI * 3)) * 6;
    });
    if (done) { T.off = 0; T.v = T.wait = 0; T.toot = 2; }
  }
  HP.fx.add('train', {
    label: 'Train', live: true, fps: 12,
    options: [{key: 'trains', label: 'Trains', type: 'range', min: 1, max: 4, step: 1, default: 2},
      {key: 'cars', label: 'Cars', type: 'range', min: 1, max: 8, step: 1, default: 4},
      {key: 'speed', label: 'Speed', type: 'range', min: 0.4, max: 2, step: 0.1, default: 1},
      {key: 'track', label: 'Track', type: 'select', choices: [['network', 'Network'], ['loop', 'Loop']], default: 'network'}],
    create(ctx) {
      const net = network(ctx), r = ctx.rand, N = net.nodes, still = sheet(ctx), g = still.getContext('2d'), R = 12, o = 2.6, q = {x: 0, y: 0, a: 0};
      const path = circuit(net, ctx); let L = 0; path.forEach((n, i) => { const m = N[path[(i + 1) % path.length]]; L += Math.hypot(N[n].x - m.x, N[n].y - m.y); });
      // no train longer than half the circuit, so a plain loop always has two places for it to stand
      const nc = Math.min(U.clamp(Math.round(ctx.opts.cars), 1, 8), Math.max(1, Math.floor((L / 2 - 84) / 20))), len = 24 + 20 * nc;
      const rw = (ctx.opts.track !== 'loop' && railway(net, ctx, path, len, false)) || railway(net, ctx, path, len, true);
      const st = {still, N, R, trains: [], sig: [], pts: {}, puffs: [], tick: 0, o1: {x: 0, y: 0, a: 0}, o2: {x: 0, y: 0, a: 0}};
      if (!rw) return st;  // a screen too small for any train
      const segs = rw.segs, lamp = rgb => dot(20, [[0, 'rgba(' + rgb + ',1)'], [0.3, 'rgba(' + rgb + ',.55)'], [1, 'rgba(' + rgb + ',0)']]);
      // sleepers first, rails on top, both along the very curve the cars follow; a line's rails stop short of its
      // junctions, where each way a train can take through gets its own rails (straight or curved)
      g.strokeStyle = 'rgba(150,112,80,.42)'; g.lineWidth = 1.6; g.beginPath();
      for (const X of segs) for (let s = 4; s < X.len; s += 8) { at(X, s, R, q); const nx = -Math.sin(q.a) * 4.6, ny = Math.cos(q.a) * 4.6; g.moveTo(q.x - nx, q.y - ny); g.lineTo(q.x + nx, q.y + ny); }
      g.stroke();
      g.strokeStyle = 'rgba(222,226,236,.42)'; g.lineWidth = 1; g.beginPath();
      const rail = (sd, first) => { const x = q.x - Math.sin(q.a) * o * sd, y = q.y + Math.cos(q.a) * o * sd; if (first) g.moveTo(x, y); else g.lineTo(x, y); };
      for (let sd = -1; sd <= 1; sd += 2) {
        for (const X of segs) { const a = Math.min(R, X.l0 / 2), b = X.len - Math.min(R, X.l1 / 2); for (let s = a; ; s += 4) { at(X, Math.min(s, b), R, q); rail(sd, s === a); if (s >= b) break; } }
        for (const n of rw.starts) for (const xi of rw.into[n]) for (const yi of rw.from[n]) if (rw.ok(segs[xi], segs[yi])) {
          const j = join(N, segs[xi], segs[yi], R); q.a = Math.atan2(j[5] - j[1], j[4] - j[0]);
          for (let i = 0; i <= 6; i++) { bez(j[0], j[1], j[2], j[3], j[4], j[5], i / 6, q); rail(sd, !i); }
        }
      }
      g.stroke();
      // points: which way each set lies is drawn every frame as a bright line down the middle of that way
      for (const n of rw.starts) if (rw.into[n].length + rw.from[n].length === 3) st.pts[n] = join(N, segs[rw.into[n][0]], segs[rw.from[n][0]], R);
      // a signal beside the track at the end of every section a train can stand in (on whichever side is on the screen)
      const places = [];
      segs.forEach((X, xi) => {
        for (let j = 0; j < X.k; j++) {
          places.push([xi, j]);
          at(X, (j + 1) * X.len / X.k - 15, R, q); let x = q.x - Math.sin(q.a) * 9.5, y = q.y + Math.cos(q.a) * 9.5;
          if (x < 5 || y < 5 || x > ctx.w - 5 || y > ctx.h - 5) { x = 2 * q.x - x; y = 2 * q.y - y; }
          st.sig.push({x, y, seg: xi, j, id: X.s0 + j});
          g.fillStyle = '#15161a'; g.strokeStyle = 'rgba(205,220,240,.6)'; g.lineWidth = 0.9; g.beginPath(); g.arc(x, y, 3.8, 0, TAU); g.fill(); g.stroke();
        }
      });
      // always one standing place more than there are trains
      const nt = U.clamp(Math.round(ctx.opts.trains), 1, rw.M - 1);
      for (let i = 0; i < nt; i++) {
        const pl = places[Math.floor(i * places.length / nt)], X = segs[pl[0]], bl = X.len / X.k, end = (pl[1] + 1) * bl, first = Math.floor(r() * 4), cars = [{len: 24, back: 12}];  // back: how far the car's middle is behind the engine's nose
        for (let j = 0; j < nc; j++) cars.push({len: 17, back: 24 + 3 + 8.5 + j * 20, col: WAGON[(first + j) % 4]});
        for (const car of cars) { car.x = car.y = car.a = 0; }
        // each train has its own pace, so a quick one catches a slow one up and has to follow it from signal to signal
        // off: 0 while it is on the track (see below); wait: seconds it has stood at a signal
        // w: the train's own route, grown ahead and cut off behind; d: where its nose is along it; end: where the section it may run to ends
        // held: what it holds, as pairs (number, where along the route that ends); sig: the signals it has been cleared past, the same way
        rw.own[X.s0 + pl[1]] = i;
        const T = {off: 0, wait: 0, w: {p: X.p.slice(), c: X.c.slice()}, d: end - STOP - r() * (bl - len - 60), v: 0, top: 55 * ([1.18, 0.8, 1.02, 0.9][i % 4] + (r() - 0.5) * 0.08), seg: pl[0], j: pl[1], end, held: [X.s0 + pl[1], end], sig: [], len, cars, em: r() * 0.17, toot: 0, boil: BOILER[i % 4]};
        // what the other kinds see of it (ctx.scene), and what they may do to it
        T.post = {kind: 'train', x: 0, y: 0, h: 14, dir: 0, grab: () => derail(st, T), drag: (x, y) => haul(st, T, x, y), drop: () => dump(st, T)};
        st.trains.push(T);
      }
      // Headlight. The cone is painted once, lamp at (4, 64) pointing right, fading with distance and towards its sides.
      // "lit" is a scratch canvas the same size: each frame the tile edges in front of an engine are drawn into it and cut
      // down to the cone's shape and strength, which is what makes the light fall on the tiles.
      const cone = document.createElement('canvas'), lit = document.createElement('canvas'); cone.width = lit.width = 176; cone.height = lit.height = 128;
      const cg = cone.getContext('2d'), beam = cg.createRadialGradient(4, 64, 0, 4, 64, 168);
      beam.addColorStop(0, 'rgba(255,228,165,.24)'); beam.addColorStop(0.35, 'rgba(255,220,150,.11)'); beam.addColorStop(1, 'rgba(255,214,140,0)');
      cg.fillStyle = beam;
      // seven wedges, each narrower, so the sides fade out softly
      for (let h = 0.34; h > 0.09; h -= 0.04) { cg.beginPath(); cg.moveTo(4, 64); cg.arc(4, 64, 168, -h, h); cg.closePath(); cg.fill(); }
      st.cone = cone; st.lit = lit; st.tiles = net.solid;
      return Object.assign(st, {segs, S: rw.S, at0: rw.at0, own: rw.own, go: rw.go, red: lamp('255,72,56'), green: lamp('80,235,120'), spark: lamp('255,214,110'),
        steam: dot(32, [[0, 'rgba(255,255,255,.9)'], [0.5, 'rgba(245,247,252,.45)'], [1, 'rgba(240,244,250,0)']])});
    },
    press(st, rect) {  // the engine nearest the pressed tile whistles (of those on the track)
      let best = null, bd = 1e9;
      for (const T of st.trains) {
        if (T.off === 2 && T.cars.some(c => c.x > rect.x - 6 && c.x < rect.x + rect.w + 6 && c.y > rect.y - 6 && c.y < rect.y + rect.h + 6)) T.lie = T.wake;  // lying on the pressed tile: time to get up
        if (T.off) continue;
        const e = T.cars[0], d = Math.hypot(e.x - rect.x - rect.w / 2, e.y - rect.y - rect.h / 2); if (d < bd) { bd = d; best = T; }
      }
      if (best) best.toot = 3;
    },
    // A finger near an engine: it whistles. Only "toot" is set, which does nothing but make the next steam puffs big:
    // the track, sections, signals and the trains' movement are not touched. (A train lying off the track keeps quiet.)
    touch(st, x, y) { for (const T of st.trains) { const e = T.cars[0]; if (!T.off && Math.hypot(e.x - x, e.y - y) < 60) T.toot = 3; } },
    draw(g, st, ctx, t, dt) {
      const own = st.own; st.t = t;
      g.drawImage(st.still, 0, 0, ctx.w, ctx.h);
      st.trains.forEach((T, ti) => {
        if (T.off) { rescue(st, T, ti, dt); return; }
        const w = T.w, p = w.p;
        // slow for a bend ahead (and until the engine is round it); ease to the new speed
        let f = 1;
        for (let k = 1; k < p.length - 1; k++) if (Math.abs((p[k].x - p[k - 1].x) * (p[k + 1].y - p[k].y) - (p[k].y - p[k - 1].y) * (p[k + 1].x - p[k].x)) > 1) { const gap = w.c[k] - T.d + 10; f = Math.min(f, gap > 0 ? gap / 90 : -gap / 45); }
        // more track is asked for once within braking distance of the end of what the train has; without it, that end is as far as it may go
        let room = T.end - STOP - T.d;
        if (room < T.v * T.v / 68 + 30 && ahead(st, T, ti)) room = T.end - STOP - T.d;
        T.v += U.clamp(T.top * ctx.opts.speed * (0.45 + 0.55 * U.span(f, 0, 1)) - T.v, -70 * dt, 22 * dt);
        T.v = Math.min(T.v, Math.sqrt(Math.max(0, 68 * room)));  // never faster than it can stop in the room it has
        T.d += Math.min(T.v * dt, Math.max(0, room));
        T.wait = T.v < 0.5 && room < 1 ? T.wait + dt : 0;  // how long it has stood at its signal
        while (T.held.length > 2 && T.d - T.len - CLEAR > T.held[1]) { own[T.held[0]] = -1; T.held.splice(0, 2); }  // the tail is well clear of a section or junction: give it back
        while (T.sig.length && T.d > T.sig[1]) { st.go[T.sig[0]] = -1; T.sig.splice(0, 2); }
        const cut = trim(w, T.d, T.len + 40);
        if (cut) { T.d -= cut; T.end -= cut; for (let i = 1; i < T.held.length; i += 2) T.held[i] -= cut; for (let i = 1; i < T.sig.length; i += 2) T.sig[i] -= cut; }
        for (const c of T.cars) {
          const a = at(w, T.d - c.back + c.len * 0.32, st.R, st.o1), b = at(w, T.d - c.back - c.len * 0.32, st.R, st.o2);
          c.x = (a.x + b.x) / 2; c.y = (a.y + b.y) / 2; c.a = Math.atan2(a.y - b.y, a.x - b.x);
        }
      });
      g.strokeStyle = 'rgba(255,236,170,.85)'; g.lineWidth = 1.5; g.lineCap = 'round'; g.beginPath();
      for (const n in st.pts) { const j = st.pts[n]; g.moveTo(j[0], j[1]); g.quadraticCurveTo(j[2], j[3], j[4], j[5]); }
      g.stroke(); g.lineCap = 'butt';
      // signals: green when the train may go on (track kept for it, or free for whoever comes), red when what lies ahead is taken
      for (const s of st.sig) {
        const X = st.segs[s.seg], red = st.go[s.id] < 0 && (s.j < X.k - 1 ? own[s.id + 1] >= 0 : !X.routes.some(R => !R.ids.some(id => own[id] >= 0)));
        g.drawImage(red ? st.red : st.green, s.x - 8, s.y - 8, 16, 16);
        g.fillStyle = red ? '#ff5a48' : '#5cf08a'; g.beginPath(); g.arc(s.x, s.y, 2.1, 0, TAU); g.fill();
      }
      // headlights: barely there by day, growing as the sun sinks (from 8 degrees up to 4 below), full at night
      const env = ctx.env, k = env.night ? 1 : typeof env.elevation === 'number' ? 0.18 + 0.82 * U.span(8 - env.elevation, 0, 12) : 0.18, lg = st.lit ? st.lit.getContext('2d') : null;
      for (const T of st.trains) {
        const e = T.cars[0], co = Math.cos(e.a), si = Math.sin(e.a), lx = e.x + co * 12, ly = e.y + si * 12;
        if (T.off) {  // off the track the lamp only flickers, and dies soon after the train is dropped
          const f = T.off === 1 ? 1 : T.off === 2 ? 1 - T.lie / 2.5 : 0;
          if (f > 0 && Math.random() < 0.6) { g.save(); g.translate(lx, ly); g.rotate(e.a); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.34 * k * f; g.drawImage(st.cone, -4, -64); g.restore(); }
          continue;
        }
        // the sides of nearby tiles that face the lamp, drawn as the lamp sees them (lamp at (4, 64), beam to the right)
        lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, 176, 128);
        lg.translate(4, 64); lg.rotate(-e.a); lg.translate(-lx, -ly); lg.beginPath();
        for (const b of st.tiles) {
          const x2 = b.x + b.w, y2 = b.y + b.h, dx = Math.max(b.x - lx, 0, lx - x2), dy = Math.max(b.y - ly, 0, ly - y2);
          if (dx * dx + dy * dy > 28224 || (!dx && !dy) || Math.max(co * (b.x - lx), co * (x2 - lx)) + Math.max(si * (b.y - ly), si * (y2 - ly)) < 0) continue;  // out of reach, or all of it behind the lamp
          const rr = Math.min(b.r || 0, b.w / 2, b.h / 2);
          if (ly < b.y) { lg.moveTo(b.x, b.y + rr); lg.arcTo(b.x, b.y, b.x + rr, b.y, rr); lg.lineTo(x2 - rr, b.y); lg.arcTo(x2, b.y, x2, b.y + rr, rr); }
          if (ly > y2) { lg.moveTo(b.x, y2 - rr); lg.arcTo(b.x, y2, b.x + rr, y2, rr); lg.lineTo(x2 - rr, y2); lg.arcTo(x2, y2, x2, y2 - rr, rr); }
          if (lx < b.x) { lg.moveTo(b.x + rr, b.y); lg.arcTo(b.x, b.y, b.x, b.y + rr, rr); lg.lineTo(b.x, y2 - rr); lg.arcTo(b.x, y2, b.x + rr, y2, rr); }
          if (lx > x2) { lg.moveTo(x2 - rr, b.y); lg.arcTo(x2, b.y, x2, b.y + rr, rr); lg.lineTo(x2, y2 - rr); lg.arcTo(x2, y2, x2 - rr, y2, rr); }
        }
        lg.lineWidth = 7; lg.strokeStyle = 'rgba(255,208,130,.38)'; lg.stroke(); lg.lineWidth = 1.8; lg.strokeStyle = 'rgba(255,240,205,.95)'; lg.stroke();  // a wide faint glow under a thin bright rim
        lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'destination-in'; lg.drawImage(st.cone, 0, 0);
        // the beam itself stays faint, so it does not seem to shine through the tiles; the lit edges carry it
        g.save(); g.translate(lx, ly); g.rotate(e.a); g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.34 * k; g.drawImage(st.cone, -4, -64); g.globalAlpha = k; g.drawImage(st.lit, -4, -64); g.restore();
      }
      for (const T of st.trains) {
        if (T.off < 2) { g.strokeStyle = '#1c1d22'; g.lineWidth = 1.6; g.beginPath(); T.cars.forEach((c, i) => { if (i) g.lineTo(c.x, c.y); else g.moveTo(c.x, c.y); }); g.stroke(); }  // couplings (they part when the train is dumped)
        for (let i = T.cars.length - 1; i >= 0; i--) {
          const c = T.cars[i]; g.save(); g.translate(c.x, c.y - (c.z || 0)); g.rotate(c.a);
          if (c.flip === 2) {  // on its back: the underframe and four wheels
            g.fillStyle = '#2b2d35'; rbox(g, -8.5, -4, 17, 8, 1.5); g.fill(); g.fillStyle = '#9a9eaa'; g.fillRect(-6.6, -4.4, 3.4, 2); g.fillRect(3.2, -4.4, 3.4, 2); g.fillRect(-6.6, 2.4, 3.4, 2); g.fillRect(3.2, 2.4, 3.4, 2);
            g.restore(); continue;
          }
          if (c.flip) g.scale(1, 0.62);  // on its side: seen edge on
          if (i) {
            g.fillStyle = c.col; g.strokeStyle = 'rgba(20,20,30,.75)'; g.lineWidth = 0.9; rbox(g, -8.5, -4.3, 17, 8.6, 1.6); g.fill(); g.stroke();
            g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(-6.3, -2.5, 12.6, 5); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(-6.3, -2.5, 12.6, 1.1);
          } else {
            g.fillStyle = '#20232a'; rbox(g, -12, -4.5, 24, 9, 1.8); g.fill();                    // frame
            g.fillStyle = T.boil; rbox(g, -3, -3.5, 14.2, 7, 3); g.fill();                         // boiler
            g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(-2, -1, 12, 1.2);
            g.fillStyle = '#c8372d'; rbox(g, -11.5, -4.4, 9, 8.8, 1.4); g.fill();                  // cab
            g.fillStyle = '#e8695d'; g.fillRect(-10.2, -3, 6.4, 6);
            g.fillStyle = '#e8b93c'; g.beginPath(); g.arc(2.6, 0, 1.6, 0, TAU); g.fill();          // dome
            g.fillStyle = '#15161a'; g.beginPath(); g.arc(7.6, 0, 2.2, 0, TAU); g.fill();          // chimney
            g.strokeStyle = '#8b8f99'; g.lineWidth = 0.9; g.stroke();
            g.fillStyle = '#c8372d'; g.fillRect(11.2, -4.2, 1.4, 8.4);                             // buffer beam
          }
          if (c.flip) { g.fillStyle = '#17181d'; g.beginPath(); g.arc(-5, 5.4, 2, 0, TAU); g.moveTo(7, 5.4); g.arc(5, 5.4, 2, 0, TAU); g.fill(); }  // and its wheels
          g.restore();
        }
        // the lamp itself, and at night a dim red one on the last car
        const hd = T.cars[0], tl = T.cars[T.cars.length - 1];
        if (!T.off) {
          g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.45 + 0.55 * k; g.drawImage(st.steam, hd.x + Math.cos(hd.a) * 11.5 - 5, hd.y + Math.sin(hd.a) * 11.5 - 5, 10, 10);
          if (k > 0.6) { g.globalAlpha = 0.8; g.drawImage(st.red, tl.x - Math.cos(tl.a) * 8.5 - 5, tl.y - Math.sin(tl.a) * 8.5 - 5, 10, 10); }
          g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
          if (ctx.scene) { const P = T.post; P.x = hd.x; P.y = hd.y; P.dir = hd.a; ctx.scene.next.push(P); }  // tell the other kinds where it is
        }
        // steam: puffs are left where the chimney was and swell and thin out as the train moves on; a whistle is three big ones
        const e = T.cars[0]; T.em += dt * (T.off > 1 ? 0.1 : 0.5 + T.v / 55);  // lying there: only a wisp
        if ((T.em > 0.17 || T.toot > 0) && st.puffs.length < 8 * st.trains.length) { T.em = 0; const big = T.toot-- > 0 ? 2.2 : 1; st.puffs.push({x: e.x + Math.cos(e.a) * 7.6, y: e.y + Math.sin(e.a) * 7.6, t: 0, r: (3 + Math.random() * 2) * big, vx: (Math.random() - 0.5) * 8, vy: -5 - Math.random() * 5}); }
        if (T.toot < 0) T.toot = 0;
      }
      for (let i = st.puffs.length - 1; i >= 0; i--) {
        const p = st.puffs[i]; p.t += dt; if (p.t > (p.life || 1.8)) { st.puffs.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.hot) { g.globalAlpha = 1 - p.t / p.life; g.drawImage(st.spark, p.x - 3, p.y - 3, 6, 6); continue; }  // a spark
        const s = (p.r + p.t * 8) * 2; g.globalAlpha = 0.6 * Math.pow(1 - p.t / 1.8, 1.3); g.drawImage(st.steam, p.x - s / 2, p.y - s / 2, s, s);
      }
    },
  });

  // ---------- Flow ----------
  // The channels as a liquid. Everything runs rightwards and downwards, from the top-left corner to the bottom-right,
  // so two streams that meet carry on together. A ripple's place depends only on how far it is from the top-left
  // corner along the channels, which is the same whichever way you got there: ripples pass through junctions unbroken.
  HP.fx.add('flow', {
    label: 'Flow', live: true, fps: 10,
    // the option cannot be called "kind": the engine keeps the overlay's own name under that key
    options: [{key: 'type', label: 'Kind', type: 'select', choices: [['water', 'Water'], ['lava', 'Lava']], default: 'water'}, AMOUNT],
    create(ctx) {
      const net = network(ctx), lava = ctx.opts.type === 'lava', N = net.nodes, still = sheet(ctx), g = still.getContext('2d'), r = ctx.rand;
      // the liquid itself is drawn solid and laid on see-through, so overlaps at the junctions do not show as dark blots
      const fill = (col, k, add) => { g.strokeStyle = col; g.lineCap = 'round'; for (const E of net.edges) { g.lineWidth = E.wid * k + add; g.beginPath(); g.moveTo(N[E.a].x, N[E.a].y); g.lineTo(N[E.b].x, N[E.b].y); g.stroke(); } };
      if (lava) {
        fill('#1c0605', 1, 1); fill('#3a0e08', 0.62, 0); fill('#6e1a0a', 0.2, 0);
        // cracks across the crust
        g.strokeStyle = '#120303'; g.lineWidth = 1; g.beginPath();
        for (const E of net.edges) for (let s = 6 + r() * 10; s < E.len; s += 9 + r() * 14) { const A = N[E.a], h = E.wid / 2, j = (r() - 0.5) * 5; if (E.v) { g.moveTo(A.x - h, A.y + s); g.lineTo(A.x + h, A.y + s + j); } else { g.moveTo(A.x + s, A.y - h); g.lineTo(A.x + s + j, A.y + h); } }
        g.stroke();
      } else { fill('#155a9c', 1, 1); fill('#2583c4', 0.62, 0); fill('#49a6dc', 0.24, 0); }
      return {net, lava, still, rips: [], now: 0, glow: lava ? dot(48, [[0, 'rgba(255,170,50,.55)'], [0.4, 'rgba(255,80,10,.22)'], [1, 'rgba(255,40,0,0)']]) : null};
    },
    // a finger in or beside a channel: a splash there (water: rings and a few drops; lava: a flare)
    touch(st, x, y) {
      const h = st.net.nearest(x, y); if (!h || h.d > 45) return;
      const E = st.net.edges[h.e], A = st.net.nodes[E.a], B = st.net.nodes[E.b], k = h.s / E.len;
      st.rips.push({x: A.x + (B.x - A.x) * k, y: A.y + (B.y - A.y) * k, t: st.now}); if (st.rips.length > 4) st.rips.shift();
    },
    draw(g, st, ctx, t) {
      st.now = t;
      const lava = st.lava, amt = ctx.opts.amount, N = st.net.nodes, E = st.net.edges, sp = lava ? 10 : 34, gap = lava ? 170 - 80 * amt : 120 - 70 * amt, shift = sp * t;
      g.globalAlpha = lava ? 0.9 : 0.62; g.drawImage(st.still, 0, 0, ctx.w, ctx.h); g.globalAlpha = 1;
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let half = 0; half < (lava ? 2 : 1); half++) {  // lava: two sets of veins that glow in turn
        g.beginPath();
        for (let ei = 0; ei < E.length; ei++) {
          const e = E[ei], A = N[e.a], far = A.x + A.y, L = e.len, room = e.wid / 2 - 1.8;
          for (let n = Math.ceil((far - 80 - shift) / gap) - 1; n * gap + shift < far + L; n++) {
            if (lava && (n & 1) !== half) continue;
            const id = n * 7919 + ei * 104729, len = lava ? 34 + hash(id) * 34 : 12 + hash(id) * 18, s1 = n * gap + shift - far + hash(id + 1) * gap * 0.6, s0 = s1 - len;
            if (s1 < 2 || s0 > L - 2) continue;
            const a = Math.max(0, s0), b = Math.min(L, s1), off = (hash(id + 2) - 0.5) * 2 * room;
            if (lava) {  // a crooked glowing crack
              for (let k = 0; k < 4; k++) { const s = U.clamp(s0 + len * k / 3, a, b), o2 = U.clamp(off + (hash(id + 5 + k) - 0.5) * 5, -room, room), x = e.v ? A.x - o2 : A.x + s, y = e.v ? A.y + s : A.y + o2; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
            } else {     // a short bright streak, slightly bowed
              const bow = off > 0 ? -1.5 : 1.5, m = (a + b) / 2;
              if (e.v) { g.moveTo(A.x - off, A.y + a); g.quadraticCurveTo(A.x - off - bow, A.y + m, A.x - off, A.y + b); } else { g.moveTo(A.x + a, A.y + off); g.quadraticCurveTo(A.x + m, A.y + off + bow, A.x + b, A.y + off); }
            }
          }
        }
        if (lava) {
          const pulse = 0.72 + 0.28 * Math.sin(t * 1.3 + half * Math.PI);
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = 'rgba(255,84,10,' + (0.42 * pulse).toFixed(3) + ')'; g.lineWidth = 6; g.stroke();
          g.strokeStyle = 'rgba(255,214,90,' + (0.95 * pulse).toFixed(3) + ')'; g.lineWidth = 1.9; g.stroke();
        } else { g.strokeStyle = 'rgba(224,244,255,.72)'; g.lineWidth = 1.3; g.stroke(); }
      }
      if (lava) {  // heat welling up where streams meet
        let k = 0;
        for (const n of N) if (n.e.length > 2 && k++ < 40) { const s = 30 + 8 * Math.sin(t * 0.9 + n.x * 0.05 + n.y * 0.03); g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 1.1 + n.x * 0.02); g.drawImage(st.glow, n.x - s / 2, n.y - s / 2, s, s); }
      }
      for (let i = st.rips.length - 1; i >= 0; i--) {
        const r = st.rips[i], e = (t - r.t) / 1.1; if (e >= 1) { st.rips.splice(i, 1); continue; }
        if (lava) { const s = 34 + 70 * e; g.globalAlpha = 1 - e; g.drawImage(st.glow, r.x - s / 2, r.y - s / 2, s, s); g.drawImage(st.glow, r.x - s / 4, r.y - s / 4, s / 2, s / 2); continue; }
        g.globalAlpha = 1; g.strokeStyle = 'rgba(236,248,255,' + (0.85 * (1 - e)).toFixed(3) + ')'; g.lineWidth = 1.4;
        g.beginPath(); g.arc(r.x, r.y, 4 + 24 * e, 0, TAU); g.moveTo(r.x + 2 + 13 * e, r.y); g.arc(r.x, r.y, 2 + 13 * e, 0, TAU); g.stroke();
        g.fillStyle = g.strokeStyle; g.beginPath();
        for (let k = 0; k < 5; k++) { const a = -0.5 - k * 0.55, x = r.x + Math.cos(a) * 26 * e, y = r.y + Math.sin(a) * 30 * e + 34 * e * e; g.moveTo(x + 1.4, y); g.arc(x, y, 1.4, 0, TAU); }  // drops thrown up, falling back
        g.fill();
      }
    },
  });

  // ---------- Constellations ----------
  // A star field over everything that is not a button; through the cycle, made-up constellations join themselves up
  // one line at a time. The field and the finished lines are kept on a hidden canvas; only the twinkling and the
  // line being drawn are done each frame.
  const FIGS = [  // invented figures: points in a -1..1 box, lines in drawing order (each starts from a star already joined)
    {p: [[0, -1], [0.55, -0.2], [0, 0.25], [-0.55, -0.2], [0.12, 0.65], [-0.1, 1]], l: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4], [4, 5]]},                                    // kite
    {p: [[-0.9, -0.6], [-0.55, -0.75], [-0.35, -0.2], [-0.1, 0.1], [0.5, 0], [0.95, -0.15], [0.1, 0.55], [0.15, 1], [0.45, 0.5]], l: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [3, 6], [6, 7], [4, 8]]},  // heron
    {p: [[-0.85, 0], [-0.58, -0.3], [-0.3, 0], [-0.58, 0.3], [0.5, 0], [0.9, 0], [0.5, 0.32], [0.9, 0.26]], l: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4], [4, 5], [4, 6], [5, 7]]},  // key
    {p: [[0, -1], [0, -0.6], [-0.4, -0.35], [0.4, -0.35], [-0.5, 0.4], [0.5, 0.4], [0, 0.8]], l: [[0, 1], [1, 2], [2, 4], [4, 6], [6, 5], [5, 3], [3, 1], [2, 3]]},              // lantern
    {p: [[-0.9, 0.35], [-0.5, 0.8], [0.5, 0.8], [0.9, 0.35], [0, 0.35], [0, -1], [0.65, 0.1]], l: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [4, 5], [5, 6], [6, 4]]},              // boat
    {p: [[-1, 0.3], [-0.6, -0.2], [-0.2, 0.2], [0.2, -0.3], [0.6, 0.1], [1, -0.5], [0.72, -0.82]], l: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]]},                          // wave
    {p: [[-0.8, 0.5], [-0.95, -0.3], [-0.45, 0.1], [0, -0.65], [0.45, 0.1], [0.95, -0.3], [0.8, 0.5]], l: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]]}];              // crown
  const starry = ctx => !!(ctx.opts.always || ctx.env.night);
  HP.fx.add('stars', {
    label: 'Constellations', grows: true, days: 1, live: true, fps: 8,
    options: [{key: 'always', label: 'By day too', type: 'bool', default: false}, AMOUNT],
    create(ctx) {
      const r = ctx.rand, W = ctx.w, H = ctx.h, amt = ctx.opts.amount, solid = ctx.rects.filter(b => !b.hidden && !b.flat), field = [], twink = [];
      for (let i = 0, n = 500 + 1100 * amt; i < n; i++) {
        const x = r() * W, y = r() * H, s = {x, y, r: 0.45 + r() * r() * 1.1, a: 0.35 + r() * 0.6, warm: r() < 0.2, ph: r() * TAU, sp: 0.6 + r() * 1.6};
        if (U.over(solid, x, y, 3)) continue;
        field.push(s); if (twink.length < 40 && r() < 0.16) twink.push(s);
      }
      // a star that lands on a button is moved to the nearest gap
      const clear = p => {
        for (let k = 0; k < 2; k++) {
          const b = U.over(solid, p.x, p.y, 4); if (!b) break;
          const dl = p.x - b.x, dr = b.x + b.w - p.x, dt = p.y - b.y, db = b.y + b.h - p.y, m = Math.min(dl, dr, dt, db);
          if (m === dl) p.x = b.x - 5; else if (m === dr) p.x = b.x + b.w + 5; else if (m === dt) p.y = b.y - 5; else p.y = b.y + b.h + 5;
        }
        p.x = U.clamp(p.x, 6, W - 6); p.y = U.clamp(p.y, 6, H - 6);
      };
      const figs = [], lines = [], cstars = [], first = Math.floor(r() * FIGS.length), count = Math.round(2 + amt * 4);
      for (let i = 0; i < count; i++) {
        const F = FIGS[(first + i) % FIGS.length]; let best = null;
        for (let k = 0; k < 120; k++) {  // try many places; keep the one with the most stars in the open, away from the others
          const s = 40 + r() * 70, rot = (r() - 0.5) * 0.8, cx = s + 20 + r() * (W - 2 * s - 40), cy = s + 20 + r() * (H - 2 * s - 40), co = Math.cos(rot) * s, si = Math.sin(rot) * s;
          const pts = F.p.map(q => ({x: cx + q[0] * co - q[1] * si, y: cy + q[0] * si + q[1] * co, on: 1e9}));
          const open = pts.filter(q => !U.over(solid, q.x, q.y, 4)).length / pts.length; let score = open * 10 + s / 60;
          for (const f of figs) if (Math.hypot(f.cx - cx, f.cy - cy) < s + f.s + 30) score -= 30;
          if (!best || score > best.score) best = {score, pts, cx, cy, s, open};
        }
        if (best.open < 0.7 && figs.length) continue;  // squeezed into the gaps a figure is only a scribble: better one fewer
        best.pts.forEach(clear); figs.push(best);
        for (const l of F.l) { const a = best.pts[l[0]], b = best.pts[l[1]], j = lines.length; a.on = Math.min(a.on, j); b.on = Math.min(b.on, j + 1); lines.push({a, b}); }  // "on": the moment (in lines) a star lights
        for (const p of best.pts) cstars.push(p);
      }
      return {solid, field, twink, lines, cstars, shots: [], flare: null, now: 0, still: sheet(ctx), done: -1, glow: dot(24, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(200,225,255,.5)'], [1, 'rgba(160,200,255,0)']])};
    },
    // a finger on the sky knocks a star loose: a short shooting star from that spot
    touch(st, x, y, ctx) {
      if (!starry(ctx)) return;
      const a = 0.35 + Math.random() * 0.6;
      st.shots.push({x, y, a: Math.random() < 0.5 ? a : Math.PI - a, t: st.now}); if (st.shots.length > 3) st.shots.shift();
    },
    // a tap right on a star (one of a figure, or one that twinkles) makes it flare
    tap(st, x, y, ctx) {
      if (!starry(ctx) || deep(ctx, x, y)) return;
      for (const list of [st.cstars, st.twink]) for (const c of list) if (Math.abs(c.x - x) < 13 && Math.abs(c.y - y) < 13) { st.flare = {x: c.x, y: c.y, t: st.now}; return true; }
    },
    draw(g, st, ctx, t) {
      st.now = t;
      if (!ctx.opts.always && !ctx.env.night) return;
      // how many lines are finished, and how far along the next one is
      const q = U.clamp((ctx.progress - 0.03) / 0.94, 0, 1) * st.lines.length, done = Math.min(st.lines.length, Math.floor(q));
      if (done !== st.done) {
        st.done = done;
        const s = st.still.getContext('2d'); s.clearRect(0, 0, ctx.w, ctx.h);
        s.strokeStyle = 'rgba(196,220,255,.6)'; s.lineWidth = 1; s.beginPath();
        for (let i = 0; i < done; i++) { const l = st.lines[i]; s.moveTo(l.a.x, l.a.y); s.lineTo(l.b.x, l.b.y); }
        s.stroke();
        // where a line crosses a button's middle it is thinned to a hint, so the label stays clear
        s.globalCompositeOperation = 'destination-out'; s.fillStyle = 'rgba(0,0,0,.7)';
        for (const b of st.solid) { U.box(s, b, -Math.min(b.w, b.h) * 0.1); s.fill(); }
        s.globalCompositeOperation = 'source-over';
        for (const f of st.field) { s.globalAlpha = f.a; s.fillStyle = f.warm ? '#ffe9c4' : '#e6f0ff'; s.beginPath(); s.arc(f.x, f.y, f.r, 0, TAU); s.fill(); }
        for (const c of st.cstars) {
          const lit = c.on <= done;
          s.globalAlpha = lit ? 1 : 0.75; s.fillStyle = '#f4f8ff'; s.beginPath(); s.arc(c.x, c.y, lit ? 1.9 : 1.2, 0, TAU); s.fill();
          if (lit) { s.drawImage(st.glow, c.x - 9, c.y - 9, 18, 18); s.globalAlpha = 0.55; s.strokeStyle = '#eaf2ff'; s.lineWidth = 0.7; s.beginPath(); s.moveTo(c.x - 5, c.y); s.lineTo(c.x + 5, c.y); s.moveTo(c.x, c.y - 5); s.lineTo(c.x, c.y + 5); s.stroke(); }
        }
        s.globalAlpha = 1;
      }
      g.drawImage(st.still, 0, 0, ctx.w, ctx.h);
      g.globalCompositeOperation = 'lighter';
      for (const f of st.twink) { const a = 0.5 + 0.5 * Math.sin(t * f.sp + f.ph); g.globalAlpha = a * a * 0.9; const s = 7 + f.r * 5; g.drawImage(st.glow, f.x - s / 2, f.y - s / 2, s, s); }
      if (done < st.lines.length && q > 0) {  // the line being drawn, with a spark at its tip
        const l = st.lines[done], k = U.span(q - done, 0, 1), x = U.lerp(l.a.x, l.b.x, k), y = U.lerp(l.a.y, l.b.y, k);
        g.globalAlpha = 0.6; g.strokeStyle = 'rgb(196,220,255)'; g.lineWidth = 1; g.beginPath(); g.moveTo(l.a.x, l.a.y); g.lineTo(x, y); g.stroke();
        g.globalAlpha = 0.9; g.drawImage(st.glow, l.a.x - 8, l.a.y - 8, 16, 16); g.drawImage(st.glow, x - 7, y - 7, 14, 14);
      }
      const fl = st.flare;
      if (fl && t - fl.t < 0.9) {  // a tapped star: a bloom and four long rays, gone in under a second
        const e = (t - fl.t) / 0.9, k = Math.sin(e * Math.PI), s = 16 + 50 * k, ray = 6 + 22 * k;
        g.globalAlpha = Math.min(1, 1.6 * k); g.drawImage(st.glow, fl.x - s / 2, fl.y - s / 2, s, s);
        g.strokeStyle = '#eaf2ff'; g.lineWidth = 1; g.beginPath(); g.moveTo(fl.x - ray, fl.y); g.lineTo(fl.x + ray, fl.y); g.moveTo(fl.x, fl.y - ray); g.lineTo(fl.x, fl.y + ray); g.stroke();
      }
      for (let i = st.shots.length - 1; i >= 0; i--) {  // shooting stars: a bright head and a tail that thins out behind it
        const s = st.shots[i], e = (t - s.t) / 0.75; if (e >= 1) { st.shots.splice(i, 1); continue; }
        const d = 30 + 300 * e, tail = Math.min(d, 90), cx = Math.cos(s.a), cy = Math.sin(s.a), hx = s.x + cx * d, hy = s.y + cy * d;
        g.globalAlpha = 0.9 * (1 - e * e); g.strokeStyle = 'rgb(220,235,255)';
        g.lineWidth = 1.8; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - cx * tail * 0.4, hy - cy * tail * 0.4); g.stroke();
        g.lineWidth = 0.8; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - cx * tail, hy - cy * tail); g.stroke();
        g.drawImage(st.glow, hx - 8, hy - 8, 16, 16);
      }
    },
  });

  // ---------- String lights ----------
  // One long string of festoon lights. It runs along the gap above each row of tiles, sagging between its hanging points,
  // drops down the side of the screen and comes back along the next gap, and so on down the screen. Bulbs sit at a set
  // distance along it. A bulb beside a tile that is on shines brightly; the others glow softly and twinkle slowly.
  // "One per tile" is the older look: a string along the top of each row with one bulb over each tile, dark until the
  // tile is on, and an always lit string across the top of the screen.
  // The wire and the glass are drawn once; a frame only stamps the glows.
  const BULBS = ['255,84,72', '255,190,64', '96,220,116', '84,164,255', '238,116,222'], WARM = '255,206,120';
  HP.fx.add('lightstring', {
    label: 'String lights', live: true, fps: 6,
    options: [{key: 'spacing', label: 'Spacing', type: 'range', min: 28, max: 90, step: 2, default: 46},
      {key: 'layout', label: 'Layout', type: 'select', choices: [['zigzag', 'Back and forth'], ['tile', 'One per tile']], default: 'zigzag'},
      {key: 'colour', label: 'Colour', type: 'select', choices: [['warm', 'Warm'], ['coloured', 'Coloured']], default: 'warm'}],
    create(ctx) {
      const r = ctx.rand, W = ctx.w, H = ctx.h, warm = ctx.opts.colour !== 'coloured', solid = ctx.rects.filter(b => !b.hidden && !b.flat).slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const swags = [], bulbs = [], ends = []; let hue = Math.floor(r() * 5);
      // a bulb: x, y is the middle of its glass. base: 0 dark until its tile is on, 1 glows softly, 2 always lit
      const bulb = (x, y, rect, base) => bulbs.push({x, y: y + 7.4, rect, base, col: warm ? WARM : BULBS[hue++ % 5], ph: r() * TAU, sp: 0.5 + r() * 0.9});
      if (ctx.opts.layout === 'tile') {
        const swag = (x1, y1, x2, y2, sag, rect) => { swags.push({x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 + 2 * sag}); bulb((x1 + x2) / 2, (y1 + y2) / 2 + sag, rect, rect ? 0 : 2); };
        // buttons whose tops line up, next to each other, share a string
        const used = new Set();
        for (const b of solid) {
          if (used.has(b)) continue;
          const run = [b]; used.add(b);
          for (const c of solid) { const l = run[run.length - 1]; if (!used.has(c) && Math.abs(c.y - b.y) < 8 && c.x >= l.x + l.w - 2 && c.x - (l.x + l.w) < 40) { run.push(c); used.add(c); } }
          let x = run[0].x + 3, y = run[0].y - 8; ends.push(x, y);
          run.forEach((c, i) => {
            const n = run[i + 1], x2 = n ? (c.x + c.w + n.x) / 2 : c.x + c.w - 3, y2 = (n ? Math.min(c.y, n.y) : c.y) - 8;
            swag(x, y, x2, y2, U.clamp(c.w * 0.06, 6, 9), c); x = x2; y = y2;
          });
          ends.push(x, y);
        }
        // the string across the top of the screen: no button to follow, so these stay lit
        const n = Math.max(3, Math.round(W / 118));
        for (let i = 0; i < n; i++) swag(-6 + (W + 12) * i / n, 3 + (i ? r() * 2 : 0), -6 + (W + 12) * (i + 1) / n, 3 + r() * 2, 9 + r() * 4, null);
      } else {
        // a row gap is a height where at least three quarters of the screen's width is clear of tiles; the string hangs
        // near its lower edge, just above the tiles below (the strip under the last row is left alone)
        const ys = []; let from = -1;
        for (let y = 0; y <= H; y += 2) {
          let cov = 0; for (const b of solid) if (y >= b.y && y <= b.y + b.h) cov += b.w;
          if (cov < W * 0.25 && y < H) { if (from < 0) from = y; } else if (from >= 0) { if (y < H) ys.push(Math.max((from + y) / 2, y - 9)); from = -1; }
        }
        if (!ys.length) ys.push(10);
        const m = 12; let px = 0, py = 0;
        ys.forEach((y, k) => {
          // hanging points: the screen's sides and the joins between the tiles below; long spans get more, crowded ones fewer
          let xs = [m, W - m];
          for (const b of solid) if (b.y > y - 4 && b.y < y + 40) xs.push(b.x - 5, b.x + b.w + 5);
          xs = xs.filter(x => x >= m && x <= W - m).sort((a, b) => a - b);
          const pts = [m];
          for (const x of xs) { if (x - pts[pts.length - 1] >= 56 && W - m - x >= 56) pts.push(x); }
          pts.push(W - m);
          const hang = [];
          for (let i = 0; i < pts.length - 1; i++) { const parts = Math.ceil((pts[i + 1] - pts[i]) / 190); for (let j = 0; j < parts; j++) hang.push(pts[i] + (pts[i + 1] - pts[i]) * j / parts); }
          hang.push(W - m);
          if (k % 2) hang.reverse();
          hang.forEach((x, i) => {
            const hy = y - 3 + (r() - 0.5) * 3;
            if (!i && k) swags.push({x1: px, y1: py, x2: x, y2: hy, cx: x + (x < W / 2 ? -9 : 9), cy: (py + hy) / 2});  // down the side to the next row
            else if (i) swags.push({x1: px, y1: py, x2: x, y2: hy, cx: (px + x) / 2, cy: (py + hy) / 2 + 2 * U.clamp(Math.abs(x - px) * 0.075, 6, 12)});
            else ends.push(x, hy);
            px = x; py = hy;
          });
        });
        ends.push(px, py);
        // bulbs every so far along the string, wherever that lands; each belongs to the nearest tile within reach
        const gap = U.clamp(+ctx.opts.spacing || 46, 20, 200); let next = gap / 2, lx = 0, ly = 0;
        for (const s of swags) for (let i = 0; i <= 16; i++) {
          const t = i / 16, u = 1 - t, x = u * u * s.x1 + 2 * u * t * s.cx + t * t * s.x2, y = u * u * s.y1 + 2 * u * t * s.cy + t * t * s.y2;
          if (i) {
            next -= Math.hypot(x - lx, y - ly);
            if (next <= 0) {
              next += gap; const by = y + 7.4; let rect = null, bd = 30;
              for (const b of solid) {
                const d = Math.hypot(Math.max(b.x - x, 0, x - b.x - b.w), Math.max(b.y - by, 0, by - b.y - b.h));
                if (d < bd) { bd = d; rect = b; }
              }
              bulb(x, y, rect, 1);
            }
          }
          lx = x; ly = y;
        }
      }
      // the part that never changes: the wire, dark with a thin pale edge so it shows on any backdrop, then sockets and glass
      const still = sheet(ctx), g = still.getContext('2d');
      const wire = () => { g.beginPath(); for (const s of swags) { g.moveTo(s.x1, s.y1); g.quadraticCurveTo(s.cx, s.cy, s.x2, s.y2); } g.stroke(); };
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(225,235,230,.28)'; g.lineWidth = 2.6; wire();
      g.strokeStyle = '#14201a'; g.lineWidth = 1.5; wire();
      g.fillStyle = '#14201a'; g.beginPath(); for (let i = 0; i < ends.length; i += 2) { g.moveTo(ends[i] + 2, ends[i + 1]); g.arc(ends[i], ends[i + 1], 2, 0, TAU); } g.fill();
      for (const b of bulbs) {
        g.fillStyle = '#26332b'; g.fillRect(b.x - 2.4, b.y - 8.2, 4.8, 3.6);  // the socket
        g.beginPath(); g.ellipse(b.x, b.y, 4, 5.2, 0, 0, TAU);
        g.fillStyle = 'rgba(34,42,54,.86)'; g.fill(); g.fillStyle = 'rgba(' + b.col + (b.base ? ',.72)' : ',.2)'); g.fill();
        g.lineWidth = 0.8;
        if (b.base) { g.strokeStyle = 'rgba(90,45,0,.45)'; g.stroke(); g.fillStyle = 'rgba(255,255,240,.5)'; g.beginPath(); g.ellipse(b.x, b.y - 0.4, 1.8, 2.8, 0, 0, TAU); g.fill(); }
        else { g.strokeStyle = 'rgba(205,220,240,.55)'; g.stroke(); g.strokeStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.arc(b.x, b.y, 2.7, Math.PI * 1.05, Math.PI * 1.5); g.stroke(); }  // dark glass with a glint
      }
      const glows = {}; for (const c of (warm ? [WARM] : BULBS)) glows[c] = dot(64, [[0, 'rgba(' + c + ',.75)'], [0.35, 'rgba(' + c + ',.26)'], [1, 'rgba(' + c + ',0)']]);
      return {still, bulbs, glows, now: 0};
    },
    // The bulbs near a finger flare up and fade; a finger run along the string lights them one after another.
    // (They do not swing: the wire and glass are painted once, and at six frames a second a swing would only jerk.)
    touch(st, x, y) { for (const b of st.bulbs) if (Math.hypot(b.x - x, b.y - y) < 60) b.fl = st.now; },
    drag(st, x, y) { for (const b of st.bulbs) if (Math.hypot(b.x - x, b.y - y) < 38) b.fl = st.now; },
    // a tap on a bulb pops it: a flash, then dark glass for four seconds, then it comes back on
    tap(st, x, y, ctx) {
      for (const b of st.bulbs) if (Math.hypot(b.x - x, b.y - y) < 13 && !(st.now - b.pop < 4) && !deep(ctx, b.x, b.y)) { b.pop = st.now; return true; }
    },
    draw(g, st, ctx, t) {
      st.now = t;
      g.drawImage(st.still, 0, 0, ctx.w, ctx.h);
      const lit = b => b.base === 2 || (b.rect && b.rect.on), out = b => t - b.pop < 4;
      g.globalCompositeOperation = 'lighter';
      for (const b of st.bulbs) {
        if (out(b)) { if (t - b.pop < 0.3) { g.globalAlpha = 1 - (t - b.pop) / 0.3; g.drawImage(st.glows[b.col], b.x - 42, b.y - 42, 84, 84); } continue; }
        const on = lit(b), fl = t - b.fl < 1.2 ? 1 - (t - b.fl) / 1.2 : 0; if (!on && !b.base && !fl) continue;
        const s = on ? 58 : 30 + 28 * fl; g.globalAlpha = on ? 1 : Math.min(1, (b.base ? 0.5 + 0.25 * Math.sin(t * b.sp + b.ph) : 0) + fl);
        g.drawImage(st.glows[b.col], b.x - s / 2, b.y - s / 2, s, s);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      for (const b of st.bulbs) if (out(b)) {  // a popped one: dark glass over the painted bulb
        g.fillStyle = '#1b222c'; g.beginPath(); g.ellipse(b.x, b.y, 4.2, 5.4, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(205,220,240,.5)'; g.lineWidth = 0.8; g.stroke();
      } else if (lit(b)) {  // the few at full brightness get bright glass on top
        g.fillStyle = 'rgb(' + b.col + ')'; g.beginPath(); g.ellipse(b.x, b.y, 4, 5.2, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(90,45,0,.45)'; g.lineWidth = 0.8; g.stroke();  // a rim, or it is lost on a lit button
        g.fillStyle = 'rgba(255,255,240,.88)'; g.beginPath(); g.ellipse(b.x, b.y - 0.4, 2.2, 3.3, 0, 0, TAU); g.fill();
      }
    },
  });
})();
