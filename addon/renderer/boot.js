'use strict';
// Where the drawing engine comes from. The app carries one copy (engine.html and its scripts) so it can start
// with nothing else. HomePanel Studio hands out the current engine as one self-contained page; the tablet keeps
// it in its own storage and runs that copy from then on, with no server needed to start. So a new kind of button
// or behaviour reaches every tablet by updating the add-on, and the app itself only changes for native abilities.
//
// This file runs in two places: in index.html (the loader, marked by window.HP_LOADER) and inside the engine.
(() => {
  const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const drop = k => { try { localStorage.removeItem(k); } catch (e) {} };
  const preview = /[?&]preview=/.test(location.search);  // the Studio's own preview always runs the add-on's files directly
  /** An engine that did not manage to draw is never tried twice: back to the copy inside the app until a newer one arrives. */
  const giveUp = v => { set('hp:engine-bad', v); drop('hp:engine'); drop('hp:engine-try'); };

  if (window.HP_LOADER) {
    window.HP_LOADER = 0;
    const c = preview ? null : get('hp:engine');
    if (c && c.html && c.version) {
      if (get('hp:engine-try') === c.version) giveUp(c.version);  // it was started last time and never drew
      else { set('hp:engine-try', c.version); window.HP_ENGINE_VERSION = c.version; document.write(c.html); return; }
    }
    location.replace('engine.html' + location.search);
    return;
  }

  const version = window.HP_ENGINE_VERSION || 'bundled';
  if (version !== 'bundled') setTimeout(() => { if (get('hp:engine-try') === version) { giveUp(version); location.replace('index.html' + location.search); } }, 30000);
  window.HP_ENGINE = {
    version,
    /** Called once something has been drawn: this engine works here. */
    ok() { drop('hp:engine-try'); },
    /** Ask the Studio whether it has a different engine; if so keep it and restart into it. */
    check(server) {
      if (preview || this.busy) return;
      this.busy = true;
      fetch(server + '/api/engine?have=' + encodeURIComponent(version)).then(r => r.status === 200 ? r.json() : null).then(j => {
        this.busy = false;
        if (!j || !j.html || j.version === version || j.version === get('hp:engine-bad')) return;
        set('hp:engine', j);
        if ((get('hp:engine') || {}).version === j.version) location.replace('index.html' + location.search);  // only if it really was stored
      }).catch(() => { this.busy = false; });
    },
  };
})();
