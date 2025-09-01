
/*! cloud-client-watcher.js
    Persist when client map changes (add/remove) — safe, no render hooks
    Works with cloud-merge-bridge.v2 (save() → RPC merge) and hotfix v2.
*/
(function(){
  function log(){ try{ console.log.apply(console, ["[watch]"].concat([].slice.call(arguments))); }catch(_){ } }
  function warn(){ try{ console.warn.apply(console, ["[watch]"].concat([].slice.call(arguments))); }catch(_){ } }

  const SK = window.STORE_KEY || 'marlow.dashboard.v23';
  const WS = window.WORKSPACE_ID || 'marlow-media-prod';

  let lastSig = "";
  let busy = false;

  function signature(){
    try {
      const s = window.state || JSON.parse(localStorage.getItem(SK) || 'null') || {};
      const keys = Object.keys(s.clients || {}).sort();
      return keys.join("|") + "||" + (Array.isArray(s.tasks) ? s.tasks.length : 0);
    } catch(_){ return ""; }
  }

  async function persist(){
    if (busy) return;
    busy = true;
    try {
      try { if (window.state) window.state._updatedAt = Date.now(); } catch(_){}
      try { if (typeof window.save === 'function') await window.save(); } catch(e){ warn('save failed', e); }
      log('merged');
    } finally { busy = false; }
  }

  // poll for changes in clients/tasks signature
  setInterval(() => {
    const sig = signature();
    if (!sig) return;
    if (sig !== lastSig) {
      const prev = lastSig;
      lastSig = sig;
      if (prev) { // ignore the very first sample at load
        persist();
      }
    }
  }, 900);

  log('client watcher running');
})();
