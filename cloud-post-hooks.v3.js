
/*! cloud-post-hooks.v3.js
    Purpose: persist AFTER scheduling functions complete (no render hooks to avoid loops)
    - Works with cloud-merge-bridge.v2.js (save() → RPC merge)
    - Safe alongside cloud-hotfix.v2.js (which handles create/delete flows)
*/
(function(){
  function log(){ try{ console.log.apply(console, ["[post.v3]"].concat([].slice.call(arguments))); }catch(_){ } }
  function warn(){ try{ console.warn.apply(console, ["[post.v3]"].concat([].slice.call(arguments))); }catch(_){ } }

  if (!window.supa) { warn("supabase client missing (load supabase-js + bridge first)"); return; }

  // Debounced persist: call app save() then the bridge will merge to cloud
  let t = null;
  async function persist(label){
    if (t) clearTimeout(t);
    t = setTimeout(async () => {
      try { if (window.state) window.state._updatedAt = Date.now(); } catch(_){}
      try { if (typeof window.save === 'function') await window.save(); } catch(e){ warn('save failed', e); }
      log('persisted', label || '');
    }, 600);
  }

  function hook(name, label){
    const fn = window[name];
    if (typeof fn !== 'function') return false;
    window[name] = function(){
      const r = fn.apply(this, arguments);
      persist('(' + label + ')');
      return r;
    };
    return true;
  }

  const hooked = [];
  if (hook('scheduleClientMonths', 'scheduleClientMonths')) hooked.push('scheduleClientMonths');
  if (hook('scheduleContentPosts', 'scheduleContentPosts')) hooked.push('scheduleContentPosts');
  if (hook('scheduleRecurringTasks', 'scheduleRecurringTasks')) hooked.push('scheduleRecurringTasks');
  if (hook('requestScheduleChange', 'requestScheduleChange')) hooked.push('requestScheduleChange');

  log('hooks:', hooked.join(', ') || 'none');
})();
