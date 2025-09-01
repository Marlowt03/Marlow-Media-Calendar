
/*! cloud-merge-bridge.js (safe, idempotent)
   - Boot: if cloud newer (or local empty), copy to localStorage and reload ONCE
   - Save: after your save(), RPC merge to server (prevents two-tab overwrites)
   - No UI changes; tiny console logs prefixed with [cloud]
*/
(function(){
  const STORE_KEY = 'marlow.dashboard.v23';
  const WORKSPACE_ID = window.WORKSPACE_ID || 'marlow-media-prod';
  const SUPABASE_URL = window.SUPABASE_URL || 'https://ttwpbmfvgfyjavejnelc.supabase.co';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0d3BibWZ2Z2Z5amF2ZWpuZWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MTYwMDYsImV4cCI6MjA3MjE5MjAwNn0.o84ycMmWUBkoZpNim2viy4IFjQ00Tb8zwRahNCoOERk';

  function log(){ try{ console.log.apply(console, ['[cloud]'].concat([].slice.call(arguments))); }catch(_){ } }
  function warn(){ try{ console.warn.apply(console, ['[cloud]'].concat([].slice.call(arguments))); }catch(_){ } }

  // Ensure supabase client (re-use if already set)
  try {
    if (!window.supa) {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        window.supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      } else {
        warn('supabase-js missing. Add <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> in <head>.');
      }
    }
  } catch (e) { warn('supabase init failed', e); }

  async function readCloud(){
    try {
      const { data, error } = await window.supa.from('app_state').select('state, updated_at').eq('id', WORKSPACE_ID).maybeSingle();
      if (error) { warn('load error', error); return null; }
      return data && data.state ? data.state : null;
    } catch (e) { warn('load exception', e); return null; }
  }

  // ----- BOOT HYDRATION (single reload guard) -----
  (async function(){
    try {
      if (!window.supa) return;
      const hydrated = sessionStorage.getItem('cloudBootHydrated') === '1';
      let local = null;
      try { local = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch(_){}
      const remote = await readCloud();

      if (!remote) { log('boot: no cloud row'); return; }

      const lt = Number((local && local._updatedAt) || 0);
      const rt = Number((remote && remote._updatedAt) || 0);
      const localMissing = !local || !local.users || !Object.keys(local.users||{}).length || !Array.isArray(local.tasks);

      if ((localMissing || rt > lt) && !hydrated) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(remote)); } catch(_){}
        // Mark so we only reload once
        try { sessionStorage.setItem('cloudBootHydrated', '1'); } catch(_){}
        log('boot: adopting cloud then reload once');
        location.reload();
        return;
      }
      log('boot: no adoption needed');
    } catch (e) { warn('boot failed', e); }
  })();

  // ----- SAVE MIRROR: wrap existing save() and call RPC merge on server -----
  (function(){
    try {
      if (window.__cloudMergePatched) return;
      window.__cloudMergePatched = true;

      const orig = window.save;
      window.save = function(){
        // 1) Your original save (updates localStorage/state)
        try { if (typeof orig === 'function') orig.apply(this, arguments); } catch(e){ warn('orig save failed', e); }
        // 2) Now read the latest snapshot and send to server for MERGE
        try {
          let snap = window.state;
          if (!snap) { try { snap = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch(_){ snap = null; } }
          if (!snap) return;
          snap = JSON.parse(JSON.stringify(snap));
          snap._updatedAt = Date.now();
          window.supa.rpc('merge_app_state', { p_id: WORKSPACE_ID, p_state: snap })
            .then(({ error }) => { if (error) warn('rpc error', error); else log('merged'); });
        } catch (e) { warn('save mirror failed', e); }
      };
      log('save merge enabled');
    } catch (e) { warn('patch failed', e); }
  })();

  // Optional: tiny poll to keep tabs fresh without reloads (every 10s)
  (function(){
    let busy = false;
    setInterval(async () => {
      if (busy || !window.supa) return;
      busy = true;
      try {
        const remote = await readCloud();
        if (!remote) { busy = false; return; }
        let local = null;
        try { local = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch(_){}
        const lt = Number((local && local._updatedAt) || 0);
        const rt = Number((remote && remote._updatedAt) || 0);
        if (rt > lt) {
          try { localStorage.setItem(STORE_KEY, JSON.stringify(remote)); } catch(_){}
          if (window.state) window.state = Object.assign({}, window.state, remote);
          try { if (typeof window.render === 'function') window.render(); } catch(_){}
          log('poll: pulled newer cloud');
        }
      } catch (_e) {}
      busy = false;
    }, 10000);
  })();

})();
