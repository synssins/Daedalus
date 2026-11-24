'use strict';
// Wake word, heard on the tablet itself. No sound leaves the tablet until the word is recognised; then the
// assistant button it belongs to starts, exactly as if it had been tapped.
//
// It runs the same models Home Assistant's openWakeWord uses, so the words are the ones set up there (the
// standard ones and any custom ones). HomePanel Studio hands the model files and the runtime to the tablet.
// The method is openWakeWord's: every 80 ms the newest sound becomes 8 spectrum rows (computed here, see
// wake-mel.js), the last 76 rows become one "embedding" (a model), and the last 16 embeddings go to each
// word's own small model, which answers with a score from 0 to 1.
(() => {
  const STEP = 1280, CONTEXT = 480, KEEP = 2048, ROWS = 76, EMB = 16, N = 512, THRESHOLD = 0.5;
  let rt = null;       // {embed, words: {id: runner}} once loaded
  let want = [];       // word ids to listen for
  let onHit = null, listening = false, loading = false;
  const raw = new Int16Array(STEP * 4); let rawLen = 0;
  let mel = [], emb = [], steps = 0, quietUntil = 0, cost = 0, loud = 0;

  // ---- spectrum: 512-point transform of a 400-sample Hann window, 32 mel bands, in decibels ----
  const win = new Float32Array(N); for (let i = 0; i < 400; i++) win[56 + i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / 400);
  const cos = new Float32Array(N / 2), sin = new Float32Array(N / 2), rev = new Uint16Array(N);
  for (let i = 0; i < N / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / N); sin[i] = Math.sin(2 * Math.PI * i / N); }
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < 9; b++) r |= ((i >> b) & 1) << (8 - b); rev[i] = r; }
  const re = new Float32Array(N), im = new Float32Array(N);
  function melRows(buf, from) {  // 1760 samples starting at from -> 8 rows of 32
    const rows = []; let max = -Infinity;
    for (let f = 0; f < 8; f++) {
      const at = from + f * 160;
      for (let i = 0; i < N; i++) { re[rev[i]] = buf[at + i] * win[i]; im[i] = 0; }
      for (let size = 2; size <= N; size <<= 1) {
        const half = size >> 1, stride = N / size;
        for (let s = 0; s < N; s += size) for (let k = 0; k < half; k++) {
          const c = cos[k * stride], sn = sin[k * stride], a = s + k, b = a + half;
          const tr = re[b] * c + im[b] * sn, ti = im[b] * c - re[b] * sn;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
      const row = new Float32Array(32);
      for (let m = 0; m < 32; m++) {
        const start = HP_MEL[m][0], w = HP_MEL[m][1]; let e = 0;
        for (let i = 0; i < w.length; i++) { const k = start + i; e += (re[k] * re[k] + im[k] * im[k]) * w[i]; }
        row[m] = 10 * Math.log10(Math.max(1e-10, e)); if (row[m] > max) max = row[m];
      }
      rows.push(row);
    }
    // nothing more than 80 dB below the loudest point of this stretch, then the scale the embedding model was trained on
    for (const row of rows) for (let m = 0; m < 32; m++) row[m] = Math.max(row[m], max - 80) / 10 + 2;
    return rows;
  }

  // ---- runtime and models, fetched from the Studio ----
  const script = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not load ' + src)); document.head.append(s); });
  // The runtime's scripts come from the Studio, another origin than the app's own page. Asking for them "anonymously"
  // lets an error inside them be reported with its real message instead of a blank "Script error".
  const make = document.createElement.bind(document);
  document.createElement = function (tag) { const el = make.apply(null, arguments); if (String(tag).toLowerCase() === 'script') el.crossOrigin = 'anonymous'; return el; };
  async function load() {
    const base = HP.server + '/wake/';
    window.exports = window.exports || {};  // the runtime's last line assumes a module loader is present
    if (!window.tfweb) { await script(base + 'tflite_web_api_client.js'); tfweb.tflite_web_api.setWasmPath(base); }
    const open = async name => tfweb.TFLiteWebModelRunner.create(await (await fetch(base + name + '.tflite')).arrayBuffer(), {numThreads: 1});
    const r = rt || {embed: await open('embedding_model'), words: {}};
    for (const id of Object.keys(r.words)) if (!want.includes(id)) { r.words[id].cleanUp(); delete r.words[id]; }
    for (const id of want) if (!r.words[id]) { try { r.words[id] = await open(id); } catch (e) { HP.report('wake: no model for "' + id + '": ' + e.message); } }
    rt = r;
  }

  function step() {
    const t0 = performance.now();
    for (const row of melRows(raw, rawLen - STEP - CONTEXT)) mel.push(row);
    if (mel.length > ROWS) mel = mel.slice(mel.length - ROWS);
    if (mel.length < ROWS) return;
    const inp = rt.embed.getInputs()[0].data();
    for (let i = 0; i < ROWS; i++) inp.set(mel[i], i * 32);
    rt.embed.infer();
    emb.push(Float32Array.from(rt.embed.getOutputs()[0].data()));
    if (emb.length > EMB) emb.shift();
    if (emb.length === EMB) for (const id in rt.words) {
      const w = rt.words[id], x = w.getInputs()[0].data();
      for (let i = 0; i < EMB; i++) x.set(emb[i], i * 96);
      w.infer();
      const score = w.getOutputs()[0].data()[0];
      if (HP.wake.onScore) HP.wake.onScore(id, score);
      if (score >= THRESHOLD && performance.now() > quietUntil) { quietUntil = performance.now() + 2500; HP.report('wake: heard ' + id + ' (' + score.toFixed(2) + ')'); if (onHit) onHit(id); }
    }
    cost += performance.now() - t0;
    // after the first ten seconds, tell the Studio's log how heavy this is on this device and whether sound is arriving
    if (++steps === 125) HP.report('wake: listening for ' + Object.keys(rt.words).join(', ') + '; ' + (cost / 125).toFixed(1) + ' ms of work per 80 ms of sound; microphone level ' + (loud / 125).toFixed(3));
  }
  function feed(pcm) {
    if (!rt || HP.wake.paused) return;
    loud += HP.mic.level(pcm) * pcm.length / STEP;
    let i = 0;
    while (i < pcm.length) {
      // keep the newest sound in a sliding buffer; run one step for every 80 ms that arrives
      const take = Math.min(pcm.length - i, STEP - (feed.fill || 0));
      if (rawLen + take > raw.length) { raw.copyWithin(0, rawLen - KEEP, rawLen); rawLen = KEEP; }
      raw.set(pcm.subarray(i, i + take), rawLen); rawLen += take; i += take;
      feed.fill = (feed.fill || 0) + take;
      if (feed.fill === STEP) { feed.fill = 0; if (rawLen >= STEP + CONTEXT) step(); }
    }
  }

  HP.wake = {
    paused: false,
    feed,  // also used directly by tests, with recorded sound
    /** Listen for these word ids (from Home Assistant's list); hit(id) is called when one is heard. An empty list stops listening. */
    async listen(ids, hit) {
      want = [...new Set(ids)]; onHit = hit;
      if (!want.length) { if (listening) { HP.mic.off(feed); listening = false; } return; }
      if (loading) return;
      loading = true;
      try {
        const t0 = performance.now();
        await load();
        HP.report('wake: models ready in ' + Math.round(performance.now() - t0) + ' ms: ' + Object.keys(rt.words).join(', '));
        if (!listening) {
          // the first time, iOS asks on the tablet's screen whether the app may use the microphone, and waits for an answer
          const nag = setTimeout(() => HP.report('wake: waiting for the microphone; answer the question on the device screen'), 20000);
          try { await HP.mic.on(feed); } finally { clearTimeout(nag); }
          listening = true;
          HP.report('wake: microphone open (' + (HP.mic.native ? 'app' : 'browser') + ')');
        }
      } catch (e) { HP.report('wake: not listening: ' + e.message); }
      loading = false;
    },
    /** While the assistant is hearing or speaking, the wake word rests, so the tablet never wakes itself. */
    pause(on) { HP.wake.paused = on; if (!on) { mel = []; emb = []; rawLen = 0; feed.fill = 0; } },
    load: async ids => { want = ids; await load(); },
  };
})();
