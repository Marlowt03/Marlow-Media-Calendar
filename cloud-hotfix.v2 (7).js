/*! cloud-hotfix.v2.js (patched)
   - Disable any legacy saveRemoteState()
   - Auto-persist on Create / Create + Auto-schedule / Delete
   - Ensures DELETE uses destructive save (REPLACE) by setting __allowDestructiveSave=true
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[hotfix.v2]', ...a);}catch(_){ } };

  // Kill legacy remote savers if present
  try{
    if (typeof window.saveRemoteState==='function'){
      window.saveRemoteState = function(){ LOG('saveRemoteState disabled'); };
      LOG('saveRemoteState disabled');
    }
  }catch(_){}

  function debounce(fn, ms){
    let t; return function(){ clearTimeout(t); const a=arguments, ctx=this; t=setTimeout(()=>fn.apply(ctx,a), ms); };
  }

  const persist = debounce(function(reason){
    try{ if (/delete/i.test(reason)) window.__allowDestructiveSave = true; }catch(_){}
    try{ if (typeof window.save==='function') window.save(); LOG('merged ('+reason+')'); }catch(_){}
  }, 900);

  // Listen for Create and Delete by label (robust to DOM changes)
  document.addEventListener('click', (e) => {
    const el = e.target;
    const txt = (el.innerText || el.value || '').trim().toLowerCase();
    if (!txt) return;

    if (/create\s*\+\s*auto|create\s*client|create\b/.test(txt)){
      persist('create/auto');
    }
    if (/delete|remove\s*client|archive\s*client/.test(txt)){
      window.__allowDestructiveSave = true;
      persist('delete');
    }
  }, true);

  // Also intercept common delete icons/buttons by aria-label or title
  document.addEventListener('click', (e) => {
    const el = e.target;
    const aria = (el.getAttribute && (el.getAttribute('aria-label')||'')).toLowerCase();
    const title = (el.getAttribute && (el.getAttribute('title')||'')).toLowerCase();
    if (/delete|remove/.test(aria) || /delete|remove/.test(title)){
      window.__allowDestructiveSave = true;
      persist('delete');
    }
  }, true);

  LOG('ready');
})();