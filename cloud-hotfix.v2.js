
/*! cloud-hotfix.v2.js
    - Auto-saves + cloud-merges after Add Client / Create + Auto-schedule
    - Detects buttons by text (no fragile IDs)
    - Waits for clients[] to GROW, then save() → RPC merge
    - Also persists after delete confirm
*/
(function(){
  const SK = window.STORE_KEY || 'marlow.dashboard.v23';
  const WS = window.WORKSPACE_ID || 'marlow-media-prod';
  function log(){ try{ console.log.apply(console, ["[hotfix.v2]"].concat([].slice.call(arguments))); }catch(_){ } }
  function warn(){ try{ console.warn.apply(console, ["[hotfix.v2]"].concat([].slice.call(arguments))); }catch(_){ } }

  // Disable legacy remote saver if present (avoids conflicts)
  try {
    if (typeof window.saveRemoteState === 'function') {
      window.saveRemoteState = function(){ /* disabled */ };
      log("saveRemoteState disabled");
    }
  } catch(_){}

  async function pushCloud(label){
    try {
      if (!window.supa) { warn("no supabase client"); return; }
      let s = window.state || null;
      if (!s) { try { s = JSON.parse(localStorage.getItem(SK) || 'null'); } catch(_) {} }
      if (!s) { warn("no state to push"); return; }
      s = JSON.parse(JSON.stringify(s));
      s._updatedAt = Date.now();
      const { error } = await window.supa.rpc('merge_app_state', { p_id: WS, p_state: s });
      if (error) warn("rpc error", error);
      else log("merged", label || "");
    } catch(e) { warn("push exception", e); }
  }

  async function persist(label){
    try { if (window.state) window.state._updatedAt = Date.now(); } catch(_){}
    try { if (typeof window.save === "function") await window.save(); } catch(e){ warn("save failed", e); }
    await pushCloud(label);
  }

  // Wait for clients count to increase, then persist once.
  function watchClientsGrow(prevCount, label){
    let tries = 0, maxTries = 50; // ~10s at 200ms
    const timer = setInterval(() => {
      tries++;
      const cur = Object.keys((window.state && window.state.clients) || {}).length;
      if (cur > prevCount) {
        clearInterval(timer);
        persist(label + " clients:" + cur);
      } else if (tries >= maxTries) {
        clearInterval(timer);
        // Persist anyway; some UIs add then replace in a later render
        persist(label + " (timeout)");
      }
    }, 200);
  }

  // Helper to find a clickable label
  function getLabel(el){
    try {
      const txt = (el.innerText || el.textContent || "").toLowerCase().trim();
      return txt;
    } catch(_){ return ""; }
  }

  // Event delegation for clicks on Add/Create buttons (by text match)
  document.addEventListener("click", (ev) => {
    const el = ev.target;
    if (!el) return;
    const btn = el.closest("button, [role='button'], .btn, .button");
    if (!btn) return;
    const txt = getLabel(btn);

    const looksCreate = txt.includes("create + auto") || txt.includes("auto-schedule") ||
                        txt.includes("create client") || txt === "create" ||
                        txt.includes("add client") || txt === "add";

    const looksDelete = txt.includes("delete") && !txt.includes("cancel");

    if (looksCreate) {
      const prev = Object.keys((window.state && window.state.clients) || {}).length;
      // allow UI to add client + schedule tasks first
      setTimeout(() => watchClientsGrow(prev, "(create/auto)"), 300);
    } else if (looksDelete) {
      setTimeout(() => persist("(delete)"), 200);
    }
  }, true);

  log("ready");
})();
