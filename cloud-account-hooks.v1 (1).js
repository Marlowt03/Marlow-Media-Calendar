/*! cloud-account-hooks.v1.js
   Persist account changes: password, add/remove employees, scheduleDays/hours.
   - Wraps setUserPassword if present; otherwise listens to Settings form save.
   - Debounced save after changes (non-destructive).
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[account.v1]', ...a);}catch(_){ } };
  function persist(){ clearTimeout(persist._t); persist._t = setTimeout(()=>{ try{ if (typeof save==='function') save(); LOG('persisted'); }catch(_){ } }, 400); }

  // Wrap function if present
  if (typeof window.setUserPassword === 'function' && !window.setUserPassword.__wrappedAccount){
    const orig = window.setUserPassword;
    window.setUserPassword = function(uid, pwd){
      const out = orig.apply(this, arguments);
      try{
        const s = window.state||{}; if (s.users && s.users[uid]) s.users[uid].password = pwd;
      }catch(_){}
      persist();
      return out;
    };
    window.setUserPassword.__wrappedAccount = true;
    LOG('wrapped setUserPassword');
  }

  // Heuristic: Settings Save button
  document.addEventListener('click', (e) => {
    const el = e.target;
    const txt = (el.innerText||'').trim().toLowerCase();
    if (/save/.test(txt)){
      persist();
    }
  }, true);

  // Track inputs that likely affect employees
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el) return;
    const name = (el.getAttribute('name')||'').toLowerCase();
    if (/password|hoursperday|schedule|skills/.test(name)) persist();
  }, true);
})();