
/*! cloud-hotfix.js
    - Disables legacy saveRemoteState() overwrite
    - Auto-saves+merges after "Create" / "Create + Auto-schedule" client flow
    - Ensures delete confirm also merges
*/
(function(){
  const SK = window.STORE_KEY || 'marlow.dashboard.v23';
  const WS = window.WORKSPACE_ID || 'marlow-media-prod';
  function log(){ try{ console.log.apply(console, ["[hotfix]"].concat([].slice.call(arguments))); }catch(_){ } }
  function warn(){ try{ console.warn.apply(console, ["[hotfix]"].concat([].slice.call(arguments))); }catch(_){ } }

  // 1) Stop the legacy upsert-that-strips-users from running
  try {
    if (typeof window.saveRemoteState === 'function') {
      window.saveRemoteState = function(){ /* disabled in favor of RPC merge */ };
      log("saveRemoteState disabled");
    }
  } catch(_){}

  // 2) Helper to trigger your app save (which bridge v2 wraps → RPC merge)
  async function persist(label){
    try { if (window.state) window.state._updatedAt = Date.now(); } catch(_){}
    try { if (typeof window.save === "function") window.save(); } catch(e){ warn("save failed", e); }
    log("persisted", label || "");
  }

  // 3) Event delegation: when the Add Client modal buttons are clicked, save+merge
  document.addEventListener("click", (ev) => {
    const id = (ev && ev.target && ev.target.id) || "";
    if (id === "cCreate" || id === "cCreateAuto") {
      // Give the scheduler a tick to push tasks, then save+merge
      setTimeout(() => persist(id), 900);
    }
    if (id === "doDel") {
      // After delete confirm, save+merge (render code already calls save(), but this is safe)
      setTimeout(() => persist(id), 200);
    }
  }, true);

  log("client create/delete autosave hooks ready");
})();
