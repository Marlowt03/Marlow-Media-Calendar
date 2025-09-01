/*! cloud-realtime.v1.js
   Instant cross-tab updates using Supabase Realtime.
   Requires Realtime enabled for table 'app_state' on your project.
*/
(function(){
  const STORE_KEY    = window.STORE_KEY    || 'marlow.dashboard.v23';
  const WORKSPACE_ID = window.WORKSPACE_ID || 'marlow-media-prod';
  const TS_KEY = `cloud.serverTs::${WORKSPACE_ID}`;
  const log  = (...a)=>{ try{ console.log('[realtime]', ...a); }catch(_){ } };
  const warn = (...a)=>{ try{ console.warn('[realtime]', ...a); }catch(_){ } };

  if (!window.supa || !window.supa.channel){ warn('supabase client not ready; realtime skipped'); return; }

  function deepClone(x){ try{ return JSON.parse(JSON.stringify(x||{})); }catch(_){ return {}; } }
  function normalizeState(src, fallbackLocal){
    const s = deepClone(src||{});
    const local = deepClone(fallbackLocal||{});
    s.users   = (s.users && typeof s.users==='object') ? s.users : (local.users || {});
    s.clients = (s.clients && typeof s.clients==='object') ? s.clients : (local.clients || {});
    s.tasks   = Array.isArray(s.tasks) ? s.tasks : (local.tasks || []);
    s.leads   = Array.isArray(s.leads) ? s.leads : (Array.isArray(local.leads)? local.leads : []);
    s.archives = (s.archives && typeof s.archives==='object') ? s.archives : (local.archives || {});
    s.payments = Array.isArray(s.payments) ? s.payments : (Array.isArray(local.payments) ? local.payments : []);
    if (!s.theme) s.theme = local.theme || 'dark';
    if (typeof s.currentTab !== 'string') s.currentTab = local.currentTab || 'Overview';
    s.prices    = (s.prices && typeof s.prices==='object') ? s.prices : (local.prices || {});
    if (typeof s.prices.trial !== 'number' || isNaN(s.prices.trial)) s.prices.trial = 0;
    s.durations = (s.durations && typeof s.durations==='object') ? s.durations : (local.durations || {});
    if (typeof s.commissionPct !== 'number' || isNaN(s.commissionPct)) s.commissionPct = (typeof local.commissionPct==='number'? local.commissionPct:0);

    const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (const uid of Object.keys(s.users||{})){
      const u = s.users[uid] || {};
      let d = u.scheduleDays || u.days || {};
      if (!d || typeof d!=='object') d = {};
      DAYS.forEach(k => { if (typeof d[k]!=='boolean') d[k]= (k!=='Sun' && k!=='Sat'); });
      u.scheduleDays = d; u.days = d;
      if (!Array.isArray(u.skills)) u.skills = [];
      if (typeof u.hoursPerDay!=='number' || isNaN(u.hoursPerDay)) u.hoursPerDay = 8;
      if (!u.id) u.id = uid;
      if (!u.role) u.role='employee';
      s.users[uid]=u;
    }
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
      s.clients[cid]=c;
    }
    if (!s.settings || typeof s.settings!=='object') s.settings = local.settings || {};
    if (!s.settings.meetings || typeof s.settings.meetings!=='object') s.settings.meetings = {};
    if (!s.settings.meetings.kickoff || typeof s.settings.meetings.kickoff!=='object'){
      s.settings.meetings.kickoff = { duration: 60, defaultAssignee: null };
    }
    if (!s.settings.kickoff) s.settings.kickoff = s.settings.meetings.kickoff;
    if (s.currentUserId===undefined || s.currentUserId===null) s.currentUserId = local.currentUserId || null;
    return s;
  }

  async function fetchAndAdopt(){
    try{
      const { data, error } = await window.supa.from('app_state').select('state,updated_at').eq('id', WORKSPACE_ID).maybeSingle();
      if (error){ warn('fetch failed', error); return; }
      const row = data || null;
      if (!row || !row.state) return;
      let local=null; try{ local = JSON.parse(localStorage.getItem(STORE_KEY)||'null'); }catch(_){}
      const incoming = normalizeState(row.state, local);
      try{ localStorage.setItem(STORE_KEY, JSON.stringify(incoming)); }catch(_){}
      try{ window.state = incoming; if (typeof state!=='undefined') state=window.state; }catch(_){}
      try{ if (typeof window.render === 'function') window.render(); }catch(_){}
      try{ if (row.updated_at) sessionStorage.setItem(TS_KEY, row.updated_at); }catch(_){}
      log('adopted via realtime');
    }catch(e){ warn('adopt exception', e); }
  }

  const channel = window.supa.channel('app_state_watch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state', filter: `id=eq.${WORKSPACE_ID}` },
      (payload) => {
        // Avoid thrash: adopt once shortly after we get a change
        setTimeout(fetchAndAdopt, 150);
      })
    .subscribe((status) => log('subscribed:', status));

})();