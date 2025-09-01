/*! cloud-task-owner-lock.v1.js
   Make manual owner changes stick and survive scroll/re-render.
   - When owner is changed (selects/buttons), set task.ownerLocked=true and persist.
   - Wrap setTaskOwner() if present to set the lock automatically.
   - Suppresses auto reassign for ~2s after a manual change.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[owner.lock]', ...a);}catch(_){ } };
  const WARN = (...a)=>{ try{ console.warn('[owner.lock]', ...a);}catch(_){ } };

  function TASKS(){ const s=window.state||{}; return Array.isArray(s.tasks)? s.tasks:[]; }
  function findTaskById(id){
    return TASKS().find(t => t && (t.id===id || t._id===id || t.taskId===id || t.uid===id));
  }
  function setOwnerFields(t, uid){
    if (!t) return;
    t.owner = uid; t.assignee = uid; t.employeeId = uid; t.userId = uid;
    t.ownerLocked = true;
  }
  function suppressReassign(ms=2000){
    window.__suppressReassignUntil = Date.now()+ms;
  }
  function persistSoon(){
    clearTimeout(persistSoon._t);
    persistSoon._t = setTimeout(() => {
      try{ if (typeof window.save==='function') window.save(); LOG('persisted'); }catch(e){ WARN('save failed', e); }
    }, 450);
  }

  // 1) Wrap setTaskOwner if present
  if (typeof window.setTaskOwner === 'function' && !window.setTaskOwner.__ownerLock){
    const orig = window.setTaskOwner;
    window.setTaskOwner = function(taskId, uid){
      const out = orig.apply(this, arguments);
      try{
        const t = findTaskById(taskId);
        setOwnerFields(t, uid);
        suppressReassign();
        persistSoon();
        LOG('locked via setTaskOwner', {taskId, uid});
      }catch(_){}
      return out;
    };
    window.setTaskOwner.__ownerLock = true;
    LOG('wrapped setTaskOwner');
  }

  // 2) Generic SELECT owner/assignee change
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || el.tagName!=='SELECT') return;
    const name = (el.getAttribute('name')||'').toLowerCase();
    const aria = (el.getAttribute('aria-label')||'').toLowerCase();
    if (!(name.includes('owner') || name.includes('assignee') || aria.includes('owner'))) return;
    const root = el.closest('[data-task-id]');
    const taskId = el.getAttribute('data-task-id') || (root && root.getAttribute('data-task-id'));
    const uid = el.value;
    if (taskId && uid){
      const t = findTaskById(taskId);
      setOwnerFields(t, uid);
      suppressReassign();
      persistSoon();
      LOG('locked via select', {taskId, uid});
    }
  }, true);

  // 3) Buttons "Assign"/"Reassign" with data attrs
  document.addEventListener('click', (e) => {
    const el = e.target;
    if (!el) return;
    const txt = (el.innerText||'').trim().toLowerCase();
    if (!/assign|reassign/.test(txt)) return;
    const root = el.closest('[data-task-id]');
    const taskId = root && root.getAttribute('data-task-id');
    const uid = el.getAttribute('data-owner') || el.getAttribute('data-uid') || '';
    if (taskId && uid){
      const t = findTaskById(taskId);
      setOwnerFields(t, uid);
      suppressReassign();
      persistSoon();
      LOG('locked via button', {taskId, uid});
    }
  }, true);
})();
