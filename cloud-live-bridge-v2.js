
/*! cloud-live-bridge-v2.js
    Robust cloud sync for a localStorage app.
    - Boot: hydrate from Supabase first if newer or local empty
    - Save: merge local+remote; never overwrite with older/empty data
    - Poll: keep tabs in sync (incognito/new devices update automatically)
*/
(() => {
  const STORE_KEY = "marlow.dashboard.v23";
  const WORKSPACE_ID = "marlow-media-prod";
  const SUPABASE_URL = "https://ttwpbmfvgfyjavejnelc.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0d3BibWZ2Z2Z5amF2ZWpuZWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MTYwMDYsImV4cCI6MjA3MjE5MjAwNn0.o84ycMmWUBkoZpNim2viy4IFjQ00Tb8zwRahNCoOERk";

  function log(){ try{ console.log.apply(console, ["[cloud]"].concat([].slice.call(arguments))); }catch(_){ } }
  function warn(){ try{ console.warn.apply(console, ["[cloud]"].concat([].slice.call(arguments))); }catch(_){ } }

  // Ensure Supabase client
  let supa = null;
  try {
    if (window.supabase && typeof window.supabase.createClient === "function") {
      supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.supa = supa; // exposed for debugging
    } else {
      warn("supabase-js not loaded. Add <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'></script> in <head>.");
    }
  } catch (e) { warn("supabase init failed", e); }

  // Helpers
  function now(){ return Date.now(); }
  function clone(x){ return JSON.parse(JSON.stringify(x || null)); }
  function isObj(x){ return x && typeof x === "object"; }
  function hasCoreData(s){ return isObj(s) && isObj(s.users) && Object.keys(s.users).length > 0 && Array.isArray(s.tasks); }
  function toMapById(list){ const m = {}; (list||[]).forEach(it => { if (it && it.id) m[it.id] = it; }); return m; }
  function toListFromMap(map){ return Object.values(map || {}); }

  // Merge: prefer "superset" semantics to avoid accidental wipes
  function mergeStates(remote, local){
    const r = clone(remote) || {};
    const l = clone(local) || {};
    const out = { ...r, ...l }; // local wins on primitives

    // Users/Clients: shallow map-union by id
    out.users = { ...(r.users||{}), ...(l.users||{}) };
    out.clients = { ...(r.clients||{}), ...(l.clients||{}) };

    // Tasks: union by id, local task props override remote same-id
    const rt = toMapById(r.tasks);
    const lt = toMapById(l.tasks);
    out.tasks = toListFromMap({ ...rt, ...lt });

    // Carry timestamps: choose the newest
    const rtTs = Number(r._updatedAt || 0);
    const ltTs = Number(l._updatedAt || 0);
    out._updatedAt = Math.max(rtTs, ltTs, now());

    return out;
  }

  async function loadRemote(){
    if (!supa) return null;
    try {
      const { data, error } = await supa.from("app_state").select("state, updated_at").eq("id", WORKSPACE_ID).maybeSingle();
      if (error) { warn("load error", error); return null; }
      if (data && data.state) { log("loaded", { updated_at: data.updated_at }); return data.state; }
      log("no cloud row"); return null;
    } catch (e) { warn("load exception", e); return null; }
  }

  async function saveMerged(localSnap){
    if (!supa) return;
    try {
      const remote = await loadRemote();
      let merged;
      if (!remote) {
        // First write: only if local has core data
        if (!hasCoreData(localSnap)) { warn("save skipped: local missing core data"); return; }
        merged = clone(localSnap);
        merged._updatedAt = now();
      } else {
        // If local is missing core data or older timestamp, merge instead of overwrite
        const lt = Number(localSnap && localSnap._updatedAt || 0);
        const rt = Number(remote && remote._updatedAt || 0);
        merged = mergeStates(remote, localSnap);
        if (lt < rt) log("merged older local into newer remote");
      }
      const { error } = await supa.from("app_state").upsert(
        { id: WORKSPACE_ID, state: merged, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
      if (error) warn("save error", error); else log("saved");
    } catch (e) { warn("save exception", e); }
  }

  // Boot: hydrate from cloud if local is empty/older
  (async function bootHydrate(){
    try {
      let local = null;
      try { local = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch(_){}
      const remote = await loadRemote();
      if (!remote) { log("boot: no remote"); return; }

      const lt = Number((local && local._updatedAt) || 0);
      const rt = Number(remote._updatedAt || 0);
      const needs = !hasCoreData(local);

      if (needs || rt > lt) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(remote)); } catch(_){}
        if (window.state) window.state = Object.assign({}, window.state, remote);
        try { if (typeof window.render === "function") window.render(); } catch(_){}
        log("boot: hydrated from cloud");
      } else {
        log("boot: kept local (newer or equal)");
      }
    } catch (e) { warn("boot failed", e); }
  })();

  // Poller: keep tabs in sync every 8s (lightweight)
  (function startPoller(){
    let busy = false;
    setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        let local = null;
        try { local = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch(_){}
        const remote = await loadRemote();
        const lt = Number((local && local._updatedAt) || 0);
        const rt = Number((remote && remote._updatedAt) || 0);
        if (remote && (rt > lt)) {
          try { localStorage.setItem(STORE_KEY, JSON.stringify(remote)); } catch(_){}
          if (window.state) window.state = Object.assign({}, window.state, remote);
          try { if (typeof window.render === "function") window.render(); } catch(_){}
          log("poll: pulled newer cloud");
        }
      } catch (e) { /* ignore */ }
      busy = false;
    }, 8000);
  })();

  // Wrap save(): run original save then saveMerged(local)
  (function patchSaveOnce(){
    try {
      if (window.__cloudPatchedSaveV2) return; // idempotent
      window.__cloudPatchedSaveV2 = true;
      const orig = window.save;
      window.save = function(){
        let snap = null;
        // 1) Run original save to update localStorage/window.state
        try { if (typeof orig === "function") orig.apply(this, arguments); } catch(e){ warn("orig save failed", e); }
        // 2) Read the latest local snapshot
        try { snap = clone(window.state) || JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch(_){}
        // 3) Push a merged copy to cloud
        if (snap) saveMerged(snap);
      };
      log("save merge/mirror enabled");
    } catch (e) { warn("patch save failed", e); }
  })();

  // Optional hook for login flows
  window.bridgePrehydrate = loadRemote;
})();
