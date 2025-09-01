/*! cloud-merge-bridge.v2.js (compat fix)
   - Works if `window.supabase` is a namespace (has createClient) OR already a client (has from/rpc).
   - Cloud-first boot; merge vs replace (for deletes); 3s polling; forceAdopt().
*/
(function(){

  function ensureShape(s){
    s = s || {};
    if (!s.users || typeof s.users !== 'object') s.users = {};
    if (!s.clients || typeof s.clients !== 'object') s.clients = {};
    if (!Array.isArray(s.tasks)) s.tasks = [];
    return s;
  }

  const LOG = (...a)=>{ try{ console.log('[cloud.v2]', ...a);}catch(_){ } };
  const WARN = (...a)=>{ try{ console.warn('[cloud.v2]', ...a);}catch(_){ } };

  const SUPA_URL  = window.SUPABASE_URL;
  const SUPA_KEY  = window.SUPABASE_ANON_KEY;
  const WS        = window.WORKSPACE_ID || 'marlow-media-prod';
  const SK        = window.STORE_KEY || 'marlow.dashboard.v23';
  const SEEN_KEY  = 'cloud.lastServerTs';

  const supaNS = window.supabase || null;
  if (!supaNS){ WARN('Supabase script missing'); return; }

  // Accept both: namespace (createClient) or client (from/rpc)
  let client = window.supaClient || null;
  if (!client){
    if (typeof supaNS.createClient === 'function'){
      client = supaNS.createClient(SUPA_URL, SUPA_KEY);
    } else if (typeof supaNS.from === 'function'){
      client = supaNS; // already-initialized client
    } else {
      WARN('Supabase global found but neither createClient nor from available');
      return;
    }
    try{ window.supaClient = client; }catch(_){}
  }

  function deepClone(x){ return JSON.parse(JSON.stringify(x||null)); }
  function stripEphemerals(snap){
    try{ delete snap.currentUserId; }catch(_){}
    try{ delete snap.todayOverride; }catch(_){}
    return snap;
  }

  async function fetchCloud(){
    const { data, error } = await client.from('app_state').select('state,updated_at').eq('id', WS).maybeSingle();
    if (error){ WARN('fetch error', error); return {state:{}, updated_at:null}; }
    return { state: data?.state || {}, updated_at: data?.updated_at || null };
  }

  function adoptRemote(remote, reason){
    if (!remote || !remote.state) return false;
    try { localStorage.setItem(SK, JSON.stringify(remote.state)); } catch(_){}
    try {
      window.state = ensureShape(deepClone(remote.state));
      if (typeof window.render === 'function'){
        try { window.render(); } catch(e){ WARN('render after adopt failed', e); }
      }
    } catch(e){ WARN('adopt failed', e); return false; }
    try { sessionStorage.setItem(SEEN_KEY, remote.updated_at || ''); } catch(_){}
    LOG(reason||'adopted');
    return true;
  }

  function sigTask(t){
    try{
      return {
        id: (t && (t.id||t._id||t.uid||t.taskId)) || null,
        owner: t && (t.owner||t.assignee||t.employeeId||t.userId) || null,
        date: t && (t.date||t.day||t.scheduledFor||t.when) || null,
        client: t && (t.clientId||t.client||null),
        title: t && (t.title||t.name||t.type||null),
        mins: Number(t && (t.minutes||t.duration||t.mins||0))||0
      };
    }catch(_){ return {id:null,owner:null,date:null,client:null,title:null,mins:0}; }
  }
  function snapshotSig(s){
    s = s || {};
    const u = s.users && typeof s.users==='object' ? Object.keys(s.users).sort() : [];
    const c = s.clients && typeof s.clients==='object' ? Object.keys(s.clients).sort() : [];
    const t = Array.isArray(s.tasks) ? s.tasks.map(sigTask) : [];
    return JSON.stringify({u,c,tLen:t.length,t});
  }
  async function waitForStable(maxMs=1200, step=120){
    const t0 = Date.now();
    let prev = snapshotSig(window.state||{});
    while (Date.now()-t0 < maxMs){
      await new Promise(r=>setTimeout(r, step));
      const cur = snapshotSig(window.state||{});
      if (cur === prev) return true;
      prev = cur;
    }
    return false;
  }
  function tasksValid(arr){
    if (!Array.isArray(arr)) return false;
    for (const t of arr){
      if (!t || typeof t!=='object') return false;
      const date = t.date||t.day||t.scheduledFor||t.when;
      const title = (t.title||t.name||t.type||'').toString();
      if (!date || title==='undefined') return false;
    }
    return true;
  }

  async function persistCloud(mode, snap){
    let error=null;
    if (mode==='replace'){
      try{
        const { error: e1 } = await client.rpc('replace_app_state', { p_id: WS, p_state: snap });
        if (e1) throw e1;
        return;
      }catch(e){
        try{
          const { error: e2 } = await client.from('app_state').upsert({ id: WS, state: snap, updated_at: new Date().toISOString() });
          if (e2) throw e2;
          return;
        }catch(e3){ error=e3; }
      }
    } else {
      try{
        const { error: e } = await client.rpc('merge_app_state', { p_id: WS, p_state: snap });
        if (e) throw e;
        return;
      }catch(e4){ error=e4; }
    }
    if (error) throw error;
  }

  let flushing = false;
  async function flush(){
    if (flushing) return;
    flushing = true;
    try{
      await waitForStable(1400,140);
      const snap = ensureShape(deepClone(window.state||{}));
      if (!tasksValid(snap.tasks)){ WARN('skip merge: tasks invalid/undefined'); return; }

      // Decide persist mode BEFORE writing local
      let mode = (window.__allowDestructiveSave===true) ? 'replace' : 'merge';
      try{
        const prevLocal = JSON.parse(localStorage.getItem(SK) || 'null') || {};
        if (prevLocal && prevLocal.clients && snap && snap.clients){
          const a = Object.keys(prevLocal.clients||{}).length;
          const b = Object.keys(snap.clients||{}).length;
          if (b < a) mode = 'replace';
        }
      }catch(_){}

      stripEphemerals(snap);

      // Persist then mirror locally
      try{
        await persistCloud(mode, snap);
        LOG(`merged${mode==='replace'?' (replace)':''}`);
      }catch(e){ WARN('persist failed', e); return; }
      try{ localStorage.setItem(SK, JSON.stringify(snap)); }catch(_){}
    } finally {
      flushing = false;
      try{ window.__allowDestructiveSave = false; }catch(_){}
    }
  }

  // Wrap or define save()
  if (typeof window.save === 'function'){
    const orig = window.save;
    if (!orig.__cloudWrapped){
      window.save = async function(){ const r = await orig.apply(this, arguments); try{ await flush(); }catch(_){ } return r; };
      window.save.__cloudWrapped = true;
      LOG('save merge enabled');
    }
  } else {
    window.save = async function(){ await flush(); };
    window.save.__cloudWrapped = true;
    LOG('save merge enabled');
  }

  // Manual pull
  window.forceAdopt = async function(){
    const remote = await fetchCloud();
    if (remote && remote.state){
      try{ sessionStorage.setItem(SEEN_KEY, remote.updated_at || ''); }catch(_){}
      adoptRemote(remote, 'adopted cloud (force)');
    }
  };

  // Boot: cloud-first
  (async function bootstrap(){
    const remote = await fetchCloud();
    if (remote && remote.state){
      try{ sessionStorage.setItem(SEEN_KEY, remote.updated_at || ''); }catch(_){}
      adoptRemote(remote, 'boot: adopted cloud (fresh)');
    } else {
      WARN('boot: cloud fetch failed; using localStorage fallback');
      try{
        const loc = JSON.parse(localStorage.getItem(SK) || 'null');
        if (loc){ window.state = deepClone(loc); if (typeof render === 'function') render(); LOG('boot: adopted local'); }
      }catch(_){}
    }
  })();

  // Poll 3s
  setInterval(async () => {
    try{
      const { data, error } = await client.from('app_state').select('updated_at').eq('id', WS).maybeSingle();
      if (error) return;
      const serverTs = data?.updated_at || null;
      const seen = sessionStorage.getItem(SEEN_KEY) || '';
      if (serverTs && serverTs !== seen){
        const full = await fetchCloud();
        try{ sessionStorage.setItem(SEEN_KEY, serverTs); }catch(_){}
        adoptRemote(full, 'poll: adopted newer cloud (serverTs changed)');
      }
    }catch(_){}
  }, 3000);
})();