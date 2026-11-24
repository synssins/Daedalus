'use strict';
// One microphone for everything that listens: the wake word (wake.js) and the assistant (assist.js).
// Sound arrives as 16 kHz, 16-bit, mono chunks. In the tablet app the native shell captures it (reliable all day
// and independent of the web view); in a browser the page captures it itself.
// The microphone is open only while something is subscribed.
(() => {
  const subs = new Set();
  let web = null, starting = null;

  let told = 0, chunks = 0;
  const emit = pcm => {
    if (++chunks === 1) HP.report('mic: sound is arriving, ' + pcm.length + ' samples a piece');
    subs.forEach(fn => { try { fn(pcm); } catch (e) { console.error('mic listener: ' + e.message); if (told++ < 3) HP.report('mic listener failed: ' + e.message); } });
  };
  /** The native shell calls this with base64 of little-endian 16-bit samples. */
  window.nativeAudio = b64 => {
    if (!subs.size) return;
    const bin = atob(b64), pcm = new Int16Array(bin.length >> 1);
    for (let i = 0; i < pcm.length; i++) pcm[i] = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16 >> 16;
    emit(pcm);
  };

  async function startWeb() {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) throw new Error('No microphone here');
    const stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}});
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    await ac.resume();
    const src = ac.createMediaStreamSource(stream), proc = ac.createScriptProcessor(4096, 1, 1), step = ac.sampleRate / 16000;
    let carry = 0;
    proc.onaudioprocess = e => {
      const inp = e.inputBuffer.getChannelData(0), n = Math.floor((inp.length - carry) / step), out = new Int16Array(n);
      for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, inp[Math.floor(carry + i * step)])) * 32767;
      carry = Math.max(0, carry + n * step - inp.length);
      emit(out);
    };
    const mute = ac.createGain(); mute.gain.value = 0;  // the processor only runs while connected to an output
    src.connect(proc); proc.connect(mute); mute.connect(ac.destination);
    web = {stream, ac, proc};
  }
  function start() {
    if (starting) return starting;
    starting = native('mic', {on: true}, 3600000).then(r => { if (r.error) throw new Error(r.error === 'denied' ? 'The microphone is not allowed on this device' : r.error); HP.mic.native = true;
      // If no sound shows up, ask the app where it stopped and pass that on.
      // If no sound shows up, ask the app where it stopped, pass that on, and capture in the page instead.
      setTimeout(() => {
        if (chunks || !subs.size) return;
        native('micstat').then(m => HP.report('mic: no sound from the app. it says ' + JSON.stringify({on: m.on, running: m.running, permission: m.permission, taps: m.taps, frames: m.frames, sent: m.sent, note: m.note, error: m.error})), () => {});
        native('mic', {on: false}).catch(() => {});
        HP.mic.native = false;
        startWeb().then(() => HP.report('mic: capturing in the page instead'), e => HP.report('mic: page capture failed too: ' + (e.name || '') + ' ' + e.message));
      }, 6000); },
      e => { if (/no native bridge/.test(e.message)) return startWeb(); throw e; }).catch(e => { starting = null; throw e; });
    return starting;
  }
  function stop() {
    starting = null; chunks = 0;
    if (HP.mic.native) native('mic', {on: false}).catch(() => {});
    if (web) { web.proc.disconnect(); web.proc.onaudioprocess = null; web.stream.getTracks().forEach(t => t.stop()); web.ac.close().catch(() => {}); web = null; }
  }

  HP.mic = {
    native: false,
    /** Start receiving sound. Resolves when the microphone is open; rejects with a readable reason. */
    on(fn) { subs.add(fn); return start().catch(e => { subs.delete(fn); throw e; }); },
    off(fn) { if (subs.delete(fn) && !subs.size) stop(); },
    /** Loudness of a chunk, 0 to 1. */
    level(pcm) { let s = 0; for (let i = 0; i < pcm.length; i++) s += pcm[i] * pcm[i]; return Math.min(1, Math.sqrt(s / Math.max(1, pcm.length)) / 32768 * 6); },
  };
})();
