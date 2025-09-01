/*! cloud-post-hooks.v3.js  (standalone)
   Debounced save() after scheduler functions run.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[post.v3]', ...a); }catch(_){ } };
  const WARN = (...a)=>{ try{ console.warn('[post.v3]', ...a); }catch(_){ } };

  let timer=null;
  function persist(tag){
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try { if (typeof window.save==='function') await window.save(); LOG('persisted', '('+tag+')'); }
      catch(e){ WARN('save failed', e); }
    }, 800);
  }

  function wrap(name){
    const fn = window[name];
    if (typeof fn !== 'function') return;
    if (fn.__wrappedPostV3) return;
    window[name] = function(){
      const out = fn.apply(this, arguments);
      try{ persist(name); }catch(_){}
      return out;
    };
    window[name].__wrappedPostV3 = true;
  }

  ['scheduleClientMonths','scheduleContentPosts','scheduleRecurringTasks','requestScheduleChange'].forEach(wrap);
  LOG('hooks: scheduleClientMonths, scheduleContentPosts, scheduleRecurringTasks, requestScheduleChange');
})();