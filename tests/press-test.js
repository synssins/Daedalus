// Button press test: does a press reach the button under every overlay that takes taps?
//   node tests/press-test.js light.one [light.two ...]
// The page under test is the real engine, in headless Chrome at a television's size, served a panel by a Daedalus
// Workshop (WORKSHOP, default http://127.0.0.1:8723; a test copy, not the one the house uses). The presses are real:
// a press on a light that only switches toggles it in Home Assistant, a press on any other light opens its popup
// tile, and the last step switches the first light with that popup and back. So the test makes its own panel holding only the entities named on
// the command line, refuses to press when the page shows anything else, and leaves each entity as it found it.
// Two ways to press: a pointer click at the middle of the button, and the remote's arrows and OK.
'use strict';
const {spawn} = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const B = process.env.WORKSHOP || 'http://127.0.0.1:8723', ONLY = process.argv.slice(2), DEV = 'presstest', W = 960, H = 540, port = 9393;
if (!ONLY.length || ONLY.some(e => !/^light\.[a-z0-9_]+$/.test(e))) { console.error('usage: node tests/press-test.js light.one [light.two ...]'); process.exit(2); }
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = async (method, p, body) => { const r = await fetch(B + '/admin/api/' + p, {method, headers: {'Content-Type': 'application/json'}, body: body && JSON.stringify(body)}); if (!r.ok) throw new Error(method + ' ' + p + ': ' + r.status); return r.json(); };
// eight buttons: the four corners, where a press without a place used to land, and four between
const SPOTS = [[1, 1], [27, 1], [53, 1], [1, 19], [53, 19], [1, 37], [27, 37], [53, 37]];
const design = kind => ({format: 1, name: 'Press test', grid: {cols: 64, rows: 48}, start: 'home', rooms: {}, theme: {background: {color: '#1a2038'}, tile: {fill: 'rgba(255,255,255,.16)', radius: 22, gap: 5}},
  pages: [{id: 'home', name: 'Home', tiles: SPOTS.map(([x, y], i) => ({type: 'entity', x, y, w: 10, h: 10, entity: ONLY[i % ONLY.length], name: 'T' + i, style: {}}))}],
  fx: kind ? [{kind, always: true, now: 1}] : []});
const FAKE = `window.DaedalusNative = {post(t) { const m = JSON.parse(t), out = {id: m.id, cmd: m.cmd};
  if (m.cmd === 'ping') { out.config = {server: '${B}'}; out.device = {id: '${DEV}', model: 'Test TV', name: 'Press test', width: ${W}, height: ${H}, scale: 2}; } else out.error = 'none';
  setTimeout(() => window.nativeReply && window.nativeReply(out), 5); }}; window.__err = []; window.addEventListener('error', e => window.__err.push(e.message));`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presstest-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--hide-scrollbars',
  '--allow-file-access-from-files', '--user-data-dir=' + dir, '--remote-debugging-port=' + port, `--window-size=${W},${H}`, 'about:blank'], {stdio: 'ignore'});
let id = null, failed = 0;
const done = async code => { try { await api('DELETE', 'tablets/' + DEV); } catch (e) {} try { if (id) await api('DELETE', 'designs/' + id); } catch (e) {} chrome.kill(); process.exit(code); };

