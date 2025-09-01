/*! cloud-calendar-anchor.v2.js
   Anchor calendar to the viewed month using the app's own todayOverride variable.
   - Sets window.todayOverride = 'YYYY-MM-01' per tab (session only)
   - Updates on prev/next and after each render
   - Does not wrap todayStr(); uses your app's override pathway if present
*/
(function(){
  const KEY = 'ui.cal.anchor2'; // session key
  const LOG = (...a)=>{ try{ console.log('[anchor.v2]', ...a);}catch(_){}};

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
    if (iso) { try{ window.todayOverride = iso; }catch(_){ } }
    LOG('set', iso);
  }
  function getAnchor(){ try{ return sessionStorage.getItem(KEY)||''; }catch(_){ return ''; } }

  function updateFromDOM(){
    const iso = readMonthFromTitle();
    if (iso) setAnchor(iso);
  }

  // Wire prev/next
  function wireNav(){
    const all = Array.from(document.querySelectorAll('button, [role="button"]'));
    const prev = all.find(el => (el.textContent||'').trim()==='‹' || /prev|previous/i.test(el.getAttribute('aria-label')||''));
    const next = all.find(el => (el.textContent||'').trim()==='›' || /next/i.test(el.getAttribute('aria-label')||''));
    if (prev && !prev.__anchor2){
      prev.addEventListener('click', ()=> setTimeout(updateFromDOM, 0));
      prev.__anchor2 = true;
    }
    if (next && !next.__anchor2){
      next.addEventListener('click', ()=> setTimeout(updateFromDOM, 0));
      next.__anchor2 = true;
    }
  }

  // Patch render to refresh override after every paint
  (function patchRender(){
    const orig = window.render;
    if (!orig || orig.__anchor2) return;
    window.render = function(){
      const r = orig.apply(this, arguments);
      try{ wireNav(); updateFromDOM(); }catch(_){}
      return r;
    };
    window.render.__anchor2 = true;
    LOG('installed');
  })();

  // Boot: apply saved anchor or set to this month
  setTimeout(()=>{
    const saved = getAnchor();
    if (saved) { window.todayOverride = saved; }
    else { setAnchor(isoMonthStart(new Date())); }
    wireNav(); updateFromDOM();
  }, 200);
})();