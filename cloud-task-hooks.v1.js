/*! cloud-task-hooks.v1.js  (updated)
   Auto-persist when tasks change. Marks destructive saves when tasks shrink or items marked done increase.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[tasks.v1]', ...a); }catch(_){ } };
  const WARN = (...a)=>{ try{ console.warn('[tasks.v1]', ...a); }catch(_){ } };

  function snapshot(){
    const tasks = Array.isArray(window.state?.tasks) ? window.state.tasks : [];
    const len = tasks.length;
    const doneCount = tasks.filter(t => !!t?.done).length;
    return {len, doneCount, json: JSON.stringify(tasks)};
  }

  let last = snapshot();
  let timer = null;
  function persist(destructive){
    if (destructive) window.__allowDestructiveSave = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try { if (typeof window.save === 'function') await window.save(); LOG('persisted', destructive?'[destructive]':''); }
      catch(e){ WARN('save failed', e); }
    }, 600);
  }

  setInterval(() => {
    try{
      const now = snapshot();
      if (now.json !== last.json){
        // Detect destructive intent: list got smaller or done count increased
        const destructive = (now.len < last.len) || (now.doneCount > last.doneCount);
        persist(destructive);
        last = now;
      }
    }catch(_){}
  }, 800);
})();
