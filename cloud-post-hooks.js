
/*! cloud-post-hooks.js
    Hooks your existing scheduler/client actions so they persist to Supabase via merge_app_state.
    - No UI changes. Safe to include after cloud-merge-bridge.js.
*/
(function(){
  const SK = window.STORE_KEY || 'marlow.dashboard.v23';
  const WS = window.WORKSPACE_ID || 'marlow-media-prod';
  const url = window.SUPABASE_URL || 'https://ttwpbmfvgfyjavejnelc.supabase.co';
  const key = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0d3BibWZ2Z2Z5amF2ZWpuZWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MTYwMDYsImV4cCI6MjA3MjE5MjAwNn0.o84ycMmWUBkoZpNim2viy4IFjQ00Tb8zwRahNCoOERk";
  const supa = window.supa || (window.supabase && window.supabase.createClient(url, key));
  function log(){ try{ console.log.apply(console, ["[post]"].concat([].slice.call(arguments))); }catch(_){ } }
  function warn(){ try{ console.warn.apply(console, ["[post]"].concat([].slice.call(arguments))); }catch(_){ } }

  if (!supa) { warn("supabase client missing"); return; }

  // Push full state to cloud via RPC merge
  async function pushCloud(label){
    try{
      let s = window.state || null;
      if (!s) { try { s = JSON.parse(localStorage.getItem(SK) || 'null'); } catch(_) {} }
      if (!s) { warn("no state to push"); return; }
      s = JSON.parse(JSON.stringify(s));
      s._updatedAt = Date.now();
      const { error } = await supa.rpc('merge_app_state', { p_id: WS, p_state: s });
      if (error) warn("rpc error", error); else log("merged", label || "");
    }catch(e){ warn("push exception", e); }
  }

  // Run your app's save() then cloud merge (debounced to let UI populate tasks)
  let debounce = null;
  function schedulePersist(label){
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      try { if (window.state) window.state._updatedAt = Date.now(); } catch(_){}
      try { if (typeof window.save === "function") await window.save(); } catch(_){}
      await pushCloud(label);
    }, 800);
  }

  // Helper to safely wrap named functions if they exist
  function hook(name, label){
    const fn = window[name];
    if (typeof fn !== "function") return false;
    window[name] = function(){
      const r = fn.apply(this, arguments);
      try { schedulePersist(label); } catch(_){}
      return r;
    };
    return true;
  }

  const hooked = [];
  ["scheduleClientMonths","scheduleContentPosts","scheduleRecurringTasks","requestScheduleChange",
   "addClient","createClient","saveClient","removeClient","deleteClient","renderClients"]
   .forEach(n => { if (hook(n, "(" + n + ")")) hooked.push(n); });

  log("hooks:", hooked.join(", ") || "none");
})();
