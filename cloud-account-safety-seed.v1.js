/*! cloud-account-safety-seed.v1.js
   One-time safety seed for Owner when users are missing (prevents login lockout).
   - Runs on boot. If (state.users count < 1), it creates 'u-OWNER' with a temp password.
   - Persists once to cloud (destructive allowed) and sets a session flag to avoid loops.
   - DOES NOT create any clients or tasks.
*/
(function(){
  const FLAG = 'seed.owner.v1.used';
  if (sessionStorage.getItem(FLAG)) return;

  function usersCount(s){ return s && s.users && typeof s.users==='object' ? Object.keys(s.users).length : 0; }
  function ensureOwner(s){
    s.users = s.users || {};
    if (!s.users['u-OWNER']){
      s.users['u-OWNER'] = {
        id: 'u-OWNER',
        name: 'Owner (You)',
        role: 'owner',
        hoursPerDay: 12,
        start: '09:00',
        scheduleDays: { Sun:false, Mon:true, Tue:true, Wed:true, Thu:true, Fri:true, Sat:false },
        skills: ['script','film','photo','edit','website','emailphone','sales'],
        password: 'OWNER_TEMP_123'
      };
    }
  }

  try{
    const s = window.state || (window.state={});
    if (usersCount(s) < 1){
      ensureOwner(s);
      try{ sessionStorage.setItem(FLAG, '1'); }catch(_){}
      try{ window.__allowDestructiveSave = true; }catch(_){}
      try{ if (typeof window.save==='function') window.save(); console.log('[seed.owner] seeded u-OWNER / OWNER_TEMP_123'); }catch(_){}
    }
  }catch(_){}
})();