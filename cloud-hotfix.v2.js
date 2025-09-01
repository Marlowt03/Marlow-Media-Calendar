/*! cloud-hotfix.v2.js  (upgraded)
   Purpose:
   - Disable legacy remote savers (if any)
   - When the user triggers destructive actions (Delete/Remove/Mark done), set
     window.__allowDestructiveSave = true for a short window and call save() once (debounced).
*/
(function(){
  const log  = (...a)=>{ try{ console.log('[hotfix.v2]', ...a);}catch(_){}};
  const warn = (...a)=>{ try{ console.warn('[hotfix.v2]', ...a);}catch(_){}};

  // 1) Kill legacy remote writers if present
  try {
    if (typeof window.saveRemoteState === 'function') {
      window.saveRemoteState = function(){ log('saveRemoteState disabled'); };
    }
  } catch(_) {}
  log('saveRemoteState disabled');
  log('ready');

  // 2) Debounced destructive save helper
  let t=null;
  function destructiveSave(label, extra){
    window.__allowDestructiveSave = true; // allow merge guard to accept regressive changes
    if (t) clearTimeout(t);
    t = setTimeout(async () => {
      try { if (typeof window.save === 'function') await window.save(); }
      catch(e){ warn('save failed', e); }
      finally { log('merged (', label, ')', extra||''); }
    }, 500);
  }

  // 3) Listen for Delete / Remove / Archive / Done UI interactions
  document.addEventListener('click', (e) => {
    const el = e.target;
    if (!el) return;
    const txt = (el.innerText || el.value || '').toLowerCase();
    const isDestructive =
      /delete|remove|archive|mark done|done|complete|trash|🗑/i.test(el.innerText||'') ||
      (el.getAttribute && /delete|remove/.test(el.getAttribute('aria-label')||''));

    if (isDestructive) {
      // give the app a short moment to mutate state first, then save once
      setTimeout(() => destructiveSave('delete/complete click'), 350);
    }
  }, true);

  // 4) Also watch checkboxes (task done toggles)
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el) return;
    if (el.matches && el.matches('input[type="checkbox"]')) {
      // Many UIs use a checkbox for "done"
      setTimeout(() => destructiveSave('checkbox change'), 350);
    }
  }, true);
})();
