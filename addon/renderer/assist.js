'use strict';
// The assistant button: tap it (or say its wake word), speak, hear the answer. Everything shows inside the
// button itself: the orb, what was heard, what was answered. Two routes, chosen per button in the Studio:
//   'ha'   the whole exchange runs in a Home Assistant voice pipeline (speech to text, the assistant, text to speech)
//   'llm'  Home Assistant only hears and speaks; the text in between goes to the LLM set in HomePanel Studio
// Sound is sent to Home Assistant only from the tap or wake word until the end of the sentence.
(() => {
  let run = null;  // the exchange in progress

  /** Where this exchange shows: the button if it is on screen, otherwise a small strip at the bottom of the screen. */
  function view(t) {
    const inst = HP.live.find(i => i.t === t && i.orb);
    if (inst) {  // the button is on screen: its own orb and lines show the exchange
      const n = inst.p.n, l = inst.p.l, was = {n: n.textContent, l: l.textContent};
      return {orb: inst.orb, said: n, heard: l, close() { if (inst.orb) { inst.orb.setLevel(0); inst.orb.setState('idle'); } n.textContent = was.n; l.textContent = was.l; }};
    }
    const box = document.getElementById('assist');
    box.innerHTML = '<div class="ic"></div><div class="tx"><div class="n"></div><div class="l"></div></div>';
    const hold = box.querySelector('.ic'), canvas = document.createElement('canvas');
    hold.append(canvas); box.classList.add('talking');
    const side = Math.floor(Math.min(hold.clientWidth, hold.clientHeight) * 0.92);
    canvas.style.width = canvas.style.height = side + 'px';
    const orb = HP.orb ? HP.orb.create(canvas, {style: t.orb || 'ribbons'}) : null;
    if (orb) orb.start();
    return {orb, said: box.querySelector('.n'), heard: box.querySelector('.l'), close() { if (orb) orb.destroy(); box.classList.remove('talking'); box.innerHTML = ''; }};
  }
  const state = (r, s, note) => { if (r.v.orb) r.v.orb.setState(s); if (note != null) r.v.heard.textContent = note; };
  const level = (r, v) => { if (r.v.orb) r.v.orb.setLevel(v); };

  function stopMic(r) {
    if (r.sending && r.handler != null) { try { HP.ha.ws.send(new Uint8Array([r.handler])); } catch (e) {} }  // an empty frame ends the audio
    r.sending = false;
    if (r.hear) { HP.mic.off(r.hear); r.hear = null; }
  }
  function close() {
    const r = run; if (!r) return;
    run = null;
    stopMic(r);
    if (r.sub) delete HP.ha.subs[r.sub];
    if (r.audio) { r.audio.pause(); r.audio.src = ''; }
    clearInterval(r.fake); clearTimeout(r.bye);
    if (r.ac) r.ac.close().catch(() => {});
    r.v.close();
    HP.wake.pause(false);
  }
  /** Leave the result (or the reason it failed) readable for a moment, then give the button back. */
  const finish = (r, note) => { if (run !== r) return; stopMic(r); state(r, 'idle', note); r.bye = setTimeout(() => { if (run === r) close(); }, 6000); };

  /** Sound for the pipeline: 16 kHz frames, each prefixed with the handler number Home Assistant gave this run. */
  function startMic(r) {
    r.hear = pcm => {
      level(r, HP.mic.level(pcm));
      if (r.handler == null || !r.sending) return;
      const frame = new Uint8Array(1 + pcm.byteLength); frame[0] = r.handler; frame.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 1);
      try { HP.ha.ws.send(frame); } catch (e) {}
    };
    return HP.mic.on(r.hear);
  }

  // ---- one pipeline run; resolves with what it produced ----
  function pipeline(r, msg) {
    return new Promise((res, rej) => {
      const out = {};
      HP.ha.subscribe(Object.assign({type: 'assist_pipeline/run'}, r.t.pipeline ? {pipeline: r.t.pipeline} : {}, msg), ev => {
        if (run !== r) return;
        const d = ev.data || {};
        if (ev.type === 'run-start') { r.handler = d.runner_data && d.runner_data.stt_binary_handler_id; if (r.handler != null) r.sending = true; }
        else if (ev.type === 'stt-vad-end') { stopMic(r); state(r, 'thinking'); }
        else if (ev.type === 'stt-end') { out.heard = d.stt_output && d.stt_output.text; state(r, 'thinking', out.heard || ''); }
        else if (ev.type === 'intent-end') { const sp = d.intent_output && d.intent_output.response && d.intent_output.response.speech; out.said = sp && sp.plain && sp.plain.speech; r.v.said.textContent = out.said || ''; }
        else if (ev.type === 'tts-end') out.tts = d.tts_output;
        else if (ev.type === 'error') { delete HP.ha.subs[r.sub]; rej(new Error(d.message || d.code || 'The assistant failed')); }
        else if (ev.type === 'run-end') { delete HP.ha.subs[r.sub]; res(out); }
      }).then(id => { r.sub = id; }, rej);
    });
  }

  // ---- speaking: on this tablet, or on a speaker in the house ----
  function speak(r, tts, text) {
    return new Promise(res => {
      const done = () => { clearInterval(r.fake); level(r, 0); res(); };
      state(r, 'speaking');
      const sp = r.t.speaker;
      if (sp && sp !== 'tablet') {
        HP.ctx.service('media_player', 'play_media', sp, {media_content_id: tts.media_id, media_content_type: 'music', announce: true});
        // The sound is elsewhere, so there is no level to read: move like speech for about as long as the sentence lasts.
        const until = Date.now() + Math.max(1500, (text || '').length * 62); let ph = 0;
        r.fake = setInterval(() => { ph += 0.5; level(r, 0.35 + 0.3 * Math.sin(ph) * Math.sin(ph * 0.37) + 0.15 * Math.random()); if (Date.now() > until) done(); }, 60);
        return;
      }
      const a = r.audio = new Audio(); a.crossOrigin = 'anonymous';
      a.src = HP.ha.url.replace(/^ws/, 'http').replace(/\/api\/websocket$/, '') + tts.url;
      a.onended = a.onerror = done;
      try {  // read the loudness of the reply as it plays
        const ac = r.ac = new (window.AudioContext || window.webkitAudioContext)();
        const an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaElementSource(a).connect(an); an.connect(ac.destination);
        const buf = new Uint8Array(an.fftSize);
        r.fake = setInterval(() => { an.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; s += x * x; } level(r, Math.min(1, Math.sqrt(s / buf.length) * 4)); }, 50);
      } catch (e) { console.log('assist: no level from playback: ' + e.message); }
      a.play().catch(e => { r.v.heard.textContent = 'Could not play the reply'; HP.report('assist: playback failed: ' + e.message); done(); });
    });
  }

  async function exchange(r, typed) {
    const llm = r.t.mode === 'llm';
    try {
      let heard = typed, said, tts;
      if (typed) state(r, 'thinking', typed);
      if (!llm) {
        const out = await pipeline(r, typed ? {start_stage: 'intent', end_stage: 'tts', input: {text: typed}} : {start_stage: 'stt', end_stage: 'tts', input: {sample_rate: 16000}});
        said = out.said; tts = out.tts;
      } else {
        if (!typed) heard = (await pipeline(r, {start_stage: 'stt', end_stage: 'stt', input: {sample_rate: 16000}})).heard;
        if (!heard) throw new Error('Nothing was heard');
        const resp = await fetch(HP.server + '/api/llm', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + HP.key}, body: JSON.stringify({messages: [{role: 'user', content: heard}]})});
        if (!resp.ok) throw new Error(await resp.text());
        said = (await resp.json()).text;
        r.v.said.textContent = said;
        tts = (await pipeline(r, {start_stage: 'tts', end_stage: 'tts', input: {text: said}})).tts;
      }
      if (run !== r) return;
      if (tts && (tts.url || tts.media_id)) await speak(r, tts, said);
      finish(r);
    } catch (e) { HP.report('assist: ' + e.message); finish(r, e.message); }
  }

  HP.assist = {
    get busy() { return !!run; },
    close,
    /** t is the assistant button's entry from the design. typed skips the microphone (used by tests). */
    start(t, typed) {
      if (run) return close();  // a second tap cancels
      if (!HP.ha || !HP.ready) return HP.toast('Not connected to the house yet');
      const r = run = {t, v: view(t), handler: null, sending: false};
      HP.wake.pause(true);
      r.v.said.textContent = '';
      if (typed) return exchange(r, typed);
      state(r, 'listening', 'Listening');
      startMic(r).then(() => { if (run === r) exchange(r); }, e => finish(r, e.message));
    },
  };
})();
