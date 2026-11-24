/* HP.orb: live-drawn voice orb (Canvas 2D only, tuned for iPad Air 2 / WebKit 15).
   HP.orb.create(canvas, {style, colors, maxDpr, onFrame}) -> {setState, setLevel, setStyle, start, stop, destroy} */
(function () {
  'use strict';
  window.HP = window.HP || {};

  var STYLES = ['ribbons', 'ring', 'veil'];
  var DEFAULT_COLORS = ['#22d3ee', '#8b5cf6', '#ec4899'];
  var FRAME_MS = 1000 / 30;
  var EASE_MS = 400;
  var TAU = Math.PI * 2;
  var WHITE = [255, 255, 255];

  // e: base energy, g: level gain, sp: speed, th: "working" motion, cool: cooler/brighter tint
  var STATES = {
    idle:      { e: 0.16, g: 0,    sp: 0.35, th: 0, cool: 0 },
    listening: { e: 0.18, g: 0.6,  sp: 0.55, th: 0, cool: 1 },
    thinking:  { e: 0.30, g: 0,    sp: 1.0,  th: 1, cool: 0.35 },
    speaking:  { e: 0.20, g: 0.9,  sp: 0.6,  th: 0, cool: 0 }
  };
  var KEYS = ['e', 'g', 'sp', 'th', 'cool'];

  function parseHex(h) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h).trim());
    if (!m) return null;
    var s = m[1];
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function rgba(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  }
  function pal(c, t) { // sample a 3-colour palette, t in 0..1
    return t < 0.5 ? mix(c[0], c[1], t * 2) : mix(c[1], c[2], t * 2 - 2 + 1);
  }
  function palette(list) {
    var out = [];
    for (var i = 0; i < 3; i++) {
      out.push((list && list[i] && parseHex(list[i])) || parseHex(DEFAULT_COLORS[i]));
    }
    return out;
  }

  // ---- static layers: drawn once per size/style/palette into a hidden canvas ----

  function layerRibbons(g, S, c) {
    var cx = S / 2, cy = S * 0.47, R = S * 0.40, gr;
    // floor glow
    g.save();
    g.translate(cx, cy + R * 1.1);
    g.scale(1, 0.16);
    gr = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.05);
    gr.addColorStop(0, rgba(mix(c[1], c[2], 0.5), 0.5));
    gr.addColorStop(0.5, rgba(c[1], 0.16));
    gr.addColorStop(1, rgba(c[1], 0));
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, R * 1.05, 0, TAU); g.fill();
    g.restore();
    // glass body
    gr = g.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.1, cx, cy, R);
    gr.addColorStop(0, 'rgba(40,50,110,0.10)');
    gr.addColorStop(0.7, 'rgba(20,24,70,0.16)');
    gr.addColorStop(1, 'rgba(90,110,220,0.34)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
    // inner reflections (clip is fine here: static, once)
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
    gr = g.createRadialGradient(cx, cy + R * 1.05, 0, cx, cy + R * 1.05, R * 0.9);
    gr.addColorStop(0, rgba(c[2], 0.32)); gr.addColorStop(1, rgba(c[2], 0));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    gr = g.createRadialGradient(cx, cy - R * 1.1, 0, cx, cy - R * 1.1, R * 0.8);
    gr.addColorStop(0, rgba(c[0], 0.14)); gr.addColorStop(1, rgba(c[0], 0));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.restore();
    // rim
    gr = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.45, rgba(mix(c[0], WHITE, 0.5), 0.35));
    gr.addColorStop(1, rgba(mix(c[2], WHITE, 0.3), 0.7));
    g.strokeStyle = gr;
    g.globalAlpha = 0.10; g.lineWidth = S * 0.02;
    g.beginPath(); g.arc(cx, cy, R - S * 0.01, 0, TAU); g.stroke();
    g.globalAlpha = 0.25; g.lineWidth = S * 0.008;
    g.beginPath(); g.arc(cx, cy, R - S * 0.004, 0, TAU); g.stroke();
    g.globalAlpha = 1; g.lineWidth = Math.max(1, S * 0.003);
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    // specular highlight, top-left
    g.save();
    g.translate(cx - R * 0.42, cy - R * 0.5);
    g.rotate(-0.7);
    g.scale(1, 0.42);
    gr = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.36);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, R * 0.36, 0, TAU); g.fill();
    g.restore();
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = S * 0.006;
    g.beginPath(); g.arc(cx, cy, R * 0.93, Math.PI * 1.14, Math.PI * 1.36); g.stroke();
  }

  function layerRing(g, S, c) {
    var cx = S / 2, R0 = S * 0.31;
    var gr = g.createRadialGradient(cx, cx, R0 * 0.5, cx, cx, R0 * 1.55);
    gr.addColorStop(0, rgba(c[1], 0));
    gr.addColorStop(0.45, rgba(mix(c[0], c[1], 0.6), 0.22));
    gr.addColorStop(0.62, rgba(c[1], 0.10));
    gr.addColorStop(1, rgba(c[1], 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  }

  function layerVeil(g, S, c) {
    var cx = S / 2;
    var gr = g.createRadialGradient(cx, cx, 0, cx, cx, S * 0.46);
    gr.addColorStop(0, rgba(c[2], 0.20));
    gr.addColorStop(0.5, rgba(mix(c[1], c[2], 0.6), 0.07));
    gr.addColorStop(1, rgba(c[2], 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  }

  var LAYERS = { ribbons: layerRibbons, ring: layerRing, veil: layerVeil };

  // ---- fixed tables ----
  var RB_NP = 72, RB_NS = 3, RB_NL = 10;
  var RB_U = new Float32Array(RB_NP), RB_ENV = new Float32Array(RB_NP);
  (function () {
    for (var j = 0; j < RB_NP; j++) {
      var u = -1 + 2 * j / (RB_NP - 1);
      RB_U[j] = u;
      RB_ENV[j] = 1 - u * u; // lens taper: stays inside the sphere's chord sqrt(1-u^2)
    }
  })();
  var RB_SC = [1, -0.7, 0.5];
  var RG_NP = 64, RG_NL = 7, RG_SPARK = 6;
  var VL_NP = 84, VL_NL = 34;

  function create(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var layer = document.createElement('canvas');
    var lctx = layer.getContext('2d');
    var maxDpr = opts.maxDpr > 0 ? +opts.maxDpr : 1.5;
    var onFrame = typeof opts.onFrame === 'function' ? opts.onFrame : null;
    var base = palette(opts.colors);
    var style = STYLES.indexOf(opts.style) >= 0 ? opts.style : 'ribbons';

    var S = 0, cssW = 0, curDpr = 0;
    var running = false, raf = 0, lastTick = 0, lastDraw = 0, dead = false;
    var p = 0, spin = 0, clock = 0, fade = 0;
    var lvlIn = 0, lvl = 0;
    var cur = {}, from = {}, to = STATES.idle, tStart = -1e9;
    for (var i0 = 0; i0 < KEYS.length; i0++) cur[KEYS[i0]] = from[KEYS[i0]] = to[KEYS[i0]];
    var tintQ = -1, col = base, bright = 1, cache = {};

    // scratch buffers, allocated once
    var bufA = new Float32Array(RB_NP), bufB = new Float32Array(RB_NP), bufC = new Float32Array(RB_NP);
    var bufK = new Float32Array(RB_NP);
    var px = new Float32Array(RG_NP), py = new Float32Array(RG_NP), ph = new Float32Array(RG_NP);

    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reduced = !!(mq && mq.matches);
    function onMq() { reduced = mq.matches; }
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }

    function measure() {
      var cw = canvas.clientWidth;
      if (!cw) return false;
      var dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      if (cw !== cssW || dpr !== curDpr) {
        cssW = cw; curDpr = dpr;
        S = Math.max(2, Math.round(cw * dpr));
        canvas.width = canvas.height = S;
        rebuild();
      }
      return true;
    }

    function rebuild() {
      if (!S) return;
      layer.width = layer.height = S; // also clears
      LAYERS[style](lctx, S, base);
      tintQ = -1;
    }

    // per-tint style strings/gradients; rebuilt only while the tint is actually changing
    function retint(q) {
      tintQ = q;
      var cool = q / 10, tgt = mix(base[0], WHITE, 0.45), i;
      col = [mix(base[0], tgt, cool * 0.35), mix(base[1], tgt, cool * 0.35), mix(base[2], tgt, cool * 0.35)];
      bright = 1 + 0.2 * cool;
      cache = {};
      if (style === 'ribbons') {
        var g = ctx.createLinearGradient(S * 0.1, 0, S * 0.9, 0);
        g.addColorStop(0, rgba(col[0], 1));
        g.addColorStop(0.5, rgba(col[1], 1));
        g.addColorStop(1, rgba(col[2], 1));
        cache.grad = g;
      } else if (style === 'ring') {
        cache.fill = []; cache.line = [];
        for (i = 0; i < RG_NL; i++) {
          var c = pal(col, 0.08 + 0.62 * i / (RG_NL - 1)); // skewed to the blue/violet end
          cache.fill.push(rgba(c, 1));
          cache.line.push(rgba(mix(c, WHITE, 0.45), 1));
        }
        cache.spark = rgba(mix(col[0], WHITE, 0.6), 1);
      } else {
        cache.line = [];
        for (i = 0; i < VL_NL; i++) {
          var k = i / (VL_NL - 1);
          var v = k < 0.75 ? mix(col[1], col[2], 0.35 + 0.65 * k / 0.75) : mix(col[2], WHITE, (k - 0.75) * 1.6);
          cache.line.push(rgba(v, 1));
        }
      }
    }

    function drawRibbons(E, lv, th) {
      var cx = S / 2, cy = S * 0.47, R = S * 0.40 * 0.955;
      var lw = Math.max(1, S * 0.0022), j, s, l, u, env;
      ctx.globalAlpha = fade;
      ctx.drawImage(layer, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = cache.grad;
      var sweep = ((p * 0.3) % 1) * 3 - 1.5; // thinking: a pulse that keeps travelling left to right
      var gain = fade * bright * (0.7 + 0.5 * E);
      for (s = 0; s < RB_NS; s++) {
        var sc = RB_SC[s], so = 0.35 * Math.sin(0.7 * p + s);
        for (j = 0; j < RB_NP; j++) {
          u = RB_U[j];
          var loc = 1 + th * 1.1 * Math.exp(-(u - sweep) * (u - sweep) * 5);
          var d = u - so;
          var c = E * loc * (0.42 * Math.sin(3.1 * u + 1.3 * p + s * 0.5) + 0.22 * Math.sin(6.3 * u - 2.1 * p + 1 + s)) +
            lv * 0.4 * Math.sin(15 * u + 5 * p + s * 2) * Math.exp(-d * d * 6);
          var W = (0.07 + 0.26 * E) * loc;
          var tw = u * (2.4 + 0.7 * s) + p * (0.9 + 0.3 * s) + 2.1 * s;
          bufA[j] = c * sc;
          bufB[j] = W * Math.cos(tw);
          bufC[j] = W * Math.sin(tw);
          if (s === 0) bufK[j] = c * 0.55;
        }
        for (l = 0; l < RB_NL + 2; l++) {
          // last two passes: wide faint strokes on the sheet edges = glow without shadowBlur
          var glow = l >= RB_NL;
          var k = glow ? (l === RB_NL ? -1 : 1) : l / ((RB_NL - 1) / 2) - 1;
          ctx.beginPath();
          for (j = 0; j < RB_NP; j++) {
            env = RB_ENV[j];
            var x = cx + R * (RB_U[j] + k * bufC[j] * 0.3 * env);
            var y = cy + R * env * 0.9 * Math.tanh((bufA[j] + k * bufB[j]) / 0.9);
            if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          ctx.lineWidth = glow ? lw * 5 : lw;
          ctx.globalAlpha = Math.min(1, gain * (glow ? 0.07 : 0.16 + 0.34 * k * k));
          ctx.stroke();
        }
      }
      // white-hot core
      ctx.beginPath();
      for (j = 0; j < RB_NP; j++) {
        var yy = cy + R * RB_ENV[j] * 0.9 * Math.tanh(bufK[j] / 0.9);
        if (j) ctx.lineTo(cx + R * RB_U[j], yy); else ctx.moveTo(cx + R * RB_U[j], yy);
      }
      ctx.lineWidth = lw * 6; ctx.globalAlpha = Math.min(1, gain * 0.3); ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = lw * 1.7; ctx.globalAlpha = Math.min(1, fade * (0.75 + 0.25 * E)); ctx.stroke();
    }

    function drawRing(E, lv, th) {
      var cx = S / 2, R0 = S * 0.31, lw = Math.max(1, S * 0.0022), i, j, a;
      ctx.globalAlpha = fade * Math.min(1, 0.45 + 0.6 * E);
      ctx.drawImage(layer, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      ctx.lineWidth = lw;
      var wob = 0.012 + 0.075 * E, T = S * (0.008 + 0.05 * E) / (2 * R0);
      for (i = 0; i < RG_NL; i++) {
        var dir = i % 2 ? -1 : 1;
        var rot = dir * p * (0.22 + 0.07 * i) + i * 0.9;
        var rx = R0 * (1 + 0.06 * Math.sin(i * 1.7)), ry = R0 * (0.9 + 0.07 * Math.cos(i * 2.3));
        var cr = Math.cos(rot), sr = Math.sin(rot);
        var tp = dir * p * (0.6 + 0.1 * i) - i * 2;
        for (j = 0; j < RG_NP; j++) {
          a = j / RG_NP * TAU;
          var m = 1 + wob * (0.6 * Math.sin(3 * a + 1.1 * p + i) + 0.4 * Math.sin(5 * a - 1.7 * p + 2 * i));
          var ex = rx * m * Math.cos(a), ey = ry * m * Math.sin(a);
          px[j] = ex * cr - ey * sr;
          py[j] = ex * sr + ey * cr;
          var t1 = 0.5 + 0.5 * Math.sin(a - tp);
          var t2 = 0.5 + 0.5 * Math.cos(a + rot - spin); // thinking: one bright thick arc orbiting on every loop
          ph[j] = T * (0.1 + 0.9 * t1 * t1) * (1 + th * 1.6 * t2 * t2 * t2);
        }
        // band of varying thickness: outer edge forward, inner edge back
        ctx.beginPath();
        for (j = 0; j < RG_NP; j++) {
          if (j) ctx.lineTo(cx + px[j] * (1 + ph[j]), cx + py[j] * (1 + ph[j]));
          else ctx.moveTo(cx + px[j] * (1 + ph[j]), cx + py[j] * (1 + ph[j]));
        }
        ctx.closePath();
        ctx.moveTo(cx + px[0] * (1 - ph[0]), cx + py[0] * (1 - ph[0]));
        for (j = RG_NP - 1; j > 0; j--) ctx.lineTo(cx + px[j] * (1 - ph[j]), cx + py[j] * (1 - ph[j]));
        ctx.closePath();
        ctx.fillStyle = cache.fill[i];
        ctx.globalAlpha = Math.min(1, fade * bright * (0.17 + 0.10 * E));
        ctx.fill();
        ctx.beginPath();
        for (j = 0; j < RG_NP; j++) {
          if (j) ctx.lineTo(cx + px[j], cx + py[j]); else ctx.moveTo(cx + px[j], cx + py[j]);
        }
        ctx.closePath();
        ctx.strokeStyle = cache.line[i];
        ctx.globalAlpha = Math.min(1, fade * bright * (0.3 + 0.3 * E));
        ctx.stroke();
      }
      ctx.fillStyle = cache.spark;
      for (i = 0; i < RG_SPARK; i++) {
        a = (i % 2 ? -1 : 1) * p * (0.12 + 0.03 * i) + i * 1.9 + spin * 0.3;
        var rr = R0 * (1.2 + 0.12 * Math.sin(p * 0.5 + i * 2.4) + (i % 3 === 0 ? -0.45 : 0));
        var tw = 0.5 + 0.5 * Math.sin(clock * (1.5 + 0.4 * i) + i * 3);
        var sx = cx + rr * Math.cos(a), sy = cx + rr * Math.sin(a) * 0.92, rad = S * (0.003 + 0.004 * tw);
        ctx.globalAlpha = fade * 0.18 * (0.4 + tw);
        ctx.beginPath(); ctx.arc(sx, sy, rad * 3, 0, TAU); ctx.fill();
        ctx.globalAlpha = fade * (0.35 + 0.65 * tw);
        ctx.beginPath(); ctx.arc(sx, sy, rad, 0, TAU); ctx.fill();
      }
    }

    function drawVeil(E, lv, th) {
      var cx = S / 2, R = S * 0.42 * (1 + th * 0.05 * Math.sin(clock * 4)), i, j;
      ctx.globalAlpha = fade * Math.min(1, 0.5 + 0.6 * E);
      ctx.drawImage(layer, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, S * 0.002);
      var A = 0.05 + 0.2 * E, K = 2.6 + 0.8 * E;
      for (i = 0; i < VL_NL; i++) {
        var k = i / (VL_NL - 1), q = k * K;
        var f1 = 0.6 * p + q * 1.3, f2 = -0.9 * p + q * 2.1 + 1, f3 = 0.4 * p + q, f4 = q * 0.35 + spin * 0.5;
        var sq = 0.86 + 0.1 * Math.sin(0.5 * p + q * 1.7);
        ctx.beginPath();
        for (j = 0; j < VL_NP; j++) {
          var a = j / VL_NP * TAU;
          var rad = R * (0.72 + 0.36 * k) * (0.5 + 0.22 * Math.sin(2 * a + f1) + A * Math.sin(3 * a + f2));
          var ang = a + 0.5 * Math.sin(a + f3) + f4;
          var x = cx + rad * Math.cos(ang), y = cx + rad * sq * Math.sin(ang);
          if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = cache.line[i];
        ctx.globalAlpha = Math.min(1, fade * bright * (0.2 + 0.22 * E) * (0.55 + 0.45 * Math.sin(k * Math.PI)));
        ctx.stroke();
      }
    }

    var DRAW = { ribbons: drawRibbons, ring: drawRing, veil: drawVeil };

    function frame(ts) {
      raf = requestAnimationFrame(frame);
      var el = ts - lastTick;
      if (el < FRAME_MS - 4) return; // 30 fps cap: every 2nd frame on a 60 Hz screen
      lastTick = el > 2 * FRAME_MS ? ts : lastTick + FRAME_MS; // fixed step keeps the average at 30 on odd refresh rates
      if (!measure()) return;
      var t0 = onFrame ? performance.now() : 0;
      var dt = Math.min(0.1, Math.max(0, (ts - lastDraw) / 1000));
      lastDraw = ts;

      var k = Math.min(1, Math.max(0, (performance.now() - tStart) / EASE_MS));
      k = k * k * (3 - 2 * k);
      for (var i = 0; i < KEYS.length; i++) cur[KEYS[i]] = from[KEYS[i]] + (to[KEYS[i]] - from[KEYS[i]]) * k;
      // fast attack, slower release
      lvl += (lvlIn - lvl) * (1 - Math.exp(-dt / (lvlIn > lvl ? 0.06 : 0.22)));

      var lv = reduced ? 0 : lvl * cur.g;
      var E = reduced ? 0.1 : Math.min(1, cur.e + lv);
      var th = reduced ? 0 : cur.th;
      p += dt * (reduced ? 0.15 : cur.sp * (1 + lv * 1.2));
      spin += dt * th * 2.6; // accumulated, so easing th never makes an angle jump
      clock += dt;
      fade = Math.min(1, fade + dt / 0.3);

      var q = Math.round(cur.cool * 10);
      if (q !== tintQ) retint(q);
      var b0 = bright;
      bright = b0 * (1 + cur.th * 0.22 * Math.sin(clock * 5)); // thinking pulse (brightness only, kept under reduced motion)

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, S, S);
      DRAW[style](E, lv, th);
      bright = b0;
      if (onFrame) onFrame(performance.now() - t0);
    }

    function play() {
      if (raf || !running || dead || document.hidden) return;
      lastTick = 0;
      lastDraw = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function pause() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    function onVis() { if (document.hidden) pause(); else play(); }
    document.addEventListener('visibilitychange', onVis);

    return {
      setState: function (s) {
        if (dead || !STATES[s] || STATES[s] === to) return;
        for (var i = 0; i < KEYS.length; i++) from[KEYS[i]] = cur[KEYS[i]];
        to = STATES[s];
        tStart = performance.now();
      },
      setLevel: function (v) {
        v = +v;
        lvlIn = v > 0 ? (v < 1 ? v : 1) : 0; // NaN -> 0
      },
      setStyle: function (name) {
        if (dead || STYLES.indexOf(name) < 0 || name === style) return;
        style = name;
        fade = 0;
        rebuild();
      },
      start: function () { if (dead) return; running = true; play(); },
      stop: function () { running = false; pause(); },
      destroy: function () {
        if (dead) return;
        running = false; pause(); dead = true;
        document.removeEventListener('visibilitychange', onVis);
        if (mq) { if (mq.removeEventListener) mq.removeEventListener('change', onMq); else if (mq.removeListener) mq.removeListener(onMq); }
        layer.width = layer.height = 0; // iOS frees canvas memory only when it is shrunk
        if (S) ctx.clearRect(0, 0, S, S);
        cache = {};
      }
    };
  }

  window.HP.orb = { styles: STYLES.slice(), create: create };
})();
