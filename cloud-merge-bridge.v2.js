/*! cloud-merge-bridge.v2.js  (server-timestamp based)
   Responsibilities:
   - On boot: read Supabase row. If server updated_at != session's lastTs, adopt it, write to localStorage, set window.state, and render.
   - On save(): run your original save, then rpc('merge_app_state', { p_id, p_state }) to merge JSON.
   - Poll every ~8s: if server updated_at changed, adopt and render.
   - No UI hooks besides a single window.render() call.
*/
(function(){
  const STORE_KEY = window.STORE_KEY || 'marlow.dashboard.v23';
  const WORKSPACE_ID = window.WORKSPACE_ID || 'marlow-media-prod';
  const SUPABASE_URL = window.SUPABASE_URL || 'https://ttwpbmfvgfyjavejnelc.supabase.co';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

  function log(){ try{ console.log.apply(console, ['[cloud.v2]'].concat([].slice.call(arguments))); }catch(_){ } }
  function warn(){ try{ console.warn.apply(console, ['[cloud.v2]'].concat([].slice.call(arguments))); }catch(_){ } }

  // Ensure a Supabase client exists
  (function initSupa(){
    try {
      if (!window.supa) {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
          window.supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        } else {
          warn('supabase-js missing — include <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
        }
      }
    } catch(e){ warn('supabase init failed', e); }
  })();

  function safeClone(x){
    try { return JSON.parse(JSON.stringify(x)); } catch(_){ return null; }
  }

  // Fill in any missing structure the app assumes exists
  function normalizeState(s){
    if (!s || typeof s !== 'object') s = {};
    if (!s.users || typeof s.users !== 'object') s.users = {};
    if (!s.clients || typeof s.clients !== 'object') s.clients = {};
    if (!Array.isArray(s.tasks)) s.tasks = [];
    if (!s.archives || typeof s.archives !== 'object') s.archives = {};
    if (!Array.isArray(s.payments)) s.payments = [];
    if (!s.theme) s.theme = 'dark';
    if (typeof s.currentTab !== 'string') s.currentTab = 'Overview';
    if (s.currentUserId === undefined) s.currentUserId = null;

    // Ensure every employee has scheduleDays with all 7 keys
    const fullDays = {Sun:false,Mon:false,Tue:false,Wed:false,Thu:false,Fri:false,Sat:false};
    try {
      Object.values(s.users || {}).forEach(u => {
        if (!u || typeof u !== 'object') return;
        if (!u.scheduleDays || typeof u.scheduleDays !== 'object') u.scheduleDays = {};
        for (const k in fullDays) if (!(k in u.scheduleDays)) u.scheduleDays[k] = false;
        if (!u.role) u.role = 'employee';
        if (!('active' in u)) u.active = true;
      });
    } catch(_) {}

    // Ensure every client has drafts buckets (index.html expects these sometimes)
    try {
      Object.values(s.clients || {}).forEach(c => {
        if (!c || typeof c !== 'object') return;
        if (!c.addons || typeof c.addons !== 'object') c.addons = {website:false,email:false,phone:false};
        if (!c.drafts || typeof c.drafts !== 'object') {
          c.drafts = { video:[], photo:[], carousel:[], website:[], email:[] };
        }
      });
    } catch(_){}

    // Tasks must be array of objects
    if (!Array.isArray(s.tasks)) s.tasks = [];

    return s;
  }

  async function readCloudRow(){
    try {
      if (!window.supa) return null;
      const { data, error } = await window.supa
        .from('app_state')
        .select('state, updated_at')
        .eq('id', WORKSPACE_ID)
        .maybeSingle();
      if (error) { warn('load error', error); return null; }
      return data || null; // { state, updated_at }
    } catch(e){ warn('load exception', e); return null; }
  }

  function getLastServerTime(){
    try { return sessionStorage.getItem('lastServerUpdatedAt') || ''; } catch(_){ return ''; }
  }
  function setLastServerTime(ts){
    try { sessionStorage.setItem('lastServerUpdatedAt', ts || ''); } catch(_){}
  }

  // Replace in-memory + localStorage with the cloud snapshot, then render once
  function adoptRemoteState(row){
    if (!row || !row.state) return;
    const incoming = normalizeState(safeClone(row.state) || {});

    // Persist snapshot locally
    try { localStorage.setItem(STORE_KEY, JSON.stringify(incoming)); } catch(_){}

    // Replace the in-memory object and keep global `state` var in sync
    try {
      window.state = incoming;
      if (typeof state !== 'undefined') { state = window.state; }
    } catch(_){}

    // Single top-level render (NO renderClients hooks — avoids loops)
    try { if (typeof window.render === 'function') window.render(); }
    catch(e){ warn('render after adopt failed', e); }
  }

  // ----- Boot: adopt server snapshot if newer than what this tab last saw
  ;(async function bootstrap(){
    try {
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
    } catch(e){ warn('boot failed', e); }
  })();

  // ----- Save mirror: wrap existing save() then MERGE to cloud via RPC
  (function patchSave(){
    try {
      if (window.__cloudMergePatchedV2) return;
      window.__cloudMergePatchedV2 = true;

      const orig = window.save;
      window.save = function(){
        // first, user's original save (updates localStorage / UI)
        try { if (typeof orig === 'function') orig.apply(this, arguments); } catch(e){ warn('orig save failed', e); }

        // then, push a sanitized snapshot to the cloud
        try {
          let snap = window.state || null;
          if (!snap) {
            try { snap = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch(_) {}
          }
          if (!snap) return;
          snap = normalizeState(safeClone(snap) || {});
          snap._updatedAt = Date.now();

          if (!window.supa) return;
          window.supa.rpc('merge_app_state', { p_id: WORKSPACE_ID, p_state: snap })
            .then(async ({ error }) => {
              if (error) { warn('rpc error', error); return; }
              const row = await readCloudRow();
              if (row && row.updated_at) setLastServerTime(row.updated_at);
              log('merged');
            });
        } catch(e){ warn('save mirror failed', e); }
      };

      log('save merge enabled');
    } catch(e){ warn('patch failed', e); }
  })();

  // ----- Poll every ~8–10s: adopt when server updated_at changes
  ;(function poll(){
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
      } catch(_e) { /* ignore */ }
      busy = false;
    }, 8500);
  })();
})();
