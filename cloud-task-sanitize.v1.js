/*! cloud-task-sanitize.v1.js
   Drops invalid/orphan tasks before saving so they can't block cloud merges or "come back".
   - Invalid = missing date (date/day/scheduledFor/when) OR title is empty/'undefined' (title/name/type).
   - Orphan  = has clientId but that client does not exist in state.clients.
   - Wraps window.save() to sanitize before persistence.
   - Also sweeps after each render to keep state clean during UI flows.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[sanitize]', ...a);}catch(_){ } };

  function normalizeTask(t, clientsSet){
    if (!t || typeof t!=='object') return null;
    const date  = t.date || t.day || t.scheduledFor || t.when || '';
    const title = (t.title ?? t.name ?? t.type ?? '').toString().trim();
    if (!date || !title || title === 'undefined') return null;

    // Drop orphans: task references a client that doesn't exist
    const hasClient = typeof t.clientId !== 'undefined' && t.clientId !== null && t.clientId !== '';
    if (hasClient && clientsSet && !clientsSet.has(t.clientId)) return null;

    // Normalize owner field aliases
    const uid = t.owner || t.assignee || t.employeeId || t.userId || null;
    if (uid){ t.owner = t.assignee = t.employeeId = t.userId = uid; }

    // Ensure some id exists for UI tracking
    if (!(t.id || t._id || t.taskId || t.uid)){
      t.uid = 't-' + Math.random().toString(36).slice(2, 10);
    }
    return t;
  }

  function sanitizeState(){
    const s = window.state || (window.state = {});
    if (!Array.isArray(s.tasks)) { s.tasks = []; return 0; }
    const clientsSet = new Set(Object.keys(s.clients||{}));
    const before = s.tasks.length;
    const cleaned = [];
    for (const task of s.tasks){
      const n = normalizeTask(task, clientsSet);
      if (n) cleaned.push(n);
    }
    const dropped = before - cleaned.length;
    if (dropped) LOG('dropped', dropped, 'invalid/orphan task(s)');
    s.tasks = cleaned;
    return dropped;
  }

  // Wrap save()
  if (typeof window.save === 'function' && !window.save.__sanitizeWrapped){
    const orig = window.save;
    window.save = async function(){
      const dropped = sanitizeState();
      const out = await orig.apply(this, arguments);
      if (dropped) LOG('persisted after clean');
      return out;
    };
    window.save.__sanitizeWrapped = true;
    LOG('save wrapped');
  }

  // Sweep right after each render to avoid temporary invalids lingering
  (function patchRender(){
    const orig = window.render;
    if (typeof orig === 'function' && !orig.__sanitizeSweep){
      window.render = function(){
        const r = orig.apply(this, arguments);
        try { sanitizeState(); } catch(_){}
        return r;
      };
      window.render.__sanitizeSweep = true;
    }
  })();
})();