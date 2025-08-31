
/* cloud-live-bridge.js
   Purpose: Keep your existing UI. Make saves go to Supabase and new tabs (incognito/devices) load from Supabase first.
   Safe: No DOM changes; no login changes; tiny console logs for debugging.
*/
(() => {
  const STORE_KEY = "marlow.dashboard.v23";
  const WORKSPACE_ID = "marlow-media-prod";
  const SUPABASE_URL = "https://ttwpbmfvgfyjavejnelc.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0d3BibWZ2Z2Z5amF2ZWpuZWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MTYwMDYsImV4cCI6MjA3MjE5MjAwNn0.o84ycMmWUBkoZpNim2viy4IFjQ00Tb8zwRahNCoOERk";

  function log(){ try{ console.log.apply(console, ["[cloud]"].concat([].slice.call(arguments))); }catch(_){ } }
  function warn(){ try{ console.warn.apply(console, ["[cloud]"].concat([].slice.call(arguments))); }catch(_){ } }

  // Ensure supabase client is available
  let supa = null;
  try {
    if (window.supabase && typeof window.supabase.createClient === "function") {
      supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      // expose so you can debug in console
      window.supa = supa;
    } else {
      warn("supabase-js not loaded. Add <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'></script> in <head>.");
    }
  } catch (e) { warn("supabase init failed", e); }

  async function loadRemote(){
    if (!supa) return null;
    try {
      const { data, error } = await supa.from("app_state").select("state").eq("id", WORKSPACE_ID).maybeSingle();
      if (error) { warn("load error", error); return null; }
      if (data && data.state) { log("loaded"); return data.state; }
      log("no cloud row"); return null;
    } catch (e) { warn("load exception", e); return null; }
  }

  async function saveRemote(state){
    if (!supa) return;
    try {
      const snap = JSON.parse(JSON.stringify(state || {}));
      snap._updatedAt = Date.now();
      const { error } = await supa.from("app_state").upsert(
        { id: WORKSPACE_ID, state: snap, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
      if (error) warn("save error", error); else log("saved");
    } catch (e) { warn("save exception", e); }
  }

  // ---- BOOT: hydrate from cloud ASAP (no waiting for DOM) ----
  (async function bootHydrate(){
    try {
      // Read local
      let local = null;
      try { local = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch(_){}
      // Pull remote
      const remote = await loadRemote();
      if (!remote) { log("boot: no remote"); return; }

      const lt = Number((local && local._updatedAt) || 0);
      const rt = Number(remote._updatedAt || 0);
      const needs = !local || !local.users || !Object.keys(local.users).length || !Array.isArray(local.tasks);

      if (needs || rt > lt) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(remote)); } catch(_){}
        if (window.state) window.state = Object.assign({}, window.state, remote);
        // If your app already rendered, re-render to reflect remote
        try { if (typeof window.render === "function") window.render(); } catch(_){}
        log("boot: hydrated from cloud");
      } else {
        log("boot: kept local (newer or equal)");
      }
    } catch (e) { warn("boot failed", e); }
  })();

  // ---- SAVE: mirror to cloud after your original save() runs ----
  (function patchSaveOnce(){
    try {
      if (window.__cloudPatchedSave) return; // idempotent
      window.__cloudPatchedSave = true;
      const orig = window.save;
      window.save = function(){
        // run your original save()
        try { if (typeof orig === "function") orig.apply(this, arguments); } catch(e){ warn("orig save failed", e); }
        // then mirror to cloud
        try {
          let st = window.state;
          if (!st) {
            try { st = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch(_){ st = null; }
          }
          if (st) saveRemote(st);
        } catch (e) { warn("mirror failed", e); }
      };
      log("save mirroring enabled");
    } catch (e) { warn("patch save failed", e); }
  })();

  // Optional helper if your login wants to force a pre-hydrate:
  window.bridgePrehydrate = loadRemote;
})();
