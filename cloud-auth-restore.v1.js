/*! cloud-auth-restore.v1.js  (updated)
   On boot, if we have a prior session user, restore it into state.currentUserId
   before the first render. Does not write to cloud.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[auth.restore]', ...a); }catch(_){ } };
  const SK   = window.STORE_KEY || 'marlow.dashboard.v23';
  const SESS = 'auth.currentUserId';

  function readLocal(){ try{ return JSON.parse(localStorage.getItem(SK)||'null')||{}; }catch(_){ return {}; } }
  function writeLocal(s){ try{ localStorage.setItem(SK, JSON.stringify(s)); }catch(_){ } }

  try{
    const sess = sessionStorage.getItem(SESS) || '';
    const s = window.state || readLocal() || {};
    if (sess && !s.currentUserId){
      s.currentUserId = sess;
      window.state = s;
      try{ if (typeof state !== 'undefined') state = window.state; }catch(_){}
      writeLocal(s);
      LOG('restored session user', sess);
      try{ if (typeof window.render==='function') window.render(); }catch(_){}
    } else if (!sess && s.currentUserId){
      // ensure cloud snapshot won't force-login new tabs
      s.currentUserId = null;
      window.state = s; writeLocal(s);
      LOG('cleared persisted currentUserId for clean login');
    }
  }catch(_){}
})();
