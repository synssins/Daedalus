'use strict';
// Remote control: a television has no touch. The arrow keys move a ring from button to button, OK presses the one
// it is on, and past the last button on a side comes the next dashboard. Back closes what is open. Nothing shows
// until a key is pressed, so a tablet never sees the ring.
(() => {
  let cur = null, at = null, ring = null, idle = 0;
  const seen = el => { const r = el.getBoundingClientRect(); return !el.hidden && r.width > 4 && r.height > 4; };
  const modal = () => { const m = document.getElementById('modal'); return m && m.className === 'open' ? m : null; };
  /** What can be pressed now: the buttons of an open question, else every button on the dashboard (of a tile
   *  that holds several, each one and not the tile). */
  const list = () => [...(modal() || document).querySelectorAll('.tap, [data-m]')].filter(el => seen(el) && !el.querySelector('.tap'));
  const mid = el => { const r = el.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; };

  function mark(el) {
    cur = el;
    if (!ring) {
      ring = document.createElement('div');
      ring.style.cssText = 'position:fixed;z-index:10;pointer-events:none;box-sizing:border-box;border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.6),0 0 18px rgba(255,255,255,.6);transition:left .12s,top .12s,width .12s,height .12s,opacity .3s';
      document.body.append(ring);
    }
    if (!el) { ring.style.opacity = 0; return; }
    const r = el.getBoundingClientRect(); at = mid(el);
    Object.assign(ring.style, {opacity: 1, left: r.left - 5 + 'px', top: r.top - 5 + 'px', width: r.width + 10 + 'px', height: r.height + 10 + 'px',
      borderRadius: (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0) + 5 + 'px'});
    clearTimeout(idle); idle = setTimeout(() => { ring.style.opacity = 0; }, 30000);  // left alone, it goes; the next key brings it back
  }
  /** The ring's button is gone (the dashboard was drawn again, a question opened): the one nearest to where it was. */
  function nearest() {
    const p = at || {x: 0, y: 0}; let best = null, bd = 1e9;
    for (const el of list()) { const m = mid(el), d = Math.hypot(m.x - p.x, m.y - p.y); if (d < bd) { bd = d; best = el; } }
    mark(best); return !!best;
  }
  const lost = () => !cur || !cur.isConnected || list().indexOf(cur) < 0;
  /** One step in a direction: the nearest button that way, counting sideways distance double. False at the edge. */
  function step(dx, dy) {
    if (lost()) return nearest();
    const a = mid(cur); let best = null, bs = 1e9;
    for (const el of list()) {
      if (el === cur) continue;
      const m = mid(el), along = (m.x - a.x) * dx + (m.y - a.y) * dy, across = Math.abs((m.x - a.x) * dy) + Math.abs((m.y - a.y) * dx);
      if (along < 8 || across > along * 3) continue;
      if (along + across * 2 < bs) { bs = along + across * 2; best = el; }
    }
    if (best) mark(best);
    return !!best;
  }
  /** The next dashboard, round and round as with a swipe; the ring comes in at the side it left by. */
  function turn(dir) {
    const pages = swipePages(); if (pages.length < 2 || modal()) return;
    const i = pages.findIndex(p => p.panel === HP.cur && p.id === HP.stack[0].page), n = pages[(i + dir + pages.length) % pages.length];
    HP.stack = [{panel: n.panel, page: n.id}]; show();
    at = {x: dir > 0 ? 0 : innerWidth, y: at ? at.y : innerHeight / 2}; cur = null; nearest();
  }
  /** Back: an open question is answered "Cancel", a room or a linked dashboard is left. False when nothing was open. */
  HP.remoteBack = () => {
    const m = modal();
    if (m) { m.className = ''; setTimeout(nearest, 60); return true; }
    if (HP.stack && HP.stack.length > 1) { ctx.back(); setTimeout(nearest, 60); return true; }
    return false;
  };
  const DIR = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
  window.addEventListener('keydown', e => {
    const d = DIR[e.key];
    if (d) { e.preventDefault(); if (ring && ring.style.opacity === '0' && !lost()) mark(cur); else if (!step(d[0], d[1]) && d[0]) turn(d[0]); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (lost()) nearest(); else { mark(cur); cur.click(); setTimeout(() => { if (lost()) nearest(); }, 80); } }
    else if (e.key === 'Escape' || e.key === 'Backspace') { if (HP.remoteBack()) e.preventDefault(); }
  });
})();
