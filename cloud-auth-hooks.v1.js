/*! cloud-auth-hooks.v1.js
   Stabilize login: persist currentUserId immediately and survive poll/adopt.
   - Detects successful login (currentUserId set from null -> uid).
   - Writes to localStorage, saves to cloud (debounced short), and stores session flag.
   - On logout (currentUserId -> null), clears session flag.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[auth.v1]', ...a); }catch(_){ } };
  const WARN = (...a)=>{ try{ console.warn('[auth.v1]', ...a); }catch(_){ } };

  const SK = window.STORE_KEY || 'marlow.dashboard.v23';
  const SESS = 'auth.currentUserId';

  function getMem(){ return window.state || {}; }
  function setLocal(s){ try{ localStorage.setItem(SK, JSON.stringify(s)); }catch(_){ } }

  let lastId = (getMem() && getMem().currentUserId) || null;
  let timer = null;

  function persistLogin(uid){
    // Mirror to local immediately so bridge adoption preserves it
    const s = getMem();
    try{
      s.currentUserId = uid;
      setLocal(s);
    }catch(_){}
    // Save quickly
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try { if (typeof window.save==='function') await window.save(); LOG('persisted login for', uid); }
      catch(e){ WARN('save failed', e); }
    }, 300);
    try{ sessionStorage.setItem(SESS, uid || ''); }catch(_){}
  }

  // Watch for currentUserId changes
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
  }, 200);
})();
