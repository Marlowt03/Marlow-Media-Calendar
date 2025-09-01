/*! cloud-client-watcher.js  (v2)
   Persist client creates/edits/deletes automatically.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[watch.clients]', ...a); }catch(_){ } };
  const WARN = (...a)=>{ try{ console.warn('[watch.clients]', ...a); }catch(_){ } };

  function snapshot(){
    const C = (window.state && window.state.clients) || {};
    const count = Object.keys(C).length;
    return { count, json: JSON.stringify(C) };
  }

  let last = snapshot();
  let timer = null;
  function persist(destructive,label){
    if (destructive) window.__allowDestructiveSave = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try { if (typeof window.save==='function') await window.save(); LOG('merged', label || (destructive? '[delete]':'[create/update]')); }
      catch(e){ WARN('save failed', e); }
    }, 700);
  }

  // Poll for structural changes to clients object
  setInterval(() => {
    try{
      const now = snapshot();
      if (now.json !== last.json){
        const destructive = now.count < last.count;
        persist(destructive, destructive? 'delete':'create/update');
        last = now;
      }
    }catch(_){}
  }, 900);

  LOG('running');
})();