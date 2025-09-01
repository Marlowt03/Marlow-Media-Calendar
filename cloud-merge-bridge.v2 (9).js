/*! cloud-merge-bridge.v2.js  (server-timestamp based; robust first-load adoption + extended normalization)
   Responsibilities
   • Boot: adopt on first-load, when local is blank, or when serverTs changed — before render.
   • Save: run original save(), then rpc merge to Supabase.
   • Poll: adopt on serverTs change.
   Guarantees
   • Replace in-memory state on adopt; mirror to localStorage; keep `state` and `window.state` in sync.
   • Normalize users/clients/settings so renderers and schedulers don't crash.
*/
(function(){
  // ---------- Config ----------
  const STORE_KEY    = window.STORE_KEY    || 'marlow.dashboard.v23';
  const WORKSPACE_ID = window.WORKSPACE_ID || 'marlow-media-prod';
  const SUPABASE_URL = window.SUPABASE_URL || 'https://ttwpbmfvgfyjavejnelc.supabase.co';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
  const TS_KEY = `cloud.serverTs::${WORKSPACE_ID}`;

  function log(){ try{ console.log.apply(console, ['[cloud.v2]'].concat([].slice.call(arguments))); }catch(_){} }
  function warn(){ try{ console.warn.apply(console, ['[cloud.v2]'].concat([].slice.call(arguments))); }catch(_){} }

  // ---------- Supabase client ----------
  (function init(){
    try{
      if (!window.supa && window.supabase && typeof window.supabase.createClient === 'function'){
        window.supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      }
      log('save merge enabled');
    }catch(e){ warn('supabase init failed', e); }
  })();

  // ---------- Helpers ----------
  function deepClone(x){ try{ return JSON.parse(JSON.stringify(x||{})); }catch(_){ return {}; } }
  function getLastServerTime(){ try{ return sessionStorage.getItem(TS_KEY)||''; }catch(_){ return ''; } }
  function setLastServerTime(ts){ try{ sessionStorage.setItem(TS_KEY, ts||''); }catch(_){} }

  async function readCloudRow(){
    try{
      if (!window.supa) return null;
      const { data, error } = await window.supa
        .from('app_state')
        .select('state,updated_at')
        .eq('id', WORKSPACE_ID)
        .maybeSingle();
      if (error){ warn('load error', error); return null; }
      return data || null; // { state, updated_at }
    }catch(e){ warn('load exception', e); return null; }
  }

  // Ensure required shapes exist; salvage from local when possible; preserve currentUserId
  function normalizeState(src, fallbackLocal){
    const s = deepClone(src||{});
    const local = deepClone(fallbackLocal||{});

    // Top-level containers
    s.users   = (s.users && typeof s.users==='object') ? s.users
             : (local.users && typeof local.users==='object') ? local.users : {};
    s.clients = (s.clients && typeof s.clients==='object') ? s.clients
             : (local.clients && typeof local.clients==='object') ? local.clients : {};
    s.tasks   = Array.isArray(s.tasks) ? s.tasks
             : Array.isArray(local.tasks) ? local.tasks : [];

    s.archives = (s.archives && typeof s.archives==='object') ? s.archives : (local.archives || {});
    s.payments = Array.isArray(s.payments) ? s.payments : (Array.isArray(local.payments) ? local.payments : []);
    if (!s.theme) s.theme = local.theme || 'dark';
    if (typeof s.currentTab !== 'string') s.currentTab = local.currentTab || 'Overview';

    // ---------- Users normalization ----------
    const DAY_KEYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (const uid of Object.keys(s.users||{})){
      const u = s.users[uid] || {};
      // Old code might use u.days; newer uses u.scheduleDays — support both
      let days = u.scheduleDays || u.days || {};
      if (!days || typeof days!=='object') days = {};
      DAY_KEYS.forEach(k => { if (typeof days[k] !== 'boolean') days[k] = (k!=='Sun' && k!=='Sat'); }); // default Mon‑Fri true
      u.scheduleDays = days;
      u.days = days; // alias so any renderer referencing u.days works
      if (!Array.isArray(u.skills)) u.skills = [];
      if (typeof u.hoursPerDay !== 'number' || isNaN(u.hoursPerDay)) u.hoursPerDay = 8;
      if (typeof u.role !== 'string' || !u.role) u.role = 'employee';
      s.users[uid] = u;
    }

    // ---------- Clients normalization ----------
    for (const cid of Object.keys(s.clients||{})){
      const c = s.clients[cid] || {};
      if (!c.addons || typeof c.addons!=='object') c.addons = { website:false, email:false, phone:false };
      if (!c.drafts || typeof c.drafts!=='object') c.drafts = { video:[], photo:[], carousel:[], website:[], email:[] };

      // sales/trial (renderSales uses c.sales.trial)
      if (!c.sales || typeof c.sales!=='object') c.sales = {};
      if (typeof c.sales.trial !== 'boolean') c.sales.trial = false;

      // kickoff date or meeting bucket used by settings
      if (!c.meetings || typeof c.meetings!=='object') c.meetings = {};
      if (!c.meetings.kickoff || typeof c.meetings.kickoff!=='object') c.meetings.kickoff = { scheduledAt: null, notes:'' };

      // sometimes dates.kickoff is used instead
      if (!c.dates || typeof c.dates!=='object') c.dates = {};
      if (typeof c.dates.kickoff === 'undefined') c.dates.kickoff = null;

      s.clients[cid] = c;
    }

    // ---------- Settings normalization (if UI references settings.kickoff) ----------
    if (!s.settings || typeof s.settings!=='object') s.settings = local.settings || {};
    if (!s.settings.meetings || typeof s.settings.meetings!=='object') s.settings.meetings = {};
    if (!s.settings.meetings.kickoff || typeof s.settings.meetings.kickoff!=='object'){
      s.settings.meetings.kickoff = { duration: 60, defaultAssignee: null };
    }
    // provide top-level alias too if code reads settings.kickoff
    if (!s.settings.kickoff) s.settings.kickoff = s.settings.meetings.kickoff;

    // Preserve current user if present; else fall back to local; else null
    if (s.currentUserId === undefined || s.currentUserId === null){
      s.currentUserId = (local && local.currentUserId) ? local.currentUserId : null;
    }

    return s;
  }

  // Replace in-memory + localStorage with cloud snapshot, render once
  function adoptRemoteState(row){
    if (!row || !row.state) return;
    let local=null; try{ local = JSON.parse(localStorage.getItem(STORE_KEY)||'null'); }catch(_){}
    const incoming = normalizeState(row.state, local);

    try{ localStorage.setItem(STORE_KEY, JSON.stringify(incoming)); }catch(_){}
    try{
      window.state = incoming;
      if (typeof state !== 'undefined'){ state = window.state; }
    }catch(_){}

    try{ if (typeof window.render === 'function') window.render(); }
    catch(e){ warn('render after adopt failed', e); }
  }

  // ---------- Boot: adopt when first-load OR local blank OR serverTs changed ----------
  (async function bootstrap(){
    if (!window.supa){ warn('supabase client not ready at boot'); return; }

    function readLocal(){ try{ return JSON.parse(localStorage.getItem(STORE_KEY)||'null'); }catch(_){ return null; } }
    function isBlankLocal(loc){
      if (!loc || typeof loc!=='object') return true;
      const u = loc.users && typeof loc.users==='object' ? Object.keys(loc.users).length : 0;
      const c = loc.clients && typeof loc.clients==='object' ? Object.keys(loc.clients).length : 0;
      const t = Array.isArray(loc.tasks) ? loc.tasks.length : 0;
      return (u + c + t) === 0;
    }

    const row = await readCloudRow();
    if (!row || !row.state){ log('boot: no cloud row'); return; }

    const serverTs = row.updated_at || '';
    const lastTs   = getLastServerTime();
    const local    = readLocal();

    const mustAdopt = (!lastTs) || isBlankLocal(local) || (serverTs && serverTs !== lastTs);
    if (mustAdopt){
      adoptRemoteState(row);
      setLastServerTime(serverTs);
      log(!lastTs ? 'boot: adopted cloud (first load)'
                  : isBlankLocal(local) ? 'boot: adopted cloud (local blank)'
                                        : 'boot: adopted cloud (serverTs changed)');
    }else{
      log('boot: no adoption needed');
    }
  })();

  // ---------- Wrap save(): run original, mirror to cloud via RPC ----------
  (function wrapSave(){
    if (window.__cloudMergePatchedV2) return;
    window.__cloudMergePatchedV2 = true;

    const orig = window.save;
    window.save = async function(){
      try{ if (typeof orig==='function') orig.apply(this, arguments); }catch(e){ warn('original save failed', e); }
      const snap = deepClone(window.state||{});
      try{ localStorage.setItem(STORE_KEY, JSON.stringify(snap)); }catch(_){}
      try{
        if (window.supa){
          await window.supa.rpc('merge_app_state', { p_id: WORKSPACE_ID, p_state: snap });
          const row = await readCloudRow();
          if (row && row.updated_at) setLastServerTime(row.updated_at);
          log('merged');
        }
      }catch(e){ warn('merge failed', e); }
    };
  })();

  // ---------- Poll for remote changes ----------
  ;(function poll(){
    if (!window.supa) return;
    let busy=false;
    setInterval(async () => {
      if (busy) return;
      busy=true;
      try{
        const row = await readCloudRow();
        if (row && row.updated_at){
          const serverTs = row.updated_at;
          const lastTs = getLastServerTime();
          if (serverTs && serverTs !== lastTs){
            adoptRemoteState(row);
            setLastServerTime(serverTs);
            log('poll: adopted newer cloud (serverTs changed)');
          }
        }
      }catch(_){}
      busy=false;
    }, 8500);
  })();
})();