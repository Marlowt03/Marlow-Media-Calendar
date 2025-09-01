/*! cloud-task-done-hooks.v1.js
   Make Done/Archive/Delete stick immediately across tabs.
   - Catches common "done" interactions and saves with destructive intent.
   - Double-save strategy (fast then confirm) to beat races with re-render.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[done.hooks]', ...a);}catch(_){ } };
  const WARN = (...a)=>{ try{ console.warn('[done.hooks]', ...a);}catch(_){ } };

  function destructiveSave(){
    try{ window.__allowDestructiveSave = true; }catch(_){}
    try{ if (typeof window.save==='function') window.save(); }catch(e){ WARN('save fail(fast)', e); }
    setTimeout(() => {
      try{ window.__allowDestructiveSave = true; }catch(_){}
      try{ if (typeof window.save==='function') window.save(); LOG('persisted'); }catch(e){ WARN('save fail(confirm)', e); }
    }, 700);
  }

  function isDoneText(t){ return /(done|mark\s*done|complete|archive|delete|remove|trash)/i.test(t||''); }

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el && el.matches && el.matches('input[type="checkbox"]')){
      destructiveSave();
    }
  }, true);

  document.addEventListener('click', (e) => {
    const el = e.target;
    const txt = (el.innerText || el.value || '').trim();
    if (isDoneText(txt)) destructiveSave();
  }, true);
})();