/*! cloud-calendar-anchor.v1.js
   Stop "jump to Today" by anchoring todayStr() to the month you're viewing.
   - Per-tab only (sessionStorage). No cloud writes.
   - Wraps todayStr() to prefer a session override if present.
   - Tracks month via the calendar title and prev/next buttons.
*/
(function(){
  const KEY = 'ui.cal.anchor'; // ISO YYYY-MM-01 of the viewed month
  const LOG = (...a)=>{ try{ console.log('[anchor]', ...a);}catch(_){}};

  function fmtMonthStart(d){
    const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0);
    return x.toISOString().slice(0,10);
  }
  function readMonthFromTitle(){
    const title = document.getElementById('calTitle') || null;
    if (!title) return null;
    const t = (title.textContent||'').trim();
    const m = t.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
    if (!m) return null;
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const mm = months.indexOf(m[1].toLowerCase());
    if (mm<0) return null;
    return fmtMonthStart(new Date(Number(m[2]), mm, 1));
  }
  function setAnchorISO(iso){
    try{ sessionStorage.setItem(KEY, iso||''); }catch(_){}
    LOG('set', iso);
  }
  function getAnchorISO(){
    try{ return sessionStorage.getItem(KEY)||''; }catch(_){ return ''; }
  }

  // Wrap todayStr to prefer the session anchor
  (function wrapTodayStr(){
    const orig = window.todayStr;
    window.todayStr = function(){
      const sess = getAnchorISO();
      if (sess) return sess; // anchor wins per-tab
      return typeof orig === 'function' ? orig() : (new Date().toISOString().slice(0,10));
    };
    window.todayStr.__anchored = true;
    LOG('todayStr anchored');
  })();

  // Save anchor whenever month changes via prev/next
  function wireNavTracking(){
    const all = Array.from(document.querySelectorAll('button, [role="button"]'));
    const prev = all.find(el => (el.textContent||'').trim()==='‹' || /prev|previous/i.test(el.getAttribute('aria-label')||''));
    const next = all.find(el => (el.textContent||'').trim()==='›' || /next/i.test(el.getAttribute('aria-label')||''));
    if (prev && !prev.__anchor_wired){
      prev.addEventListener('click', ()=> setTimeout(()=> { const iso = readMonthFromTitle(); if (iso) setAnchorISO(iso); }, 0));
      prev.__anchor_wired = true;
    }
    if (next && !next.__anchor_wired){
      next.addEventListener('click', ()=> setTimeout(()=> { const iso = readMonthFromTitle(); if (iso) setAnchorISO(iso); }, 0));
      next.__anchor_wired = true;
    }
  }

  // After each render, capture the visible month as the anchor
  (function patchRender(){
    const orig = window.render;
    if (!orig || orig.__anchorPatched) return;
    window.render = function(){
      const r = orig.apply(this, arguments);
      try{
        wireNavTracking();
        const iso = readMonthFromTitle();
        if (iso) setAnchorISO(iso);
      }catch(_){}
      return r;
    };
    window.render.__anchorPatched = true;
    LOG('render patched');
  })();

  // Initialize anchor on boot to current visible month (or Today)
  setTimeout(()=>{
    const iso = readMonthFromTitle() || fmtMonthStart(new Date());
    setAnchorISO(iso);
    wireNavTracking();
  }, 200);
})();