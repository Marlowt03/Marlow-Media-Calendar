/*! cloud-schedule-guards.v1.js
   Safe scheduling helpers: protects empWorksOn and weekday detection to avoid crashes.
   - Defines/overrides `dayKey(dateStr)` and `empWorksOn(uid, dateStr)` in a safe way.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[schedule.guards]', ...a);}catch(_){ } };
  function dayKey(dateStr){
    const d = new Date((dateStr||'')+'T00:00:00');
    const idx = isNaN(d) ? 1 : d.getDay(); // default Mon if bad input
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][idx];
  }
  function empWorksOn(uid, dateStr){
    try{
      const s = window.state || {};
      const u = s.users && s.users[uid];
      if (!u || typeof u!=='object') return false;
      const days = (u.scheduleDays && typeof u.scheduleDays==='object' ? u.scheduleDays : u.days) || {};
      const key = dayKey(dateStr);
      // if missing, assume false except Mon–Fri default true for employees
      if (typeof days[key] === 'boolean') return days[key];
      const def = {Sun:false, Mon:true, Tue:true, Wed:true, Thu:true, Fri:true, Sat:false};
      return !!def[key];
    }catch(_){
      return false;
    }
  }
  // Expose/override on window so global funcs use these
  window.dayKey = dayKey;
  window.empWorksOn = empWorksOn;
  LOG('installed');
})();