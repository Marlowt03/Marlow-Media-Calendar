/*! cloud-assignment-rules.v2.js
   Scheduling fairness + capacity enforcement and safe reassigns.
   - requiredSkill: map W->'website', L->'ops'; N->null (no hard requirement)
   - firstAvailableEmp: no "owner last" bias; choose by lowest utilization (used/hoursPerDay),
     then by used hours, with round-robin tie-break per (date,skill).
   - reassignTasks: ONLY reassign if employee lost the required skill or is over capacity for that date.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[assign.v2]', ...a); }catch(_){ } };

  // Map letters to skills
  const origRequired = window.requiredSkill || function(type){
    const map = {S:"script", F:"film", E:"edit", P:"photo", W:"website", L:"ops", N:"none"};
    if(type==="W"||type==="N"||type==="L") return null;
    return map[type?.toUpperCase()] || null;
  };
  window.requiredSkill = function(type){
    const t = (type||'').toUpperCase();
    const map = {S:"script", F:"film", E:"edit", P:"photo", W:"website", L:"ops"};
    if (t in map) return map[t];
    if (t === 'N') return null; // none
    return origRequired(type);
  };

  // Helpers reading from state
  function empWorksOn(dateStr, emp){
    try{
      const d = new Date(dateStr).getDay(); // 0..6
      const keys = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      return !!emp?.days?.[keys[d]];
    }catch(_){ return true; }
  }
  function usedHours(dateStr, empId){
    try{
      const tasks = Array.isArray(window.state?.tasks) ? window.state.tasks : [];
      return tasks.filter(t => t.date===dateStr && t.assigneeId===empId && !t.done)
                  .reduce((s,t)=> s + (Number(t.duration)||0), 0);
    }catch(_){ return 0; }
  }

  // Round-robin index per (date,skill)
  const rr = Object.create(null);
  function pickRRKey(dateStr, skill){ return String(dateStr||'') + '::' + String(skill||'any'); }

  // Wrap firstAvailableEmp
  const origFAE = window.firstAvailableEmp;
  if (typeof origFAE === 'function'){
    window.firstAvailableEmp = function(dateStr, skill){
      const users = Object.values(window.state?.users||{}).filter(u => u.role !== 'sales');
      let cand = users.filter(u => empWorksOn(dateStr,u) && (!skill || (Array.isArray(u.skills) && u.skills.includes(skill))));
      if (!cand.length) return null;

      // compute normalized utilization
      const withUtil = cand.map(u => {
        const used = usedHours(dateStr, u.id);
        const cap  = Number(u.hoursPerDay||8);
        const util = cap>0 ? (used / cap) : 1;
        return {u, used, cap, util};
      }).filter(x => (x.used + 0.25) <= x.cap); // small buffer to avoid zero-cap picks

      if (!withUtil.length) return null;

      // sort by lowest utilization, then by used, then by name to stabilize
      withUtil.sort((a,b) => (a.util-b.util) || (a.used-b.used) || String(a.u.name||'').localeCompare(String(b.u.name||'')));

      // round-robin among the top tier if equal utilization
      const topUtil = withUtil[0].util;
      const top = withUtil.filter(x => Math.abs(x.util - topUtil) < 1e-6);
      const key = pickRRKey(dateStr, skill||'any');
      const idx = rr[key] = ((rr[key]||-1)+1) % top.length;
      return top[idx].u;
    };
    LOG('firstAvailableEmp patched: utilization + round‑robin, no owner penalty');
  }

  // Safer reassign: only when emp lost skill or is over capacity
  const origReassign = window.reassignTasks;
  if (typeof origReassign === 'function'){
    window.reassignTasks = function(empId){
      const S = window.state;
      if (!S) return;
      const emp = S.users?.[empId];
      if (!emp) return;

      (S.tasks||[]).forEach(t => {
        if (t.assigneeId !== empId) return;
        const skill = (typeof window.requiredSkill==='function') ? window.requiredSkill(t.type) : null;
        const cap  = Number(emp.hoursPerDay||8);
        const used = usedHours(t.date, empId);
        const over = (used > cap + 1e-6); // over capacity

        const lost = !!(skill && (!Array.isArray(emp.skills) || !emp.skills.includes(skill)));

        if (lost || over){
          // find a better candidate who can take this task
          const best = (typeof window.firstAvailableEmp==='function') ? window.firstAvailableEmp(t.date, skill) : null;
          if (best && best.id !== empId){
            t.assigneeId = best.id;
          }
        }
      });
      if (typeof window.save === 'function') window.save();
    };
    LOG('reassignTasks patched: only on lost-skill or over-capacity');
  }
})();