/*! cloud-merge-bridge.v2.js (server-time aware) — FIXED
   Responsibilities
   • Boot: fetch Supabase app_state[id]; if this tab has never seen a serverTs, ADOPT the cloud snapshot before first render.
   • Save: wrap your existing save(); after it completes, MERGE to cloud via RPC merge_app_state(id, state).
   • Poll: every 8–10s, if server updated_at changed, adopt to this tab.
   Non‑negotiables
   • No render→save loops (no render hooks).
   • Never merge with stale in‑memory state on adopt; replace it.
   • Keep global `state` and `window.state` in sync.
*/
(function () {
  // ---------- Config (safe defaults; can be overridden by window.*) ----------
  const STORE_KEY   = window.STORE_KEY   || 'marlow.dashboard.v23';
  const WORKSPACE_ID= window.WORKSPACE_ID|| 'marlow-media-prod';
  const SUPABASE_URL= window.SUPABASE_URL|| 'https://ttwpbmfvgfyjavejnelc.supabase.co';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

  const TS_KEY = `cloud.serverTs::${WORKSPACE_ID}`;   // sessionStorage key for last seen server updated_at

  function log(){ try{ console.log.apply(console, ['[cloud.v2]'].concat([].slice.call(arguments))); }catch(_){} }
  function warn(){ try{ console.warn.apply(console, ['[cloud.v2]'].concat([].slice.call(arguments))); }catch(_){} }

  // ---------- Ensure Supabase client ----------
  try {
    if (!window.supabase) { warn('supabase-js v2 missing (script tag)'); }
    if (!window.supa && window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
      window.supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      log('save merge enabled');
    }
  } catch (e) {
    warn('supabase init failed', e);
  }

  // ---------- Helpers ----------
  function getLastServerTime(){ try { return sessionStorage.getItem(TS_KEY) || ''; } catch(_){ return ''; } }
  function setLastServerTime(ts){ try { sessionStorage.setItem(TS_KEY, ts || ''); } catch(_){} }

  async function readCloudRow(){
    try {
      const { data, error } = await window.supa
        .from('app_state')
        .select('state,updated_at')
        .eq('id', WORKSPACE_ID)
        .maybeSingle();
      if (error) { warn('load error', error); return null; }
      return data || null; // { state, updated_at }
    } catch (e) {
      warn('load exception', e);
      return null;
    }
  }

  async function mergeToCloud(p_state){
    try {
      const payload = { p_id: WORKSPACE_ID, p_state: p_state || {} };
      const { error } = await window.supa.rpc('merge_app_state', payload);
      if (error) { warn('merge error', error); return false; }
      log('merged');
      return true;
    } catch (e) {
      warn('merge exception', e);
      return false;
    }
  }

  function deepClone(obj){
    try { return JSON.parse(JSON.stringify(obj || {})); } catch(_){ return {}; }
  }

  function adoptRemoteState(remote){
    if (!remote || !remote.state) return;
    // Persist full cloud snapshot
    try { localStorage.setItem(STORE_KEY, JSON.stringify(remote.state)); } catch(_){}
    // Replace in-memory state and keep both refs in sync
    try {
      const cloned = deepClone(remote.state);
      window.state = cloned;
      if (typeof state !== 'undefined') { state = window.state; } // keep module-scoped `state` in sync
    } catch(_) {}
    // Render the UI using the newly adopted state (no save here to avoid loops)
    try {
      if (typeof window.render === 'function') window.render();
      if (typeof window.renderClients === 'function') window.renderClients();
    } catch(e){ warn('render after adopt failed', e); }
  }

  // ---------- Boot: hydrate from cloud FIRST in new tabs / incognito ----------
  (async function bootstrap(){
    if (!window.supa) { warn('supabase client not ready at boot'); return; }
    const lastTs = getLastServerTime(); // empty in a brand‑new tab or Incognito
    const row = await readCloudRow();
    if (row && row.updated_at) {
      const serverTs = row.updated_at;
      // If this tab has never seen a serverTs OR local store is empty -> adopt
      let loc = null;
      try { loc = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch(_){}
      const needsFirstAdopt = !lastTs || !loc;
      if (needsFirstAdopt || serverTs !== lastTs) {
        adoptRemoteState(row);
        setLastServerTime(serverTs);
        log(needsFirstAdopt ? 'boot: adopted cloud (first load)' : 'boot: adopted cloud (serverTs changed)');
        return;
      }
      log('boot: no adoption needed');
    } else {
      warn('boot: no cloud row yet (ensure SQL seed ran)');
    }
  })();

  // ---------- Wrap save(): write local first, then MERGE to cloud ----------
  (function wrapSave(){
    const originalSave = window.save;
    window.save = async function(){
      try { if (typeof originalSave === 'function') originalSave(); } catch(e){ warn('original save failed', e); }
      // Take a fresh snapshot from memory (source of truth in the page)
      const snapshot = deepClone(window.state || {});
      try { localStorage.setItem(STORE_KEY, JSON.stringify(snapshot)); } catch(_){}
      // Merge to cloud
      await mergeToCloud(snapshot);
    };
  })();

  // ---------- Poll for remote changes (8s) ----------
  (function poller(){
    if (!window.supa) return;
    let busy = false;
    setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const row = await readCloudRow();
        if (row && row.updated_at) {
          const serverTs = row.updated_at;
          const lastTs = getLastServerTime();
          if (serverTs && serverTs !== lastTs) {
            adoptRemoteState(row);
            setLastServerTime(serverTs);
            log('poll: adopted newer cloud (serverTs changed)');
          }
        }
      } catch (_e) {}
      busy = false;
    }, 8000);
  })();
})();