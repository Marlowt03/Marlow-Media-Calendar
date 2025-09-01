/*! cloud-merge-bridge.v2.js  (robust adopt + extended normalization + blank-merge guard)
   - Boot: adopt from Supabase on first-load, when local is blank, or when serverTs changed (before first render).
   - Save: run original save(); mirror to cloud via RPC, but **skip destructive merges** if snapshot looks blank vs cloud.
   - Poll: adopt when serverTs changes.
   - Adoption: replace in-memory state, mirror to localStorage, sync `state` and `window.state`, render once.
*/
(function(){
  const STORE_KEY    = window.STORE_KEY    || 'marlow.dashboard.v23';
  const WORKSPACE_ID = window.WORKSPACE_ID || 'marlow-media-prod';
  const SUPABASE_URL = window.SUPABASE_URL || 'https://ttwpbmfvgfyjavejnelc.supabase.co';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
  const TS_KEY = `cloud.serverTs::${WORKSPACE_ID}`;

  function log(){ try{ console.log.apply(console, ['[cloud.v2]'].concat([].slice.call(arguments))); }catch(_){} }
  function warn(){ try{ console.warn.apply(console, ['[cloud.v2]'].concat([].slice.call(arguments))); }catch(_){} }

  // Supabase client
  (function init(){
    try{
      if (!window.supa && window.supabase && typeof window.supabase.createClient === 'function'){
        window.supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      }
      log('save merge enabled');
    }catch(e){ warn('supabase init failed', e); }
  })();

  // Helpers
  function deepClone(x){ try{ return JSON.parse(JSON.stringify(x||{})); }catch(_){ return {}; } }
  function getLastServerTime(){ try{ return sessionStorage.getItem(TS_KEY)||''; }catch(_){ return ''; } }
  function setLastServerTime(ts){ try{ sessionStorage.setItem(TS_KEY, ts||''); }catch(_){} }
  function countSummary(s){
    const u = s && s.users && typeof s.users==='object' ? Object.keys(s.users).length : 0;
    const c = s && s.clients && typeof s.clients==='object' ? Object.keys(s.clients).length : 0;
    const t = Array.isArray(s && s.tasks) ? s.tasks.length : 0;
    return {u,c,t};
  }
  function isBlank(s){ const {u,c,t} = countSummary(s||{}); return (u+c+t)===0; }

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

  // Normalize shapes; salvage from local; preserve currentUserId
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

    
    s.leads   = Array.isArray(s.leads) ? s.leads : (Array.isArray(local.leads) ? local.leads : []);
s.archives = (s.archives && typeof s.archives==='object') ? s.archives : (local.archives || {});
    s.payments = Array.isArray(s.payments) ? s.payments : (Array.isArray(local.payments) ? local.payments : []);
    if (!s.theme) s.theme = local.theme || 'dark';
    if (typeof s.currentTab !== 'string') s.currentTab = local.currentTab || 'Overview';

    // Pricing / Durations / Commission for Sales + Settings
    s.prices    = (s.prices && typeof s.prices==='object') ? s.prices : (local.prices || {});
    if (typeof s.prices.trial !== 'number' || isNaN(s.prices.trial)) s.prices.trial = 0;
    s.durations = (s.durations && typeof s.durations==='object') ? s.durations : (local.durations || {});
    if (typeof s.commissionPct !== 'number' || isNaN(s.commissionPct)) {
      s.commissionPct = (typeof local.commissionPct === 'number' && !isNaN(local.commissionPct)) ? local.commissionPct : 0;
    }

    // Users normalization (support both .days and .scheduleDays)
    const DAY_KEYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (const uid of Object.keys(s.users||{})){
      const u = s.users[uid] || {};
      let days = u.scheduleDays || u.days || {};
      if (!days || typeof days!=='object') days = {};
      DAY_KEYS.forEach(k => { if (typeof days[k] !== 'boolean') days[k] = (k!=='Sun' && k!=='Sat'); });
      u.scheduleDays = days;
      u.days = days; // alias
      if (!Array.isArray(u.skills) || u.skills.length===0) u.skills = ['script','film','edit','photo','ops','website'];
      if (typeof u.hoursPerDay !== 'number' || isNaN(u.hoursPerDay)) u.hoursPerDay = 8;
      if (typeof u.role !== 'string' || !u.role) u.role = 'employee';
      s.users[uid] = u;
    }

    // Clients normalization required by various views
    for (const cid of Object.keys(s.clients||{})){
      const c = s.clients[cid] || {};
      if (!c.addons || typeof c.addons!=='object') c.addons = { website:false, email:false, phone:false };
      if (!c.drafts || typeof c.drafts!=='object') c.drafts = { video:[], photo:[], carousel:[], website:[], email:[] };
      if (!c.sales  || typeof c.sales!=='object')  c.sales = {};
      if (typeof c.sales.trial !== 'boolean') c.sales.trial = false;
      if (!c.meetings || typeof c.meetings!=='object') c.meetings = {};
      if (!c.meetings.kickoff || typeof c.meetings.kickoff!=='object') c.meetings.kickoff = { scheduledAt:null, notes:'' };
      if (!c.dates || typeof c.dates!=='object') c.dates = {};
      if (typeof c.dates.kickoff === 'undefined') c.dates.kickoff = null;
      s.clients[cid] = c;
    }

    // Settings normalization (if UI references settings.kickoff)
    if (!s.settings || typeof s.settings!=='object') s.settings = local.settings || {};
    if (!s.settings.meetings || typeof s.settings.meetings!=='object') s.settings.meetings = {};
    if (!s.settings.meetings.kickoff || typeof s.settings.meetings.kickoff!=='object'){
      s.settings.meetings.kickoff = { duration: 60, defaultAssignee: null };
    }
    if (!s.settings.kickoff) s.settings.kickoff = s.settings.meetings.kickoff;

    // Preserve currentUserId (no auto-logout on adopt)
    if (s.currentUserId === undefined || s.currentUserId === null){
      s.currentUserId = (local && local.currentUserId) ? local.currentUserId : null;
    }

    return s;
  }

  // Adopt: replace memory + local, then render once
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

  // Boot: adopt when first-load OR local blank OR serverTs changed
  (async function bootstrap(){
    if (!window.supa){ warn('supabase client not ready at boot'); return; }
    function readLocal(){ try{ return JSON.parse(localStorage.getItem(STORE_KEY)||'null'); }catch(_){ return null; } }
    function isBlankLocal(loc){ return isBlank(loc); }

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

  // Save: run original then merge to cloud, skipping destructive blank merges
  (function wrapSave(){
    if (window.__cloudMergePatchedV2) return;
    window.__cloudMergePatchedV2 = true;

    const orig = window.save;
    window.save = async function(){
      try{ if (typeof orig==='function') orig.apply(this, arguments); }catch(e){ warn('original save failed', e); }

      const snap = deepClone(window.state||{});
      try{ localStorage.setItem(STORE_KEY, JSON.stringify(snap)); }catch(_){}

      try{
        if (!window.supa) return;
        const cloud = await readCloudRow();
        const cloudState = cloud && cloud.state ? cloud.state : {};
        const sumSnap = countSummary(snap);
        const sumCloud= countSummary(cloudState);

        const destructive = isBlank(snap) && !isBlank(cloudState);
        const regression = (sumSnap.u < sumCloud.u) || (sumSnap.c < sumCloud.c) || (sumSnap.t < sumCloud.t);

        if (!window.__allowDestructiveSave && (destructive || regression)){
          warn('skip merge: snapshot appears blank/regressive vs cloud', {snap:sumSnap, cloud:sumCloud});
          return;
        }

        await window.supa.rpc('merge_app_state', { p_id: WORKSPACE_ID, p_state: snap });
        const row = await readCloudRow();
        if (row && row.updated_at) setLastServerTime(row.updated_at);
        log('merged');
      }catch(e){ warn('merge failed', e); }
    };
  })();

  // Poll
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