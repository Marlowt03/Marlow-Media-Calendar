/*! cloud-account-hooks.v1.js
   Auto-persist when employee credentials or profile are changed.
   Debounced save() after detecting changes to state.users.*
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[acct.v1]', ...a); }catch(_){ } };
  const WARN = (...a)=>{ try{ console.warn('[acct.v1]', ...a); }catch(_){ } };

  let lastUsersJSON = JSON.stringify((window.state && window.state.users) || {});
  let timer = null;
  function persist(){
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try { if (typeof window.save === 'function') await window.save(); LOG('persisted'); }
      catch(e){ WARN('save failed', e); }
    }, 700);
  }

  setInterval(() => {
    try{
      const now = JSON.stringify((window.state && window.state.users) || {});
      if (now !== lastUsersJSON){
        lastUsersJSON = now;
        persist();
      }
    }catch(_){}
  }, 1000);
})();