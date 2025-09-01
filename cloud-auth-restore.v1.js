/*! cloud-auth-restore.v1.js
   On boot, if we have a prior session user, restore it into state.currentUserId
   before the first render and persist quickly so login doesn't bounce.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[auth.restore]', ...a); }catch(_){ } };
  const SK   = window.STORE_KEY || 'marlow.dashboard.v23';
  const SESS = 'auth.currentUserId';

  function readLocal(){ try{ return JSON.parse(localStorage.getItem(SK)||'null')||{}; }catch(_){ return {}; } }
  function writeLocal(s){ try{ localStorage.setItem(SK, JSON.stringify(s)); }catch(_){ } }

  try{
    const sess = sessionStorage.getItem(SESS) || '';
    if (sess){
      // Mirror into memory/local if missing
      const s = window.state || readLocal() || {};
      if (!s.currentUserId){
        s.currentUserId = sess;
        window.state = s;
        try{ if (typeof state !== 'undefined') state = window.state; }catch(_){}
        writeLocal(s);
        LOG('restored session user', sess);
        try{
          setTimeout(async () => {
            if (typeof window.save==='function') await window.save();
          }, 200);
        }catch(_){}
        try{ if (typeof window.render==='function') window.render(); }catch(_){}
      }
    }
  }catch(_){}
})();