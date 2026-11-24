'use strict';
// The assistant button: tap, speak, hear the answer. Two routes, chosen per button in the Studio:
//   'ha'   the whole exchange runs in a Home Assistant voice pipeline (speech to text, the assistant, text to speech)
//   'llm'  Home Assistant only hears and speaks; the text in between goes to the LLM set in HomePanel Studio
// The microphone is open only between the tap and the end of the sentence. While it listens and speaks, an orb
// (orb.js) moves with the real sound level.
(() => {
  const U = HP.util, $ = id => document.getElementById(id);
  let run = null;  // the exchange in progress

  function ui(t) {
    const box = $('assist');
    box.innerHTML = '<div class="as-x" data-a="close">Close</div><canvas class="as-orb"></canvas><div class="as-heard"></div><div class="as-said"></div>' +
      '<form class="as-type"><input type="text" placeholder="Or type here" autocomplete="off"><button type="submit">Send</button></form><div class="as-note"></div>';
    box.className = 'open';
    const orb = HP.orb ? HP.orb.create(box.querySelector('canvas'), {style: t.orb || 'ribbons'}) : null;
    if (orb) orb.start();
    return {box, orb, heard: box.querySelector('.as-heard'), said: box.querySelector('.as-said'), note: box.querySelector('.as-note'), form: box.querySelector('form')};
  }
  const state = (r, s, note) => { if (r.v.orb) r.v.orb.setState(s); r.v.note.textContent = note || ''; };
  const level = (r, v) => { if (r.v.orb) r.v.orb.setLevel(v); };

  function close() {
    const r = run; if (!r) return;
    run = null;
    stopMic(r);
    if (r.sub) delete HP.ha.subs[r.sub];
    if (r.audio) { r.audio.pause(); r.audio.src = ''; }
    clearInterval(r.fake); clearTimeout(r.bye);
    if (r.ac) r.ac.close().catch(() => {});
    if (r.v.orb) r.v.orb.destroy();
    $('assist').className = ''; $('assist').innerHTML = '';
  }
  const fail = (r, text) => { if (run !== r) return; stopMic(r); state(r, 'idle', text); };

  // ---- microphone: 16 kHz, 16-bit, mono, in small frames, as the pipeline wants it ----
  async function startMic(r) {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) throw new Error('No microphone here. Type instead.');
    r.stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}});
    const ac = r.ac = r.ac || new (window.AudioContext || window.webkitAudioContext)();
    await ac.resume();
    const src = ac.createMediaStreamSource(r.stream), proc = r.proc = ac.createScriptProcessor(4096, 1, 1), step = ac.sampleRate / 16000;
    let carry = 0;
    proc.onaudioprocess = e => {
      const inp = e.inputBuffer.getChannelData(0), n = Math.floor((inp.length - carry) / step), out = new Int16Array(n);
      let sum = 0;
      for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, inp[Math.floor(carry + i * step)])); out[i] = s * 32767; sum += s * s; }
      carry = (carry + n * step) - inp.length; if (carry < 0) carry = 0;
      level(r, Math.min(1, Math.sqrt(sum / Math.max(1, n)) * 6));
      if (r.handler == null || !r.sending) return;
      const frame = new Uint8Array(1 + out.byteLength); frame[0] = r.handler; frame.set(new Uint8Array(out.buffer), 1);
      try { HP.ha.ws.send(frame); } catch (err) {}
    };
    const mute = ac.createGain(); mute.gain.value = 0;  // the processor only runs while connected to an output
    src.connect(proc); proc.connect(mute); mute.connect(ac.destination);
  }
  function stopMic(r) {
    if (r.sending && r.handler != null) { try { HP.ha.ws.send(new Uint8Array([r.handler])); } catch (e) {} }  // an empty frame ends the audio
    r.sending = false;
    if (r.proc) { r.proc.disconnect(); r.proc.onaudioprocess = null; r.proc = null; }
    if (r.stream) { r.stream.getTracks().forEach(x => x.stop()); r.stream = null; }
  }

  // ---- one pipeline run; resolves with what it produced ----
  function pipeline(r, msg, onEvent) {
    return new Promise((res, rej) => {
      const out = {};
      HP.ha.subscribe(Object.assign({type: 'assist_pipeline/run'}, r.t.pipeline ? {pipeline: r.t.pipeline} : {}, msg), ev => {
        if (run !== r) return;
        const d = ev.data || {};
        if (ev.type === 'run-start') { r.handler = d.runner_data && d.runner_data.stt_binary_handler_id; if (r.handler != null) r.sending = true; }
        else if (ev.type === 'stt-vad-end') { stopMic(r); state(r, 'thinking'); }
        else if (ev.type === 'stt-end') { out.heard = d.stt_output && d.stt_output.text; r.v.heard.textContent = out.heard || ''; state(r, 'thinking'); }
        else if (ev.type === 'intent-end') { const sp = d.intent_output && d.intent_output.response && d.intent_output.response.speech; out.said = sp && sp.plain && sp.plain.speech; r.v.said.textContent = out.said || ''; }
        else if (ev.type === 'tts-end') out.tts = d.tts_output;
        else if (ev.type === 'error') { delete HP.ha.subs[r.sub]; rej(new Error(d.message || d.code || 'The assistant failed')); }
        else if (ev.type === 'run-end') { delete HP.ha.subs[r.sub]; res(out); }
        if (onEvent) onEvent(ev);
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
        const ac = r.ac = r.ac || new (window.AudioContext || window.webkitAudioContext)();
        const an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaElementSource(a).connect(an); an.connect(ac.destination);
        const buf = new Uint8Array(an.fftSize);
        r.fake = setInterval(() => { an.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; s += x * x; } level(r, Math.min(1, Math.sqrt(s / buf.length) * 4)); }, 50);
      } catch (e) { console.log('assist: no level from playback: ' + e.message); }
      a.play().catch(e => { r.v.note.textContent = 'Could not play the reply: ' + e.message; done(); });
    });
  }

  async function exchange(r, typed) {
    const t = r.t, llm = t.mode === 'llm';
    try {
      let heard = typed, said, tts;
      if (typed) { r.v.heard.textContent = typed; state(r, 'thinking'); }
      if (!llm) {
        const out = await pipeline(r, typed ? {start_stage: 'intent', end_stage: 'tts', input: {text: typed}} : {start_stage: 'stt', end_stage: 'tts', input: {sample_rate: 16000}});
        said = out.said; tts = out.tts;
      } else {
        if (!typed) heard = (await pipeline(r, {start_stage: 'stt', end_stage: 'stt', input: {sample_rate: 16000}})).heard;
        if (!heard) throw new Error('Nothing was heard.');
        r.history.push({role: 'user', content: heard});
        const resp = await fetch(HP.server + '/api/llm', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + HP.key}, body: JSON.stringify({messages: r.history})});
        if (!resp.ok) throw new Error(await resp.text());
        said = (await resp.json()).text; r.history.push({role: 'assistant', content: said});
        r.v.said.textContent = said;
        tts = (await pipeline(r, {start_stage: 'tts', end_stage: 'tts', input: {text: said}})).tts;
      }
      if (run !== r) return;
      if (tts && (tts.url || tts.media_id)) await speak(r, tts, said);
      if (run !== r) return;
      state(r, 'idle');
      r.bye = setTimeout(() => { if (run === r) close(); }, 6000);  // leave the answer readable for a moment
    } catch (e) { fail(r, e.message); }
  }

  HP.assist = {
    close,
    open(t) {
      if (run) close();
      if (!HP.ha || !HP.ready) return HP.toast('Not connected to the house yet');
      const r = run = {t, v: ui(t), history: [], handler: null, sending: false};
      r.v.box.onclick = e => { if (e.target === r.v.box || e.target.dataset.a === 'close') close(); };
      r.v.form.onsubmit = e => {
        e.preventDefault(); const text = r.v.form.firstChild.value.trim(); if (!text) return;
        clearTimeout(r.bye); stopMic(r); if (r.sub) delete HP.ha.subs[r.sub];
        r.v.form.firstChild.value = ''; r.v.said.textContent = ''; exchange(r, text);
      };
      state(r, 'listening', 'Listening');
      startMic(r).then(() => { if (run === r) exchange(r); else stopMic(r); }, e => fail(r, e.name === 'NotAllowedError' ? 'The microphone is not allowed on this device. Type instead.' : e.message));
    },
  };
})();
