
/*! cloud-post-hooks.v2.js
    Hooks client/scheduler actions so they persist to Supabase via merge_app_state.
    - No UI changes. Safe to include after cloud-merge-bridge.js.
*/
(function(){
  const SK = window.STORE_KEY || 'marlow.dashboard.v23';
  const WS = window.WORKSPACE_ID || 'marlow-media-prod';

  function log(){ try{ console.log.apply(console, ["[post]"].concat([].slice.call(arguments))); }catch(_){ } }
  function warn(){ try{ console.warn.apply(console, ["[post]"].concat([].slice.call(arguments))); }catch(_){ } }

  if (!window.supa) { warn("supabase client missing (include cloud-merge-bridge.js and supabase-js first)"); return; }
  const supa = window.supa;

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

  let debounce = null;
  function schedulePersist(label){
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      try { if (window.state) window.state._updatedAt = Date.now(); } catch(_){}
      try { if (typeof window.save === "function") await window.save(); } catch(_){}
      await pushCloud(label);
    }, 800);
  }

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