(async () => {
  let tab; for (let i = 0; i < 40 && !tab; i++) { await sleep(250); try { tab = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let n = 0; const wait4 = {};
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (wait4[m.id]) wait4[m.id](m.result); };
  const send = (method, params = {}) => new Promise(r => { wait4[++n] = r; ws.send(JSON.stringify({id: n, method, params})); });
  const ev = async x => ((await send('Runtime.evaluate', {expression: x, returnByValue: true, awaitPromise: true})).result || {}).value;

  id = (await api('POST', 'designs', {name: 'Press test', design: design(null)})).id;
  await send('Emulation.setDeviceMetricsOverride', {width: W, height: H, deviceScaleFactor: 1, mobile: false});
  await send('Page.enable'); await send('Page.addScriptToEvaluateOnNewDocument', {source: FAKE});
  await send('Page.navigate', {url: 'file:///' + path.resolve(__dirname, '../web/index.html').replace(/\\/g, '/')});
  await sleep(5000);
  await api('POST', 'tablets/' + DEV + '/approve'); await api('PATCH', 'tablets/' + DEV, {design: id});
  await sleep(8000);

  // The guard: the page shows the test panel, and every button on it is one of the named entities.
  const safe = async () => JSON.parse(await ev(`JSON.stringify({name: HP.design && HP.design.name, taps: document.querySelectorAll('.tap').length,
    ents: [...new Set((HP.design.pages || []).flatMap(p => p.tiles).flatMap(t => [t.entity, ...(t.items || []).map(i => i.entity)]).filter(Boolean))]})`));
  const check = async () => { const s = await safe(); if (s.name !== 'Press test' || s.taps !== SPOTS.length || s.ents.some(e => !ONLY.includes(e))) throw new Error('not the test panel, nothing pressed: ' + JSON.stringify(s)); };
  await check();
  // a press counts when the click arrives at the button itself (an overlay that claims it stops it on the way)
  await ev(`window.__hit = []; document.body.addEventListener('click', e => { const t = e.target.closest('.tap'); if (t) __hit.push((t.innerText.match(/T[0-9]/) || ['?'])[0]); })`);
  const hits = async () => JSON.parse(await ev('JSON.stringify(__hit.splice(0))'));
  const lit = async () => JSON.parse(await ev(`JSON.stringify(${JSON.stringify(ONLY)}.map(e => HP.util.active(e)))`)), found = await lit();  // to leave each as it was found
  const mids = async () => JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.tap')].map(el => { const r = el.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; }))`));
  const tapAt = async ([x, y]) => { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type, x, y, button: 'left', clickCount: 1}); await sleep(500); };
  const shut = () => ev('HP.pop.close()');  // a light with something to set opens its popup tile: closed again, so the next press meets the dashboard
  const click = async p => { await tapAt(p); await shut(); };
  const key = async k => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', {type, key: k, code: k, windowsVirtualKeyCode: {ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13}[k]}); await sleep(250); };

  const kinds = process.env.KINDS ? process.env.KINDS.split(',') : [null, ...JSON.parse(await ev('JSON.stringify(Object.keys(HP.fx.kinds).filter(k => HP.fx.kinds[k].tap))'))];  // KINDS=koi,tanks for a short run
  console.log('kind'.padEnd(14), 'pointer', 'remote');
  for (const kind of kinds) {
    await api('PUT', 'designs/' + id, {name: 'Press test', design: design(kind)});
    await sleep(7000); await check(); await hits();
    for (const p of await mids()) await click(p);
    const a = await hits();
    // the remote: the ring goes round the eight buttons, OK on each
    let b = [];
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft', 'ArrowUp']) { await key(k); await key('Enter'); await sleep(350); await shut(); b = b.concat(await hits()); }
    const err = JSON.parse(await ev('JSON.stringify(__err.splice(0))')), ok = a.length >= SPOTS.length - (kind === 'tanks') && b.length === 8 && new Set(b).size >= 3 && !err.length;  // tanks: the first tap ends the battle, as meant
    if (!ok) failed++;
    console.log((kind || '(none)').padEnd(14), (a.length + '/' + SPOTS.length).padEnd(7), (b.length + '/8').padEnd(6), ok ? 'ok' : 'FAIL ' + JSON.stringify({pointer: a, remote: b, err}));
  }
  // an entity left the other way round is pressed once more
  await api('PUT', 'designs/' + id, {name: 'Press test', design: design(null)}); await sleep(5000); await check();
  await sleep(2000); const at = await mids(), now = await lit();
  for (let i = 0; i < ONLY.length; i++) if (now[i] !== found[i]) await click(at[i]);
  // The popup tile, against the real light: its power button switches the light and switches it back, and a touch
  // outside the popup closes it without reaching the button underneath.
  if (await ev(`(HP.S.states[${JSON.stringify(ONLY[0])}].attributes.supported_color_modes || []).some(m => m !== 'onoff')`)) {
    const turned = async want => { for (let i = 0; i < 24; i++) { if ((await lit())[0] === want) return true; await sleep(500); } return false; };
    await hits(); await tapAt(at[0]);
    const power = JSON.parse(await ev(`JSON.stringify((() => { const b = document.querySelector('#pop.open .ph .rb'); if (!b) return null; const r = b.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })())`));
    const was = (await lit())[0]; let there = false, back = false;
    if (power) { await tapAt(power); there = await turned(!was); await tapAt(power); back = await turned(was); }
    await hits(); await tapAt(at[0]);
    const closed = !(await ev('!!HP.pop.cur')), through = (await hits()).length, good = !!power && there && back && closed && !through;
    if (!good) failed++;
    console.log('popup'.padEnd(14), good ? 'ok' : 'FAIL ' + JSON.stringify({opened: !!power, there, back, closed, through}));
    await shut();
  }
  console.log(failed ? failed + ' kind(s) failed' : 'all pressed');
  ws.close(); await done(failed ? 1 : 0);
})().catch(async e => { console.error(String(e.message || e)); await done(1); });
