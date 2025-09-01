/*! cloud-calendar-anchor.v3.js
   Root-cause fix: ensure todayStr() honors per-tab month anchor.
   - Wraps todayStr() to prefer a session anchor.
   - Captures visible month after every render and on prev/next.
   - Does NOT persist to cloud; bridge strips todayOverride on save.
*/
(function(){
  const KEY = 'ui.cal.anchor3'; // session key: 'YYYY-MM-01'
  const LOG = (...a)=>{ try{ console.log('[anchor.v3]', ...a);}catch(_){}};

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

  function setAnchor(iso){
    try{ sessionStorage.setItem(KEY, iso||''); }catch(_){}
    try{
      // Reflect into state for local UI that reads state.todayOverride, but bridge strips it on save
      if (window.state){ window.state.todayOverride = iso; }
    }catch(_){}
    LOG('anchor', iso);
  }
  function getAnchor(){ try{ return sessionStorage.getItem(KEY)||''; }catch(_){ return ''; } }

  // Wrap todayStr to prefer session anchor, fall back to state's override, then real today
  (function wrapTodayStr(){
    const orig = window.todayStr;
    window.todayStr = function(){
      const sess = getAnchor();
      if (sess) return sess;
      try{
        const st = (window.state && window.state.todayOverride) || '';
        if (st) return st;
      }catch(_){}
      return typeof orig==='function' ? orig() : (new Date().toISOString().slice(0,10));
    };
    window.todayStr.__anchoredV3 = true;
    LOG('installed');
  })();

  function wireNav(){
    const all = Array.from(document.querySelectorAll('button, [role="button"]'));
    const prev = all.find(el => (el.textContent||'').trim()==='‹' || /prev|previous/i.test(el.getAttribute('aria-label')||''));
    const next = all.find(el => (el.textContent||'').trim()==='›' || /next/i.test(el.getAttribute('aria-label')||''));
    function tick(){ const iso = readMonthFromTitle(); if (iso) setAnchor(iso); }
    if (prev && !prev.__anchor3){ prev.addEventListener('click', ()=> setTimeout(tick, 0)); prev.__anchor3=true; }
    if (next && !next.__anchor3){ next.addEventListener('click', ()=> setTimeout(tick, 0)); next.__anchor3=true; }
  }

  // After each render, capture visible month
  (function patchRender(){
    const orig = window.render;
    if (!orig || orig.__anchor3) return;
    window.render = function(){
      const r = orig.apply(this, arguments);
      try{ wireNav(); const iso = readMonthFromTitle(); if (iso) setAnchor(iso); }catch(_){}
      return r;
    };
    window.render.__anchor3 = true;
  })();

  // Boot
  setTimeout(()=>{
    const iso = readMonthFromTitle() || isoMonthStart(new Date());
    setAnchor(iso);
    wireNav();
  }, 200);
})();