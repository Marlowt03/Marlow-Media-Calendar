/*! cloud-assignment-rules.v3.js
   Fair + sticky assignments.
   - firstAvailableEmp: choose lowest daily utilization, respect hoursPerDay & skills, round‑robin tie‑break.
   - reassignTasks: SKIPS tasks with ownerLocked=true; only reassigns if owner invalid (off-day/missing-skill/over-cap).
   - Honors a short suppression window (window.__suppressReassignUntil) after manual owner changes.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[assign.v3]', ...a);}catch(_){ } };
  const WARN = (...a)=>{ try{ console.warn('[assign.v3]', ...a);}catch(_){ } };

  function S(){ return window.state || {}; }
  function USERS(){ return S().users || {}; }
  function TASKS(){ const x=S().tasks; return Array.isArray(x)? x:[]; }

  function dayKey(dateStr){
    const d = new Date((dateStr||'')+'T00:00:00');
    return isNaN(d) ? 'Mon' : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  }
  function worksOn(uid, dateStr){
    const u = USERS()[uid]||{};
    const days = u.scheduleDays || u.days || {};
    return !!days[dayKey(dateStr)];
  }
  function minutes(t){
    const v = Number(t.minutes ?? t.duration ?? t.mins ?? 0);
    return Number.isFinite(v) && v>0 ? v : 60;
  }
  function hasSkill(uid, skill){
    if (!skill) return true;
    const arr = (USERS()[uid]||{}).skills;
    return Array.isArray(arr) ? arr.includes(skill) : false;
  }
  function ownerOf(t){
    return t.owner ?? t.assignee ?? t.employeeId ?? t.userId ?? null;
  }
  function setOwner(t, uid){
    t.owner = uid; t.assignee = uid; t.employeeId = uid; t.userId = uid;
  }
  function cap(uid){
    const h = Number((USERS()[uid]||{}).hoursPerDay);
    return Number.isFinite(h) && h>0 ? Math.round(h*60) : 8*60;
  }
  function loadOn(dateStr){
    const sum = {}; Object.keys(USERS()).forEach(uid => sum[uid]=0);
    for (const t of TASKS()){
      const d = t.date || t.day || t.scheduledFor || t.when || null;
      if (d!==dateStr) continue;
      const uid = ownerOf(t);
      if (uid) sum[uid] = (sum[uid]||0) + minutes(t);
    }
    return sum;
  }
  function eligibles(dateStr, skill){
    const arr=[];
    for (const uid of Object.keys(USERS())){
      if (!worksOn(uid, dateStr)) continue;
      if (!hasSkill(uid, skill)) continue;
      arr.push(uid);
    }
    return arr;
  }

  function rrTake(cands, skill){
    const s = S(); s._meta = s._meta || {}; s._meta.rr = s._meta.rr || {};
    const key = `rr::${skill||'all'}`;
    const i = Number(s._meta.rr[key]||0) % cands.length;
    const pick = cands[i];
    s._meta.rr[key] = (i+1) % cands.length;
    return pick;
  }

  function firstAvailableEmpPatched(task){
    const dateStr = task.date || task.day || task.scheduledFor || task.when;
    const skill = task.skillKey || task.skill || task.type || null;
    const cands = eligibles(dateStr, skill);
    if (!cands.length) return null;
    const load = loadOn(dateStr);
    const scored = cands.map(uid => {
      const used = load[uid]||0, C = cap(uid), free = Math.max(0, C-used);
      return { uid, used, C, free, ratio: C>0? used/C : 1 };
    }).sort((a,b)=> (a.ratio-b.ratio) || (a.used-b.used) || (a.uid>b.uid?1:-1));
    const need = minutes(task);
    const fits = scored.filter(x => x.free >= need);
    const pool = fits.length ? fits : scored;
    const top = pool.slice(0, Math.min(2, pool.length)).map(x=>x.uid);
    const uid = top.length>1 ? rrTake(top, skill) : top[0];
    LOG('choose', {dateStr, skill, pick:uid, top});
    return uid;
  }

  // Patch or provide
  if (typeof window.firstAvailableEmp === 'function'){
    const orig = window.firstAvailableEmp;
    if (!orig.__patchedV3){
      const patched = function(task){ return firstAvailableEmpPatched(task); };
      patched.__patchedV3 = true;
      window.firstAvailableEmp = patched;
      LOG('firstAvailableEmp patched');
    }
  } else {
    window.firstAvailableEmp = firstAvailableEmpPatched;
    LOG('firstAvailableEmp provided');
  }

  function ownerInvalid(t){
    const uid = ownerOf(t);
    if (!uid) return true;
    const dateStr = t.date || t.day || t.scheduledFor || t.when;
    if (!worksOn(uid, dateStr)) return true;
    const skill = t.skillKey || t.skill || t.type || null;
    if (!hasSkill(uid, skill)) return true;
    const used = loadOn(dateStr)[uid] || 0;
    return used + minutes(t) > cap(uid) * 1.25; // soft threshold
  }

  function reassignTasksPatched(){
    const until = Number(window.__suppressReassignUntil||0);
    if (Date.now() < until){ LOG('reassign suppressed'); return; }

    const arr = TASKS();
    let changed=0;
    for (const t of arr){
      if (t.ownerLocked) continue;         // manual lock sticks
      if (!ownerInvalid(t)) continue;      // valid owner -> keep
      const uid = firstAvailableEmpPatched(t);
      if (uid && uid !== ownerOf(t)){ setOwner(t, uid); changed++; }
    }
    if (changed){ try{ window.save && window.save(); }catch(_){ } }
    LOG('reassign scanned', changed);
  }

  if (typeof window.reassignTasks === 'function'){
    const orig = window.reassignTasks;
    if (!orig.__patchedV3){
      const patched = function(){ return reassignTasksPatched(); };
      patched.__patchedV3 = true;
      window.reassignTasks = patched;
      LOG('reassignTasks patched');
    }
  } else {
    window.reassignTasks = reassignTasksPatched;
    LOG('reassignTasks provided');
  }
})();