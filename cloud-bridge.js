
(function(){
  const STORE_KEY = 'marlow.dashboard.v23';
  const WORKSPACE_ID = 'marlow-media-prod';
  const SUPABASE_URL = 'https://ttwpbmfvgfyjavejnelc.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0d3BibWZ2Z2Z5amF2ZWpuZWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MTYwMDYsImV4cCI6MjA3MjE5MjAwNn0.o84ycMmWUBkoZpNim2viy4IFjQ00Tb8zwRahNCoOERk';

  function log(){ try{ console.log.apply(console, ['[bridge]'].concat([].slice.call(arguments))); }catch(_){}};
  function warn(){ try{ console.warn.apply(console, ['[bridge]'].concat([].slice.call(arguments))); }catch(_){}};

  var supa = null;
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      log('supabase client ready');
    } else {
      warn('supabase-js not loaded');
    }
  } catch (e) { warn('supabase init failed', e); }

  async function loadRemote(){
    try {
      if (!supa) return null;
      const { data, error } = await supa.from('app_state').select('state').eq('id', WORKSPACE_ID).maybeSingle();
      if (error) { warn('load error', error); return null; }
      if (data && data.state) { log('loaded cloud'); return data.state; }
      log('no remote row');
      return null;
    } catch (e) { warn('load exception', e); return null; }
  }

  async function saveRemote(state){
    try {
      if (!supa) return;
      const payload = JSON.parse(JSON.stringify(state||{}));
      payload._updatedAt = Date.now();
      const { error } = await supa.from('app_state').upsert({ id: WORKSPACE_ID, state: payload, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) warn('save error', error); else log('saved cloud');
    } catch (e) { warn('save exception', e); }
  }

  // Boot: merge cloud -> local if newer, then trigger a render() if present
  (async function(){
    try {
      const remote = await loadRemote();
      if (remote) {
        let local = null;
        try { local = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch(_){}
        const lt = Number(local && local._updatedAt || 0);
        const rt = Number(remote._updatedAt || 0);
        if (rt > lt) {
          localStorage.setItem(STORE_KEY, JSON.stringify(remote));
          if (window.state) { window.state = Object.assign({}, window.state, remote); }
          log('boot merged remote -> local');
          try { if (typeof window.render === 'function') window.render(); } catch (_){}
        } else {
          log('local newer or equal; keeping local');
        }
      }
    } catch (e) { warn('boot merge failed', e); }
  })();

  // Wrap save() so every save also mirrors to cloud
  (function(){
    try {
      var orig = window.save;
      window.save = function(){
        try { if (typeof orig === 'function') orig.apply(this, arguments); } catch(e){ warn('orig save failed', e); }
        try {
          let st = window.state;
          if (!st) { try { st = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch(_){ st = null; } }
          if (st) saveRemote(st);
        } catch (e) { warn('post-save mirror failed', e); }
      };
      log('save wrapped');
    } catch (e) { warn('wrap save failed', e); }
  })();

  // Pre-hydrate right before login checks, without touching your UI.
  // If your code exposes hooks, you can call window.bridgePrehydrate() manually.
  window.bridgePrehydrate = loadRemote;
})();
