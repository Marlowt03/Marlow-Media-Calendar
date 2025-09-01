/*! cloud-hotfix.v2.js  (guarded)
   Disable legacy savers; auto-save on Create/Delete/Done flows.
   Guarded so it installs once.
*/
(function(){
  if (window.__hotfix_v2_installed) return;
  window.__hotfix_v2_installed = true;

  const log  = (...a)=>{ try{ console.log('[hotfix.v2]', ...a);}catch(_){}};
  const warn = (...a)=>{ try{ console.warn('[hotfix.v2]', ...a);}catch(_){}};

  try {
    if (typeof window.saveRemoteState === 'function') {
      window.saveRemoteState = function(){ log('saveRemoteState disabled'); };
    }
  } catch(_) {}
  log('saveRemoteState disabled');
  log('ready');

  let t=null;
  function queueSave(label, destructive){
    if (destructive) window.__allowDestructiveSave = true;
    if (t) clearTimeout(t);
    t = setTimeout(async () => {
      try { if (typeof window.save==='function') await window.save(); }
      catch(e){ warn('save failed', e); }
      finally { log('merged', label||''); }
    }, 550);
  }

  function isCreateText(txt){
    return /^(create|create\s*\+\s*auto(\s|-)?schedule)$/i.test((txt||'').trim());
  }
  function isDestructiveText(txt){
    return /(delete|remove|archive|mark\s*done|done|complete|trash|🗑)/i.test(txt||'');
  }

  document.addEventListener('click', (e) => {
    const el = e.target;
    if (!el) return;
    const txt = (el.innerText || el.value || '').trim();
    if (isCreateText(txt)) {
      setTimeout(() => queueSave('create/auto-schedule'), 750);
      return;
    }
    if (isDestructiveText(txt)){
      setTimeout(() => queueSave('delete/complete', true), 350);
      return;
    }
  }, true);

  document.addEventListener('click', (e) => {
    const el = e.target;
    if (!el || !el.getAttribute) return;
    const ar = el.getAttribute('aria-label') || '';
    if (isCreateText(ar)) {
      setTimeout(() => queueSave('create/auto-schedule[aria]'), 750);
    }
  }, true);

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el && el.matches && el.matches('input[type="checkbox"]')) {
      setTimeout(() => queueSave('checkbox done', true), 350);
    }
  }, true);
})();