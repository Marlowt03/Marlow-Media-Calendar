/*! cloud-calendar-anchor.v4.js
   Anchor the calendar month per tab by setting state.todayOverride (session only).
   - Reads/updates anchor from the visible calendar title ("September 2025") or prev/next clicks.
   - Writes anchor to sessionStorage key 'ui.cal.anchor.iso' as 'YYYY-MM-01'.
   - Updates state.todayOverride locally so todayStr() uses it.
   - NEVER calls save(); the bridge strips todayOverride when saving to cloud.
*/
(function(){
  const KEY = 'ui.cal.anchor.iso';
  const LOG = (...a)=>{ try{ console.log('[anchor.v4]', ...a);}catch(_){}};

  function isoMonthStart(d){
    const x=new Date(d); x.setDate(1); x.setHours(0,0,0,0);
    return x.toISOString().slice(0,10);
  }

  function readMonthFromTitle(){
    const el = document.getElementById('calTitle');
    if (!el) return null;
    const t = (el.textContent||'').trim();
    const m = t.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
    if (!m) return null;
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const mi = months.indexOf(m[1].toLowerCase());
    if (mi<0) return null;
    return isoMonthStart(new Date(Number(m[2]), mi, 1));
  }

  function setAnchorISO(iso){
    try{ sessionStorage.setItem(KEY, iso||''); }catch(_){}
    // Reflect into state for todayStr()
    try{
      if (!window.state) window.state = {};
      if (iso) window.state.todayOverride = iso;
      else delete window.state.todayOverride;
    }catch(_){}
    LOG('anchor', iso);
  }

  function getAnchorISO(){ try{ return sessionStorage.getItem(KEY)||''; }catch(_){ return ''; } }

  function updateFromDOM(){
    const iso = readMonthFromTitle();
    if (iso) setAnchorISO(iso);
  }

  function wireNav(){
    const all = Array.from(document.querySelectorAll('button, [role="button"]'));
    const prev = all.find(el => (el.textContent||'').trim()==='‹' || /prev|previous/i.test(el.getAttribute('aria-label')||''));
    const next = all.find(el => (el.textContent||'').trim()==='›' || /next/i.test(el.getAttribute('aria-label')||''));
    if (prev && !prev.__anchor_v4){
      prev.addEventListener('click', ()=> setTimeout(updateFromDOM, 0));
      prev.__anchor_v4 = true;
    }
    if (next && !next.__anchor_v4){
      next.addEventListener('click', ()=> setTimeout(updateFromDOM, 0));
      next.__anchor_v4 = true;
    }
  }

  // Patch render: after each render, re-apply anchor and refresh from DOM
  (function patchRender(){
    const orig = window.render;
    if (!orig || orig.__anchorV4) return;
    window.render = function(){
      const r = orig.apply(this, arguments);
      try{
        const saved = getAnchorISO();
        if (saved) setAnchorISO(saved);
        wireNav();
        // In case a render changed the title, grab it and save again
        setTimeout(updateFromDOM, 0);
      }catch(_){}
      return r;
    };
    window.render.__anchorV4 = true;
  })();

  // Boot: apply saved anchor or initialize to current month
  setTimeout(()=>{
    const saved = getAnchorISO();
    if (saved){ setAnchorISO(saved); }
    else { setAnchorISO(isoMonthStart(new Date())); }
    wireNav();
    setTimeout(updateFromDOM, 200);
  }, 200);
})();