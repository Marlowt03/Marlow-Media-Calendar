/*! cloud-user-normalize.v1.js
   Ensures every user has a valid weekday map before any scheduling runs.
   - If neither `days` nor `scheduleDays` exists, create Mon–Fri true, others false.
   - If only one exists, mirror to the other for code paths that expect it.
   - Persists once if it had to fix anything.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[user.normalize]', ...a);}catch(_){ } };
  function normDays(d){
    const base = {Sun:false, Mon:true, Tue:true, Wed:true, Thu:true, Fri:true, Sat:false};
    if (!d || typeof d!=='object') return {...base};
    const out = {...base, ...d};
    // coerce to boolean
    Object.keys(out).forEach(k => out[k] = !!out[k]);
    return out;
  }
  function runFix(){
    const s = window.state || (window.state={});
    const users = s.users || (s.users={});
    let changed = 0;
    for (const [uid, u] of Object.entries(users)){
      if (!u || typeof u!=='object') continue;
      const hasDays = u.days && typeof u.days==='object';
      const hasSched = u.scheduleDays && typeof u.scheduleDays==='object';
      if (!hasDays && !hasSched){
        u.days = normDays(null);
        u.scheduleDays = {...u.days};
        changed++;
      } else if (hasDays && !hasSched){
        u.scheduleDays = normDays(u.days);
        changed++;
      } else if (!hasDays && hasSched){
        u.days = normDays(u.scheduleDays);
        changed++;
      } else {
        // both exist: normalize both
        u.days = normDays(u.days);
        u.scheduleDays = normDays(u.scheduleDays);
      }
      // default hoursPerDay
      if (typeof u.hoursPerDay!=='number' || !(u.hoursPerDay>0)){
        u.hoursPerDay = 8;
        changed++;
      }
    }
    if (changed){
      try{ window.__allowDestructiveSave = true; }catch(_){}
      try{ if (typeof window.save==='function') window.save(); LOG('fixed users:', changed); }catch(_){}
    } else {
      LOG('no changes');
    }
  }

  // Boot
  setTimeout(runFix, 50);

  // After any render (new users from cloud), run again
  (function patchRender(){
    const orig = window.render;
    if (!orig || orig.__normUsers) return;
    window.render = function(){
      const r = orig.apply(this, arguments);
      try{ runFix(); }catch(_){}
      return r;
    };
    window.render.__normUsers = true;
  })();
})();