/*! cloud-auth-hooks.v1.js  (updated)
   Stabilize login locally without persisting login to cloud.
   - Detects successful login (currentUserId set from null -> uid).
   - Mirrors to localStorage and stores a session flag.
   - Does NOT call save(); login remains per-tab/session.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[auth.v1]', ...a); }catch(_){ } };
  const SK   = window.STORE_KEY || 'marlow.dashboard.v23';
  const SESS = 'auth.currentUserId';

  function getMem(){ return window.state || {}; }
  function setLocal(s){ try{ localStorage.setItem(SK, JSON.stringify(s)); }catch(_){ } }

  let lastId = (getMem() && getMem().currentUserId) || null;

  function persistLogin(uid){
    const s = getMem();
    try{ s.currentUserId = uid; setLocal(s); }catch(_){}
    try{ sessionStorage.setItem(SESS, uid || ''); }catch(_){}
    LOG('login mirrored (session only) for', uid);
  }

  setInterval(() => {
    try{
      const nowId = (getMem() && getMem().currentUserId) || null;
      if (nowId !== lastId){
        // login
        if (nowId) persistLogin(nowId);
        // logout
        else { try{ sessionStorage.removeItem(SESS);}catch(_){ } }
        lastId = nowId;
      }
    }catch(_){}
  }, 250);
})();
