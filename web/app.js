'use strict';

// ---------- native bridge ----------
const pending = {}; let seq = 0;
function native(cmd, extra) {
  return new Promise((res, rej) => {
    const id = ++seq; pending[id] = res;
    try { window.webkit.messageHandlers.native.postMessage(Object.assign({id, cmd}, extra)); }
    catch (e) { delete pending[id]; rej(e); }
    setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error('native: no reply')); } }, 3000);
  });
}
window.nativeReply = m => { const f = pending[m.id]; if (f) { delete pending[m.id]; f(m); } };

// ---------- Home Assistant websocket ----------
class HA {
  constructor(url, token) {
    this.url = url.replace(/^http/, 'ws') + '/api/websocket';
    this.token = token; this.id = 0; this.waits = {}; this.subs = {};
    this.onstate = () => {}; this.onready = () => {};
  }
  connect() {
    this.onstate('connecting');
    const ws = this.ws = new WebSocket(this.url);
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.type === 'auth_required') ws.send(JSON.stringify({type: 'auth', access_token: this.token}));
      else if (m.type === 'auth_ok') { this.onstate('online'); this.onready(); }
      else if (m.type === 'auth_invalid') { this.token = null; this.onstate('token rejected'); }
      else if (m.type === 'result') {
        const w = this.waits[m.id]; delete this.waits[m.id];
        if (w) m.success ? w.res(m.result) : w.rej(new Error((m.error && m.error.message) || 'HA error'));
      } else if (m.type === 'event' && this.subs[m.id]) this.subs[m.id](m.event);
    };
    // Panel must heal by itself: HA restarts, WiFi drops. Retry forever unless the token is bad.
    ws.onclose = () => {
      for (const k in this.waits) this.waits[k].rej(new Error('HA socket closed'));
      this.waits = {}; this.subs = {};
      if (this.token) { this.onstate('offline, retrying'); setTimeout(() => this.connect(), 5000); }
    };
  }
  call(msg) {
    return new Promise((res, rej) => {
      const id = ++this.id; this.waits[id] = {res, rej};
      this.ws.send(JSON.stringify(Object.assign({id}, msg)));
    });
  }
  /** Like call(), but keeps delivering events for that id to onEvent. */
  subscribe(msg, onEvent) {
    const id = this.id + 1; this.subs[id] = onEvent;
    return this.call(msg).then(() => id, e => { delete this.subs[id]; throw e; });
  }
}

// ---------- live camera over HA's WebRTC signalling (HA hands the stream to its go2rtc) ----------
function playCamera(ha, entity, video, status) {
  let pc, closed = false;
  (async () => {
    const cfg = await ha.call({type: 'camera/webrtc/get_client_config', entity_id: entity}).catch(() => ({}));
    if (closed) return;
    pc = new RTCPeerConnection(cfg.configuration || {});
    pc.addTransceiver('video', {direction: 'recvonly'});
    pc.addTransceiver('audio', {direction: 'recvonly'});
    if (cfg.dataChannel) pc.createDataChannel(cfg.dataChannel);
    const stream = new MediaStream(); video.srcObject = stream;
    pc.ontrack = e => { stream.addTrack(e.track); video.play().catch(() => {}); };
    pc.onconnectionstatechange = () => status(pc.connectionState === 'connected' ? '' : pc.connectionState);

    let session = null; const queued = [];
    const sendCand = c => ha.call({type: 'camera/webrtc/candidate', entity_id: entity, session_id: session, candidate: c}).catch(() => {});
    pc.onicecandidate = e => {
      if (!e.candidate) return;
      const c = {candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex};
      session ? sendCand(c) : queued.push(c);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    status('negotiating');
    await ha.subscribe({type: 'camera/webrtc/offer', entity_id: entity, offer: offer.sdp}, ev => {
      if (closed) return;
      if (ev.type === 'session') { session = ev.session_id; queued.splice(0).forEach(sendCand); }
      else if (ev.type === 'answer') pc.setRemoteDescription({type: 'answer', sdp: ev.answer}).catch(e => status(String(e)));
      else if (ev.type === 'candidate') {
        const c = typeof ev.candidate === 'string' ? {candidate: ev.candidate, sdpMid: '0'} : ev.candidate;
        pc.addIceCandidate(c).catch(() => {});
      } else if (ev.type === 'error') status(ev.message || ev.code || 'stream error');
    });
  })().catch(e => { console.error('camera ' + entity + ': ' + e.message); status(e.message); });
  return () => { closed = true; if (pc) pc.close(); video.srcObject = null; };
}

// ---------- camera wall ----------
const MAX_LIVE = 4;  // Air 2 has 2 GB RAM: cap simultaneous decoders
const wall = document.getElementById('wall');
const bar = document.getElementById('bar');
let ha, stops = [];

function render(states, only) {
  stops.forEach(f => f()); stops = [];
  wall.innerHTML = '';
  let cams = states.filter(s => s.entity_id.startsWith('camera.'));
  if (only) cams = cams.filter(s => s.entity_id === only);
  // Live cameras first, so the decoder budget goes to ones that work.
  cams.sort((a, b) => (a.state === 'unavailable') - (b.state === 'unavailable') || a.entity_id.localeCompare(b.entity_id));
  wall.className = only ? 'one' : '';
  if (!cams.length) { wall.innerHTML = '<div class="empty">No cameras in Home Assistant</div>'; return; }
  let live = 0;
  for (const s of cams) {
    const tile = document.createElement('div'); tile.className = 'tile';
    const video = document.createElement('video');
    video.muted = true; video.autoplay = true; video.playsInline = true; video.setAttribute('playsinline', '');
    const label = document.createElement('div'); label.className = 'label';
    const name = (s.attributes.friendly_name || s.entity_id).replace(/ High resolution channel$/i, '');
    const status = t => { label.textContent = t ? name + ' · ' + t : name; tile.classList.toggle('dead', !!t); };
    tile.append(video, label);
    wall.append(tile);
    if (s.state === 'unavailable') status('unavailable');
    else if (live < MAX_LIVE || only) { live++; status('connecting'); stops.push(playCamera(ha, s.entity_id, video, status)); }
    else status('tap to view');
    tile.onclick = () => load(only ? null : s.entity_id);
  }
}

function load(only) {
  ha.call({type: 'get_states'}).then(st => render(st, only)).catch(e => { bar.textContent = e.message; });
}

native('ping').then(m => {
  const cfg = m.config || {};
  if (!cfg.ha_url || !cfg.ha_token) { bar.textContent = 'config.json needs ha_url and ha_token'; return; }
  ha = new HA(cfg.ha_url, cfg.ha_token);
  ha.onstate = s => { bar.textContent = s === 'online' ? '' : 'Home Assistant: ' + s; console.log('HA ' + s); };
  ha.onready = () => load(null);
  ha.connect();
}).catch(e => { bar.textContent = 'native bridge failed: ' + e.message; });
