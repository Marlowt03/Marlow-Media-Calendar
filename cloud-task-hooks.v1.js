/*! cloud-task-hooks.v1.js
   Auto-persist when tasks change (e.g., toggling done). Debounced to avoid loops.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[tasks.v1]', ...a); }catch(_){ } };
  const WARN = (...a)=>{ try{ console.warn('[tasks.v1]', ...a); }catch(_){ } };

  let lastJSON = JSON.stringify((window.state && window.state.tasks) || []);
  let timer = null;
  function persist(){
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try { if (typeof window.save === 'function') await window.save(); LOG('persisted'); }
      catch(e){ WARN('save failed', e); }
    }, 600);
  }

  setInterval(() => {
    try{
      const nowJSON = JSON.stringify((window.state && window.state.tasks) || []);
      if (nowJSON !== lastJSON){
        lastJSON = nowJSON;
        persist();
      }
    }catch(_){}
  }, 800);
})();