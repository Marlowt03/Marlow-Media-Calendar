/*! cloud-assignment-rules.v1.js
   - Map Website (W) -> 'website', Ops (L) -> 'ops' for scheduling
   - For tasks with no required skill (N/none), round-robin candidates per date
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[assign.v1]', ...a); }catch(_){ } };

  // Override requiredSkill to include explicit skills for W and L
  const origReq = window.requiredSkill || function(type){
    const map = {S:"script", F:"film", E:"edit", P:"photo", W:"website", N:"none", L:"ops"};
    if(type==="W"||type==="N"||type==="L") return null;
    return map[type?.toUpperCase()] || null;
  };
  window.requiredSkill = function(type){
    const t = (type||'').toUpperCase();
    const map = {S:"script", F:"film", E:"edit", P:"photo", W:"website", L:"ops"};
    if (t in map) return map[t];
    if (t === 'N') return null; // 'none' stays null
    return origReq(type);
  };
  LOG('requiredSkill patched (W->website, L->ops)');

  // Wrap firstAvailableEmp to round-robin when skill is null
  const origFAE = window.firstAvailableEmp;
  const rr = Object.create(null); // per date key -> index
  if (typeof origFAE === 'function'){
    window.firstAvailableEmp = function(dateStr, skill){
      if (skill) return origFAE(dateStr, skill);
      // No skill: build same candidate set the original would consider
      const emps = Object.values(window.state?.users||{}).filter(u => u.role !== 'sales');
      const workAndAnySkill = emps.filter(e => typeof window.empWorksOn==='function' ? window.empWorksOn(dateStr, e) : true);
      if (!workAndAnySkill.length) return origFAE(dateStr, skill);

      const key = String(dateStr||'') + '::nullskill';
      const i = rr[key] = ((rr[key]||-1)+1) % workAndAnySkill.length;
      const pick = workAndAnySkill[i];
      return pick || origFAE(dateStr, skill);
    };
    LOG('firstAvailableEmp patched for round-robin when skill=null');
  }
})();