
/*! cloud-merge-bridge.v2.js (server-time aware)
   - Boot & poll adopt based on Supabase row.updated_at (server time), not local state._updatedAt
   - After adopting remote, calls renderClients() (and render() if present)
   - Save: wraps your save() then MERGE to server via RPC
*/
(function(){
  const STORE_KEY = 'marlow.dashboard.v23';
  const WORKSPACE_ID = window.WORKSPACE_ID || 'marlow-media-prod';
  const SUPABASE_URL = window.SUPABASE_URL || 'https://ttwpbmfvgfyjavejnelc.supabase.co';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0d3BibWZ2Z2Z5amF2ZWpuZWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MTYwMDYsImV4cCI6MjA3MjE5MjAwNn0.o84ycMmWUBkoZpNim2viy4IFjQ00Tb8zwRahNCoOERk';

  function log(){ try{ console.log.apply(console, ['[cloud.v2]'].concat([].slice.call(arguments))); }catch(_){ } }
  function warn(){ try{ console.warn.apply(console, ['[cloud.v2]'].concat([].slice.call(arguments))); }catch(_){ } }

  // Ensure supabase client
  try {
    if (!window.supa) {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        window.supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      } else {
        warn('supabase-js missing. Add <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> in <head>.');
      }
    }
  } catch (e) { warn('supabase init failed', e); }

  async function replaceCloud(snap){
    try{
      if (window.supa){
        // Try the RPC if present
        try{
          const { error: rpcErr } = await window.supa.rpc('replace_app_state', { p_id: WORKSPACE_ID, p_state: snap });
          if (!rpcErr) return true;
        }catch(_){}
        // Fallback: full replace via upsert
        const payload = { id: WORKSPACE_ID, state: snap, updated_at: new Date().toISOString() };
        const { error } = await window.supa.from('app_state').upsert(payload).select().single();
        if (error){ warn('upsert replace failed', error); return false; }
        return true
      }
    }catch(e){ warn('replaceCloud exception', e); }
    return false;
  }

async function readCloudRow(){
    try {
      const { data, error } = await window.supa.from('app_state').select('state, updated_at').eq('id', WORKSPACE_ID).maybeSingle();
      if (error) { warn('load error', error); return null; }
      return data || null; // { state, updated_at }
    } catch (e) { warn('load exception', e); return null; }
  }

  function adoptRemoteState(remote){
    if (!remote || !remote.state) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(remote.state)); } catch(_){}
    if (window.state) window.state = Object.assign({}, window.state, remote.state);
    try { if (typeof window.renderClients === 'function') window.renderClients(); } catch(_){}
    try { if (typeof window.render === 'function') window.render(); } catch(_){}
  }

  function getLastServerTime(){
    try { return sessionStorage.getItem('lastServerUpdatedAt') || ''; } catch(_){ return ''; }
  }
  function setLastServerTime(ts){
    try { sessionStorage.setItem('lastServerUpdatedAt', ts || ''); } catch(_){}
  }

  // ----- BOOT HYDRATION (server-time aware) -----
  (async function(){
    try {
      if (!window.supa) return;
      const row = await readCloudRow();
      if (!row || !row.state) { log('boot: no cloud row'); return; }
      const serverTs = row.updated_at || '';
      const lastTs = getLastServerTime();
      if (serverTs && serverTs !== lastTs) {
        adoptRemoteState(row);
        setLastServerTime(serverTs);
        log('boot: adopted cloud (serverTs changed)');
      } else {
        log('boot: no adoption needed');
      }
    } catch (e) { warn('boot failed', e); }
  })();

  // ----- SAVE MIRROR: wrap existing save() and call RPC merge on server -----
  (function(){
    try {
      if (window.__cloudMergePatchedV2) return;
      window.__cloudMergePatchedV2 = true;

      const orig = window.save;
      window.save = function(){
        // 1) Your original save (updates localStorage/state)
        try { if (typeof orig === 'function') orig.apply(this, arguments); } catch(e){ warn('orig save failed', e); }
        // 2) Now MERGE to server
        try {
          let snap = window.state;
          if (!snap) { try { snap = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch(_){ snap = null; } }
          if (!snap) return;
          snap = JSON.parse(JSON.stringify(snap));
          snap._updatedAt = Date.now();
          window.supa.rpc('merge_app_state', { p_id: WORKSPACE_ID, p_state: snap })
            .then(async ({ error }) => {
              if (error) { warn('rpc error', error); return; }
              // Read back server row to get server updated_at and adopt in all tabs
              const row = await readCloudRow();
              if (row && row.updated_at) setLastServerTime(row.updated_at);
              log('merged'); try{ window.__allowDestructiveSave = false; }catch(_){}
            });
        } catch (e) { warn('save mirror failed', e); }
      };
      log('save merge enabled');
    } catch (e) { warn('patch failed', e); }
  })();

  // ----- POLL: adopt when server updated_at changes (every 8s) -----
  (function(){
    let busy = false;
    setInterval(async () => {
      if (busy || !window.supa) return;
      busy = true;
      try {
        const row = await readCloudRow();
        if (!row || !row.state) { busy = false; return; }
        const serverTs = row.updated_at || '';
        const lastTs = getLastServerTime();
        if (serverTs && serverTs !== lastTs) {
          adoptRemoteState(row);
          setLastServerTime(serverTs);
          log('poll: adopted newer cloud (serverTs changed)');
        }
      } catch (_e) {}
      busy = false;
    }, 8000);
  })();

})();
