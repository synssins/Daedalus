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
      const E = N.edges[es[Math.floor(Math.random() * es.length)]], n = other(E, L.n), Q = N.nodes[n], l1 = c[c.length - 1] - c[c.length - 2] || 1;
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
      return {net, rgb, still, glow: dot(32, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(' + rgb + ',.75)'], [1, 'rgba(' + rgb + ',0)']]), pulses: [], flash: [], o: {x: 0, y: 0, a: 0}};
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
      return {net, fish, rings: [], sp, q: new Array(26)};
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
      // rings on the water, under the fish
      g.lineWidth = 1.2;
      for (let i = st.rings.length - 1; i >= 0; i--) {
        const r = st.rings[i]; r.t += dt; if (r.t > 1.6) { st.rings.splice(i, 1); continue; }
        g.strokeStyle = 'rgba(232,244,255,' + (0.3 * (1 - r.t / 1.6)).toFixed(3) + ')';
        g.beginPath(); g.arc(r.x, r.y, 5 + r.t * 20, 0, TAU); g.moveTo(r.x + 2 + r.t * 11, r.y); g.arc(r.x, r.y, 2 + r.t * 11, 0, TAU); g.stroke();
      }
      for (const f of st.fish) {
        const w = f.w, L = f.len, K = KOI[f.kind];
        f.burst *= Math.exp(-dt * 1.5);  // calming down
        const v = f.sp * (0.8 + 0.3 * f.nz(t * 0.25)) + f.burst;
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
      for (let i = 0; i < n; i++) { const a = {line: i % nl, d: 0, v: 0, pause: 0, cool: 0, hurry: 0, leg: r() * TAU, ph: r() * TAU, lane: 1.6 + r() * 1.2, x: -99, y: -99, a: 0}; lines[a.line].ants.push(a); ants.push(a); }
      for (const l of lines) { let d = 30 + l.ants.length * 26; grow(l.w, d, 60); for (const a of l.ants) { a.d = d; d -= 15 + r() * 16; } }
      return {net, lines, ants, o: {x: 0, y: 0, a: 0}};
    },
    touch(st, x, y) {
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
          at(l.w, a.d, 6, o); a.a = o.a; a.x = o.x - Math.sin(o.a) * a.lane; a.y = o.y + Math.cos(o.a) * a.lane;  // keeps to its own side, like traffic
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
  // A toy train on a thin track. The track is drawn once; each car sits on two points of the route (its two axles), so
  // it swings round the curves the way a real one does.
  const WAGON = ['#e2483d', '#f0b429', '#3b82d6', '#4caf6a'];
  HP.fx.add('train', {
    label: 'Train', live: true, fps: 12,
    options: [{key: 'speed', label: 'Speed', type: 'range', min: 0.4, max: 2, step: 0.1, default: 1}],
    create(ctx) {
      const net = network(ctx), r = ctx.rand, N = net.nodes, still = sheet(ctx), g = still.getContext('2d'), R = 12, o = 2.6;
      // sleepers first, rails on top
      g.strokeStyle = 'rgba(150,112,80,.42)'; g.lineWidth = 1.6; g.beginPath();
      for (const i of net.coreList) { const E = net.edges[i], A = N[E.a]; for (let s = 4; s < E.len; s += 8) { if (E.v) { g.moveTo(A.x - 4.6, A.y + s); g.lineTo(A.x + 4.6, A.y + s); } else { g.moveTo(A.x + s, A.y - 4.6); g.lineTo(A.x + s, A.y + 4.6); } } }
      g.stroke();
      g.strokeStyle = 'rgba(222,226,236,.42)'; g.lineWidth = 1; g.beginPath();
      for (const i of net.coreList) { const E = net.edges[i], A = N[E.a], B = N[E.b]; for (let sd = -1; sd <= 1; sd += 2) { if (E.v) { g.moveTo(A.x + sd * o, A.y); g.lineTo(B.x + sd * o, B.y); } else { g.moveTo(A.x, A.y + sd * o); g.lineTo(B.x, B.y + sd * o); } } }
      // curved rails for every turn a train can take at a junction (same curve the cars follow)
      N.forEach((n, ni) => {
        for (let a = 0; a < n.core.length; a++) for (let b = a + 1; b < n.core.length; b++) {
          const E1 = net.edges[n.core[a]], E2 = net.edges[n.core[b]]; if (E1.v === E2.v) continue;
          const P = N[other(E1, ni)], Q = N[other(E2, ni)], x1 = (P.x - n.x) / E1.len, y1 = (P.y - n.y) / E1.len, x2 = (Q.x - n.x) / E2.len, y2 = (Q.y - n.y) / E2.len, rr = Math.min(R, E1.len / 2, E2.len / 2);
          for (let sd = -1; sd <= 1; sd += 2) { const k = sd * o; g.moveTo(n.x + x1 * rr + x2 * k, n.y + y1 * rr + y2 * k); g.quadraticCurveTo(n.x + (x1 + x2) * k, n.y + (y1 + y2) * k, n.x + x2 * rr + x1 * k, n.y + y2 * rr + y1 * k); }
        }
      });
      g.stroke();
      const w = start(net, net.coreList[Math.floor(r() * net.coreList.length)], r() < 0.5, true), wagons = 3 + (r() < 0.5 ? 1 : 0), first = Math.floor(r() * 4);
      w.d = 160; grow(w, w.d, 130);
      const cars = [{len: 24, back: 12}];  // back: how far the car's middle is behind the engine's nose
      for (let i = 0; i < wagons; i++) cars.push({len: 17, back: 24 + 3 + 8.5 + i * 20, col: WAGON[(first + i) % 4]});
      for (const c of cars) { c.x = c.y = c.a = 0; }
      return {net, still, w, cars, v: 0, puffs: [], em: 0, R, steam: dot(32, [[0, 'rgba(255,255,255,.9)'], [0.5, 'rgba(245,247,252,.45)'], [1, 'rgba(240,244,250,0)']]), o1: {x: 0, y: 0, a: 0}, o2: {x: 0, y: 0, a: 0}};
    },
    draw(g, st, ctx, t, dt) {
      const w = st.w, top = 55 * ctx.opts.speed;
      g.drawImage(st.still, 0, 0, ctx.w, ctx.h);
      // slow for the turn ahead (and until the engine is round it), a touch for any junction; ease to the new speed
      let f = 1;
      for (let k = 1; k < w.p.length - 1; k++) {
        const gap = w.c[k] - (w.d - 10), near = gap > 0 ? gap / 90 : -gap / 45, nd = w.p[k].n >= 0 ? w.net.nodes[w.p[k].n] : null;
        if (w.p[k].sharp) f = Math.min(f, near); else if (nd && nd.core.length > 2) f = Math.min(f, 0.72 + near * 0.28);
      }
      st.v += (top * (0.36 + 0.64 * U.span(f, 0, 1)) - st.v) * Math.min(1, dt * 2.2);
      w.d += st.v * dt; grow(w, w.d, 130); w.d -= trim(w, w.d, 130);
      for (const c of st.cars) {
        const p = at(w, w.d - c.back + c.len * 0.32, st.R, st.o1), q = at(w, w.d - c.back - c.len * 0.32, st.R, st.o2);
        c.x = (p.x + q.x) / 2; c.y = (p.y + q.y) / 2; c.a = Math.atan2(p.y - q.y, p.x - q.x);
      }
      g.strokeStyle = '#1c1d22'; g.lineWidth = 1.6; g.beginPath(); st.cars.forEach((c, i) => { if (i) g.lineTo(c.x, c.y); else g.moveTo(c.x, c.y); }); g.stroke();  // couplings
      for (let i = st.cars.length - 1; i >= 0; i--) {
        const c = st.cars[i]; g.save(); g.translate(c.x, c.y); g.rotate(c.a);
        if (i) {
          g.fillStyle = c.col; g.strokeStyle = 'rgba(20,20,30,.75)'; g.lineWidth = 0.9; rbox(g, -8.5, -4.3, 17, 8.6, 1.6); g.fill(); g.stroke();
          g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(-6.3, -2.5, 12.6, 5); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(-6.3, -2.5, 12.6, 1.1);
        } else {
          g.fillStyle = '#20232a'; rbox(g, -12, -4.5, 24, 9, 1.8); g.fill();                    // frame
          g.fillStyle = '#2f9e5e'; rbox(g, -3, -3.5, 14.2, 7, 3); g.fill();                      // boiler
          g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(-2, -1, 12, 1.2);
          g.fillStyle = '#c8372d'; rbox(g, -11.5, -4.4, 9, 8.8, 1.4); g.fill();                  // cab
          g.fillStyle = '#e8695d'; g.fillRect(-10.2, -3, 6.4, 6);
          g.fillStyle = '#e8b93c'; g.beginPath(); g.arc(2.6, 0, 1.6, 0, TAU); g.fill();          // dome
          g.fillStyle = '#15161a'; g.beginPath(); g.arc(7.6, 0, 2.2, 0, TAU); g.fill();          // chimney
          g.strokeStyle = '#8b8f99'; g.lineWidth = 0.9; g.stroke();
          g.fillStyle = '#c8372d'; g.fillRect(11.2, -4.2, 1.4, 8.4);                             // buffer beam
        }
        g.restore();
      }
      // steam: puffs are left where the chimney was and swell and thin out as the train moves on
      const e = st.cars[0]; st.em += dt * (0.5 + st.v / 55);
      if (st.em > 0.17 && st.puffs.length < 14) { st.em = 0; st.puffs.push({x: e.x + Math.cos(e.a) * 7.6, y: e.y + Math.sin(e.a) * 7.6, t: 0, r: 3 + Math.random() * 2, vx: (Math.random() - 0.5) * 8, vy: -5 - Math.random() * 5}); }
      for (let i = st.puffs.length - 1; i >= 0; i--) {
        const p = st.puffs[i]; p.t += dt; if (p.t > 1.8) { st.puffs.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; const s = (p.r + p.t * 8) * 2; g.globalAlpha = 0.6 * Math.pow(1 - p.t / 1.8, 1.3); g.drawImage(st.steam, p.x - s / 2, p.y - s / 2, s, s);
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
      return {net, lava, still, glow: lava ? dot(48, [[0, 'rgba(255,170,50,.55)'], [0.4, 'rgba(255,80,10,.22)'], [1, 'rgba(255,40,0,0)']]) : null};
    },
    draw(g, st, ctx, t) {
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
      return {solid, field, twink, lines, cstars, still: sheet(ctx), done: -1, glow: dot(24, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(200,225,255,.5)'], [1, 'rgba(160,200,255,0)']])};
    },
    draw(g, st, ctx, t) {
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
    },
  });

  // ---------- String lights ----------
  // A wire swagged along the top of each row of buttons, one bulb hanging over each button: lit when the button is on.
  // Another string across the top of the screen is always lit. Drawn rarely; the engine redraws it when a button changes.
  const BULBS = ['255,84,72', '255,190,64', '96,220,116', '84,164,255', '238,116,222'], WARM = '255,206,120';
  HP.fx.add('lightstring', {
    label: 'String lights',
    options: [{key: 'colour', label: 'Colour', type: 'select', choices: [['warm', 'Warm'], ['coloured', 'Coloured']], default: 'warm'}],
    create(ctx) {
      const r = ctx.rand, warm = ctx.opts.colour !== 'coloured', solid = ctx.rects.filter(b => !b.hidden && !b.flat).slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const swags = [], bulbs = [], ends = []; let hue = Math.floor(r() * 5);
      const swag = (x1, y1, x2, y2, sag, rect) => { swags.push({x1, y1, x2, y2, cy: (y1 + y2) / 2 + 2 * sag}); bulbs.push({x: (x1 + x2) / 2, y: (y1 + y2) / 2 + sag, rect, col: warm ? WARM : BULBS[hue++ % 5]}); };
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
      const n = Math.max(3, Math.round(ctx.w / 118));
      for (let i = 0; i < n; i++) swag(-6 + (ctx.w + 12) * i / n, 3 + (i ? r() * 2 : 0), -6 + (ctx.w + 12) * (i + 1) / n, 3 + r() * 2, 9 + r() * 4, null);
      const glows = {}; for (const c of (warm ? [WARM] : BULBS)) glows[c] = dot(64, [[0, 'rgba(' + c + ',.75)'], [0.35, 'rgba(' + c + ',.26)'], [1, 'rgba(' + c + ',0)']]);
      return {swags, bulbs, ends, glows};
    },
    draw(g, st) {
      // the wire, dark with a thin pale edge so it shows on any backdrop
      const wire = () => { g.beginPath(); for (const s of st.swags) { g.moveTo(s.x1, s.y1); g.quadraticCurveTo((s.x1 + s.x2) / 2, s.cy, s.x2, s.y2); } g.stroke(); };
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(225,235,230,.28)'; g.lineWidth = 2.6; wire();
      g.strokeStyle = '#14201a'; g.lineWidth = 1.5; wire();
      g.fillStyle = '#14201a'; g.beginPath(); for (let i = 0; i < st.ends.length; i += 2) { g.moveTo(st.ends[i] + 2, st.ends[i + 1]); g.arc(st.ends[i], st.ends[i + 1], 2, 0, TAU); } g.fill();
      for (const b of st.bulbs) {
        const lit = !b.rect || b.rect.on, y = b.y + 7.4;
        if (lit) { g.globalCompositeOperation = 'lighter'; g.drawImage(st.glows[b.col], b.x - 27, y - 27, 54, 54); g.globalCompositeOperation = 'source-over'; }
        g.fillStyle = '#26332b'; g.fillRect(b.x - 2.4, b.y - 0.8, 4.8, 3.6);  // the socket
        g.beginPath(); g.ellipse(b.x, y, 4, 5.2, 0, 0, TAU);
        if (lit) {
          g.fillStyle = 'rgb(' + b.col + ')'; g.fill(); g.strokeStyle = 'rgba(90,45,0,.45)'; g.lineWidth = 0.8; g.stroke();  // a rim, or it is lost on a lit button
          g.fillStyle = 'rgba(255,255,240,.88)'; g.beginPath(); g.ellipse(b.x, y - 0.4, 2.2, 3.3, 0, 0, TAU); g.fill();
        } else {  // dark glass, with a hint of its colour and a glint
          g.fillStyle = 'rgba(34,42,54,.86)'; g.fill(); g.fillStyle = 'rgba(' + b.col + ',.2)'; g.fill();
          g.strokeStyle = 'rgba(205,220,240,.55)'; g.lineWidth = 0.8; g.stroke();
          g.strokeStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.arc(b.x, y, 2.7, Math.PI * 1.05, Math.PI * 1.5); g.stroke();
        }
      }
    },
  });
})();
